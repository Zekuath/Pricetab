#!/usr/bin/env node
/* Unusual news attention and the size of the next move
 * (docs/internal/research/news-attention-prereg.md).
 *
 *   node scripts/news-attention-study.js
 *
 * Counts, per UTC day, the Hacker News stories and the CoinJournal titles that
 * name BTC and ETH, then counts what the next day and week did after the days
 * attention entered "about twice its usual". Real requests to hosts the app
 * already declares, paced, cached on disk. Local tooling, never shipped. */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CACHE = process.env.ODDS_CACHE || path.join(os.tmpdir(), "pricetab-cell-odds");
const OUT = path.join(ROOT, "docs", "internal", "research");
fs.mkdirSync(CACHE, { recursive: true });

const DAY = 86400e3;
const START = Date.UTC(2019, 0, 1);
const END = Date.UTC(2026, 9, 3); // exclusive: through 2 Oct 2026
const WARM = 30;
const COINS = {
  BTC: { hn: "bitcoin", title: /\b(bitcoin|btc)\b/i },
  ETH: { hn: "ethereum", title: /\b(ethereum|eth|ether)\b/i },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "pricetab-news-attention-study", ...headers } });
      if (res.status === 429) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { body: await res.json(), headers: res.headers };
    } catch (e) {
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`gave up on ${url}`);
}

const cached = async (name, make) => {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const out = await make();
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
};

// Every HN story time for a query, a month at a time, halving any window over 1,000
async function hnTimes(query) {
  return cached(`hn-${query}-2019.json`, async () => {
    const times = [];
    const windowTimes = async (a, b) => {
      const url =
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story` +
        `&numericFilters=${encodeURIComponent(`created_at_i>=${a},created_at_i<${b}`)}&hitsPerPage=1000&attributesToRetrieve=created_at_i`;
      const { body } = await getJson(url);
      await sleep(400);
      if (body.nbHits > 1000 && b - a > 3600) {
        const mid = Math.floor((a + b) / 2);
        await windowTimes(a, mid);
        await windowTimes(mid, b);
        return;
      }
      for (const h of body.hits || []) if (Number.isFinite(h.created_at_i)) times.push(h.created_at_i * 1000);
    };
    for (let y = 2019; y <= 2026; y++) {
      for (let m = 0; m < 12; m++) {
        const a = Date.UTC(y, m, 1);
        if (a >= END) break;
        const b = Math.min(END, Date.UTC(y, m + 1, 1));
        await windowTimes(a / 1000, b / 1000);
      }
    }
    process.stdout.write(`  HN ${query}: ${times.length} stories\n`);
    return times;
  });
}

// Every CoinJournal title since 2019, with its time
async function coinJournal() {
  return cached("coinjournal-2019.json", async () => {
    const out = [];
    for (let page = 1; page < 400; page++) {
      const url =
        `https://coinjournal.net/wp-json/wp/v2/posts?per_page=100&page=${page}&lang=en` +
        `&after=2019-01-01T00:00:00&before=2026-10-03T00:00:00&_fields=date_gmt,title&orderby=date&order=asc`;
      let res;
      try {
        res = await getJson(url);
      } catch (e) {
        break; // past the last page WordPress answers 400
      }
      const rows = Array.isArray(res.body) ? res.body : [];
      if (!rows.length) break;
      for (const r of rows) out.push({ t: Date.parse(`${r.date_gmt}Z`), title: (r.title && r.title.rendered) || "" });
      const total = Number(res.headers.get("x-wp-totalpages"));
      if (Number.isFinite(total) && page >= total) break;
      await sleep(500);
    }
    process.stdout.write(`  CoinJournal: ${out.length} posts\n`);
    return out;
  });
}

