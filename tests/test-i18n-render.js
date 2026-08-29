// Language, in a real browser — the half `test-i18n.js` cannot see.
//
// That suite checks the catalogues against each other: every offered language
// has a file, every file has the English key set, every placeholder survives
// translation. What it cannot check is whether any of it reaches the screen,
// and that is where this feature can fail silently: `chrome.i18n` is absent in
// jsdom, every call site carries its own English, and a completely disconnected
// `msg()` would render a perfect English page and pass everything.
//
// So this loads `index.html` in Chromium with Chrome's own i18n API faked to
// German — the shape a German install actually has — and asserts three things
// that are only true if the wiring works end to end:
//
//   1. `<html lang>` follows the resolved locale. It is what tells a screen
//      reader which phonetics to use and Chrome's translate prompt to stay
//      shut.
//   2. A control that goes through `msg()` says the German word. The gear's
//      title is the one that is always mounted.
//   3. Numbers follow the locale. The number format setting defaults to Auto,
//      so a German install must read `43.310,00` — a dot for thousands and a
//      comma for the decimal — with nothing configured.
//
// It also asserts the ordinary case is untouched: no `chrome` object at all
// (a file:// preview, a test sandbox) must render English and a US number,
// because that is the fallback every other suite here runs on.
//
// Skips (exit 0) when Playwright or its browser is absent, like the other
// render suites.
const fs = require("fs");
const path = require("path");

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const ROOT = path.join(__dirname, "..");
const INDEX = "file://" + path.join(ROOT, "index.html");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("• i18n render test skipped: playwright not installed");
  process.exit(0);
}

const NOW = Math.floor(Date.now() / 1000);
const PRICES = Array.from({ length: 120 }, (_, i) => ({
  price: (40000 + i * 25 + (i % 7) * 60).toFixed(2),
  time: NOW - (120 - i) * 3600,
}));

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(body),
});

const de = JSON.parse(
  fs.readFileSync(path.join(ROOT, "_locales", "de", "messages.json"), "utf8"),
);

let failures = 0;
const ok = (label) => console.log(`✔ ${label}`);
const fail = (label, detail) => {
  failures++;
  console.error(`✘ ${label}`);
  if (detail) console.error(`   - ${detail}`);
};

/* One page, either with Chrome's i18n API faked to a language or with no
 * `chrome` object at all. `addInitScript` runs before any of the page's own
 * scripts, which is the only place this can be installed: `src/i18n.js`
 * resolves the locale the moment it is first asked. */
