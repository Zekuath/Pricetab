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
/* The steps, named, so the first-run tour and the "what's new" tour of an
 * update can share them (1 Oct 2026: the tour refreshed — moving around the
 * chart, the tools, the companion, the news preview, pinned widgets and the
 * optional alarm are in it; the travel band and "what happened here?" left
 * it for the calls drawer and Settings, where they live). */
const TOUR = {
  welcome: {
    selector: null,
    chapter: msg("tour_chapter_start_here", "Start here"),
    title: msg("tour_title_welcome_to_pricetab", "Welcome to PriceTab"),
    text: msg(
      "tour_text_welcome_2",
      "Live crypto prices on every new tab. No account, no permissions at install, and nothing about you leaves this device. A few short steps — skip whenever you like.",
    ),
  },
  price: {
    selector: '[data-tour="price"]',
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_live_price", "Live price"),
    text: msg("tour_text_price_2", "Your coin's live price. Click it, or press ← →, to step through your coins."),
    phoneText: msg("tour_text_price_phone", "Your coin's live price. Tap it to step to the next coin in your list."),
    keys: ["\u2190", "\u2192"],
  },
  range: {
    selector: '[data-tour="period"]',
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_time_range", "Time range"),
    text: msg("tour_text_range_2", "From the last hour to all time. Each range keeps its own view and its own board."),
    keys: ["1", "\u2013", "6"],
  },
  drag: {
    selector: '[data-tour="chart"]',
    chapter: msg("tour_chapter_the_chart", "The chart"),
    title: msg("tour_title_move_around", "Move around it"),
    text: msg("tour_text_drag_2", "Drag through time and price. The wheel zooms where you point; a double-click puts it all back."),
    phoneText: msg("tour_text_drag_phone", "Drag through time and price, pinch to zoom, and double-tap to put it back. Hold a finger still to read a point."),
    keys: ["+", "\u2212"],
  },
  calls: {
    selector: '[data-tour="calls"]',
    phoneSelector: '[data-phone-tab="calls"]',
    chapter: msg("tour_chapter_calls_targets", "Calls & targets"),
    title: msg("tour_title_say_where_you_think_it_goes", "Say where you think it goes"),
    text: msg("tour_text_calls_2", "Turn calls on and a board of squares grows past now, each with its chance. Click a square twice to lock a call; it settles itself and goes on a record only you keep."),
    phoneText: msg("tour_text_calls_phone", "Turn calls on and a board of squares grows past now, each with its chance. Tap a square to draft a call and lock it from the sheet; it settles itself and goes on a record only you keep."),
    keys: ["K"],
  },
  targets: {
    selector: '[data-tour="alerts"]',
    phoneSelector: '[data-phone-tab="targets"]',
    chapter: msg("tour_chapter_calls_targets", "Calls & targets"),
    title: msg("tour_title_price_targets", "Price targets"),
    text: msg("tour_text_targets_2", "Be told when a price is reached or a coin moves 5% in a day. A click on the chart picks the price; the alarm can add a notification and a tone."),
    phoneText: msg("tour_text_targets_phone", "Be told when a price is reached or a coin moves 5% in a day; the alarm can add a notification and a tone."),
    keys: ["A"],
  },
  portfolio: {
    selector: '[data-tour="portfolio"]',
    phoneSelector: '[data-phone-tab="portfolio"]',
    chapter: msg("tour_chapter_your_money", "Your money"),
    title: msg("tour_title_portfolio", "Portfolio"),
    text: msg("tour_text_portfolio_2", "What you hold, with cost and profit when you add purchases — or a public address, read for you. Stored on this device; no wallet to connect."),
    keys: ["P"],
  },
  market: {
    selector: '[data-tour="news"]',
    phoneSelector: '[data-phone-tab="more"]',
    chapter: msg("tour_chapter_reading_the_market", "Reading the market"),
    title: msg("tour_title_read_market", "News and the monitor"),
    text: msg("tour_text_market_2", "News with its source and age, advertising dropped. The monitor (M) lays your coins side by side, maps the market, and counts what followed days like today."),
    phoneText: msg("tour_text_market_phone", "Under More: news with its source and age, and the monitor — your coins side by side, the market map, and what followed days like today."),
    keys: ["N", "M"],
  },
  widgets: {
    selector: '[data-tour="widgets"]',
    phoneSelector: '[data-phone-tab="more"]',
    optional: true,
    chapter: msg("tour_chapter_reading_the_market", "Reading the market"),
    title: msg("tour_title_widgets", "Widgets"),
    text: msg("tour_text_widgets_2", "Fear & Greed, funding, fees and more as cards, each in three sizes that show different things. Hold or right-click a card to change it."),
    phoneText: msg("tour_text_widgets_phone", "Fear & Greed, funding, fees and more as cards, each in three sizes that show different things — under More. Hold a card to change it."),
    keys: ["W"],
  },
  settings: {
    selector: '[data-tour="settings"]',
    phoneSelector: '[data-phone-tab="more"]',
    chapter: msg("tour_chapter_making_it_yours", "Making it yours"),
    title: msg("tour_title_everything_else_lives_here", "Everything else lives here"),
    text: msg("tour_text_settings_2", "Coins, currency, theme, the alarm and the rest, with a search box. Press ? there for every key."),
    phoneText: msg("tour_text_settings_phone", "Coins, currency, theme, the alarm and the rest, with a search box — under More."),
    keys: ["S"],
  },
  /* The last step offers a starting setup — a mode, applied through the
     same handler as Settings' Modes — and the deeper tour. */
  finale: {
    selector: null,
    finale: true,
    chapter: msg("tour_chapter_making_it_yours", "Making it yours"),
    title: msg("tour_title_pick_setup", "Pick a starting point"),
    text: msg("tour_text_pick_setup", "A mode sets a dozen settings at once; change any of them later. Or keep it as it is."),
  },

  /* The deeper tour, offered from the last step: the tools a first run does
     not need. */
  compare: {
    selector: '[data-tour="compare"]',
    chapter: msg("tour_chapter_more", "More"),
    title: msg("tour_title_compare_two_coins", "Compare two coins"),
    text: msg("tour_text_compare_2", "Lay another coin, or the S&P 500, the Nasdaq 100 or gold, over the chart — both as percent change on one scale, never two axes."),
    keys: ["C"],
  },
  tools: {
    selector: '[data-tour="tools"]',
    optional: true,
    chapter: msg("tour_chapter_more", "More"),
    title: msg("tour_title_draw_measure", "Draw and measure"),
    text: msg("tour_text_tools_2", "The + at the end of the range row opens the tools: a ruler that counts how often a move that size happened, and lines, boxes and notes that stay with the coin."),
  },
  twoWays: {
    selector: null,
    desktopOnly: true,
    chapter: msg("tour_chapter_more", "More"),
    title: msg("tour_title_two_more_ways_to_read_it", "Two more ways to read it"),
    text: msg("tour_text_two_ways_2", "T swaps the line for candlesticks; G puts a price and time mesh behind the chart. Both are in the chart's settings too (V)."),
    keys: ["T", "G", "V"],
  },
  companion: {
    selector: null,
    chapter: msg("tour_chapter_more", "More"),
    title: msg("tour_title_companion", "A companion that counts"),
    text: msg("tour_text_companion_2", "Switch on the companion in the chart's settings and it names the patterns and setups it finds, each with what followed on this coin — most did no better than an ordinary day, and it says so."),
  },
  jump: {
    selector: null,
    desktopOnly: true,
    chapter: msg("tour_chapter_more", "More"),
    title: msg("tour_title_jump_to_any_coin", "Jump to any coin"),
    text: msg("tour_text_jump_2", "Type a symbol or a name; picking a coin you do not track adds it. It also takes commands — try “eth 1w” or “compare spx”."),
    keys: ["/"],
  },
  keyboard: {
    selector: null,
    desktopOnly: true,
    chapter: msg("tour_chapter_more", "More"),
    title: msg("tour_title_it_is_faster_from_the_keyboard", "It is faster from the keyboard"),
    text: msg("tour_keys_intro", "Press ? at any time for the full list. A few worth knowing now:"),
    keyGrid: [
      { keys: ["D"], label: msg("tour_key_theme", "Light or dark") },
      { keys: ["Space"], label: msg("tour_key_rotate", "Rotate through your coins") },
      { keys: ["R"], label: msg("tour_key_refresh", "Refresh now") },
      { keys: ["Esc"], label: msg("sc_close_open", "Close whatever is open") },
    ],
  },
  whatsNew: {
    selector: null,
    chapter: msg("tour_chapter_whats_new", "What's new"),
    title: msg("tour_title_whats_new", "PriceTab has been updated"),
    text: msg(
      "tour_text_whats_new",
      "A few short steps on what changed since your last version. Skip it whenever you like; Settings can replay the whole tour.",
    ),
  },
};

