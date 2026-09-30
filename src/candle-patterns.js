/* CANDLESTICK PATTERNS — named, and then counted.
 *
 * Asked for on 22 Sep 2026 after a video of the usual kind: a pattern, a
 * chart where it worked, and an entry. The request was the honest half of it
 * — *"otomatik bu oluyor candle, bu olmuş olma oranı… geçmiş ile
 * birleştirip"*: name the shape automatically, then put the rate it was
 * followed by a rise next to it.
 *
 * That is exactly what `baserates.js` is for, so a pattern here is not a new
 * kind of thing. It is another **state**: a boolean per day, fed to
 * `baseRateFor` like the RSI lines and the 200-day regime already are, with
 * the same floor (`BASE_RATE_MIN_EPISODES`), the same denominator beside
 * every figure, and the same refusal to print a comparison it cannot support.
 *
 * ── WHAT THE COUNTING FOUND, so nobody has to re-derive it ────────────────
 *
 * Measured 22 Sep 2026 on Coinbase's own daily candles — BTC 4,084 days back
 * to Jul 2015, ETH 3,779, SOL 1,925 — over 1, 3 and 5-day horizons. The bar
 * this app uses is n ≥ 12 episodes **and** at least ten points away from an
 * ordinary day. Almost nothing clears it, and what does clears it in one
 * window and not the next:
 *
 *   - **The two engulfing patterns point the wrong way.** After a *bullish*
 *     engulfing BTC was higher three days later 46% of the time against 55%
 *     on an ordinary day, over 375 episodes. After a *bearish* one it was
 *     higher 60% against 55%, over 314.
 *   - **The shooting star, sold as a top**, was followed by a rise more often
 *     than an ordinary day on BTC (+6 points, 93 episodes) and ETH (+6, 121).
 *   - **Momentum candles, doji, hammers** all sat within a few points of the
 *     base rate on every coin and every horizon.
 *   - **The dramatic ones cannot be counted at all.** Marubozu: 12 episodes
 *     on BTC in a decade, 3 on ETH, 1 for the bearish one. Dragonfly: 8.
 *     Gravestone: 3. These are the rows that print their count and refuse the
 *     comparison, and that refusal is the feature.
 *   - **The few that do clear the bar disagree with themselves.** The tweezer
 *     bottom on BTC: +23 points over the last two years, +13 over three,
 *     +10 over the decade — and −3 on ETH, −12 on SOL. Three upper wicks:
 *     −13 on BTC at one day, +6 at three; −15 on SOL at one day, −11 at five.
 *
 * So the panel's commonest answer about a pattern is *it made no difference*,
 * and the second commonest is *it has not happened enough times to say*. That
 * is not the feature failing. It is the only answer the data supports, and it
 * is the reason this exists rather than an arrow.
 *
 * ── TWO RULES THAT ARE NOT NEGOTIABLE ────────────────────────────────────
 *
 * **Daily candles, always, whatever range is on the chart.** A pattern is a
 * claim about a bar, and a bar is half a minute on the 1H chart and a
 * fortnight on ALL — so "an engulfing candle" would mean six different things
 * depending on which button was last pressed. `dailyRsi` settled the same
 * argument in this codebase for the same reason: the published figure means
 * the daily one, so the daily one is what gets counted, and the panel says so.
 *
 * **The claim is printed as a claim, never as a finding.** Each pattern
 * carries what it is *said* to mean, in reported speech, beside what actually
 * followed. Removing the folklore would leave the counts answering a question
 * the reader no longer has in front of them.
 */

/* The geometry, once. A candle is `{ open, high, low, close }`; everything
 * below is built from these four so a definition reads as its shape. */
const candleBody = (c) => Math.abs(c.close - c.open);
const candleRange = (c) => c.high - c.low;
const candleUpperWick = (c) => c.high - Math.max(c.open, c.close);
const candleLowerWick = (c) => Math.min(c.open, c.close) - c.low;
const candleRose = (c) => c.close > c.open;
const candleFell = (c) => c.close < c.open;

