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
    title: "Welcome to PriceTab 👋",
    text: "Live crypto charts on every new tab. Here's a quick run through what's here — skip it any time.",
  },
  {
    selector: '[data-tour="price"]',
    title: "Live price",
    text: "Your active coin and its live price. Click it — or use the arrow keys — to move through your coin list.",
    keys: ["←", "→"],
  },
  {
    selector: '[data-tour="change"]',
    title: "Change",
    text: "How the price moved over the range. Click it to flip between percentage and absolute change.",
    keys: ["X"],
  },
  {
    selector: '[data-tour="period"]',
    title: "Time range",
    text: "Anywhere from the last hour (1H) to all time (ALL). The number keys jump straight to a range.",
    keys: ["1", "–", "6"],
  },
  {
    selector: null,
    title: "Jump to any coin",
    text: "Press / and type a symbol or a name. Your own coins rank first, and picking one you don't track yet adds it to your list.",
    keys: ["/"],
  },
  {
    selector: '[data-tour="compare"]',
    title: "Compare two coins",
    text: "Pick a second coin and both are drawn as percent change from the start of the range — one shared scale, so the lines can be trusted. Press C again or Esc to drop it.",
    keys: ["C"],
  },
  {
    selector: '[data-tour="alerts"]',
    title: "Price targets",
    text: "Set “BTC rises above…” and PriceTab tells you on your next new tab when it was hit — even overnight, while no tab was open. Nothing is pushed, which is how it stays permission-free.",
    keys: ["A"],
  },
  {
    selector: '[data-tour="portfolio"]',
    title: "Portfolio",
    text: "Track holdings by amount, or paste a public address and let it read the balance. Value, cost basis and 24h P/L — stored only on this device, no wallet connection.",
    keys: ["P"],
  },
  {
    selector: '[data-tour="widgets"]',
    optional: true, // nothing to point at until a widget is switched on
    title: "Widgets",
    text: "Watchlist, Fear & Greed, funding rates, market overview and more. Switch them on in Settings → Widgets — there are ready-made bundles — then drag them to reorder, or hover one and click × to hide just that card.",
  },
  {
    selector: '[data-tour="widget-toggle"]',
    // Deliberately not `optional`: this step describes a button, so with no
    // button on screen it has nothing to say and is better skipped. The step
    // before it is the one that has to survive, and it does.
    title: "Clear the row",
    text: "This clears every widget at once, and brings them all back. Nothing is switched off, so they return exactly as you arranged them.",
    keys: ["W"],
  },
  {
    selector: '[data-tour="settings"]',
    title: "Everything else lives here",
    text: "Coins, currency, theme, widgets and the tickers. There's a search box at the top of Preferences if you can't find something.",
    keys: ["S"],
  },
  {
    selector: null,
    title: "It's faster from the keyboard",
    text: "Press ? any time for the full list. A few more worth knowing:",
    keyGrid: [
      { keys: ["T"], label: "Line or candlesticks" },
      { keys: ["D"], label: "Light or dark" },
      { keys: ["Space"], label: "Rotate through your coins" },
      { keys: ["R"], label: "Refresh now" },
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

const OnbSkip = styled.button`
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

const OnbBtn = styled.button`
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
              "Skip tour",
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
                "Back",
              ),
            React.createElement(
              OnbBtn,
              { type: "button", primary: true, onClick: () => this.goNext() },
              isLast ? "Done" : "Next",
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
