/* THE PHONE (3 Oct 2026).
 *
 * On a phone — 600px and under, in a browser, or a phone on its side
 * (`PHONE_LANDSCAPE_MEDIA`, theme.js, where the bar is the compact 36px one)
 * — the page is laid out the way a phone app is:
 *
 *   - **A tab bar at the foot** in place of the two edge pulls, which were
 *     14px wide and hidden by design: the chart, calls, targets, the
 *     portfolio, and More — a sheet with everything else. The columns still
 *     come out on an edge swipe; the pulls are simply not drawn there. A
 *     full screen (Settings, the portfolio…) is a pushed page: it covers the
 *     bar and its × brings you back, as an iPhone app's pushed views do.
 *   - **A call is confirmed on a sheet**, not by tapping the same small
 *     square twice: the first tap drafts it and the sheet says what it is —
 *     the band, when it settles, the chance the board gives it and what that
 *     chance was worth when measured — with the confidence and Lock.
 *   - **The chart's gestures are said once**: pinch, drag, hold to read,
 *     double-tap for the whole range (chart-viewport.js does them).
 *
 * The iPhone app has its own bar (ios/PriceTab/GlassBar.swift), so none of
 * this bar is drawn there (`data-platform="ios"`, set by its shim).
 *
 * Plain components; the app owns every piece of state. Loads before app.js. */

const PHONE_BAR_H = 56; // px, before the home indicator's inset
/* On its side the bar is the compact one, the iPhone's own rule for a tab bar
   in landscape: 36px, the label beside its icon. At 56px a phone at 844x390
   kept 150px for the chart under the price and the range row. */
const PHONE_BAR_H_SIDE = 36;
// Where the bar is drawn: a phone upright, or a phone on its side (theme.js)
const PHONE_BAR_MEDIA = `(max-width: 600px), ${PHONE_LANDSCAPE_MEDIA}`;

/* Whether this window is a phone in a browser, now — the tab bar's own test,
   for the bits of the app that behave differently beside it. */
const phoneBarUp = () => {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia(PHONE_BAR_MEDIA).matches &&
      document.documentElement.getAttribute("data-platform") !== "ios" &&
      document.documentElement.getAttribute("data-phone-nav") !== "swipe"
    );
  } catch (error) {
    return false;
  }
};

/* ── styles ────────────────────────────────────────────────────────────── */

const phoneSheetIn = keyframes`
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
`;
const phoneSheetDown = keyframes`
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
`;

const PhoneBar = styled.nav`
  display: none;
  @media ${PHONE_BAR_MEDIA} {
    display: ${({ hidden }) => (hidden ? "none" : "flex")};
  }
  html[data-platform="ios"] & {
    display: none;
  }
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 158;
  height: calc(${PHONE_BAR_H}px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-sizing: border-box;
  align-items: stretch;
  justify-content: space-around;
  background: ${({ theme }) => theme.color.bg};
  border-top: 1px solid ${({ theme }) => theme.color.border};

  @media ${PHONE_LANDSCAPE_MEDIA} {
    height: calc(${PHONE_BAR_H_SIDE}px + env(safe-area-inset-bottom, 0px));
    /* The notch is on a side now */
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }
`;

const PhoneBarItem = styled.button.attrs({ type: "button" })`
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme, active }) => (active ? theme.color.text : theme.color.textSecondary)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  & > span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: ${({ theme, active }) => (active ? theme.fontWeight.semibold : theme.fontWeight.regular)};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -4px;
  }

  @media ${PHONE_LANDSCAPE_MEDIA} {
    flex-direction: row;
    gap: 6px;
    font-size: 0.68rem;
  }
`;

const PhoneBadge = styled.i`
  position: absolute;
  top: 6px;
  left: calc(50% + 7px);
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 8px;
  background: ${({ theme }) => theme.color.text};
  color: ${({ theme }) => theme.color.bg};
  font-style: normal;
  font-size: 0.6rem;
  line-height: 16px;
  text-align: center;

  @media ${PHONE_LANDSCAPE_MEDIA} {
    top: 2px;
  }
`;

