/* THE WIDGETS, ONE DESIGN PER SIZE (17 Oct 2026) — see widget-kit.js.
 *
 * Each entry takes the card's data and its size and returns what the card
 * shows. Pure: no state, no fetch; the app hands in what it already holds
 * (and `ctx` for the few things a card needs from it: the coin, a month of
 * funding). A card with no data never reaches here — `app.js` keeps its
 * loading skeleton until it has some.
 *
 * Every figure keeps the claim its card already made: Fear & Greed is the
 * source's own number and word on a plain scale, funding is inked by who pays
 * (above zero, longs — the crowded side), and dominance is a split in ink
 * steps, never a direction. */

/* A fee in money: "~$0.34 to send", or "under $0.01 to send" with no "~". */
const wdSend = (money) => {
  // The words feeMoney wraps a sub-cent cost in, in the reader's language
  const under = msg("widget_under_a_cent", "under $1", "").trim();
  return under && money.includes(under)
    ? msg("wd_send_plain", "$1 to send", money)
    : msg("wd_to_send", "~$1 to send", money);
};

const wdPct = (v, digits) => `${signedFixed(v, digits == null ? 1 : digits)}%`;

/* The halvings so far, as the chain recorded them (blocks 210,000 × n), and
   the reward each era paid. Fixed history; the next date is the estimate. */
const WD_HALVINGS = [
  { block: 0, year: 2009 },
  { block: 210000, year: 2012 },
  { block: 420000, year: 2016 },
  { block: 630000, year: 2020 },
  { block: 840000, year: 2024 },
];
const wdEras = (era, eta) => {
  const next = String(eta || "").match(/\d{4}/);
  const rows = WD_HALVINGS.slice(1).map((h, i) => ({ year: String(h.year), reward: 50 / Math.pow(2, i + 1) }));
  rows.push({ year: next ? next[0] : "…", reward: 50 / Math.pow(2, era), next: true });
  return React.createElement(
    KitStats,
    { cols: rows.length, "data-wd-eras": "1" },
    ...rows.map((r) =>
      React.createElement(
        KitStat,
        { key: r.year, style: r.next ? { opacity: 0.6 } : undefined },
        React.createElement(KitStatValue, null, r.year),
        React.createElement(KitStatLabel, null, String(r.reward)),
      ),
    ),
  );
};

/* The next releases of every kind, two of each, soonest first — the large
   calendar card's list (nextMacroReleases keeps one of each). */
