/* THE TOOLBAR POPUP.
 *
 * **What was here before was a four-line script that opened the store
 * listing**, and the button's tooltip read "PriceTab - Rate on Chrome Web
 * Store" on every hover of every page for the life of the install. That is the
 * one piece of this extension's interface that exists when the reader is *not*
 * on a new tab — the only surface it owns everywhere — and it was spent asking
 * for a review.
 *
 * It shows prices now. The rating link is still here, one line at the foot,
 * because wanting it was not the mistake; putting it in front of everything
 * else was.
 *
 * **It costs nothing to open.** An extension page shares the origin of the new
 * tab, so `crypto_chart_ticker_cache` — swept and persisted by every tab
 * that has been open — is already here, and the list paints from it before any
 * request is made. A refresh is the same single bulk sweep the page ticker
 * makes, through `bulkRefreshPageTickerCache`, so opening the popup is at
 * worst one request to a host the extension already uses, and usually none.
 *
 * **Prices out of a cache have an age, so the age is on screen.** A popup that
 * prints a two-hour-old number as if it were live is the failure mode this
 * whole surface has; the foot says how old the oldest figure on it is, and the
 * refresh button says when it is working.
 *
 * Loaded by `popup.html` alongside `i18n.js`, `config.js`, `storage.js` and
 * `api.js` — and deliberately not by `index.html`, which is why
 * `tests/test-invariants.js` exempts it from the script-tag rule.
 */

/* The currency formatter is this file's own, and that is a considered
 * duplication rather than an oversight. `formatNumberString` lives in
 * `utils.js`, which builds a d3 line generator at load — so a page that wants
 * a price and nothing else cannot have it without shipping d3 into a popup to
 * format a number. What is copied is small and fixed (the three separator
 * styles, the user's decimal places) and it reads the same two settings the
 * page does, so the two cannot drift on anything a person chose. If a third
 * caller ever needs it, that is the moment to cut the formatter out of
 * `utils.js` into its own file — not before. */
const popupSeparators = { us: [",", "."], eu: [".", ","], space: [" ", "."] };

/* Grouped by walking the string rather than by the lookahead `utils.js` uses
 * (`NUMBER_REG`). The regex is the idiomatic one and is fine there; here it is
 * the only thing in this file the security lint flags, and a three-line loop
 * is not worth an exception nobody reading later would understand. */
const popupGroup = (digits, separator) => {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    if (i > 0 && fromEnd % 3 === 0) out += separator;
    out += digits[i];
  }
  return out;
};

/* The same floor as `priceDecimals` in utils.js, which this page does not
 * load: a price under one keeps four significant digits, or DOGE at $0.0849
 * printed as $0.08 here too. */
const popupPlaces = (value, places) => {
  const abs = Math.abs(value);
  if (!(abs > 0) || abs >= 1) return places;
  return Math.max(places, Math.min(8, 3 - Math.floor(Math.log10(abs))));
};

const popupMoney = (value, symbol, places, format) => {
  if (typeof value !== "number" || !isFinite(value)) return "—";
  places = popupPlaces(value, places);
  const [group, decimal] = popupSeparators[format] || popupSeparators.us;
  const [whole, rest] = Math.abs(value).toFixed(places).split(".");
  return `${value < 0 ? "-" : ""}${symbol}${popupGroup(whole, group)}${
    rest ? decimal + rest : ""
  }`;
};

const popupPercent = (change) => {
  if (typeof change !== "number" || !isFinite(change)) return "";
  // A change that rounds to nothing carries no sign (utils.js' signedFixed;
  // the popup does not load utils.js)
  const shown = Math.abs(change).toFixed(2);
  if (Number(shown) === 0) return `${shown}%`;
  return `${change > 0 ? "+" : "−"}${shown}%`;
};

/* How old the oldest figure on screen is, in words. Rounded down and never
 * dressed up: "3 min ago" for something 3 minutes and 50 seconds old is a
 * smaller claim than "4 min ago", and this line exists to make the number
 * below it less certain, not more. */