/* **It stops above the tab bar** (8 Oct 2026): the More sheet used to lay
   its scrim over the bar, so with More open the only ways back were a swipe
   or a press on the dimmed chart — an app's bar stays where it is, and
   another tab or More again is how a person leaves the sheet. */
const PhoneScrim = styled.div`
  position: fixed;
  inset: 0;
  bottom: var(--pt-dock-lift, 0px);
  z-index: 174;
  background: rgba(0, 0, 0, 0.45);
`;

/* A sheet from the foot: the drawers' own grabber and swipe (pullSwipeStart,
   `data-phone-sheet`), the app's ground. */
const PhoneSheet = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: ${({ lifted }) => (lifted ? "var(--pt-dock-lift, 0px)" : "0")};
  z-index: 175;
  max-height: 80dvh;
  overflow-y: auto;
  ${themedScrollbar};
  padding: 1.4rem 1rem calc(1rem + ${({ lifted }) => (lifted ? "0px" : "env(safe-area-inset-bottom, 0px)")});
  box-sizing: border-box;
  border-radius: 16px 16px 0 0;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-bottom: none;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  box-shadow: 0 -12px 40px ${({ theme }) => theme.color.shadow};
  animation: ${phoneSheetIn} ${() => motionMs(220)}ms cubic-bezier(0.22, 1, 0.36, 1);

  /* **On a wide touch screen, a card** (18 Oct 2026, measured on a 1366px
     ChromeOS-sized window in tablet mode): a phone's edge-to-edge sheet ran
     the full width of a laptop. Centred by its two insets — the entrance
     already uses transform — at most 30rem, off the bottom edge. */
  @media (min-width: 760px) {
    left: max(1rem, calc(50% - 15rem));
    right: max(1rem, calc(50% - 15rem));
    bottom: calc(1rem + ${({ lifted }) => (lifted ? "var(--pt-dock-lift, 0px)" : "0px")});
    border-radius: 16px;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
  }

  /* **From the top** for a call (3 Oct 2026): a sheet from the foot lay over
     the board and hid the very square it asked about; the price above the
     chart is what can be covered while the call is decided. */
  ${({ fromTop }) =>
    fromTop
      ? `top: 0; bottom: auto; border-radius: 0 0 16px 16px; border-top: none; padding-top: calc(1rem + env(safe-area-inset-top, 0px));`
      : ""}
  ${({ fromTop }) => (fromTop ? css`animation-name: ${phoneSheetDown};` : "")}

  &::before {
    content: "";
    position: absolute;
    top: 6px;
    left: 50%;
    width: 36px;
    height: 4px;
    margin-left: -18px;
    border-radius: 2px;
    background: ${({ theme }) => theme.color.border};
    pointer-events: none;
  }
  // From the top, the grabber is at the foot and the sheet goes back up
  ${({ fromTop }) => (fromTop ? "&::before { top: auto; bottom: 6px; }" : "")}
`;

const PhoneSheetTitle = styled.div`
  margin-bottom: 0.9rem;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PhoneGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;

  /* On its side three tiles a row were 270px wide and the third row ran
     under the bar; five a row is two rows */
  @media ${PHONE_LANDSCAPE_MEDIA} {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
`;

const PhoneGridItem = styled.button.attrs({ type: "button" })`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 4.6rem;
  padding: 0.6rem 0.3rem;
  border: 1px solid ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 12px;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.68rem;
  text-align: center;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
  }
`;

const CallSheetBand = styled.div`
  font-size: 1.05rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  font-variant-numeric: tabular-nums;
`;

const CallSheetLine = styled.div`
  margin-top: 0.35rem;
  font-size: 0.74rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const CallSheetChips = styled.div`
  display: flex;
  gap: 0.4rem;
  margin: 1rem 0;
`;