const wdMacroNext = (now, perKind) => {
  const out = [];
  for (const kind of macroKinds()) {
    let k = 0;
    for (const t of macroReleaseTimes(kind)) {
      if (t > now) {
        out.push({ t, kind });
        if (++k >= perKind) break;
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
};

const widgetDesigns = {
  /* The source's index and its word; a month of it from the same request. */
  fearGreed: (d, size) => {
    const hist = Array.isArray(d.history) ? d.history : [];
    const values = hist.map((h) => h.value);
    const ago = (days) => (hist.length > days ? hist[hist.length - 1 - days].value : null);
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, d.value);
    const word = React.createElement(KitSub, null, d.classification);
    if (size === "s") {
      return React.createElement(
        KitWrap,
        null,
        hero,
        word,
        values.length > 1
          ? React.createElement("div", { style: { marginTop: "auto" } }, kitSpark(values, { domain: [0, 100], levels: [50], h: 1.9 }))
          : null,
      );
    }
    const scale = hist.length > 1
      ? React.createElement(KitScale, null, React.createElement("span", null, kitDay(hist[0].t)), React.createElement("span", null, msg("wd_today", "today")))
      : null;
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(
          KitCol,
          null,
          hero,
          word,
          ago(7) != null ? React.createElement(KitSub, null, msg("wd_week_ago", "a week ago"), " ", React.createElement("b", null, ago(7))) : null,
        ),
        React.createElement(KitCol, null, kitSpark(values, { domain: [0, 100], levels: [25, 50, 75], h: 3.8 }), scale),
      );
    }
    const low = values.length ? Math.min(...values) : null;
    const high = values.length ? Math.max(...values) : null;
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, word),
      kitSpark(values, { domain: [0, 100], levels: [25, 50, 75], h: 6.4 }),
      scale,
      kitStats([
        ago(1) != null && { value: ago(1), label: msg("wd_yesterday", "yesterday") },
        ago(7) != null && { value: ago(7), label: msg("wd_week_ago", "a week ago") },
        ago(30) != null && { value: ago(30), label: msg("wd_month_ago", "a month ago") },
        low != null && { value: `${low}–${high}`, label: msg("wd_month_range", "month's range") },
      ]),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_fg_note", "Alternative.me's sentiment index, 0 to 100, one reading a day — their number and their word.")),
    );
  },

  /* The perpetual's rate now, and a month of it by day (Bybit, `ctx.recent`). */
  fundingRate: (d, size, ctx) => {
    const tone = d.rate > 0 ? "down" : d.rate < 0 ? "up" : null;
    const rows = ctx && Array.isArray(ctx.recent) ? ctx.recent : [];
    const values = rows.map((r) => r.value * 100);
    const hero = React.createElement(KitHero, { size, tone, "data-wd-hero": "1" }, `${d.rate >= 0 ? "+" : ""}${d.percent}%`);
    const every = msg("wd_funding_every", "every $1h", String(Math.round(d.intervalHours || 8)));
    const yearly = msg("wd_funding_year", "$1% a year", `${d.annualized >= 0 ? "+" : ""}${Number(d.annualized).toFixed(1)}`);
    const who = d.rate > 0
      ? msg("wd_longs_pay", "longs pay shorts")
      : d.rate < 0
        ? msg("wd_shorts_pay", "shorts pay longs")
        : msg("wd_nobody_pays", "neither side pays");
    if (size === "s") {
      return React.createElement(KitWrap, null, hero, React.createElement(KitSub, null, who), React.createElement(KitSub, { style: { marginTop: "auto" } }, yearly));
    }
    const scale = rows.length > 1
      ? React.createElement(KitScale, null, React.createElement("span", null, kitDay(rows[0].t)), React.createElement("span", null, kitDay(rows[rows.length - 1].t)))
      : null;
    const chart = values.length > 1
      ? kitColumns(values, { invert: true, h: size === "l" ? 6.2 : 3.6 })
      : React.createElement(KitSub, { wrap: true }, msg("wd_funding_month_wait", "The month's settlements come from Bybit."));
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(KitCol, null, hero, React.createElement(KitSub, null, who), React.createElement(KitSub, null, yearly)),
        React.createElement(KitCol, null, chart, scale),
      );
    }
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const paid = values.filter((v) => v > 0).length;
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, React.createElement(KitSub, null, who, " · ", every, " · ", yearly)),
      chart,
      scale,
      values.length
        ? kitStats([
            { value: wdPct(avg, 4), label: msg("wd_month_avg", "month's average") },
            { value: msg("al_x_of_y", "$1 of $2", paid, values.length), label: msg("wd_days_longs_paid", "days longs paid") },
            { value: wdPct(Math.max(...values), 4), label: msg("wd_highest", "highest") },
            { value: wdPct(Math.min(...values), 4), label: msg("wd_lowest", "lowest") },
          ])
        : null,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_funding_note", "What one side of the perpetual pays the other at each settlement — OKX's rate now, Bybit's by day for the month.")),
    );
  },

  /* Where the chain is in its 210,000-block era, and when the next one starts. */
  halvingCountdown: (h, size) => {
    const ERA = 210000;
    const height = h.nextHalvingBlock - h.blocksLeft;
    const share = (ERA - h.blocksLeft) / ERA;
    const era = h.nextHalvingBlock / ERA;
    const blocks = msg("wd_blocks_left", "$1 blocks left", localeNumber(h.blocksLeft));
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, ...kitFigure(localeNumber(h.days), msg("wd_unit_days", "days")));
    const track = React.createElement(KitTrack, null, React.createElement("i", { style: { width: `${(share * 100).toFixed(1)}%` } }));
    if (size === "s") {
      return React.createElement(KitWrap, null, hero, React.createElement(KitSub, null, blocks), React.createElement("div", { style: { marginTop: "auto" } }, track));
    }
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(KitCol, null, hero, React.createElement(KitSub, null, blocks), React.createElement(KitSub, null, String(h.etaFormatted).split(",")[0])),
        React.createElement("div", { style: { display: "flex", justifyContent: "center" } }, kitRing(share, msg("wd_era_done", "$1% of this era mined", Math.round(share * 100)), { h: 5 })),
      );
    }
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, React.createElement(KitSub, null, msg("wd_halving_eta", "about $1", h.etaFormatted))),
      React.createElement("div", { style: { margin: "0.6em 0 0.1em" } }, track),
      React.createElement(
        KitScale,
        null,
        React.createElement("span", null, localeNumber(h.nextHalvingBlock - ERA)),
        React.createElement("span", null, `${Math.round(share * 100)}%`),
        React.createElement("span", null, localeNumber(h.nextHalvingBlock)),
      ),
      wdEras(era, h.etaFormatted),
      React.createElement(KitScale, null, React.createElement("span", null, msg("wd_reward_per_block", "halvings · reward per block, BTC"))),
      kitStats([
        { value: localeNumber(h.blocksLeft), label: msg("wd_blocks_to_go", "blocks to go") },
        { value: localeNumber(height), label: msg("wd_height_now", "height now") },
      ]),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_halving_note", "Every 210,000 blocks the reward for a block halves. The date assumes ten minutes a block.")),
    );
  },

  /* The whole market's value, and how it splits between BTC, ETH and the rest. */
  marketOverview: (d, size) => {
    const change = Number.isFinite(d.marketCapChange24h) ? d.marketCapChange24h : null;
    const tone = change == null ? null : change > 0 ? "up" : change < 0 ? "down" : null;
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, formatCompactAmount(d.totalMarketCap, "$"));
    const changeLine = change != null ? React.createElement(KitSub, null, React.createElement(KitTone, { tone }, wdPct(change, 2)), " ", msg("wd_in_24h", "in 24h")) : null;
    const others = Math.max(0, 100 - d.btcDominance - d.ethDominance);
    const split = [
      { label: "BTC", value: d.btcDominance, text: `${d.btcDominance.toFixed(1)}%` },
      { label: "ETH", value: d.ethDominance, text: `${d.ethDominance.toFixed(1)}%` },
      { label: msg("wd_others", "Others"), value: others, text: `${others.toFixed(1)}%` },
    ];
    if (size === "s") {
      return React.createElement(
        KitWrap,
        null,
        hero,
        changeLine,
        React.createElement("div", { style: { marginTop: "auto" } }, kitStack(split.map((p) => ({ share: p.value })), { whole: 100 }), React.createElement(KitScale, null, React.createElement("span", null, `BTC ${d.btcDominance.toFixed(0)}%`), React.createElement("span", null, `ETH ${d.ethDominance.toFixed(0)}%`))),
      );
    }
    const bars = React.createElement(KitCol, { style: { gap: "0.5em" } }, ...kitBars(split, { max: 100, label: "3.6em" }));
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(KitCol, null, hero, changeLine, d.totalVolume > 0 ? React.createElement(KitSub, null, msg("wd_volume", "volume"), " ", React.createElement("b", null, formatCompactAmount(d.totalVolume, "$"))) : null),
        bars,
      );
    }
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, changeLine),
      React.createElement("div", { style: { margin: "0.4em 0" } }, bars),
      d.totalVolume > 0
        ? kitStats([
            { value: formatCompactAmount(d.totalVolume, "$"), label: msg("wd_volume_24h", "24h volume") },
            { value: `${((d.totalVolume / d.totalMarketCap) * 100).toFixed(1)}%`, label: msg("wd_turnover", "volume / value") },
          ])
        : null,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_market_note", "Every coin's market value added up, from Coinlore, and the share of it in bitcoin and ether.")),
    );
  },

  /* Ethereum's gas now; the base fee over twenty blocks and three tips. */
  ethGas: (d, size, ctx) => {
    const g = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
    const cost = (gwei) => (ctx && ctx.feeMoney ? ctx.feeMoney((gwei * 1e9 * 21000) / 1e18, "ETH") : null);
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, ...kitFigure(g(d.gwei), "gwei"));
    const send = cost(d.gwei) ? React.createElement(KitSub, null, wdSend(cost(d.gwei))) : null;
    const hist = Array.isArray(d.history) ? d.history : [];
    if (size === "s") return React.createElement(KitWrap, null, hero, send, hist.length > 1 ? React.createElement("div", { style: { marginTop: "auto" } }, kitSpark(hist, { h: 1.9 })) : null);
    const scale = React.createElement(KitScale, null, React.createElement("span", null, msg("wd_blocks_ago", "$1 blocks ago", hist.length)), React.createElement("span", null, msg("wd_now", "now")));
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(KitCol, null, hero, send, React.createElement(KitSub, null, msg("wd_base_tip", "base $1 · tip $2", g(d.baseGwei), g(d.tipGwei)))),
        hist.length > 1 ? React.createElement(KitCol, null, kitSpark(hist, { area: true, h: 3.6 }), scale) : null,
      );
    }
    const tiers = [
      d.slowGwei > 0 && { label: msg("wd_tier_slow", "slow"), gwei: d.slowGwei },
      { label: msg("wd_tier_usual", "usual"), gwei: d.gwei },
      d.fastGwei > 0 && { label: msg("wd_tier_fast", "fast"), gwei: d.fastGwei },
    ].filter(Boolean);
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, send),
      hist.length > 1 ? kitSpark(hist, { area: true, h: 5.2 }) : null,
      hist.length > 1 ? scale : null,
      kitStats(tiers.map((t) => ({ value: `${g(t.gwei)} gwei`, label: t.label })), 3),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_gas_note", "The base fee every send pays, over the last twenty blocks, and a slow, usual and fast tip on top — priced for a plain ETH transfer.")),
    );
  },

  /* Bitcoin's fee rates by how soon, and what a typical send costs at each. */
  btcFees: (d, size, ctx) => {
    const cost = (rate) => (ctx && ctx.feeMoney ? ctx.feeMoney((rate * 141) / 1e8, "BTC") : null);
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, ...kitFigure(d.rate, "sat/vB"));
    const send = cost(d.rate) ? React.createElement(KitSub, null, wdSend(cost(d.rate))) : null;
    const tiers = [
      { label: msg("wd_fee_next", "~10 min"), value: d.fastest },
      { label: msg("wd_fee_half", "~30 min"), value: d.rate },
      { label: msg("wd_fee_hour", "~1 hour"), value: d.hour },
      d.economy && { label: msg("wd_fee_economy", "economy"), value: d.economy },
    ].filter((t) => t && Number.isFinite(t.value));
    if (size === "s") return React.createElement(KitWrap, null, hero, send, React.createElement(KitSub, { style: { marginTop: "auto" } }, msg("wd_fee_fast_line", "$1 for ~10 min", d.fastest)));
    const bars = (withCost) =>
      React.createElement(
        KitCol,
        { style: { gap: "0.5em" } },
        ...kitBars(tiers.map((t) => ({ label: t.label, value: t.value, text: withCost && cost(t.value) ? `${t.value} · ${cost(t.value)}` : `${t.value}` })), { label: "5em" }),
      );
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, send), bars(false));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, send),
      React.createElement("div", { style: { margin: "0.5em 0" } }, bars(true)),
      Array.isArray(ctx && ctx.day) && ctx.day.length > 1
        ? React.createElement(
            KitCol,
            null,
            React.createElement(KitScale, null, React.createElement("span", null, msg("wd_fee_day", "median fee of each block, last 24h"))),
            kitSpark(ctx.day.map((r) => r.value), { area: true, h: 3.2 }),
            React.createElement(KitScale, null, React.createElement("span", null, msg("wd_day_ago", "a day ago")), React.createElement("span", null, msg("wd_now", "now"))),
          )
        : null,
      d.source === "blockchair" ? React.createElement(KitSub, null, msg("widget_via_blockchair", "via Blockchair")) : null,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_fee_note", "Sats per virtual byte to be confirmed by each deadline, from mempool.space, and what a typical 141 vB send would cost.")),
    );
  },

  /* The queue waiting for a block: how deep, how many, what it pays. */
  mempool: (d, size) => {
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, ...kitFigure(d.blocks.toFixed(1), msg("wd_unit_blocks", "blocks")));
    const waiting = React.createElement(KitSub, null, msg("widget_mempool_waiting", "$1 waiting", formatCount(d.count)));
    const clear = msg("wd_clear_in", "about $1 to clear", describeSpan(d.blocks * 600000));
    if (size === "s") return React.createElement(KitWrap, null, hero, waiting, React.createElement("div", { style: { marginTop: "auto" } }, kitBlocks(d.blocks, { max: 8, h: 1 })));
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(KitCol, null, hero, waiting, React.createElement(KitSub, null, clear)),
        React.createElement(KitCol, null, kitBlocks(d.blocks, { max: 12, h: 1.1 }), React.createElement(KitScale, null, React.createElement("span", null, msg("wd_block_each", "a square a block")))),
      );
    }
    const bands = Array.isArray(d.bands) ? d.bands : [];
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, waiting, React.createElement(KitSub, null, clear, d.feesBtc != null ? ` · ${msg("wd_fees_waiting_line", "$1 BTC in fees", d.feesBtc.toFixed(2))}` : "")),
      kitBlocks(d.blocks, { max: 14, h: 1.2 }),
      bands.length
        ? React.createElement(
            KitCol,
            { style: { gap: "0.4em", marginTop: "0.3em" } },
            React.createElement(KitScale, null, React.createElement("span", null, msg("wd_by_fee", "waiting, by fee rate (sat/vB)"))),
            ...kitBars(bands.map((b) => ({ label: b.label, value: b.share, text: `${Math.round(b.share * 100)}%` })), { max: 1, label: "3.4em" }),
          )
        : null,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_mempool_note", "Transactions waiting for a block, from mempool.space, measured in blocks of about ten minutes each.")),
    );
  },

  /* The next difficulty change: how far into the 2,016 blocks, and by how much. */
  difficulty: (d, size) => {
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, `${signedFixed(d.change, 1)}%`);
    const when = d.remainingMs != null
      ? msg("widget_difficulty_in", "in $1 · $2 blocks", describeSpan(d.remainingMs), formatCount(d.remaining))
      : msg("widget_difficulty_blocks", "$1 blocks to go", formatCount(d.remaining));
    const share = Math.max(0, Math.min(1, (d.progress || 0) / 100));
    const est = React.createElement(KitSub, null, msg("wd_estimated", "next change, est."));
    if (size === "s") return React.createElement(KitWrap, null, hero, est, React.createElement("div", { style: { marginTop: "auto" } }, React.createElement(KitTrack, null, React.createElement("i", { style: { width: `${(share * 100).toFixed(1)}%` } }))));
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(KitCol, null, hero, est, React.createElement(KitSub, null, d.remainingMs != null ? msg("wd_in_span", "in $1", describeSpan(d.remainingMs)) : msg("widget_difficulty_blocks", "$1 blocks to go", formatCount(d.remaining)))),
        React.createElement("div", { style: { display: "flex", justifyContent: "center" } }, kitRing(share, msg("wd_epoch_done", "$1% of 2,016 blocks", Math.round(share * 100)), { h: 5 })),
      );
    }
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, est, React.createElement(KitSub, null, when)),
      React.createElement("div", { style: { margin: "0.6em 0 0.1em" } }, React.createElement(KitTrack, null, React.createElement("i", { style: { width: `${(share * 100).toFixed(1)}%` } }))),
      React.createElement(KitScale, null, React.createElement("span", null, "0"), React.createElement("span", null, `${Math.round(share * 100)}%`), React.createElement("span", null, "2,016")),
      kitStats([
        { value: `${signedFixed(d.change, 1)}%`, label: msg("wd_next_change", "next, estimated") },
        d.previous != null && { value: `${signedFixed(d.previous, 1)}%`, label: msg("wd_last_change", "last change") },
        { value: formatCount(d.remaining), label: msg("wd_blocks_to_go", "blocks to go") },
        d.remainingMs != null && { value: describeSpan(d.remainingMs), label: msg("wd_time_left", "time left") },
      ]),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_difficulty_note", "Every 2,016 blocks the network resets how hard a block is to find, so blocks keep coming about every ten minutes. From mempool.space.")),
    );
  },

  /* Your coins: price and day, the day drawn as a bar in its direction. */
  watchlist: (rows, size, ctx) => {
    const list = rows.slice(0, size === "s" ? 4 : size === "m" ? 4 : 12);
    const max = Math.max(...rows.map((c) => Math.abs(c.change)), 0.5);
    const line = (c) =>
      React.createElement(
        KitBarRow,
        { key: c.coin, label: "3.4em", "data-kit-bar": c.coin, style: size === "s" ? { gridTemplateColumns: "3em minmax(0, 1fr)" } : undefined },
        React.createElement("b", null, c.coin),
        size === "s"
          ? React.createElement(KitTone, { tone: c.up ? "up" : "down", style: { textAlign: "right" } }, `${signedFixed(c.change, 1)}%`)
          : React.createElement(KitTrack, { tone: c.up ? "up" : "down" }, React.createElement("i", { style: { width: `${Math.max(3, (Math.abs(c.change) / max) * 100)}%` } })),
        size === "s" ? null : React.createElement("span", null, ctx.price(c.price), " ", React.createElement(KitTone, { tone: c.up ? "up" : "down" }, `${signedFixed(c.change, 2)}%`)),
      );
    if (size !== "l") return React.createElement(KitCol, { style: { gap: "0.5em" } }, ...list.map(line));
    // Large: up to six coins as a board — figure, change and a full-width bar
    const big = rows.length <= 6;
    const board = big
      ? rows.map((c) =>
          React.createElement(
            KitCol,
            { key: c.coin, style: { gap: "0.3em" }, "data-kit-bar": c.coin },
            React.createElement(
              KitSub,
              { style: { display: "flex", justifyContent: "space-between", fontSize: "0.8em" } },
              React.createElement("b", null, c.coin),
              React.createElement("span", null, ctx.price(c.price), " ", React.createElement(KitTone, { tone: c.up ? "up" : "down" }, `${signedFixed(c.change, 2)}%`)),
            ),
            React.createElement(KitTrack, { tone: c.up ? "up" : "down" }, React.createElement("i", { style: { width: `${Math.max(3, (Math.abs(c.change) / max) * 100)}%` } })),
          ),
        )
      : list.map(line);
    const up = rows.filter((c) => c.change > 0).length;
    const avg = rows.reduce((a, c) => a + c.change, 0) / rows.length;
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, { style: { gap: big ? "0.8em" : "0.5em" } }, ...board),
      kitStats([
        { value: msg("al_x_of_y", "$1 of $2", up, rows.length), label: msg("wd_up_today", "up in 24h") },
        { value: `${signedFixed(avg, 2)}%`, label: msg("wd_avg_day", "average day"), tone: avg > 0 ? "up" : avg < 0 ? "down" : null },
      ]),
    );
  },

  /* The day's biggest moves among the top coins, both ways. */
  topMovers: (d, size, ctx) => {
    const g = d.gainers || [];
    const l = d.losers || [];
    const max = Math.max(...g.concat(l).map((c) => Math.abs(c.change)), 0.5);
    const rowsOf = (list, n, withPrice) =>
      list.slice(0, n).map((c) =>
        React.createElement(
          KitBarRow,
          { key: c.coin, label: "3.4em", "data-kit-bar": c.coin },
          React.createElement("b", null, c.coin),
          React.createElement(KitTrack, { tone: c.up ? "up" : "down" }, React.createElement("i", { style: { width: `${Math.max(3, (Math.abs(c.change) / max) * 100)}%` } })),
          React.createElement("span", null, withPrice ? `${ctx.price(c.price)} ` : "", React.createElement(KitTone, { tone: c.up ? "up" : "down" }, `${signedFixed(c.change, 1)}%`)),
        ),
      );
    if (size === "s") {
      const top = g[0];
      const bottom = l[0];
      return React.createElement(
        KitWrap,
        null,
        top ? React.createElement(KitHero, { size, tone: "up" }, ...kitFigure(`${signedFixed(top.change, 1)}%`, top.coin)) : null,
        bottom ? React.createElement(KitSub, null, msg("wd_worst_mover", "worst"), " ", React.createElement("b", null, bottom.coin), " ", React.createElement(KitTone, { tone: "down" }, `${signedFixed(bottom.change, 1)}%`)) : null,
        React.createElement(KitSub, { style: { marginTop: "auto" } }, msg("wd_of_top_100", "top 100 · 24h")),
      );
    }
    const head = (text) => React.createElement(KitScale, null, React.createElement("span", null, text));
    if (size === "m") {
      return React.createElement(
        KitSplit,
        { style: { alignItems: "start" } },
        React.createElement(KitCol, { style: { gap: "0.45em" } }, head(msg("wd_gainers", "up most")), ...rowsOf(g, 3, false)),
        React.createElement(KitCol, { style: { gap: "0.45em" } }, head(msg("wd_losers", "down most")), ...rowsOf(l, 3, false)),
      );
    }
    return React.createElement(
      KitWrap,
      { style: { gap: "0.5em" } },
      head(msg("wd_gainers", "up most")),
      ...rowsOf(g, 5, true),
      head(msg("wd_losers", "down most")),
      ...rowsOf(l, 5, true),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_movers_note", "The 24-hour change of the top 100 coins by market value, from Coinlore — the ends of the list.")),
    );
  },

  /* The deepest peak-to-trough fall in the range on screen — plain ink: it is over. */
  worstFall: (fall, size, ctx) => {
    const series = ctx.series || [];
    const prices = series.map((p) => Number(p.price));
    const at = (t) => {
      const ms = +t;
      let best = 0;
      for (let i = 1; i < series.length; i++) if (Math.abs(+series[i].time - ms) < Math.abs(+series[best].time - ms)) best = i;
      return best;
    };
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, `−${Math.abs(fall.pct).toFixed(1)}%`);
    const when = React.createElement(KitSub, null, ctx.when || msg("widget_peak_to_trough", "peak to trough"));
    if (size === "s") return React.createElement(KitWrap, null, hero, React.createElement(KitSub, null, msg("wd_over_span", "over $1", describeSpan(Math.abs(+fall.to - +fall.from)))), prices.length > 1 ? React.createElement("div", { style: { marginTop: "auto" } }, kitSpark(prices, { h: 1.9, mark: [at(fall.from), at(fall.to)] })) : null);
    const chart = (h) => kitSpark(prices, { h, mark: [at(fall.from), at(fall.to)] });
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, when), React.createElement(KitCol, null, chart(3.8)));
    const i0 = at(fall.from);
    const i1 = at(fall.to);
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, when),
      chart(6.6),
      kitStats([
        { value: ctx.price(prices[i0]), label: msg("wd_peak", "peak") },
        { value: ctx.price(prices[i1]), label: msg("wd_trough", "trough") },
        { value: `${signedFixed(((prices[prices.length - 1] / prices[i1]) - 1) * 100, 1)}%`, label: msg("wd_since_trough", "since the trough") },
        { value: describeSpan(Math.abs(+fall.to - +fall.from)), label: msg("wd_fall_took", "the fall took") },
      ]),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_fall_note", "The deepest fall from a high to a later low inside the range on screen — how bad it got, not how bad it can get.")),
    );
  },

  /* RSI over the range on screen, the same 14 and the same sampling as the figure. */
  rsiWidget: (value, size, ctx) => {
    const line = wdRsiSeries(ctx.series || []);
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, value);
    const scale = React.createElement(KitScale, null, React.createElement("span", null, "0"), React.createElement("span", null, "50"), React.createElement("span", null, "100"));
    const meter = React.createElement(
      "div",
      null,
      React.createElement(KitTrack, null, React.createElement("i", { style: { width: `${Math.min(100, Math.max(1, value))}%` } })),
    );
    if (size === "s") return React.createElement(KitWrap, null, hero, React.createElement(KitSub, null, msg("wd_rsi_scale", "of 100")), React.createElement("div", { style: { marginTop: "auto" } }, meter));
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(KitCol, null, hero, meter, scale),
        line.length > 1 ? kitSpark(line, { domain: [0, 100], levels: [50], h: 3.8 }) : null,
      );
    }
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, React.createElement(KitSub, null, msg("wd_rsi_scale", "of 100"))),
      line.length > 1 ? kitSpark(line, { domain: [0, 100], levels: [50], h: 6.6 }) : null,
      line.length > 1
        ? kitStats([
            { value: Math.max(...line).toFixed(1), label: msg("wd_highest", "highest") },
            { value: Math.min(...line).toFixed(1), label: msg("wd_lowest", "lowest") },
            { value: `${Math.round((line.filter((v) => v > 50).length / line.length) * 100)}%`, label: msg("wd_rsi_above_half", "time above 50") },
            { value: line.length, label: msg("wd_rsi_points", "readings") },
          ])
        : null,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_rsi_note", "Momentum on a 0–100 scale (RSI 14, Wilder) over the range on screen. Tested on daily closes, high and low readings did not tell what came next.")),
    );
  },

  /* Where this range's own steps land at the next horizons: a counted band. */
  outlook: (out, size, ctx) => {
    const now = ctx.last;
    const far = out.cone.horizons[out.cone.horizons.length - 1];
    const farLabel = out.horizons[out.horizons.length - 1].label;
    const half = now > 0 ? ((far.p95 - far.p5) / 2 / now) * 100 : null;
    const pts = [{ at: 0, lo: now, mid: now, hi: now }].concat(out.horizons.map((h, i) => ({ at: h.bars, lo: out.cone.horizons[i].p5, mid: out.cone.horizons[i].p50, hi: out.cone.horizons[i].p95 })));
    if (size === "s") {
      return React.createElement(
        KitWrap,
        null,
        React.createElement(KitHero, { size }, ...kitFigure(half != null ? `±${half.toFixed(1)}%` : "—", farLabel)),
        React.createElement(KitSub, null, msg("wd_outlook_band_short", "5–95% band")),
        React.createElement("div", { style: { marginTop: "auto" } }, kitCone(pts, { h: 1.9 })),
      );
    }
    const band = React.createElement(KitSub, null, React.createElement("b", null, ctx.price(far.p5)), " – ", React.createElement("b", null, ctx.price(far.p95)));
    if (size === "m") {
      return React.createElement(
        KitSplit,
        null,
        React.createElement(KitCol, null, React.createElement(KitHero, { size }, ...kitFigure(half != null ? `±${half.toFixed(1)}%` : "—", farLabel)), band, React.createElement(KitSub, null, msg("wd_outlook_band", "5th–95th of replays"))),
        React.createElement(KitCol, null, kitCone(pts, { h: 3.8 }), React.createElement(KitScale, null, React.createElement("span", null, msg("wd_now", "now")), React.createElement("span", null, farLabel))),
      );
    }
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, React.createElement(KitHero, { size }, ...kitFigure(half != null ? `±${half.toFixed(1)}%` : "—", farLabel)), band),
      kitCone(pts, { h: 6 }),
      React.createElement(KitScale, null, React.createElement("span", null, msg("wd_now", "now")), ...out.horizons.map((h) => React.createElement("span", { key: h.label }, h.label))),
      ...out.horizons.map((h, i) => {
        const q = out.cone.horizons[i];
        return React.createElement(
          KitSub,
          { key: h.label, "data-widget-outlook": h.label },
          React.createElement("b", null, h.label),
          " ",
          msg("widget_outlook_line", "median $1 · $2% of $3 above", ctx.price(q.p50), String(Math.round((100 * q.up) / q.n)), String(q.n)),
        );
      }),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("widget_outlook_how", "5th–95th of $1 replays of this range's own steps · a count, not a call", String(out.cone.n))),
    );
  },

  /* Bybit's accounts: the share long now, and a month of it by day. */
  longShortRatio: (d, size, ctx) => {
    const long = parseFloat(d.longPct);
    const short = parseFloat(d.shortPct);
    const month = Array.isArray(ctx.month) ? ctx.month : [];
    const values = month.map((r) => r.value);
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, ...kitFigure(`${long.toFixed(1)}%`, msg("wd_long_word", "long")));
    const split = React.createElement(
      "div",
      null,
      React.createElement(KitSvg, { viewBox: "0 0 100 6", preserveAspectRatio: "none", h: 0.7, "aria-hidden": "true", "data-kit": "split" },
        React.createElement("rect", { className: "kit-up", x: 0, y: 0, width: Math.max(0, long - 0.6), height: 6, rx: 1 }),
        React.createElement("rect", { className: "kit-down", x: long + 0.6, y: 0, width: Math.max(0, short - 0.6), height: 6, rx: 1 })),
      React.createElement(KitScale, null, React.createElement("span", null, size === "l" ? msg("wd_long_pct", "$1% long", long.toFixed(1)) : `${long.toFixed(1)}%`), React.createElement("span", null, size === "l" ? msg("wd_short_pct", "$1% short", short.toFixed(1)) : `${short.toFixed(1)}%`)),
    );
    const sub = React.createElement(KitSub, null, size === "l" ? msg("wd_accounts", "of accounts, not of money") : msg("wd_accounts_short", "of accounts"));
    if (size === "s") return React.createElement(KitWrap, null, hero, sub, React.createElement("div", { style: { marginTop: "auto" } }, split));
    const line = values.length > 1 ? kitSpark(values, { levels: [50], h: size === "l" ? 5.4 : 3.2 }) : null;
    const scale = month.length > 1 ? React.createElement(KitScale, null, React.createElement("span", null, kitDay(month[0].t)), size === "l" ? React.createElement("span", null, msg("wd_long_share_line", "long share, daily")) : null, React.createElement("span", null, kitDay(month[month.length - 1].t))) : null;
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, sub, split), React.createElement(KitCol, null, line, scale));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, sub),
      split,
      line,
      scale,
      values.length
        ? kitStats([
            { value: `${Math.min(...values).toFixed(1)}%`, label: msg("wd_month_low", "month's low") },
            { value: `${Math.max(...values).toFixed(1)}%`, label: msg("wd_month_high", "month's high") },
          ])
        : null,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_ls_note", "Of Bybit's accounts holding the $1 perpetual, the share long and short — counted by account, not by size.", ctx.coin)),
    );
  },

  /* What is open on the perpetual now (OKX), and a month of it in the coin (Bybit). */
  openInterest: (d, size, ctx) => {
    const month = Array.isArray(ctx.month) ? ctx.month : [];
    const values = month.map((r) => r.value);
    const change = values.length > 1 && values[0] > 0 ? ((values[values.length - 1] / values[0]) - 1) * 100 : null;
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, d.formatted);
    const sub = React.createElement(KitSub, null, size === "l" ? msg("wd_oi_okx", "OKX perpetual, in dollars") : msg("wd_oi_okx_short", "OKX perpetual"));
    const changeLine = change != null ? React.createElement(KitSub, null, React.createElement(KitTone, { tone: null }, `${signedFixed(change, 1)}%`), " ", size === "l" ? msg("wd_in_month_coins", "in a month, in $1", ctx.coin) : msg("wd_in_month", "in a month")) : null;
    if (size === "s") return React.createElement(KitWrap, null, hero, sub, values.length > 1 ? React.createElement("div", { style: { marginTop: "auto" } }, kitSpark(values, { h: 1.9 })) : null);
    const chart = values.length > 1 ? kitSpark(values, { area: true, h: size === "l" ? 5.6 : 3.4 }) : null;
    const scale = month.length > 1 ? React.createElement(KitScale, null, React.createElement("span", null, kitDay(month[0].t)), React.createElement("span", null, kitDay(month[month.length - 1].t))) : null;
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, sub, changeLine), React.createElement(KitCol, null, chart, scale));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, sub, changeLine),
      chart,
      scale,
      values.length
        ? kitStats([
            { value: `${localeNumber(Math.round(values[values.length - 1]))} ${ctx.coin}`, label: msg("wd_open_bybit", "open on Bybit") },
            { value: `${localeNumber(Math.round(Math.max(...values)))} ${ctx.coin}`, label: msg("wd_month_high", "month's high") },
          ])
        : null,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_oi_note", "The value of perpetual contracts still open — a size, not a side. OKX now; Bybit's daily count in the coin for the month.")),
    );
  },

  /* Forced closes in the last day: how much, which side, the largest prints. */
  liquidations: (d, size, ctx) => {
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, d.totalFormatted);
    const longPct = Math.max(0, Math.min(100, Number(d.longPct) || 0));
    const split = React.createElement(
      "div",
      null,
      React.createElement(KitSvg, { viewBox: "0 0 100 6", preserveAspectRatio: "none", h: 0.7, "aria-hidden": "true", "data-kit": "split" },
        React.createElement("rect", { className: "kit-down", x: 0, y: 0, width: Math.max(0, longPct - 0.6), height: 6, rx: 1 }),
        React.createElement("rect", { className: "kit-up", x: longPct + 0.6, y: 0, width: Math.max(0, 100 - longPct - 0.6), height: 6, rx: 1 })),
      React.createElement(KitScale, null, React.createElement("span", null, size === "l" ? msg("wd_longs_closed", "longs $1", d.longFormatted) : `L ${d.longFormatted}`), React.createElement("span", null, size === "l" ? msg("wd_shorts_closed", "shorts $1", d.shortFormatted) : `S ${d.shortFormatted}`)),
    );
    const sub = React.createElement(KitSub, null, size === "l" ? msg("wd_liq_day", "forced closes, 24h · OKX") : msg("wd_liq_day_short", "24h · OKX"));
    if (size === "s") return React.createElement(KitWrap, null, hero, sub, React.createElement("div", { style: { marginTop: "auto" } }, split));
    const prints = Array.isArray(d.prints) ? d.prints : [];
    const list = (n) =>
      kitBars(
        prints.slice(0, n).map((p, i) => ({
          label: localeDate(p.t, { hour: "2-digit", minute: "2-digit", hour12: false }),
          value: p.value,
          text: n > 3 ? `${formatWidgetUsd(p.value)} · ${ctx.price(p.price)}` : formatWidgetUsd(p.value),
          tone: p.side === "long" ? "down" : "up",
          key: i,
        })),
        { label: "3.4em" },
      );
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, sub, split), React.createElement(KitCol, { style: { gap: "0.45em" } }, ...list(3)));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, sub),
      split,
      prints.length ? React.createElement(KitScale, { style: { marginTop: "0.4em" } }, React.createElement("span", null, msg("wd_largest_prints", "largest forced closes · size · price"))) : null,
      React.createElement(KitCol, { style: { gap: "0.45em" } }, ...list(4)),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_liq_note", "Positions the venue closed because their margin ran out, last 24 hours on OKX: a long closed is a sale into the market, a short closed a purchase.")),
    );
  },

  /* What the card has always measured, said plainly: BTC's share of the
     market, read on a 65%-to-40% scale. */
  altcoinSeason: (d, size) => {
    const dom = parseFloat(d.btcDom);
    const hero = React.createElement(KitHero, { size, "data-wd-hero": "1" }, ...kitFigure(d.index, "/ 100"));
    const sub = React.createElement(KitSub, null, msg("wd_alt_from_dom", "BTC holds $1% of the market", dom.toFixed(1)));
    const scale = React.createElement(
      "div",
      null,
      React.createElement(KitTrack, null, React.createElement("i", { style: { width: `${Math.max(2, d.index)}%` } })),
      React.createElement(KitScale, null, React.createElement("span", null, msg("wd_alt_btc_end", "BTC 65%+")), React.createElement("span", null, msg("wd_alt_alt_end", "BTC 40%−"))),
    );
    if (size === "s") return React.createElement(KitWrap, null, hero, React.createElement(KitSub, null, d.label), React.createElement("div", { style: { marginTop: "auto" } }, scale));
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, React.createElement(KitSub, null, d.label), React.createElement(KitSub, null, msg("wd_btc_dom_short", "BTC $1%", dom.toFixed(1)))), scale);
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, React.createElement(KitSub, null, d.label), sub),
      React.createElement("div", { style: { margin: "0.6em 0" } }, scale),
      kitStats([
        { value: `${dom.toFixed(1)}%`, label: msg("wd_btc_share", "BTC's share") },
        { value: `${(100 - dom).toFixed(1)}%`, label: msg("wd_rest_share", "everything else") },
      ]),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_alt_note", "Not a separate measurement: bitcoin's share of the whole market (Coinlore), placed on a scale where 65% or more reads 0 and 40% or less reads 100. The season words are named at 25 and 75.")),
    );
  },

  /* The model's next completed hour, small: the 80% band as a spread and a
     bar with the close it started from. The large card keeps every line. */
  modelOutlook: (f, size, ctx) => {
    const half = f.s0 > 0 ? ((f.hi - f.lo) / 2 / f.s0) * 100 : null;
    const hero = React.createElement(KitHero, { size, "data-model-outlook": "band" }, ...kitFigure(half != null ? `±${half.toFixed(2)}%` : "—", size === "s" ? "" : ctx.hhmm(f.target)));
    const lo = Math.min(f.lo, f.s0);
    const hi = Math.max(f.hi, f.s0);
    const at = (v) => ((v - lo) / (hi - lo || 1)) * 100;
    const bar = React.createElement(
      "div",
      null,
      React.createElement(
        KitSvg,
        { viewBox: "0 0 100 10", preserveAspectRatio: "none", h: 0.9, "aria-hidden": "true", "data-kit": "band" },
        React.createElement("rect", { x: at(f.lo), width: Math.max(1, at(f.hi) - at(f.lo)), y: 2, height: 6, rx: 3, fill: "currentColor", opacity: 0.25 }),
        React.createElement("line", { x1: at(f.median), x2: at(f.median), y1: 0, y2: 10, stroke: "currentColor", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" }),
      ),
      React.createElement(KitScale, null, React.createElement("span", null, ctx.usd(f.lo)), React.createElement("span", null, ctx.usd(f.hi))),
    );
    const sub = React.createElement(KitSub, { "data-model-outlook": "median" }, msg("mo_median", "median"), " ", React.createElement("b", null, ctx.usd(f.median)));
    if (size === "s") return React.createElement(KitWrap, null, hero, React.createElement(KitSub, null, msg("wd_mo_band", "80% band, $1", ctx.hhmm(f.target))), React.createElement("div", { style: { marginTop: "auto" } }, bar));
    return React.createElement(
      KitSplit,
      null,
      React.createElement(KitCol, null, hero, sub, f.targetPrice > 0 ? React.createElement(KitSub, { "data-model-outlook": "target" }, msg("mo_target_line", "close above $1: $2", ctx.usd(f.targetPrice), ctx.pct(f.pAbove))) : null),
      React.createElement(KitCol, null, bar, React.createElement(KitSub, { "data-model-outlook": "tested", wrap: true }, msg("wd_mo_tested", "held $1% of $2 hours when tested", (ctx.ev.coverage80 * 100).toFixed(1), localeNumber(ctx.ev.n)))),
    );
  },

  /* Today's state over twenty days, and where it has gone from here. The
     medium card is the full 3×3 (the app's own); this is the small one and
     the large card's picture. */
  regimes: (g, size, ctx) => {
    const now = g.now;
    const hero = React.createElement(KitHero, { size, "data-widget-regime-now": now == null ? "none" : String(now) }, now == null ? "—" : ctx.names[now]);
    const since = now == null ? null : React.createElement(KitSub, null, msg("wd_regime_since", "for $1 days", String(g.since)));
    if (size === "s") return React.createElement(KitWrap, null, hero, since, React.createElement(KitSub, { style: { marginTop: "auto" } }, msg("wd_regime_count", "$1 entries", String(now == null ? 0 : g.rows[now].n))));
    const row = now == null ? null : g.rows[now];
    // Medium: today's row drawn against any day (large is the full 3×3)
    return React.createElement(
      KitSplit,
      null,
      React.createElement(KitCol, null, hero, since),
      row && row.n
        ? React.createElement(
            KitCol,
            { style: { gap: "0.4em" } },
            React.createElement(KitScale, null, React.createElement("span", null, msg("wd_regime_after_short", "20 days later · any day"))),
            ...row.cells.map((k, j) =>
              React.createElement(
                KitBarRow,
                { key: j, label: "3.6em" },
                React.createElement("b", null, ctx.short[j]),
                React.createElement(KitTrack, null, React.createElement("i", { style: { width: `${Math.max(2, (k / row.n) * 100)}%` } })),
                React.createElement("span", null, `${Math.round((k / row.n) * 100)}% · ${g.base[j] == null ? "—" : Math.round(g.base[j] * 100) + "%"}`),
              ),
            ),
          )
        : null,
    );
  },

  /* Options on Bybit: max pain at the nearest expiry, calls against puts,
     the implied volatility at the money, and open interest by strike. */
  options: (d, size, ctx) => {
    const hero = React.createElement(KitHero, { size }, d.maxPain != null ? localeNumber(Math.round(d.maxPain)) : "—");
    const expiry = d.expiry ? localeDate(new Date(d.expiry), { month: "short", day: "numeric" }) : "";
    const sub = React.createElement(KitSub, null, msg("wd_max_pain_on", "max pain · $1", expiry));
    const pc = [msg("widget_options_pc", "P/C"), " ", React.createElement("b", { key: "pc" }, d.putCall != null ? d.putCall.toFixed(2) : "—")];
    const iv = [msg("widget_options_iv", "ATM IV"), " ", React.createElement("b", { key: "iv" }, d.atmIv != null ? `${Math.round(d.atmIv * 100)}%` : "—")];
    const facts = React.createElement(KitSub, null, ...pc, " · ", ...iv);
    const other = d.base !== ctx.coin ? React.createElement(KitSub, { wrap: true }, msg("widget_options_other", "Bybit lists options on BTC, ETH and SOL")) : null;
    if (size === "s") return React.createElement(KitWrap, null, hero, sub, React.createElement(KitSub, { style: { marginTop: "auto" } }, ...pc));
    const calls = d.calls || 0;
    const puts = d.puts || 0;
    const ratio = calls + puts > 0 ? calls / (calls + puts) : null;
    const split = ratio == null ? null : React.createElement(
      "div",
      null,
      kitStack([{ share: ratio }, { share: 1 - ratio }], { whole: 1 }),
      React.createElement(KitScale, null, React.createElement("span", null, msg("wd_calls_pct", "calls $1%", Math.round(ratio * 100))), React.createElement("span", null, msg("wd_puts_pct", "puts $1%", Math.round((1 - ratio) * 100)))),
    );
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, sub, other), React.createElement(KitCol, null, React.createElement(KitSub, null, ...pc), React.createElement(KitSub, null, ...iv), split));
    const book = Array.isArray(d.book) ? d.book : [];
    const max = Math.max(...book.map((b) => Math.max(b.calls, b.puts)), 0);
    const W = 100;
    const H = 40;
    const w = book.length ? W / book.length : 0;
    const chart = book.length && max > 0
      ? React.createElement(
          KitSvg,
          { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", h: 4.6, "aria-hidden": "true", "data-kit": "strikes" },
          ...book.map((b, i) => [
            React.createElement("rect", { key: `c${i}`, x: i * w + w * 0.12, width: w * 0.36, y: H - (b.calls / max) * H, height: (b.calls / max) * H, fill: "currentColor", opacity: 0.85 }),
            React.createElement("rect", { key: `p${i}`, x: i * w + w * 0.52, width: w * 0.36, y: H - (b.puts / max) * H, height: (b.puts / max) * H, fill: "currentColor", opacity: 0.35 }),
            b.strike === d.maxPain ? React.createElement("line", { key: `m${i}`, className: "kit-rule", x1: i * w + w / 2, x2: i * w + w / 2, y1: 0, y2: H, strokeDasharray: "2 2", vectorEffect: "non-scaling-stroke" }) : null,
          ]).flat(),
        )
      : null;
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, sub, facts),
      chart,
      book.length ? React.createElement(KitScale, null, React.createElement("span", null, localeNumber(book[0].strike)), React.createElement("span", null, msg("wd_strikes_line", "calls dark · puts light")), React.createElement("span", null, localeNumber(book[book.length - 1].strike))) : null,
      split,
      other,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_options_note", "From Bybit's options: max pain is the strike where holders would collect least at the nearest expiry; puts against calls and the at-the-money volatility are what is open now.")),
    );
  },

  /* Funding across every perpetual this app charts (Bybit): how many pay
     which way, the spread of rates, the ends. */
  fundingBoard: (b, size) => {
    const pct = (r) => `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(4)}%`;
    const hero = size === "l"
      ? React.createElement(KitHero, { size }, ...kitFigure(msg("al_x_of_y", "$1 of $2", b.positive, b.n), msg("wd_positive_word", "positive")))
      : React.createElement(KitHero, { size }, ...kitFigure(`${b.positive}/${b.n}`, size === "m" ? msg("wd_positive_word", "positive") : ""));
    const mid = React.createElement(KitSub, null, msg("widget_funding_board_mid", "median"), " ", React.createElement("b", null, pct(b.median)));
    if (size === "s") return React.createElement(KitWrap, null, hero, mid, React.createElement("div", { style: { marginTop: "auto" } }, kitStack([{ share: b.positive }, { share: b.n - b.positive }], { whole: b.n })));
    const rates = Array.isArray(b.rates) ? b.rates.map((r) => r * 100) : [];
    const chart = rates.length ? kitColumns(rates, { invert: true, h: size === "l" ? 5 : 3.4 }) : null;
    const ends = React.createElement(KitScale, null, React.createElement("span", null, `${b.low.coin} ${pct(b.low.funding)}`), React.createElement("span", null, `${b.high.coin} ${pct(b.high.funding)}`));
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, mid), React.createElement(KitCol, null, chart, ends));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, mid),
      chart,
      ends,
      kitStats([
        { value: String(b.positive), label: msg("wd_longs_paying", "longs paying") },
        { value: String(b.negative), label: msg("wd_shorts_paying", "shorts paying") },
      ]),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_board_note", "Every perpetual this app charts on Bybit, sorted from the lowest rate to the highest — above zero, longs pay shorts.")),
    );
  },

  /* Where the open contracts are on Bybit: the total and the largest. */
  oiLeaders: (b, size) => {
    const hero = React.createElement(KitHero, { size }, formatWidgetUsd(b.totalOi));
    const sub = React.createElement(KitSub, null, msg("wd_oi_total", "$1 perpetuals", String(b.n)));
    const list = (n) => kitBars((b.topEight || b.top).slice(0, n).map((r) => ({ label: r.coin, value: r.oi, text: `${formatWidgetUsd(r.oi)} · ${Math.round((r.oi / b.totalOi) * 100)}%` })), { label: "3.4em" });
    if (size === "s") return React.createElement(KitWrap, null, hero, sub, React.createElement(KitSub, { style: { marginTop: "auto" } }, React.createElement("b", null, b.top[0].coin), " ", `${Math.round((b.top[0].oi / b.totalOi) * 100)}%`));
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, sub), React.createElement(KitCol, { style: { gap: "0.45em" } }, ...list(3)));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, sub),
      React.createElement(KitCol, { style: { gap: "0.45em", marginTop: "0.4em" } }, ...list(7)),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_oi_leaders_note", "The value of open perpetual contracts on Bybit, the largest eight and their share of the total.")),
    );
  },

  /* The dollar stablecoins: how much there is, and who holds the most. */
  stablecoins: (d, size) => {
    const hero = React.createElement(KitHero, { size }, formatWidgetUsd(d.cap));
    const share = d.share != null ? React.createElement(KitSub, null, size === "s" ? msg("wd_of_market_short", "$1% of all", (d.share * 100).toFixed(1)) : msg("widget_stablecoins_share", "$1% of the market", (d.share * 100).toFixed(1))) : null;
    const parts = Array.isArray(d.parts) ? d.parts : d.top;
    if (size === "s") return React.createElement(KitWrap, null, hero, share, React.createElement("div", { style: { marginTop: "auto" } }, kitStack(parts.map((p) => ({ share: p.cap })), { whole: d.cap }), React.createElement(KitScale, null, ...parts.slice(0, 2).map((p) => React.createElement("span", { key: p.coin }, `${p.coin} ${Math.round((p.cap / d.cap) * 100)}%`)))));
    const bars = (n) => kitBars(parts.slice(0, n).map((p) => ({ label: p.coin, value: p.cap, text: `${Math.round((p.cap / d.cap) * 100)}%` })), { max: d.cap, label: "3.4em" });
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, share), React.createElement(KitCol, { style: { gap: "0.45em" } }, ...bars(3)));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, share),
      React.createElement(KitCol, { style: { gap: "0.45em", marginTop: "0.4em" } }, ...kitBars(parts.map((p) => ({ label: p.coin, value: p.cap, text: `${formatWidgetUsd(p.cap)} · ${Math.round((p.cap / d.cap) * 100)}%` })), { max: d.cap, label: "3.6em" })),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_stable_note", "The dollar stablecoins among the top 100 by market value, from Coinlore — their total, its share of the market, and the largest.")),
    );
  },

  /* Ether priced in bitcoin: now, the day, and three months by day. */
  ethBtc: (d, size, ctx) => {
    const tone = d.change == null ? null : d.change > 0 ? "up" : d.change < 0 ? "down" : null;
    const hero = React.createElement(KitHero, { size }, d.ratio.toFixed(5));
    const day = d.change != null ? React.createElement(KitSub, null, React.createElement(KitTone, { tone }, `${signedFixed(d.change, 2)}%`), " ", msg("wd_in_24h", "in 24h")) : null;
    const month = Array.isArray(ctx.month) ? ctx.month : [];
    const values = month.map((r) => r.value);
    if (size === "s") return React.createElement(KitWrap, null, hero, day, React.createElement(KitSub, { style: { marginTop: "auto" } }, msg("wd_btc_per_eth", "BTC for one ETH")));
    const chart = values.length > 1 ? kitSpark(values, { area: true, h: size === "l" ? 5.6 : 3.6 }) : null;
    const scale = month.length > 1 ? React.createElement(KitScale, null, React.createElement("span", null, kitDay(month[0].t)), React.createElement("span", null, kitDay(month[month.length - 1].t))) : null;
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, day, React.createElement(KitSub, null, msg("wd_btc_per_eth", "BTC for one ETH"))), React.createElement(KitCol, null, chart, scale));
    const first = values[0];
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, day),
      chart,
      scale,
      values.length
        ? kitStats([
            { value: `${signedFixed(((values[values.length - 1] / first) - 1) * 100, 1)}%`, label: msg("wd_three_months", "3 months") },
            { value: `${Math.min(...values).toFixed(5)}–${Math.max(...values).toFixed(5)}`, label: msg("wd_range_word", "range") },
          ])
        : null,
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_ethbtc_note", "How much bitcoin one ether buys — the day from the price snapshot, the months from Coinbase Exchange's ETH-BTC book.")),
    );
  },

  /* The US releases the chart marks, soonest first, from the bundled calendar. */
  macroCalendar: (list, size, ctx) => {
    const first = list[0];
    const when = (t) => localeDate(new Date(t), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    const hero = React.createElement(KitHero, { size }, ctx.names[first.kind] || first.kind);
    if (size === "s") return React.createElement(KitWrap, null, hero, React.createElement(KitSub, null, describeAhead(first.t - Date.now())), React.createElement(KitSub, { style: { marginTop: "auto" } }, when(first.t)));
    const rows = (n) =>
      list.slice(0, n).map((r) =>
        React.createElement(
          KitBarRow,
          { key: `${r.kind}-${r.t}`, label: "3.4em", style: { gridTemplateColumns: "3.4em minmax(0, 1fr) auto" } },
          React.createElement("b", null, ctx.names[r.kind] || r.kind),
          React.createElement("span", null, when(r.t)),
          React.createElement("span", null, describeAhead(r.t - Date.now())),
        ),
      );
    if (size === "m") return React.createElement(KitCol, { style: { gap: "0.55em" } }, ...rows(3));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, { style: { gap: "0.6em" } }, ...rows(8)),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, ctx.note),
    );
  },

  /* Money into and out of the US spot bitcoin ETFs, the last day and twenty. */
  etfFlows: (e, size) => {
    const usd = (v) => `${v >= 0 ? "+" : "−"}${formatWidgetUsd(Math.abs(v))}`;
    const day = localeDate(new Date(`${e.date}T12:00:00Z`), { month: "short", day: "numeric" });
    const hero = React.createElement(KitHero, { size, tone: e.net >= 0 ? "up" : "down" }, usd(e.net));
    const sub = React.createElement(KitSub, null, size === "l" ? msg("wd_etf_day", "$1 · net, US spot funds", day) : msg("wd_etf_day_short", "$1, net", day));
    const daily = Array.isArray(e.daily) ? e.daily : [];
    if (size === "s") return React.createElement(KitWrap, null, hero, sub, daily.length > 1 ? React.createElement("div", { style: { marginTop: "auto" } }, kitColumns(daily.slice(-10).map((d) => d.net), { h: 1.8 })) : null);
    const chart = daily.length > 1 ? kitColumns(daily.map((d) => d.net), { h: size === "l" ? 5 : 3.4 }) : null;
    const scale = daily.length > 1 ? React.createElement(KitScale, null, React.createElement("span", null, localeDate(new Date(`${daily[0].date}T12:00:00Z`), { month: "short", day: "numeric" })), React.createElement("span", null, msg("wd_trading_days", "$1 trading days", daily.length)), React.createElement("span", null, day)) : null;
    if (size === "m") return React.createElement(KitSplit, null, React.createElement(KitCol, null, hero, sub, React.createElement(KitSub, null, msg("widget_etf_5d", "5d"), " ", React.createElement("b", null, usd(e.week)))), React.createElement(KitCol, null, chart, scale));
    return React.createElement(
      KitWrap,
      null,
      React.createElement(KitCol, null, hero, sub),
      chart,
      scale,
      kitStats([
        { value: usd(e.week), label: msg("wd_five_days", "five days"), tone: e.week >= 0 ? "up" : "down" },
        { value: usd(e.month), label: msg("wd_twenty_days", "twenty days"), tone: e.month >= 0 ? "up" : "down" },
        e.topIn && { value: `${e.topIn[0]} ${usd(e.topIn[1])}`, label: msg("wd_most_in", "most in") },
        e.topOut && { value: `${e.topOut[0]} ${usd(e.topOut[1])}`, label: msg("wd_most_out", "most out") },
      ]),
      React.createElement(KitNote, { "data-widget-footnote": "1" }, msg("wd_etf_note", "What went into and out of the US spot bitcoin ETFs each trading day — TFTC's record of SoSoValue and Farside.")),
    );
  },
};

/* RSI 14 along the series, with `calculateRSI`'s sampling and smoothing, so
   its last value is the card's figure. */
const wdRsiSeries = (valueHistory, period = 14) => {
  if (!Array.isArray(valueHistory) || valueHistory.length < period + 1) return [];
  const step = valueHistory.length > 50 ? Math.floor(valueHistory.length / 50) : 1;
  const prices = valueHistory.filter((_, i) => i % step === 0).map((d) => Number(d.price));
  if (prices.length < period + 1) return [];
  const ch = [];
  for (let i = 1; i < prices.length; i++) ch.push(prices[i] - prices[i - 1]);
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < period; i++) {
    if (ch[i] > 0) gain += ch[i];
    else loss -= ch[i];
  }
  gain /= period;
  loss /= period;
  const out = [];
  const rsi = () => (loss === 0 ? 100 : Math.round((100 - 100 / (1 + gain / loss)) * 10) / 10);
  out.push(rsi());
  for (let i = period; i < ch.length; i++) {
    gain = (gain * (period - 1) + (ch[i] > 0 ? ch[i] : 0)) / period;
    loss = (loss * (period - 1) + (ch[i] < 0 ? -ch[i] : 0)) / period;
    out.push(rsi());
  }
  return out;
};
