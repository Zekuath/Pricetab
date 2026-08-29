/* ONBOARDING TOUR
 * First-run spotlight tour. Highlights the real UI (live price, period
 * switcher, settings gear) with a dimmed backdrop + cutout, one step at a
 * time. Shown once, then remembered via ONBOARDING_SEEN_KEY in localStorage.
 * Skippable at any point, and replayable from Settings.
 *
 * The step order follows the eye down the page — the chart readouts first,
 * then the four buttons around it, then Settings — instead of hopping across
 * the screen. Every step that has a key names it (`keys`), because the
 * shortcuts are what the extension is actually good at and the tour is the
 * only place a first-time user will meet them.
 *
 * Step fields:
 *   selector  target to cut out of the dim; null renders a centred card
 *   optional  the target may legitimately not exist yet (a fresh install has
 *             no widgets on, so there is no widget row to point at). Those
 *             steps fall back to a centred card instead of being skipped —
 *             the step that explains how to turn a thing on must not be the
 *             one that disappears because it is off.
 *   keys      shortcut chips under the title
 *   keyGrid   the closing step's mini shortcut list
 */
const ONBOARDING_STEPS = [
  {
    selector: null,
    chapter: msg("tour_chapter_start_here", "Start here"),
    title: msg("tour_title_welcome_to_pricetab", "Welcome to PriceTab"),
    text: msg("tour_text_01", "Live crypto charts on every new tab, asking for nothing — no account, no permissions, and nothing about you leaving this device. This tour is twenty short steps in five chapters. Skip it whenever you like; Settings → Preferences can replay it."),
  },

  {
    selector: '[data-tour="price"]',
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_live_price", "Live price"),
    text: msg("tour_text_02", "Your active coin and its live price, refreshed while the tab is open and paused while it is not. Click it, or use the arrow keys, to move through your coin list."),
    keys: ["\u2190", "\u2192"],
  },
  {
    selector: '[data-tour="change"]',
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_change", "Change"),
    text: msg("tour_text_03", "How the price moved across the range on screen — not a fixed 24 hours. Click it to flip between a percentage and an amount."),
    keys: ["X"],
  },
  {
    selector: '[data-tour="period"]',
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_time_range", "Time range"),
    text: msg("tour_text_04", "The last hour through all time. Each range keeps its own settings — the board you set up on 1H is still there when you come back to it."),
    keys: ["1", "\u2013", "6"],
  },
  {
    selector: null,
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_jump_to_any_coin", "Jump to any coin"),
    text: msg("tour_text_05", "Type a symbol or a name. Your own coins rank first, and picking one you do not track yet adds it. The same search chooses a coin for a price target."),
    keys: ["/"],
  },
  {
    selector: '[data-tour="compare"]',
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_compare_two_coins", "Compare two coins"),
    text: msg("tour_text_06", "Both drawn as percent change from the start of the range, on one shared scale — never two axes, which is the trick that makes any two lines look related. Press C again or Esc to drop it."),
    keys: ["C"],
  },
  {
    selector: null,
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_two_more_ways_to_read_it", "Two more ways to read it"),
    text: msg("tour_text_07", "T swaps the line for candlesticks. G puts a price and time mesh behind the chart so you can read a level off it. Under the price sits the range high and low, and the volume-weighted average price when the candle data happens to be loaded — it is never fetched just for that."),
    keys: ["T", "G"],
  },
  {
    selector: null,
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_what_happened_here", "What happened here?"),
    text: msg("tour_text_08", "Off by default, in Settings → Chart. It marks the moments the price did something unusual for this coin — measured against its own volatility, so it is right on a quiet stablecoin and on a wild one — and a click shows the headlines published around that day. It never claims they are the cause, because nobody knows that."),
  },

  {
    selector: '[data-tour="calls"]',
    chapter: msg("tour_chapter_calling_a_square", "Calling a square"),
    title: msg("tour_title_say_where_you_think_it_goes", "Say where you think it goes"),
    text: msg("tour_text_09", "A call is a claim: this coin, in this price band, at this time. It settles itself on a later tab and goes on a record you keep. Nothing is scored, nothing is worth anything, and nothing leaves the device — it is a way to find out whether you are actually any good."),
    keys: ["K"],
  },
  {
    selector: null,
    chapter: msg("tour_chapter_calling_a_square", "Calling a square"),
    title: msg("tour_title_the_board", "The board"),
    text: msg("tour_text_10", "Turn calls on and the chart grows a board of squares to the right of now. Hover one, click once to draft it, click again to lock it — two clicks, because one stray click should not commit a prediction. Drag the dotted now line to trade history for board, and use the pill at its top right to change what one square is worth."),
    keys: ["L", "[", "\u2013", "]"],
  },
  {
    selector: null,
    chapter: msg("tour_chapter_calling_a_square", "Calling a square"),
    title: msg("tour_title_how_far_it_usually_travels", "How far it usually travels"),
    text: msg("tour_text_11", "In the calls panel under Show there is a travel band. It shades the distances this coin has actually covered over each square's worth of time — the middle half and the middle 80%. It is deliberately not a forecast: the direction is stripped out of the figures before they are drawn, so a coin that rose all week still gets a band that leans neither way. It answers whether a square is a near-certainty or a long shot, which is a different question on every coin."),
  },

  {
    selector: '[data-tour="portfolio"]',
    chapter: msg("tour_chapter_your_money", "Your money"),
    title: msg("tour_title_portfolio", "Portfolio"),
    text: msg("tour_text_12", "Amounts you type in, with purchases and sales if you want cost basis and profit. FIFO, LIFO or HIFO — a reporting method, not a tax calculation, and the report says which method every line used. Everything is stored on this device and there is no wallet to connect."),
    keys: ["P"],
  },
  {
    selector: null,
    chapter: msg("tour_chapter_your_money", "Your money"),
    title: msg("tour_title_or_watch_an_address", "Or watch an address"),
    text: msg("tour_text_13", "Paste a public Bitcoin, Ethereum, Litecoin, Dogecoin, Bitcoin Cash or Zcash address and the balance is read for you — including the ERC-20 tokens an Ethereum address holds, in one request. The address is only ever sent to the balance service, and if a chain cannot be read PriceTab says which chain it is rather than telling you to check a perfectly good address."),
  },
  {
    selector: '[data-tour="alerts"]',
    chapter: msg("tour_chapter_your_money", "Your money"),
    title: msg("tour_title_price_targets", "Price targets"),
    text: msg("tour_text_14", "Tell me when BTC rises above a number, or moves 5% in a day, or when everything I hold is worth less than X. You are told on your next new tab, and a hit overnight is still found because the check looks back through the week. Nothing is pushed at you, which is how the extension stays permission-free."),
    keys: ["A"],
  },

  {
    selector: '[data-tour="news"]',
    chapter: msg("tour_chapter_reading_the_market", "Reading the market"),
    title: msg("tour_title_news", "News"),
    text: msg("tour_text_15", "Every headline with its source, its age and a summary, newest first, narrowed by coin or by source or by typing. A source that has stopped publishing shows its own age in red — a dead feed looking exactly like a live one is the thing this was built for. Advertising is dropped rather than badged."),
    keys: ["N"],
  },
  {
    selector: null,
    chapter: msg("tour_chapter_reading_the_market", "Reading the market"),
    title: msg("tour_title_has_this_happened_before", "Has this happened before?"),
    text: msg("tour_text_16", "Reads years of this coin's daily closes and counts what followed each time it was in a given state. Every figure carries how many times it is based on, and where that number is small it refuses to draw a conclusion. It will never tell you to buy or sell — nine textbook rules tested over 21,669 daily closes produced nothing that survived proper correction, and saying so is more useful than an arrow."),
    keys: ["B"],
  },
  {
    selector: '[data-tour="widgets"]',
    optional: true, // nothing to point at until a widget is switched on
    chapter: msg("tour_chapter_reading_the_market", "Reading the market"),
    title: msg("tour_title_widgets", "Widgets"),
    text: msg("tour_text_17", "Watchlist, Fear & Greed, funding, open interest, network fees, the worst fall in the range and more. Switch them on in Settings → Widgets, where there are ready-made bundles, then drag to reorder or hover one and click its × to hide that card."),
  },
  {
    selector: '[data-tour="widget-toggle"]',
    // Deliberately not `optional`: this step describes a button, so with no
    // button on screen it has nothing to say and is better skipped. The step
    // before it is the one that has to survive, and it does.
    chapter: msg("tour_chapter_reading_the_market", "Reading the market"),
    title: msg("tour_title_clear_the_row", "Clear the row"),
    text: msg("tour_text_18", "Clears every widget at once and brings them all back. Nothing is switched off, so they return exactly as you arranged them."),
    keys: ["W"],
  },

  {
    selector: '[data-tour="settings"]',
    chapter: msg("tour_chapter_making_it_yours", "Making it yours"),
    title: msg("tour_title_everything_else_lives_here", "Everything else lives here"),
    text: msg("tour_text_19", "Coins, currency, theme, widgets and the tickers, with a search box at the top of Preferences. The modes row sets a dozen of them at once — Minimal, Fast, Trader, Holder — and never touches your currency, number format or theme."),
    keys: ["S"],
  },
  {
    selector: null,
    chapter: msg("tour_chapter_making_it_yours", "Making it yours"),
    title: msg("tour_title_it_is_faster_from_the_keyboard", "It is faster from the keyboard"),
    text: msg("tour_keys_intro", "Press ? at any time for the full list. A few worth knowing now:"),
    keyGrid: [
      { keys: ["D"], label: "Light or dark" },
      { keys: ["Space"], label: msg("tour_key_rotate", "Rotate through your coins") },
      { keys: ["R"], label: "Refresh now" },
      { keys: ["Esc"], label: msg("sc_close_open", "Close whatever is open") },
    ],
  },
];


