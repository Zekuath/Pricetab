#!/usr/bin/env node
/* Calendar months — the study preregistered in
 * docs/internal/research/seasonality-prereg.md. Run once, after it was
 * written:
 *
 *   node scripts/seasonality-study.js
 *
 * Reads the pattern study's daily candles (research/patterns/*.json), asks
 * nothing, and writes docs/internal/research/seasonality-results-2026-10-07.json. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "docs/internal/research/patterns");
const TESTED = ["BTC", "ETH", "LTC"];
const REPORTED = ["SOL"];
const LAST_MONTH = "2026-08";
const SHUFFLES = 20000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* mulberry32 — a fixed seed, so a re-run gives the same p values. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const monthly = (coin) => {
  const days = JSON.parse(fs.readFileSync(path.join(DATA, `${coin}.json`), "utf8"));
  const last = new Map(); // "YYYY-MM" → close of the last day seen in it
  for (const d of days) {
    const key = new Date(d.t * 1000).toISOString().slice(0, 7);
    last.set(key, { t: d.t, close: d.close });
  }
  const keys = [...last.keys()].sort();
  const out = [];
  for (let i = 1; i < keys.length; i += 1) {
    const k = keys[i];
    if (k > LAST_MONTH) break;
    // A month is complete when its last seen day is its last calendar day
    const [y, m] = k.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const seen = new Date(last.get(k).t * 1000).getUTCDate();
    const prevKey = keys[i - 1];
    const [py, pm] = prevKey.split("-").map(Number);
    const prevLastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const prevSeen = new Date(last.get(prevKey).t * 1000).getUTCDate();
    if (seen !== lastDay || prevSeen !== prevLastDay) continue;
    out.push({ key: k, month: m - 1, r: Math.log(last.get(k).close / last.get(prevKey).close) });
  }
  return out;
};

const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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

const describe = (rows) => {
  const upShare = rows.filter((x) => x.r > 0).length / rows.length;
  return MONTHS.map((name, m) => {
    const these = rows.filter((x) => x.month === m).map((x) => x.r);
    return {
      month: name,
      n: these.length,
      up: these.filter((r) => r > 0).length,
      median: these.length ? median(these) : null,
      mean: these.length ? these.reduce((a, b) => a + b, 0) / these.length : null,
      upShareAll: upShare,
    };
  });
};

const test = (rows, random) => {
  const r = rows.map((x) => x.r);
  const labels = rows.map((x) => x.month);
  const total = r.reduce((a, b) => a + b, 0);
  const stat = (lab, m) => {
    let s = 0;
    let n = 0;
    for (let i = 0; i < r.length; i += 1) if (lab[i] === m) { s += r[i]; n += 1; }
    return s / n - (total - s) / (r.length - n);
  };
  const observed = MONTHS.map((_, m) => stat(labels, m));
  const extreme = new Array(12).fill(0);
  const lab = labels.slice();
  for (let k = 0; k < SHUFFLES; k += 1) {
    for (let i = lab.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [lab[i], lab[j]] = [lab[j], lab[i]];
    }
    for (let m = 0; m < 12; m += 1) if (Math.abs(stat(lab, m)) >= Math.abs(observed[m])) extreme[m] += 1;
  }
  return observed.map((d, m) => ({ month: MONTHS[m], diff: d, p: (1 + extreme[m]) / (SHUFFLES + 1) }));
};

const random = rng(20261007);
const results = { read: new Date().toISOString(), lastMonth: LAST_MONTH, shuffles: SHUFFLES, coins: {} };
const flat = [];
for (const coin of TESTED.concat(REPORTED)) {
  const rows = monthly(coin);
  const entry = { months: rows.length, from: rows[0].key, to: rows[rows.length - 1].key, byMonth: describe(rows) };
  if (TESTED.includes(coin)) {
    entry.tests = test(rows, random);
    for (const t of entry.tests) flat.push({ coin, t });
  }
  results.coins[coin] = entry;
}
const qs = bh(flat.map((x) => x.t.p));
flat.forEach((x, i) => { x.t.q = qs[i]; });
const differs = MONTHS.filter((name) => {
  const hits = flat.filter((x) => x.t.month === name && x.t.q < 0.05);
  return hits.length >= 2 && (hits.every((x) => x.t.diff > 0) || hits.every((x) => x.t.diff < 0));
});
results.differs = differs;
results.smallestQ = Math.min(...qs);
fs.writeFileSync(path.join(ROOT, "docs/internal/research/seasonality-results-2026-10-07.json"), JSON.stringify(results, null, 1));

const pct = (x) => (x == null ? "  —  " : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);
for (const [coin, e] of Object.entries(results.coins)) {
  console.log(`\n${coin}: ${e.months} months, ${e.from} → ${e.to}; up months overall ${(e.byMonth[0].upShareAll * 100).toFixed(0)}%`);
  e.byMonth.forEach((b, m) => {
    const t = e.tests ? e.tests[m] : null;
    console.log(`  ${b.month}  up ${b.up}/${b.n}  median ${pct(b.median)}  mean ${pct(b.mean)}${t ? `  diff ${pct(t.diff)}  p ${t.p.toFixed(4)}  q ${t.q.toFixed(3)}` : ""}`);
  });
}
console.log(`\nsmallest q ${results.smallestQ.toFixed(3)}; months that differ by the rule: ${differs.length ? differs.join(", ") : "none"}`);