/* The average body of the `n` candles before `i` — what "bigger than the ones
 * before it" is measured against. Zero when there is nothing behind it, which
 * every test that uses it treats as "cannot say". */
const CANDLE_MOMENTUM_LOOKBACK = 5;
const CANDLE_MOMENTUM_MULTIPLE = 2;
const candleMeanBody = (cs, i, n) => {
  let sum = 0;
  let count = 0;
  for (let k = Math.max(0, i - n); k < i; k++) {
    sum += candleBody(cs[k]);
    count++;
  }
  return count ? sum / count : 0;
};

/* A body small enough that the candle is about its wicks rather than its
 * body — the doji family's one shared condition. A twentieth of the range:
 * tighter and a day that closed a dollar off its open would not qualify,
 * looser and half the chart is a doji. */
const CANDLE_DOJI_BODY = 0.05;
const candleIsDoji = (c) =>
  candleRange(c) > 0 && candleBody(c) <= CANDLE_DOJI_BODY * candleRange(c);

/* How alike two extremes have to be to count as the same level. A tenth of a
 * percent of the price: on a $90,000 coin that is $90, which is a tick or two
 * — and on a cheap coin it stays proportionate, which a fixed figure would
 * not. */
const CANDLE_TWEEZER_TOLERANCE = 0.001;
/* A wick that is most of the candle, for the "three of them in a row" shapes,
 * and the near-absence of one for a marubozu. */
const CANDLE_LONG_WICK = 0.4;
const CANDLE_NO_WICK = 0.02;
const CANDLE_WICK_RUN = 3;

/* Every pattern this app looks for.
 *
 * `title` names the shape, `claim` is what it is *said* to mean — reported,
 * never asserted — and `test(candles, i)` answers whether the candle at `i`
 * is one. A test may look back (`i - 1`, or the run before it) and must never
 * look forward: a pattern that can only be named after the fact is not a
 * pattern, it is hindsight.
 */
