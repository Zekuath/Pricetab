#!/usr/bin/env node
/* Time to target with the unfinished walks kept — the study preregistered in
 * docs/internal/research/pattern-survival-prereg.md. Run once, after it was
 * written:
 *
 *   node scripts/pattern-survival-study.js
 *
 * Reads the pattern study's daily candles (research/patterns/*.json), loads
 * the detectors from src/ unchanged, asks nothing, and writes
 * docs/internal/research/pattern-survival-results-2026-10-18.json. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "docs/internal/research/patterns");
const OUT = path.join(ROOT, "docs/internal/research/pattern-survival-results-2026-10-18.json");
const COINS = ["BTC", "ETH", "SOL", "LTC"];
const HORIZONS = [30, 60, 90];
const BOOT = 2000;
const SEED = 20261018;

// The detectors, as the app runs them
const chain = () => { const f = () => f; f.x = f.y = f.curve = f; return f; };
const sandbox = { console, setTimeout, line: chain, curveMonotoneX: null };
vm.createContext(sandbox);
for (const file of ["i18n.js", "config.js", "utils.js", "candle-patterns.js", "price-patterns.js", "swing-patterns.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", file), "utf8"), sandbox, { filename: file });
}
const run = (code) => vm.runInContext(code, sandbox);
const WALK = run("PRICE_PATTERN_WALK");
const MIN = run("BASE_RATE_MIN_EPISODES");

const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* One episode as (time, cause): cause 1 target, 2 invalidation, 0 censored. */
const toSurvival = (e, index, last) => {
  const from = index.get(e.at);
  if (from == null) return null;
  if (e.out === "target" || e.out === "stop") {
    const at = index.get(e.resolvedAt);
    return { time: at - from, cause: e.out === "target" ? 1 : 2 };
  }
  if (e.out === "open") return { time: WALK, cause: 0 };
  return { time: Math.min(WALK, last - from), cause: 0 }; // pending
};

/* Aalen–Johansen: at each distinct time, events before censorings; the
   all-cause survival just before t times each cause's hazard at t. */
const cif = (obs) => {
  const times = [...new Set(obs.map((o) => o.time))].sort((a, b) => a - b);
  let surv = 1;
  const c1 = [];
  const c2 = [];
  let a1 = 0;
  let a2 = 0;
  for (const t of times) {
    const atRisk = obs.filter((o) => o.time >= t).length;
    if (!atRisk) break;
    const d1 = obs.filter((o) => o.time === t && o.cause === 1).length;
    const d2 = obs.filter((o) => o.time === t && o.cause === 2).length;
    a1 += surv * (d1 / atRisk);
    a2 += surv * (d2 / atRisk);
    surv *= 1 - (d1 + d2) / atRisk;
    c1.push([t, a1]);
    c2.push([t, a2]);
  }
  const at = (curve, h) => {
    let v = 0;
    for (const [t, x] of curve) if (t <= h) v = x;
    return v;
  };
  const out = {};
  for (const h of HORIZONS) out[h] = { target: at(c1, h), stop: at(c2, h) };
  return out;
};

const summarise = (obs, raw) => {
  const counts = { target: 0, stop: 0, open: 0, pending: 0 };
  for (const e of raw) counts[e.out] = (counts[e.out] || 0) + 1;
  const resolved = counts.target + counts.stop;
  const s = resolved ? counts.target / resolved : null;
  const est = cif(obs);
  const t90 = est[90];
  const neither = 1 - t90.target - t90.stop;
  const c = t90.target + t90.stop > 0 ? t90.target / (t90.target + t90.stop) : null;
  // Percentile bootstrap over episodes
  const r = rng(SEED + obs.length);
  const boots = { target: [], stop: [], neither: [] };
  for (let b = 0; b < BOOT; b += 1) {
    const sample = obs.map(() => obs[Math.floor(r() * obs.length)]);
    const e = cif(sample)[90];
    boots.target.push(e.target);
    boots.stop.push(e.stop);
    boots.neither.push(1 - e.target - e.stop);
  }
  const ci = (xs) => {
    const sorted = xs.slice().sort((a, b) => a - b);
    return [sorted[Math.floor(0.025 * BOOT)], sorted[Math.floor(0.975 * BOOT) - 1]];
  };
  return {
    n: obs.length,
    counts,
    currentShare: s,
    cif: est,
    neither90: neither,
    conditional90: c,
    gapPoints: s == null || c == null ? null : (c - s) * 100,
    ci90: { target: ci(boots.target), stop: ci(boots.stop), neither: ci(boots.neither) },
  };
};

const pooled = new Map();
const perCoin = {};
for (const coin of COINS) {
  const candles = JSON.parse(fs.readFileSync(path.join(DATA, `${coin}.json`), "utf8"));
  const index = new Map(candles.map((c, i) => [c.t, i]));
  const last = candles.length - 1;
  const episodes = [
    ...JSON.parse(JSON.stringify(run(`detectPricePatterns(${JSON.stringify(candles)})`))),
    ...JSON.parse(JSON.stringify(run(`detectSwingPatterns(${JSON.stringify(candles)})`))),
  ];
  perCoin[coin] = {};
  const byKind = new Map();
  for (const e of episodes) {
    const o = toSurvival(e, index, last);
    if (!o) continue;
    if (!byKind.has(e.kind)) byKind.set(e.kind, { obs: [], raw: [] });
    byKind.get(e.kind).obs.push(o);
    byKind.get(e.kind).raw.push(e);
    if (!pooled.has(e.kind)) pooled.set(e.kind, { obs: [], raw: [] });
    pooled.get(e.kind).obs.push(o);
    pooled.get(e.kind).raw.push(e);
  }
  for (const [kind, { obs, raw }] of byKind) perCoin[coin][kind] = summarise(obs, raw);
}
const pooledOut = {};
for (const [kind, { obs, raw }] of pooled) pooledOut[kind] = summarise(obs, raw);

// The preregistered rule, on pooled patterns with at least MIN episodes
const eligible = Object.entries(pooledOut).filter(([, v]) => v.n >= MIN);
const triggers = eligible
  .filter(([, v]) => v.neither90 >= 0.1 || (v.gapPoints != null && Math.abs(v.gapPoints) >= 5))
  .map(([k, v]) => ({ kind: k, neither90: v.neither90, gapPoints: v.gapPoints }));
const result = {
  ran: new Date().toISOString(),
  walk: WALK,
  min: MIN,
  branch: triggers.length ? 1 : 2,
  triggers,
  pooled: pooledOut,
  perCoin,
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
const pct = (x) => (x == null ? "  —  " : `${(x * 100).toFixed(1).padStart(5)}%`);
console.log(`walk ${WALK} bars · eligible pooled patterns: ${eligible.length} of ${pooled.size}`);
for (const [kind, v] of Object.entries(pooledOut).sort((a, b) => b[1].n - a[1].n)) {
  console.log(
    `${kind.padEnd(10)} n ${String(v.n).padStart(3)} · T ${v.counts.target} S ${v.counts.stop} open ${v.counts.open} pending ${v.counts.pending || 0}` +
      ` · share ${pct(v.currentShare)} · CIF90 T ${pct(v.cif[90].target)} S ${pct(v.cif[90].stop)} neither ${pct(v.neither90)} · gap ${v.gapPoints == null ? "—" : v.gapPoints.toFixed(1)}`,
  );
}
console.log(`branch ${result.branch} · triggers ${triggers.map((t) => t.kind).join(", ") || "none"}`);