const popupAge = (ms) => {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return msg("pop_age_now", "just now");
  if (mins < 60) return msg("pop_age_min", "$1 min ago", mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return msg("pop_age_hour", "$1 h ago", hours);
  return msg("pop_age_day", "$1 d ago", Math.floor(hours / 24));
};

const popupEl = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text; // never innerHTML — see the invariants
  return node;
};

const popupState = {
  coins: [],
  currency: "USD",
  places: 2,
  format: "us",
  busy: false,
  parts: { ...DEFAULT_POPUP_PARTS },
  view: "main", // "main" | "settings" — the gear swaps the two
  extras: { halving: null, fearGreed: null, market: null },
};

// Which parts are on (POPUP_PARTS_KEY): a stored value that is not a boolean is the default
const loadPopupParts = () => {
  const stored = typeof loadJsonSetting === "function" ? loadJsonSetting(POPUP_PARTS_KEY) : null;
  const out = { ...DEFAULT_POPUP_PARTS };
  if (stored && typeof stored === "object") {
    for (const k of POPUP_PARTS) if (typeof stored[k] === "boolean") out[k] = stored[k];
  }
  return out;
};

const setPopupPart = (key, on) => {
  popupState.parts = { ...popupState.parts, [key]: on };
  if (typeof saveJsonSetting === "function") saveJsonSetting(POPUP_PARTS_KEY, popupState.parts);
  renderPopup();
  if (on) loadPopupExtras(true);
};

/* The market figures, through the widgets' own fetchers and their shared
   cache (api.js): a part that is off is never asked for. Each lands on its
   own and redraws. **Opening the popup asks for nothing** (polish §33): the
   tiles paint from the widget cache, and the network is asked only when the
   prices went to it anyway, on Refresh, or when a part is switched on. */
const POPUP_EXTRA_CACHE = { halving: "halvingCountdown", fearGreed: "fearGreed", market: "marketOverview" };

const loadPopupExtras = (ask) => {
  const jobs = [
    ["halving", typeof fetchHalvingData === "function" ? fetchHalvingData : null],
    ["fearGreed", typeof fetchFearGreedIndex === "function" ? fetchFearGreedIndex : null],
    ["market", typeof fetchMarketOverview === "function" ? fetchMarketOverview : null],
  ];
  for (const [key, fn] of jobs) {
    if (!popupState.parts[key] || !fn || popupState.extras[key]) continue;
    if (!ask) {
      const kept = typeof getWidgetCache === "function" ? getWidgetCache(POPUP_EXTRA_CACHE[key]) : null;
      if (kept) popupState.extras = { ...popupState.extras, [key]: kept };
      continue;
    }
    Promise.resolve(fn())
      .then((data) => {
        if (!data) return;
        popupState.extras = { ...popupState.extras, [key]: data };
        renderPopup();
      })
      .catch(() => {
        // The tile simply stays away
      });
  }
};

const popupRows = () => {
  const now = Date.now();
  const rows = [];
  for (const coin of popupState.coins) {
    const entry = pageTickerCache.get(`${coin}-${popupState.currency}`);
    rows.push({
      coin,
      price: entry ? entry.price : null,
      change: entry && typeof entry.change === "number" ? entry.change : null,
      age: entry ? now - entry.timestamp : null,
    });
  }
  return rows;
};

/* **Open a tab — on a coin, when one was pressed** (12 Oct 2026). A plain
 * new tab needs no permission; a tab on the extension's own page with
 * #coin=ETH is the same page, which reads the hash once (app.js) and shows
 * that coin. Outside the extension (a preview of this file) nothing happens. */
const popupOpen = (coin) => {
  try {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create(coin ? { url: `index.html#coin=${encodeURIComponent(coin)}` } : {});
      window.close();
    }
  } catch (error) {
    // Nothing to do: the button simply does not work outside the extension
  }
};

/* A coin's last day as a line, from the history the new tab already cached
 * (the price cache is shared and persisted) — no request. Absent, no line. */