/* **The first-run tour, short** (18 Oct 2026). It was twenty steps, some
 * ninety words long, eight of them pointing at nothing; on a phone it showed
 * key caps and pulled both side columns over the chart. Now: ten steps, one
 * idea each, every one but the first and last on the thing it names — on a
 * phone, the tab bar's own items — and the rest offered at the end. */
const ONBOARDING_STEPS = [
  TOUR.welcome,
  TOUR.price,
  TOUR.range,
  TOUR.drag,
  TOUR.calls,
  TOUR.targets,
  TOUR.portfolio,
  TOUR.market,
  TOUR.widgets,
  TOUR.settings,
  TOUR.finale,
];

// The deeper tour, from the last step's "More tips"
const TOUR_MORE_STEPS = [
  TOUR.compare,
  TOUR.tools,
  TOUR.twoWays,
  TOUR.companion,
  TOUR.jump,
  TOUR.keyboard,
];

/* **What's new, once per edition** (1 Oct 2026): the steps of the tour
 * that changed, shown once to somebody who had already taken it — and only
 * to an install at least a day old, so a first run never gets both. Bump
 * `WHATS_NEW_ID` with a release that deserves one, and list its steps here. */
const WHATS_NEW_ID = "2026-10";
const WHATS_NEW_STEPS = [
  TOUR.whatsNew,
  TOUR.drag,
  TOUR.compare,
  TOUR.tools,
  TOUR.companion,
  TOUR.market,
  TOUR.widgets,
];

