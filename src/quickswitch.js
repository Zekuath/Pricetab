/* QUICK SWITCH
 * Press "/" on the main view to jump between coins by typing. Searches the
 * user's own list first, then the rest of the supported coins — picking one
 * of those adds it to the list and switches to it. Keyboard-only by design:
 * type, arrow, Enter. Esc closes.
 *
 * **And a command line** (2 Oct 2026, Bloomberg's `<GO>`): "eth 1y" opens a
 * coin on a range, "1w" a range, "compare sol" or "vs spx" a comparison,
 * "target 90000" the targets drawer with that price, and any word of a
 * shortcut's own name ("news", "grid", "monitor") does what its key does —
 * the commands *are* the keys (`SHORTCUT_GROUPS`), so a command cannot
 * exist that the "?" page does not list. A single letter still finds coins
 * first: "b" and Enter is BTC, as it always was.
 */

const QUICK_SWITCH_MAX_RESULTS = 8;

/* Matches on symbol or full name. Coins already on the user's list rank first
 * (switching is the common case, adding is the exception).
 *
 * `exclude` drops what must not be offered: a single symbol for the compare
 * drawer (compare-drawer.js) — a coin against itself is a flat line at zero —
 * or a whole list for the portfolio, which must not offer a coin already held.
 *
 * `pool` is what may be offered at all, defaulting to the coins this app can
 * chart. The portfolio widens it: `sanitizePortfolio` accepts anything
 * `isWatchableCoin` knows, so stETH, wBETH, FDUSD and TUSD are things you can
 * *hold* and not things you can chart — and before this they could be added by
 * watching an address and never by hand.
 *
 * **This is the one coin matcher.** There were three: this, the targets panel's
 * (folded in on 21 Aug) and the portfolio's own substring filter (folded in on
 * 22 Aug). A fourth would be a fourth idea of what "matches BTC" means. */
const quickSwitchMatches = (query, coinOptions, exclude, pool) => {
  const q = query.trim().toUpperCase();
  const owned = new Set(coinOptions);
  // One symbol or many — the callers mean the same thing by it
  const dropped =
    exclude == null
      ? null
      : new Set(typeof exclude === "string" ? [exclude] : exclude);
  const score = (sym) => {
    const name = (COIN_NAMES[sym] || "").toUpperCase();
    if (!q) return owned.has(sym) ? 0 : -1; // empty query lists the user's coins
    if (sym === q) return 0;
    if (sym.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (sym.includes(q)) return 3;
    if (name.includes(q)) return 4;
    return -1;
  };
  const results = [];
  for (const sym of pool || SUGGESTED_COINS) {
    if (dropped && dropped.has(sym)) continue;
    const s = score(sym);
    if (s < 0) continue;
    results.push({
      coin: sym,
      owned: owned.has(sym),
      score: s,
      chartable: SUGGESTED_COINS.includes(sym),
    });
  }
  results.sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    if (a.score !== b.score) return a.score - b.score;
    /* **A coin with a chart before one without**, when nothing else separates
     * them. The wide pool is the portfolio's — `HOLDABLE_COINS`, which carries
     * the tokens and the price-only tier this app can price and cannot draw —
     * and the tiebreak below it is alphabetical, so the day Ethereum Classic
     * became holdable, typing "ET" started offering it above Ethereum. Nothing
     * is hidden: the narrower one simply goes first, and the row that cannot
     * be drawn says so. */
    if (a.chartable !== b.chartable) return a.chartable ? -1 : 1;
    return a.coin.localeCompare(b.coin);
  });
  return results.slice(0, QUICK_SWITCH_MAX_RESULTS);
};

/* The ranges by what their buttons say, lower-cased: "1y" → "year". */
const quickRangeFor = (token) => {
  const t = String(token || "").toLowerCase();
  const o = PERIOD_OPTIONS.find((p) => p.label.toLowerCase() === t);
  return o ? o.value : null;
};