const popupSpark = (coin) => {
  if (typeof getCachedData !== "function" || typeof document.createElementNS !== "function") return null;
  const hit = getCachedData(coin, "day", popupState.currency, "history");
  const pts = hit && Array.isArray(hit.data) ? hit.data.map((p) => Number(p && p.price)).filter((v) => v > 0) : [];
  if (pts.length < 3) return null;
  const step = Math.max(1, Math.floor(pts.length / 48));
  const kept = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  const lo = Math.min(...kept);
  const hi = Math.max(...kept);
  const span = hi - lo || 1;
  const d = kept
    .map((v, i) => `${i ? "L" : "M"}${((i / (kept.length - 1)) * 100).toFixed(2)} ${(22 - ((v - lo) / span) * 20).toFixed(2)}`)
    .join(" ");
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", `spark ${kept[kept.length - 1] >= kept[0] ? "up" : "down"}`);
  svg.setAttribute("viewBox", "0 0 100 24");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  return svg;
};

const popupTone = (change) => (change == null ? "flat" : change > 0 ? "up" : change < 0 ? "down" : "flat");

/* What is held, valued at the prices on screen, and how far that moved in
 * the day — from the portfolio the new tab keeps, never sent anywhere. A
 * holding with no price yet is counted out loud rather than as zero. The
 * portfolio's mask (H) is honoured here too. */
const popupHoldings = (prices) => {
  if (typeof loadPortfolioFromStorage !== "function") return null;
  const held = loadPortfolioFromStorage().filter((h) => h && h.amount > 0);
  if (!held.length) return null;
  let value = 0;
  let before = 0;
  let unpriced = 0;
  for (const h of held) {
    const q = prices.get(h.coin);
    if (!q || !(q.price > 0)) {
      unpriced += 1;
      continue;
    }
    value += h.amount * q.price;
    before += h.amount * (typeof q.change === "number" ? q.price / (1 + q.change / 100) : q.price);
  }
  return { value, change: before > 0 ? ((value - before) / before) * 100 : null, delta: value - before, unpriced, priced: held.length - unpriced };
};

