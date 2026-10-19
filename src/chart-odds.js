/* THE CHANCE ON EACH SQUARE — drawn on the calls board (30 Sep 2026)
 *
 * The arithmetic is `cell-odds.js`; this puts it on the lattice. Every square
 * that can be called gets the chance its band holds at its column's end, from
 * the coin's own bars (`props.oddsSeries`, asked for through `onNeedOdds` at
 * the granularity the square's span wants) — shaded in ink, never in the
 * direction colours, with the figure written in it. The column's likeliest
 * square carries its figure at full weight: a fact about the distribution,
 * not a pick.
 *
 * What may be printed was decided before the model was run
 * (`docs/internal/research/cell-odds-prereg.md`) and measured out of sample:
 * a range whose chances were not calibrated (`CELL_ODDS_MEASURED`) draws none,
 * and the square's readout says so. A column whose horizon the look-back
 * cannot hold thirty times over is left blank — refused, never guessed.
 *
 * Attached to LineBase like the axes and the tools; loads before chart.js. */

const ODDS_FIGURE_MIN = 0.005; // under half a point a square prints nothing
const ODDS_SHADE_MAX = 0.2; // the heaviest shading, reached at 40%
const ODDS_REFRESH_SHARE = 0.02; // a column is recomputed when "now" moved 2% of a span

