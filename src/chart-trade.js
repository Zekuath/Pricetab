/* THE TRADE LAYER — contracts, orders, the order being written and the
 * guide, on the chart's own scale (10 Oct 2026)
 *
 * Asked for five times between 17 Sep and 10 Oct: the derivatives page's
 * helper had to be *on the chart* (*"bu yardımcı eşlikçinin grafikte görünür
 * olması çok önemli"*, *"neyi nasıl yapacağımız daha anlaşılabilir
 * olabilirdi"*, *"grafik içi yardımcı istedik"*). Two faint bands were not
 * that. This layer draws what the page knows about this market where the
 * price is read:
 *
 * - **the plan** — the ticket as it stands, before anything is placed: the
 *   entry, a red box to the stop and a green one to the take, the
 *   liquidation, and "+ SL" / "+ TP" handles that drag a level out of the
 *   entry. A drag writes the ticket's field; the pill says the money while
 *   it moves. What to do, and what it would cost, shown where it happens.
 * - **the contracts and the orders** — every line a hand may move is moved
 *   here, through the page's own door (`commitLevelDrag`).
 * - **the fan** — where the price stood across the next bars of the
 *   resampled futures (`practiceFan`); on a level, the share of that
 *   contract's own replays that touched it first (`practiceSimulate`).
 * - **the guide** — the assistant's items, numbered, each at the price or the
 *   time it is about. The legend that lists them is the page's.
 * - **location** along the left edge (the window's volume by price, its POC
 *   and value area), **the clock** (the next funding settlement) and **the
 *   book** (its largest resting levels, at the right edge).
 *
 * Nothing here is computed about the account: the page hands over prices and
 * words (`props.trade`), so the chart cannot disagree with the ticket, the
 * row or the model about a single number. What this file owns is *where* —
 * the plot's own unclamped scale (`plotScale`, the tools'), the pills kept
 * clear of each other along the right edge, and the hit-testing that lets a
 * hand take a line.
 *
 * **One pointer pipeline**, the tools' rule: nothing here listens to the
 * pointer. `ChartView` asks `tradeHitAt` on a press, hands the drag here and
 * tells the page once, on release (`onTradeDrag`, `onTradePress`).
 *
 * The shape handed in, all prices in the chart's units and times in ms:
 *
 *   levels   [{ key, kind, price, ink, label, drag, cancel, from, dash, strong }]
 *            ink "text" | "quiet" | "up" | "down" | "liq" | "plan";
 *            `from` starts the line at that time (the plan starts at now)
 *   boxes    [{ key, lo, hi, ink: "up" | "down", from }]
 *   handles  [{ key, on, text }]  — "+ SL" beside level `on`; dragging it
 *            out is a drag of the level `key`, which does not exist yet
 *   fan      { from, stepMs, start, steps: [{ step, p5, p25, p50, p75, p95 }], label }
 *   marks    [{ n, key, kind, price, lo, hi, t }]  — the guide's numbers
 *   focus    key of the guide item pointed at, or null
 *   profile  { bins: [{ lo, hi, v, inArea }], poc, vah, val, words }
 *   walls    [{ price, side: "bid" | "ask", share }]
 *   times    [{ key, t, label, ahead }]  — `ahead`: the pill at the right
 *            edge when the time is past the window
 *   refs     [{ key, price, word }]  — quiet reference levels (yesterday's
 *            high and low), a dotted line and a word at the left
 *   prints   [{ key, t, price, side, share, text }]  — forced closes: a dot
 *            sized by `share`, its text in the pointer's row when near it
 *   dragText (key, price) => string — the held line's pill
 *   hoverText (price, time) => string | null — the pointer's row; a "\n"
 *            starts a second line
 *
 * Same idiom as `chart-tools.js`: a plain function handed the `LineBase`,
 * attached in its constructor. The pure helpers are tested in
 * `tests/test-trade.js`.
 */

const TRADE_HIT_PX = 6; // how far from a movable line a press still takes it
const TRADE_PILL_H = 18;
const TRADE_PILL_GAP = 3;
const TRADE_PILL_PAD = 6;
const TRADE_FONT = 11;
// Roboto Mono's advance is 0.6 of the size; measured 6.6px at 11px
const TRADE_CHAR = 6.6;
const TRADE_MARK_R = 8;
// The volume profile's widest bar, as a share of the plot
const TRADE_PROFILE_SHARE = 0.16;
// The book's widest wall, as a share of the plot
const TRADE_WALL_SHARE = 0.1;
// The order a pill wins its height in when two want one place
const TRADE_RANK = { drag: 9, entry: 8, stop: 7, take: 7, trail: 6, order: 6, liq: 5, be: 4, planEntry: 6, planStop: 7, planTake: 7, planLiq: 5, orderStop: 3, orderTake: 3 };

const tradePillWidth = (text) => Math.ceil(String(text || "").length * TRADE_CHAR) + TRADE_PILL_PAD * 2;

/* **Where each pill goes along the right edge.** Every level wants the
   height of its own line; two near one price cannot both have it, so the
   more urgent keeps its height and the other moves the least it can
   (`placeLabels`, the axis' own allocator). A level outside the window is
   pinned to the edge it lies beyond. Pure: in rows, out heights by key. */
