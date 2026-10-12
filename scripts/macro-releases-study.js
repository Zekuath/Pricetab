#!/usr/bin/env node
/* FOMC, NFP and PCE beside CPI — the study preregistered in
 * docs/internal/research/macro-releases-prereg.md. Run once, after it was
 * written:
 *
 *   node scripts/macro-releases-study.js [cacheDir]
 *
 * The measure is the app's own `cpiMoveFromCandles`, read out of
 * src/utils.js and run unchanged. Candles are cached in cacheDir (default
 * $TMPDIR/pricetab-macro) so a re-run asks nothing. Writes
 * docs/internal/research/macro-releases-results-<date>.json. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const CAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, "docs/internal/research/macro-calendar-2026-10-07.json"), "utf8"),
);
const CACHE = process.argv[2] || path.join(os.tmpdir(), "pricetab-macro");
const API = "https://api.exchange.coinbase.com/products/";
const COINS = ["BTC", "ETH"];
const TYPES = ["fomc", "nfp", "pce"];
const READ_ON = "2026-10-07";
const GAP_MS = 350;

/* The product's function, cut out of utils.js by its braces. */
const loadMeasure = () => {
  const src = fs.readFileSync(path.join(ROOT, "src/utils.js"), "utf8");
  const head = "const cpiMoveFromCandles = (rows, at) => {";
  const i = src.indexOf(head);
  if (i < 0) throw new Error("cpiMoveFromCandles not found in utils.js");
  let depth = 0;
  let j = i + head.length - 1;
  for (; j < src.length; j += 1) {
    if (src[j] === "{") depth += 1;
    else if (src[j] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const code = `${src.slice(i, j + 1)};\ncpiMoveFromCandles;`;
  return vm.runInNewContext(code, { Map, Number, Math, Array });
};
const measure = loadMeasure();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true });

const candles = async (coin, at) => {
  const file = path.join(CACHE, `${coin}-${at}.json`);
  if (fs.existsSync(file)) return { rows: JSON.parse(fs.readFileSync(file, "utf8")), cached: true };
  const start = new Date(at - 211 * 60000).toISOString();
  const end = new Date(at + 30 * 60000).toISOString();
  const r = await fetch(`${API}${coin}-USD/candles?granularity=60&start=${start}&end=${end}`, {
    headers: { "User-Agent": "pricetab-study" },
  });
  if (!r.ok) return { error: r.status };
  const rows = await r.json();
  fs.writeFileSync(file, JSON.stringify(rows));
  return { rows, cached: false };
};

const binomTail = (k, n, p) => {
  // P(X >= k), summed in logs
  const lg = (x) => {
    let s = 0;
    for (let i = 2; i <= x; i += 1) s += Math.log(i);
    return s;
  };
  let tail = 0;
  for (let x = k; x <= n; x += 1) {
    tail += Math.exp(lg(n) - lg(x) - lg(n - x) + x * Math.log(p) + (n - x) * Math.log(1 - p));
  }
  return Math.min(1, tail);
};
const bh = (ps) => {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(ps.length);
  let run = 1;
  for (let r = order.length - 1; r >= 0; r -= 1) {
    run = Math.min(run, (order[r][0] * ps.length) / (r + 1));
    q[order[r][1]] = run;
  }
  return q;
};
const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const summarise = (moves) => {
  const ok = moves.filter(Boolean);
  const top = ok.filter((m) => m.after > Math.max(...m.before)).length;
  const meanAfter = ok.reduce((a, m) => a + m.after, 0) / (ok.length || 1);
  const meanBefore = ok.reduce((a, m) => a + m.before.reduce((p, q) => p + q, 0) / 7, 0) / (ok.length || 1);
  return {
    n: ok.length,
    dropped: moves.length - ok.length,
    top,
    share: ok.length ? top / ok.length : null,
    expect: ok.length / 8,
    medAfter: median(ok.map((m) => m.after)),
    medBefore: median(ok.flatMap((m) => m.before)),
    meanRatio: meanBefore > 0 ? meanAfter / meanBefore : null,
  };
};

