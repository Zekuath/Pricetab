/* Settings search.
 *
 * With ~30 controls, finding one meant scrolling and expanding groups. The
 * filter matches a setting's own name and a few words someone might reach
 * for instead ("colour" for Chart Color, "ohlc" for Chart Details), so the
 * search works on intent rather than on our exact labels.
 */
const matchesSetting = (query, title, keywords) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const haystack = `${title || ""} ${keywords || ""}`.toLowerCase();
  // Every word must appear somewhere, so "chart col" finds Chart Color
  return q.split(/\s+/).every((word) => haystack.includes(word));
};

// Collapsible group header for the Preferences tab. Owns its own open state
// (defaults to open) — the panel unmounts when closed, so every open starts
// with all groups expanded.
class CollapsibleGroup extends PureComponent {
  constructor(...args) {
    super(...args);
    this.state = { open: true };
    this.toggle = this.toggle.bind(this);
  }

  toggle() {
    this.setState((prev) => ({ open: !prev.open }));
  }

  render() {
    // Searching flattens the panel: every surviving group opens, because
    // hunting for a match behind a collapsed header defeats the search
    const open = this.props.forceOpen || this.state.open;
    const hasContent = React.Children.toArray(this.props.children).some(
      (child) => child !== null && child !== false,
    );
    if (!hasContent) return null;
    return [
      React.createElement(
        SettingsGroupTitle,
        {
          key: "title",
          onClick: this.toggle,
          role: "button",
          tabIndex: 0,
          "aria-expanded": open,
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              this.toggle();
            }
          },
        },
        this.props.title,
        React.createElement(GroupChevron, { open }, "▾"),
      ),
      React.createElement(
        GroupReveal,
        { key: "reveal", open },
        this.props.children,
      ),
    ];
  }
}

