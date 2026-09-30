/* Language — and what "automatic" is allowed to cost on a new-tab page.
 *
 * The rule this file exists to keep: **an untouched install pays nothing.**
 * Chrome already ships a localisation mechanism that loads only the matching
 * locale, answers synchronously and needs no permission, so the automatic
 * case — follow the browser — goes through `chrome.i18n` and costs this page
 * no bytes, no request and no wait. Bundling twelve string tables as
 * `<script>` tags would have parsed a few hundred KB on every new tab to use
 * one of them, which is exactly the kind of startup cost the rest of the
 * project spends its time measuring away.
 *
 * The one thing `chrome.i18n` cannot do is be overridden from inside the page:
 * it follows Chrome's UI language and nothing else. So an explicit choice —
 * and only an explicit choice — reads the same file over `fetch`, from the
 * extension's own package, before React mounts. Same files
 * (`_locales/<code>/messages.json`), one source of truth, and the cost falls
 * on the person who asked for it.
 *
 * English is not a table anywhere. Every call carries its own English — and
 * the function is `msg`, not the idiomatic `t`, because `t` is already a local
 * variable in three files here (`const t = e.target` in `handleKeyDown`, the
 * transition parameter in the chart) and a shadowed global fails silently:
 *
 *     msg("stats_mkt_cap", "Mkt Cap")
 *
 * which means a key that is missing, a locale that is half-finished, a test
 * sandbox with no `chrome` object and a plain-browser preview of `index.html`
 * all print English rather than a key name. `scripts/i18n-extract.js` reads
 * those second arguments back out to build `_locales/en/messages.json`, so the
 * English catalogue is generated from the code rather than kept beside it.
 */

/* The locales carried, by browser share, with each name written in its own
 * language — a language list in English is a list the person looking for
 * their language cannot read.
 *
 * Left-to-right only, deliberately. Arabic, Hebrew and Persian are a layout
 * project rather than a translation — the chart's axis, the ticker's scroll
 * direction and every `margin-left` in the panels — and a half-mirrored UI is
 * worse than an English one. */
const SUPPORTED_LOCALES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt_BR", label: "Português (Brasil)" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "ru", label: "Русский" },
  { value: "tr", label: "Türkçe" },
  { value: "uk", label: "Українська" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "zh_CN", label: "简体中文" },
];

/* The stored preference. Defined here rather than in `config.js` with the
 * other storage keys, because `config.js` now builds translated labels as it
 * loads and therefore runs *after* this file — a key it owned would not exist
 * yet when this one is read. */
const LANGUAGE_STORAGE_KEY = "crypto_chart_language";

/* "Settings was open when the language changed."
 *
 * Changing the language reloads the page, and a reload closes every
 * panel — so picking a language threw you out of the panel you picked it
 * in, which reads as the app losing your place rather than as the setting
 * being applied. This one flag is written just before the reload and
 * consumed on the way back up, which puts Settings back on the tab you
 * were on. It is deliberately a **session** key: it describes a reload
 * that is happening right now, not a preference, and it must not still be
 * there tomorrow. */
const REOPEN_SETTINGS_KEY = "crypto_chart_reopen_settings";

const DEFAULT_LANGUAGE = "auto";

/* Chrome names locale folders with an underscore (`pt_BR`); everything in the
 * `Intl` family wants the BCP-47 tag (`pt-BR`). One conversion, in one place,
 * rather than a `replace` at every call site. */
const intlTag = (code) => String(code || "en").replace(/_/g, "-");

/* What the browser itself is set to. `chrome.i18n.getUILanguage()` is the
 * honest answer to "what is Chrome in" — `navigator.language` is the page's
 * language list, which is close but not the same thing, and is the fallback
 * for every context that is not an extension (a test sandbox, a preview). */
const browserUiLanguage = () => {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getUILanguage) {
      const ui = chrome.i18n.getUILanguage();
      if (ui) return ui;
    }
  } catch {
    /* An extension API that throws is an extension API that is not there. */
  }
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en";
};

/* Exact tag first, then the base language: `pt-BR` finds Brazilian
 * Portuguese, `pt-PT` falls back to it rather than to English, and `de-AT`
 * finds German. Returns null when nothing matches, so the caller can tell
 * "no match" from "matched English". */