/* One token as a coin: the symbol itself, or the best prefix match. */
const quickCoinFor = (token, coinOptions) => {
  const t = String(token || "").toUpperCase();
  if (!t) return null;
  if (SUGGESTED_COINS.includes(t)) return { coin: t, owned: coinOptions.includes(t) };
  const m = quickSwitchMatches(t, coinOptions, null)[0];
  return m && m.score <= 2 ? { coin: m.coin, owned: m.owned } : null;
};

/* The command words: the English ones work in every language (they are the
   terminal's own), and the language's own word works too. */
const QUICK_COMPARE_WORDS = ["compare", "vs", "cmp", msg("qs_word_compare", "compare").toLowerCase()];
const QUICK_TARGET_WORDS = ["target", "alert", msg("qs_word_target", "target").toLowerCase()];
// How many suggestions a half-typed command offers
const QUICK_SUGGEST_MAX = 6;

/* A level a target might be set at: the price this far off, rounded to the
   three figures anybody would type. */
const quickRoundPrice = (v) => {
  if (!(v > 0)) return null;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 2);
  return Math.round(v / p) * p;
};

const quickCompareItem = (coin, name) => ({ kind: "compare", coin, name, id: `cmp-${coin}` });

/* What a typed line asks for, before any coin is looked up by name. Pure.
 * `commands` are `{ key, label }` — the shortcut list's single-key items;
 * `current` the coin on the chart and `price` its price, for the
 * suggestions. **A half-typed command suggests how it goes on** ("compare"
 * lists what can be compared, "target" a few levels around the price, "eth "
 * the ranges), and `hint` says the shape of the line in words. */