const SPOTLIGHT_PADDING = 8; // px of breathing room around the highlighted element
const TIP_WIDTH = 300; // px, tooltip max width
const TIP_GAP = 14; // px between cutout and tooltip
const VIEWPORT_MARGIN = 12; // px, keep tooltip off the screen edges
const CHARS_PER_LINE = 38; // rough wrap width of the card's body text
const LINE_HEIGHT = 18; // px per wrapped line, for the height estimate

// Matches the panelLift / widgetAppear entrances used across the app
const onbCardIn = keyframes`
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

// Transparent layer that swallows page clicks so the user drives the tour
const OnbBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: ${({ dim }) => (dim ? "rgba(0, 0, 0, 0.72)" : "transparent")};
  transition: background 0.35s ease;
`;

// The cutout: a box-shadow spread paints the dim everywhere except this hole
const OnbSpotlight = styled.div`
  position: fixed;
  z-index: 2147483001;
  border-radius: 10px;
  pointer-events: none;
  box-shadow:
    0 0 0 9999px rgba(0, 0, 0, 0.72),
    0 0 0 2px ${({ theme }) => theme.color.borderHover};
  transition:
    top 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    left 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.35s cubic-bezier(0.22, 1, 0.36, 1);
`;

const OnbCard = styled.div`
  position: fixed;
  z-index: 2147483002;
  width: ${TIP_WIDTH}px;
  max-width: calc(100vw - ${VIEWPORT_MARGIN * 2}px);
  box-sizing: border-box;
  padding: 1rem 1.1rem 0.9rem;
  overflow: hidden; /* keeps the progress bar inside the rounded corners */
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  box-shadow: 0 10px 40px ${({ theme }) => theme.color.shadow};
  font-family: ${({ theme }) => theme.font.primary};
  animation: ${onbCardIn} 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  transition:
    top 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    left 0.35s cubic-bezier(0.22, 1, 0.36, 1);
`;