class SettingsPanel extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "state", {
      feedback: "",
      status: "idle",
      pendingCoin: "",
      suggestions: [],
      searching: false,
      activeTab: "coins", // 'coins' or 'preferences'
      query: "", // settings search
      showRatePrompt: !loadRatePromptDismissed(),
      undoCoins: null,
    });

    this.draggingSymbol = null;
    this.draggingChipNode = null;
    this.lastEnteredSymbol = null;
    this.suggestionCleanupTimer = null;

    _defineProperty(this, "handleTabChange", (tab) => {
      this.setState({ activeTab: tab });
    });

    /* Renders a setting unless the search has filtered it out. The tally
     * lets the panel tell the difference between "no results" and a screen
     * that happens to look empty.
     *
     * `applies` is for settings that depend on another one being on. They
     * stay mounted so they can animate open when the parent is switched on,
     * but they don't count as a search hit while they're collapsed — a
     * search that only matched hidden settings would otherwise look like a
     * blank panel rather than "nothing matches". */
    _defineProperty(this, "section", (title, keywords, node, applies = true) => {
      if (!matchesSetting(this.state.query, title, keywords)) return null;
      if (applies) this._matched += 1;
      return node;
    });

    _defineProperty(this, "handleRatePromptDismiss", () => {
      saveRatePromptDismissed();
      this.setState({ showRatePrompt: false });
    });

    _defineProperty(this, "handleKeyDown", (event) => {
      if (event.key === "Escape" && typeof this.props.onClose === "function") {
        this.props.onClose();
      }
    });

    _defineProperty(this, "handleResetClick", () => {
      const { coins, onResetCoins } = this.props;
      if (typeof onResetCoins !== "function") {
        return;
      }
      const previous = Array.isArray(coins) ? [...coins] : [];
      onResetCoins();
      this.setState({
        undoCoins: previous,
        feedback: "Coins reset to defaults",
        status: "info",
      });
    });

    _defineProperty(this, "handleUndoReset", () => {
      const { onRestoreCoins } = this.props;
      const { undoCoins } = this.state;
      if (
        undoCoins &&
        undoCoins.length &&
        typeof onRestoreCoins === "function"
      ) {
        onRestoreCoins(undoCoins);
      }
      this.setState({
        undoCoins: null,
        feedback: "Previous coins restored",
        status: "success",
      });
    });

    _defineProperty(this, "handleChipClick", (symbol) => {
      const { coins, onAddCoin, onRemoveCoin } = this.props;
      if (this.draggingSymbol) {
        return;
      }
      if (!symbol || typeof onAddCoin !== "function") {
        return;
      }

      const normalized = symbol.trim().toUpperCase();
      if (!normalized) {
        return;
      }

      const activeCoins = Array.isArray(coins) ? coins : [];
      if (activeCoins.includes(normalized)) {
        if (activeCoins.length <= 1) {
          this.setState({
            feedback: "Keep at least one coin in the rotation",
            status: "error",
          });
          return;
        }
        if (typeof onRemoveCoin === "function") {
          onRemoveCoin(normalized);
          this.setState({
            feedback: `${normalized} removed from the rotation`,
            status: "info",
          });
        }
        return;
      }

      if (!SUGGESTED_COINS.includes(normalized)) {
        this.setState({
          feedback: `${normalized || "Symbol"} not recognized`,
          status: "error",
        });
        return;
      }

      const result = onAddCoin(normalized);

      if (result && result.success) {
        this.setState({
          feedback: `${normalized} added to the rotation`,
          status: "success",
        });
      } else {
        let feedback = "Could not add coin";
        if (result && result.reason === "duplicate") {
          feedback = "This symbol is already listed";
        } else if (result && result.reason === "format") {
          feedback = "Use 2-10 letters/numbers only";
        } else if (result && result.reason === "empty") {
          feedback = "Enter a symbol first";
        } else if (result && result.reason === "limit") {
          feedback = "Max " + MAX_COINS + " coins reached";
        }

        this.setState({ feedback, status: "error" });
      }
    });

    _defineProperty(this, "handleSuggestionClick", (symbol) => {
      const { coins, onAddCoin } = this.props;
      if (this.draggingSymbol || !symbol || typeof onAddCoin !== "function") {
        return;
      }

      const normalized = symbol.trim().toUpperCase();
      if (!normalized) {
        return;
      }

      const activeCoins = Array.isArray(coins) ? coins : [];
      if (activeCoins.includes(normalized)) {
        this.setState({
          feedback: `${normalized} is already in the rotation`,
          status: "info",
        });
        return;
      }

      if (!SUGGESTED_COINS.includes(normalized)) {
        this.setState({
          feedback: `${normalized || "Symbol"} not recognized`,
          status: "error",
        });
        return;
      }

      const result = onAddCoin(normalized);

      if (result && result.success) {
        this.setState({
          feedback: `${normalized} added to the rotation`,
          status: "success",
        });
        // Keep the query alive so several matches can be added in one go;
        // the added coin drops out of the refreshed suggestions
        this.updateSuggestions(this.state.pendingCoin);
      } else {
        let feedback = "Could not add coin";
        if (result && result.reason === "duplicate") {
          feedback = "This symbol is already listed";
        } else if (result && result.reason === "format") {
          feedback = "Use 2-10 letters/numbers only";
        } else if (result && result.reason === "empty") {
          feedback = "Enter a symbol first";
        } else if (result && result.reason === "limit") {
          feedback = "Max " + MAX_COINS + " coins reached";
        }
        this.setState({ feedback, status: "error" });
      }
    });

    // Debounced suggestion filtering for better performance
    _defineProperty(
      this,
      "updateSuggestions",
      debounce((pendingCoin) => {
        const activeCoins = Array.isArray(this.props.coins)
          ? this.props.coins
          : [];

        const query = pendingCoin.trim();
        const suggestions = query
          ? SUGGESTED_COINS.filter((coin) => {
              if (activeCoins.includes(coin)) {
                return false;
              }
              if (coin.startsWith(query)) {
                return true;
              }
              const name = COIN_NAMES[coin];
              return name ? name.toUpperCase().includes(query) : false;
            }).slice(0, 4)
          : [];

        this.setState({ suggestions, searching: false });
      }, 200),
    );

    _defineProperty(this, "handleInputChange", (e) => {
      const pendingCoin = e.target.value.toUpperCase();

      // Input cleared → drop suggestions instantly, and cancel the pending
      // debounce so stale chips don't repaint over the placeholder
      if (!pendingCoin.trim()) {
        this.updateSuggestions.cancel();
        // Keep the chips mounted while the area collapses, then clean up
        clearTimeout(this.suggestionCleanupTimer);
        this.suggestionCleanupTimer = setTimeout(() => {
          this.setState({ suggestions: [] });
        }, 500);
        this.setState({
          pendingCoin,
          searching: false,
          status: "idle",
          feedback: "",
        });
        return;
      }

      // Update input value immediately for better UX. A fresh search
      // (input was empty) starts with no chips so the area opens once,
      // with real results; ongoing typing morphs the open list in place.
      clearTimeout(this.suggestionCleanupTimer);
      this.setState((prev) => ({
        pendingCoin,
        searching: true,
        suggestions: prev.pendingCoin.trim() ? prev.suggestions : [],
        status: "idle",
        feedback: "",
      }));

      // Filter suggestions with debounce
      this.updateSuggestions(pendingCoin);
    });

    _defineProperty(this, "handleSubmit", (e) => {
      e.preventDefault();
      const { pendingCoin, suggestions } = this.state;
      const normalized = pendingCoin.trim().toUpperCase();
      // Typed a full name ("DOGECOIN")? Fall back to the top suggestion.
      const target =
        !SUGGESTED_COINS.includes(normalized) && suggestions.length
          ? suggestions[0]
          : normalized;
      this.handleSuggestionClick(target);
    });

    _defineProperty(this, "handleDragStart", (symbol, event) => {
      if (event && event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", symbol);
      }

      this.draggingSymbol = symbol;
      this.lastEnteredSymbol = null;

      if (event && event.currentTarget) {
        this.draggingChipNode = event.currentTarget;
        this.draggingChipNode.style.opacity = "0.4";
        this.draggingChipNode.style.cursor = "grabbing";
      }
    });

    _defineProperty(this, "handleDragEnd", () => {
      if (this.draggingChipNode) {
        this.draggingChipNode.style.opacity = "";
        this.draggingChipNode.style.cursor = "";
        this.draggingChipNode = null;
      }

      this.draggingSymbol = null;
      this.lastEnteredSymbol = null;
    });

    _defineProperty(this, "handleDrop", (targetSymbol, event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      const { onReorderCoin } = this.props;

      if (
        this.draggingSymbol &&
        targetSymbol &&
        typeof onReorderCoin === "function" &&
        this.draggingSymbol !== targetSymbol
      ) {
        onReorderCoin(this.draggingSymbol, targetSymbol);
      }
    });

    _defineProperty(this, "handleDragOver", (targetSymbol, event) => {
      if (event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }

      const { onReorderCoin } = this.props;

      if (
        this.draggingSymbol &&
        targetSymbol &&
        this.draggingSymbol !== targetSymbol &&
        this.lastEnteredSymbol !== targetSymbol &&
        typeof onReorderCoin === "function"
      ) {
        this.lastEnteredSymbol = targetSymbol;
        onReorderCoin(this.draggingSymbol, targetSymbol);
      }
    });
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.visible && this.props.visible) {
      this.setState({
        feedback: "",
        status: "idle",
        pendingCoin: "",
        suggestions: [],
        searching: false,
        undoCoins: null,
      });
      this.draggingSymbol = null;
      this.lastEnteredSymbol = null;
    }
  }

  componentDidMount() {
    document.addEventListener("keydown", this.handleKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleKeyDown);
    this.updateSuggestions.cancel();
    clearTimeout(this.suggestionCleanupTimer);
  }

  render() {
    this._matched = 0; // reset per render; this.section() counts up
    const {
      coins,
      onClose,
      visible,
      themePreference,
      activeTheme,
      onThemeChange,
      refreshInterval,
      onRefreshIntervalChange,
      decimalPlaces,
      separatorFormat,
      onDecimalPlacesChange,
      onSeparatorFormatChange,
      currency,
      onCurrencyChange,
      tickerEnabled,
      onTickerChange,
      tickerFormat,
      onTickerFormatChange,
      autoRotate,
      onAutoRotateChange,
      autoRotateInterval,
      onAutoRotateIntervalChange,
      pageTicker,
      onPageTickerChange,
      pageTickerPosition,
      onPageTickerPositionChange,
      newsTicker,
      onNewsTickerChange,
      chartColor,
      lastSeenEnabled,
      onLastSeenChange,
      ohlcEnabled,
      onOhlcChange,
      chartType,
      onChartTypeChange,
      onChartColorChange,
      widgets,
      onWidgetToggle,
      onWidgetPreset,
    } = this.props;
    const {
      feedback,
      status,
      pendingCoin,
      suggestions,
      searching,
      activeTab,
      showRatePrompt,
      undoCoins,
    } = this.state;
    const activeCoins = Array.isArray(coins) ? coins : [];
    const suggestionsOpen = Boolean(
      pendingCoin.trim() && (suggestions.length || !searching),
    );

    return React.createElement(
      SettingsOverlay,
      {
        visible: visible,
        // mousedown + target check, not click: releasing a text selection
        // outside the card would otherwise close the panel mid-drag
        onMouseDown: (e) => {
          if (e.target === e.currentTarget && onClose) onClose();
        },
      },
      React.createElement(
        SettingsCard,
        { visible: visible },
        React.createElement(SettingsTitle, null, "Settings"),
        React.createElement(
          SettingsClose,
          { onClick: onClose, "aria-label": "Close settings" },
          "×",
        ),

        // One-time rating reminder (dismiss or rate hides it forever)
        showRatePrompt &&
          React.createElement(
            RatePromptBar,
            null,
            React.createElement(
              RatePromptText,
              null,
              "Enjoying PriceTab? A quick rating helps others find it.",
            ),
            React.createElement(
              RatePromptLink,
              {
                href: STORE_LISTING_URL,
                target: "_blank",
                rel: "noreferrer",
                onClick: this.handleRatePromptDismiss,
              },
              "Rate",
            ),
            React.createElement(
              RatePromptClose,
              {
                onClick: this.handleRatePromptDismiss,
                "aria-label": "Dismiss rating reminder",
              },
              "×",
            ),
          ),

        // Tab Buttons
        React.createElement(
          TabContainer,
          null,
          React.createElement(
            TabButton,
            {
              active: activeTab === "coins",
              onClick: () => this.handleTabChange("coins"),
            },
            "Coins",
          ),
          React.createElement(
            TabButton,
            {
              active: activeTab === "preferences",
              onClick: () => this.handleTabChange("preferences"),
            },
            "Preferences",
          ),
          React.createElement(
            TabButton,
            {
              active: activeTab === "widgets",
              onClick: () => this.handleTabChange("widgets"),
            },
            "Widgets",
          ),
        ),

        // Coins Tab Content
        activeTab === "coins" &&
          React.createElement(
            TabContent,
            { key: "coins-tab" },
            React.createElement(
              SettingsDescription,
              null,
              "Search to add coins. Drag the chips to reorder, hit × to remove.",
            ),

            React.createElement(
              CoinSectionHeader,
              null,
              React.createElement(
                CoinSectionTitle,
                { style: { margin: 0 } },
                "Selected",
              ),
              React.createElement(
                CoinCounter,
                null,
                activeCoins.length + " / " + MAX_COINS,
              ),
            ),
            React.createElement(
              CoinList,
              null,
              activeCoins.length
                ? activeCoins.map((coin) =>
                    React.createElement(
                      CoinChip,
                      {
                        key: coin,
                        selected: true,
                        "data-symbol": coin,
                        draggable: true,
                        onDragStart: (e) => this.handleDragStart(coin, e),
                        onDragEnd: this.handleDragEnd,
                        onDragOver: (e) => this.handleDragOver(coin, e),
                        onDrop: (e) => this.handleDrop(coin, e),
                      },
                      coin,
                      React.createElement(
                        CoinChipRemove,
                        {
                          onClick: (e) => {
                            e.stopPropagation();
                            this.handleChipClick(coin);
                          },
                          title: "Remove " + coin,
                        },
                        "×",
                      ),
                    ),
                  )
                : React.createElement(CoinChip, {
                    disabled: true,
                    children: "No coins yet",
                  }),
            ),
            activeCoins.length > 1 &&
              React.createElement(CoinDragHint, null, "Drag to reorder"),
            React.createElement(CoinSectionTitle, null, "Quick add"),
            React.createElement(
              SettingsForm,
              { onSubmit: this.handleSubmit },
              React.createElement(SettingsInput, {
                maxLength: 24,
                onChange: this.handleInputChange,
                placeholder: "Search name or symbol",
                autoComplete: "off",
                value: pendingCoin,
              }),
              React.createElement(
                SuggestionsArea,
                { open: suggestionsOpen },
                React.createElement(
                  SuggestionsAreaInner,
                  null,
                  React.createElement(
                    SuggestionList,
                    null,
                    suggestions.length
                      ? suggestions.map((coin) =>
                          React.createElement(
                            CoinChip,
                            {
                              key: coin,
                              "data-symbol": coin,
                              onClick: () => this.handleSuggestionClick(coin),
                            },
                            coin,
                            COIN_NAMES[coin] &&
                              React.createElement(
                                CoinChipName,
                                null,
                                COIN_NAMES[coin],
                              ),
                          ),
                        )
                      : pendingCoin.trim() && !searching
                        ? React.createElement(
                            SuggestionHint,
                            null,
                            'No match — try "Bitcoin" or "BTC"',
                          )
                        : null,
                  ),
                ),
              ),
              React.createElement(
                SettingsActionButton,
                { type: "submit" },
                "Add coin",
              ),
            ),
            feedback
              ? React.createElement(
                  SettingsFeedback,
                  { error: status === "error" },
                  feedback,
                )
              : null,
            React.createElement(
              ResetRow,
              { compact: suggestionsOpen },
              React.createElement(
                ResetButton,
                {
                  onClick: undoCoins
                    ? this.handleUndoReset
                    : this.handleResetClick,
                },
                undoCoins ? "Undo reset" : "Reset to defaults",
              ),
            ),
          ),

        // Preferences Tab Content
        activeTab === "preferences" && renderPreferencesTab(this),

        // Widgets Tab Content
        activeTab === "widgets" &&
          React.createElement(
            TabContent,
            { key: "widgets-tab" },
            React.createElement(
              ToggleSection,
              null,
              React.createElement(
                ToggleSectionDesc,
                null,
                "Show data widgets below chart",
              ),
              React.createElement(
                PresetRow,
                null,
                React.createElement(
                  PresetButton,
                  {
                    type: "button",
                    active: isPresetActive(widgets, "holder"),
                    onClick: () => onWidgetPreset && onWidgetPreset("holder"),
                  },
                  "Holder",
                ),
                React.createElement(
                  PresetButton,
                  {
                    type: "button",
                    active: isPresetActive(widgets, "trader"),
                    onClick: () => onWidgetPreset && onWidgetPreset("trader"),
                  },
                  "Trader",
                ),
                React.createElement(
                  PresetButton,
                  {
                    type: "button",
                    active: isPresetActive(widgets, "minimal"),
                    onClick: () => onWidgetPreset && onWidgetPreset("minimal"),
                  },
                  "Minimal",
                ),
              ),
              ...WIDGET_GROUPS.map((group) =>
                React.createElement(
                  Fragment,
                  { key: group.title },
                  React.createElement(WidgetGroupTitle, null, group.title),
                  ...group.items.map((item) =>
                    React.createElement(
                      ToggleRow,
                      { key: item.key },
                      React.createElement(
                        ToggleTextCol,
                        null,
                        React.createElement(ToggleLabel, null, item.label),
                        React.createElement(ToggleDesc, null, item.desc),
                      ),
                      React.createElement(ToggleSwitch, {
                        active: widgets[item.key],
                        onClick: () =>
                          onWidgetToggle && onWidgetToggle(item.key),
                        "aria-label": "Toggle " + item.label + " widget",
                      }),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ),
    );
  }
}

SettingsPanel.defaultProps = {
  coins: [],
  newsTicker: false,
  onNewsTickerChange: null,
  autoRotate: false,
  onAutoRotateChange: null,
  autoRotateInterval: DEFAULT_AUTO_ROTATE_INTERVAL,
  onAutoRotateIntervalChange: null,
  onAddCoin: null,
  onRemoveCoin: null,
  onReorderCoin: null,
  onResetCoins: null,
  onRestoreCoins: null,
  onClose: null,
  visible: false,
  widgets: {
    fearGreed: false,
    marketOverview: false,
    halvingCountdown: false,
    rsiWidget: false,
    fundingRate: false,
    longShortRatio: false,
    openInterest: false,
    liquidations: false,
    altcoinSeason: false,
  },
  onWidgetToggle: null,
};

