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

class SettingsPanel extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "state", {
      feedback: "",
      status: "idle",
      pendingCoin: "",
      suggestions: [],
      searching: false,
      /* "coins", unless a language change just reloaded us out of
       * Preferences — see `reopenSettingsTab` in `i18n.js`. */
      /* `initialTab` is a request from this session (the news panel's
       * permission line asks for Permissions); `reopenSettingsTab` is one that
       * survived a reload (a language change). The live one wins. */
      activeTab: this.props.initialTab || reopenSettingsTab || "coins", // 'coins' | 'preferences' | 'permissions' | 'shortcuts'
      query: "", // settings search
      /* Which section of the preferences is on screen — a group's key, or
       * "modes"; null is the modes. Not persisted: it is where you are
       * looking right now, not a setting. */
      prefGroup: null,
      textSize: loadTextSize(),
      /* **Not just "has it been dismissed".**
       *
       * On that alone this bar appeared on a brand-new install, the first time
       * Settings was ever opened, and again on **every** open after that until
       * someone dismissed it — while the comment beside it called it a
       * one-time reminder and the main-screen card it shares a flag with was
       * genuinely once. Asking before anyone has used the thing is the worst
       * moment to ask, and asking on every visit is the definition of nagging.
       *
       * Same two gates as the card now, and the same flags: at least
       * `RATE_PROMPT_DELAY_MS` of use, and never if either surface has already
       * asked. Whichever is reached first is the one ask there is. The way to
       * the listing when it is gone is the permanent link in Preferences. */
      showRatePrompt:
        !loadRatePromptDismissed() &&
        !loadRatePromptShown() &&
        Date.now() - getOrInitFirstUse() >= RATE_PROMPT_DELAY_MS,
      undoCoins: null,
      /* The backup section's three transient things: what a file was found to
       * hold (read but not written), a sentence about what just happened, and
       * whether the last restore can still be undone. None of them is a
       * setting, so none of them is stored. */
      backupFound: null,
      backupNote: null,
      backupUndo: pendingBackupUndo(),
      /* Which mode the pointer is over, so the line under the row can say what
       * a mode would do *before* it is clicked — which is the only moment that
       * question has a use. */
      modeHover: null,
      /* Which setting's info note is open, by section key. One at a time: two
       * open notes push the switch you were reading about off the screen. */
      openInfo: null,
      // The Permissions tab's two facts, asked of Chrome — see refreshPermissions
      permNews: [],
      permNotify: false,
    });

    this.draggingSymbol = null;
    this.draggingChipNode = null;
    this.lastEnteredSymbol = null;
    this.suggestionCleanupTimer = null;

    /* The root font size, written through and applied to the document rather
     * than held in the tree: everything outside this panel is sized in rem off
     * the same root, so a value kept in React state would move the settings
     * and nothing else. */
    _defineProperty(this, "handleTextSize", (value) => {
      this.setState({ textSize: value });
      saveTextSize(value);
      applyTextSize(value);
    });

    _defineProperty(this, "handleTabChange", (tab) => {
      this.setState({ activeTab: tab });
      // Asked of Chrome on every open of the tab, never remembered
      if (tab === "permissions") this.refreshPermissions();
    });

    /* **One way to a section**, for the menu, the number keys and "?".
     * `group` is a preference group's key, or "modes"; a search in progress
     * is cleared, since a section asked for is the one to show. */
    _defineProperty(this, "goToSection", (tab, group) => {
      this.setState({ prefGroup: group || null, query: "" });
      this.handleTabChange(tab);
    });

    /* The number keys (app.js): 1 is the top of the menu, 0 the tenth. The
     * order is the menu's as last drawn — `sectionOrder`, written by render
     * — so the keys and the menu cannot disagree about what is third. */
    _defineProperty(this, "goToNumber", (digit) => {
      const at = digit === "0" ? 9 : Number(digit) - 1;
      const next = (this.sectionOrder || [])[at];
      if (next) this.goToSection(next.tab, next.group);
    });

    /* Which section is on screen, for "?" — pressed on its own page it
     * closes Settings, as every other panel's key closes its panel. */
    _defineProperty(this, "currentSection", () => {
      if ((this.state.query || "").trim()) return "search";
      if (this.state.activeTab === "preferences") return this.state.prefGroup || "modes";
      return this.state.activeTab;
    });

    /* What Chrome holds right now, for the Permissions tab: the newsroom ids
       and whether notifications are granted. Read from the same helpers the
       news panel and the alarm switch use, so the three cannot disagree. */
    _defineProperty(this, "refreshPermissions", () => {
      Promise.all([grantedNewsSources(), notifyPermissionHeld()]).then(([permNews, permNotify]) => {
        if (this.unmounted) return;
        this.setState({ permNews, permNotify });
      });
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
    /* Every Preferences setting passes through here, and nothing else does —
     * which makes it the one place the row layout can be applied without
     * touching nineteen call sites and without reaching the Widgets and Coins
     * tabs, which are built from some of the same pieces. Wrapping the node
     * rather than restyling those pieces is the difference between this and a
     * first attempt that collapsed the widget list into one line. */
    _defineProperty(this, "section", (title, keywords, node, applies = true) => {
      if (!matchesSetting(this.state.query, title, keywords)) return null;
      if (applies) this._matched += 1;
      return node ? React.createElement(PrefRow, null, node) : node;
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

    /* The hidden file input the backup section presses. A `createRef` like the
     * portfolio's, and rendered once at the foot of the card rather than
     * inside the section, so a search that filters the section out cannot take
     * the input away from a click already in flight. */
    this.backupInput = createRef();

    /* ── the backup section ──────────────────────────────────────────────
     *
     * Reading and writing live in `storage.js`, which owns the keys; what is
     * here is the two-step the panel puts in front of a restore. `Read a
     * backup…` parses and *counts* — nothing is written by it — and the
     * filled button next to the count is the one that replaces anything.
     *
     * The page reloads after a restore because almost every setting in this
     * app is read once, at mount: writing them and carrying on would leave a
     * screen that disagreed with its own storage until the next tab. */
    _defineProperty(this, "handleBackupExport", () => {
      const backup = buildSettingsBackup();
      const count = Object.keys(backup.keys).length;
      if (!count) {
        this.setState({
          backupNote: msg("set_backup_empty", "There is nothing saved to back up yet."),
        });
        return;
      }
      downloadTextFile(
        `pricetab-settings-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2),
        "application/json",
      );
      this.setState({
        backupFound: null,
        backupNote: msg("set_backup_saved", "Saved $1 settings to a file.", count),
      });
    });

    _defineProperty(this, "handleBackupPick", () => {
      if (this.backupInput.current) this.backupInput.current.click();
    });

    _defineProperty(this, "handleBackupFile", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = ""; // so the same file can be picked twice
      if (!file) return;
      let found;
      try {
        found = readSettingsBackup(JSON.parse(await file.text()));
      } catch (error) {
        found = null; // not JSON at all, or unreadable
      }
      if (!found) {
        this.setState({
          backupFound: null,
          backupNote: msg(
            "set_backup_bad",
            "That is not a PriceTab settings backup, or it holds nothing this version can read.",
          ),
        });
        return;
      }
      // Read, counted, and not written: the next press is what writes
      this.setState({ backupFound: found, backupNote: null });
    });

    _defineProperty(this, "handleBackupRestore", () => {
      const found = this.state.backupFound;
      if (!found) return;
      const result = restoreSettingsBackup(found);
      if (!result || !result.written) {
        this.setState({
          backupFound: null,
          backupNote: msg(
            "set_backup_refused",
            "Nothing could be written — this browser's storage is full or unavailable.",
          ),
        });
        return;
      }
      window.location.reload();
    });

    _defineProperty(this, "handleBackupUndo", () => {
      if (!undoBackupRestore()) {
        this.setState({ backupUndo: null });
        return;
      }
      window.location.reload();
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
        feedback: msg("set_coins_reset", "Coins reset to defaults"),
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
        feedback: msg("set_coins_restored", "Previous coins restored"),
        status: "success",
      });
    });

    /* One-tap orders for the coin list. Dragging is precise but it is a chore
     * past a handful of coins, and "biggest first" or "today's movers first"
     * are orders you want back regularly rather than once.
     *
     * The previous order goes into the same undo slot the reset uses — a
     * sort silently discarding an arrangement you dragged into place would
     * be the same loss, so it gets the same way back.
     */
    _defineProperty(this, "handleSort", (mode) => {
      const { coins, onRestoreCoins, coinStats } = this.props;
      if (typeof onRestoreCoins !== "function" || !Array.isArray(coins)) return;
      const stats = coinStats || {};
      const value = (coin, field) => {
        const s = stats[coin];
        const n = s ? Number(s[field]) : NaN;
        return isFinite(n) ? n : null;
      };
      const previous = [...coins];
      const sorted = [...coins].sort((a, b) => {
        if (mode === "alpha") return a.localeCompare(b);
        const field = mode === "cap" ? "marketCap" : "change";
        const av = value(a, field);
        const bv = value(b, field);
        // Coins we have no figure for keep to the back rather than sorting
        // as zero, which would drop them into the middle of the list
        if (av == null && bv == null) return a.localeCompare(b);
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av; // biggest first, either way
      });
      if (sorted.every((c, i) => c === previous[i])) return; // already in order
      onRestoreCoins(sorted);
      this.setState({
        undoCoins: previous,
        feedback:
          mode === "alpha"
            ? msg("set_sorted_az", "Sorted A–Z")
            : mode === "cap"
              ? msg("set_sorted_cap", "Sorted by market cap")
              : msg("set_sorted_move", "Sorted by today's move"),
        status: "info",
      });
    });

    /* The 24h move on a selected coin chip, or nothing. Reads the snapshot the
     * app already holds — a chip never triggers a request, so a coin we have
     * no figure for simply shows its symbol as before. */
    _defineProperty(this, "renderChipChange", (coin) => {
      const stat = this.props.coinStats && this.props.coinStats[coin];
      const change = stat ? Number(stat.change) : NaN;
      if (!isFinite(change)) return null;
      return React.createElement(
        CoinChipChange,
        null,
        `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
      );
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
            feedback: msg("set_keep_one_coin", "Keep at least one coin in the rotation"),
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
          feedback: msg("set_not_recognized", "$1 not recognized", normalized || msg("set_symbol", "Symbol")),
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
        let feedback = msg("set_add_failed", "Could not add coin");
        if (result && result.reason === "duplicate") {
          feedback = msg("set_already_listed", "This symbol is already listed");
        } else if (result && result.reason === "format") {
          feedback = msg("set_symbol_shape", "Use 2-10 letters/numbers only");
        } else if (result && result.reason === "empty") {
          feedback = msg("set_symbol_empty", "Enter a symbol first");
        } else if (result && result.reason === "limit") {
          feedback = msg("set_max_coins", "Max $1 coins reached", MAX_COINS);
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
          feedback: msg("set_not_recognized", "$1 not recognized", normalized || msg("set_symbol", "Symbol")),
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
        let feedback = msg("set_add_failed", "Could not add coin");
        if (result && result.reason === "duplicate") {
          feedback = msg("set_already_listed", "This symbol is already listed");
        } else if (result && result.reason === "format") {
          feedback = msg("set_symbol_shape", "Use 2-10 letters/numbers only");
        } else if (result && result.reason === "empty") {
          feedback = msg("set_symbol_empty", "Enter a symbol first");
        } else if (result && result.reason === "limit") {
          feedback = msg("set_max_coins", "Max $1 coins reached", MAX_COINS);
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

      /* Only if the live drag has not already put it here.
       *
       * `handleDragOver` reorders as you drag, so the list under the cursor is
       * the answer before you let go. Dropping then applied the *same* move a
       * second time — and the second application is not a no-op, because the
       * two coins have swapped places by then: drag LTC to the front and the
       * list showed LTC, BTC, ETH, XRP under the cursor, then jumped to BTC,
       * LTC, ETH, XRP the moment you released. The drop kept the guard the
       * live path has, so it still commits a drop that somehow never got a
       * dragover, and does nothing when the preview already did it. */
      if (
        this.draggingSymbol &&
        targetSymbol &&
        typeof onReorderCoin === "function" &&
        this.draggingSymbol !== targetSymbol &&
        this.lastEnteredSymbol !== targetSymbol
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
    /* The panel is only mounted when it is opened (app.js renders it behind
     * `showSettings`), so mounting *is* being seen. Stamped here rather than
     * in the constructor, where a side effect does not belong, and stamped at
     * all so the two surfaces share one ask: whichever is reached first is the
     * only time this extension asks for a rating. */
    if (this.state.showRatePrompt) saveRatePromptShown();
    // Opened straight onto Permissions (the news panel's line does this)
    if (this.state.activeTab === "permissions") this.refreshPermissions();
  }

  componentWillUnmount() {
    this.unmounted = true;
    document.removeEventListener("keydown", this.handleKeyDown);
    this.updateSuggestions.cancel();
    clearTimeout(this.suggestionCleanupTimer);
  }

  render() {
    this._matched = 0; // reset per render; this.section() counts up
    // Only what this method actually renders — the coins tab and the shell. Every preference (theme, currency, ticker, chart, rotation)
    // is still a prop of this panel, but it is read where it is used:
    // renderPreferencesTab() destructures them from `panel.props` itself. They
    // were listed here too until the preferences tab was split out; do not add
    // them back unless this method starts using them.
    const {
      coins,
      onClose,
      visible,
      coinStats,
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
    const stats = coinStats || {};
    // Sorting by a figure needs the figures; until the sweep lands we say so
    // on the buttons rather than offering an order we can't produce
    const hasStats = activeCoins.some((c) => stats[c]);

    /* The preferences, grouped once for the menu and the pane together —
       see preferenceGroups. Built before anything is drawn, so the search's
       tally (`_matched`) is final by the time the pane reads it. */
    const groups = preferenceGroups(this);
    const hunting = Boolean((this.state.query || "").trim());
    const pick = this.state.prefGroup || "modes";
    const onPrefs = activeTab === "preferences";
    const group = groups.find((g) => g.key === pick);
    const go = this.goToSection;
    /* The menu in order, once: what the number keys walk (see goToNumber)
       and where each item's number comes from. */
    const sections = [
      { key: "coins", tab: "coins" },
      { key: "modes", tab: "preferences", group: "modes" },
      ...groups.map((g) => ({ key: g.key, tab: "preferences", group: g.key })),
      { key: "permissions", tab: "permissions" },
      { key: "shortcuts", tab: "shortcuts" },
    ];
    this.sectionOrder = sections;
    const keyFor = (key) => {
      if (key === "shortcuts") return "?";
      const i = sections.findIndex((x) => x.key === key);
      return i < 0 || i > 9 ? null : i === 9 ? "0" : String(i + 1);
    };
    const head = hunting
      ? { title: msg("set_search_for", "Settings matching “$1”", this.state.query.trim()), desc: null }
      : activeTab === "coins"
        ? {
            title: msg("set_tab_coins", "Coins"),
            /* The wording follows the layout. They were chips; they are rows
             * now, and a hint that names a shape the screen no longer has is
             * worse than no hint. */
            desc: msg("set_coins_help", "Search to add a coin. Drag a row to reorder, hit × to remove."),
          }
        : activeTab === "permissions"
          ? { title: msg("set_tab_permissions", "Permissions"), desc: null }
          : activeTab === "shortcuts"
            ? {
                title: msg("sc_title", "Keyboard shortcuts"),
                desc: msg("sc_section_desc", "Every key this tab answers to, by where it works."),
              }
          : pick === "modes" || !group
            /* No line under the name: the row's own sentence, under its
               pills, says what a mode does and which one you are in. */
            ? { title: msg("pref_modes", "Modes"), desc: null }
            : { title: group.title, desc: group.desc };
    const navItem = (key, label, count, active, onClick, attrs) =>
      React.createElement(
        SettingsNavItem,
        Object.assign(
          {
            key: key,
            active: active,
            "aria-current": active ? "page" : undefined,
            /* Its key, where the pointer rests: the menu is walked by number. */
            title: keyFor(key) ? `${label} (${keyFor(key)})` : label,
            onClick: onClick,
          },
          attrs,
        ),
        React.createElement(
          SettingsNavLabel,
          null,
          keyFor(key) ? keyCap(keyFor(key), { quiet: !active, "aria-hidden": "true" }) : null,
          React.createElement("span", null, label),
        ),
        count == null ? null : React.createElement(SettingsNavCount, null, String(count)),
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
        { visible: visible, "data-settings-card": "true" },
        React.createElement(
          SettingsHead,
          null,
          React.createElement(SettingsTitle, null, msg("chrome_settings", "Settings"), keyCap("S")),
        ),

        // One-time rating reminder (dismiss or rate hides it forever)
        showRatePrompt &&
          React.createElement(
            RatePromptBar,
            null,
            React.createElement(
              RatePromptText,
              null,
              /* Asks for the rating on the one honest ground there is: the
               * store's ranking is how anybody else finds this, and a rating
               * is the only thing a user can give that helps. It stays a
               * question rather than a claim — "if you like it" — because the
               * app does not know whether they do. */
              msg(
                "app_rate_ask",
                "Liking PriceTab? A rating is how other people find it — it takes a few seconds and helps more than anything else.",
              ),
            ),
            React.createElement(
              RatePromptLink,
              {
                href: STORE_LISTING_URL,
                target: "_blank",
                rel: "noreferrer",
                onClick: this.handleRatePromptDismiss,
              },
              msg("set_rate", "Rate"),
            ),
            React.createElement(
              RatePromptClose,
              {
                onClick: this.handleRatePromptDismiss,
                "aria-label": msg("set_rate_dismiss", "Dismiss rating reminder"),
              },
              "×",
            ),
          ),

        React.createElement(
          SettingsLayout,
          null,
          React.createElement(
            SettingsNav,
            { "aria-label": msg("chrome_settings", "Settings") },
            React.createElement(SettingsNavSearch, {
              type: "text",
              value: this.state.query,
              placeholder: msg("pref_search", "Search settings…"),
              "aria-label": msg("pref_search_label", "Search settings"),
              onChange: (e) => this.setState({ query: e.target.value }),
            }),
            navItem("coins", msg("set_tab_coins", "Coins"), activeCoins.length,
              !hunting && activeTab === "coins", () => go("coins"), { "data-tab": "coins" }),
            React.createElement(SettingsNavCaption, { key: "cap-prefs" }, msg("set_tab_preferences", "Preferences")),
            navItem("modes", msg("pref_modes", "Modes"), null,
              !hunting && onPrefs && pick === "modes", () => go("preferences", "modes"),
              { "data-tab": "preferences", "data-pref-group": "modes" }),
            ...groups.map((g) =>
              navItem(g.key, g.title, g.nodes.length,
                !hunting && onPrefs && pick === g.key, () => go("preferences", g.key),
                { "data-pref-group": g.key }),
            ),
            React.createElement(SettingsNavCaption, { key: "cap-access" }, msg("set_nav_access", "Access")),
            navItem("permissions", msg("set_tab_permissions", "Permissions"), null,
              !hunting && activeTab === "permissions", () => go("permissions"),
              { "data-tab": "permissions" }),
            React.createElement(SettingsNavCaption, { key: "cap-help" }, msg("set_nav_help", "Help")),
            navItem("shortcuts", msg("sc_title", "Keyboard shortcuts"), null,
              !hunting && activeTab === "shortcuts", () => go("shortcuts"),
              { "data-tab": "shortcuts" }),
            /* The tour only ever shows itself once, and the store link is
               the door the rating ask leaves open. Not settings, and not
               pages either — each one leaves Settings — so under the menu
               rather than in it. */
            React.createElement(
              SettingsNavFoot,
              { key: "foot" },
              React.createElement(
                FootHint,
                {
                  onClick: () => this.props.onReplayTour && this.props.onReplayTour(),
                  title: msg("pref_replay_hint", "Run the first-run tour again"),
                },
                msg("pref_replay_tour", "Replay tour"),
              ),
              React.createElement(
                RateHint,
                {
                  href: STORE_LISTING_URL,
                  target: "_blank",
                  rel: "noreferrer",
                  title: msg("pref_rate_hint", "Open the Chrome Web Store listing in a new tab"),
                },
                msg("pref_rate", "Rate PriceTab"),
              ),
            ),
          ),
          React.createElement(
            SettingsPane,
            { "data-settings-section": hunting ? "search" : onPrefs ? pick : activeTab },
            React.createElement(
              SettingsSectionHead,
              null,
              React.createElement(SettingsSectionTitle, null, head.title),
              head.desc ? React.createElement(SettingsSectionDesc, null, head.desc) : null,
            ),
            hunting || onPrefs
              ? renderPreferencesSection(this, groups, pick, hunting)
              : activeTab === "permissions"
                ? renderPermissionsTab(this)
                : activeTab === "shortcuts"
                  ? renderShortcutsSection()
                : React.createElement(
                    TabContent,
                    { key: "coins-tab" },


                      React.createElement(
                        CoinColumns,
                        { two: true },
                      React.createElement(
                        CoinPane,
                        { "data-coin-pane": "list" },
                      React.createElement(
                        CoinSectionHeader,
                        null,
                        React.createElement(
                          CoinSectionTitle,
                          { style: { margin: 0 } },
                          msg("set_selected", "Selected"),
                        ),
                        React.createElement(
                          CoinCounter,
                          null,
                          activeCoins.length + " / " + MAX_COINS,
                        ),
                      ),
                      activeCoins.length > 1 &&
                        React.createElement(
                          CoinSortRow,
                          null,
                          React.createElement(CoinSortLabel, null, msg("set_sort", "Sort")),
                          React.createElement(
                            CoinSortButton,
                            {
                              onClick: () => this.handleSort("alpha"),
                              title: msg("set_sort_az_hint", "Order the list alphabetically"),
                            },
                            "A–Z",
                          ),
                          React.createElement(
                            CoinSortButton,
                            {
                              onClick: () => this.handleSort("change"),
                              disabled: !hasStats,
                              title: hasStats
                                ? msg("set_sort_move_hint", "Biggest 24h move first")
                                : msg("set_sort_move_wait", "Waiting for today's prices"),
                            },
                            msg("set_sort_move", "24h move"),
                          ),
                          React.createElement(
                            CoinSortButton,
                            {
                              onClick: () => this.handleSort("cap"),
                              disabled: !hasStats,
                              title: hasStats
                                ? msg("set_sort_cap_hint", "Largest market cap first")
                                : msg("set_sort_cap_wait", "Waiting for market data"),
                            },
                            msg("set_sort_cap", "Market cap"),
                          ),
                        ),
                      React.createElement(
                        CoinList,
                        { count: activeCoins.length },
                        activeCoins.length
                          ? activeCoins.map((coin) =>
                              /* Not a button. The × inside it is the only action here,
                               * and a button inside a button is invalid — so the chip is
                               * the drag handle and the frame, and the × is the control.
                               * It was the other way round: the chip was a `<button>`
                               * with no `onClick`, so Tab landed on something that did
                               * nothing and never reached the × at all — there was no
                               * way to remove a coin without a pointer. */
                              React.createElement(
                                CoinChipStatic,
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
                                /* The name, which a pill had no room for and a row does.
                                 * It costs nothing — `COIN_NAMES` is a plain map in
                                 * `config.js` — and it is the difference between a list
                                 * of three-letter codes and a list you can read. */
                                React.createElement(
                                  CoinRowName,
                                  null,
                                  COIN_NAMES[coin] || "",
                                ),
                                // Free — the ticker snapshot is already in memory
                                this.renderChipChange(coin),
                                React.createElement(
                                  CoinChipRemove,
                                  {
                                    onClick: (e) => {
                                      e.stopPropagation();
                                      this.handleChipClick(coin);
                                    },
                                    title: msg("set_remove_coin", "Remove $1", coin),
                                    "aria-label": msg("set_remove_coin", "Remove $1", coin),
                                  },
                                  "×",
                                ),
                              ),
                            )
                          : React.createElement(CoinChip, {
                              disabled: true,
                              children: msg("set_no_coins", "No coins yet"),
                            }),
                      ),
                      ),
                      /* The hint at the top of the tab already says the chips drag and the
                       * × removes. Saying it again under them was the same sentence
                       * twice on one short screen. */
                      React.createElement(
                        CoinPane,
                        { "data-coin-pane": "add" },
                      React.createElement(CoinSectionTitle, null, msg("set_quick_add", "Quick add")),
                      React.createElement(
                        SettingsForm,
                        { onSubmit: this.handleSubmit },
                        React.createElement(SettingsInput, {
                          maxLength: 24,
                          onChange: this.handleInputChange,
                          placeholder: msg("set_search_placeholder", "Search name or symbol"),
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
                          msg("set_add_coin", "Add coin"),
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
                          // Covers a reset and a sort, both of which replace the order
                          undoCoins
                              ? msg("set_undo", "Undo")
                              : msg("set_reset_defaults", "Reset to defaults"),
                        ),
                      ),
                      ),
                      ),
                  ),
          ),
        ),

        /* The backup file picker. Mounted with the preferences rather than
         * inside the section it belongs to: the settings search can filter a
         * section out from under a click, and an input that vanishes mid-press
         * is a button that silently does nothing. */
        (onPrefs || hunting) &&
          React.createElement("input", {
            type: "file",
            accept: ".json,application/json",
            style: { display: "none" },
            ref: this.backupInput,
            onChange: this.handleBackupFile,
            "aria-hidden": true,
            tabIndex: -1,
          }),
      ),
    );
  }
}

/* **THE WIDGETS' OWN SETTINGS, IN THE WIDGETS' DRAWER** (26 Sep 2026,
 * *"bu sol bardaki widgets ayarları widget kısmının içerisinde olsun, yani
 * onu normal ayarlardan çıkarıp bu kısım için uyumlu hale getirelim"*).
 *
 * They were Settings' third tab. Once the cards became a drawer of their
 * own (25 Sep) the cards and the switches that choose them were two panels
 * apart — a switch flipped in a full-screen Settings, with the cards it
 * changed hidden behind it, and a drawer whose empty state could only send
 * you away to that tab. They are the drawer's second view now ("Choose",
 * app.js), so a card switched on is there the moment you go back to the
 * cards.
 *
 * **Moved whole**: the same bundles, the same WIDGET_GROUPS list with its
 * descriptions — in one column, because the drawer opens 30rem wide. The
 * size row went to the drawer's head on 27 Sep 2026, beside the cards it
 * sizes (WidgetsSizeGroup). The one line that went is "Show data
 * widgets below chart", which stopped being where they are. A plain
 * function like renderPreferencesTab, because its owner is the drawer in
 * app.js and not this panel. */
const widgetChooser = ({ widgets, onWidgetToggle, onWidgetPreset }) =>
  React.createElement(
    WidgetChooserFrame,
    { "data-widget-chooser": "1" },
    React.createElement(
    ToggleSection,
    null,
    React.createElement(WidgetGroupTitle, null, msg("set_bundles", "Bundles")),
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
        msg("set_bundle_holder", "Holder"),
      ),
      React.createElement(
        PresetButton,
        {
          type: "button",
          active: isPresetActive(widgets, "trader"),
          onClick: () => onWidgetPreset && onWidgetPreset("trader"),
        },
        msg("set_bundle_trader", "Trader"),
      ),
      React.createElement(
        PresetButton,
        {
          type: "button",
          active: isPresetActive(widgets, "minimal"),
          onClick: () => onWidgetPreset && onWidgetPreset("minimal"),
        },
        msg("set_bundle_minimal", "Minimal"),
      ),
    ),
    React.createElement(
      WidgetGroups,
      { two: false },
      ...WIDGET_GROUPS.map((group) =>
      React.createElement(
        WidgetGroup,
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
              "aria-pressed": (widgets[item.key]) ? "true" : "false",
              onClick: () =>
                onWidgetToggle && onWidgetToggle(item.key),
              "aria-label": msg("set_toggle_widget", "Toggle $1 widget", item.label),
            }),
          ),
        ),
      ),
      ),
    ),
    ),
  );

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
  coinStats: null, // { COIN: { price, change, marketCap } }, from the app
};