const CANDLE_PATTERNS = [
  {
    id: "bullish-engulfing",
    title: msg("cp_bullish_engulfing", "Bullish engulfing"),
    claim: msg("cp_claim_bullish_engulfing", "said to mark a turn upward"),
    test: (cs, i) =>
      i > 0 &&
      candleFell(cs[i - 1]) &&
      candleRose(cs[i]) &&
      cs[i].open <= cs[i - 1].close &&
      cs[i].close >= cs[i - 1].open &&
      candleBody(cs[i]) > candleBody(cs[i - 1]),
  },
  {
    id: "bearish-engulfing",
    title: msg("cp_bearish_engulfing", "Bearish engulfing"),
    claim: msg("cp_claim_bearish_engulfing", "said to mark a turn downward"),
    test: (cs, i) =>
      i > 0 &&
      candleRose(cs[i - 1]) &&
      candleFell(cs[i]) &&
      cs[i].open >= cs[i - 1].close &&
      cs[i].close <= cs[i - 1].open &&
      candleBody(cs[i]) > candleBody(cs[i - 1]),
  },
  /* No comma inside a title: the panel joins the live ones into a sentence
     ("Today's candle is bullish engulfing, momentum candle up"), and a name
     with a comma in it read as two names. */
  {
    id: "momentum-up",
    title: msg("cp_momentum_up", "Momentum candle up"),
    claim: msg("cp_claim_momentum_up", "said to mean the move carries on"),
    test: (cs, i) =>
      i >= CANDLE_MOMENTUM_LOOKBACK &&
      candleRose(cs[i]) &&
      candleMeanBody(cs, i, CANDLE_MOMENTUM_LOOKBACK) > 0 &&
      candleBody(cs[i]) >=
        CANDLE_MOMENTUM_MULTIPLE * candleMeanBody(cs, i, CANDLE_MOMENTUM_LOOKBACK),
  },
  {
    id: "momentum-down",
    title: msg("cp_momentum_down", "Momentum candle down"),
    claim: msg("cp_claim_momentum_down", "said to mean the fall carries on"),
    test: (cs, i) =>
      i >= CANDLE_MOMENTUM_LOOKBACK &&
      candleFell(cs[i]) &&
      candleMeanBody(cs, i, CANDLE_MOMENTUM_LOOKBACK) > 0 &&
      candleBody(cs[i]) >=
        CANDLE_MOMENTUM_MULTIPLE * candleMeanBody(cs, i, CANDLE_MOMENTUM_LOOKBACK),
  },
  {
    id: "doji",
    title: msg("cp_doji", "Doji"),
    claim: msg("cp_claim_doji", "said to mark indecision before a turn"),
    test: (cs, i) => candleIsDoji(cs[i]),
  },
  {
    id: "dragonfly",
    title: msg("cp_dragonfly", "Dragonfly doji"),
    claim: msg("cp_claim_dragonfly", "said to mark a turn upward"),
    test: (cs, i) =>
      candleIsDoji(cs[i]) &&
      candleLowerWick(cs[i]) >= 0.66 * candleRange(cs[i]) &&
      candleUpperWick(cs[i]) <= 0.1 * candleRange(cs[i]),
  },
  {
    id: "gravestone",
    title: msg("cp_gravestone", "Gravestone doji"),
    claim: msg("cp_claim_gravestone", "said to mark a turn downward"),
    test: (cs, i) =>
      candleIsDoji(cs[i]) &&
      candleUpperWick(cs[i]) >= 0.66 * candleRange(cs[i]) &&
      candleLowerWick(cs[i]) <= 0.1 * candleRange(cs[i]),
  },
  {
    id: "hammer",
    title: msg("cp_hammer", "Hammer"),
    claim: msg("cp_claim_hammer", "said to mean selling was absorbed"),
    test: (cs, i) =>
      candleBody(cs[i]) > 0 &&
      candleLowerWick(cs[i]) >= 2 * candleBody(cs[i]) &&
      candleUpperWick(cs[i]) <= candleBody(cs[i]),
  },
  {
    id: "shooting-star",
    title: msg("cp_shooting_star", "Shooting star"),
    claim: msg("cp_claim_shooting_star", "said to mean buying was rejected"),
    test: (cs, i) =>
      candleBody(cs[i]) > 0 &&
      candleUpperWick(cs[i]) >= 2 * candleBody(cs[i]) &&
      candleLowerWick(cs[i]) <= candleBody(cs[i]),
  },
  {
    id: "tweezer-bottom",
    title: msg("cp_tweezer_bottom", "Tweezer bottom"),
    claim: msg("cp_claim_tweezer_bottom", "said to mean a floor held twice"),
    test: (cs, i) =>
      i > 0 &&
      candleFell(cs[i - 1]) &&
      candleRose(cs[i]) &&
      candleLowerWick(cs[i]) > 0 &&
      candleLowerWick(cs[i - 1]) > 0 &&
      Math.abs(cs[i].low - cs[i - 1].low) <= CANDLE_TWEEZER_TOLERANCE * cs[i].close,
  },
  {
    id: "tweezer-top",
    title: msg("cp_tweezer_top", "Tweezer top"),
    claim: msg("cp_claim_tweezer_top", "said to mean a ceiling held twice"),
    test: (cs, i) =>
      i > 0 &&
      candleRose(cs[i - 1]) &&
      candleFell(cs[i]) &&
      candleUpperWick(cs[i]) > 0 &&
      candleUpperWick(cs[i - 1]) > 0 &&
      Math.abs(cs[i].high - cs[i - 1].high) <= CANDLE_TWEEZER_TOLERANCE * cs[i].close,
  },
  {
    id: "lower-wicks",
    title: msg("cp_lower_wicks", "Three long lower wicks"),
    claim: msg("cp_claim_lower_wicks", "said to mean buyers keep defending a level"),
    test: (cs, i) => {
      if (i < CANDLE_WICK_RUN - 1) return false;
      for (let k = 0; k < CANDLE_WICK_RUN; k++) {
        const c = cs[i - k];
        if (!(candleRange(c) > 0) || candleLowerWick(c) < CANDLE_LONG_WICK * candleRange(c)) {
          return false;
        }
      }
      return true;
    },
  },
  {
    id: "upper-wicks",
    title: msg("cp_upper_wicks", "Three long upper wicks"),
    claim: msg("cp_claim_upper_wicks", "said to mean sellers keep defending a level"),
    test: (cs, i) => {
      if (i < CANDLE_WICK_RUN - 1) return false;
      for (let k = 0; k < CANDLE_WICK_RUN; k++) {
        const c = cs[i - k];
        if (!(candleRange(c) > 0) || candleUpperWick(c) < CANDLE_LONG_WICK * candleRange(c)) {
          return false;
        }
      }
      return true;
    },
  },
  {
    id: "marubozu-up",
    title: msg("cp_marubozu_up", "Marubozu up"),
    claim: msg("cp_claim_marubozu_up", "said to mean buyers held it all day"),
    test: (cs, i) =>
      candleRose(cs[i]) &&
      candleRange(cs[i]) > 0 &&
      candleUpperWick(cs[i]) <= CANDLE_NO_WICK * candleRange(cs[i]) &&
      candleLowerWick(cs[i]) <= CANDLE_NO_WICK * candleRange(cs[i]),
  },
  {
    id: "marubozu-down",
    title: msg("cp_marubozu_down", "Marubozu down"),
    claim: msg("cp_claim_marubozu_down", "said to mean sellers held it all day"),
    test: (cs, i) =>
      candleFell(cs[i]) &&
      candleRange(cs[i]) > 0 &&
      candleUpperWick(cs[i]) <= CANDLE_NO_WICK * candleRange(cs[i]) &&
      candleLowerWick(cs[i]) <= CANDLE_NO_WICK * candleRange(cs[i]),
  },
];

