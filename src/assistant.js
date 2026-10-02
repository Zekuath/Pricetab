/* ---- the assistant — what a professional checks, as counts ------------
 *
 * Asked for as "a helper for the things I cannot tell you to watch". Built
 * as the one thing this app is allowed to be: a list of **facts about this
 * account and this market right now**, each with its number and its
 * denominator, in the order a desk runs them — before a contract, while one
 * is open, after it closed. It never says which way, never says "should",
 * and never scores. What it *does* is refuse to let a thing go unnoticed: a
 * contract with no stop, a funding settlement twenty minutes out, a stop
 * inside the window's ordinary noise, three contracts all facing one move.
 *
 * Pure. Structured items in, structured items out — the words live in the
 * UI where they can be translated; this file has no `msg`, no React, no
 * clock (`ctx.now` is handed in) and no fetch. Everything it reads is
 * already on the screen or in the account.
 *
 * Research and the item list: docs/product/derivatives-simulator/TRADING_ASSISTANT.md.
 */

/* Item kinds, in the order they are drawn. A `missing` is something a desk
   never trades without; a `watch` is a fact with a clock or a threshold on
   it; a `note` is context. None is a verdict. */
const ASSISTANT_KINDS = ["missing", "watch", "note"];

/* Thresholds — printed beside the fact they qualify, never hidden. */
const ASSISTANT_FUNDING_SOON_MS = 45 * 60 * 1000;
const ASSISTANT_NOISE_SHARE = 0.2;
const ASSISTANT_MARGIN_SHARE = 0.5;
const ASSISTANT_GIVEBACK = 0.5;
const ASSISTANT_CROWD_EDGE = 0.1;
const ASSISTANT_NEWS_HOURS = 6;

/* The share of the window's steps at least as large as a move — the rule
   behind `moveRarity`, restated so this file loads without d3's line(). */
const assistantShareAtLeast = (series, fromE4, toE4) => {
  if (!Array.isArray(series) || series.length < 12 || !(fromE4 > 0) || !(toE4 > 0)) return null;
  const steps = [];
  for (let i = 1; i < series.length; i += 1) {
    const a = Number(series[i - 1] && series[i - 1].price);
    const b = Number(series[i] && series[i].price);
    if (a > 0 && b > 0) steps.push(Math.abs(Math.log(b / a)));
  }
  if (steps.length < 10) return null;
  const size = Math.abs(Math.log(toE4 / fromE4));
  return { share: steps.filter((s) => s >= size - 1e-12).length / steps.length, steps: steps.length };
};

/* **The ordinary step** — the 80th percentile of the window's absolute log
   steps. It is the boundary the noise watch is measured at: a stop closer
   than this is reached by a fifth of the window's steps. Drawn on the chart
   as a band either side of a price, it says "steps this big are ordinary
   here" without saying which way. */
const assistantOrdinaryStep = (series) => {
  if (!Array.isArray(series) || series.length < 12) return null;
  const steps = [];
  for (let i = 1; i < series.length; i += 1) {
    const a = Number(series[i - 1] && series[i - 1].price);
    const b = Number(series[i] && series[i].price);
    if (a > 0 && b > 0) steps.push(Math.abs(Math.log(b / a)));
  }
  if (steps.length < 10) return null;
  steps.sort((a, b) => a - b);
  return steps[Math.min(steps.length - 1, Math.floor(0.8 * steps.length))];
};

/* A chart hint: a band of two prices and/or one level, in the series'
   units, for the market chart to draw while the item is looked at. */
const assistantBand = (priceE4, step) =>
  priceE4 > 0 && step > 0 ? [(priceE4 / 10000) * Math.exp(-step), (priceE4 / 10000) * Math.exp(step)] : null;

const assistantItem = (kind, key, data, jump, chart) => ({ kind, key, data: data || {}, jump: jump || null, chart: chart || null });