const openPage = async (context, uiLanguage) => {
  const page = await context.newPage();
  if (uiLanguage) {
    /* Injected as source text, not as a function, which is this suite's house
     * idiom (see the AUDIT block in test-polish-render.js): code that runs in
     * the page is linted as Node here, so an arrow function referencing
     * `window` or `document` is a no-undef error in a file that is otherwise
     * plain Node. */
    await page.addInitScript(`(() => {
      const messages = ${JSON.stringify(de)};
      window.chrome = {
        i18n: {
          getUILanguage: () => ${JSON.stringify(uiLanguage)},
          /* Substitutes like the real thing. A fake that ignores the second
           * argument returns "$1 Price" verbatim and the page renders a raw
           * placeholder — which looks like a translation bug and is really a
           * lying test. Chrome resolves $1..$9 positionally from the
           * substitutions array, so this does too. */
          getMessage: (key, subs) => {
            const held = messages[key] && messages[key].message;
            if (!held) return "";
            const list = Array.isArray(subs) ? subs : subs == null ? [] : [subs];
            /* split/join rather than a regex, and that is not a style choice:
             * this block is injected as the source text of a template literal,
             * where a backslash escape is consumed before the page ever sees
             * it. A regex written here arrives mangled and the fake silently
             * stops substituting, which reads as a translation bug. No
             * backslash, no trap. */
            let out = held;
            for (let i = 0; i < list.length; i++) {
              out = out.split("$" + (i + 1)).join(String(list[i]));
            }
            return out;
          },
        },
        runtime: { getURL: (p) => p },
      };
    })()`);
  }
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForSelector("svg path", { timeout: 15000 });
  return page;
};

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  } catch (e) {
    console.log(`• i18n render test skipped: no browser binary (${e.message.split("\n")[0]})`);
    process.exit(0);
  }

  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("file://")) return route.continue();
    if (url.includes("/prices/") && url.includes("historic")) {
      return route.fulfill(json({ data: { prices: PRICES } }));
    }
    if (url.includes("/prices/") && url.includes("spot")) {
      return route.fulfill(json({ data: { amount: "43250.50", currency: "USD" } }));
    }
    return route.fulfill(json({ data: {} }));
  });

  // --- 1. a German Chrome ------------------------------------------------
  const german = await openPage(context, "de-DE");

  const lang = await german.getAttribute("html", "lang");
  if (lang === "de") ok("<html lang> follows the browser's language");
  else fail("<html lang> follows the browser's language", `got ${JSON.stringify(lang)}`);

  const gearTitle = await german.getAttribute("[data-tour='settings']", "title");
  if (gearTitle === de.chrome_settings.message) {
    ok(`a control that goes through msg() says "${gearTitle}"`);
  } else {
    fail(
      "a control that goes through msg() is translated",
      `the gear's title is ${JSON.stringify(gearTitle)}, expected ${JSON.stringify(
        de.chrome_settings.message,
      )} — msg() is not reaching the render`,
    );
  }

  /* The range high, with nothing configured: Auto resolves the separator style
   * from the locale, so German must read 43.310,00 rather than 43,310.00. Read
   * off the page rather than out of a formatter, because the number-format
   * setting is threaded through forty call sites and the one that matters is
   * the one under the chart. The stats row is also where the translated word
   * lands beside the localised number, which is the pair that has to agree. */
  const germanStats = await german.evaluate("document.body.innerText");
  if (/43\.310,00/.test(germanStats)) {
    ok("numbers follow the locale with nothing configured (43.310,00)");
  } else if (/43,310\.00/.test(germanStats)) {
    fail(
      "numbers follow the locale with nothing configured",
      "the figure reads 43,310.00 — the Auto number format did not resolve to the locale",
    );
  } else {
    fail("numbers follow the locale with nothing configured", "no range figure on the page");
  }

  /* Compared case-insensitively on purpose: the stat label is drawn with
   * `text-transform: uppercase`, and `innerText` reports what is rendered. */
  /* A message with a `$1` in it must come back with the value in place, not
   * with the placeholder on screen.
   *
   * Checked against **one known label** rather than by sweeping the page for
   * `$N`: a currency amount is a `$` followed by a digit too, so that sweep
   * flags "$2.809,92" and proves nothing. German's `chart_coin_price` is
   * "$1-Kurs", so a working substitution reads "BTC-Kurs" and a broken one
   * reads "$1-Kurs" verbatim. */
  const wantSubstituted = de.chart_coin_price.message.replace("$1", "BTC");
  const pageText = await german.evaluate("document.body.innerText");
  if (pageText.toUpperCase().includes(wantSubstituted.toUpperCase())) {
    ok(`placeholders are substituted ("${wantSubstituted}")`);
  } else if (pageText.includes(de.chart_coin_price.message)) {
    fail(
      "placeholders are substituted",
      `the raw message reached the screen: ${JSON.stringify(de.chart_coin_price.message)}`,
    );
  } else {
    fail("placeholders are substituted", `no ${JSON.stringify(wantSubstituted)} on the page`);
  }

  if (germanStats.toUpperCase().includes(de.stats_high.message.toUpperCase())) {
    ok(`the stats row is translated ("${de.stats_high.message}")`);
  } else {
    fail("the stats row is translated", `no "${de.stats_high.message}" in the page text`);
  }

  await german.close();

  // --- 2. no chrome object at all ---------------------------------------
  const plain = await openPage(context, null);
  const plainGear = await plain.getAttribute("[data-tour='settings']", "title");
  if (plainGear === "Settings") ok("with no chrome API the English at the call site is used");
  else fail("with no chrome API the English at the call site is used", `got ${JSON.stringify(plainGear)}`);

  const plainText = await plain.evaluate("document.body.innerText");
  if (/43,310\.00/.test(plainText)) {
    ok("an English browser still reads 43,310.00");
  } else {
    fail("an English browser still reads 43,310.00", "the fallback locale is not en");
  }

  /* The stats row fades its figures in rather than popping them into a row
   * that is already on screen. Asserted as "the rule exists and names an
   * animation", not by watching it: the animation is 260ms and finite, so by
   * the time this suite can look, `getAnimations()` is legitimately empty. */
  const animated = await plain.evaluate(`(() => {
    /* The stat item is the span that holds both halves — the label and the
     * figure — so it is the one with two element children. Its parent is the
     * row, and its children are the two halves; neither carries the rule. */
    const item = [...document.querySelectorAll("span")].find(
      (n) => n.children.length === 2 && /High|Low|Mkt Cap|VWAP/i.test(n.textContent || ""),
    );
    if (!item) return null;
    const name = getComputedStyle(item).animationName;
    return name && name !== "none" ? name : null;
  })()`);
  if (animated) ok(`the stats row's figures fade in (${animated})`);
  else fail("the stats row's figures fade in", "no animation on the stat item");

  await plain.close();

  /* --- 3. the language picker does not throw you out of Settings ---------
   *
   * Changing the language reloads the page, and a reload closes every panel.
   * Picking a language therefore used to close the panel you picked it in,
   * which reads as the app losing your place rather than as the setting being
   * applied. The flag that survives the reload is `sessionStorage`, so this
   * asserts the whole round trip rather than the flag. */
  const reopen = await context.newPage();
  await reopen.addInitScript(
    `sessionStorage.setItem("crypto_chart_reopen_settings", "preferences")`,
  );
  await reopen.goto(INDEX, { waitUntil: "load" });
  await reopen.waitForSelector("svg path", { timeout: 15000 });
  await reopen.waitForTimeout(800);

  const settingsBack = await reopen.evaluate(
    `Boolean([...document.querySelectorAll("*")].find((n) =>
      /^Preferences$/.test((n.textContent || "").trim()) && n.children.length === 0))`,
  );
  if (settingsBack) {
    ok("a language change comes back with Settings open on Preferences");
  } else {
    fail(
      "a language change comes back with Settings open on Preferences",
      "the panel did not reopen after the reload",
    );
  }

  /* And the flag is spent: a later reload must not reopen Settings again. */
  const spent = await reopen.evaluate(
    `sessionStorage.getItem("crypto_chart_reopen_settings")`,
  );
  if (spent === null) ok("the reopen flag is cleared once it has been used");
  else fail("the reopen flag is cleared once it has been used", `still ${JSON.stringify(spent)}`);

  await reopen.close();
  await browser.close();

  if (failures) {
    console.error(`\n${failures} I18N RENDER FAILURE(S)`);
    process.exit(1);
  }
  console.log("ALL I18N RENDER TESTS PASSED");
})();
