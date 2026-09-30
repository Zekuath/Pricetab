/* THE REGIME GRID — nine cells, counted.
 *
 * Asked for on 27 Sep 2026: a widget like the Markov-chain study, nine
 * parts, with something from GitHub or the web to learn from. What the sector
 * offers (the MIT "markov-hedge-fund-method" and TradingView's "Markov Chain"
 * indicators) labels every day rising / flat / falling from a rolling 20-day
 * return, counts day-to-day moves into a 3×3 matrix and forecasts with its
 * powers. This project measured both halves before (see
 * `docs/internal/research/patterns-prereg.md`): two consecutive 20-day
 * windows share nineteen days, so the day-to-day diagonal is mostly the same
 * data read twice, and the chain is not Markov, so a matrix power understates
 * persistence by 5–13 points.
 *
 * So the grid keeps the familiar picture and changes the two things that
 * were wrong (`regimes-prereg.md`, written before the numbers):
 *  - **rows are episodes** — each entry into a state, the base-rate panel's
 *    unit — not every day of a run;
 *  - **columns are a fresh window** — the state 20 days after the entry,
 *    whose window shares no day with it — and each is shown beside its
 *    **base**, the share of all days in that state.
 * No matrix power, no forecast, no "next regime".
 *
 * Pure: daily closes in, oldest first; the grid out.
 */

const REGIME_WINDOW = 20; // days of return that name a state
const REGIME_BAND = 0.05; // ±5%: rising above, falling below, flat between
const REGIME_AHEAD = 20; // days later — a window sharing no day with today's
const REGIME_STATES = ["rising", "flat", "falling"];

/* The state of every day that has a full window behind it; null before. */
const regimeStates = (closes) => {
  const c = Array.isArray(closes) ? closes : [];
  return c.map((v, i) => {
    if (i < REGIME_WINDOW) return null;
    const from = c[i - REGIME_WINDOW];
    if (!(v > 0) || !(from > 0)) return null;
    const r = v / from - 1;
    return r >= REGIME_BAND ? 0 : r <= -REGIME_BAND ? 2 : 1;
  });
};

/* The grid: for each state, how often an entry into it was followed, 20 days
 * later, by each state — `cells[k]` of `n` — and the base share of each state
 * over all days. `now` is today's state and `since` how many days it has
 * held. `pending` counts entries too recent to have an answer. */
const regimeGrid = (closes) => {
  const st = regimeStates(closes);
  const days = [0, 0, 0];
  let known = 0;
  for (const s of st) {
    if (s == null) continue;
    days[s] += 1;
    known += 1;
  }
  const rows = REGIME_STATES.map(() => ({ n: 0, cells: [0, 0, 0], pending: 0 }));
  for (let i = 0; i < st.length; i += 1) {
    const s = st[i];
    if (s == null || st[i - 1] === s) continue; // an entry: the first day of a run
    const later = i + REGIME_AHEAD < st.length ? st[i + REGIME_AHEAD] : null;
    if (later == null) {
      rows[s].pending += 1;
      continue;
    }
    rows[s].n += 1;
    rows[s].cells[later] += 1;
  }
  let now = null;
  let since = 0;
  for (let i = st.length - 1; i >= 0 && st[i] != null; i -= 1) {
    if (now == null) now = st[i];
    if (st[i] !== now) break;
    since += 1;
  }
  return {
    days: known,
    base: days.map((d) => (known ? d / known : null)),
    rows,
    now,
    since,
  };
};