/* Eight chances do not fit one row at 390px (measured: every label cut), so
   they are two rows of four. */
const CallSheetMine = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
  margin: 0 0 1rem;
`;

const CallSheetChip = styled.button.attrs({ type: "button" })`
  flex: 1 1 0;
  min-height: 2.5rem;
  border-radius: 10px;
  border: 1px solid ${({ theme, on }) => (on ? theme.color.text : theme.color.border)};
  background: ${({ theme, on }) => (on ? theme.color.bgSecondary : "transparent")};
  color: ${({ theme, on }) => (on ? theme.color.text : theme.color.textSecondary)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.74rem;
  cursor: pointer;
  ${touchRow};
`;

const CallSheetActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const PhoneButton = styled.button.attrs({ type: "button" })`
  flex: ${({ primary }) => (primary ? "2 1 0" : "1 1 0")};
  min-height: 3rem;
  border-radius: 12px;
  border: 1px solid ${({ theme, primary }) => (primary ? theme.color.text : theme.color.border)};
  background: ${({ theme, primary }) => (primary ? theme.color.text : "transparent")};
  color: ${({ theme, primary }) => (primary ? theme.color.bg : theme.color.text)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
  }
`;

const TouchHintList = styled.ul`
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.55rem;
  font-size: 0.8rem;

  & b {
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
  }
  & span {
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* ── components ────────────────────────────────────────────────────────── */

/* The bar. `items` are { key, icon, label, badge }; `active` the one lit. */
const PhoneTabBar = ({ items, active, hidden, onGo }) =>
  React.createElement(
    PhoneBar,
    { hidden, "data-phone-bar": "true", "aria-label": msg("ph_bar", "Main") },
    ...items.map((t) =>
      React.createElement(
        PhoneBarItem,
        {
          key: t.key,
          active: active === t.key,
          "data-phone-tab": t.key,
          "aria-current": active === t.key ? "page" : undefined,
          "aria-label": t.label,
          onClick: () => onGo(t.key),
        },
        icon(t.icon, 1.25),
        React.createElement("span", null, t.label),
        t.badge ? React.createElement(PhoneBadge, { "aria-hidden": "true" }, t.badge) : null,
      ),
    ),
  );

/* More: everything the bar has no room for, as a grid of tiles. */
const PhoneMoreSheet = ({ items, active, onGo, onClose }) =>
  React.createElement(
    Fragment,
    null,
    React.createElement(PhoneScrim, { "data-phone-scrim": "true", onClick: onClose }),
    React.createElement(
      PhoneSheet,
      { lifted: true, "data-phone-sheet": "more", role: "dialog", "aria-label": msg("ph_more_title", "Everything else") },
      React.createElement(PhoneSheetTitle, null, msg("ph_more_title", "Everything else")),
      React.createElement(
        PhoneGrid,
        null,
        ...items.map((t) =>
          React.createElement(
            PhoneGridItem,
            { key: t.key, active: active === t.key, "data-phone-more": t.key, onClick: () => onGo(t.key) },
            icon(t.icon, 1.4),
            t.label,
          ),
        ),
      ),
    ),
  );

/* A drafted call, said in words, with its confidence and Lock. */
const CallSheet = ({ draft, confidence, onConfidence, mine, onMine, onLock, onCancel, formatPrice }) => {
  const words = {
    hunch: msg("al_conf_hunch", "hunch"),
    likely: msg("al_conf_likely", "likely"),
    sure: msg("al_conf_sure", "sure"),
  };
  const fmt = (v) => (formatPrice ? formatPrice(v) : String(v));
  const at = new Date(draft.target);
  const mins = Math.max(0, Math.round((draft.target - Date.now()) / 60000));
  const when =
    mins < 120
      ? msg("ph_call_in_min", "settles at $1 — in $2 min", localeDate(at, { hour: "2-digit", minute: "2-digit" }), mins)
      : msg("ph_call_at", "settles $1", localeDate(at, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
  return React.createElement(
    PhoneSheet,
    { fromTop: true, "data-phone-sheet": "call", role: "dialog", "aria-label": msg("ph_call_title", "Make this call?") },
    React.createElement(PhoneSheetTitle, null, msg("ph_call_title", "Make this call?")),
    React.createElement(CallSheetBand, null, `${draft.coin} · ${fmt(draft.lo)} – ${fmt(draft.hi)}`),
    React.createElement(CallSheetLine, null, msg("ph_call_claim", "The price is in this band when the square's time is up — $1.", when)),
    draft.oddsText ? React.createElement(CallSheetLine, { "data-call-odds": "true" }, draft.oddsText) : null,
    React.createElement(
      CallSheetChips,
      { role: "group", "aria-label": msg("ph_call_confidence", "How sure are you?") },
      ...["hunch", "likely", "sure"].map((k) =>
        React.createElement(
          CallSheetChip,
          { key: k, on: confidence === k, "aria-pressed": confidence === k ? "true" : "false", onClick: () => onConfidence(confidence === k ? null : k) },
          words[k],
        ),
      ),
    ),
    /* Your own chance, optional and final once locked — the record scores
       it against the board's on the same squares. */
    onMine
      ? React.createElement(
          CallSheetMine,
          { role: "group", "aria-label": msg("al_mine_label", "Your chance for this square"), "data-call-mine": "true" },
          ...CALL_MINE_CHOICES.map((pct) =>
            React.createElement(
              CallSheetChip,
              { key: pct, on: mine === pct, "aria-pressed": mine === pct ? "true" : "false", onClick: () => onMine(mine === pct ? null : pct) },
              `${pct}%`,
            ),
          ),
        )
      : null,
    React.createElement(
      CallSheetActions,
      null,
      React.createElement(PhoneButton, { onClick: onCancel, "data-call-cancel": "true" }, msg("ph_cancel", "Cancel")),
      React.createElement(PhoneButton, { primary: true, onClick: onLock, "data-call-lock": "true" }, msg("ph_call_lock", "Lock the call")),
    ),
  );
};

/* The chart's gestures, said once on a touch screen. */
const TouchHint = ({ onDismiss }) =>
  React.createElement(
    PhoneSheet,
    { lifted: true, "data-phone-sheet": "hint", role: "dialog", "aria-label": msg("ph_hint_title", "The chart, by touch") },
    React.createElement(PhoneSheetTitle, null, msg("ph_hint_title", "The chart, by touch")),
    React.createElement(
      TouchHintList,
      null,
      React.createElement("li", null, React.createElement("b", null, msg("ph_hint_drag", "Drag")), " ", React.createElement("span", null, msg("ph_hint_drag_d", "to move through time, and up or down through prices"))),
      React.createElement("li", null, React.createElement("b", null, msg("ph_hint_pinch", "Pinch")), " ", React.createElement("span", null, msg("ph_hint_pinch_d", "to zoom — on the calls board, its reach"))),
      React.createElement("li", null, React.createElement("b", null, msg("ph_hint_hold", "Hold")), " ", React.createElement("span", null, msg("ph_hint_hold_d", "to read the price under your finger"))),
      React.createElement("li", null, React.createElement("b", null, msg("ph_hint_double", "Double-tap")), " ", React.createElement("span", null, msg("ph_hint_double_d", "for the whole range again"))),
      React.createElement("li", null, React.createElement("b", null, msg("ph_hint_edge", "Swipe in from an edge")), " ", React.createElement("span", null, msg("ph_hint_edge_d", "for the tabs beside the chart"))),
    ),
    React.createElement(CallSheetActions, null, React.createElement(PhoneButton, { primary: true, onClick: onDismiss, "data-hint-dismiss": "true" }, msg("ph_hint_ok", "Got it"))),
  );
