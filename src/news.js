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

/* `hasPermissionsApi` and `readGranted` are in `src/notify.js`, which loads
 * first: this panel and the alarm switches ask Chrome the same two questions,
 * and two copies of "is there a permissions API" is two places for the answer
 * to drift. The reasoning behind reading `lastError` before the answer is
 * kept with them.
 */

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

/* One newsroom at a time, for Settings → Permissions. Chrome lets a request
 * name a subset of the optional origins and a removal name one, so each
 * origin can be its own switch there; the panel's own button still asks for
 * all six, which is what somebody pressing "Turn on full sources" means. Both
 * must run straight out of the click, like the all-six versions. */
const requestNewsOrigin = (id) =>
  new Promise((resolve) => {
    const origin = NEWS_SOURCE_ORIGINS[id];
    if (!origin || !hasPermissionsApi() || typeof chrome.permissions.request !== "function") {
      return resolve(false);
    }
    try {
      chrome.permissions.request({ origins: [origin] }, (granted) => resolve(readGranted(granted)));
    } catch (error) {
      resolve(false);
    }
  });

const dropNewsOrigin = (id) =>
  new Promise((resolve) => {
    const origin = NEWS_SOURCE_ORIGINS[id];
    if (!origin || !hasPermissionsApi() || typeof chrome.permissions.remove !== "function") {
      return resolve(false);
    }
    try {
      chrome.permissions.remove({ origins: [origin] }, (done) => resolve(readGranted(done)));
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
  /* The words themselves live in `spanText` (`utils.js`): the move card says
     what a price did "over the next 6h" from the same vocabulary, and two
     formatters would round differently the first time either was touched. */
  return spanText(Date.now() - ms);
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
/* How far back "Most covered" ranks by coverage; older stories follow,
   newest first. Three days: the 36-hour window a fold may span, and its
   day either side. */
const NEWS_COVERED_WINDOW_MS = 3 * 86400000;
/* How many newsrooms ran a (folded) story — distinct sources, the head's own
   included. */
const newsroomsOf = (row) =>
  new Set([row.source, ...(Array.isArray(row.also) ? row.also.map((a) => a.source) : [])]).size;

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
    this.state = {
      query: "",
      granted: [],
      asking: false,
      /* Which wording the list is narrowed to: "any", "up" or "down". */
      tone: "any",
      /* Whether the one-time ask has been put away — see NEWS_ASK_SEEN_KEY. */
      askSeen: loadNewsAskSeen(),
      /* The kept headlines in place of the feed — see NEWS_SAVED_KEY. Not
         stored: the panel opens on the feed, which is what it is for. */
      savedOnly: false,
      /* "newest", or "covered": the stories more newsrooms ran first. Not
         stored — the panel opens on the newest, which is what a feed is. */
      order: "newest",
    };
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
    const { coin, prices, items } = this.props;
    if (!coin || !Array.isArray(prices) || !Array.isArray(items)) {
      return null;
    }
    /* Every unusual moment, not the biggest few. `findUnusualMoves` caps by
     * **size** and then re-sorts into time order, so asking for one hands back
     * the largest move in the window — and the last element of that list is
     * therefore the largest, not the latest. With a cap this generous the list
     * is every step past the threshold, so its last element is the most recent
     * one, which is the question being asked. It costs nothing: the pass over
     * the series happens either way, and only the slice changes. */
    const moves = findUnusualMoves(prices, { max: 200 });
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

  /* **How rare, counted** (29 Sep 2026). On an hour's chart an unusual step
   * can be a few hundredths of a per cent, and "−0.06%" alone reads as noise.
   * What makes it unusual is the chart's own steps, so that is what is
   * printed: one step of this length, and how many of the chart's steps
   * moved as far or further — a count with its denominator, like every
   * other reading in the app. Nothing when the series is too short to say. */
  renderRarity(move) {
    const prices = Array.isArray(this.props.prices) ? this.props.prices : [];
    const share = moveRarity(prices, move);
    const steps = prices.length - 1;
    if (share == null || !(steps > 0)) return null;
    const count = Math.max(1, Math.round(share * steps));
    const span = move.time - move.startTime;
    const stepText = span < 90000 ? `${Math.max(1, Math.round(span / 1000))}s` : spanText(span);
    return React.createElement(
      NewsUnusualRare,
      { "data-news-unusual-rare": `${count}/${steps}` },
      msg(
        "news_unusual_rare",
        "One $1 step — $2 of the $3 steps on the chart in view moved this far or further.",
        stepText,
        localeNumber(count),
        localeNumber(steps),
      ),
    );
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
          /* Two places under a tenth: on a short range an unusual step
             can be a few hundredths, and one place printed it as 0.0. */
          `${signedFixed(move.pct, Math.abs(move.pct) < 0.1 ? 2 : 1)}%`,
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
      this.renderRarity(move),
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
      /* **The way back to the chart.**
       *
       * This section and the chart's own marks are the same measurement —
       * `findUnusualMoves`, on the same series — and until now neither
       * mentioned the other: you could read "XRP moved unusually 40m ago"
       * here and have no idea the moment was drawn on the chart behind the
       * panel, with an archive lookup attached to it. One press closes the
       * panel and puts the marks on, whether or not they were on before,
       * because the thing being offered is the mark and an offer that leads
       * to a chart without one is worse than no offer.
       */
      typeof this.props.onShowMoves === "function"
        ? React.createElement(
            NewsUnusualGo,
            {
              onClick: () => this.props.onShowMoves(),
              title: msg(
                "news_unusual_go_title",
                "Close this and mark the unusual moments on the chart",
              ),
            },
            msg("news_unusual_go", "Mark it on the chart"),
          )
        : null,
    );
  }

  /* Everything the list is narrowed by, applied in one place so the count in
   * the head and the rows below it can never disagree. */
  rows() {
    const { items, enabled, scope, coinOptions, portfolio } = this.props;
    const query = this.state.query.trim().toLowerCase();
    /* **What was kept, newest kept first** — whatever the scope or the
       sources say, because a headline somebody chose to keep is not one a
       filter set later should hide. The search still narrows it; nothing is
       folded, since each was kept on its own. */
    if (this.state.savedOnly) {
      const kept = (Array.isArray(this.props.saved) ? this.props.saved : [])
        .slice()
        .sort((a, b) => b.savedAt - a.savedAt)
        .filter(
          (i) =>
            !query ||
            `${i.title} ${i.summary || ""} ${i.source || ""}`.toLowerCase().includes(query),
        )
        .map((i) => Object.assign({}, i));
      for (const row of kept) row.toneRead = newsTone(row);
      return kept;
    }
    let list = Array.isArray(items) ? items : [];
    list = list.filter((i) => enabled[i.source] !== false);
    if (scope === "coins") list = newsForCoins(list, coinOptions);
    if (scope === "portfolio") {
      list = newsForCoins(list, (portfolio || []).map((h) => h.coin));
    }
    /* **The search matches what the row shows.**
     *
     * It read the title alone, and the row has carried the feed's own summary
     * under the headline since 23 Aug 2026 — so a word plainly visible on
     * screen could be typed into the box and find nothing, which reads as a
     * broken search rather than as a narrow one. The summary is already in
     * memory and already on the row; matching it costs a second `includes`.
     * The source name is in too, so "cnbc" narrows the list the way the chips
     * do — the same word, in the place people try first. */
    if (query) {
      list = list.filter((i) =>
        `${i.title} ${i.summary || ""} ${i.source || ""}`.toLowerCase().includes(query),
      );
    }
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
    /* An exchange's notices are each their own event, written from one
       template ("Bybit to Support … Network Upgrade"), so the fold would take
       three coins' upgrades for one story. They join the list unfolded. */
    const solo = new Set(NEWS_SOURCES.filter((src) => src.kind === "bybit").map((src) => src.name));
    const rows = [
      ...clusterNewsItems(list.filter((i) => !solo.has(i.source))),
      ...list.filter((i) => solo.has(i.source)).map((i) => Object.assign({}, i)),
    ].sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));
    /* The tone mark is computed once per row here rather than in the render,
       and the tally the head and the aside print is over these rows — the
       ones on screen before the tone filter, so "7 worded up" counts what a
       press on "worded up" would leave. */
    for (const row of rows) row.toneRead = newsTone(row);
    return rows;
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
    if (this.state.savedOnly && !this.state.query) {
      return msg(
        "news_saved_none",
        "Nothing saved yet. The bookmark at the end of a headline saves it here, until you remove it.",
      );
    }
    if (loading) return msg("news_fetching", "Fetching headlines…");
    if (this.state.query) {
      return msg("news_no_match", "Nothing matching “$1”.", this.state.query);
    }
    if (this.state.tone !== "any") {
      return msg("news_none_tone", "Nothing worded that way on screen right now.");
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

  /* **Every source that was asked, not only every source that answered.**
   *
   * The chips were built from the names present in `items`, so a feed that
   * answered perfectly well and simply had nothing on this beat **vanished**
   * from the panel — measured 10 Sep 2026: Yahoo Finance returned 50 stories
   * and 0 crypto ones, MarketWatch 10 and 0, so on that day two of the four
   * always-on sources were not on screen at all. This panel exists because a
   * dead feed must not look like a live one; a live feed must not look like a
   * missing one either, and the reader cannot switch on a chip that is not
   * drawn.
   *
   * Built from `NEWS_SOURCES` filtered by what Chrome has actually granted,
   * which is the same rule `fetchNewsData` uses to decide what to ask. */
  askedSources() {
    const granted = Array.isArray(this.state.granted) ? this.state.granted : [];
    const asked = NEWS_SOURCES.filter(
      (src) => !src.optional || granted.includes(src.id),
    ).map((src) => src.name);
    const seen = (Array.isArray(this.props.items) ? this.props.items : []).map(
      (i) => i.source,
    );
    /* An aggregator answers in the names of the outlets it carries, so a
       source can be on screen under a name that is in no list — those stay. */
    return [...new Set([...asked, ...seen])].sort();
  }

  /* What one source's state is, for its chip and for its line in the column
     beside the feed — one reading, so the two cannot disagree. */
  sourceFacts(name, newest, cooldowns) {
    const { enabled } = this.props;
    /* Which of them are `cryptoOnly` — a feed the panel narrows itself. Its
       silence is a different fact from a newsroom's silence, and saying the
       wrong one of the two is exactly the mistake this panel was built to
       stop. */
    const onBeat = NEWS_SOURCES.some((src) => src.cryptoOnly && src.name === name);
    const carried = (Array.isArray(this.props.items) ? this.props.items : []).some((i) => i.source === name);
    const quiet =
      newest[name] && Date.now() - newest[name] > NEWS_STALE_MS
        ? newsAge(newest[name])
        : "";
    /* Nothing at all from this source in the list: it answered and had
       nothing to give, which for a filtered feed is the ordinary case and
       for a newsroom is the thing worth knowing. */
    const silent = !carried;
    /* A host that answered 429 or 403 is being left alone for a while —
       see hostCooling in api.js — and the chip says that rather than
       "none", which would blame the newsroom for our own restraint. */
    const src = NEWS_SOURCES.find((s) => s.name === name);
    const cooling = src && src.url ? cooldowns[hostOf(src.url)] : 0;
    /* An opt-in source that is off has not been asked, so it has no
       silence or age to report — only what it would bring. */
    const dormant = Boolean(src && src.optIn && enabled[name] === false);
    const title = dormant
      ? msg(
          "news_chip_optin",
          "$1 — off until you switch it on: an exchange's delisting and network-upgrade notices, nothing promotional",
          name,
        )
      : cooling
      ? msg("news_chip_cooling", "$1 — asked us to slow down; trying again $2", name, describeAhead(cooling))
      : silent
      ? onBeat
        ? msg(
            "news_chip_off_beat",
            "$1 — publishing, but nothing about crypto in this batch",
            name,
          )
        : msg("news_chip_silent", "$1 — nothing came back this time", name)
      : quiet
        ? onBeat
          ? msg("news_chip_quiet_beat", "$1 — nothing on this beat for $2", name, quiet)
          : msg("news_chip_quiet", "$1 — nothing new for $2", name, quiet)
        : msg("news_chip_toggle", "Show or hide $1", name);
    return { src, quiet, silent, cooling, dormant, title };
  }

  renderSourceChips(newest) {
    const { enabled, onToggleSource } = this.props;
    const names = this.askedSources();
    if (!names.length) return null;
    const cooldowns = hostCooldownsNow();
    return React.createElement(
      NewsChips,
      null,
      ...names.map((name) => {
        const { src, quiet, silent, cooling, dormant, title } = this.sourceFacts(name, newest, cooldowns);
        return React.createElement(
          NewsChip,
          {
            key: name,
            active: enabled[name] !== false,
            onClick: () => onToggleSource(name),
            "data-news-chip": src ? src.id : name,
            title,
            "aria-pressed": enabled[name] !== false,
          },
          name,
          /* A source that has gone quiet says so on its own chip. The whole
           * feature exists because a dead feed used to look exactly like a
           * live one. A source carrying nothing at all says that instead — an
           * age would be a lie, since there is no dated item to age. */
          dormant
            ? null
            : cooling
            ? React.createElement(NewsChipAge, null, msg("news_chip_paused", "paused"))
            : silent
              ? React.createElement(NewsChipAge, null, msg("news_chip_none", "none"))
              : quiet && React.createElement(NewsChipAge, null, quiet),
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

    /* On the phone app there is no optional host permission to ask for —
       that is a Chrome thing — so a button that asks would only ever be
       refused. Say what is read instead, and stop there. */
    if (window.PriceTabPlatform === "ios") {
      return React.createElement(
        NewsAccessCard,
        null,
        React.createElement(
          NewsAccessBody,
          null,
          msg(
            "news_ask_ios",
            "$1 more newsrooms publish feeds a page can only read with a browser permission Chrome has and iOS does not. The open sources above are what this app reads.",
            total,
          ),
        ),
      );
    }

    /* Asked once. After "Not now" the card is gone for good and this one
       quiet line remains, pointing at the place every permission lives with
       its reasons — Settings → Permissions. A person who has said no should
       not meet the same card on every open. */
    if (this.state.askSeen) {
      return React.createElement(
        NewsAccessRow,
        null,
        React.createElement(
          NewsAccessNote,
          null,
          msg("news_more_in_settings", "$1 more newsrooms need a permission you have not granted.", total),
        ),
        this.props.onOpenPermissions &&
          React.createElement(
            NewsAccessLink,
            { onClick: this.props.onOpenPermissions },
            msg("news_open_permissions", "Settings → Permissions"),
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
      /* The newsrooms are named from NEWS_SOURCES, joined the reader's
         language's way. The sentence typed six names into itself and kept
         saying six after CoinDesk and The Block made it eight, under a title
         that counted eight. */
      React.createElement(
        NewsAccessBody,
        null,
        msg(
          "news_ask_body_names",
          "$1 publish feeds that a browser will not let a page read without your say-so. Chrome will ask you to allow it.",
          intlFormatter("list", { style: "long", type: "conjunction" }).format(
            NEWS_SOURCES.filter((s) => s.optional).map((s) => s.name),
          ),
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
        NewsAccessRow,
        { style: { padding: "0.6rem 0 0", borderTop: "none" } },
        React.createElement(
          NewsAccessBtn,
          { onClick: this.handleAsk, disabled: asking },
          asking
            ? msg("news_asking", "Asking Chrome…")
            : msg("news_turn_on", "Turn on full sources"),
        ),
        React.createElement(
          NewsAccessOff,
          {
            onClick: () => {
              saveNewsAskSeen();
              this.setState({ askSeen: true });
            },
            title: msg("news_not_now_hint", "Put this away. You can grant it later in Settings → Permissions"),
          },
          msg("news_not_now", "Not now"),
        ),
      ),
    );
  }

  /* What the feed adds up to, in the column beside it. Counts with what they
   * are counts of, and nothing that judges: the tone tiles are words, the
   * coin chips are mentions, the source table is ages. */
  renderAside(all, matchers, newest) {
    const tally = { up: 0, down: 0, flat: 0 };
    for (const row of all) {
      const t = row.toneRead ? row.toneRead.tone : null;
      if (t === "up") tally.up += 1;
      else if (t === "down") tally.down += 1;
      else tally.flat += 1;
    }
    const perCoin = matchers
      .map((m) => ({
        coin: m.coin,
        n: all.filter((row) => newsMentionsCoin(row, m.coin, m.re, m.name)).length,
      }))
      .filter((c) => c.n > 0)
      .sort((a, b) => b.n - a.n);
    const names = this.askedSources();
    /* The sources are about the feed, whichever list is on screen: in the
       saved view the rows are what was kept, and reading "carried" off them
       marked every newsroom not in it as having nothing. */
    const carried = new Set(
      (this.state.savedOnly ? (Array.isArray(this.props.items) ? this.props.items : []) : all).map(
        (row) => row.source,
      ),
    );
    const cooldowns = hostCooldownsNow();
    const { enabled } = this.props;
    const fact = (value, label) =>
      React.createElement(
        NewsFact,
        { key: label },
        React.createElement(NewsFactValue, null, value),
        React.createElement(NewsFactLabel, null, label),
      );
    return React.createElement(
      NewsAside,
      { "data-news-aside": "true" },
      React.createElement(
        NewsAsideSection,
        null,
        React.createElement(NewsAsideLabel, null, msg("news_tone_head", "Wording · $1 stories", all.length)),
        React.createElement(
          NewsFacts,
          null,
          fact(tally.up, msg("news_tone_up", "worded up")),
          fact(tally.down, msg("news_tone_down", "worded down")),
          fact(tally.flat, msg("news_tone_flat", "neither")),
        ),
        React.createElement(
          NewsAsideNote,
          null,
          msg(
            "news_tone_note",
            "Counted from the words in each headline and summary — surges and approvals on one side, hacks and lawsuits on the other — with a word flipped by a “not” before it. It is what the story is worded like, never what happened or what a price will do.",
          ),
        ),
      ),
      perCoin.length > 0 &&
        React.createElement(
          NewsAsideSection,
          null,
          React.createElement(NewsAsideLabel, null, msg("news_your_coins", "Your coins in the news")),
          React.createElement(
            NewsCoinRow,
            null,
            ...perCoin.map((c) =>
              React.createElement(
                NewsCoinBtn,
                {
                  key: c.coin,
                  active: this.state.query.trim().toUpperCase() === c.coin,
                  title: msg("news_coin_narrow", "Narrow the list to stories naming $1", c.coin),
                  onClick: () =>
                    this.setState((p) => ({
                      query: p.query.trim().toUpperCase() === c.coin ? "" : c.coin,
                    })),
                },
                c.coin,
                React.createElement(NewsCoinCount, null, c.n),
              ),
            ),
          ),
        ),
      React.createElement(
        NewsAsideSection,
        null,
        React.createElement(NewsAsideLabel, null, msg("news_sources_head", "Sources · $1 asked", names.length)),
        ...names.map((name) => {
          const src = NEWS_SOURCES.find((s) => s.name === name);
          const cooling = src && src.url ? cooldowns[hostOf(src.url)] : 0;
          const last = newest[name];
          const quiet = last && Date.now() - last > NEWS_STALE_MS;
          const state = src && src.optIn && enabled[name] === false
            ? msg("news_src_off", "off")
            : cooling
            ? msg("news_src_paused", "paused $1", describeAhead(cooling))
            : !carried.has(name)
              ? msg("news_chip_none", "none")
              : last
                ? newsAge(last)
                : "";
          /* **The line is the switch** (30 Sep 2026): from 1100px the chips
             over the list stand down — they were this list a second time —
             so a press here shows or hides the source, with the chip's own
             explanation as its tooltip. */
          const off = enabled[name] === false;
          return React.createElement(
            NewsSourceRow,
            {
              key: name,
              off,
              "aria-pressed": off ? "false" : "true",
              "data-news-source": src ? src.id : name,
              title: this.sourceFacts(name, newest, cooldowns).title,
              onClick: () => this.props.onToggleSource(name),
            },
            React.createElement(NewsSourceDot, { off, "aria-hidden": "true" }),
            React.createElement(NewsSourceName, { off }, name),
            React.createElement(NewsSourceState, { warn: Boolean(quiet || cooling) }, state),
          );
        }),
        React.createElement(
          NewsAsideNote,
          null,
          msg(
            "news_sources_note",
            "Read from your own browser, with your own address — there is no server in between. A host that asks us to slow down is left alone for a while and says so here.",
          ),
        ),
      ),
      this.renderAccess(),
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
    const all = this.rows();
    const toned =
      this.state.tone === "any"
        ? all
        : all.filter((r) => r.toneRead && r.toneRead.tone === this.state.tone);
    /* **Most covered** (29 Sep 2026): the stories the most newsrooms ran,
     * first — the one ranking a feed of twelve sources can make without an
     * opinion, since it is a count of who wrote it up. Ties keep the newest
     * first. The fold already knows the count (`also`), so it costs a sort. */
    const covered = this.state.order === "covered" && !this.state.savedOnly;
    /* Counted in **newsrooms**, not write-ups: CNBC's crypto section runs an
       article and two videos of one story, and three of CNBC is one newsroom
       covering it. And only over the last three days — ranked over the whole
       feed, a fortnight-old story every desk ran sat above today's news. */
    const recentFrom = Date.now() - NEWS_COVERED_WINDOW_MS;
    const weight = (r) => ((Number(r.time) || 0) >= recentFrom ? newsroomsOf(r) : 0);
    const rows = covered
      ? toned
          .slice()
          .sort((a, b) => weight(b) - weight(a) || (Number(b.time) || 0) - (Number(a.time) || 0))
      : toned;
    /* **A heading per day** in the newest-first list, so "4h" and "31h" stop
     * being the only way to tell today from yesterday. Not in the saved view
     * (its order is when things were kept) nor in the covered one (its order
     * is not time at all). "Today" and "Yesterday" come from Intl's own
     * relative words, so every language has them without a string of ours. */
    const byDay = !covered && !this.state.savedOnly;
    const dayOf = (t) => {
      const n = Number(t);
      if (!(n > 0)) return "none";
      const d = new Date(n);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    const dayLabel = (t) => {
      const n = Number(t);
      if (!(n > 0)) return msg("news_day_undated", "No date");
      const day = new Date(n);
      day.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = Math.round((day - today) / 86400000);
      if (diff === 0 || diff === -1) {
        return intlFormatter("relative", { numeric: "auto" }).format(diff, "day");
      }
      return localeDate(n, { weekday: "long", day: "numeric", month: "long" });
    };
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
    // How many stories each day's heading stands over
    const dayCount = {};
    if (byDay) for (const r of rows) dayCount[dayOf(r.time)] = (dayCount[dayOf(r.time)] || 0) + 1;
    const readFrom = Number(this.props.readFrom) || 0;
    let dividerAt = -1;
    // Kept headlines are in the order they were kept, not by when they ran
    if (readFrom && !this.state.savedOnly && !covered) {
      const first = rows.findIndex((r) => !(r.time > readFrom));
      if (first > 0) dividerAt = first;
    }
    const matchers = this.coinMatcher();
    const toneWord = (t) =>
      t === "up"
        ? msg("news_tone_up", "worded up")
        : t === "down"
          ? msg("news_tone_down", "worded down")
          : msg("news_tone_mixed", "mixed wording");
    const anyQuiet = Object.keys(newest).some(
      (name) => Date.now() - newest[name] > NEWS_STALE_MS,
    );
    /* A chip can now carry two different words, so the foot has to explain
       both or the second one is a mystery: an **age** means the outlet has
       printed nothing since then, and **none** means it answered this time
       and carried nothing the panel could use — which for the three general
       finance desks is an ordinary afternoon. */
    const offOptIn = (name) => NEWS_SOURCES.some((s) => s.optIn && s.name === name) && (this.props.enabled || {})[name] === false;
    const anyNone = this.askedSources().some(
      (name) => !offOptIn(name) && !Object.prototype.hasOwnProperty.call(newest, name),
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
          React.createElement(NewsTitle, null, msg("chrome_news", "News"), keyCap("N")),
          React.createElement(
            NewsCount,
            null,
            rows.length === 1
              ? msg("news_one_story", "1 story")
              : msg("news_n_stories", "$1 stories", rows.length),
          ),
        ),

        React.createElement(
          NewsControls,
          { "data-news-controls": "true" },
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
            { "data-news-tray": "scope" },
            ...NEWS_FILTER_OPTIONS.map((option) =>
              React.createElement(
                NewsScopeBtn,
                {
                  key: option.value,
                  active: !this.state.savedOnly && scope === option.value,
                  onClick: () => {
                    this.setState({ savedOnly: false });
                    onScopeChange(option.value);
                  },
                  "aria-pressed": !this.state.savedOnly && scope === option.value,
                },
                option.label,
              ),
            ),
          ),
          /* The saved view in a tray of its own: it is not a fourth scope —
             it ignores the scope and the sources, on purpose (ref/news.md). */
          typeof this.props.onToggleSaved === "function"
            ? React.createElement(
                NewsScopeRow,
                { "data-news-tray": "saved" },
                React.createElement(
                  NewsScopeBtn,
                  {
                    key: "saved",
                    active: this.state.savedOnly,
                    "aria-pressed": this.state.savedOnly,
                    "data-news-saved-view": this.state.savedOnly ? "on" : "off",
                    onClick: () => this.setState((p) => ({ savedOnly: !p.savedOnly })),
                  },
                  icon(this.state.savedOnly ? "bookmarkOn" : "bookmark", 0.8, 2),
                  msg(
                    "news_saved_chip",
                    "Saved · $1",
                    String((Array.isArray(this.props.saved) ? this.props.saved : []).length),
                  ),
                ),
              )
            : null,
          // Where the row has room, what follows sits at its right end
          React.createElement(NewsSavedSplit, { "aria-hidden": "true" }),
          /* The wording filter: the same rule as the scope — narrowing at
             render, never at fetch. */
          React.createElement(
            NewsScopeRow,
            { wide: true, "data-news-tray": "tone", role: "group", "aria-label": msg("news_tone_filter", "Narrow by wording") },
            ...[
              ["any", msg("news_tone_any", "Any wording")],
              ["up", msg("news_tone_up", "worded up")],
              ["down", msg("news_tone_down", "worded down")],
            ].map(([value, label]) =>
              React.createElement(
                NewsScopeBtn,
                {
                  key: value,
                  active: this.state.tone === value,
                  onClick: () => this.setState({ tone: value }),
                  "aria-pressed": this.state.tone === value,
                  "data-news-tone": value,
                },
                label,
              ),
            ),
          ),
          /* In the saved view the order is when each was kept, so the tray
             has nothing to choose — but it keeps its place, or pressing
             Saved would move every control on the row. */
          React.createElement(
                NewsScopeRow,
                { wide: true, idle: this.state.savedOnly, "aria-hidden": this.state.savedOnly ? "true" : undefined, "data-news-tray": "order" },
                ...[
                  ["newest", msg("news_order_newest", "Newest"), msg("news_order_newest_title", "Newest first, a heading for each day")],
                  ["covered", msg("news_order_covered", "Most covered"), msg("news_order_covered_title", "The stories the most newsrooms ran in the last three days, first")],
                ].map(([value, label, title]) =>
                  React.createElement(
                    NewsScopeBtn,
                    {
                      key: `order-${value}`,
                      active: this.state.order === value,
                      onClick: () => this.setState({ order: value }),
                      "aria-pressed": this.state.order === value,
                      "data-news-order": value,
                      title,
                    },
                    label,
                  ),
                ),
              ),
          /* On a phone, the wording and the order as two selects. */
          React.createElement(
            NewsSelectRow,
            { "data-news-selects": "true" },
            React.createElement(
              NewsSelect,
              {
                value: this.state.tone,
                "aria-label": msg("news_tone_filter", "Narrow by wording"),
                onChange: (e) => this.setState({ tone: e.target.value }),
              },
              React.createElement("option", { value: "any" }, msg("news_tone_any", "Any wording")),
              React.createElement("option", { value: "up" }, msg("news_tone_up", "worded up")),
              React.createElement("option", { value: "down" }, msg("news_tone_down", "worded down")),
            ),
            React.createElement(
                  NewsSelect,
                  {
                    idle: this.state.savedOnly,
                    "aria-hidden": this.state.savedOnly ? "true" : undefined,
                    value: this.state.order,
                    "aria-label": msg("news_order_label", "Order of the list"),
                    onChange: (e) => this.setState({ order: e.target.value }),
                  },
                  React.createElement("option", { value: "newest" }, msg("news_order_newest", "Newest")),
                  React.createElement("option", { value: "covered" }, msg("news_order_covered", "Most covered")),
                ),
          ),
        ),
        this.renderSourceChips(newest),
        this.renderUnusual(),

        React.createElement(
          NewsBody,
          null,
          React.createElement(
            NewsMain,
            null,
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
                /* The day's heading, above the first row of each day. */
                const dayHead =
                  byDay && (i === 0 || dayOf(rows[i - 1].time) !== dayOf(item.time))
                    ? React.createElement(
                        NewsDay,
                        { key: `day-${dayOf(item.time)}` },
                        React.createElement("span", { "data-news-day": dayOf(item.time) }, dayLabel(item.time)),
                        React.createElement(
                          NewsDayCount,
                          null,
                          dayCount[dayOf(item.time)] === 1
                            ? msg("news_one_story", "1 story")
                            : msg("news_n_stories", "$1 stories", dayCount[dayOf(item.time)]),
                        ),
                      )
                    : null;
                /* A discussion board's row has no summary, and the one thing
                   it can say instead is how big the discussion was. */
                const points =
                  item.source === "Hacker News" && Number(item.points) > 0 ? Number(item.points) : 0;
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
                  React.createElement(
                    NewsRowLead,
                    null,
                    React.createElement(NewsRowAge, null, newsAge(item.time)),
                    React.createElement(NewsRowSource, null, item.source),
                  ),
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
                    coins.length || points || (item.toneRead && item.toneRead.tone)
                      ? React.createElement(
                          NewsRowCoins,
                          null,
                          points
                            ? React.createElement(
                                NewsRowMeta,
                                { key: "points", "data-news-points": String(points) },
                                msg("news_hn_points", "$1 points", localeNumber(points)),
                              )
                            : null,
                          coins.map((c) =>
                            React.createElement(NewsRowCoin, { key: c }, c),
                          ),
                          item.toneRead && item.toneRead.tone
                            ? React.createElement(
                                NewsRowTone,
                                {
                                  key: "tone",
                                  "data-news-row-tone": item.toneRead.tone,
                                  title: msg(
                                    "news_tone_words",
                                    "Words counted — up: $1 · down: $2",
                                    item.toneRead.up.join(", ") || "—",
                                    item.toneRead.down.join(", ") || "—",
                                  ),
                                },
                                React.createElement(
                                  "span",
                                  { "aria-hidden": "true" },
                                  item.toneRead.tone === "up" ? "▲" : item.toneRead.tone === "down" ? "▼" : "◆",
                                ),
                                toneWord(item.toneRead.tone),
                              )
                            : null,
                        )
                      : null,
                  ),
                );
                /* The bookmark, beside the row rather than in it (see
                   NewsSaveBtn). Only for a story with a link to keep. */
                const kept = Array.isArray(this.props.saved)
                  ? this.props.saved.some((s) => s.url === item.url)
                  : false;
                const saveBtn =
                  item.url && typeof this.props.onToggleSaved === "function"
                    ? React.createElement(
                        NewsSaveBtn,
                        {
                          on: kept,
                          "aria-pressed": kept ? "true" : "false",
                          "data-news-save": kept ? "on" : "off",
                          "aria-label": kept
                            ? msg("news_unsave", "Remove from saved")
                            : msg("news_save", "Save to read later"),
                          title: kept
                            ? msg("news_unsave", "Remove from saved")
                            : msg("news_save", "Save to read later"),
                          onClick: () => this.props.onToggleSaved(item),
                        },
                        icon(kept ? "bookmarkOn" : "bookmark", 0.95, 2),
                      )
                    : null;
                /* A lone row is wrapped to hold its bookmark; a cluster holds
                   it itself, so its head row stays the cluster's own child. */
                const savable = saveBtn
                  ? React.createElement(NewsSavable, { key }, row, saveBtn)
                  : row;
                const lead = [dayHead, divider].filter(Boolean);
                if (!also.length) {
                  return lead.length ? [...lead, savable] : savable;
                }
                /* Names, then a count. Four is where a line of newsroom names
                 * stops being scannable — the same limit and the same reason
                 * as the three coin chips above. The rest are counted rather
                 * than dropped: the row would otherwise say four outlets ran
                 * it while showing three, which is the kind of quiet
                 * disagreement this panel exists to not have. */
                /* Each other newsroom named once, and the count is of
                   newsrooms: a desk that ran the story twice is one more
                   newsroom, not two. */
                const others = [];
                for (const other of also) {
                  if (other.source !== item.source && !others.some((o) => o.source === other.source)) others.push(other);
                }
                /* A fold that is one newsroom's several write-ups still links
                   them, under the count of write-ups rather than newsrooms. */
                const linkable = others.length ? others : also;
                const named = linkable.slice(0, NEWS_ALSO_NAMED);
                const rest = linkable.length - named.length;
                const cluster = React.createElement(
                  NewsCluster,
                  { key },
                  row,
                  saveBtn,
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
                          title: others.length
                            ? msg("news_also_title", "$1 newsrooms ran this story", String(others.length + 1))
                            : msg("news_also_same_title", "$1 ran this story $2 times", item.source, String(also.length + 1)),
                        },
                        others.length
                          ? msg("news_also_count", "+$1 more", String(others.length))
                          : msg("news_also_same", "$1 write-ups here", String(also.length + 1)),
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
                return lead.length ? [...lead, cluster] : cluster;
              })
            : React.createElement(
                NewsEmpty,
                null,
                this.emptyReason(loading),
              ),
        ),

        /* The foot carries the one fact a ticker could never show: whether what
         * you are reading is current. */
        (anyQuiet || anyNone) &&
          React.createElement(
            NewsStale,
            null,
            anyQuiet
              ? msg(
                  "news_stale_note",
                  "A source with an age beside its name has published nothing since then. That is the feed being quiet, not PriceTab failing to ask.",
                )
              : null,
            anyQuiet && anyNone ? " " : null,
            anyNone
              ? msg(
                  "news_none_note",
                  "One marked “none” answered, and had nothing on this beat this time.",
                )
              : null,
          ),
            /* Under the list only where the column is not drawn — the same
               line lives at the foot of the aside from 1100px up. */
            React.createElement(NewsFootOnly, null, this.renderAccess()),
          ),
          this.renderAside(all, matchers, newest),
        ),
      ),
    );
  }
}
