/* Retrospective displays of the daily history. No detector, forecast or fetch.
 * Paths use complete, consecutive windows and a fixed n at every step; the
 * pointwise spread is descriptive, not a confidence or prediction interval. */
const baseHistoryPaths = (candles, entries, days = 30) => {
  const paths = [];
  for (const i of entries) {
    if (!Number.isInteger(i) || i < 0 || i + days >= candles.length) continue;
    const window = candles.slice(i, i + days + 1);
    if (window.some((c, j) => !(c.close > 0) || !Number.isFinite(c.t) || (j && c.t - window[j - 1].t !== 86400))) continue;
    paths.push({ t: window[0].t, values: window.map((c) => (c.close / window[0].close - 1) * 100) });
  }
  if (paths.length < BASE_RATE_MIN_EPISODES) return { n: paths.length, paths, points: [] };
  const quantile = (xs, p) => {
    const k = (xs.length - 1) * p;
    const i = Math.floor(k);
    return xs[i] + (xs[Math.ceil(k)] - xs[i]) * (k - i);
  };
  const points = Array.from({ length: days + 1 }, (_, d) => {
    const xs = paths.map((p) => p.values[d]).sort((a, b) => a - b);
    return { day: d, mean: xs.reduce((a, b) => a + b, 0) / xs.length, median: quantile(xs, 0.5), lo: quantile(xs, 0.1), hi: quantile(xs, 0.9) };
  });
  return { n: paths.length, paths, points };
};

/* A single inventory feeds the live selector, the Library controls, cache
 * comparisons and CSV, so each names the same item and counts its entries. */
const baseHistoryItems = (panel, readings) => {
  if (panel._historyItems && panel._historyItems.readings === readings) return panel._historyItems.items;
  const horizon = panel.state.horizon;
  const items = readings.rows.concat(readings.patterns).map((row) => ({
    ...row, key: row.id, entries: row.entries,
    records: row.byHorizon.map((h) => ({ days: h.days, result: h.result })),
  }));
  for (const def of COMPANION_SETUP_DEFS) {
    const states = readings.setups[def.id] || readings.readingStates[def.id] || [];
    const entries = strategySetupEntries(states);
    const ago = entries.length ? states.length - 1 - entries[entries.length - 1] : Infinity;
    const days = horizon || def.horizon || (def.kind === "move" ? SETUP_MOVE_HORIZON : SETUP_HORIZON);
    const move = def.kind === "move";
    const m = move ? moveRateFor(readings.closes, states, days) : null;
    const result = move ? m && { n: m.n, k: m.bigger, up: m.n ? m.bigger / m.n * 100 : null, baseUp: 50, baseN: baseRateBaseline(readings.closes, days).n } : baseRateFor(readings.closes, states, (v) => v, days);
    items.push({ key: `s-${def.id}`, title: def.title, entries, live: ago < (def.recentDays || SETUP_HORIZON), def, move, records: [{ days, result }] });
  }
  for (const def of COMPANION_PATTERN_DEFS) {
    const mine = readings.shapes.concat(readings.swing).filter((e) => e.kind === def.id);
    const rec = pricePatternRecord(mine, def.id);
    items.push({ key: `p-${def.id}`, title: def.title, live: Boolean(mine.length && mine[mine.length - 1].out === "pending"),
      entries: mine.map((e) => panel.state.candles.findIndex((c) => c.t === e.at)).filter((i) => i >= 0),
      def, shape: true, records: [{ days: PRICE_PATTERN_WALK, result: { n: rec.resolved, k: rec.targetFirst, up: rec.resolved ? rec.targetFirst / rec.resolved * 100 : null, baseUp: null, baseN: null } }],
    });
  }
  panel._historyItems = { readings, items };
  return items;
};

const baseHistoryCsv = (coin, items) => {
  const rows = [["coin", "item", "outcome", "horizon_days", "n", "n_eff", "k", "rate", "base_n", "base_rate", "wilson95_lo", "wilson95_hi"]];
  for (const item of items) for (const { days, result: r } of item.records) {
    if (!r) continue;
    const k = r.k == null ? Math.round((r.up || 0) * r.n / 100) : r.k;
    const enough = r.n >= BASE_RATE_MIN_EPISODES;
    // The interval on what overlapping episodes are worth, as the screen draws it
    const nEff = Number.isFinite(r.nEff) ? r.nEff : r.n;
    const interval = enough ? (nEff < r.n - 0.5 ? wilsonShare(k / r.n, Math.max(1, nEff)) : wilsonInterval(k, r.n)) : null;
    rows.push([coin, item.title, item.shape ? "target_first" : item.move ? "larger_move" : "up", days, r.n, Number(nEff.toFixed(2)), k, enough ? k / r.n : "", r.baseN, enough && r.baseUp != null ? r.baseUp / 100 : "", interval && interval.lo, interval && interval.hi]);
  }
  // Formula prefixes in translated or user-supplied labels stay plain text.
  const cell = (v) => '"' + String(v == null ? "" : v).replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
};