/* Which chapter this step is in.
 *
 * Twenty steps is a lot to be walked through, and a bare "7 / 20" says how far
 * you have to go without saying what any of it is about. The chapter name
 * turns the same twenty into five short subjects, so somebody who only wants
 * the chart knows the moment the tour has left it — and Skip is always one
 * click away. A tour long enough to be worth taking has to be navigable, and
 * an eyebrow costs one line. */
const OnbChapter = styled.div`
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.3rem;
`;

const OnbTitle = styled.div`
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.4rem;
`;

const OnbText = styled.div`
  font-size: 0.82rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.9rem;
`;

/* Key chips. Same visual language as the "?" reference so the two read as
 * one system — a key the tour taught is recognisable in the list later. */
const OnbKey = styled.kbd`
  min-width: 1.3rem;
  padding: 0.1rem 0.32rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-bottom-width: 2px;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.bg};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  text-align: center;
  color: ${({ theme }) => theme.color.text};
`;

const OnbKeyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.55rem;
`;

const OnbKeySep = styled.span`
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// The closing step's mini shortcut list
const OnbGrid = styled.div`
  margin-bottom: 0.9rem;
`;

const OnbGridRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.22rem 0;
  font-size: 0.76rem;
  color: ${({ theme }) => theme.color.text};
`;

const OnbGridKeys = styled.div`
  flex: 0 0 3.6rem; /* wide enough for the longest chip ("Space") */
  display: flex;
  gap: 0.2rem;
`;

const OnbFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

/* Progress. A dot per step stopped scaling once the tour covered everything
 * the extension does — eleven dots crowd the footer out of a 300px card — so
 * it is a line along the card's bottom edge plus a quiet counter. */
const OnbProgressTrack = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: ${({ theme }) => theme.color.border};
`;

const OnbProgressFill = styled.div`
  height: 100%;
  background: ${({ theme }) => theme.color.text};
  transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
`;