// Daily closes from Coinbase Exchange, by UTC day
async function closes(coin) {
  return cached(`${coin}-daily-2018.json`, async () => {
    const rows = new Map();
    for (let end = END; end > START - 60 * DAY; end -= 300 * DAY) {
      const start = end - 300 * DAY;
      const url = `https://api.exchange.coinbase.com/products/${coin}-USD/candles?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
      const { body } = await getJson(url);
      for (const r of Array.isArray(body) ? body : []) rows.set(r[0] * 1000, r[4]);
      await sleep(300);
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]);
  });
}

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN;
};
// One-sided binomial P(X >= k | n, p), in logs
const binomTail = (k, n, p) => {
  const lg = (x) => {
    let s = 0;
    for (let i = 2; i <= x; i++) s += Math.log(i);
    return s;
  };
  let t = 0;
  for (let j = k; j <= n; j++) t += Math.exp(lg(n) - lg(j) - lg(n - j) + j * Math.log(p) + (n - j) * Math.log(1 - p));
  return Math.min(1, t);
};
const spearman = (x, y) => {
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x);
  const ry = rank(y);
  const n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
};

function study(coin, A, C) {
  // Day indices on a common grid from START
  const days = Math.round((END - START) / DAY);
  const close = new Array(days).fill(NaN);
  for (const [t, c] of C) {
    const i = Math.round((t - START) / DAY);
    if (i >= 0 && i < days) close[i] = c;
  }
  const r = close.map((c, i) => (i > 0 && c > 0 && close[i - 1] > 0 ? Math.log(c / close[i - 1]) : NaN));
  const S = A.map((a, d) => (d < WARM ? NaN : Math.log((a + 1) / (median(A.slice(d - WARM, d)) + 1))));
  const rows = [];
  for (let d = WARM; d < days - 7; d++) {
    const past = r.slice(d - WARM + 1, d + 1).filter(Number.isFinite);
    if (past.length < 20 || !Number.isFinite(r[d + 1])) continue;
    const medAbs = median(past.map(Math.abs));
    const vol = (xs) => Math.sqrt(xs.reduce((s, v) => s + v * v, 0) / xs.length);
    const next7 = r.slice(d + 1, d + 8).filter(Number.isFinite);
    rows.push({
      d,
      S: S[d],
      h1: Math.abs(r[d + 1]) > medAbs,
      h7: next7.length === 7 ? vol(next7) > vol(past) : null,
      up: r[d + 1] > 0,
      absNext: Math.abs(r[d + 1]) / medAbs,
    });
  }
  const run = (cut) => {
    const inState = (row) => row.S >= cut;
    const episodes = rows.filter((row, i) => inState(row) && (i === 0 || !inState(rows[i - 1]) || rows[i - 1].d !== row.d - 1));
    const res = {};
    for (const h of ["h1", "h7"]) {
      const all = rows.filter((x) => x[h] != null);
      const ep = episodes.filter((x) => x[h] != null);
      const base = all.filter((x) => x[h]).length / all.length;
      const k = ep.filter((x) => x[h]).length;
      res[h] = { n: ep.length, k, rate: ep.length ? k / ep.length : NaN, base, p: ep.length ? binomTail(k, ep.length, base) : 1 };
    }
    const up = episodes.filter((x) => x.up).length;
    res.up = { n: episodes.length, k: up, rate: episodes.length ? up / episodes.length : NaN, base: rows.filter((x) => x.up).length / rows.length };
    res.daysInState = rows.filter(inState).length;
    return res;
  };
  const both = rows.filter((x) => Number.isFinite(x.S));
  return {
    coin,
    days: rows.length,
    meanAttention: A.slice(WARM).reduce((s, v) => s + v, 0) / (A.length - WARM),
    x2: run(Math.log(2)),
    x3: run(Math.log(3)),
    spearman: spearman(both.map((x) => x.S), both.map((x) => x.absNext)),
  };
}

(async () => {
  const cj = await coinJournal();
  const results = [];
  for (const [coin, spec] of Object.entries(COINS)) {
    const hn = await hnTimes(spec.hn);
    const days = Math.round((END - START) / DAY);
    const A = new Array(days).fill(0);
    const add = (t) => {
      const i = Math.floor((t - START) / DAY);
      if (i >= 0 && i < days) A[i] += 1;
    };
    hn.forEach(add);
    cj.filter((p) => spec.title.test(p.title.replace(/&#\d+;|&amp;/g, " "))).forEach((p) => add(p.t));
    const C = await closes(coin);
    results.push(study(coin, A, C));
  }
  // BH over the four preregistered tests (×2 threshold, H1 and H7, two coins)
  const tests = [];
  for (const r of results) for (const h of ["h1", "h7"]) tests.push({ coin: r.coin, h, ...r.x2[h] });
  const sorted = tests.map((t, i) => ({ ...t, i })).sort((a, b) => a.p - b.p);
  let cut = -1;
  sorted.forEach((t, rank) => {
    if (t.p <= ((rank + 1) / sorted.length) * 0.05) cut = rank;
  });
  for (let rank = sorted.length - 1, qMin = 1; rank >= 0; rank--) {
    qMin = Math.min(qMin, (sorted[rank].p * sorted.length) / (rank + 1));
    const t = tests[sorted[rank].i];
    t.q = qMin;
    t.bh = rank <= cut;
    t.enters = t.bh && t.n >= 12 && t.rate - t.base >= 0.1;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT, `news-attention-results-${stamp}.json`), JSON.stringify({ results, tests }, null, 1));
  const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : "–");
  const L = [`# Unusual news attention — results (${stamp})`, "", "Run of `scripts/news-attention-study.js` against `news-attention-prereg.md`.", ""];
  L.push("| Coin | days | headlines a day | ×2 days in state |", "|---|---|---|---|");
  for (const r of results) L.push(`| ${r.coin} | ${r.days} | ${r.meanAttention.toFixed(2)} | ${r.x2.daysInState} |`);
  L.push("", "## The four tests (×2, BH q = 0.05)", "", "| Coin | horizon | episodes | larger than usual | base | p | q | enters |", "|---|---|---|---|---|---|---|---|");
  for (const t of tests) L.push(`| ${t.coin} | ${t.h === "h1" ? "next day" : "next week"} | ${t.n} | ${t.k} (${pct(t.rate)}) | ${pct(t.base)} | ${t.p.toFixed(4)} | ${t.q.toFixed(4)} | ${t.enters ? "**yes**" : "no"} |`);
  L.push("", "## Reported, not tested", "");
  for (const r of results) {
    L.push(`**${r.coin}** — ×3: next day ${r.x3.h1.k}/${r.x3.h1.n} (${pct(r.x3.h1.rate)}, base ${pct(r.x3.h1.base)}), next week ${r.x3.h7.k}/${r.x3.h7.n} (${pct(r.x3.h7.rate)}, base ${pct(r.x3.h7.base)}); next day up after ×2 episodes ${r.x2.up.k}/${r.x2.up.n} (${pct(r.x2.up.rate)}, base ${pct(r.x2.up.base)}); Spearman(surprise, next |move|) over all days ${r.spearman.toFixed(3)}.`, "");
  }
  fs.writeFileSync(path.join(OUT, `news-attention-results-${stamp}.md`), L.join("\n") + "\n");
  process.stdout.write(L.join("\n") + "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