const renderPopup = () => {
  const root = document.body;
  while (root.firstChild) root.removeChild(root.firstChild);

  const symbol = getCurrencySymbol(popupState.currency);
  const money = (v) => popupMoney(v, symbol, popupState.places, popupState.format);
  const rows = popupRows();

  const head = popupEl("div", "head");
  const brand = popupEl("div", "brand");
  const logo = popupEl("img");
  logo.src = "assets/icons/icon48.png";
  logo.alt = "";
  brand.appendChild(logo);
  const brandName = popupEl("span", null, msg("pop_title", "PriceTab"));
  // The name is not translated, nor upper-cased by another language's rules
  brandName.setAttribute("lang", "en");
  brand.appendChild(brandName);
  head.appendChild(brand);
  const tools = popupEl("div", "tools");
  const gear = popupEl("button", "btn icon", "⚙");
  gear.type = "button";
  gear.setAttribute("aria-label", msg("pop_settings", "What the popup shows"));
  gear.setAttribute("aria-pressed", popupState.view === "settings" ? "true" : "false");
  gear.title = msg("pop_settings", "What the popup shows");
  gear.setAttribute("data-popup-gear", "1");
  gear.addEventListener("click", () => {
    popupState.view = popupState.view === "settings" ? "main" : "settings";
    renderPopup();
  });
  tools.appendChild(gear);
  const openTab = popupEl("button", "btn", msg("pop_open", "Open a tab"));
  openTab.type = "button";
  openTab.title = msg("pop_open_hint", "Open a new tab with the full chart");
  openTab.addEventListener("click", () => popupOpen(null));
  tools.appendChild(openTab);
  head.appendChild(tools);
  root.appendChild(head);

  /* **The popup's own settings** (POPUP_PARTS_KEY): a switch a part, saved
     as it is pressed, in the same place the parts are read. */
  if (popupState.view === "settings") {
    root.appendChild(popupEl("div", "label", msg("pop_settings", "What the popup shows")));
    const list = popupEl("div", "switches");
    list.setAttribute("data-popup-settings", "1");
    const names = {
      holdings: msg("pop_holdings", "Your holdings"),
      coins: msg("pop_coins", "Your coins"),
      targets: msg("pop_targets", "Price targets"),
      halving: msg("pop_halving", "Bitcoin halving"),
      fearGreed: msg("pop_fear_greed", "Fear & Greed"),
      market: msg("pop_market", "The market"),
    };
    for (const key of POPUP_PARTS) {
      const on = popupState.parts[key] === true;
      const row = popupEl("button", "switch");
      row.type = "button";
      row.setAttribute("aria-pressed", on ? "true" : "false");
      row.setAttribute("data-popup-part", key);
      row.appendChild(popupEl("span", null, names[key]));
      row.appendChild(popupEl("span", "knob"));
      row.addEventListener("click", () => setPopupPart(key, !on));
      list.appendChild(row);
    }
    root.appendChild(list);

    /* **The language, here too** (12 Oct 2026): the same setting the new
       tab's Settings keeps (LANGUAGE_STORAGE_KEY, i18n.js), so a choice made
       in either is the language of both. The catalogue is read before the
       popup reloads, as the new tab does, so it comes back translated. */
    if (typeof SUPPORTED_LOCALES !== "undefined" && typeof LANGUAGE_STORAGE_KEY !== "undefined") {
      root.appendChild(popupEl("div", "label", msg("pref_language_label", "Language")));
      const pick = popupEl("select", "select");
      pick.setAttribute("aria-label", msg("pref_language_label", "Language"));
      pick.setAttribute("data-popup-language", "1");
      const current = typeof loadLanguageSetting === "function" ? loadLanguageSetting() : "auto";
      const options = [{ value: "auto", label: msg("pref_language_auto", "Auto") }].concat(SUPPORTED_LOCALES);
      for (const o of options) {
        const opt = popupEl("option", null, o.label);
        opt.value = o.value;
        if (o.value === current) opt.selected = true;
        pick.appendChild(opt);
      }
      pick.addEventListener("change", () => {
        const next = pick.value;
        if (typeof saveSetting === "function") saveSetting(LANGUAGE_STORAGE_KEY, next);
        const done = () => window.location.reload();
        const warm =
          typeof cacheLocaleMessages === "function" && typeof matchLocale === "function"
            ? cacheLocaleMessages(matchLocale(next) || next)
            : null;
        if (warm && typeof warm.then === "function") warm.then(done, done);
        else done();
      });
      root.appendChild(pick);
    }

    const done = popupEl("button", "btn wide", msg("pop_done", "Done"));
    done.type = "button";
    done.addEventListener("click", () => {
      popupState.view = "main";
      renderPopup();
    });
    root.appendChild(done);
    return;
  }

  /* **The market in three figures** (each a part): the next halving, the
     Fear & Greed index, the whole market's value and Bitcoin's share. */
  const tiles = [];
  const hv = popupState.parts.halving && popupState.extras.halving;
  if (hv && hv.blocksLeft > 0) {
    tiles.push(["halving", msg("pop_halving", "Bitcoin halving"), msg("pop_days", "$1 days", String(hv.days)), msg("pop_blocks", "$1 blocks", popupGroup(String(hv.blocksLeft), ","))]);
  }
  const fg = popupState.parts.fearGreed && popupState.extras.fearGreed;
  if (fg && Number.isFinite(fg.value)) {
    tiles.push(["fearGreed", msg("pop_fear_greed", "Fear & Greed"), String(fg.value), fg.classification || ""]);
  }
  const mk = popupState.parts.market && popupState.extras.market;
  if (mk && mk.totalMarketCap > 0) {
    const compact = (v) => {
      try {
        return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(v);
      } catch (error) {
        return String(Math.round(v));
      }
    };
    tiles.push(["market", msg("pop_market", "The market"), `$${compact(mk.totalMarketCap)}`, Number.isFinite(mk.btcDominance) ? msg("pop_btc_share", "BTC $1%", mk.btcDominance.toFixed(1)) : ""]);
  }
  if (tiles.length) {
    const strip = popupEl("div", "tiles");
    strip.setAttribute("data-popup-tiles", String(tiles.length));
    for (const [key, label, value, sub] of tiles) {
      const t = popupEl("div", "tile");
      t.setAttribute("data-popup-tile", key);
      t.appendChild(popupEl("div", "label", label));
      t.appendChild(popupEl("b", null, value));
      if (sub) t.appendChild(popupEl("span", null, sub));
      strip.appendChild(t);
    }
    root.appendChild(strip);
  }

  // Every price this popup knows, for the holdings and the targets
  const prices = new Map();
  for (const [key, v] of pageTickerCache) {
    if (key.endsWith(`-${popupState.currency}`) && v) prices.set(key.slice(0, -(popupState.currency.length + 1)), v);
  }

  const held = popupState.parts.holdings ? popupHoldings(prices) : null;
  if (held && held.priced) {
    const card = popupEl("div", "card");
    card.setAttribute("data-popup-holdings", "1");
    card.appendChild(popupEl("div", "label", msg("pop_holdings", "Your holdings")));
    const line = popupEl("div", "value");
    const hidden = typeof loadPortfolioHiddenFromStorage === "function" && loadPortfolioHiddenFromStorage();
    line.appendChild(popupEl("b", null, hidden ? "•••" : money(held.value)));
    const tone = popupTone(held.change);
    line.appendChild(
      popupEl(
        "span",
        `change ${tone}`,
        held.change == null ? "" : hidden ? popupPercent(held.change) : `${popupPercent(held.change)} · ${held.delta < 0 ? "−" : "+"}${money(Math.abs(held.delta))}`,
      ),
    );
    card.appendChild(line);
    if (held.unpriced) card.appendChild(popupEl("div", "note", msg("pop_unpriced", "$1 not priced yet", held.unpriced)));
    root.appendChild(card);
  }

  const list = popupEl("div", "rows");
  if (popupState.parts.coins) root.appendChild(popupEl("div", "label", msg("pop_coins", "Your coins")));
  for (const row of rows) {
    const line = popupEl("button", "row");
    line.type = "button";
    line.setAttribute("data-popup-coin", row.coin);
    line.title = msg("pop_open_coin", "Open $1 on a new tab", row.coin);
    line.addEventListener("click", () => popupOpen(row.coin));
    const who = popupEl("span", "who");
    who.appendChild(popupEl("span", "coin", row.coin));
    const name = typeof COIN_NAMES !== "undefined" && COIN_NAMES[row.coin];
    if (name && name !== row.coin) who.appendChild(popupEl("span", "name", name));
    line.appendChild(who);
    line.appendChild(popupSpark(row.coin) || popupEl("span"));
    line.appendChild(popupEl("span", "price", row.price == null ? "—" : money(row.price)));
    line.appendChild(popupEl("span", `change ${popupTone(row.change)}`, popupPercent(row.change) || "—"));
    list.appendChild(line);
  }
  if (popupState.parts.coins) root.appendChild(list);

  /* The armed price targets, nearest first: the one thing on the new tab that
     is about a moment still to come. Three at most. */
  const armed = (popupState.parts.targets && typeof loadAlerts === "function" ? loadAlerts() : [])
    .filter((a) => a && a.kind === "price" && !a.triggeredAt && a.currency === popupState.currency)
    .map((a) => {
      const q = prices.get(a.coin);
      return { a, away: q && q.price > 0 ? ((a.target - q.price) / q.price) * 100 : null };
    })
    .sort((x, y) => (x.away == null ? 1 : y.away == null ? -1 : Math.abs(x.away) - Math.abs(y.away)))
    .slice(0, 3);
  if (armed.length) {
    root.appendChild(popupEl("div", "label", msg("pop_targets", "Price targets")));
    const box = popupEl("div", "targets");
    box.setAttribute("data-popup-targets", String(armed.length));
    for (const { a, away } of armed) {
      const t = popupEl("div", "target");
      t.appendChild(popupEl("span", null, `${a.coin} ${a.direction === "below" ? "↓" : "↑"} ${money(a.target)}`));
      t.appendChild(popupEl("span", null, away == null ? "—" : msg("pop_target_away", "$1% away", Math.abs(away).toFixed(1))));
      box.appendChild(t);
    }
    root.appendChild(box);
  }

  /* The oldest figure decides what the line says, because it is the one the
   * sentence has to be true of. */
  const ages = rows.map((r) => r.age).filter((a) => typeof a === "number");
  const oldest = ages.length ? Math.max(...ages) : null;
  const foot = popupEl("div", "foot");
  foot.appendChild(
    popupEl(
      "span",
      null,
      popupState.busy
        ? msg("pop_refreshing", "Refreshing…")
        : oldest == null
          ? msg("pop_no_prices", "No prices yet")
          : msg("pop_from", "Prices from $1", popupAge(oldest)),
    ),
  );
  const refresh = popupEl("button", "btn", msg("pop_refresh", "Refresh"));
  refresh.type = "button";
  refresh.disabled = popupState.busy;
  refresh.addEventListener("click", () => refreshPopup(true));
  foot.appendChild(refresh);
  root.appendChild(foot);

  const note = popupEl("div", "note");
  const link = popupEl("a", null, msg("pop_rate", "Rate PriceTab"));
  link.href = STORE_REVIEWS_URL;
  link.target = "_blank";
  link.rel = "noreferrer";
  note.appendChild(link);
  root.appendChild(note);
};