const matchLocale = (tag) => {
  if (!tag) return null;
  const want = String(tag).replace(/_/g, "-").toLowerCase();
  const codes = SUPPORTED_LOCALES.map((l) => l.value);
  const exact = codes.find((c) => c.replace(/_/g, "-").toLowerCase() === want);
  if (exact) return exact;
  const base = want.split("-")[0];
  const sameBase = codes.filter((c) => c.split(/[_-]/)[0].toLowerCase() === base);
  if (!sameBase.length) return null;
  /* Prefer the bare language (`pt` over `pt_BR`) when it exists; otherwise the
   * first regional variant carried is a better answer than English. */
  return sameBase.find((c) => !/[_-]/.test(c)) || sameBase[0];
};

/* The stored preference, or `auto`. Read through `storage.js` like every other
 * setting — raw `localStorage` is confined to four files and this is not one
 * of them. */
const loadLanguageSetting = () => {
  if (typeof loadEnumSetting !== "function") return DEFAULT_LANGUAGE;
  return loadEnumSetting(
    LANGUAGE_STORAGE_KEY,
    [DEFAULT_LANGUAGE].concat(SUPPORTED_LOCALES.map((l) => l.value)),
    DEFAULT_LANGUAGE,
  );
};

/* Resolved once. Nothing here can change while a tab is open — switching
 * language reloads, because half the strings on screen were built during the
 * render that is already on it. */
let _activeLocale = null;
let _localeMessages = null; // only set when an explicit choice is loaded

const activeLocale = () => {
  if (_activeLocale) return _activeLocale;
  const chosen = loadLanguageSetting();
  _activeLocale =
    (chosen !== DEFAULT_LANGUAGE && matchLocale(chosen)) ||
    matchLocale(browserUiLanguage()) ||
    "en";
  return _activeLocale;
};

/* True when the page has to load a catalogue itself: the person has chosen a
 * language that is not the one Chrome is in, so `chrome.i18n` — which only
 * ever answers in Chrome's language — would answer in the wrong one. */
const localeNeedsLoading = () => {
  const active = activeLocale();
  if (active === "en") return false; // English is at every call site already
  return matchLocale(browserUiLanguage()) !== active;
};

/* Where a chosen catalogue is kept once it has been read, and the reason it is
 * kept at all: **some strings are built before the page can fetch anything.**
 * `WIDGET_GROUPS` and the rest of `widgets-data.js` are module-level
 * constants, evaluated the moment the file loads, which is long before any
 * promise can resolve — so a catalogue that only arrives asynchronously
 * translates what the render says and leaves every constant in English, on the
 * same screen. Held here, it is already in hand when those files run.
 *
 * It cannot go stale in a way that matters: it is stamped with the locale it
 * is for and rewritten from the package whenever the language is chosen.
 * Deliberately **not** one of `storage.js`'s evictable cache keys — dropping
 * it would put the app into a language nobody picked, which is not what a
 * cache eviction is allowed to do. */
const LANGUAGE_CACHE_KEY = "crypto_chart_language_cache";

/* Which build wrote the cached catalogue.
 *
 * Without this the cache was written once, when the language was chosen, and
 * then read for ever: a translation corrected in a later version never reached
 * anyone who had picked a language, because their copy of the catalogue was
 * frozen at the day they picked it. Measured — a profile holding a catalogue
 * with the old wording kept showing that wording after the packaged files had
 * changed, and nothing short of switching language and back would clear it.
 *
 * The version is the right key rather than a timestamp: the catalogue can only
 * change when the extension is updated, so it is stale exactly when the
 * versions differ, and it costs no revalidation on an ordinary tab. Absent
 * (a page opened outside the extension) it degrades to "no stamp matches",
 * which re-fetches — the safe direction. */
const extensionVersion = () => {
  try {
    return chrome.runtime.getManifest().version || "";
  } catch (error) {
    return "";
  }
};

const readCachedMessages = (code) => {
  if (typeof loadJsonSetting !== "function") return null;
  const held = loadJsonSetting(LANGUAGE_CACHE_KEY);
  if (!held || held.locale !== code || !held.messages) return null;
  if (held.version !== extensionVersion()) return null;
  return typeof held.messages === "object" ? held.messages : null;
};

/* Fetches that catalogue from the extension's own package. Same-origin, on
 * disk, no permission and no host: `chrome.runtime.getURL` resolves to the
 * `chrome-extension://` file that Chrome would have read itself. Failure is
 * not fatal — every call site carries its English. */
