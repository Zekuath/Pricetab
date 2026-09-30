/* SETTINGS → PERMISSIONS
 *
 * Every permission this extension can hold, in one place, each with the
 * reason it is asked for, what leaves the device when it is used, and the two
 * buttons that grant it and take it back. Asked for on 21 Sep 2026 ("izin
 * vermek istemeyen insan sürekli bunu görmemeli"): the news panel asks once
 * and puts its card away for good; this tab is where a "not now" can become a
 * "yes" later, and where a "yes" can be undone one newsroom at a time.
 *
 * A plain function handed the panel, like `renderPreferencesTab` — there is
 * no `this` here, and state goes through `panel.setState`. It reads two things
 * the panel keeps for it: `permNews`, the newsroom ids Chrome actually holds,
 * and `permNotify`, whether `notifications` is held. Both are **asked of
 * Chrome**, never stored: a permission can be taken back from
 * chrome://extensions without this page hearing, so a stored "granted" would
 * go stale into a lie. `panel.refreshPermissions()` re-asks on every open of
 * the tab and after every press.
 *
 * Every request runs straight out of its click — Chrome refuses a request not
 * tied to a user gesture, silently — which is why nothing here awaits before
 * calling `requestNewsOrigin` or the notification handler.
 *
 * **What is not here, and why it says so.** Everything else PriceTab reads —
 * prices, candles, the widgets' figures, the five open news feeds — is public
 * data fetched by the reader's own browser with no permission at all, and
 * there is no proxy and no server of ours in between: a proxy would route
 * every reader through one address (the one address that *would* be blocked)
 * and break the promise that nothing leaves the device but the request. That
 * paragraph is on the tab because the question "why is my IP making these
 * requests" deserves the answer in the place permissions are read.
 */
