/* The two edges are edited together: hiding keeps the slot, moving keeps the
 * feature's records. Deleting is a separate, explicit choice in the prompt. */
const NavPreview = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
`;
const NavLane = styled.div`
  min-width: 0;
  padding: 0.8rem;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  & > strong { display: block; font-size: 0.75rem; margin-bottom: 0.6rem; }
`;
const NavChip = styled.div`
  padding: 0.4rem 0.5rem;
  margin-top: 0.3rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  font-size: 0.7rem;
  overflow-wrap: anywhere;
`;
const NavRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;
const NavRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  & > span:first-child { flex: 1 1 9rem; font-size: 0.8rem; }
  & select { max-width: 100%; font: inherit; font-size: 0.75rem;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bg};
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: 6px; padding: 0.45rem; min-height: 36px; }
  & button:not(${ToggleSwitch}) { min-height: 36px; }
  & button:disabled { opacity: 0.4; cursor: default; }
`;
const NavConfirm = styled.div`
  padding: 1rem;
  margin-bottom: 1rem;
  border: 1px solid ${({ theme }) => theme.color.borderHover};
  border-radius: 12px;
  background: ${({ theme }) => theme.color.bg};
  & h3 { margin: 0 0 0.5rem; font-size: 0.9rem; }
  & p { font-size: 0.78rem; line-height: 1.6; }
  & label { display: flex; align-items: flex-start; gap: 0.5rem;
    font-size: 0.78rem; padding: 0.6rem 0; cursor: pointer; }
  & input { margin-top: 0.2rem; }
`;

const navTabCatalog = () => [
  { key: "widgets", icon: "widgets", label: msg("set_tab_widgets", "Widgets"), press: "W", tour: "widgets" },
  { key: "chart", icon: "sliders", label: msg("cs_title", "The chart"), press: "V", tour: "chart-settings" },
  { key: "targets", icon: "target", label: msg("pt_tab_targets", "Targets"), press: "A", tour: "alerts" },
  { key: "calls", icon: "calls", label: msg("chrome_calls", "Calls"), press: "K", tour: "calls" },
  { key: "compare", icon: "compare", label: msg("drawer_tab_compare", "Compare"), press: "C", tour: "compare" },
  { key: "settings", icon: "settings", label: msg("chrome_settings", "Settings"), press: "S", tour: "settings" },
  { key: "portfolio", icon: "portfolio", label: msg("chrome_portfolio", "Portfolio"), press: "P", tour: "portfolio" },
  { key: "futures", icon: "futures", label: msg("pt_tab_futures", "Futures"), press: "F", tour: "futures" },
  { key: "news", icon: "news", label: msg("chrome_news", "News"), press: "N", tour: "news" },
  { key: "monitor", icon: "monitor", label: msg("mon_title", "Monitor"), press: "M" },
];
const navDataDescription = (key) => ({
  targets: msg("nav_data_targets", "All price targets and their triggered records."),
  calls: msg("nav_data_calls", "All open calls, settled calls and your calls record."),
  futures: msg("nav_data_futures", "The simulation account, open positions, orders, trade history and saved ticket."),
  portfolio: msg("nav_data_portfolio", "All holdings, purchases, sales and watched addresses."),
  news: msg("nav_data_news", "Saved stories and the last-read marker."),
  chart: msg("nav_data_chart", "All saved chart drawings and notes, for every coin."),
  widgets: msg("nav_data_widgets", "Widget choices, sizes, order and home-screen pins."),
}[key] || "");