const baseHistoryGeometry = (series, width = 600, height = 180) => {
  const values = series.flat().filter(Number.isFinite);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = (hi - lo || 1) * 0.08;
  const y = (v) => 8 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (height - 32);
  const x = (i, n) => 44 + i / Math.max(1, n - 1) * (width - 54);
  const line = (xs) => xs.map((v, i) => `${i ? "L" : "M"}${x(i, xs.length).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return { x, y, line, lo, hi };
};

const baseHistorySvg = (self, base, label) => {
  const all = [self, base];
  const g = baseHistoryGeometry(all.flatMap((s) => s.points.map((p) => [p.lo, p.hi])));
  const paths = all.flatMap((s, i) => {
    const points = s.points;
    const upper = points.map((p, d) => `${g.x(d, points.length)},${g.y(p.hi)}`);
    const lower = points.map((p, d) => `${g.x(d, points.length)},${g.y(p.lo)}`).reverse();
    return [
      React.createElement("polygon", { key: `${i}-band`, points: upper.concat(lower).join(" "), fill: "currentColor", opacity: i ? 0.04 : 0.1 }),
      ...["mean", "median"].map((key) => React.createElement("path", { key: `${i}-${key}`, "data-base-path": `${i ? "base" : "self"}-${key}`, d: g.line(points.map((p) => p[key])), fill: "none", stroke: "currentColor", strokeWidth: key === "median" ? 2 : 1, strokeDasharray: key === "mean" ? "5 3" : undefined, opacity: i ? 0.4 : 1 })),
    ];
  });
  return React.createElement(BaseHistorySvg, { viewBox: "0 0 600 180", role: "img", "aria-label": label },
    React.createElement("title", null, label),
    React.createElement("line", { x1: 44, x2: 590, y1: g.y(0), y2: g.y(0), stroke: "currentColor", opacity: 0.2 }),
    ...paths,
    ...[g.lo, g.hi].map((v, i) => React.createElement("text", { key: i, x: 1, y: g.y(v), fill: "currentColor", fontSize: 10 }, `${signedFixed(v, 1)}%`)),
    React.createElement("text", { x: 44, y: 177, fill: "currentColor", fontSize: 10 }, "0"),
    React.createElement("text", { x: 580, y: 177, fill: "currentColor", fontSize: 10 }, "30"),
  );
};

const renderBaseHistory = (panel, readings) => {
  const items = baseHistoryItems(panel, readings).filter((it) => it.live);
  if (!items.length) return null;
  const selected = items.find((it) => it.key === panel.state.selected) || items[0];
  const candles = panel.state.candles;
  // Kept by selection and history; unrelated release renders recount nothing.
  // Any day's paths depend on the history alone, so a new selection keeps them.
  const key = selected.key;
  if (!panel._basePaths || panel._basePaths.candles !== candles) {
    panel._basePaths = { candles, base: baseHistoryPaths(candles, candles.map((_, i) => i)) };
  }
  if (!panel._paths || panel._paths.candles !== candles || panel._paths.key !== key) {
    panel._paths = { candles, key, self: baseHistoryPaths(candles, selected.entries) };
  }
  const { self } = panel._paths;
  const { base } = panel._basePaths;
  const caption = msg("br_path_caption", "What followed, not a forecast: next 30 days · after this n=$1; any day n=$2. Solid: median; dashed: mean; shade: middle 80% of past paths. Overlapping windows, not independent trials.", String(self.n), String(base.n));
  const enough = self.points.length && base.points.length;
  const first = candles[0].t;
  const last = candles[candles.length - 1].t;
  const startYear = new Date(first * 1000).getUTCFullYear();
  const endYear = new Date(last * 1000).getUTCFullYear();
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  return React.createElement(BaseHistoryBox, { "data-base-history": selected.key },
    React.createElement("label", null, msg("br_history_item", "Read one live item"),
      React.createElement(BaseHistorySelect, { value: selected.key, "data-base-history-pick": "1", onChange: (e) => panel.setState({ selected: e.target.value }) },
        ...items.map((it) => React.createElement("option", { key: it.key, value: it.key }, it.title)),
      ),
    ),
    enough && React.createElement(BaseDetail, null,
      React.createElement("span", { style: { borderBottom: "2px solid currentColor" } }, msg("br_bar_this", "After this")), " · ",
      React.createElement("span", { style: { opacity: 0.4, borderBottom: "2px solid currentColor" } }, msg("br_bar_base", "Any day")),
    ),
    enough ? baseHistorySvg(self, base, caption) : React.createElement(BaseEmpty, null, msg("br_too_few", "$1 episodes is too few to compare — the difference is not printed.", String(self.n))),
    enough && React.createElement(BaseNote, null, caption),
    React.createElement(BaseSectionLabel, null, msg("br_timeline", "Past episodes · 30-day outcomes")),
    React.createElement(BaseHistorySvg, { viewBox: "0 0 600 72", role: "img", "aria-label": msg("br_timeline_n", "$1 complete episodes on the daily timeline", String(self.n)) },
      ...self.paths.map((p, i) => {
        const x = 20 + (p.t - first) / Math.max(1, last - first) * 560;
        return React.createElement("line", { key: i, "data-base-episode": String(p.t), x1: x, x2: x, y1: 10, y2: 42, stroke: "currentColor", strokeWidth: 2, opacity: 0.25 + (Math.atan(p.values[30] / 10) / Math.PI + 0.5) * 0.75 },
          React.createElement("title", null, `${localeDate(p.t * 1000, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}: ${signedFixed(p.values[30], 1)}%`));
      }),
      ...years.map((year) => {
        const t = Math.max(first, Date.UTC(year, 0, 1) / 1000);
        return React.createElement("text", { key: year, x: 20 + (t - first) / Math.max(1, last - first) * 560, y: 65, fontSize: years.length > 8 ? 9 : 12, fill: "currentColor" }, String(year));
      }),
    ),
    renderBaseAcross(panel, selected),
  );
};

/* Another coin's items, kept by its cached history and the horizon. Counting
 * a coin is ~115 ms on 4,000 days (Node, 17 Oct 2026), and the Now tab is
 * drawn again on every change to the panel, so uncached it recounted each
 * other coin every time. */
const baseAcrossItems = (panel, coin, candles) => {
  const memo = panel._across || (panel._across = new Map());
  const kept = memo.get(coin);
  if (kept && kept.candles === candles && kept.horizon === panel.state.horizon) return kept.items;
  const readings = panel.countReadings(candles);
  const items = readings ? baseHistoryItems({ state: { ...panel.state, candles } }, readings) : [];
  memo.set(coin, { candles, horizon: panel.state.horizon, items });
  return items;
};

const renderBaseAcross = (panel, selected) => React.createElement(BaseHistoryBox, { "data-base-across": selected.key },
  React.createElement(BaseSectionLabel, null, msg("br_across", "Across your coins · cached daily history only")),
  ...(panel.props.coins || [panel.props.coin]).map((coin) => {
    const cached = coin === panel.props.coin ? { t: Date.now(), candles: panel.state.candles } : dailyClosesCache.get(coin);
    let record;
    if (cached && Date.now() - cached.t <= DAILY_CLOSES_TTL) {
      const own = coin === panel.props.coin ? panel.readings() : null;
      const items = coin !== panel.props.coin
        ? baseAcrossItems(panel, coin, cached.candles)
        : own ? baseHistoryItems(panel, own) : [];
      const item = items.find((it) => it.key === selected.key);
      record = item && item.records[0];
    }
    const r = record && record.result;
    const count = !r ? msg("br_cache_missing", "No fresh daily history cached") : r.n < BASE_RATE_MIN_EPISODES
      ? msg("br_n_times", "$1 times", String(r.n)) : selected.shape
        ? msg("cpat_record2", "Reached its measured move before its invalidation on $1 of the $2 that have resolved within 90 days. ", String(r.k), String(r.n))
        : selected.move
          ? msg("ss_move_detail_h", "The next $3 days moved more than an ordinary $3 days of this coin in $1 of $2 episodes — half would, if it meant nothing.", String(r.k), String(r.n), String(record.days))
          : msg("br_bar_up", "up $1% · $2×", r.up.toFixed(0), String(r.n));
    return React.createElement(BaseDetail, { key: coin, "data-base-across-coin": coin }, coin, " · ",
      record ? msg("cp_next_days", "next $1 days", String(record.days)) + " · " : "", count);
  }),
);

const renderBaseSimilar = (panel, readings) => {
  const sim = readings.similar;
  if (!sim) return null;
  const c = panel.state.candles;
  return React.createElement(BaseSimilarGrid, { "data-base-similar-list": "1" },
    ...sim.stretches.slice().sort((a, b) => b.t - a.t).map((s) => {
      const end = c.findIndex((x) => x.t === s.t);
      const window = c.slice(end - ANALOG_WINDOW + 1, end + ANALOG_AHEAD + 1);
      if (window.length !== ANALOG_WINDOW + ANALOG_AHEAD) return null;
      const values = window.map((x) => (x.close / c[end].close - 1) * 100);
      const g = baseHistoryGeometry([values], 240, 100);
      const label = `${localeDate(s.t * 1000, { year: "numeric", month: "short", day: "numeric" })} · ${signedFixed(s.after, 1)}% · n=1`;
      const x = (i) => g.x(i, values.length);
      const path = (from, to) => values.slice(from, to).map((v, j) => `${j ? "L" : "M"}${x(j + from)},${g.y(v)}`).join(" ");
      return React.createElement(BaseHistoryBox, { key: s.t, "data-base-similar-window": String(s.t) },
        React.createElement(BaseDetail, null, label),
        React.createElement(BaseHistorySvg, { viewBox: "0 0 240 100", role: "img", "aria-label": label },
          React.createElement("line", { x1: x(ANALOG_WINDOW - 1), x2: x(ANALOG_WINDOW - 1), y1: 5, y2: 90, stroke: "currentColor", opacity: 0.2, strokeDasharray: "2 3" }),
          React.createElement("path", { d: path(0, ANALOG_WINDOW), fill: "none", stroke: "currentColor", strokeWidth: 1.5 }),
          React.createElement("path", { "data-base-similar-after": "1", d: path(ANALOG_WINDOW - 1, values.length), fill: "none", stroke: "currentColor", opacity: 0.35, strokeWidth: 1.5 }),
        ),
      );
    }),
  );
};

const renderBaseLibraryTools = (panel, readings) => React.createElement(BaseLibraryTools, { "data-base-library-tools": "1" },
  React.createElement(BaseHistoryInput, { type: "search", value: panel.state.query, placeholder: msg("br_search", "Search the library"), "aria-label": msg("br_search", "Search the library"), onChange: (e) => panel.setState({ query: e.target.value }) }),
  React.createElement(BaseHistorySelect, { value: panel.state.sort, "aria-label": msg("po_sort", "Sort"), onChange: (e) => panel.setState({ sort: e.target.value }) },
    React.createElement("option", { value: "default" }, msg("br_order", "Library order")),
    React.createElement("option", { value: "n" }, msg("br_sort_n", "Most episodes")),
    React.createElement("option", { value: "gap" }, msg("br_sort_gap", "Largest gap from any day")),
    React.createElement("option", { value: "live" }, msg("br_sort_live", "Live first")),
  ),
  React.createElement("label", null, React.createElement("input", { type: "checkbox", checked: panel.state.liveOnly, onChange: (e) => panel.setState({ liveOnly: e.target.checked }) }), msg("br_live_only", "Live only")),
  React.createElement(BaseHistorySelect, { "data-base-horizon-pick": "1", value: panel.state.horizon, "aria-label": msg("br_horizon", "Horizon"), onChange: (e) => panel.setState({ horizon: Number(e.target.value) }) },
    React.createElement("option", { value: 0 }, msg("br_original", "Original horizons")),
    ...[1, 3, 7, 30].map((d) => React.createElement("option", { key: d, value: d }, msg("cp_next_days", "next $1 days", String(d)))),
  ),
  React.createElement(BaseChip, { "data-base-csv": "1", onClick: () => downloadTextFile(`base-rates-${panel.props.coin}.csv`, baseHistoryCsv(panel.props.coin, baseHistoryItems(panel, readings)), "text/csv;charset=utf-8") }, msg("br_export_csv", "Export CSV")),
);

const baseLibraryRows = (panel, rows, readings) => {
  const all = baseHistoryItems(panel, readings);
  const item = (el) => all.find((it) => it.key === el.key || `setup-${it.def && it.def.id}` === el.key || `shape-${it.def && it.def.id}` === el.key);
  const list = rows.filter(Boolean).filter((el) => {
    const it = item(el);
    return it && (!panel.state.liveOnly || it.live) && it.title.toLocaleLowerCase().includes(panel.state.query.toLocaleLowerCase().trim());
  });
  // -1 sorts below every real n and gap; -Infinity made two such rows compare NaN.
  const score = (it) => {
    const r = it.records[0] && it.records[0].result;
    if (panel.state.sort === "live") return it.live ? 1 : 0;
    if (!r) return -1;
    if (panel.state.sort === "gap") return r.n >= BASE_RATE_MIN_EPISODES && r.baseUp != null ? Math.abs(r.up - r.baseUp) : -1;
    return r.n;
  };
  if (panel.state.sort !== "default") list.sort((a, b) => score(item(b)) - score(item(a)));
  return list.map((el) => React.cloneElement(el, { "data-base-library-row": item(el).key }));
};