const chartOdds = (chart) => ({
  oddsOn: () =>
    Boolean(chart.props.predict && chart.props.cellOdds && !chart.props.compare),

  /* The model for the bars in hand, once per series. */
  oddsPrep: () => {
    const s = chart.props.oddsSeries;
    if (!s || !Array.isArray(s.closes)) return null;
    if (chart._oddsPrepFor === s) return chart._oddsPrep;
    chart._oddsPrepFor = s;
    chart._oddsPrep = oddsPrepare(s.closes, s.g);
    chart._oddsCols = new Map();
    return chart._oddsPrep;
  },

  /* One column's distribution, kept while "now" has not moved far enough
     inside the column to change it by more than a rounding. */
  oddsColumnAt: (target, span) => {
    const prep = chart.oddsPrep();
    if (!prep) return null;
    const now = Date.now();
    const h = target - now;
    if (!(h > 0)) return null;
    // Each board's own model (CELL_ODDS_MODEL, cell-odds.js), and kept per model
    const model = (typeof CELL_ODDS_MODEL === "object" && CELL_ODDS_MODEL[chart.props.period]) || "fhs";
    const key = `${model}|${target}`;
    const hit = chart._oddsCols.get(key);
    if (hit && Math.abs(hit.at - now) < span * ODDS_REFRESH_SHARE) return hit.col;
    /* A release in this column widens it (CELL_ODDS_EVENT,
       board-release-prereg.md); the readout says so and what it held. */
    const kind = typeof releaseKindIn === "function" ? releaseKindIn(target - span, target) : null;
    const col = oddsEventColumn(oddsColumn(prep, h, { model }), chart.props.period, kind);
    chart._oddsCols.set(key, { at: now, col });
    if (chart._oddsCols.size > 64) chart._oddsCols.delete(chart._oddsCols.keys().next().value);
    return col;
  },

  /* Whether this range's chances were calibrated when measured. */
  oddsMeasured: () => {
    const m = typeof CELL_ODDS_MEASURED === "object" ? CELL_ODDS_MEASURED[chart.props.period] : null;
    return m || null;
  },

  /* The bars this board wants, asked for once per coin, currency and
     granularity; the app answers with `oddsSeries`. */
  oddsAsk: () => {
    if (!chart.oddsOn() || !(chart.cellMs > 0) || typeof chart.props.onNeedOdds !== "function") return;
    const g = oddsGranularity(chart.cellMs);
    const s = chart.props.oddsSeries;
    const fresh = s && s.coin === chart.props.coin && s.currency === chart.props.currency && s.g === g;
    const key = `${chart.props.coin}|${chart.props.currency}|${g}`;
    if (fresh && Date.now() - s.at < g * 1000) return;
    if (chart._oddsAsked === key && Date.now() - chart._oddsAskedAt < Math.max(30000, g * 1000)) return;
    chart._oddsAsked = key;
    chart._oddsAskedAt = Date.now();
    chart.props.onNeedOdds(g);
  },

  /* The chance of one callable square, or null. `cell` is `cellAt`'s answer. */
  oddsFor: (cell) => {
    if (!cell || !chart.oddsOn()) return null;
    const s = chart.props.oddsSeries;
    if (!s || s.coin !== chart.props.coin || s.currency !== chart.props.currency) return null;
    const col = chart.oddsColumnAt(cell.target, cell.span);
    if (!col) return { refused: true };
    const data = safePrices(chart.props.prices);
    const live = data.length ? Number(data[data.length - 1].price) : NaN;
    const p = oddsBand(col, live, cell.lo, cell.hi);
    return isFinite(p) ? { p, n: col.n, stretches: col.stretches, event: col.event || null } : null;
  },

  /* What the square's readout adds: its chance, and what that chance was
     worth when measured — or why there is none. */
  oddsNote: (cellBox) => {
    if (!chart.oddsOn() || !cellBox) return "";
    const odds = chart.oddsFor({
      target: +cellBox.to,
      span: +cellBox.to - +cellBox.from,
      lo: cellBox.lo,
      hi: cellBox.hi,
    });
    if (!odds) return "";
    // A range that failed its check says so first, whatever its columns hold
    const measured = chart.oddsMeasured();
    if (measured && measured.pass === false) {
      return ` · ${msg("odds_uncalibrated", "no chance printed: on this range the model was not calibrated")}`;
    }
    if (odds.refused) return ` · ${msg("odds_refused", "no chance: the history holds too few stretches this long")}`;
    const pct = odds.p < 0.01 ? "<1%" : `${Math.round(odds.p * 100)}%`;
    // A release column: the ordinary bins are not what it was measured against
    if (odds.event) {
      return ` · ${msg("odds_chance_event", "chance $1 · widened for the $2 release in this column; tested, its 80% held $3%", pct, odds.event.kind, String(Math.round(odds.event.held * 100)))}`;
    }
    const bin = measured && Array.isArray(measured.bins)
      ? measured.bins.find((b) => odds.p >= b[0] && odds.p < b[1] && b[4] >= 100)
      : null;
    // A point is a point: under ten the tenth is kept, or 0.4% reads as 0%
    const share = (v) => (v < 0.1 ? `${+(v * 100).toFixed(1)}` : `${Math.round(v * 100)}`);
    return bin
      ? ` · ${msg("odds_chance_measured", "chance $1 · of past squares given $2–$3, $4 came true", pct, share(bin[0]), `${share(bin[1])}%`, `${share(bin[3])}%`)}`
      : ` · ${msg("odds_chance", "chance $1", pct)}`;
  },

  updateCellOdds: () => {
    const layer = chart.oddsLayerRef && chart.oddsLayerRef.current;
    if (!layer) return;
    const pool = chart._oddsNodes;
    pool.rects.at = 0;
    pool.texts.at = 0;
    const done = () => {
      chart.hideRest(pool.rects);
      chart.hideRest(pool.texts);
    };
    if (!chart.oddsOn() || !(chart.cellPitch > 0) || !chart.priceToY || !(chart.cellMs > 0)) return done();
    /* **Still while the board zooms** (30 Sep 2026). Mid-travel the price step
       is interpolated and not a round number, so every frame gave every square
       a slightly different band and a different figure: measured, 53 rewrites
       of the chances through three presses — the board shimmered. They fade out
       with the axis labels' own signal (`zoomAnim`, `_labelInk`), are left
       untouched while it lasts, and come back once, on the exact squares, when
       the travel has settled. */
    const moving = Boolean(chart.zoomAnim) || (chart._labelInk !== undefined && chart._labelInk < 0.995);
    layer.style.transition = `opacity ${motionMs(160)}ms ease`;
    if (moving) {
      layer.style.opacity = "0";
      return undefined;
    }
    layer.style.opacity = "1";
    chart.oddsAsk();
    const measured = chart.oddsMeasured();
    if (measured && measured.pass === false) return done();
    const s = chart.props.oddsSeries;
    if (!s || s.coin !== chart.props.coin || s.currency !== chart.props.currency || s.g !== oddsGranularity(chart.cellMs)) {
      return done();
    }
    const data = safePrices(chart.props.prices);
    const live = data.length ? Number(data[data.length - 1].price) : NaN;
    if (!(live > 0)) return done();
    const { color, font } = chart.props.theme;
    const pitch = chart.cellPitch;
    const origin = isFinite(chart.gridOriginX) ? chart.gridOriginX : chart.nowX;
    const baseY = chart.gridY.length ? chart.gridY[0] : 0;
    const top0 = chart.fadeEnd();
    const step = chart.cellStep;
    if (!(step > 0) || !isFinite(chart.gridOriginTime)) return done();
    const span = chart.cellMs;
    const firstCol = Math.ceil((chart.nowX - origin) / pitch);
    const rowFrom = Math.ceil((top0 - 0.5 - baseY) / pitch);
    const rowTo = Math.floor((chart.height + 0.5 - baseY) / pitch) - 1;
    const fontSize = Math.max(8, Math.min(11, Math.round(pitch / 6.5)));
    for (let col = firstCol; ; col++) {
      const xEnd = origin + col * pitch;
      if (xEnd > chart.width + 0.5) break;
      if (xEnd - pitch < chart.nowX - 0.5) continue;
      const target = chart.gridOriginTime + col * span;
      const column = chart.oddsColumnAt(target, span);
      if (!column) continue;
      const cells = [];
      for (let r = rowFrom; r <= rowTo; r++) {
        const top = baseY + r * pitch;
        const raw = chart.priceToY.invert(top);
        const hi = Math.round(raw / step) * step;
        const lo = hi - step;
        const p = oddsBand(column, live, lo, hi);
        if (isFinite(p)) cells.push({ top, p });
      }
      if (!cells.length) continue;
      const best = cells.reduce((a, b) => (b.p > a.p ? b : a));
      for (const c of cells) {
        if (c.p < ODDS_FIGURE_MIN) continue;
        const rect = chart.poolNode(pool.rects, "rect", layer);
        rect.setAttribute("x", xEnd - pitch + 1);
        rect.setAttribute("y", c.top + 1);
        rect.setAttribute("width", Math.max(0, pitch - 2));
        rect.setAttribute("height", Math.max(0, pitch - 2));
        rect.setAttribute("fill", color.text);
        rect.setAttribute("opacity", Math.min(ODDS_SHADE_MAX, c.p * 0.5).toFixed(3));
        rect.setAttribute("data-odds-cell", (c.p * 100).toFixed(2));
        const text = chart.poolNode(pool.texts, "text", layer);
        text.setAttribute("x", xEnd - pitch / 2);
        text.setAttribute("y", c.top + pitch / 2 + fontSize * 0.35);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-family", font.primary);
        text.setAttribute("font-size", fontSize);
        text.setAttribute("font-weight", c === best ? "600" : "400");
        text.setAttribute("fill", c === best ? color.text : color.textSecondary);
        text.setAttribute("data-odds-best", c === best ? "1" : "0");
        const label = c.p < 0.01 ? "<1%" : `${Math.round(c.p * 100)}%`;
        if (text.textContent !== label) text.textContent = label;
      }
    }
    done();
    chart.maskOddsUnderDraft();
  },

  /* **The drafted square says LOCK?, not its chance** (9 Oct 2026). Both
     were written at the square's centre, so a first tap on a phone showed
     "L27%?" — the chance struck through the prompt. The chance is not lost:
     the readout beside the square and the phone's confirm sheet both print
     it. Done by position after both layers have drawn, because the draft is
     cleared from ten places and the chances are redrawn from two; a rule
     kept in either drawing alone went stale whenever the other moved. */
  maskOddsUnderDraft: () => {
    const pool = chart._oddsNodes && chart._oddsNodes.texts;
    if (!pool) return;
    const draft = chart.props.predict && chart.draftCell ? chart.draftCell() : null;
    let box = null;
    if (draft && chart.timeToX && chart.priceToY) {
      const x1 = chart.timeToX(new Date(draft.target - draft.span));
      const x2 = chart.timeToX(new Date(draft.target));
      const y1 = chart.priceToY(draft.hi);
      const y2 = chart.priceToY(draft.lo);
      if ([x1, x2, y1, y2].every(isFinite)) {
        box = { l: Math.min(x1, x2), r: Math.max(x1, x2), t: Math.min(y1, y2), b: Math.max(y1, y2) };
      }
    }
    for (let i = 0; i < pool.at; i++) {
      const text = pool.list[i];
      const x = Number(text.getAttribute("x"));
      const y = Number(text.getAttribute("y"));
      const under = Boolean(box) && x > box.l && x < box.r && y > box.t && y < box.b;
      text.setAttribute("visibility", under ? "hidden" : "inherit");
      if (under) text.setAttribute("data-odds-under-draft", "1");
      else text.removeAttribute("data-odds-under-draft");
    }
  },
});