/* One boolean per day: was this pattern on the candle that closed that day.
 *
 * The shape `baseRateFor` wants — it takes a parallel array and a test, and
 * counts **episodes**, the first day of each run, so a pattern that holds for
 * three days running is one occurrence and not three. A candle that is not an
 * object is `false` rather than a throw: the series is fetched, and a row the
 * exchange sent half of must not take the panel down with it. */
const candlePatternHits = (candles, test) => {
  if (!Array.isArray(candles) || typeof test !== "function") return [];
  const ok = candles.every(
    (c) =>
      c &&
      isFinite(c.open) &&
      isFinite(c.high) &&
      isFinite(c.low) &&
      isFinite(c.close),
  );
  if (!ok) return candles.map(() => false);
  return candles.map((c, i) => {
    try {
      return Boolean(test(candles, i));
    } catch (error) {
      return false;
    }
  });
};

/* Which patterns the newest candle carries. The panel leads with these — it
 * is the question somebody opens it to ask — and `hits` is handed back
 * alongside so the count is not walked twice. */
const candlePatternsNow = (candles) => {
  if (!Array.isArray(candles) || candles.length < 2) return [];
  const last = candles.length - 1;
  return CANDLE_PATTERNS.map((pattern) => ({
    pattern,
    hits: candlePatternHits(candles, pattern.test),
  })).map((row) => ({ ...row, live: row.hits[last] === true }));
};

/* How far ahead a candle pattern is read.
 *
 * Three days, and one horizon rather than the panel's two. The claim being
 * tested is about the next few bars — nobody says an engulfing candle decides
 * the next month — so counting it at thirty days would be answering a
 * question nobody asked, and printing both would double the length of a
 * section that already carries fifteen rows. */
const CANDLE_PATTERN_HORIZON = 3;