const OnbCount = styled.div`
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const OnbButtons = styled.div`
  display: flex;
  gap: 0.4rem;
`;

const OnbSkip = styled.button.attrs({ type: "button" })`
  background: none;
  border: none;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.74rem;
  color: ${({ theme }) => theme.color.textSecondary};
  padding: 0.4rem 0.2rem;
  transition: color 0.15s ease;
  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

const OnbBtn = styled.button.attrs({ type: "button" })`
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  border: 1px solid
    ${({ theme, primary }) => (primary ? theme.color.text : theme.color.border)};
  background: ${({ theme, primary }) =>
    primary ? theme.color.text : "transparent"};
  color: ${({ theme, primary }) => (primary ? theme.color.bg : theme.color.text)};
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
    background: ${({ theme, primary }) =>
      primary ? theme.color.text : theme.color.bg};
    transform: translateY(-1px);
  }
  &:active {
    transform: translateY(0);
  }
`;

class OnboardingTour extends React.Component {
  constructor(props) {
    super(props);
    this.state = { active: false, step: 0, rect: null };
    this.handleResize = this.handleResize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.startTimer = null;
    this.rafId = null;
  }

  componentDidMount() {
    // `replay` is Settings asking for the tour again — it ignores the flag
    if (!this.props.replay) {
      let seen = false;
      try {
        seen = localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
      } catch (e) {
        seen = false;
      }
      if (seen) return;
    }
    // Let the app finish its first render (skeleton -> real elements) first
    this.startTimer = setTimeout(
      () => {
        this.setState({ active: true, step: 0 }, () => this.measure());
        this.announce(true);
        window.addEventListener("resize", this.handleResize);
        window.addEventListener("keydown", this.handleKeyDown);
      },
      this.props.replay ? 120 : 600,
    );
  }