/* **Before a contract** — the ticket as it stands, against the market. */
const assistantBefore = (ctx) => {
  const out = [];
  const t = ctx.ticket;
  const plan = ctx.plan || {};
  const series = ctx.series;
  const step = assistantOrdinaryStep(series);
  if (t && t.entryE4 > 0) {
    if (!(t.stopE4 > 0)) {
      out.push(assistantItem("missing", "stop", { side: t.side, stepPct: step ? step * 100 : null }, "stop",
        step ? { band: assistantBand(t.entryE4, step), level: t.entryE4 / 10000 } : null));
    } else {
      const noise = assistantShareAtLeast(series, t.entryE4, t.stopE4);
      if (noise) {
        const away = Math.abs(Math.log(t.stopE4 / t.entryE4));
        out.push(assistantItem(noise.share >= ASSISTANT_NOISE_SHARE ? "watch" : "note", "stopNoise", {
          awayPct: away * 100,
          share: noise.share,
          steps: noise.steps,
          threshold: ASSISTANT_NOISE_SHARE,
        }, "stop", { band: assistantBand(t.entryE4, step), level: t.stopE4 / 10000 }));
      }
      if (t.stopLossE2 > 0 && plan.lossPerTradePct > 0 && ctx.accountE2 > 0) {
        const cap = Math.round((ctx.accountE2 * plan.lossPerTradePct) / 100);
        out.push(assistantItem(t.stopLossE2 > cap ? "watch" : "note", "riskShare", {
          lossE2: t.stopLossE2,
          capE2: cap,
          pct: (100 * t.stopLossE2) / ctx.accountE2,
          planPct: plan.lossPerTradePct,
        }, "stop"));
      }
      if (ctx.cone && ctx.cone.horizons && ctx.cone.horizons.length && ctx.coneLabel) {
        const h = ctx.cone.horizons[0];
        const stop = t.stopE4 / 10000;
        out.push(assistantItem("note", "stopCone", {
          label: ctx.coneLabel,
          p5: h.p5,
          p95: h.p95,
          inside: stop > h.p5 && stop < h.p95,
          n: h.n,
        }));
      }
    }
    if (!(t.takeE4 > 0)) out.push(assistantItem("note", "take", {}, "take"));
    if (t.marginE2 > 0 && ctx.freeE2 > 0) {
      const share = t.marginE2 / ctx.freeE2;
      out.push(assistantItem(share > ASSISTANT_MARGIN_SHARE ? "watch" : "note", "marginShare", {
        share,
        marginE2: t.marginE2,
        freeE2: ctx.freeE2,
        threshold: ASSISTANT_MARGIN_SHARE,
      }));
    }
    if (t.liqE4 > 0 && series) {
      const r = assistantShareAtLeast(series, t.entryE4, t.liqE4);
      if (r) {
        out.push(assistantItem(r.share > 0 ? "watch" : "note", "liqNoise", {
          awayPct: Math.abs(Math.log(t.liqE4 / t.entryE4)) * 100,
          share: r.share,
          steps: r.steps,
          leverage: t.leverage,
        }, null, { band: assistantBand(t.entryE4, step), level: t.liqE4 / 10000 }));
      }
    }
  }
  /* Funding: when, at what rate, and what it costs *this* contract. */
  if (ctx.funding && ctx.funding.at > 0 && isFinite(ctx.funding.rate)) {
    const ms = ctx.funding.at - ctx.now;
    const notionalE2 = t && t.notionalE2 > 0 ? t.notionalE2 : 0;
    const paysLong = ctx.funding.rate > 0;
    const pays = t ? (t.side === "long") === paysLong : null;
    out.push(assistantItem(ms > 0 && ms <= ASSISTANT_FUNDING_SOON_MS ? "watch" : "note", "funding", {
      minutes: ms > 0 ? Math.floor(ms / 60000) : 0,
      rate: ctx.funding.rate,
      costE2: notionalE2 ? Math.round(notionalE2 * Math.abs(ctx.funding.rate)) : 0,
      pays,
      /* Settlements a day from the measured interval (WIF settles every 4h,
         not 8 — see fetchFundingRate); 3 only for a cache entry from before
         the interval was recorded. */
      perDayE2: notionalE2
        ? Math.round(notionalE2 * Math.abs(ctx.funding.rate) * (ctx.funding.intervalHours > 0 ? 24 / ctx.funding.intervalHours : 3))
        : 0,
    }));
  }
  if (ctx.crowd && ctx.crowd.rank != null) {
    const extreme = ctx.crowd.rank >= 1 - ASSISTANT_CROWD_EDGE || ctx.crowd.rank <= ASSISTANT_CROWD_EDGE;
    if (extreme) {
      out.push(assistantItem("note", "crowd", {
        state: ctx.crowd.state,
        rank: ctx.crowd.rank,
        share: ctx.crowd.share,
        n: ctx.crowd.n,
        up: ctx.crowd.n ? ctx.crowd.up / ctx.crowd.n : null,
        baseUp: ctx.crowd.baseRate != null ? ctx.crowd.baseRate : null,
        lean: ctx.crowd.lean || null,
      }));
    }
  }
  if (ctx.vol && ctx.vol.ratio != null) {
    out.push(assistantItem("note", "regime", {
      ratio: ctx.vol.ratio,
      regime: ctx.vol.regime,
      pct: ctx.vol.pct,
      ac1: ctx.vol.ac1,
      short: ctx.vol.short,
      long: ctx.vol.long,
    }));
  }
  if (ctx.location) {
    out.push(assistantItem("note", "location", { state: ctx.location, window: ctx.locationWindow || 0 }, null,
      ctx.area && ctx.area.val > 0 ? { band: [ctx.area.val, ctx.area.vah], level: ctx.area.poc } : null));
  }
  if (ctx.streak > 0) {
    out.push(assistantItem(ctx.streak >= 2 ? "watch" : "note", "streak", {
      streak: ctx.streak,
      pause: plan.streakPause || 0,
    }, "closed"));
  }
  /* Same-side exposure: every open contract faces one move. */
  const held = Array.isArray(ctx.positions) ? ctx.positions : [];
  if (held.length >= 2) {
    const longs = held.filter((p) => p.side === "long").length;
    const shorts = held.length - longs;
    const marginE2 = held.reduce((a, p) => a + (p.margin || 0), 0);
    if (longs === held.length || shorts === held.length) {
      out.push(assistantItem("watch", "sameSide", {
        count: held.length,
        side: longs === held.length ? "long" : "short",
        coins: Array.from(new Set(held.map((p) => p.coin))),
        marginE2,
      }));
    }
  }
  if (ctx.news && ctx.news.count > 0) {
    out.push(assistantItem("note", "news", { count: ctx.news.count, hours: ASSISTANT_NEWS_HOURS, newestMin: ctx.news.newestMin }, "news"));
  }
  if (ctx.participation && ctx.participation.pct != null) {
    const d = new Date(ctx.now);
    out.push(assistantItem("note", "clock", {
      utcHour: d.getUTCHours(),
      utcDay: d.getUTCDay(),
      pct: ctx.participation.pct,
      n: ctx.participation.n,
    }));
  }
  return out;
};