/* One sweep, shared with every other surface through the same TTL guard.
 *
 * `force` is what the button means: the guard inside
 * `bulkRefreshPageTickerCache` returns early while the last sweep is still
 * inside its minute, which is right for a background refresh and wrong for
 * somebody who has just pressed a button and is watching. Clearing the stamp
 * for this currency is how the press gets through, and nothing else uses it to
 * mean anything other than "when did we last sweep".
 */
const refreshPopup = async (force) => {
  if (popupState.busy) return;
  popupState.busy = true;
  renderPopup();
  try {
    if (force) bulkSweepAt.delete(popupState.currency);
    const swept = bulkSweepAt.get(popupState.currency);
    await bulkRefreshPageTickerCache(popupState.coins, popupState.currency);
    // The tiles go to the network only when the prices just did
    if (force || bulkSweepAt.get(popupState.currency) !== swept) loadPopupExtras(true);
  } catch (error) {
    // The list keeps whatever it had; the age line says how old that is
  }
  popupState.busy = false;
  renderPopup();
};

const startPopup = () => {
  popupState.coins = loadCoinOptionsFromStorage();
  popupState.currency = loadCurrencyFromStorage();
  popupState.places = loadDecimalPlacesFromStorage();
  popupState.format = loadSeparatorFormatFromStorage();
  if (popupState.format === "auto" && typeof localeSeparatorFormat === "function") {
    popupState.format = localeSeparatorFormat();
  }
  const theme = loadThemeFromStorage();
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  // Blue/orange for up and down, when the new tab uses it (theme.js)
  if (loadDirectionPalette() === "cvd") {
    document.documentElement.setAttribute("data-palette", "cvd");
  }
  popupState.parts = loadPopupParts();
  /* The page's language is the catalogue's, so CSS upper-cases by its rules —
     under "en" a Turkish "coinlerin" became COINLERIN, not COİNLERİN */
  try {
    if (typeof activeLocale === "function" && typeof intlTag === "function") document.documentElement.lang = intlTag(activeLocale());
  } catch (error) {
    // The page stays "en"
  }
  loadPopupExtras(false);
  renderPopup();
  // Straight away, not on a press: the cache is usually inside its minute, in
  // which case this costs nothing and returns before the popup has settled.
  refreshPopup(false);
};

startPopup();