  componentWillUnmount() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.state.active) this.announce(false);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  // The app owns the global shortcut handler; while the tour drives the
  // arrow keys and Esc itself, it has to know to stand down.
  announce(active) {
    if (this.props.onActiveChange) this.props.onActiveChange(active);
  }

  // Locate the current step's target; retry across a few frames while the
  // app swaps skeletons for real content.
  measure(retries) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    // The generous retry budget is only for the opening steps, which race the
    // app swapping its skeleton for real content. Later on the page has
    // settled, so a target that isn't there won't appear — waiting the full
    // budget would just leave a step the user is about to skip past on screen.
    const tries =
      typeof retries === "number" ? retries : this.state.step <= 1 ? 12 : 2;
    const step = ONBOARDING_STEPS[this.state.step];
    if (!step || !step.selector) {
      this.setState({ rect: null });
      return;
    }
    const el = document.querySelector(step.selector);
    if (el) {
      const r = el.getBoundingClientRect();
      this.setState({
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      });
      return;
    }
    if (tries > 0) {
      this.rafId = requestAnimationFrame(() => this.measure(tries - 1));
    } else if (step.optional) {
      // Nothing to point at yet — the step still has something to say, so
      // show it centred rather than dropping it
      this.setState({ rect: null });
    } else {
      // Target never showed up — skip past it rather than blocking the tour
      this.goNext();
    }
  }

  handleResize() {
    if (this.state.active) this.measure(0);
  }

  handleKeyDown(e) {
    if (!this.state.active) return;
    if (
      e.key !== "Escape" &&
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "Enter" &&
      e.key !== " "
    ) {
      return;
    }
    e.preventDefault(); // Space would scroll the page out from under the tour
    if (e.key === "Escape") this.finish();
    else if (e.key === "ArrowLeft") this.goPrev();
    else this.goNext();
  }

  goNext() {
    if (this.state.step >= ONBOARDING_STEPS.length - 1) {
      this.finish();
      return;
    }
    this.setState({ step: this.state.step + 1, rect: null }, () =>
      this.measure(),
    );
  }

  goPrev() {
    if (this.state.step <= 0) return;
    this.setState({ step: this.state.step - 1, rect: null }, () =>
      this.measure(),
    );
  }

  finish() {
    try {
      localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    } catch (e) {
      /* localStorage unavailable — tour just won't persist */
    }
    window.removeEventListener("keydown", this.handleKeyDown);
    this.setState({ active: false });
    this.announce(false);
    // Lets the app drop the replay request, so closing Settings later
    // doesn't remount this and start the tour over
    if (this.props.onFinish) this.props.onFinish();
  }

  // Position the tooltip relative to the cutout (or center it when there's none)
  cardStyle() {
    const { rect } = this.state;
    const step = ONBOARDING_STEPS[this.state.step] || {};
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Rough card height. The steps vary a lot now — two lines of text or
    // six, with or without key chips — and a fixed guess would place a tall
    // card off the bottom of the screen, so estimate from the content.
    const estHeight =
      100 +
      Math.ceil((step.text || "").length / CHARS_PER_LINE) * LINE_HEIGHT +
      (step.keys ? 28 : 0) +
      (step.keyGrid ? step.keyGrid.length * 26 + 10 : 0);
    if (!rect) {
      return {
        top: Math.max(VIEWPORT_MARGIN, vh / 2 - estHeight / 2),
        left: Math.max(VIEWPORT_MARGIN, vw / 2 - TIP_WIDTH / 2),
      };
    }
    const holeTop = rect.top - SPOTLIGHT_PADDING;
    const holeBottom = rect.top + rect.height + SPOTLIGHT_PADDING;
    let top;
    if (holeBottom + TIP_GAP + estHeight <= vh - VIEWPORT_MARGIN) {
      top = holeBottom + TIP_GAP; // below the target
    } else if (holeTop - TIP_GAP - estHeight >= VIEWPORT_MARGIN) {
      top = holeTop - TIP_GAP - estHeight; // above the target
    } else {
      top = Math.max(VIEWPORT_MARGIN, vh / 2 - estHeight / 2);
    }
    // Last resort: a card taller than the estimate still must not hang off
    // the bottom, where its Next button would be unreachable
    top = Math.min(
      top,
      Math.max(VIEWPORT_MARGIN, vh - estHeight - VIEWPORT_MARGIN),
    );
    let left = rect.left + rect.width / 2 - TIP_WIDTH / 2;
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, vw - TIP_WIDTH - VIEWPORT_MARGIN),
    );
    return { top: top, left: left };
  }

  render() {
    const { active, step, rect } = this.state;
    if (!active) return null;
    const current = ONBOARDING_STEPS[step];
    if (!current) return null;
    const isLast = step === ONBOARDING_STEPS.length - 1;
    const children = [
      React.createElement(OnbBackdrop, { key: "bg", dim: !rect }),
    ];
    if (rect) {
      children.push(
        React.createElement(OnbSpotlight, {
          key: "hole",
          style: {
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
          },
        }),
      );
    }
    children.push(
      React.createElement(
        OnbCard,
        { key: "card", style: this.cardStyle() },
        current.chapter
          ? React.createElement(OnbChapter, null, current.chapter)
          : null,
        React.createElement(OnbTitle, null, current.title),
        current.keys &&
          React.createElement(
            OnbKeyRow,
            null,
            current.keys.map((key, i) =>
              // A bare dash is a range ("1 – 6"), not a key to press
              key === "–"
                ? React.createElement(OnbKeySep, { key: i }, "–")
                : React.createElement(OnbKey, { key: i }, key),
            ),
          ),
        React.createElement(OnbText, null, current.text),
        current.keyGrid &&
          React.createElement(
            OnbGrid,
            null,
            current.keyGrid.map((row) =>
              React.createElement(
                OnbGridRow,
                { key: row.label },
                React.createElement(
                  OnbGridKeys,
                  null,
                  row.keys.map((key, i) =>
                    React.createElement(OnbKey, { key: i }, key),
                  ),
                ),
                row.label,
              ),
            ),
          ),
        React.createElement(
          OnbFooter,
          null,
          // On the last step there is nothing left to skip past
          !isLast &&
            React.createElement(
              OnbSkip,
              { type: "button", onClick: () => this.finish() },
              msg("tour_skip", "Skip tour"),
            ),
          React.createElement(
            OnbCount,
            { "aria-label": `Step ${step + 1} of ${ONBOARDING_STEPS.length}` },
            `${step + 1} / ${ONBOARDING_STEPS.length}`,
          ),
          React.createElement(
            OnbButtons,
            null,
            step > 0 &&
              React.createElement(
                OnbBtn,
                { type: "button", onClick: () => this.goPrev() },
                msg("tour_back", "Back"),
              ),
            React.createElement(
              OnbBtn,
              { type: "button", primary: true, onClick: () => this.goNext() },
              isLast ? msg("tour_done", "Done") : msg("tour_next", "Next"),
            ),
          ),
        ),
        React.createElement(
          OnbProgressTrack,
          null,
          React.createElement(OnbProgressFill, {
            style: {
              width: `${((step + 1) / ONBOARDING_STEPS.length) * 100}%`,
            },
          }),
        ),
      ),
    );
    return React.createElement(React.Fragment, null, children);
  }
}
