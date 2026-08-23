/* THE NEWS PANEL
 *
 * A reading surface for headlines, opened with "N" or the corner button, with
 * the same three-band shape the targets and calls panels use: a head that says
 * what you are looking at, a list that is the only thing that scrolls, and a
 * foot that holds the controls.
 *
 * It exists because the news this extension had was not good enough, and the
 * measurement is in `NEWS_SOURCES` (`config.js`): the one keyless feed carried
 * seven outlets, a third of them from a single aggregator, and had published
 * nothing for a hundred and one hours. Everything worth reading sends no CORS
 * header, so it can only be reached with host access — which is asked for
 * here, from a button, and never at install.
 *
 * Two things this panel does that a scrolling ticker cannot, and they are the
 * reason it is a panel:
 *
 *   1. **It shows the age of every line, and the age of every source.** A feed
 *      that has stopped is the failure this whole feature was built around, and
 *      a row of four-day-old headlines with nothing saying so is worse than an
 *      empty panel. The foot names any source that has gone quiet.
 *   2. **It can be narrowed.** By coin — everything, the coins you follow, or
 *      what you hold — by source, and by a search box. A ticker can only be
 *      read in the order it scrolls past.
 */

/* Which optional sources are switched on, and whether Chrome has actually
 * granted them. Two different questions: a source can be enabled in settings
 * and not granted (the permission was revoked from chrome://extensions), and
 * granted but switched off. The panel has to be able to say which.
 */
const newsOptionalOrigins = () =>
  NEWS_SOURCES.filter((s) => s.optional).map((s) => NEWS_SOURCE_ORIGINS[s.id]);

/* `chrome.permissions` is absent in a plain page and in the test harness, so
 * every one of these degrades to "nothing is granted" rather than throwing.
 * That is also the honest answer there: without the API there is no way to ask.
 */
const hasPermissionsApi = () =>
  typeof chrome !== "undefined" &&
  chrome.permissions &&
  typeof chrome.permissions.contains === "function";

/* Read `chrome.runtime.lastError` **first**, unconditionally, then the answer.
 *
 * Every one of these callbacks used to say `Boolean(granted) && !lastError`,
 * and `&&` short-circuits: on a refusal Chrome passes `undefined`, so
 * `Boolean(undefined)` was false, the right-hand side never ran, and
 * `lastError` was never touched. Chrome only counts an error as handled once
 * something reads that property — so the one line written to check it was the
 * reason the console filled with *"Unchecked runtime.lastError: Only
 * permissions specified in the manifest may be requested."* on every load of a
 * profile whose installed manifest predates `optional_host_permissions`.
 * Reading it first also means the refusal is what it always should have been:
 * "not granted", not an unhandled error.
 */
const readGranted = (value) => {
  const failed = Boolean(
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError,
  );
  return !failed && Boolean(value);
};

/* Which optional sources are granted — **asked one origin at a time**.
 *
 * It used to ask about all six at once, which answers "are they all held?" and
 * nothing else. Revoking a single origin from `chrome://extensions` then read
 * as revoking everything: the fetch dropped all six, and the panel offered the
 * full "6 newsrooms are one click away" card while five were still granted.
 * A partial grant had the same shape from the other direction — Chrome hands
 * back false, so nothing refetched even though sources had just become
 * readable.
 *
 * Returns the ids that are actually held, so both callers can be specific:
 * the fetch asks only the sources it may ask, and the panel can say four of
 * six rather than guessing.
 */
const grantedNewsSources = () => {
  const optional = NEWS_SOURCES.filter((s) => s.optional);
  if (!hasPermissionsApi()) return Promise.resolve([]);
  return Promise.all(
    optional.map(
      (source) =>
        new Promise((done) => {
          try {
            chrome.permissions.contains(
              { origins: [NEWS_SOURCE_ORIGINS[source.id]] },
              (granted) => done(readGranted(granted)),
            );
          } catch (error) {
            done(false);
          }
        }),
    ),
  ).then((held) => optional.filter((s, i) => held[i]).map((s) => s.id));
};