const renderPermissionsTab = (panel) => {
  const api = hasPermissionsApi();
  const ios = window.PriceTabPlatform === "ios";
  const held = Array.isArray(panel.state.permNews) ? panel.state.permNews : [];
  const notify = panel.state.permNotify === true;
  const optional = NEWS_SOURCES.filter((s) => s.optional);
  const allOn = optional.length > 0 && held.length === optional.length;

  const after = () => {
    panel.refreshPermissions();
    if (panel.props.onNewsSourcesChange) panel.props.onNewsSourcesChange();
  };

  const state = (on) =>
    React.createElement(
      PermState,
      { on, "data-perm-state": on ? "active" : "off" },
      on ? msg("perm_active", "Active") : msg("perm_off", "Off"),
    );

  const row = (key, label, on, why, detail, controls) =>
    React.createElement(
      PermRow,
      { key, "data-perm-row": key },
      React.createElement(
        PermRowHead,
        null,
        React.createElement(PermName, null, label),
        state(on),
      ),
      React.createElement(PermWhy, null, why),
      detail && React.createElement(PermDetail, null, detail),
      React.createElement(PermControls, null, ...controls),
    );

  const button = (label, onClick, opts) =>
    React.createElement(
      PermButton,
      {
        onClick,
        primary: opts && opts.primary,
        disabled: opts && opts.disabled,
        "aria-label": (opts && opts.aria) || label,
      },
      label,
    );

  /* The alarm. The panel's own handler asks Chrome straight out of the click
     and flips the want with it, so granting here arms the switch in Targets
     too — it is one permission and one pair of switches. */
  const alarm = row(
    "notifications",
    msg("perm_notify", "Chrome notification"),
    notify,
    msg(
      "perm_notify_why",
      "Tells you when a price target is hit, or a contract on the derivatives account is stopped out or liquidated, while you are looking at another tab. The tab title says nothing to somebody who is not looking at it.",
    ),
    msg(
      "perm_notify_what",
      "Nothing is sent: the banner is drawn by your own browser from what the page already knows. There is no background worker, so it fires only while a PriceTab tab is open.",
    ),
    api
      ? [
          !notify &&
            button(
              msg("perm_allow", "Allow"),
              () => {
                if (panel.props.onAlarmNotifyChange) panel.props.onAlarmNotifyChange(true);
                setTimeout(() => panel.refreshPermissions(), 400);
              },
              { primary: true, aria: msg("perm_allow_notify", "Allow Chrome notifications") },
            ),
          notify &&
            button(
              msg("perm_give_back", "Give it back"),
              () => {
                if (panel.props.onAlarmDrop) panel.props.onAlarmDrop();
                setTimeout(() => panel.refreshPermissions(), 400);
              },
              { aria: msg("perm_drop_notify", "Take back Chrome notifications") },
            ),
        ]
      : [
          React.createElement(
            PermNote,
            { key: "no-api" },
            ios
              ? msg("perm_ios_notify", "On the phone this is iOS's own notification permission, asked for from the alarm switch in Targets.")
              : msg("perm_no_api", "There is no permissions API on this page, so nothing can be asked for here."),
          ),
        ],
  );

  /* The newsrooms: one row for the group, then one switch per origin. */
  const perOrigin = optional.map((src) => {
    const on = held.includes(src.id);
    return React.createElement(
      PermOrigin,
      { key: src.id, "data-perm-origin": src.id },
      React.createElement(PermOriginName, null, src.name),
      React.createElement(
        PermOriginHost,
        null,
        NEWS_SOURCE_ORIGINS[src.id].replace(/^https:\/\//, "").replace(/\/\*$/, ""),
      ),
      state(on),
      api && !ios
        ? button(
            on ? msg("perm_turn_off", "Turn off") : msg("perm_allow", "Allow"),
            () => {
              const call = on ? dropNewsOrigin(src.id) : requestNewsOrigin(src.id);
              call.then(after);
            },
            {
              primary: !on,
              aria: on
                ? msg("perm_drop_origin", "Take back access to $1", src.name)
                : msg("perm_allow_origin", "Allow access to $1", src.name),
            },
          )
        : null,
    );
  });

  const news = row(
    "newsrooms",
    msg("perm_news", "Newsroom feeds"),
    held.length > 0,
    msg(
      "perm_news_why2",
      "$1 newsrooms publish feeds a page cannot read without host access to that one site. With it, their headlines join the news panel and the “what happened here?” card.",
      String(optional.length),
    ),
    msg(
      "perm_news_what",
      "A plain request for the published feed, and nothing else: no reading of those sites, no script on their pages, nothing about you sent along. Each one can be allowed and taken back on its own.",
    ),
    api && !ios
      ? [
          !allOn &&
            button(
              msg("perm_allow_all2", "Allow all $1", String(optional.length)),
              () => requestNewsPermission().then(after),
              { primary: true, aria: msg("perm_allow_all_aria2", "Allow all $1 newsrooms", String(optional.length)) },
            ),
          held.length > 0 &&
            button(
              msg("perm_turn_all_off", "Turn all off"),
              () => dropNewsPermission().then(after),
              { aria: msg("perm_turn_all_off_aria", "Take back access to every newsroom") },
            ),
          React.createElement(
            PermState,
            { key: "count", on: held.length > 0, "data-perm-count": held.length },
            msg("perm_n_of_m", "$1 of $2", held.length, optional.length),
          ),
        ]
      : [
          React.createElement(
            PermNote,
            { key: "no-api" },
            ios
              ? msg("perm_ios_news2", "iOS has no equivalent of a site permission, so the $1 newsrooms cannot be read on the phone. The open feeds are.", String(optional.length))
              : msg("perm_no_api", "There is no permissions API on this page, so nothing can be asked for here."),
          ),
        ],
  );

  /* What is paused right now, read live: the one thing about the cool-down
     worth showing. Its lengths are deliberately not a setting — a rule of
     politeness toward a host that said no is not a preference, and a switch
     to shorten it is a switch to get the reader's own address blocked. */
  const cooling = hostCooldownsNow();
  const paused = Object.keys(cooling).sort();

  return React.createElement(
    TabContent,
    { key: "permissions-tab", "data-permissions-tab": "true" },
    React.createElement(
      PermIntro,
      null,
      msg(
        "perm_intro",
        "PriceTab is installed with no permissions. These two are optional: nothing is asked for until you press a button, and each can be taken back here or from chrome://extensions.",
      ),
    ),
    alarm,
    news,
    React.createElement(PermOrigins, null, ...perOrigin),
    React.createElement(
      PermRow,
      { "data-perm-row": "everything-else" },
      React.createElement(
        PermRowHead,
        null,
        React.createElement(PermName, null, msg("perm_rest", "Everything else")),
      ),
      React.createElement(
        PermWhy,
        null,
        msg(
          "perm_rest_why2",
          "Prices, candles, the widgets’ figures and the open news feeds are public data, fetched by your own browser with no permission at all — Coinbase, Kraken, Coinlore, OKX, Bybit, Alternative.me, mempool.space, Blockchair and PublicNode, plus Hacker News, CNBC, MarketWatch, Bitcoin.com and CryptoPotato.",
        ),
      ),
      React.createElement(
        PermDetail,
        { "data-perm-paused": paused.length },
        paused.length
          ? msg(
              "perm_paused_now",
              "Paused right now: $1",
              paused.map((h) => `${h} · ${describeAhead(cooling[h])}`).join(", "),
            )
          : msg("perm_paused_none", "Nothing is paused right now."),
      ),
      React.createElement(
        PermDetail,
        null,
        msg(
          "perm_rest_ip",
          "There is no proxy and no server of ours in between: every request leaves your browser with your own address, so a provider’s limit is yours alone and nobody else’s traffic can get you blocked. PriceTab keeps a cache for every feed, polls the news every ten minutes with a little jitter, and when a host answers 429 or 403 it leaves that host alone for fifteen minutes, doubling up to two hours, and says so on the source’s chip.",
        ),
      ),
    ),
  );
};