const renderNavigationSettings = (panel) => {
  const p = panel.props;
  const layout = sanitizeNavLayout(p.navLayout || DEFAULT_NAV_LAYOUT);
  const catalog = navTabCatalog().map((tab) => tab.key === "futures"
    ? { ...tab, label: msg("chrome_futures", "Derivatives market") } : tab);
  const enabled = (key) => key === "settings" || (key === "futures"
    ? p.practiceEnabled === true : (p.features || {})[key] !== false &&
      (key !== "baseRates" || (p.features || {}).monitor !== false));
  const sideName = (side) => side === "left" ? msg("nav_left", "Left edge") : msg("nav_right", "Right edge");
  const pending = panel.state.navPending;
  const target = catalog.concat([{ key: "baseRates", label: msg("pt_tab_baserates", "Base rates") }]).find((t) => t.key === pending);
  const data = navDataDescription(pending);
  const dismiss = () => panel.setState({ navPending: null }, () => {
    const button = document.querySelector('[data-nav-row="' + pending + '"] button[aria-pressed]');
    if (button) button.focus();
  });
  const confirm = target ? React.createElement(NavConfirm, {
    role: "group", "aria-labelledby": "nav-confirm-title", "aria-describedby": "nav-confirm-desc",
    "data-nav-confirm": pending,
    innerRef: (node) => {
      if (node && !node.contains(document.activeElement)) requestAnimationFrame(() => {
        if (!node.isConnected) return;
        const scroller = node.closest("[data-pref-section]");
        if (scroller) scroller.scrollTo({
          top: scroller.scrollTop + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12,
          behavior: "instant",
        });
        else node.scrollIntoView({ block: "start", behavior: "instant" });
        const cancel = node.querySelector("button");
        if (cancel) cancel.focus({ preventScroll: true });
      });
    },
    onKeyDown: (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); dismiss(); } },
  },
  React.createElement("h3", { id: "nav-confirm-title" }, msg("nav_hide_title", "Hide $1?", target.label)),
  React.createElement("p", { id: "nav-confirm-desc" }, msg("nav_hide_desc", "Its tab and shortcut will be unavailable. You can show it again here at any time.")),
  React.createElement("label", null,
    React.createElement("input", { type: "radio", name: "nav-data", value: "keep", checked: !panel.state.navDelete,
      onChange: () => panel.setState({ navDelete: false }) }), msg("nav_keep", "Keep my data")),
  data ? React.createElement("label", null,
    React.createElement("input", { type: "radio", name: "nav-data", value: "delete", checked: panel.state.navDelete === true,
      onChange: () => panel.setState({ navDelete: true }) }), msg("nav_delete", "Permanently delete this data: $1", data)) : null,
  panel.state.navDelete ? React.createElement("p", null, msg("nav_delete_note", "This cannot be undone. The page will reload after deletion.")) : null,
  panel.state.navError ? React.createElement("p", { role: "alert" }, msg("nav_save_error", "Could not save the change. Check the available browser storage and try again.")) : null,
  React.createElement(PracticeTermsRow, null,
    React.createElement(PresetButton, { autoFocus: true, onClick: dismiss }, msg("nav_cancel", "Cancel")),
    React.createElement(SettingsActionButton, { "data-nav-hide-confirm": "true", onClick: () => {
      if (panel.state.navDelete) {
        if (!hideFeatureAndDeleteData(pending)) { panel.setState({ navError: true }); return; }
        markReopenSettings("preferences");
        location.reload();
      } else {
        if (p.onFeatureChange && p.onFeatureChange(pending, false) === false) { panel.setState({ navError: true }); return; }
        dismiss();
      }
    } }, panel.state.navDelete ? msg("nav_hide_delete", "Hide and delete data") : msg("nav_hide_keep", "Hide and keep data")))) : null;
  // This is tab visibility, including the first-run tab that opens on terms.
  const switchOn = enabled;
  const toggle = (key) => {
    if (switchOn(key)) panel.setState({ navPending: key, navDelete: false, navError: false, practiceAsk: false });
    else if (key === "futures" && !p.practiceConsent) panel.setState({ practiceAsk: true, navPending: null });
    else if (p.onFeatureChange) p.onFeatureChange(key, true);
  };
  return React.createElement("div", { "data-navigation-settings": "true" },
    React.createElement(ToggleSectionDesc, null, msg("nav_intro", "Choose which tabs appear on each edge and arrange their order. Hidden tabs keep their place. Settings always stays available.")),
    confirm,
    React.createElement(NavPreview, { "aria-label": msg("nav_preview", "Menu preview") }, ...["left", "right"].map((side) =>
      React.createElement(NavLane, { key: side, "data-nav-preview": side },
        React.createElement("strong", null, sideName(side)),
        ...layout[side].filter(enabled).map((key) => React.createElement(NavChip, { key }, catalog.find((t) => t.key === key).label))))),
    React.createElement(NavRows, null, ...["left", "right"].flatMap((side) => layout[side].map((key, index) => {
      const tab = catalog.find((t) => t.key === key);
      return React.createElement(NavRow, { key, "data-nav-row": key },
        React.createElement("span", null, tab.label),
        React.createElement("select", { value: side, "aria-label": msg("nav_position", "$1 position", tab.label),
          onChange: (e) => p.onNavMove && p.onNavMove(key, e.target.value) },
          ...["left", "right"].map((value) => React.createElement("option", { key: value, value }, sideName(value)))),
        ...[-1, 1].map((direction) => React.createElement(PresetButton, { key: direction,
          disabled: direction < 0 ? index === 0 : index === layout[side].length - 1,
          "aria-label": direction < 0 ? msg("nav_up", "Move $1 up", tab.label) : msg("nav_down", "Move $1 down", tab.label),
          onClick: () => p.onNavMove && p.onNavMove(key, side, direction) }, direction < 0 ? "↑" : "↓")),
        key === "settings" ? React.createElement("span", null, msg("nav_always", "Always visible")) :
          React.createElement(ToggleSwitch, { active: switchOn(key), "aria-pressed": switchOn(key) ? "true" : "false",
            "aria-label": msg("pref_features_aria", "Turn $1 on or off", tab.label), onClick: () => toggle(key) }));
    }))),
    // Outside the list above, so it takes the list's gap itself
    React.createElement(NavRow, { "data-nav-row": "baseRates", style: { marginTop: "0.5rem" } },
      React.createElement("span", null, msg("pt_tab_baserates", "Base rates"),
        !enabled("monitor") ? React.createElement("small", { style: { display: "block" } }, msg("nav_requires_monitor", "Requires Monitor")) : null),
      React.createElement(ToggleSwitch, { disabled: !enabled("monitor"), active: enabled("baseRates"), "aria-pressed": enabled("baseRates") ? "true" : "false",
        "aria-label": msg("pref_features_aria", "Turn $1 on or off", msg("pt_tab_baserates", "Base rates")), onClick: () => toggle("baseRates") })),
    panel.state.practiceAsk && !p.practiceConsent ? React.createElement(SettingNote, {
      "data-practice-terms": "true",
      innerRef: (node) => { if (node) requestAnimationFrame(() => {
        if (!node.isConnected) return;
        const scroller = node.closest("[data-pref-section]");
        if (scroller) scroller.scrollTo({
          top: scroller.scrollTop + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12,
          behavior: "instant",
        });
      }); },
    },
      React.createElement(ToggleSectionTitle, null, msg("pos_terms_title", "Before you start")),
      React.createElement("ul", null, ...[
        msg("pos_terms_1", "This is a simulation. No order is placed, nothing is sent anywhere, and there is no exchange, broker or account behind it."),
        msg("pos_terms_2", "The balance is imaginary and has no value. It cannot be bought, topped up, transferred, withdrawn or redeemed, and clearing your browser data ends it."),
        msg("pos_terms_3", "Prices are real, but the result is not: a real venue has spreads, queues, slippage and outages this does not reproduce."),
        msg("pos_terms_4", "Nothing here is financial advice, and a result here says nothing about how you would do with money. Leveraged trading with real money can lose more than you put in."),
      ].map((text, i) => React.createElement("li", { key: i }, text))),
      React.createElement(PracticeTermsRow, null,
        React.createElement(SettingsActionButton, { "data-practice-accept": "true", onClick: () => { panel.setState({ practiceAsk: false }); if (p.onPracticeAccept) p.onPracticeAccept(); } }, msg("pref_practice_accept", "I have read this — turn it on")),
        React.createElement(PresetButton, { onClick: () => panel.setState({ practiceAsk: false }) }, msg("pref_practice_decline", "Not now")))) : null,
    /* The reset in the panel's quiet face, as the coins page has it — it was
       the black action button, the loudest thing on a page whose subject is
       the rows above it. One press, with Undo in its place until the layout
       changes again; nothing to reset, nothing drawn. */
    (() => {
      const same = (a, b) => ["left", "right"].every((s) => (a[s] || []).join() === (b[s] || []).join());
      const atDefault = same(layout, sanitizeNavLayout(DEFAULT_NAV_LAYOUT));
      const undo = panel.state.navUndo && same(layout, sanitizeNavLayout(DEFAULT_NAV_LAYOUT)) ? panel.state.navUndo : null;
      if (atDefault && !undo) return null;
      return React.createElement(
        ResetRow,
        null,
        React.createElement(
          ResetButton,
          {
            "data-nav-reset": undo ? "undo" : "true",
            onClick: () => {
              if (!p.onNavReset) return;
              if (undo) {
                p.onNavReset(undo);
                panel.setState({ navUndo: null });
              } else {
                panel.setState({ navUndo: { left: layout.left.slice(), right: layout.right.slice() } });
                p.onNavReset();
              }
            },
          },
          undo ? msg("set_undo", "Undo") : msg("nav_reset", "Reset positions and order"),
        ),
      );
    })());
};