/* Must be called straight out of a click. Chrome refuses a permission request
 * that is not tied to a user gesture, and it refuses it silently enough that
 * routing this through a promise chain first looks like the user declining. */
const requestNewsPermission = () =>
  new Promise((resolve) => {
    if (!hasPermissionsApi() || typeof chrome.permissions.request !== "function") {
      return resolve(false);
    }
    try {
      chrome.permissions.request(
        { origins: newsOptionalOrigins() },
        (granted) => resolve(readGranted(granted)),
      );
    } catch (error) {
      resolve(false);
    }
  });

const dropNewsPermission = () =>
  new Promise((resolve) => {
    if (!hasPermissionsApi() || typeof chrome.permissions.remove !== "function") {
      return resolve(false);
    }
    try {
      chrome.permissions.remove({ origins: newsOptionalOrigins() }, (done) =>
        resolve(readGranted(done)),
      );
    } catch (error) {
      resolve(false);
    }
  });

/* "3m", "2h", "4d" — a headline's age is the second most useful thing about it
 * after what it says, and on a terminal it belongs in its own column. Falls
 * back to an empty string rather than to "now": a story with no timestamp is
 * not a story that just broke. */
const newsAge = (ms) => {
  if (!isFinite(ms) || ms <= 0) return "";
  const secs = Math.max(0, (Date.now() - ms) / 1000);
  if (secs < 90) return "now";
  const mins = secs / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 14) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
};

class NewsPanel extends PureComponent {
  constructor(props) {
    super(props);
    // `granted` is the list of source ids Chrome actually holds, not a
    // yes/no — five of six granted is a real state and has to look like one
    this.state = { query: "", granted: [], asking: false };
    this.searchRef = createRef();
    // Bound in the constructor, like every other panel here — the vendored
    // React is 16.5 and this file is read next to `alerts.js`
    this.handleSearchKey = this.handleSearchKey.bind(this);
    this.handleAsk = this.handleAsk.bind(this);
    this.handleDrop = this.handleDrop.bind(this);
    this.handleQuery = this.handleQuery.bind(this);
  }

  handleQuery(e) {
    this.setState({ query: e.target.value });
  }

  componentDidMount() {
    this.refreshPermission();
  }

  componentWillUnmount() {
    this.gone = true;
  }

  refreshPermission() {
    grantedNewsSources().then((granted) => {
      if (!this.gone) this.setState({ granted });
    });
  }

