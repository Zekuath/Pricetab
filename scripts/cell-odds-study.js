#!/usr/bin/env node
/* The square-odds study (docs/internal/research/cell-odds-prereg.md).
 *
 *   node scripts/cell-odds-study.js            # fetch what is missing, then run
 *   ODDS_CACHE=/path node scripts/cell-odds-study.js
 *
 * Runs `src/cell-odds.js` unchanged, walk-forward, on Coinbase Exchange
 * candles, and writes the result beside the preregistration. Local tooling —
 * never shipped (package.sh builds from an allowlist). Real requests, paced
 * well under the endpoint's public limit, cached on disk so a second run asks
 * nothing. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const CACHE = process.env.ODDS_CACHE || path.join(os.tmpdir(), "pricetab-cell-odds");
const OUT = path.join(ROOT, "docs", "internal", "research");
fs.mkdirSync(CACHE, { recursive: true });

const sandbox = { Math, Float64Array, Array, Number, isFinite, Infinity, NaN };
vm.createContext(sandbox);
const O = vm.runInContext(
  fs.readFileSync(path.join(ROOT, "src", "cell-odds.js"), "utf8") +
    "\n;({ oddsGranularity, oddsRegular, oddsPrepare, oddsColumn, oddsBand, oddsTrendState, oddsPositionState, oddsVolumeState, oddsMarkovState, ODDS_LOOKBACK })",
  sandbox,
);

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const COINS = ["BTC", "ETH", "SOL", "XRP"];
const BOARDS = [
  { range: "1H", span: 3 * MIN, history: 30 * DAY },
  { range: "1D", span: 2 * HOUR, history: 365 * DAY },
  { range: "1W", span: 12 * HOUR, history: 3 * 365 * DAY },
  { range: "1M", span: 2 * DAY, history: 8 * 365 * DAY },
  { range: "1Y", span: 4 * WEEK, history: 12 * 365 * DAY, daily: true },
  { range: "ALL", span: 26 * WEEK, history: 12 * 365 * DAY, daily: true },
];
const COLUMNS = 12;
const ROWS = 6;
const MAX_ORIGINS = 1200;
const BINS = [0, 0.01, 0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 1.0000001];
const ZOOMS = [1, 2, 4];
const CANDIDATES = ["trend", "position", "volume", "markov"];
const BOOT = 2000;
const BLOCK = 20;

// A seeded generator, so the phases and the bootstrap are the preregistered ones
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(coin, g, start, end) {
  const url =
    `https://api.exchange.coinbase.com/products/${coin}-USD/candles?granularity=${g}` +
    `&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "pricetab-cell-odds-study" } });
      if (res.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    } catch (e) {
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`gave up on ${url}`);
}

async function candles(coin, g, history) {
  const file = path.join(CACHE, `${coin}-${g}-${Math.round(history / DAY)}d.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const size = 300 * g * 1000;
  const now = Math.floor(Date.now() / (g * 1000)) * g * 1000;
  const from = now - history;
  const rows = new Map();
  let empty = 0;
  for (let end = now; end > from; end -= size) {
    const start = Math.max(from, end - size + g * 1000);
    const body = await page(coin, g, start, end);
    for (const r of body) {
      const [t, low, high, open, close, volume] = r.map(Number);
      if ([t, low, high, close].every((x) => isFinite(x) && x > 0)) {
        rows.set(t * 1000, { time: t * 1000, low, high, open, close, volume });
      }
    }
    empty = body.length ? 0 : empty + 1;
    if (empty >= 3) break; // before the pair was listed
    await sleep(260);
  }
  const out = [...rows.values()].sort((a, b) => a.time - b.time);
  fs.writeFileSync(file, JSON.stringify(out));
  process.stdout.write(`  fetched ${coin} g=${g}: ${out.length} bars\n`);
  return out;
}

const rung = (want) => {
  const power = Math.pow(10, Math.floor(Math.log10(want)));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((v) => v >= want) || power * 10;
};

const binOf = (p) => {
  for (let i = 0; i < BINS.length - 1; i++) if (p >= BINS[i] && p < BINS[i + 1]) return i;
  return BINS.length - 2;
};

const newCal = () => BINS.slice(1).map(() => ({ n: 0, given: 0, happened: 0 }));

function evaluate(board, coin, series, g, random) {
  const prep = O.oddsPrepare(series.close, g);
  if (!prep) return null;
  const spanBars = board.span / (g * 1000);
  const lookback = board.daily ? Infinity : O.ODDS_LOOKBACK;
  const warm = board.daily ? 300 : O.ODDS_LOOKBACK;
  const maxAhead = Math.ceil(COLUMNS * spanBars);
  const states = {
    trend: O.oddsTrendState(prep),
    position: O.oddsPositionState(series.high, series.low, series.close),
    volume: O.oddsVolumeState(series.volume),
    markov: O.oddsMarkovState(prep, spanBars),
  };
  const last = prep.n - 1;
  const firstOrigin = warm;
  const lastOrigin = last - 1;
  if (lastOrigin <= firstOrigin) return null;
  const stride = Math.max(board.daily ? 30 : Math.round(spanBars), Math.ceil((lastOrigin - firstOrigin) / MAX_ORIGINS));
  const origins = [];
  for (let o = firstOrigin; o <= lastOrigin; o += stride) origins.push(o);

  const res = {
    origins: 0,
    refused: new Array(COLUMNS).fill(0),
    asked: new Array(COLUMNS).fill(0),
    cal: Object.fromEntries(ZOOMS.map((z) => [z, newCal()])),
    calG: newCal(),
    calU: newCal(),
    pit: new Array(10).fill(0),
    perOrigin: [], // { fhs, gauss, raw, trend, position, volume } mean log score over its columns
  };
  for (const o of origins) {
    const sNow = series.close[o];
    const lb = board.daily ? o + 1 : lookback;
    // The lattice: the board's own rule on the look-back
    const moves = [];
    const from = Math.max(0, o - (board.daily ? o : lookback) + 1);
    const kSpan = Math.max(1, Math.round(spanBars));
    for (let t = from; t + kSpan <= o; t += Math.max(1, Math.floor(kSpan / 4))) {
      moves.push(Math.abs(series.close[t + kSpan] - series.close[t]));
    }
    moves.sort((a, b) => a - b);
    const fair = moves[Math.floor(moves.length / 2)];
    if (!(fair > 0)) continue;
    const phase = Math.max(1, Math.ceil(random() * spanBars)); // bars to the end of "now"'s column
    const scores = { fhs: [], gauss: [], raw: [], trend: [], position: [], volume: [], markov: [] };
    let any = false;
    for (let c = 0; c < COLUMNS; c++) {
      const aheadBars = phase + c * spanBars;
      const at = o + Math.round(aheadBars);
      if (at > last) break;
      res.asked[c] += 1;
      const hMs = aheadBars * g * 1000;
      const col = O.oddsColumn(prep, hMs, { end: o, lookback: lb });
      if (!col) {
        res.refused[c] += 1;
        continue;
      }
      any = true;
      const sT = series.close[at];
      const x = Math.log(sT / sNow);
      const u = col.cdf(x);
      res.pit[Math.min(9, Math.floor(u * 10))] += 1;
      const colG = O.oddsColumn(prep, hMs, { end: o, lookback: lb, model: "gauss" });
      const colU = O.oddsColumn(prep, hMs, { end: o, lookback: lb, model: "raw" });
      const conds = {};
      for (const name of CANDIDATES) {
        conds[name] = O.oddsColumn(prep, hMs, { end: o, lookback: lb, state: { values: states[name], now: states[name][o], discrete: name === "markov" } });
      }
      for (const zoom of ZOOMS) {
        const step = rung(fair * zoom);
        const rowNow = Math.floor(sNow / step);
        const rowT = Math.floor(sT / step);
        const band = (m, r) => O.oddsBand(m, sNow, r * step, (r + 1) * step);
        if (zoom === 1) {
          const ls = (m) => (m ? -Math.log(Math.max(1e-6, band(m, rowT))) : NaN);
          scores.fhs.push(ls(col));
          scores.gauss.push(ls(colG));
          scores.raw.push(ls(colU));
          for (const name of CANDIDATES) scores[name].push(conds[name] ? ls(conds[name]) : ls(col));
        }
        for (let r = rowNow - ROWS; r <= rowNow + ROWS; r++) {
          const hit = r === rowT ? 1 : 0;
          const add = (cal, p) => {
            if (!isFinite(p)) return;
            const b = cal[binOf(p)];
            b.n += 1;
            b.given += p;
            b.happened += hit;
          };
          add(res.cal[zoom], band(col, r));
          if (zoom === 1) {
            add(res.calG, band(colG, r));
            add(res.calU, band(colU, r));
          }
        }
      }
    }
    if (!any) continue;
    res.origins += 1;
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    res.perOrigin.push(Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, mean(v)])));
  }
  return res;
}

const ece = (cal) => {
  const n = cal.reduce((s, b) => s + b.n, 0);
  if (!n) return NaN;
  return cal.reduce((s, b) => s + (b.n ? Math.abs(b.given - b.happened) : 0), 0) / n;
};
const worstBin = (cal, min = 300) =>
  cal.reduce((w, b) => (b.n >= min ? Math.max(w, Math.abs(b.given / b.n - b.happened / b.n)) : w), 0);
const mergeCal = (cals) =>
  cals[0].map((_, i) => cals.reduce((m, c) => ({ n: m.n + c[i].n, given: m.given + c[i].given, happened: m.happened + c[i].happened }), { n: 0, given: 0, happened: 0 }));

// One-sided moving-block bootstrap p for "mean(base - cand) > 0" (a lower log score is better)
const blockP = (diffs, random) => {
  const n = diffs.length;
  if (n < BLOCK * 2) return { mean: NaN, p: 1 };
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const centred = diffs.map((d) => d - mean);
  let atLeast = 0;
  const blocks = Math.ceil(n / BLOCK);
  for (let b = 0; b < BOOT; b++) {
    let s = 0;
    let c = 0;
    for (let k = 0; k < blocks; k++) {
      const at = Math.floor(random() * (n - BLOCK + 1));
      for (let j = 0; j < BLOCK && c < n; j++, c++) s += centred[at + j];
    }
    if (s / n >= mean) atLeast += 1;
  }
  return { mean, p: (atLeast + 1) / (BOOT + 1) };
};

(async () => {
  const random = rng(20260930);
  const results = {};
  for (const board of BOARDS) {
    results[board.range] = {};
    for (const coin of COINS) {
      const g = board.daily ? 86400 : O.oddsGranularity(board.span);
      const rows = await candles(coin, g, board.history);
      const series = O.oddsRegular(rows, g);
      const t0 = Date.now();
      const r = evaluate(board, coin, series, g, random);
      results[board.range][coin] = r;
      process.stdout.write(
        `${board.range} ${coin}: g=${g}s bars=${series.close.length} origins=${r ? r.origins : 0} ` +
          `ECE=${r ? (100 * ece(r.cal[1])).toFixed(2) : "-"} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`,
      );
    }
  }

  // Pooled per range, and the conditioning family
  const summary = [];
  const tests = [];
  for (const board of BOARDS) {
    const per = COINS.map((c) => results[board.range][c]).filter((r) => r && r.origins);
    if (!per.length) {
      summary.push({ range: board.range, none: true });
      continue;
    }
    const pooled = Object.fromEntries(ZOOMS.map((z) => [z, mergeCal(per.map((r) => r.cal[z]))]));
    const calG = mergeCal(per.map((r) => r.calG));
    const calU = mergeCal(per.map((r) => r.calU));
    const all = per.flatMap((r) => r.perOrigin);
    const avg = (k) => all.reduce((s, o) => s + o[k], 0) / all.length;
    const refused = COINS.map((c) => results[board.range][c])
      .filter(Boolean)
      .reduce((acc, r) => acc.map((v, i) => v + r.refused[i]), new Array(COLUMNS).fill(0));
    const asked = COINS.map((c) => results[board.range][c])
      .filter(Boolean)
      .reduce((acc, r) => acc.map((v, i) => v + r.asked[i]), new Array(COLUMNS).fill(0));
    const pit = per.reduce((acc, r) => acc.map((v, i) => v + r.pit[i]), new Array(10).fill(0));
    const row = {
      range: board.range,
      origins: all.length,
      ece: Object.fromEntries(ZOOMS.map((z) => [z, ece(pooled[z])])),
      worst: worstBin(pooled[1]),
      eceG: ece(calG),
      eceU: ece(calU),
      logScore: { fhs: avg("fhs"), gauss: avg("gauss"), raw: avg("raw") },
      bins: pooled[1].map((b, i) => ({ from: BINS[i], to: Math.min(1, BINS[i + 1]), n: b.n, given: b.n ? b.given / b.n : null, happened: b.n ? b.happened / b.n : null })),
      refused,
      asked,
      pit,
      perCoin: Object.fromEntries(
        COINS.map((c) => {
          const r = results[board.range][c];
          return [c, r && r.origins ? { origins: r.origins, ece: ece(r.cal[1]), worst: worstBin(r.cal[1], 100) } : null];
        }),
      ),
    };
    row.pass = row.ece[1] <= 0.02 && row.worst <= 0.05;
    for (const name of CANDIDATES) {
      const diffs = all.map((o) => o.fhs - o[name]);
      const { mean, p } = blockP(diffs, random);
      const everyCoin = per.every((r) => {
        const m = r.perOrigin.reduce((s, o) => s + (o.fhs - o[name]), 0) / r.perOrigin.length;
        return m > 0;
      });
      tests.push({ range: board.range, name, gain: mean, p, everyCoin });
    }
    summary.push(row);
  }
  // Benjamini–Hochberg over the family
  const sorted = tests.map((t, i) => ({ ...t, i })).sort((a, b) => a.p - b.p);
  const m = sorted.length;
  let cut = -1;
  sorted.forEach((t, rank) => {
    if (t.p <= ((rank + 1) / m) * 0.05) cut = rank;
  });
  for (let rank = m - 1, qMin = 1; rank >= 0; rank--) {
    qMin = Math.min(qMin, (sorted[rank].p * m) / (rank + 1));
    tests[sorted[rank].i].q = qMin;
    tests[sorted[rank].i].survives = rank <= cut && tests[sorted[rank].i].everyCoin && tests[sorted[rank].i].gain > 0;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT, `cell-odds-results-${stamp}.json`), JSON.stringify({ summary, tests }, null, 1));
  const pct = (x) => (x == null || !isFinite(x) ? "–" : (100 * x).toFixed(2));
  const lines = [];
  lines.push(`# Square odds — results (${stamp})`, "");
  lines.push("Run of `scripts/cell-odds-study.js` against `cell-odds-prereg.md`. Pooled over BTC, ETH, SOL, XRP.", "");
  lines.push("| Range | origins | ECE ×1 | worst bin | ECE ×2 | ECE ×4 | ECE gauss | ECE raw | log score fhs / gauss / raw | pass |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of summary) {
    if (r.none) {
      lines.push(`| ${r.range} | 0 | – | – | – | – | – | – | – | refused |`);
      continue;
    }
    lines.push(
      `| ${r.range} | ${r.origins} | ${pct(r.ece[1])} | ${pct(r.worst)} | ${pct(r.ece[2])} | ${pct(r.ece[4])} | ${pct(r.eceG)} | ${pct(r.eceU)} | ` +
        `${r.logScore.fhs.toFixed(4)} / ${r.logScore.gauss.toFixed(4)} / ${r.logScore.raw.toFixed(4)} | ${r.pass ? "yes" : "no"} |`,
    );
  }
  lines.push("", "## Calibration by bin (zoom 1, pooled)", "");
  for (const r of summary) {
    if (r.none) continue;
    lines.push(`**${r.range}** — ` + r.bins.filter((b) => b.n).map((b) => `${pct(b.from)}–${pct(b.to)}%: given ${pct(b.given)}, came true ${pct(b.happened)} (n=${b.n})`).join("; "));
    lines.push("", `columns refused / asked: ${r.refused.map((v, i) => `${v}/${r.asked[i]}`).join(" · ")}`, "", `PIT deciles: ${r.pit.join(" ")}`, "");
    lines.push(`per coin ECE: ${Object.entries(r.perCoin).map(([c, v]) => `${c} ${v ? pct(v.ece) : "–"}`).join(", ")}`, "");
  }
  lines.push("## The metrics weighed (conditioning family, BH q = 0.05 over 24)", "");
  lines.push("| Range | state | log-score gain | p | q | every coin | enters |", "|---|---|---|---|---|---|---|");
  for (const t of tests) {
    lines.push(`| ${t.range} | ${t.name} | ${isFinite(t.gain) ? t.gain.toFixed(5) : "–"} | ${t.p.toFixed(4)} | ${t.q.toFixed(4)} | ${t.everyCoin ? "yes" : "no"} | ${t.survives ? "**yes**" : "no"} |`);
  }
  fs.writeFileSync(path.join(OUT, `cell-odds-results-${stamp}.md`), lines.join("\n") + "\n");
  process.stdout.write(lines.join("\n") + "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