const loadLocaleMessages = (code) => {
  const url =
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL(`_locales/${code}/messages.json`)
      : `./_locales/${code}/messages.json`;
  return fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && typeof json === "object") {
        _localeMessages = json;
        if (typeof saveJsonSetting === "function") {
          saveJsonSetting(LANGUAGE_CACHE_KEY, {
            locale: code,
            version: extensionVersion(),
            messages: json,
          });
        }
      }
      return json;
    })
    .catch(() => {
      /* Left English. A language that will not load is not worth a blank UI. */
    });
};

/* Called once from `app.js` before mount. Returns a promise **only** when
 * there is something left to wait for — which, after the first switch, there
 * never is: the catalogue was written to storage when the language was chosen
 * and picked up synchronously at the top of this file. The ordinary path (no
 * override) and the settled override path both mount on the same tick they
 * always did.
 *
 * The fetch survives as the cold-cache fallback. It cannot repair the
 * module-level constants — they have already run — but it is better than a
 * screen in a language nobody asked for, and the case is close to
 * unreachable: the cache and the setting live in the same storage and are
 * cleared together. */
/* Read once and cleared in the same breath — a flag nobody removes is a flag
 * that reopens Settings on some unrelated reload next week. `sessionStorage`
 * rather than `localStorage`: it is scoped to this tab and this session, which
 * is exactly the lifetime of the reload it describes. Wrapped, because a
 * browser with site data blocked throws on the accessor itself. */
const takeReopenSettings = () => {
  try {
    const held = sessionStorage.getItem(REOPEN_SETTINGS_KEY);
    if (held) sessionStorage.removeItem(REOPEN_SETTINGS_KEY);
    return held || null;
  } catch {
    return null;
  }
};

const markReopenSettings = (tab) => {
  try {
    sessionStorage.setItem(REOPEN_SETTINGS_KEY, tab || "preferences");
  } catch {
    /* Nothing to remember it with; the reload simply lands on the chart. */
  }
};

/* Resolved **once**, at load, into a value both `app.js` (does the panel open?)
 * and `settings.js` (on which tab?) read. It cannot be a function call at each
 * site: taking the flag clears it, so the second caller would always see
 * nothing and the two would disagree about the same reload. */
const reopenSettingsTab = takeReopenSettings();

const i18nPreload = () => {
  applyDocumentLanguage();
  if (_localeMessages || !localeNeedsLoading()) return null;
  return loadLocaleMessages(activeLocale());
};

/* Fetch a catalogue and keep it, without making it the active one — what the
 * language picker calls before it reloads the page, so the reload comes back
 * with everything already in hand. */
const cacheLocaleMessages = (code) =>
  code === "en" ? Promise.resolve(null) : loadLocaleMessages(code);

/* Adopted **now**, at load, not from `i18nPreload` — every file after this one
 * builds constants out of `msg()` while it runs, and a catalogue that arrives
 * a tick later is a catalogue those files never saw. */
if (localeNeedsLoading()) {
  _localeMessages = readCachedMessages(activeLocale());
}

/* What tells Chrome's own translate prompt, and a screen reader, what language
 * it is looking at. Wrong or absent, a screen reader pronounces German with
 * English phonetics. */
const applyDocumentLanguage = () => {
  try {
    document.documentElement.setAttribute("lang", intlTag(activeLocale()));
  } catch {
    /* No document (a node test). Nothing to label. */
  }
};

/* `$1`-style placeholders, Chrome's own convention, so one catalogue serves
 * both paths. Substitution is positional and done here for the loaded case
 * because `chrome.i18n.getMessage` does it for the other one. */
const applySubs = (text, subs) => {
  if (!subs || !subs.length) return text;
  return text.replace(/\$(\d+)/g, (whole, n) => {
    const v = subs[Number(n) - 1];
    return v === undefined ? whole : String(v);
  });
};

/* The one function the rest of the app calls.
 *
 * `english` is not a default in the "if all else fails" sense — it is the
 * source string, and it is what ships in English builds. The lookup is what is
 * optional. */