/* **While a contract is open** — one list per contract, on this market or
   any other, because a liquidation elsewhere is still this account's. */
const assistantDuring = (ctx) => {
  const held = Array.isArray(ctx.positions) ? ctx.positions : [];
  const out = [];
  for (const pos of held) {
    const markE4 = ctx.marks && ctx.marks[pos.coin];
    const items = [];
    const series = ctx.seriesFor ? ctx.seriesFor(pos.coin) : pos.coin === ctx.coin ? ctx.series : null;
    const stepHere = series ? assistantOrdinaryStep(series) : null;
    if (!(pos.stop > 0)) {
      items.push(assistantItem("missing", "posStop", { coin: pos.coin, stepPct: stepHere ? stepHere * 100 : null }, "position",
        stepHere && markE4 > 0 ? { band: assistantBand(markE4, stepHere), level: pos.entry / 10000 } : null));
    }
    if (!(pos.take > 0) && !(pos.trail > 0)) items.push(assistantItem("note", "posTake", { coin: pos.coin }, "position"));
    if (markE4 > 0) {
      const liq = typeof practiceLiquidationPrice === "function" ? practiceLiquidationPrice(pos) : null;
      if (liq && series) {
        const r = assistantShareAtLeast(series, markE4, liq);
        if (r) {
          items.push(assistantItem(r.share > 0 ? "watch" : "note", "posLiq", {
            coin: pos.coin,
            awayPct: Math.abs(Math.log(liq / markE4)) * 100,
            share: r.share,
            steps: r.steps,
          }, null, { band: assistantBand(markE4, stepHere), level: liq / 10000 }));
        }
      }
      const band = typeof practiceMarginBand === "function" ? practiceMarginBand(pos, markE4) : null;
      if (band === "warn" || band === "danger") {
        const ratio = typeof practiceMarginRatio === "function" ? practiceMarginRatio(pos, markE4) : null;
        items.push(assistantItem("watch", "posMargin", { coin: pos.coin, band, ratio }));
      }
      if (typeof practiceUnrealised === "function") {
        const now = practiceUnrealised(pos, markE4);
        const long = pos.side === "long";
        const best = practiceUnrealised(pos, long ? pos.peak : pos.trough);
        if (best > 0 && now < best) {
          const gave = (best - now) / best;
          items.push(assistantItem(gave >= ASSISTANT_GIVEBACK ? "watch" : "note", "posGiveBack", {
            coin: pos.coin,
            bestE2: best,
            nowE2: now,
            gave,
            threshold: ASSISTANT_GIVEBACK,
          }, "position", { level: (long ? pos.peak : pos.trough) / 10000, band: [Math.min(pos.entry, long ? pos.peak : pos.trough) / 10000, Math.max(pos.entry, long ? pos.peak : pos.trough) / 10000] }));
        }
        if (pos.stopFirst > 0) {
          const risk = Math.max(0, -practiceUnrealised(pos, pos.stopFirst));
          if (risk > 0) items.push(assistantItem("note", "posR", { coin: pos.coin, r: now / risk, riskE2: risk, nowE2: now }, null, { level: pos.stopFirst / 10000, band: [Math.min(pos.entry, pos.stopFirst) / 10000, Math.max(pos.entry, pos.stopFirst) / 10000] }));
        }
      }
    }
    if (pos.openedAt > 0 && ctx.now > pos.openedAt) {
      const windows = typeof practiceFundingWindows === "function" && pos.fundedTo > 0 ? practiceFundingWindows(pos.fundedTo, ctx.now) : 0;
      const minutes = Math.floor((ctx.now - pos.openedAt) / 60000);
      /* "Held 0 min" on a contract opened seconds ago is noise, not a fact
         worth a row; the row appears once there is a minute to report. */
      if (minutes >= 1 || windows > 0) {
        items.push(assistantItem("note", "posHeld", { coin: pos.coin, minutes, fundingDue: windows }));
      }
    }
    out.push({ pos: pos.id, coin: pos.coin, side: pos.side, items });
  }
  return out;
};