  /* Esc from inside the search box only. Everywhere else on the panel it is
   * `app.js`'s chain that closes this, the same as every other overlay — but
   * that handler stands down in a text field, which is exactly where someone
   * pressing Esc to get out of a search is. The targets panel does the same. */
  handleSearchKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      this.props.onClose();
    }
  }

  handleAsk() {
    const before = this.state.granted.length;
    this.setState({ asking: true });
    /* Straight out of the click — see `requestNewsPermission`. What comes back
     * is Chrome's all-or-nothing answer, which is not enough to act on: a
     * partial grant resolves false there while genuinely making sources
     * readable. So the truth is re-read per origin, and the refetch is
     * triggered by the list having *grown*, not by Chrome saying yes. */
    requestNewsPermission().then(() => {
      if (this.gone) return;
      grantedNewsSources().then((granted) => {
        if (this.gone) return;
        this.setState({ granted, asking: false });
        if (granted.length > before && this.props.onSourcesChange) {
          this.props.onSourcesChange();
        }
      });
    });
  }

  handleDrop() {
    dropNewsPermission().then(() => {
      if (this.gone) return;
      this.refreshPermission();
      if (this.props.onSourcesChange) this.props.onSourcesChange();
    });
  }

  /* Everything the list is narrowed by, applied in one place so the count in
   * the head and the rows below it can never disagree. */
  rows() {
    const { items, enabled, scope, coinOptions, portfolio } = this.props;
    const query = this.state.query.trim().toLowerCase();
    let list = Array.isArray(items) ? items : [];
    list = list.filter((i) => enabled[i.source] !== false);
    if (scope === "coins") list = newsForCoins(list, coinOptions);
    if (scope === "portfolio") {
      list = newsForCoins(list, (portfolio || []).map((h) => h.coin));
    }
    if (query) list = list.filter((i) => i.title.toLowerCase().includes(query));
    return list;
  }

  /* Which sources answered, and when each last published.
   *
   * This is the panel's own reason for existing, so it is computed from the
   * items on screen rather than from what the fetchers reported: a source can
   * answer 200 all day and still have printed nothing since Tuesday, which is
   * exactly what happened. */
  sourceState() {
    const { items } = this.props;
    const newest = {};
    for (const item of Array.isArray(items) ? items : []) {
      if (!item.time) continue;
      if (!newest[item.source] || item.time > newest[item.source]) {
        newest[item.source] = item.time;
      }
    }
    return newest;
  }

  /* Why the list is empty, which is four different things and used to be two.
   *
   * "Fetching headlines…" was shown whenever there were no items, because the
   * loading flag was `items.length === 0` — so a fetch that came back with
   * nothing looked exactly like one still running, for ever. The distinction
   * that matters most is the last one: nothing arrived at all is a different
   * problem from your own filters hiding what did.
   */
  emptyReason(loading) {
    if (loading) return "Fetching headlines…";
    if (this.state.query) return `Nothing matching “${this.state.query}”.`;
    if (!(Array.isArray(this.props.items) && this.props.items.length)) {
      return this.props.blocked
        ? "No headlines came back. The newsrooms are allowed but did not " +
            "answer — reloading this tab usually fixes it."
        : "No headlines came back. Nothing was reachable this time.";
    }
    return (
      "Nothing here with those filters. Widen the scope, or switch a source " +
      "back on below."
    );
  }

  renderSourceChips(newest) {
    const { enabled, onToggleSource } = this.props;
    const seen = new Set(
      (Array.isArray(this.props.items) ? this.props.items : []).map((i) => i.source),
    );
    const names = [...seen].sort();
    if (!names.length) return null;
    return React.createElement(
      NewsChips,
      null,
      ...names.map((name) => {
        const quiet =
          newest[name] && Date.now() - newest[name] > NEWS_STALE_MS
            ? newsAge(newest[name])
            : "";
        return React.createElement(
          NewsChip,
          {
            key: name,
            active: enabled[name] !== false,
            onClick: () => onToggleSource(name),
            title: quiet
              ? `${name} — nothing new for ${quiet}`
              : `Show or hide ${name}`,
            "aria-pressed": enabled[name] !== false,
          },
          name,
          /* A source that has gone quiet says so on its own chip. The whole
           * feature exists because a dead feed used to look exactly like a
           * live one. */
          quiet && React.createElement(NewsChipAge, null, quiet),
        );
      }),
    );
  }

  renderAccess() {
    const { granted, asking } = this.state;
    if (!hasPermissionsApi()) return null;
    const total = NEWS_SOURCES.filter((s) => s.optional).length;
    const held = granted.length;

    /* Everything granted: one line and the way back out. */
    if (held === total) {
      return React.createElement(
        NewsAccessRow,
        null,
        React.createElement(
          NewsAccessNote,
          null,
          this.props.blocked
            ? `Granted, but none of the ${total} newsrooms answered. Reloading this tab usually fixes it.`
            : `Reading ${total} newsrooms directly.`,
        ),
        React.createElement(
          NewsAccessOff,
          { onClick: this.handleDrop },
          "Turn off",
        ),
      );
    }

    /* Some but not all — a real state, reachable by revoking one origin from
     * chrome://extensions. It used to render as the full ask card, which told
     * someone with five of six granted that they had none. */
    if (held) {
      return React.createElement(
        NewsAccessRow,
        null,
        React.createElement(
          NewsAccessNote,
          null,
          `Reading ${held} of ${total} newsrooms.`,
        ),
        React.createElement(
          NewsAccessBtn,
          { onClick: this.handleAsk, disabled: asking },
          asking ? "Asking Chrome…" : "Allow the rest",
        ),
        React.createElement(
          NewsAccessOff,
          { onClick: this.handleDrop },
          "Turn off",
        ),
      );
    }

    return React.createElement(
      NewsAccessCard,
      null,
      React.createElement(
        NewsAccessTitle,
        null,
        `${total} newsrooms are one click away`,
      ),
      React.createElement(
        NewsAccessBody,
        null,
        "Cointelegraph, Decrypt, CryptoSlate, Bitcoin Magazine, CoinJournal and " +
          "BBC Business publish feeds that a browser will not let a page read " +
          "without your say-so. Chrome will ask you to allow it.",
      ),
      React.createElement(
        NewsAccessBody,
        null,
        "Nothing is sent to them and nothing is stored anywhere but this " +
          "device — PriceTab only reads what they publish. You can turn it " +
          "off here again at any time.",
      ),
      React.createElement(
        NewsAccessBtn,
        { onClick: this.handleAsk, disabled: asking },
        asking ? "Asking Chrome…" : "Turn on full sources",
      ),
    );
  }

  render() {
    const { scope, onScopeChange, loading } = this.props;
    const newest = this.sourceState();
    const rows = this.rows();
    const anyQuiet = Object.keys(newest).some(
      (name) => Date.now() - newest[name] > NEWS_STALE_MS,
    );

    return React.createElement(
      NewsOverlay,
      {
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) this.props.onClose();
        },
      },
      React.createElement(
        NewsCard,
        { role: "dialog", "aria-label": "News" },
        React.createElement(
          NewsHead,
          null,
          React.createElement(NewsTitle, null, "News"),
          React.createElement(
            NewsCount,
            null,
            rows.length === 1 ? "1 story" : `${rows.length} stories`,
          ),
          React.createElement(
            NewsClose,
            { onClick: this.props.onClose, "aria-label": "Close news" },
            "×",
          ),
        ),

        React.createElement(
          NewsControls,
          null,
          React.createElement(NewsSearch, {
            type: "text",
            value: this.state.query,
            placeholder: "Search headlines…",
            "aria-label": "Search headlines",
            innerRef: this.searchRef,
            onChange: this.handleQuery,
            onKeyDown: this.handleSearchKey,
          }),
          React.createElement(
            NewsScopeRow,
            null,
            ...NEWS_FILTER_OPTIONS.map((option) =>
              React.createElement(
                NewsScopeBtn,
                {
                  key: option.value,
                  active: scope === option.value,
                  onClick: () => onScopeChange(option.value),
                  "aria-pressed": scope === option.value,
                },
                option.label,
              ),
            ),
          ),
        ),
        this.renderSourceChips(newest),

        React.createElement(
          NewsList,
          null,
          rows.length
            ? rows.map((item, i) =>
                React.createElement(
                  NewsRow,
                  {
                    key: `n-${i}-${item.title.slice(0, 24)}`,
                    href: item.url || undefined,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    title: item.url
                      ? `Read on ${item.source} — opens in a new tab`
                      : item.title,
                  },
                  React.createElement(NewsRowAge, null, newsAge(item.time)),
                  React.createElement(NewsRowSource, null, item.source),
                  React.createElement(NewsRowTitle, null, item.title),
                ),
              )
            : React.createElement(
                NewsEmpty,
                null,
                this.emptyReason(loading),
              ),
        ),

        /* The foot carries the one fact a ticker could never show: whether what
         * you are reading is current. */
        anyQuiet &&
          React.createElement(
            NewsStale,
            null,
            "A source with an age beside its name has published nothing since " +
              "then. That is the feed being quiet, not PriceTab failing to ask.",
          ),
        this.renderAccess(),
      ),
    );
  }
}