/* A touch device reads the tour in its own words: no key caps, the steps
 * about keys left out, and a step whose control lives in the phone's tab
 * bar pointed at the bar. */
const tourTouch = () => typeof touchFirst === "function" && touchFirst();
const tourForDevice = (list) =>
  tourTouch()
    ? list
        .filter((st) => !st.desktopOnly)
        .map((st) =>
          Object.assign({}, st, {
            text: st.phoneText || st.text,
            keys: undefined,
            keyGrid: undefined,
            selector: (st.phoneSelector && document.querySelector(st.phoneSelector) ? st.phoneSelector : st.selector),
            optional: st.optional || Boolean(st.phoneSelector),
          }),
        )
    : list;

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
  color: ${({ theme, primary }) =>
    primary ? theme.color.bg : theme.color.text};
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

// The last step's starting points, a row of small choices
const OnbChoices = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: -0.3rem 0 0.7rem;
`;

const OnbChoice = styled.button.attrs({ type: "button" })`
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.74rem;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  background: ${({ theme, active }) => (active ? theme.color.bg : "transparent")};
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme, active }) => (active ? theme.fontWeight.semibold : theme.fontWeight.regular)};
  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
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

  // The list this tour walks: the whole tour, or an update's "what's new"
  steps() {
    if (!this._deviceSteps || this._deviceFor !== (this._steps || ONBOARDING_STEPS)) {
      this._deviceFor = this._steps || ONBOARDING_STEPS;
      this._deviceSteps = tourForDevice(this._deviceFor);
    }
    return this._deviceSteps;
  }

  // "More tips" on the last step: the deeper tour, from its first step
  goMore() {
    this._steps = TOUR_MORE_STEPS;
    this.setState({ step: 0, rect: null }, () => this.measure());
  }

  // A starting point from the last step: a mode, or nothing
  pickMode(value) {
    if (value && this.props.onAppMode) this.props.onAppMode(value);
    this.setState({ picked: value || "keep" });
  }

  componentDidMount() {
    // `replay` is Settings asking for the tour again — it ignores the flag
    if (!this.props.replay) {
      const read = (key) => {
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      };
      if (read(ONBOARDING_SEEN_KEY) === "1") {
        /* Taken before: the edition's "what's new", once, and only on an
           install at least a day old — a profile that only just finished
           the first tour has nothing new to be shown. */
        const first = Number(read(FIRST_USE_KEY));
        const old = Number.isFinite(first) && first > 0 && Date.now() - first >= 86400000;
        if (!old || read(WHATS_NEW_KEY) === WHATS_NEW_ID) return;
        this._steps = WHATS_NEW_STEPS;
      }
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

  componentDidUpdate() {
    if (!this.state.active || !this.cardNode) return;
    const h = this.cardNode.offsetHeight;
    if (h > 0 && Math.abs(h - (this.state.cardH || 0)) > 2) this.setState({ cardH: h });
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
    const step = this.steps()[this.state.step];
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
    if (this.state.step >= this.steps().length - 1) {
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
      // Either tour, ended or skipped, has shown this edition's news
      localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW_ID);
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
    const step = this.steps()[this.state.step] || {};
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Rough card height. The steps vary a lot now — two lines of text or
    // six, with or without key chips — and a fixed guess would place a tall
    // card off the bottom of the screen, so estimate from the content.
    /* The card as drawn, once it has been: the estimate below placed tall
       cards over the thing they pointed at. */
    const measured = this.state.cardH || 0;
    const estHeight = measured > 0 ? measured :
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
    const current = this.steps()[step];
    if (!current) return null;
    const isLast = step === this.steps().length - 1;
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
        {
          key: "card",
          style: this.cardStyle(),
          role: "dialog",
          "aria-label": current.title,
          "data-tour-step": String(step + 1),
          innerRef: (n) => {
            this.cardNode = n;
          },
        },
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
        current.finale &&
          React.createElement(
            OnbChoices,
            { "data-tour-modes": "true" },
            ...[
              ["minimal", msg("mode_minimal_name", "Minimal")],
              ["holder", msg("mode_holder_name", "Holder")],
              ["trader", msg("mode_trader_name", "Trader")],
              [null, msg("tour_keep", "Keep as it is")],
            ].map(([value, label]) =>
              React.createElement(
                OnbChoice,
                {
                  key: value || "keep",
                  type: "button",
                  active: this.state.picked === (value || "keep"),
                  "aria-pressed": this.state.picked === (value || "keep") ? "true" : "false",
                  "data-tour-mode": value || "keep",
                  onClick: () => this.pickMode(value),
                },
                label,
              ),
            ),
          ),
        current.finale &&
          React.createElement(
            OnbSkip,
            { type: "button", "data-tour-more": "true", onClick: () => this.goMore() },
            msg("tour_more_tips", "$1 more tips →", String(tourForDevice(TOUR_MORE_STEPS).length)),
          ),
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
            { "aria-label": msg("tour_step_of", "Step $1 of $2", String(step + 1), String(this.steps().length)) },
            `${step + 1} / ${this.steps().length}`,
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
              width: `${((step + 1) / this.steps().length) * 100}%`,
            },
          }),
        ),
      ),
    );
    return React.createElement(React.Fragment, null, children);
  }
}