/* **After** — the record's own readings, pointed at rather than repeated. */
const assistantAfter = (ctx) => {
  const out = [];
  const sc = ctx.scorecard;
  if (sc && sc.n > 0) {
    out.push(assistantItem(sc.bad > 0 ? "watch" : "note", "grades", {
      n: sc.n,
      A: sc.grades.A,
      B: sc.grades.B,
      C: sc.grades.C,
      bad: sc.bad,
      win: sc.win,
      profitFactor: sc.profitFactor,
      avgR: sc.avgR,
    }, "closed"));
  }
  if (ctx.bySetup && ctx.bySetup.n >= 5) {
    /* The code whose with/without gap is widest, as a count — the one the
       trader's own record has the most to say about. */
    let best = null;
    for (const code of Object.keys(ctx.bySetup.codes)) {
      const c = ctx.bySetup.codes[code];
      if (c.with.n < 5 || c.without.n < 5) continue;
      const gap = c.with.wins / c.with.n - c.without.wins / c.without.n;
      if (!best || Math.abs(gap) > Math.abs(best.gap)) best = { code, gap, with: c.with, without: c.without };
    }
    if (best) out.push(assistantItem("note", "bySetup", best, "closed"));
  }
  return out;
};

const assistantSort = (items) => items.slice().sort((a, b) => ASSISTANT_KINDS.indexOf(a.kind) - ASSISTANT_KINDS.indexOf(b.kind));

/* The whole reading, and the two counts the tab's badge wants. */
const assistantReadings = (ctx) => {
  const before = assistantSort(assistantBefore(ctx || {}));
  const during = assistantDuring(ctx || {}).map((c) => ({ ...c, items: assistantSort(c.items) }));
  const after = assistantSort(assistantAfter(ctx || {}));
  const all = [...before, ...during.flatMap((c) => c.items), ...after];
  return {
    before,
    during,
    after,
    missing: all.filter((i) => i.kind === "missing").length,
    watch: all.filter((i) => i.kind === "watch").length,
    total: all.length,
  };
};