const tradeLane = (rows, top, bottom) => {
  const items = rows.map((r) => ({
    id: r.key,
    y: r.y < top ? top + TRADE_PILL_H / 2 : r.y > bottom ? bottom - TRADE_PILL_H / 2 : r.y,
    h: TRADE_PILL_H,
    priority: r.rank || 0,
  }));
  return placeLabels(items, top, bottom, TRADE_PILL_GAP);
};

/* Every height a box of the plot can stand at, from `lo` to `hi` in steps of
   six pixels, nearest `want` first — where a readout looks for a place off
   the pills. */
const tradeNearest = (want, lo, hi, reach = Infinity) => {
  const at = Math.max(lo, Math.min(hi, want));
  const ys = [];
  for (let y = lo; y <= hi; y += 6) if (Math.abs(y - at) <= reach) ys.push(y);
  ys.push(at);
  return ys.sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
};
// How far a readout may move from beside the hand to stand off a pill
const TRADE_READOUT_REACH = 72;

/* **Where a readout of w × h stands**: the free place nearest `pref`, off
   every box in `blocks` — up or down within `reach`, along the hand's own
   side as far as the plot goes (`dir` −1 leftwards, 1 rightwards), and only
   when that side has none, the other side from `alt`. Null when nothing is
   free; the caller then keeps `pref`. */
const tradeSpot = ({ pref, alt, dir, w, h, box, blocks, reach }) => {
  const ys = tradeNearest(pref.y, box.top, box.bottom - h, reach);
  const free = (x, y) => !blocks.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
  const scan = (x0, step) => {
    let best = null;
    for (let x = x0; x >= box.left && x + w <= box.right; x += step) {
      for (const y of ys) {
        const d = Math.abs(x - x0) + Math.abs(y - pref.y) * 2;
        if ((!best || d < best.d) && free(x, y)) best = { x, y, d };
      }
    }
    return best;
  };
  return scan(pref.x, dir * 12) || (alt ? scan(alt.x, -dir * 12) : null);
};

/* A round mark at (x, y) moved left until it is off every box in `taken`.
   Pure. */
const tradeClear = (x, y, r, taken) => {
  let at = x;
  for (let guard = 0; guard < 24; guard += 1) {
    const hit = taken.find((b) => at + r > b.x && at - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h);
    if (!hit) return at;
    at = hit.x - r - 1;
  }
  return at;
};

/* The fan's two outlines and its middle, as points: from the start, out
   along the upper quantile and back along the lower. Pure. */
const tradeFanPaths = (fan, toX, toY, startX) => {
  if (!fan || !Array.isArray(fan.steps) || !fan.steps.length || !(fan.start > 0)) return null;
  const x = (s) => toX(fan.from + s.step * fan.stepMs);
  const y0 = toY(fan.start);
  const band = (hiKey, loKey) => {
    const up = fan.steps.map((s) => `${x(s).toFixed(1)},${toY(s[hiKey]).toFixed(1)}`);
    const down = fan.steps.slice().reverse().map((s) => `${x(s).toFixed(1)},${toY(s[loKey]).toFixed(1)}`);
    return `M${startX.toFixed(1)},${y0.toFixed(1)}L${up.join("L")}L${down.join("L")}Z`;
  };
  const mid = `M${startX.toFixed(1)},${y0.toFixed(1)}L${fan.steps.map((s) => `${x(s).toFixed(1)},${toY(s.p50).toFixed(1)}`).join("L")}`;
  const last = fan.steps[fan.steps.length - 1];
  return { outer: band("p95", "p5"), inner: band("p75", "p25"), mid, end: { x: x(last), y: toY(last.p95) }, low: { x: x(last), y: toY(last.p5) } };
};