const msg = (key, english, ...subs) => {
  if (_localeMessages) {
    const entry = _localeMessages[key];
    const message = entry && typeof entry.message === "string" ? entry.message : null;
    if (message) return applySubs(message, subs);
    /* A key the chosen catalogue does not carry: English, not a key name. */
    return applySubs(english, subs);
  }
  try {
    if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key, subs.map(String));
      if (message) return message;
    }
  } catch {
    /* Not an extension context. */
  }
  return applySubs(english, subs);
};

/* "Do not move things for me."
 *
 * One place, because three surfaces now ask it — the chart's morph, the
 * portfolio's mode fade and the stats row's arrival — and three copies of a
 * media query is three chances for one of them to keep animating after the
 * others stop. Wrapped, because `matchMedia` is absent in a test sandbox and
 * a preference nobody can read is not a preference to obey. */
const prefersReducedMotion = () => {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
};

/* ---- Numbers, dates and ages -------------------------------------------
 *
 * This half carries no translation debt and is worth more than the strings:
 * the app formats every number and date as en-US today, so a German install
 * reads `Aug 12, 12:52 PM` and `1,234.56` however Chrome is set. Routing them
 * through `Intl` with the active locale makes the tab read as local even while
 * every word on it is still English.
 *
 * The formatters are cached because `Intl.NumberFormat` construction is the
 * expensive part — this page formats a few hundred numbers per refresh. */
const _intlCache = new Map();
const intlFormatter = (kind, options) => {
  const key = `${kind}:${activeLocale()}:${JSON.stringify(options || {})}`;
  let f = _intlCache.get(key);
  if (f) return f;
  const tag = intlTag(activeLocale());
  try {
    f =
      kind === "number"
        ? new Intl.NumberFormat(tag, options)
        : kind === "date"
          ? new Intl.DateTimeFormat(tag, options)
          : kind === "list"
            ? new Intl.ListFormat(tag, options)
            : new Intl.RelativeTimeFormat(tag, options);
  } catch {
    f =
      kind === "number"
        ? new Intl.NumberFormat("en", options)
        : kind === "date"
          ? new Intl.DateTimeFormat("en", options)
          : kind === "list"
            ? new Intl.ListFormat("en", options)
            : new Intl.RelativeTimeFormat("en", options);
  }
  _intlCache.set(key, f);
  return f;
};

const localeNumber = (value, options) => {
  const n = Number(value);
  if (!isFinite(n)) return "";
  return intlFormatter("number", options).format(n);
};

const localeDate = (when, options) => {
  const d = when instanceof Date ? when : new Date(when);
  if (isNaN(d.getTime())) return "";
  return intlFormatter("date", options).format(d);
};

/* Which of the three separator styles this locale actually writes, asked of
 * `Intl` rather than guessed from a country list: a thousands separator that
 * is a space (`fr`, `ru`) is a real third case and is already one of the three
 * options this app offers.
 *
 * It exists so the number-format setting can have an **Auto** value that means
 * the same thing the theme's Auto means — follow the browser — instead of
 * every install outside the US having to find the setting. */
const localeSeparatorFormat = () => {
  let parts;
  try {
    parts = intlFormatter("number", { useGrouping: true }).formatToParts(1234567.5);
  } catch {
    return "us";
  }
  const group = (parts.find((p) => p.type === "group") || {}).value || ",";
  const decimal = (parts.find((p) => p.type === "decimal") || {}).value || ".";
  if (decimal === ",") return "eu";
  /* Narrow no-break space (U+202F), no-break space (U+00A0) and a plain space
   * all mean the same thing to a reader and are three different code points to
   * a comparison. Written as escapes, not as the characters: an invisible
   * literal in a regex is a character nobody reviewing this file can see. */
  if (/[\s\u00a0\u202f\u2009]/.test(group)) return "space";
  return "us";
};

/* An age, in the reader's language: `5h ago`, `vor 5 Std.`, `5 sa. önce`.
 * Chooses its own unit — a headline four days old should not be read in
 * hours — and the numeric:"auto" form lets a locale say "yesterday" where it
 * has a word for it. */
const localeRelativeTime = (ms) => {
  const seconds = Math.round(Number(ms) / 1000);
  if (!isFinite(seconds)) return "";
  const abs = Math.abs(seconds);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  const [unit, size] = units.find(([, s]) => abs >= s) || ["second", 1];
  const value = Math.round(seconds / size);
  try {
    return intlFormatter("relative", { numeric: "auto" }).format(value, unit);
  } catch {
    return "";
  }
};
