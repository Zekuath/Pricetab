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

/* The moment itself, for the row's tooltip. Written as a suffix so a story
 * with no usable date says nothing rather than saying "Invalid Date" — an
 * undated item is a real and common case in these feeds. */
const newsExactTime = (ms) => {
  if (!isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  return ` · ${d.toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

/* How many of a cluster's other newsrooms are named on the row. Four, for the
 * reason the coin chips stop at three: past that the second line is longer
 * than the headline above it and the list stops being something you scan. */
const NEWS_ALSO_NAMED = 4;

/* How recent an unusual move has to be to be worth a section of its own.
 *
 * Six hours. The visible range can be a year, so without a limit the section
 * would announce a Tuesday in March as though it had just happened — and the
 * feed in memory reaches back days, not months, so it could not have said
 * anything about it either. Short enough that the section is genuinely about
 * now, long enough to survive a night's sleep and the tab being reopened in
 * the morning. */
const NEWS_UNUSUAL_MAX_AGE_MS = 6 * 60 * 60 * 1000;

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

  /* Did the coin on the chart just do something unusual *for itself*?
   *
   * This is the one section of the panel that is not a filter, and it is here
   * because the panel and the chart were two screens that never mentioned each
   * other: you would watch a coin drop, open the news, and be handed the whole
   * feed newest-first with nothing pointing at what you had just seen.
   *
   * **Unusual for itself, never a fixed percentage.** `findUnusualMoves`
   * measures in standard deviations of the series' own step-to-step log
   * returns, which is what makes it mean the same thing on DOGE and on USDC;
   * 3% is an ordinary hour for one and a violent year for the other. The
   * series is the one already drawn on the chart, so this costs no request, no
   * cache entry and no state field — the same terms the VWAP line is on.
   *
   * **It is only offered when there is something to say.** No unusual move, no
   * section: a heading that appears every time with "nothing unusual" under it
   * is furniture. And the wording claims nothing about why — the move card
   * already carries that rule, and `tests/test-polish-render.js` §11 asserts
   * the word "because" appears nowhere near headlines placed against a price
   * move. What is on offer is "this happened, and this is what was being
   * said", in that order.
   *
   * Nothing here is a signal. It reports a moment that already happened, which
   * is the line every quantitative feature in this app is on. */
  unusualNow() {
    const { coin, priceHistory, items } = this.props;
    if (!coin || !Array.isArray(priceHistory) || !Array.isArray(items)) {
      return null;
    }
    /* Every unusual moment, not the biggest few. `findUnusualMoves` caps by
     * **size** and then re-sorts into time order, so asking for one hands back
     * the largest move in the window — and the last element of that list is
     * therefore the largest, not the latest. With a cap this generous the list
     * is every step past the threshold, so its last element is the most recent
     * one, which is the question being asked. It costs nothing: the pass over
     * the series happens either way, and only the slice changes. */
    const moves = findUnusualMoves(priceHistory, { max: 200 });
    if (!moves.length) return null;
    const move = moves[moves.length - 1];
    /* Only if it is *recent*. The visible range can be a year, and "BTC moved
     * unusually" about a Tuesday in March is not news — it is a fact about the
     * chart you are already looking at. A move older than the window is left
     * to the mark on the chart, which is where it belongs. */
    if (!(Date.now() - move.time < NEWS_UNUSUAL_MAX_AGE_MS)) return null;
    /* Headlines from the move onwards, not from around it: the archive lookup
     * the chart mark does is a request, and this section is deliberately free.
     * What it has is the feed already in memory, so it can only speak about
     * the window the feed covers — which is why an empty answer here says the
     * feed has nothing rather than that nothing was written. */
    const enabled = this.props.enabled || {};
    const found = headlinesForCoin(
      items.filter((i) => i && enabled[i.source] !== false),
      coin,
      move.startTime,
      3,
    );
    return { move, items: found };
  }

  /* The section itself. Nothing when there is nothing to say — see
   * `unusualNow` for why a permanent heading would be furniture. */
  renderUnusual() {
    const found = this.unusualNow();
    if (!found) return null;
    const { coin } = this.props;
    const { move, items } = found;
    const up = move.pct >= 0;
    return React.createElement(
      NewsUnusual,
      null,
      React.createElement(
        NewsUnusualHead,
        null,
        React.createElement(
          NewsUnusualMove,
          { up },
          /* The sign is written, not only coloured — the same rule the
             contribution bars follow, so the line survives a screenshot and
             either kind of red-green deficiency. */
          `${up ? "+" : "−"}${Math.abs(move.pct).toFixed(1)}%`,
        ),
        React.createElement(
          NewsUnusualWhat,
          null,
          msg(
            "news_unusual_head",
            "$1 moved unusually for itself, $2",
            coin,
            newsAge(move.time),
          ),
        ),
      ),
      items.length
        ? React.createElement(
            NewsUnusualList,
            null,
            ...items.map((item, i) =>
              React.createElement(
                NewsUnusualLink,
                {
                  key: `u-${i}`,
                  href: item.url || undefined,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  title: item.url
                    ? `${item.source}${newsExactTime(item.time)}`
                    : item.title,
                },
                item.title,
              ),
            ),
          )
        : React.createElement(
            NewsUnusualNone,
            null,
            /* Two different silences, and this is the honest one: the feed in
               memory has nothing, which is not the same as nothing having been
               written. The chart's own mark asks an archive; this section
               deliberately does not, so it says which question it answered. */
            msg(
              "news_unusual_none",
              "Nothing in the loaded feed mentions it.",
            ),
          ),
      React.createElement(
        NewsUnusualNote,
        null,
        /* The claim is bounded here, once, in the section itself — not left to
           a tooltip. What follows a move is what was being said, never why it
           moved. */
        msg(
          "news_unusual_note",
          "Measured against this coin's own typical step on the range you are looking at. These are headlines from the same window, not a cause.",
        ),
      ),
    );
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
    /* Cluster **last**, on what survived the filters, and that ordering is the
     * whole of it.
     *
     * Clustering at fetch and storing the result would have been cheaper —
     * once per refresh instead of once per keystroke — and wrong twice over: a
     * cluster headed by a source you have since switched off would take its
     * three surviving newsrooms off the screen with it, and a search matching
     * only a folded member would find nothing. Done here, turning Decrypt off
     * simply promotes whoever is next, and searching lifts the matching write-
     * up out of the fold. The list is at most a few hundred rows and the work
     * is a pass over it, so per-render is affordable; see clusterNewsItems in
     * api.js for the measurement. */
    return clusterNewsItems(list);
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
    if (loading) return msg("news_fetching", "Fetching headlines…");
    if (this.state.query) {
      return msg("news_no_match", "Nothing matching “$1”.", this.state.query);
    }
    if (!(Array.isArray(this.props.items) && this.props.items.length)) {
      return this.props.blocked
        ? msg(
            "news_none_blocked",
            "No headlines came back. The newsrooms are allowed but did not answer — reloading this tab usually fixes it.",
          )
        : msg(
            "news_none_at_all",
            "No headlines came back. Nothing was reachable this time.",
          );
    }
    return msg(
      "news_none_filtered",
      "Nothing here with those filters. Widen the scope, or switch a source back on below.",
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
            ? msg(
                "news_granted_silent",
                "Granted, but none of the $1 newsrooms answered. Reloading this tab usually fixes it.",
                total,
              )
            : msg("news_reading_all", "Reading $1 newsrooms directly.", total),
        ),
        React.createElement(
          NewsAccessOff,
          { onClick: this.handleDrop },
          msg("news_turn_off", "Turn off"),
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
          msg("news_reading_some", "Reading $1 of $2 newsrooms.", held, total),
        ),
        React.createElement(
          NewsAccessBtn,
          { onClick: this.handleAsk, disabled: asking },
          asking
            ? msg("news_asking", "Asking Chrome…")
            : msg("news_allow_rest", "Allow the rest"),
        ),
        React.createElement(
          NewsAccessOff,
          { onClick: this.handleDrop },
          msg("news_turn_off", "Turn off"),
        ),
      );
    }

    return React.createElement(
      NewsAccessCard,
      null,
      React.createElement(
        NewsAccessTitle,
        null,
        msg("news_one_click", "$1 newsrooms are one click away", total),
      ),
      React.createElement(
        NewsAccessBody,
        null,
        msg(
          "news_ask_body_1",
          "Cointelegraph, Decrypt, CryptoSlate, Bitcoin Magazine, CoinJournal and BBC Business publish feeds that a browser will not let a page read without your say-so. Chrome will ask you to allow it.",
        ),
      ),
      React.createElement(
        NewsAccessBody,
        null,
        msg(
          "news_ask_body_2",
          "Nothing is sent to them and nothing is stored anywhere but this device — PriceTab only reads what they publish. You can turn it off here again at any time.",
        ),
      ),
      React.createElement(
        NewsAccessBtn,
        { onClick: this.handleAsk, disabled: asking },
        asking
          ? msg("news_asking", "Asking Chrome…")
          : msg("news_turn_on", "Turn on full sources"),
      ),
    );
  }

  /* Which of *your* coins a headline is about.
   *
   * Not all 81 — a chip for a coin nobody follows is noise, and the question
   * this answers is "why is this row in my filtered list". `newsMentionsCoin`
   * is the same predicate the scope filter and the move card use, so a chip
   * cannot disagree with the filter that let the row through. The symbol
   * regexes are built once per render rather than once per row × coin.
   */
  coinMatcher() {
    const held = (this.props.portfolio || [])
      .map((h) => h && h.coin)
      .filter(Boolean);
    const wanted = [];
    for (const coin of [...(this.props.coinOptions || []), ...held]) {
      if (coin && !wanted.includes(coin)) wanted.push(coin);
    }
    return wanted.map((coin) => ({
      coin,
      re: new RegExp(`\\b${coin}\\b`),
      name: coinNameLower(coin),
    }));
  }

  render() {
    const { scope, onScopeChange, loading } = this.props;
    const newest = this.sourceState();
    const rows = this.rows();
    /* Where "new since you last looked" goes: immediately above the first row
     * that is not new. The list is sorted newest-first, so that is a single
     * index rather than a test on every row.
     *
     * It is deliberately **not drawn at either end**. At index 0 everything is
     * new and the line would have nothing above it to divide from; past the
     * last row nothing is new and it would be a rule under the whole list
     * announcing that. A first visit has no stamp at all (`readFrom` is 0) and
     * so gets no line, which is right: on a first visit nothing has been seen,
     * and "new since you last looked" is a claim about a look that never
     * happened. A clustered row counts as new if its **head** is — the head is
     * the newest member, so a fold cannot push a story across the line. */
    const readFrom = Number(this.props.readFrom) || 0;
    let dividerAt = -1;
    if (readFrom) {
      const first = rows.findIndex((r) => !(r.time > readFrom));
      if (first > 0) dividerAt = first;
    }
    const matchers = this.coinMatcher();
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
        { role: "dialog", "aria-label": msg("chrome_news", "News") },
        React.createElement(
          NewsHead,
          null,
          React.createElement(NewsTitle, null, msg("chrome_news", "News")),
          React.createElement(
            NewsCount,
            null,
            rows.length === 1
              ? msg("news_one_story", "1 story")
              : msg("news_n_stories", "$1 stories", rows.length),
          ),
          React.createElement(
            NewsClose,
            {
              onClick: this.props.onClose,
              "aria-label": msg("chrome_news_close", "Close news"),
            },
            "×",
          ),
        ),

        React.createElement(
          NewsControls,
          null,
          React.createElement(NewsSearch, {
            type: "text",
            value: this.state.query,
            placeholder: msg("news_search_placeholder", "Search headlines…"),
            "aria-label": msg("news_search_label", "Search headlines"),
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
        this.renderUnusual(),

        React.createElement(
          NewsList,
          null,
          rows.length
            ? rows.map((item, i) => {
                /* Three at most. A story that names six coins is a market
                 * round-up, and six chips under one headline is a row nobody
                 * reads — the list stops being scannable, which is what it is
                 * for. */
                const coins = matchers
                  .filter((m) => newsMentionsCoin(item, m.coin, m.re, m.name))
                  .slice(0, 3)
                  .map((m) => m.coin);
                const also = Array.isArray(item.also) ? item.also : [];
                const key = `n-${i}-${item.title.slice(0, 24)}`;
                /* The line between what arrived since you last looked and what
                 * was already here. Drawn once, immediately above the first row
                 * that is not new — so it needs no count and cannot disagree
                 * with one. Never at the very top (everything is new: there is
                 * nothing above it to divide from) and never at the very
                 * bottom (nothing is new, so it would be a line under the whole
                 * list saying so). Both of those are handled by `dividerAt`,
                 * computed once for the list rather than tested per row. */
                const divider =
                  i === dividerAt
                    ? React.createElement(
                        NewsDivider,
                        { key: "divider" },
                        React.createElement(
                          NewsDividerText,
                          null,
                          msg("news_since_last", "New since you last looked"),
                        ),
                      )
                    : null;
                const row = React.createElement(
                  NewsRow,
                  {
                    key,
                    href: item.url || undefined,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    /* The exact moment, because the row shows a relative age.
                     * "4h" is the right thing to scan a list by and the wrong
                     * thing to work out whether two stories are about the same
                     * hour. */
                    title: item.url
                      ? `Read on ${item.source}${newsExactTime(item.time)} — opens in a new tab`
                      : item.title,
                  },
                  React.createElement(NewsRowAge, null, newsAge(item.time)),
                  React.createElement(NewsRowSource, null, item.source),
                  React.createElement(
                    NewsRowBody,
                    null,
                    React.createElement(
                      NewsRowTitle,
                      // A stable hook, the way the chart names its own nodes
                      // (`pt-live-dot`, `pt-moves`). The headline used to be
                      // the row's last child and a test addressed it that
                      // way; wrapping it in a body made that silently measure
                      // the wrapper instead — default link blue, no
                      // underline, and two checks failing for the wrong
                      // reason. Position is not an identity.
                      { className: "pt-news-title" },
                      item.title,
                    ),
                    item.summary
                      ? React.createElement(NewsRowSummary, null, item.summary)
                      : null,
                    coins.length
                      ? React.createElement(
                          NewsRowCoins,
                          null,
                          coins.map((c) =>
                            React.createElement(NewsRowCoin, { key: c }, c),
                          ),
                        )
                      : null,
                  ),
                );
                if (!also.length) {
                  return divider ? [divider, row] : row;
                }
                /* Names, then a count. Four is where a line of newsroom names
                 * stops being scannable — the same limit and the same reason
                 * as the three coin chips above. The rest are counted rather
                 * than dropped: the row would otherwise say four outlets ran
                 * it while showing three, which is the kind of quiet
                 * disagreement this panel exists to not have. */
                const named = also.slice(0, NEWS_ALSO_NAMED);
                const rest = also.length - named.length;
                const cluster = React.createElement(
                  NewsCluster,
                  { key },
                  row,
                  React.createElement(
                    NewsAlso,
                    null,
                    React.createElement(
                      NewsAlsoLine,
                      null,
                      React.createElement(
                        NewsAlsoCount,
                        {
                          /* The count is the fact, so it is what the label
                           * says; the names beside it are how you get there. */
                          title: msg(
                            "news_also_title",
                            "$1 newsrooms ran this story",
                            String(also.length + 1),
                          ),
                        },
                        msg("news_also_count", "+$1 more", String(also.length)),
                      ),
                      ...named.map((other, j) =>
                        React.createElement(
                          NewsAlsoLink,
                          {
                            key: `a-${j}-${other.source}`,
                            href: other.url || undefined,
                            target: "_blank",
                            rel: "noopener noreferrer",
                            /* The other newsroom's own headline, because the
                             * two write-ups are not the same words and picking
                             * one to stand for both should not hide what the
                             * other actually said. */
                            title: other.title,
                          },
                          other.source,
                        ),
                      ),
                      rest > 0
                        ? React.createElement(
                            NewsAlsoRest,
                            null,
                            msg("news_also_rest", "and $1 more", String(rest)),
                          )
                        : null,
                    ),
                  ),
                );
                return divider ? [divider, cluster] : cluster;
              })
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
            msg(
              "news_stale_note",
              "A source with an age beside its name has published nothing since then. That is the feed being quiet, not PriceTab failing to ask.",
            ),
          ),
        this.renderAccess(),
      ),
    );
  }
}