const chartTrade = (chart) => ({
  tradeOn: () => Boolean(chart.props.trade) && !chart.props.predict && !chart.compareScaled,

  // The price area: above the volume pane while candles are drawn
  tradeFloor: () => {
    const c = chart.candleMap();
    return c ? c.bottom : chart.height;
  },

  // Where now is on the plot: the series' latest point, not the window's edge
  tradeNowX: (sc) => {
    const lp = chart.props.lastPoint;
    const data = safePrices(chart.props.prices);
    const last = lp || data[data.length - 1];
    if (!last) return chart.width;
    const x = sc.toX(+new Date(last.time));
    return isFinite(x) ? Math.max(0, Math.min(chart.width, x)) : chart.width;
  },

  tradeInk: (ink) => {
    const { color } = chart.props.theme;
    if (ink === "up") return color.chartLineGreen;
    if (ink === "down" || ink === "liq") return color.chartLineRed;
    if (ink === "quiet" || ink === "plan") return color.textSecondary;
    return color.text;
  },

  // One pool per group and tag, so a reused node never changes paint order
  tradeNode: (group, tag) => {
    const pools = chart._trade;
    const key = `${group}:${tag}`;
    if (!pools.nodes[key]) pools.nodes[key] = { list: [], at: 0 };
    return chart.poolNode(pools.nodes[key], tag, chart.tradeGroup(group));
  },

  tradeGroup: (group) => {
    const layer = chart.tradeRef.current;
    const pools = chart._trade;
    let g = pools.groups[group];
    if (!g || g.parentNode !== layer) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-trade-layer", group);
      const order = ["fills", "bars", "lines", "marks", "pills", "words", "pointer"];
      const after = order.slice(order.indexOf(group) + 1).map((k) => pools.groups[k]).find((n) => n && n.parentNode === layer);
      layer.insertBefore(g, after || null);
      pools.groups[group] = g;
    }
    return g;
  },

  tradeLine: (x1, y1, x2, y2, ink, dash, width, opacity) => {
    const el = chart.tradeNode("lines", "line");
    el.setAttribute("x1", x1);
    el.setAttribute("y1", y1);
    el.setAttribute("x2", x2);
    el.setAttribute("y2", y2);
    el.setAttribute("stroke", ink);
    el.setAttribute("stroke-width", String(width || 1));
    el.setAttribute("stroke-dasharray", dash || "none");
    el.setAttribute("opacity", String(opacity == null ? 0.95 : opacity));
    el.removeAttribute("data-trade-level");
    return el;
  },

  tradeRect: (group, x, y, w, h, fill, opacity, stroke) => {
    const el = chart.tradeNode(group, "rect");
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("width", Math.max(0, w));
    el.setAttribute("height", Math.max(0, h));
    el.setAttribute("rx", group === "pills" ? "3" : "0");
    el.setAttribute("fill", fill);
    el.setAttribute("fill-opacity", String(opacity == null ? 1 : opacity));
    el.setAttribute("stroke", stroke || "none");
    el.removeAttribute("data-trade-pill");
    el.removeAttribute("data-trade-box");
    return el;
  },

  tradeText: (x, y, text, ink, anchor, weight, size) => {
    const el = chart.tradeNode("words", "text");
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("fill", ink);
    el.setAttribute("text-anchor", anchor || "start");
    el.setAttribute("font-size", String(size || TRADE_FONT));
    el.setAttribute("font-family", chart.props.theme.font.primary);
    el.setAttribute("font-weight", weight || "500");
    /* Painted with the page behind it, so a word crossed by a candle still
       reads; a pill's word sits on its pill and needs none. */
    el.setAttribute("stroke", chart.props.theme.color.bg);
    el.setAttribute("stroke-width", "3");
    el.setAttribute("stroke-linejoin", "round");
    el.setAttribute("paint-order", "stroke");
    el.removeAttribute("data-trade-word");
    if (el.textContent !== text) el.textContent = text;
    return el;
  },

  /* A word on a pill: on the page's ground with an edge of its ink, or
     filled with it when the level is the account's own (`strong`). */
  tradePill: (right, y, text, ink, strong, id) => {
    const { color } = chart.props.theme;
    const w = tradePillWidth(text);
    const x = right - w;
    const box = chart.tradeRect("pills", x, Math.round(y - TRADE_PILL_H / 2), w, TRADE_PILL_H, strong ? ink : color.bg, strong ? 1 : 0.94, ink);
    box.setAttribute("data-trade-pill", id);
    const word = chart.tradeText(x + TRADE_PILL_PAD, Math.round(y) + 4, text, strong ? color.bg : ink, "start", strong ? "600" : "500");
    word.setAttribute("stroke", "none");
    word.setAttribute("data-trade-word", id);
    return { x, y: Math.round(y - TRADE_PILL_H / 2), w, h: TRADE_PILL_H };
  },

  // The levels as drawn: one being held in its new place, a handle's as new
  tradeLevels: () => {
    const t = chart.props.trade;
    const list = t && Array.isArray(t.levels) ? t.levels : [];
    const drag = chart._tradeDrag;
    if (!drag || !(drag.price > 0)) return list;
    const text = t && typeof t.dragText === "function" ? t.dragText(drag.key, drag.price) : null;
    const held = (lv) => Object.assign({}, lv, { price: drag.price, label: text || lv.label, held: true });
    if (list.some((lv) => lv.key === drag.key)) return list.map((lv) => (lv.key === drag.key ? held(lv) : lv));
    // A handle pulled out: a level that does not exist yet
    const handle = (t.handles || []).find((h) => h.key === drag.key);
    const on = handle ? list.find((lv) => lv.key === handle.on) : null;
    if (!handle || !on) return list;
    const kind = handle.kind || (/take/i.test(handle.key) ? "planTake" : "planStop");
    return list.concat([{ key: handle.key, kind, ink: kind.toLowerCase().includes("take") ? "up" : "down", from: on.from, price: drag.price, label: text || handle.text, drag: true, held: true }]);
  },

  /* ── Drawing it all ── */
  updateTrade: () => {
    const layer = chart.tradeRef.current;
    if (!layer || !chart._trade) return;
    const pools = chart._trade;
    for (const k of Object.keys(pools.nodes)) pools.nodes[k].at = 0;
    pools.hits = [];
    const done = () => {
      for (const k of Object.keys(pools.nodes)) chart.hideRest(pools.nodes[k]);
      const sig = JSON.stringify(pools.tags || []);
      if (sig !== pools.tagSig) {
        pools.tagSig = sig;
        chart.updateAxes();
      }
    };
    pools.tags = [];
    const t = chart.props.trade;
    const sc = chart.tradeOn() ? chart.plotScale() : null;
    const W = chart.width;
    if (!t || !sc || !(W > 0)) {
      done();
      return;
    }
    const { color } = chart.props.theme;
    const top = 0;
    const bottom = chart.tradeFloor();
    const nowX = chart.tradeNowX(sc);
    const yOf = (v) => (v > 0 ? sc.toY(v) : NaN);
    const inside = (y) => isFinite(y) && y >= top && y <= bottom;

    /* ── Location, along the left edge ── */
    const prof = t.profile;
    if (prof && Array.isArray(prof.bins) && prof.bins.length) {
      const max = Math.max(...prof.bins.map((b) => b.v || 0));
      const reach = W * TRADE_PROFILE_SHARE;
      if (max > 0) {
        for (const b of prof.bins) {
          const ya = yOf(b.hi);
          const yb = yOf(b.lo);
          if (!isFinite(ya) || !isFinite(yb) || yb < top || ya > bottom) continue;
          const y0 = Math.max(top, Math.min(ya, yb));
          const h = Math.max(1, Math.min(bottom, Math.max(ya, yb)) - y0 - 1);
          chart.tradeRect("bars", 0, y0, (b.v / max) * reach, h, color.textSecondary, b.inArea ? 0.3 : 0.14).setAttribute("data-trade-box", "profile");
        }
        const words = prof.words || {};
        for (const [k, v] of [["poc", prof.poc], ["vah", prof.vah], ["val", prof.val]]) {
          const y = yOf(v);
          if (!inside(y)) continue;
          if (k === "poc") chart.tradeLine(0, y, W, y, color.textSecondary, "1 3", 1, 0.8).setAttribute("data-trade-level", "poc");
          chart.tradeText(reach + 6, Math.round(y) + (k === "val" ? 11 : -3), words[k] || k.toUpperCase(), color.textSecondary, "start", "500", 10).setAttribute("data-trade-word", k);
        }
      }
    }

    /* ── The book's walls, at the right edge ── */
    for (const wall of Array.isArray(t.walls) ? t.walls : []) {
      const y = yOf(wall.price);
      if (!inside(y) || !(wall.share > 0)) continue;
      const w = W * TRADE_WALL_SHARE * Math.min(1, wall.share);
      chart.tradeRect("bars", W - w, Math.round(y) - 1.5, w, 3, wall.side === "ask" ? color.chartLineRed : color.chartLineGreen, 0.55).setAttribute("data-trade-box", `wall-${wall.side}`);
    }

    /* ── The fan, from now into the room past it ── */
    const fan = t.fan ? tradeFanPaths(t.fan, sc.toX, sc.toY, nowX) : null;
    if (fan) {
      const outer = chart.tradeNode("fills", "path");
      outer.setAttribute("d", fan.outer);
      outer.setAttribute("fill", color.textSecondary);
      outer.setAttribute("fill-opacity", "0.1");
      outer.setAttribute("stroke", "none");
      outer.setAttribute("data-trade-fan", "outer");
      const innerP = chart.tradeNode("fills", "path");
      innerP.setAttribute("d", fan.inner);
      innerP.setAttribute("fill", color.textSecondary);
      innerP.setAttribute("fill-opacity", "0.16");
      innerP.setAttribute("stroke", "none");
      innerP.setAttribute("data-trade-fan", "inner");
      const mid = chart.tradeNode("lines", "path");
      mid.setAttribute("d", fan.mid);
      mid.setAttribute("fill", "none");
      mid.setAttribute("stroke", color.textSecondary);
      mid.setAttribute("stroke-width", "1");
      mid.setAttribute("stroke-dasharray", "2 3");
      mid.setAttribute("opacity", "0.9");
      mid.setAttribute("data-trade-fan", "mid");
    }

    /* ── The boxes: risk and reward of the plan, the result of a contract ── */
    for (const b of Array.isArray(t.boxes) ? t.boxes : []) {
      const ya = yOf(b.hi);
      const yb = yOf(b.lo);
      if (!isFinite(ya) || !isFinite(yb)) continue;
      const y0 = Math.max(top, Math.min(ya, yb));
      const y1 = Math.min(bottom, Math.max(ya, yb));
      if (!(y1 > y0)) continue;
      const x0 = b.from != null ? Math.max(0, Math.min(W, sc.toX(b.from))) : 0;
      chart.tradeRect("fills", x0, y0, W - x0, y1 - y0, b.ink === "up" ? color.chartLineGreen : color.chartLineRed, b.from != null ? 0.16 : 0.1).setAttribute("data-trade-box", b.key);
    }

    /* ── The guide's bands: the item pointed at, and nothing at rest ── */
    const marks = Array.isArray(t.marks) ? t.marks : [];
    const focus = t.focus;
    for (const m of marks) {
      if (m.key !== focus || !(m.lo > 0) || !(m.hi > 0)) continue;
      const ya = yOf(m.hi);
      const yb = yOf(m.lo);
      const y0 = Math.max(top, Math.min(ya, yb));
      const y1 = Math.min(bottom, Math.max(ya, yb));
      if (!(y1 > y0)) continue;
      chart.tradeRect("fills", 0, y0, W, y1 - y0, color.text, 0.08).setAttribute("data-trade-box", `guide-${m.key}`);
      chart.tradeLine(0, y0, W, y0, color.text, "3 3", 1, 0.5);
      chart.tradeLine(0, y1, W, y1, color.text, "3 3", 1, 0.5);
    }

    /* ── Reference levels: where the market was yesterday ── */
    for (const ref of Array.isArray(t.refs) ? t.refs : []) {
      const y = yOf(ref.price);
      if (!inside(y)) continue;
      chart.tradeLine(0, y, W, y, color.textSecondary, "1 4", 1, 0.75).setAttribute("data-trade-level", ref.key);
      const x = prof && prof.bins && prof.bins.length ? W * TRADE_PROFILE_SHARE + 6 : 6;
      chart.tradeText(x, Math.round(y) - 3, ref.word, color.textSecondary, "start", "500", 10).setAttribute("data-trade-word", ref.key);
    }

    /* ── Forced closes: a dot where each was filled, the size its value ── */
    pools.prints = [];
    for (const q of Array.isArray(t.prints) ? t.prints : []) {
      const x = sc.toX(q.t);
      const y = yOf(q.price);
      if (!isFinite(x) || x < 0 || x > W || !inside(y)) continue;
      const r = 2.5 + 4.5 * Math.sqrt(Math.max(0, Math.min(1, q.share || 0)));
      const c = chart.tradeNode("bars", "circle");
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute("r", r.toFixed(1));
      c.setAttribute("fill", q.side === "long" ? color.chartLineRed : color.chartLineGreen);
      c.setAttribute("fill-opacity", "0.55");
      c.setAttribute("stroke", color.bg);
      c.setAttribute("stroke-width", "1");
      c.setAttribute("data-trade-print", q.side);
      pools.prints.push({ x, y, r, text: q.text });
    }

    /* ── Times: the next funding, as a line down the plot ──
       Their pills are placed with the levels' (10 Oct 2026: drawn first at
       the plot's top, the funding pill sat on the break-even's): one past
       the window joins the right edge's lane, one inside it is moved down
       its own line until it is off every pill. */
    const aheadRows = [];
    const timeLabels = [];
    for (const tm of Array.isArray(t.times) ? t.times : []) {
      const x = sc.toX(tm.t);
      if (isFinite(x) && x > W && tm.ahead) {
        // Past the window: said at its edge, with the time to it
        aheadRows.push({ lv: { key: `${tm.key}-ahead` }, y: top, ink: color.textSecondary, label: tm.ahead, off: null, rank: 0, time: true });
        continue;
      }
      if (!isFinite(x) || x < 0 || x > W) continue;
      chart.tradeLine(x, top, x, bottom, color.textSecondary, "4 4", 1, 0.8).setAttribute("data-trade-level", tm.key);
      if (tm.label) timeLabels.push({ key: tm.key, x, label: tm.label });
    }
    const timePill = (key, left, y, text) => {
      const w = tradePillWidth(text);
      chart.tradeRect("pills", left, y, w, TRADE_PILL_H, color.bg, 0.94, color.border).setAttribute("data-trade-pill", key);
      chart.tradeText(left + TRADE_PILL_PAD, y + 13, text, color.textSecondary, "start", "500").setAttribute("data-trade-word", key);
      return { x: left, y, w, h: TRADE_PILL_H };
    };

    /* ── The levels: lines across, pills along the right edge ── */
    const levels = chart.tradeLevels();
    const handles = Array.isArray(t.handles) ? t.handles : [];
    const rows = [];
    for (const lv of levels) {
      const y = yOf(lv.price);
      if (!isFinite(y)) continue;
      const ink = chart.tradeInk(lv.ink);
      const x0 = lv.from != null ? Math.max(0, Math.min(W, sc.toX(lv.from))) : 0;
      if (inside(y)) {
        const width = lv.held ? 1.75 : lv.kind === "liq" || lv.kind === "planLiq" ? 1.5 : 1;
        const line = chart.tradeLine(x0, y, W, y, ink, lv.dash || (lv.strong ? "none" : "4 3"), width, lv.ink === "plan" ? 0.8 : 0.95);
        line.setAttribute("data-trade-level", lv.key);
        // Its price on the scale, where a venue prints an order's
        if (lv.tag) pools.tags.push({ price: lv.price, text: lv.tag, ink, strong: Boolean(lv.strong) });
      }
      const off = y < top ? "above" : y > bottom ? "below" : null;
      const label = off ? `${off === "above" ? "↑" : "↓"} ${lv.label}` : lv.label;
      rows.push({ lv, y, ink, label, off, rank: lv.held ? TRADE_RANK.drag : TRADE_RANK[lv.kind] || 1 });
    }
    rows.push(...aheadRows);
    const slots = tradeLane(rows.map((r) => ({ key: r.lv.key, y: r.y, rank: r.rank })), top, bottom);
    // Every pill's box, so what is placed after them can stay off them
    const taken = [];
    const right = W - 4;
    for (const r of rows) {
      const y = slots[r.lv.key];
      if (y == null) continue;
      if (r.time) {
        taken.push(timePill(r.lv.key, Math.max(0, right - tradePillWidth(r.label)), Math.round(y - TRADE_PILL_H / 2), r.label));
        continue;
      }
      const pill = chart.tradePill(right, y, r.label, r.ink, Boolean(r.lv.strong), r.lv.key);
      taken.push(pill);
      // A pill moved off its line says which line it is
      if (!r.off && Math.abs(y - r.y) > 1) chart.tradeLine(pill.x - 8, r.y, pill.x, y, r.ink, "none", 1, 0.7);
      if (r.lv.drag && !r.off) pools.hits.push({ key: r.lv.key, part: "pill", x: pill.x, y: pill.y, w: pill.w, h: pill.h });
      let left = pill.x;
      if (r.lv.cancel && !r.off) {
        const s = TRADE_PILL_H;
        left -= s + 3;
        const box = chart.tradeRect("pills", left, pill.y, s, s, color.bg, 0.94, r.ink);
        box.setAttribute("data-trade-pill", `${r.lv.key}-cancel`);
        chart.tradeText(left + s / 2, pill.y + 13, "×", r.ink, "middle", "600", 13).setAttribute("data-trade-word", `${r.lv.key}-cancel`);
        pools.hits.push({ key: r.lv.key, part: "cancel", x: left, y: pill.y, w: s, h: s });
        taken.push({ x: left, y: pill.y, w: s, h: s });
      }
      for (const h of handles) {
        if (h.on !== r.lv.key || r.off) continue;
        if (levels.some((lv) => lv.key === h.key)) continue;
        const w = tradePillWidth(h.text);
        left -= w + 3;
        const box = chart.tradeRect("pills", left, pill.y, w, TRADE_PILL_H, color.bg, 0.94, r.ink);
        box.setAttribute("data-trade-pill", h.key);
        box.setAttribute("stroke-dasharray", "3 2");
        chart.tradeText(left + TRADE_PILL_PAD, pill.y + 13, h.text, r.ink, "start", "600").setAttribute("data-trade-word", h.key);
        pools.hits.push({ key: h.key, part: "handle", x: left, y: pill.y, w, h: TRADE_PILL_H });
        taken.push({ x: left, y: pill.y, w, h: TRADE_PILL_H });
      }
      if (r.lv.drag && !r.off) pools.hits.push({ key: r.lv.key, part: "line", y: r.y, x0: r.lv.from != null ? Math.max(0, sc.toX(r.lv.from)) : 0 });
    }
    const overlaps = (b) => taken.some((q) => b.x < q.x + q.w && b.x + b.w > q.x && b.y < q.y + q.h && b.y + b.h > q.y);
    for (const tl of timeLabels) {
      const w = tradePillWidth(tl.label);
      const left = Math.max(0, Math.min(W - w, tl.x - w / 2));
      let y = top + 4;
      while (overlaps({ x: left, y, w, h: TRADE_PILL_H }) && y + TRADE_PILL_H * 2 + TRADE_PILL_GAP <= bottom) y += TRADE_PILL_H + TRADE_PILL_GAP;
      if (overlaps({ x: left, y, w, h: TRADE_PILL_H })) continue;
      taken.push(timePill(tl.key, left, y, tl.label));
    }

    /* ── The guide's numbers, where each item is about ── */
    for (const m of marks) {
      let x = null;
      let y = null;
      if (m.t > 0) {
        x = sc.toX(m.t);
        y = top + TRADE_PILL_H + 16;
      } else {
        const v = m.price > 0 ? m.price : m.hi > 0 ? m.hi : null;
        if (v != null) {
          y = yOf(v);
          x = nowX - TRADE_MARK_R - 6;
        }
      }
      if (x == null || !isFinite(x) || !inside(y)) continue;
      // Off every pill and every number already placed, moving left
      x = tradeClear(x, y, TRADE_MARK_R + 3, taken);
      if (x < TRADE_MARK_R || x > W - TRADE_MARK_R) continue;
      taken.push({ x: x - TRADE_MARK_R, y: y - TRADE_MARK_R, w: TRADE_MARK_R * 2, h: TRADE_MARK_R * 2 });
      const ink = m.kind === "missing" ? color.chartLineRed : m.kind === "watch" ? color.text : color.textSecondary;
      const on = m.key === focus;
      const c = chart.tradeNode("marks", "circle");
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute("r", String(TRADE_MARK_R));
      c.setAttribute("fill", on ? ink : color.bg);
      c.setAttribute("stroke", ink);
      c.setAttribute("stroke-width", "1.25");
      c.setAttribute("data-trade-mark", m.key);
      chart.tradeText(x, y + 3.5, String(m.n), on ? color.bg : ink, "middle", "700", 10).setAttribute("data-trade-word", `mark-${m.key}`);
      pools.hits.push({ key: m.key, part: "mark", cx: x, cy: y, r: TRADE_MARK_R + 2 });
    }

    // What the chart's own readout keeps off (drawCrosshair)
    chart._trade.taken = taken.slice();

    /* The fan's words, under its lower edge where nothing else is — or
       over its upper one, or not at all. */
    if (fan && t.fan.label && isFinite(fan.end.x) && fan.end.x > nowX + 40) {
      const x = Math.min(W - 4, fan.end.x);
      const w = Math.ceil(t.fan.label.length * 6) + 4;
      const fits = (y) => y - 10 >= top && y + 2 <= bottom && !taken.some((b) => x - w < b.x + b.w && x > b.x && y - 10 < b.y + b.h && y + 2 > b.y);
      const yLow = Math.round(fan.low.y + 14);
      const yHigh = Math.round(fan.end.y - 6);
      const y = fits(yLow) ? yLow : fits(yHigh) ? yHigh : null;
      if (y != null) chart.tradeText(x, y, t.fan.label, color.textSecondary, "end", "500", 10).setAttribute("data-trade-word", "fan");
    }

    /* ── The pointer's own row: the price under the hand, and what this
       account's contracts would be worth there ── */
    const hy = chart._tradeHoverY;
    if (hy != null && inside(hy) && !chart._tradeDrag && typeof t.hoverText === "function") {
      const v = sc.toV(hy);
      const at = chart._tradeHoverX != null ? sc.toT(chart._tradeHoverX) : null;
      let text = v > 0 ? t.hoverText(v, isFinite(at) ? at : null) : null;
      // A forced close under the hand says what it was
      const hx0 = chart._tradeHoverX;
      const near = hx0 != null ? (pools.prints || []).filter((q) => Math.hypot(q.x - hx0, q.y - hy) <= q.r + 4).sort((a, b) => Math.hypot(a.x - hx0, a.y - hy) - Math.hypot(b.x - hx0, b.y - hy))[0] : null;
      if (near && text) text = `${text}\n${near.text}`;
      const hair = chart.tradeNode("pointer", "line");
      hair.setAttribute("x1", 0);
      hair.setAttribute("x2", W);
      hair.setAttribute("y1", hy);
      hair.setAttribute("y2", hy);
      hair.setAttribute("stroke", color.textSecondary);
      hair.setAttribute("stroke-width", "1");
      hair.setAttribute("stroke-dasharray", "3 3");
      hair.setAttribute("opacity", "0.7");
      hair.setAttribute("data-trade-hover", "hair");
      if (text) {
        /* One pill, a line for each thing it says: the pointer's level
           first, then the point under it and what the price did since. */
        const lines = String(text).split("\n");
        const lh = TRADE_PILL_H - 2;
        const w = Math.max(...lines.map(tradePillWidth));
        const h = lines.length * lh + 4;
        const hx = chart._tradeHoverX != null ? chart._tradeHoverX : W / 2;
        /* Left of the hand first: the right edge is the order pills' lane
           (10 Oct 2026: on the right it covered the liquidation's pill).
           Above the hair, and off the chart's own OHLC box, which sits
           under the hair on the same side (drawCrosshair) — over it, or
           under it when the plot's top leaves no room. */
        const ohlc = chart.hoverBoxRef && chart.hoverBoxRef.current;
        const ob = ohlc && chart.hoverX != null && ohlc.getAttribute("width") ? ["x", "y", "width", "height"].map((a) => Number(ohlc.getAttribute(a))) : null;
        const blocks = ob && ob.every(isFinite) ? [...taken, { x: ob[0], y: ob[1], w: ob[2], h: ob[3] }] : taken;
        /* The nearest place over the hair on the hand's left that covers no
           pill and not the OHLC box (tradeSpot); none free, over the hair. */
        const leftX = hx - 14 - w;
        const rightX = hx + 14;
        const onLeft = leftX >= 0;
        const pref = { x: onLeft ? leftX : Math.max(0, Math.min(W - w, rightX)), y: Math.max(top, Math.min(bottom - h, hy - h - 4)) };
        const ask = (bl) => tradeSpot({ pref, alt: onLeft && rightX + w <= W ? { x: rightX } : null, dir: onLeft ? -1 : 1, w, h, box: { left: 0, right: W, top, bottom }, blocks: bl, reach: TRADE_READOUT_REACH });
        // A crowded plot with no place off every pill: off the OHLC box at least
        const spot = ask(blocks) || (blocks.length > taken.length ? ask(blocks.slice(taken.length)) : null);
        const left = spot ? spot.x : pref.x;
        const yy = spot ? spot.y : pref.y;
        const box = chart.tradeNode("pointer", "rect");
        box.setAttribute("x", left);
        box.setAttribute("y", yy);
        box.setAttribute("width", w);
        box.setAttribute("height", h);
        box.setAttribute("rx", "3");
        box.setAttribute("fill", color.bg);
        box.setAttribute("fill-opacity", "0.96");
        box.setAttribute("stroke", color.border);
        box.setAttribute("data-trade-hover", "pill");
        lines.forEach((line, i) => {
          const word = chart.tradeNode("pointer", "text");
          word.setAttribute("x", left + TRADE_PILL_PAD);
          word.setAttribute("y", yy + 2 + lh * i + 12);
          word.setAttribute("fill", i === 0 ? color.text : color.textSecondary);
          word.setAttribute("font-size", String(TRADE_FONT));
          word.setAttribute("font-family", chart.props.theme.font.primary);
          word.setAttribute("font-weight", "500");
          word.setAttribute("data-trade-hover", i === 0 ? "text" : `text-${i}`);
          if (word.textContent !== line) word.textContent = line;
        });
      }
    }
    done();
  },

  /* Which part of the layer a press at (x, y) lands on: a handle, a ×, a
     pill, a guide number, then the nearest movable line. */
  tradeHitAt: (x, y) => {
    if (!chart.tradeOn() || !chart._trade) return null;
    const hits = chart._trade.hits || [];
    const inBox = (h) => x >= h.x - 1 && x <= h.x + h.w + 1 && y >= h.y - 1 && y <= h.y + h.h + 1;
    for (const part of ["handle", "cancel", "pill"]) {
      const h = hits.find((q) => q.part === part && inBox(q));
      if (h) return { key: h.key, part };
    }
    const mark = hits.find((q) => q.part === "mark" && Math.hypot(x - q.cx, y - q.cy) <= q.r);
    if (mark) return { key: mark.key, part: "mark" };
    let best = null;
    for (const q of hits) {
      if (q.part !== "line" || x < q.x0) continue;
      const d = Math.abs(y - q.y);
      if (d <= TRADE_HIT_PX && (!best || d < best.d)) best = { key: q.key, part: "line", d };
    }
    return best ? { key: best.key, part: "line" } : null;
  },

  // What the cursor says over the layer
  tradeCursor: (x, y) => {
    const hit = chart.tradeHitAt(x, y);
    if (!hit) return null;
    return hit.part === "cancel" || hit.part === "mark" ? "pointer" : "ns-resize";
  },

  /* ── Holding a line ── */
  /* **The level moves by what the hand moves, from where the level is.** A
     pill is often a few pixels off its own line (the lane moved it), and a
     handle sits on the entry's row: taking the price at the pointer would
     jump the level to wherever the pill happened to be. So the drag starts
     at the line's own price and adds the pointer's travel — a ratio on a log
     scale — and is not held to the price pane: a stop below the window is
     dragged past its edge and drawn there with its arrow. */
  startTradeDrag: (hit, x, y) => {
    if (!hit || hit.part === "cancel" || hit.part === "mark") return;
    const t = chart.props.trade;
    const levels = t && Array.isArray(t.levels) ? t.levels : [];
    const own = levels.find((lv) => lv.key === hit.key);
    const handle = !own && t && Array.isArray(t.handles) ? t.handles.find((h) => h.key === hit.key) : null;
    const on = handle ? levels.find((lv) => lv.key === handle.on) : null;
    const base = own ? own.price : on ? on.price : null;
    chart._tradeDrag = { key: hit.key, part: hit.part, price: null, base, y0: y };
  },
  moveTradeDrag: (x, y) => {
    const g = chart._tradeDrag;
    const sc = chart.plotScale();
    if (!g || !sc || !(g.base > 0) || !isFinite(g.y0)) return;
    const a = sc.toV(g.y0);
    const b = sc.toV(y);
    if (!(a > 0) || !isFinite(b)) return;
    const v = sc.log ? g.base * (b / a) : g.base + (b - a);
    if (!(v > 0) || !isFinite(v)) return;
    g.price = v;
    chart.updateTrade();
  },
  endTradeDrag: () => {
    const g = chart._tradeDrag;
    chart._tradeDrag = null;
    chart.updateTrade();
    return g && g.price > 0 ? { key: g.key, price: g.price } : null;
  },

  /* Wrap the few entry points the layer rides on, so their bodies stay as
     they were: every redraw of the tools redraws this (they read one
     scale), and the crosshair carries the pointer's raw height here. */
  wireTrade: () => {
    const tools = chart.updateTools;
    chart.updateTools = () => {
      tools();
      chart.updateTrade();
    };
    const draw = chart.drawCrosshair;
    chart.drawCrosshair = () => {
      draw();
      if (!chart.tradeOn()) return;
      const y = chart.hoverY;
      const x = chart.hoverX;
      const ny = isFinite(y) && y >= 0 ? y : null;
      if (ny === chart._tradeHoverY && x === chart._tradeHoverX) return;
      chart._tradeHoverY = ny;
      chart._tradeHoverX = isFinite(x) && x >= 0 ? x : null;
      chart.updateTrade();
    };
    const clear = chart.clearHover;
    chart.clearHover = () => {
      clear();
      if (chart._tradeHoverY == null) return;
      chart._tradeHoverY = null;
      chart._tradeHoverX = null;
      chart.updateTrade();
    };
  },
});
