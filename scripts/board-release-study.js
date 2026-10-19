#!/usr/bin/env node
/* The board's chances on US release days — the study preregistered in
 * docs/internal/research/board-release-prereg.md.
 *
 *   node scripts/board-release-study.js --fetch   # once: bars → research/board-bars/
 *   node scripts/board-release-study.js           # the run, from the kept bars only
 *
 * Local tooling, never shipped. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const BARS = path.join(ROOT, "docs/internal/research/board-bars");
const OUT = path.join(ROOT, "docs/internal/research/board-release-results-2026-10-19.json");
const COINS = ["BTC", "ETH"];
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const FROM = Date.parse("2023-01-01T00:00:00Z");
const TO = Date.parse("2026-09-30T23:59:59Z");
const BOARDS = {
  "1H": { span: 3 * MIN, g: 60, before: 10 * MIN, rangeKey: "hour" },
  "1D": { span: 2 * HOUR, g: 900, before: 3 * HOUR, rangeKey: "day" },
};
const COLUMNS = 12;
const ROWS = 6;
const BINS = [0, 0.01, 0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 1.0000001];
const BOOT = 2000;

const cfg = fs.readFileSync(path.join(ROOT, "src/config.js"), "utf8");
const grab = (name) => [...cfg.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))[1].matchAll(/"([0-9T:Z-]+)"/g)].map((x) => Date.parse(x[1]));
const RELEASES = [
  ...grab("CPI_RELEASES_UTC").map((t) => ({ t, kind: "CPI" })),
  ...grab("FOMC_RELEASES_UTC").map((t) => ({ t, kind: "FOMC" })),
  ...grab("NFP_RELEASES_UTC").map((t) => ({ t, kind: "NFP" })),
].filter((r) => r.t >= FROM && r.t <= TO).sort((a, b) => a.t - b.t);
const anyRelease = (from, to) => RELEASES.some((r) => r.t > from && r.t <= to);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(coin, g, start, end) {
  const url = `https://api.exchange.coinbase.com/products/${coin}-USD/candles?granularity=${g}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "pricetab-board-release-study" } });
      if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    } catch (e) {
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`gave up on ${url}`);
}
async function range(coin, g, from, to) {
  const rows = new Map();
  const size = 300 * g * 1000;
  for (let start = from; start < to; start += size) {
    const end = Math.min(to, start + size - g * 1000);
    for (const r of await page(coin, g, start, end)) {
      const [t, low, high, open, close, volume] = r.map(Number);
      if ([t, low, high, open, close].every((x) => isFinite(x) && x > 0)) rows.set(t * 1000, { time: t * 1000, low, high, open, close, volume });
    }
    await sleep(220);
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}

async function fetchAll() {
  fs.mkdirSync(BARS, { recursive: true });
  for (const coin of COINS) {
    const f15 = path.join(BARS, `${coin}-900.json`);
    if (!fs.existsSync(f15)) {
      const rows = await range(coin, 900, Date.parse("2022-11-01T00:00:00Z"), TO + 2 * DAY);
      fs.writeFileSync(f15, JSON.stringify(rows));
      console.log(`fetched ${coin} 15m: ${rows.length}`);
    }
    const f1 = path.join(BARS, `${coin}-60-windows.json`);
    const windows = fs.existsSync(f1) ? JSON.parse(fs.readFileSync(f1, "utf8")) : {};
    let n = 0;
    for (const r of RELEASES) {
      for (const origin of [r.t - BOARDS["1H"].before, r.t - 7 * DAY - BOARDS["1H"].before]) {
        const key = String(origin);
        if (windows[key]) continue;
        windows[key] = await range(coin, 60, origin - 3000 * MIN, origin + 40 * MIN);
        n += 1;
        if (n % 20 === 0) {
          fs.writeFileSync(f1, JSON.stringify(windows));
          console.log(`${coin} 1m windows: ${Object.keys(windows).length}`);
        }
      }
    }
    fs.writeFileSync(f1, JSON.stringify(windows));
    console.log(`fetched ${coin} 1m windows: ${Object.keys(windows).length}`);
  }
}

const rung = (want) => {
  const power = Math.pow(10, Math.floor(Math.log10(want)));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((v) => v >= want) || power * 10;
};
const binOf = (p) => {
  for (let i = 0; i < BINS.length - 1; i++) if (p >= BINS[i] && p < BINS[i + 1]) return i;
  return BINS.length - 2;
};

function run() {
  const sandbox = { Math, Float64Array, Array, Number, isFinite, Infinity, NaN, Object };
  vm.createContext(sandbox);
  const O = vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "cell-odds.js"), "utf8") + "\n;({ oddsRegular, oddsPrepare, oddsColumn, oddsBand, CELL_ODDS_MODEL, ODDS_LOOKBACK })", sandbox);
  const scored = []; // { board, coin, release, kind, control, pit, squares: [[p, hit]] }
  // One scored column: prep of bars up to the origin, the column ending at `end`
  const scoreAt = (board, coin, series, o, end, meta) => {
    const b = BOARDS[board];
    const prep = O.oddsPrepare(series.close.slice(0, o + 1), b.g);
    if (!prep) return;
    const h = end - (series.time[o] + b.g * 1000);
    if (!(h > 0)) return;
    const col = O.oddsColumn(prep, h, { end: prep.n - 1, model: O.CELL_ODDS_MODEL[b.rangeKey] || "fhs", lookback: O.ODDS_LOOKBACK });
    if (!col) return;
    const at = series.time.findIndex((t) => t + b.g * 1000 === end);
    if (at < 0 || series.filled[at] || series.filled[o]) return;
    const sNow = series.close[o];
    const y = Math.log(series.close[at] / sNow);
    // Square height from the median move over one span in the look-back, as the study draws it
    const k = Math.max(1, Math.round(b.span / (b.g * 1000)));
    const moves = [];
    for (let t = Math.max(0, o - O.ODDS_LOOKBACK + 1); t + k <= o; t += Math.max(1, Math.floor(k / 4))) moves.push(Math.abs(series.close[t + k] - series.close[t]));
    moves.sort((a, c) => a - c);
    const fair = moves[Math.floor(moves.length / 2)];
    if (!(fair > 0)) return;
    const step = rung(fair);
    const rowNow = Math.floor(sNow / step);
    const rowT = Math.floor(series.close[at] / step);
    const squares = [];
    for (let r = rowNow - ROWS; r <= rowNow + ROWS; r++) {
      const p = O.oddsBand(col, sNow, r * step, (r + 1) * step);
      if (isFinite(p)) squares.push([p, r === rowT ? 1 : 0]);
    }
    // For the recalibration's fit: the column's median and 10/90 quantiles in log space
    const inv = (pp) => { let lo = -3, hi = 3; for (let i = 0; i < 80 && hi - lo > 1e-9; i++) { const m = (lo + hi) / 2; if (col.cdf(m) < pp) lo = m; else hi = m; } return (lo + hi) / 2; };
    scored.push({ board, coin, ...meta, pit: col.cdf(y), squares, y, q10: inv(0.1), q50: inv(0.5), q90: inv(0.9) });
  };
  for (const coin of COINS) {
    // 1D on continuous 15-minute bars
    const rows15 = JSON.parse(fs.readFileSync(path.join(BARS, `${coin}-900.json`), "utf8"));
    const s15 = O.oddsRegular(rows15, 900);
    const idx15 = new Map(s15.time.map((t, i) => [t + 900e3, i])); // close time → index
    const windows = JSON.parse(fs.readFileSync(path.join(BARS, `${coin}-60-windows.json`), "utf8"));
    for (const r of RELEASES) {
      for (const control of [false, true]) {
        const R = control ? r.t - 7 * DAY : r.t;
        // 1D
        {
          const b = BOARDS["1D"];
          const originClose = Math.floor((R - b.before) / (b.g * 1000)) * b.g * 1000;
          const o = idx15.get(originClose);
          const end = (Math.floor(R / b.span) + 1) * b.span;
          const ok = !control || !anyRelease(originClose, originClose + COLUMNS * b.span);
          if (o != null && ok) scoreAt("1D", coin, s15, o, end, { release: r.t, kind: r.kind, control });
        }
        // 1H
        {
          const b = BOARDS["1H"];
          const origin = R - b.before;
          const rows = windows[String(origin)];
          if (rows && rows.length > 1000) {
            const s1 = O.oddsRegular(rows, 60);
            const o = s1.time.findIndex((t) => t + 60e3 === origin);
            const end = (Math.floor(R / b.span) + 1) * b.span;
            const ok = !control || !anyRelease(origin, origin + COLUMNS * b.span);
            if (o >= 0 && ok) scoreAt("1H", coin, s1, o, end, { release: r.t, kind: r.kind, control });
          }
        }
      }
    }
  }
  const summ = (list) => {
    const n = list.length;
    if (!n) return { n: 0 };
    const cov80 = list.filter((x) => x.pit >= 0.1 && x.pit <= 0.9).length / n;
    const cov50 = list.filter((x) => x.pit >= 0.25 && x.pit <= 0.75).length / n;
    const bins = BINS.slice(1).map(() => ({ n: 0, given: 0, happened: 0 }));
    for (const x of list) for (const [p, hit] of x.squares) { const b = bins[binOf(p)]; b.n++; b.given += p; b.happened += hit; }
    const sq = bins.reduce((s, b) => s + b.n, 0);
    const ece = sq ? bins.reduce((s, b) => s + Math.abs(b.given - b.happened), 0) / sq : NaN;
    return { n, cov80, cov50, ece, bins: bins.map((b) => ({ n: b.n, given: b.n ? b.given / b.n : null, happened: b.n ? b.happened / b.n : null })) };
  };
  const rel = scored.filter((x) => !x.control);
  const ctl = scored.filter((x) => x.control);
  const result = { ran: new Date().toISOString(), releases: RELEASES.length, pooled: { release: summ(rel), control: summ(ctl) }, byBoard: {}, byKind: {} };
  for (const b of Object.keys(BOARDS)) result.byBoard[b] = { release: summ(rel.filter((x) => x.board === b)), control: summ(ctl.filter((x) => x.board === b)) };
  for (const k of ["CPI", "FOMC", "NFP"]) result.byKind[k] = { release: summ(rel.filter((x) => x.kind === k)), control: summ(ctl.filter((x) => x.kind === k)) };
  // Paired bootstrap of (control − release) 80% coverage, resampled by release
  const byRelease = new Map();
  for (const x of scored) {
    if (!byRelease.has(x.release)) byRelease.set(x.release, { rel: [], ctl: [] });
    byRelease.get(x.release)[x.control ? "ctl" : "rel"].push(x.pit >= 0.1 && x.pit <= 0.9 ? 1 : 0);
  }
  const keys = [...byRelease.keys()].filter((k) => byRelease.get(k).rel.length && byRelease.get(k).ctl.length);
  let seed = 20261019;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const diffs = [];
  for (let i = 0; i < BOOT; i++) {
    let rs = 0, rn = 0, cs = 0, cn = 0;
    for (let j = 0; j < keys.length; j++) {
      const e = byRelease.get(keys[Math.floor(rnd() * keys.length)]);
      rs += e.rel.reduce((a, v) => a + v, 0); rn += e.rel.length;
      cs += e.ctl.reduce((a, v) => a + v, 0); cn += e.ctl.length;
    }
    diffs.push(cs / cn - rs / rn);
  }
  diffs.sort((a, b) => a - b);
  result.bootstrap = { pairedReleases: keys.length, lo: diffs[Math.floor(0.025 * BOOT)], hi: diffs[Math.floor(0.975 * BOOT) - 1] };
  const P = result.pooled;
  result.rule = {
    coverageBelow74: P.release.cov80 < 0.74,
    bootstrapAboveZero: result.bootstrap.lo > 0,
    eceTwice: P.release.ece >= 2 * P.control.ece,
  };
  result.recalibrate = result.rule.coverageBelow74 && result.rule.bootstrapAboveZero && result.rule.eceTwice;
  /* ── The recalibration the rule called for: M2's factor per board and kind,
     k = √(mean z² on release columns ÷ mean z² on control columns), z the
     column's (y − median) over its implied scale, floored at 1. Checked
     sequentially first (each release scaled by factors from releases before
     it only), then fitted on everything for the bundle. ── */
  const z2 = (x) => ((x.y - x.q50) / ((x.q90 - x.q10) / 2.5631)) ** 2;
  const factor = (list) => {
    const r = list.filter((x) => !x.control);
    const c = list.filter((x) => x.control);
    if (r.length < 10 || c.length < 10) return null;
    const m = (a) => a.reduce((s, x) => s + z2(x), 0) / a.length;
    return Math.max(1, Math.sqrt(m(r) / m(c)));
  };
  const inside = (x, k) => x.y >= x.q50 + k * (x.q10 - x.q50) && x.y <= x.q50 + k * (x.q90 - x.q50);
  const seq = {};
  for (const b of Object.keys(BOARDS)) {
    let n = 0;
    let hit = 0;
    for (const x of rel.filter((v) => v.board === b)) {
      const earlier = scored.filter((v) => v.board === b && v.release < x.release && v.kind === x.kind);
      const k = factor(earlier);
      if (k == null) continue;
      n += 1;
      if (inside(x, k)) hit += 1;
    }
    seq[b] = { n, cov80: n ? hit / n : null };
  }
  result.sequential = seq;
  result.factors = {};
  for (const b of Object.keys(BOARDS)) {
    result.factors[b] = {};
    for (const k of ["CPI", "FOMC", "NFP"]) result.factors[b][k] = factor(scored.filter((v) => v.board === b && v.kind === k));
  }
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log("sequential recalibrated 80%:", JSON.stringify(seq));
  console.log("factors:", JSON.stringify(result.factors));
  const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
  const line = (name, s) => `${name.padEnd(16)} n ${String(s.n).padStart(4)} · 80% ${pct(s.cov80)} · 50% ${pct(s.cov50)} · ECE ${s.ece == null ? "—" : s.ece.toFixed(4)}`;
  console.log(line("release pooled", P.release));
  console.log(line("control pooled", P.control));
  for (const b of Object.keys(BOARDS)) { console.log(line(`${b} release`, result.byBoard[b].release)); console.log(line(`${b} control`, result.byBoard[b].control)); }
  for (const k of ["CPI", "FOMC", "NFP"]) console.log(line(`${k} release`, result.byKind[k].release));
  console.log(`bootstrap (control − release) 80%: [${(result.bootstrap.lo * 100).toFixed(1)}, ${(result.bootstrap.hi * 100).toFixed(1)}] pts over ${result.bootstrap.pairedReleases} releases`);
  console.log("rule", JSON.stringify(result.rule), "recalibrate:", result.recalibrate);
}

(async () => {
  if (process.argv.includes("--fetch")) await fetchAll();
  else run();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
