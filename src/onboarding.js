/* ONBOARDING TOUR
 * First-run spotlight tour. Highlights the real UI (settings gear, live price,
 * period switcher) with a dimmed backdrop + cutout, one step at a time.
 * Shown once, then remembered via ONBOARDING_SEEN_KEY in localStorage.
 * Skippable at any point.
 */

// Steps with no `selector` render a centered card (no cutout).
const ONBOARDING_STEPS = [
  {
    selector: null,
    title: "Welcome to PriceTab 👋",
    text: "Live crypto charts on every new tab. Here's a quick 30-second tour.",
  },
  {
    selector: '[data-tour="settings"]',
    title: "Everything starts here",
    text: "Open Settings to add or remove coins, switch currency and theme, turn on widgets, the news headline ticker, the page ticker and more.",
  },
  {
    selector: '[data-tour="portfolio"]',
    title: "Portfolio",
    text: "Track your holdings by amount — no wallet connection. Total value and 24h change update live, stored only on this device.",
  },
  {
    selector: '[data-tour="price"]',
    title: "Live price — click to switch coins",
    text: "This is your active coin and its live price. Click it to jump to the next coin in your list.",
  },
  {
    selector: '[data-tour="change"]',
    title: "Change — click to flip the view",
    text: "This shows how the price moved. Click it to toggle between percentage change (%) and absolute price change.",
  },
  {
    selector: '[data-tour="period"]',
    title: "Time range",
    text: "Switch the chart range, anywhere from the last hour (1H) to all time (ALL).",
  },
  {
    selector: '[data-tour="widgets"]',
    title: "Widgets",
    text: "Extras like your watchlist, Fear & Greed and a market overview. Add, remove or reorder them — and toggle the news headline ticker — from Settings.",
  },
];

const SPOTLIGHT_PADDING = 8; // px of breathing room around the highlighted element
const TIP_WIDTH = 300; // px, tooltip max width
const TIP_GAP = 14; // px between cutout and tooltip
const VIEWPORT_MARGIN = 12; // px, keep tooltip off the screen edges

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

const OnbFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

// Step progress as dots — quieter than "n / m" text, same visual language
// as the widget/settings chrome (border → text color when active).
const OnbDots = styled.div`
  display: flex;
  align-items: center;
  gap: 0.32rem;
`;

const OnbDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ theme, active }) =>
    active ? theme.color.text : theme.color.border};
  transform: scale(${({ active }) => (active ? 1.2 : 1)});
  transition:
    background 0.25s ease,
    transform 0.25s ease;
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
    let seen = false;
    try {
      seen = localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
    } catch (e) {
      seen = false;
    }
    if (seen) return;
    // Let the app finish its first render (skeleton -> real elements) first
    this.startTimer = setTimeout(() => {
      this.setState({ active: true, step: 0 }, () => this.measure());
      window.addEventListener("resize", this.handleResize);
      window.addEventListener("keydown", this.handleKeyDown);
    }, 600);
  }

  componentWillUnmount() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  // Locate the current step's target; retry across a few frames while the
  // app swaps skeletons for real content.
  measure(retries) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const tries = typeof retries === "number" ? retries : 12;
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
    if (e.key === "Escape") this.finish();
    else if (e.key === "ArrowRight" || e.key === "Enter") this.goNext();
    else if (e.key === "ArrowLeft") this.goPrev();
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
    this.setState({ active: false });
  }

  // Position the tooltip relative to the cutout (or center it when there's none)
  cardStyle() {
    const { rect } = this.state;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) {
      return {
        top: Math.max(VIEWPORT_MARGIN, vh / 2 - 90),
        left: Math.max(VIEWPORT_MARGIN, vw / 2 - TIP_WIDTH / 2),
      };
    }
    const estHeight = 150;
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
        React.createElement(OnbText, null, current.text),
        React.createElement(
          OnbFooter,
          null,
          React.createElement(
            OnbSkip,
            { type: "button", onClick: () => this.finish() },
            "Skip",
          ),
          React.createElement(
            OnbDots,
            { "aria-label": `Step ${step + 1} of ${ONBOARDING_STEPS.length}` },
            ONBOARDING_STEPS.map((_, i) =>
              React.createElement(OnbDot, { key: i, active: i === step }),
            ),
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
      ),
    );
    return React.createElement(React.Fragment, null, children);
  }
}
