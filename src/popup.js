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

const popupMoney = (value, symbol, places, format) => {
  if (typeof value !== "number" || !isFinite(value)) return "—";
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

const renderPopup = () => {
  const root = document.body;
  while (root.firstChild) root.removeChild(root.firstChild);

  const symbol = getCurrencySymbol(popupState.currency);
  const rows = popupRows();

  const head = popupEl("div", "head");
  head.appendChild(popupEl("span", "title", msg("pop_title", "PriceTab")));
  const openTab = popupEl("button", null, msg("pop_open", "Open a tab"));
  openTab.type = "button";
  openTab.title = msg("pop_open_hint", "Open a new tab with the full chart");
  openTab.addEventListener("click", () => {
    /* `chrome.tabs.create` needs no permission for a plain new tab, which is
     * what the four-line script this replaced already relied on. Where there
     * is no `chrome.tabs` at all — a plain-browser preview of this file —
     * nothing happens rather than throwing. */
    try {
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({});
        window.close();
      }
    } catch (error) {
      // Nothing to do: the button simply does not work outside the extension
    }
  });
  head.appendChild(openTab);
  root.appendChild(head);

  const list = popupEl("div", "rows");
  for (const row of rows) {
    const line = popupEl("div", "row");
    line.appendChild(popupEl("span", "coin", row.coin));
    line.appendChild(
      popupEl(
        "span",
        "price",
        row.price == null
          ? "—"
          : popupMoney(row.price, symbol, popupState.places, popupState.format),
      ),
    );
    const tone =
      row.change == null ? "flat" : row.change > 0 ? "up" : row.change < 0 ? "down" : "flat";
    line.appendChild(popupEl("span", `change ${tone}`, popupPercent(row.change)));
    list.appendChild(line);
  }
  root.appendChild(list);

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
  const refresh = popupEl("button", null, msg("pop_refresh", "Refresh"));
  refresh.type = "button";
  refresh.disabled = popupState.busy;
  refresh.addEventListener("click", () => refreshPopup(true));
  foot.appendChild(refresh);
  root.appendChild(foot);

  const note = popupEl("div", "note");
  const link = popupEl("a", null, msg("pop_rate", "Rate PriceTab"));
  link.href = STORE_LISTING_URL;
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
    await bulkRefreshPageTickerCache(popupState.coins, popupState.currency);
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
  renderPopup();
  // Straight away, not on a press: the cache is usually inside its minute, in
  // which case this costs nothing and returns before the popup has settled.
  refreshPopup(false);
};

startPopup();