(async () => {
  const cutoff = Date.parse(`${READ_ON}T00:00Z`);
  const all = new Map(); // every release instant in the calendar, for the overlap count
  for (const t of TYPES) for (const r of CAL[t]) all.set(Date.parse(r.utc), (all.get(Date.parse(r.utc)) || []).concat(t));
  const results = { read: new Date().toISOString(), measure: "src/utils.js cpiMoveFromCandles", tests: [], recent: [] };
  for (const type of TYPES) {
    const times = CAL[type].map((r) => Date.parse(r.utc));
    const test = times.filter((t) => t >= Date.parse("2022-01-01T00:00Z") && t < Date.parse("2025-01-01T00:00Z"));
    const recent = times.filter((t) => t + 30 * 60000 <= cutoff).slice(-12);
    const shared = test.filter((t) => (all.get(t) || []).length > 1).length;
    for (const coin of COINS) {
      for (const [label, list, bucket] of [["2022-2024", test, results.tests], ["last 12", recent, results.recent]]) {
        const moves = [];
        const bad = [];
        for (const at of list) {
          const c = await candles(coin, at);
          if (!c.cached) await sleep(GAP_MS);
          const m = c.rows ? measure(c.rows, at) : null;
          if (!m) bad.push(new Date(at).toISOString() + (c.error ? ` HTTP ${c.error}` : " gaps"));
          moves.push(m);
        }
        const s = summarise(moves);
        bucket.push({ type, coin, sample: label, releases: list.length, sharedMinute: label === "2022-2024" ? shared : undefined, ...s, bad });
      }
    }
  }
  /* The pipeline checked against the published CPI figure (28 of 36 for
     BTC in 2022-2024) before anything above is read. */
  const cpi = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/internal/research/bls-cpi-2026-09-27.json"), "utf8"));
  const cpiTimes = cpi.utc.filter((u) => u >= "2022" && u < "2025").map((u) => Date.parse(u));
  const cpiMoves = [];
  for (const at of cpiTimes) {
    const c = await candles("BTC", at);
    if (!c.cached) await sleep(GAP_MS);
    cpiMoves.push(c.rows ? measure(c.rows, at) : null);
  }
  results.cpiCheck = summarise(cpiMoves);
  console.log(`CPI check, BTC 2022-2024: ${results.cpiCheck.top} of ${results.cpiCheck.n} (published: 28 of 36)`);
  const ps = results.tests.map((t) => binomTail(t.top, t.n, 1 / 8));
  const qs = bh(ps);
  results.tests.forEach((t, i) => {
    t.p = ps[i];
    t.q = qs[i];
  });
  const enters = {};
  for (const type of TYPES) {
    const rows = results.tests.filter((t) => t.type === type);
    enters[type] = rows.every((t) => t.q < 0.05 && t.share >= 0.25);
  }
  results.enters = enters;
  const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(2)}%`);
  for (const t of results.tests) {
    console.log(
      `${t.type.toUpperCase().padEnd(5)} ${t.coin} 2022-2024: ${t.top} of ${t.n} topped all seven (chance ${t.expect.toFixed(1)}), share ${(t.share * 100).toFixed(1)}%, p ${t.p.toExponential(2)}, q ${t.q.toExponential(2)}; median after ${pct(t.medAfter)} / before ${pct(t.medBefore)}; mean ratio ${t.meanRatio.toFixed(2)}x; dropped ${t.dropped}; same minute as another ${t.sharedMinute}`,
    );
  }
  for (const t of results.recent) {
    console.log(`${t.type.toUpperCase().padEnd(5)} ${t.coin} last 12: ${t.top} of ${t.n} (chance ${t.expect.toFixed(1)}); median after ${pct(t.medAfter)} / before ${pct(t.medBefore)}; mean ratio ${t.meanRatio ? t.meanRatio.toFixed(2) : "—"}x; dropped ${t.dropped}`);
  }
  console.log("enters:", JSON.stringify(enters));
  const out = path.join(ROOT, `docs/internal/research/macro-releases-results-${READ_ON}.json`);
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  console.log("wrote", path.relative(ROOT, out));
})();
