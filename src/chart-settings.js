/* THE CHART'S SETTINGS, BESIDE THE CHART.
 *
 * Asked for on 23 Sep 2026 — *"chart settings gibi bir şeyi kenardan kayan
 * grafiğe koymak daha kolaylaştırır gibi geliyor bana"* — and the argument
 * for it was already written in this codebase before the request arrived. The
 * note on `SettingsCard` says a panel that covers the chart cannot show you
 * what you just changed, and most of these settings change the chart. Making
 * Settings full screen on 21 Sep made that sharper rather than softer.
 *
 * **The cost it removes, measured before building** (1280×800, cold start):
 * the Preferences list is 1,719 px in a 586 px window, and reaching a chart
 * switch took a key, a tab click, a chip click, a scroll and a click — Quiet
 * Controls sits 1,033 px down, 447 px past the fold even with the chart
 * group picked. This is one key, and the chart is still on screen.
 *
 * **Nothing here defines a setting.** Every row is built by
 * `settingSections()` in `settings-preferences.js` and named by
 * `CHART_SETTING_KEYS`, so the drawer and the Settings tab are the same nine
 * controls from one definition. A drawer with its own copy would drift the
 * first time somebody added a switch — the hazard `WIDGET_GROUPS` already
 * carries a warning about.
 *
 * **What the sections need from a panel, measured rather than assumed:**
 * across the whole range those nine live in, they touch `panel.section`,
 * `panel.setState` and nothing else — every value and handler arrives through
 * `panel.props`. So the adapter below is three fields, and `props` is passed
 * straight through from `app.js`, which already hands the same names to
 * `SettingsPanel`.
 */
class ChartSettingsDrawer extends PureComponent {
  constructor(...args) {
    super(...args);
    /* The info rings ("About Chart Grid") open one at a time, exactly as they
     * do in the Settings panel — `settingTitle` reads `openInfo` off the
     * panel it is handed, so the drawer keeps its own. */
    this.state = { openInfo: null };
    this.node = createRef();

    /* A press outside closes it, and there is **no scrim** doing the
     * catching.
     *
     * Every other overlay in this app puts a dimmed sheet behind itself and
     * closes when that sheet is clicked. This one must not: the reason it
     * exists is to watch the chart redraw as a switch flips, and a scrim
     * would dim the one thing it is there to show — as well as taking the
     * crosshair away from the chart it is sitting next to. So the outside
     * press is heard on the document instead, and the chart underneath stays
     * live the whole time.
     *
     * `mousedown`, not `click`: releasing a text selection outside the drawer
     * would otherwise shut it mid-drag, which is the same trap the Settings
     * overlay's own handler names. */
    _defineProperty(this, "handleOutside", (event) => {
      if (!this.props.open) return;
      const box = this.node.current;
      if (!box || box.contains(event.target)) return;
      /* The control that opens it is outside the drawer, so a press on that
       * would close and reopen in one gesture — it says so on itself. */
      if (
        event.target.closest &&
        event.target.closest("[data-chart-settings-open], [data-drawer-tabs]")
      ) {
        return;
      }
      if (typeof this.props.onClose === "function") this.props.onClose();
    });
  }

  componentDidMount() {
    document.addEventListener("mousedown", this.handleOutside);
  }

  /* **Nothing is built until it is first opened.**
   *
   * The box is mounted from the start, because a drawer created at the moment
   * it opens has nothing to slide *from* — the transform needs an element
   * that was already there. Its contents do not need the same: nine settings
   * sections, their info rings and their icons on every render of a tab
   * nobody has pressed V on is work an idle new tab should not do. Once
   * opened they stay, so closing and reopening costs nothing. */
  shouldBuild() {
    if (this.props.open) this._opened = true;
    return Boolean(this._opened);
  }

  componentWillUnmount() {
    document.removeEventListener("mousedown", this.handleOutside);
  }

  render() {
    const { open, onClose } = this.props;
    /* The panel the section builders expect. `query` is empty because there
     * is no search here — nine rows do not need one — and `section` therefore
     * wraps every node rather than filtering any out. */
    const panel = {
      props: this.props,
      state: { query: "", openInfo: this.state.openInfo, practiceAsk: false },
      setState: (patch) => this.setState(patch),
      section: (title, keywords, node) =>
        node ? React.createElement(PrefRow, null, node) : node,
    };
    const sections =
      this.shouldBuild() && typeof settingSections === "function"
        ? settingSections(panel)
        : {};
    const built = (Array.isArray(CHART_SETTING_KEYS) ? CHART_SETTING_KEYS : [])
      .map((key) => {
        const build = sections[key];
        if (typeof build !== "function") return null;
        const node = build();
        return node ? [key, React.createElement(Fragment, { key }, node)] : null;
      })
      .filter(Boolean);
    // Under the same three headings as Settings' "The chart"
    const rows = withChartHeads(built);

    return React.createElement(
      ChartDrawer,
      {
        open: open,
        innerRef: this.node,
        "data-chart-settings": open ? "open" : "shut",
        "aria-hidden": open ? undefined : "true",
        role: "dialog",
        "aria-label": msg("cs_title", "The chart"),
      },
      React.createElement(
        ChartDrawerHead,
        null,
        React.createElement(ChartDrawerTitle, null, msg("cs_title", "The chart"), keyCap("V")),
        React.createElement(
          ChartDrawerClose,
          {
            onClick: onClose,
            "aria-label": msg("cs_close", "Close the chart settings"),
          },
          "×",
        ),
      ),
      React.createElement(
        ChartDrawerBody,
        null,
        ...rows,
        // The drawings on this coin, each reachable from the keyboard (app-tools.js)
        this.shouldBuild() && typeof this.props.renderDrawings === "function"
          ? this.props.renderDrawings()
          : null,
      ),
      React.createElement(
        ChartDrawerFoot,
        null,
        /* The one action in a drawer of switches: the chart as a picture,
           with its key (see chart-image.js). */
        typeof this.props.onSaveImage === "function"
          ? React.createElement(
              ChartDrawerSave,
              { onClick: this.props.onSaveImage, "data-chart-save-image": "true" },
              msg("cs_save_image", "Save as image"),
              keyCap("I", { quiet: true }),
            )
          : null,
        msg("cs_foot", "Everything else is in Settings. This drawer: "),
        React.createElement(ChartDrawerKey, null, "V"),
      ),
    );
  }
}

ChartSettingsDrawer.defaultProps = { open: false, onClose: null };