const quickCommandMatches = (query, coinOptions, commands, current, price) => {
  const raw = String(query || "");
  const q = raw.trim().toLowerCase();
  if (!q) return { lead: [], tail: [], hint: null };
  const tokens = q.split(/\s+/);
  const trailing = /\s$/.test(raw);
  const lead = [];
  const tail = [];
  let hint = null;
  const isCompare = QUICK_COMPARE_WORDS.includes(tokens[0]);
  const isTarget = QUICK_TARGET_WORDS.includes(tokens[0]);
  const ranges = (prefix) => PERIOD_OPTIONS.filter((o) => o.label.toLowerCase().startsWith(prefix));

  if (isCompare) {
    hint = msg("qs_hint_compare", "compare and a coin or a market — S&P 500, Nasdaq 100, gold");
    const t = (tokens[1] || "").toUpperCase();
    const markets = COMPARE_MARKETS.filter((m) => !t || m.id.toUpperCase().startsWith(t) || m.name.toUpperCase().startsWith(t) || (t === "SPX" && m.id === "SPYx") || (t === "NDX" && m.id === "QQQx"));
    const coins = t
      ? quickSwitchMatches(t, coinOptions, current).map((r) => r.coin)
      : coinOptions.filter((c) => c !== current);
    const items = [];
    if (t) for (const m of markets) items.push(quickCompareItem(m.id, m.name));
    for (const c of coins) items.push(quickCompareItem(c, COIN_NAMES[c] || c));
    if (!t) for (const m of markets) items.push(quickCompareItem(m.id, m.name));
    lead.push(...items.filter((i) => i.coin !== current).slice(0, QUICK_SUGGEST_MAX));
    return { lead, tail, hint };
  }

  if (isTarget) {
    hint = msg("qs_hint_target", "target and a price — or a move from here, like +5%");
    const arg = (tokens[1] || "").replace(/[,\s$]/g, "");
    const pctN = arg.endsWith("%") ? Number(arg.slice(0, -1)) : NaN;
    const pct = arg.length > 1 && Number.isFinite(pctN) ? pctN : null;
    if (pct != null && price > 0) {
      const at = quickRoundPrice(price * (1 + pct / 100));
      if (at) lead.push({ kind: "target", price: at, id: `t-${at}` });
    } else if (Number(arg) > 0 && isFinite(Number(arg))) {
      lead.push({ kind: "target", price: Number(arg), id: `t-${arg}` });
    } else if (!arg && price > 0) {
      for (const f of [1.05, 0.95, 1.1, 0.9]) {
        const at = quickRoundPrice(price * f);
        if (at) lead.push({ kind: "target", price: at, move: Math.round((f - 1) * 100), id: `t-${at}` });
      }
    }
    return { lead, tail, hint };
  }

  // A coin and a range — typed whole, half-typed, or the coin and a space
  const named = SUGGESTED_COINS.includes(tokens[0].toUpperCase());
  if (tokens.length === 2 || (tokens.length === 1 && trailing && named)) {
    const c = quickCoinFor(tokens[0], coinOptions);
    const want = tokens.length === 2 ? ranges(tokens[1]) : PERIOD_OPTIONS;
    if (c && want.length) {
      hint = msg("qs_hint_range", "a coin and a range — 1h, 1d, 1w, 1m, 1y or all");
      for (const o of want) lead.push({ kind: "coinRange", ...c, period: o.value, id: `cr-${c.coin}-${o.value}` });
    }
  }
  if (tokens.length === 1 && quickRangeFor(tokens[0])) {
    lead.push({ kind: "range", period: quickRangeFor(tokens[0]), id: `r-${tokens[0]}` });
  }
  /* The start of a command word offers the word, so Tab writes it out —
     "comp" is the coin COMP and also the start of "compare". */
  if (tokens.length === 1 && !trailing && q.length >= 2) {
    const verbs = [
      { word: msg("qs_word_compare", "compare").toLowerCase(), alt: "compare", kind: "compare" },
      { word: msg("qs_word_target", "target").toLowerCase(), alt: "target", kind: "target" },
    ];
    for (const v of verbs) {
      const word = [v.word, v.alt].find((w) => w.startsWith(q) && w !== q);
      if (word) lead.push({ kind: "verb", word, verb: v.kind, id: `v-${v.kind}` });
    }
  }
  if (tokens.length === 1) {
    for (const c of commands || []) {
      const label = String(c.label || "").toLowerCase();
      const at = label.indexOf(q);
      const wordStart = at === 0 || (at > 0 && /[\s—(-]/.test(label[at - 1]));
      if (q.length === 1 ? c.key.toLowerCase() !== q : !wordStart) continue;
      const item = { kind: "command", key: c.key, label: c.label, id: `k-${c.key}` };
      // A word typed out in full goes ahead of the coins; a fragment after
      if (q.length >= 3 && at === 0) lead.push(item);
      else tail.push(item);
    }
  }
  return { lead, tail, hint };
};

/* What Tab writes into the box for a row: the line that would run it, so
   the next word can be typed after it. */
const quickCompletion = (item) => {
  const range = (p) => ((PERIOD_OPTIONS.find((o) => o.value === p) || {}).label || "").toLowerCase();
  if (!item) return null;
  if (item.kind === "coin") return `${item.coin.toLowerCase()} `;
  if (item.kind === "coinRange") return `${item.coin.toLowerCase()} ${range(item.period)}`;
  if (item.kind === "range") return range(item.period);
  if (item.kind === "compare") return `compare ${item.coin.toLowerCase()}`;
  if (item.kind === "target") return `target ${item.price}`;
  if (item.kind === "command") return String(item.label || "").split(/[\s—]/)[0].toLowerCase();
  if (item.kind === "verb") return `${item.word} `;
  return null;
};

/* ── styles ────────────────────────────────────────────────────────────── */

const quickIn = keyframes`
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const QuickOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 18vh;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.75)"
      : "rgba(0, 0, 0, 0.75)"};
`;

const QuickCard = styled.div`
  width: min(28rem, calc(100vw - 2rem));
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  box-shadow: 0 8px 32px ${({ theme }) => theme.color.shadow};
  overflow: hidden;
  animation: ${quickIn} 0.18s cubic-bezier(0.22, 1, 0.36, 1);
`;

const QuickInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.85rem 1rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.95rem;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  &:focus {
    outline: none;
  }
`;

const QuickList = styled.div`
  max-height: 17rem;
  overflow-y: auto;
  ${themedScrollbar};
`;

const QuickRow = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  text-align: left;
  padding: 0.6rem 1rem;
  border: none;
  background: ${({ active, theme }) =>
    active ? theme.color.bg : "transparent"};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.bg};
  }
  ${touchRow};
`;

const QuickSym = styled.span`
  font-weight: 700;
  min-width: 3.5rem;
`;

const QuickName = styled.span`
  flex: 1;
  min-width: 0;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.78rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const QuickTag = styled.span`
  flex: 0 0 auto;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const QuickHint = styled.div`
  padding: 0.5rem 1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
  display: flex;
  gap: 1rem;
`;

/* The lines to try while nothing is typed, and the shape of a command being
   typed — both in the hint's own small type. */
const QuickTry = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const QuickTryChip = styled.button.attrs({ type: "button" })`
  padding: 0.2rem 0.55rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.72rem;
  cursor: pointer;
  ${touchTarget};
  /* On a finger the chip is the press itself: two wrapped rows of 22px chips
     sat 6px apart, so the lower half of "eth 1y" opened "monitor" — the
     36px box beneath each overlapped the row below (8 Oct 2026). */
  @media (pointer: coarse) {
    min-height: 2.25rem;
  }

  &:hover {
    background: ${({ theme }) => theme.color.bg};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
`;

const QuickShape = styled.div`
  padding: 0.45rem 1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const QuickEmpty = styled.div`
  padding: 1rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ── component ─────────────────────────────────────────────────────────── */

class QuickSwitch extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { query: "", index: 0 };
    this.inputRef = createRef();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleChange = this.handleChange.bind(this);
  }

  componentDidMount() {
    if (this.inputRef.current) this.inputRef.current.focus();
  }

  /* Commands the line asks for first, then a coin named outright, then the
     rest of the coins, then commands that only half match — at most the
     list's length. */
  matches() {
    const { query } = this.state;
    const { lead, tail, hint } = quickCommandMatches(query, this.props.coinOptions, this.props.commands, this.props.current, this.props.price);
    // A command being typed lists only how it goes on, not coins that happen to match its word
    const coins = hint && !/^[a-z]+\s+$/i.test(query) && lead.length && lead[0].kind !== "coinRange"
      ? []
      : quickSwitchMatches(query, this.props.coinOptions, null).map((r) => ({ kind: "coin", id: `c-${r.coin}`, ...r }));
    const exact = coins.filter((r) => r.coin === query.trim().toUpperCase());
    const rest = coins.filter((r) => !exact.includes(r));
    return { list: [...exact, ...lead, ...rest, ...tail].slice(0, QUICK_SWITCH_MAX_RESULTS), hint };
  }

  results() {
    return this.matches().list;
  }

  /* The lines to try, while nothing is typed: they fill the box rather than
     run, so the shape of a command is learned by seeing it written. */
  examples() {
    const coins = this.props.coinOptions || [];
    const other = coins.find((c) => c !== this.props.current) || "ETH";
    const monitor = (this.props.commands || []).find((c) => c.key === "M");
    return [
      `${other.toLowerCase()} 1y`,
      `compare ${other.toLowerCase()}`,
      "target +5%",
      monitor ? String(monitor.label).split(/[\s—]/)[0].toLowerCase() : null,
    ].filter(Boolean);
  }

  fill(text) {
    this.setState({ query: text, index: 0 });
    if (this.inputRef.current) this.inputRef.current.focus();
  }

  choose(item) {
    if (!item) return;
    // A command word is not a command yet: Enter writes it out, as Tab does
    if (item.kind === "verb") {
      this.fill(quickCompletion(item));
      return;
    }
    if (item.kind === "coin") this.props.onPick(item.coin, item.owned);
    else if (this.props.onCommand) this.props.onCommand(item);
  }

  handleChange(e) {
    this.setState({ query: e.target.value, index: 0 });
  }

  handleKeyDown(e) {
    const results = this.results();
    if (e.key === "Escape") {
      e.preventDefault();
      this.props.onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this.setState((s) => ({
        index: results.length ? (s.index + 1) % results.length : 0,
      }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.setState((s) => ({
        index: results.length
          ? (s.index - 1 + results.length) % results.length
          : 0,
      }));
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.choose(results[this.state.index]);
    } else if (e.key === "Tab" && !e.shiftKey) {
      /* Tab writes the highlighted row's line into the box — the
         terminal's completion — so the next word can follow it. */
      const text = quickCompletion(results[this.state.index]);
      if (text && text !== this.state.query) {
        e.preventDefault();
        this.fill(text);
      }
    }
  }

  /* What a row says, by what it does. */
  rowParts(r) {
    const range = (p) => (PERIOD_OPTIONS.find((o) => o.value === p) || {}).label || p;
    const sym = (t) => React.createElement(QuickSym, { key: "s" }, t);
    const name = (t) => React.createElement(QuickName, { key: "n" }, t);
    const tag = (t) => React.createElement(QuickTag, { key: "t" }, t);
    if (r.kind === "verb") {
      return [
        sym("…"),
        name(r.verb === "compare" ? msg("qs_verb_compare", "$1 — then a coin or a market", r.word) : msg("qs_verb_target", "$1 — then a price", r.word)),
        tag(msg("qs_tag_tab", "tab")),
      ];
    }
    if (r.kind === "coin") return [sym(r.coin), name(COIN_NAMES[r.coin] || r.coin), !r.owned ? tag(msg("qs_tag_add", "add")) : null];
    if (r.kind === "coinRange") return [sym(r.coin), name(msg("qs_on_range", "$1 on $2", COIN_NAMES[r.coin] || r.coin, range(r.period))), tag(range(r.period))];
    if (r.kind === "range") return [sym(range(r.period)), name(msg("qs_range", "This coin on $1", range(r.period))), tag(msg("qs_tag_range", "range"))];
    if (r.kind === "compare") return [sym("vs"), name(msg("qs_compare", "Compare with $1", r.name)), tag(r.coin)];
    if (r.kind === "target") {
      const move = Number.isFinite(r.move) ? ` (${r.move > 0 ? "+" : "−"}${Math.abs(r.move)}%)` : "";
      return [sym("→"), name(msg("qs_target", "A price target at $1", r.price.toLocaleString()) + move), tag(msg("qs_tag_target", "target"))];
    }
    return [sym(keyCap(r.key, { quiet: true })), name(r.label), tag(msg("qs_tag_command", "command"))];
  }

  render() {
    const { list: results, hint } = this.matches();
    const { index } = this.state;
    const empty = !this.state.query.trim();
    return React.createElement(
      QuickOverlay,
      {
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) this.props.onClose();
        },
      },
      React.createElement(
        QuickCard,
        null,
        React.createElement(QuickInput, {
          innerRef: this.inputRef,
          type: "text",
          value: this.state.query,
          placeholder: msg("qs_command_placeholder", "A coin or a command…"),
          "aria-label": msg("qs_command_label", "Jump to a coin or run a command"),
          onChange: this.handleChange,
          onKeyDown: this.handleKeyDown,
        }),
        results.length === 0
          ? React.createElement(
              QuickEmpty,
              null,
              msg("qs_no_match_command", "No coin or command matches that."),
            )
          : React.createElement(
              QuickList,
              null,
              results.map((r, i) =>
                React.createElement(
                  QuickRow,
                  {
                    key: r.id,
                    active: i === index,
                    "data-quick-kind": r.kind,
                    onMouseEnter: () => this.setState({ index: i }),
                    onClick: () => this.choose(r),
                  },
                  ...this.rowParts(r),
                ),
              ),
            ),
        empty &&
          React.createElement(
            QuickTry,
            { "data-quick-try": "true" },
            React.createElement(QuickTag, null, msg("qs_try", "Try")),
            ...this.examples().map((t) =>
              React.createElement(QuickTryChip, { key: t, onClick: () => this.fill(t) }, t),
            ),
          ),
        hint && React.createElement(QuickShape, { "data-quick-hint": "true" }, hint),
        React.createElement(
          QuickHint,
          null,
          React.createElement("span", null, msg("qs_hint_move", "↑↓ move")),
          React.createElement("span", null, msg("qs_hint_tab", "⇥ complete")),
          React.createElement("span", null, msg("qs_hint_select", "↵ go")),
          React.createElement("span", null, msg("qs_hint_close", "esc close")),
        ),
      ),
    );
  }
}

QuickSwitch.defaultProps = {
  coinOptions: [],
  commands: [],
  current: null,
  price: null,
  onCommand: null,
};
