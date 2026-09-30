// Settings tests: the search filter, and the promise that every control
// actually goes through it (a setting added without the wrapper would be
// invisible to search — a silent hole rather than a visible bug).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const tagged = (name) => {
  const fn = (...args) => fn;
  fn.attrs = () => tagged(name);
  return new Proxy(fn, {
    get: (t, p) => (p in t ? t[p] : tagged(name)),
    apply: () => tagged(name),
  });
};
const styledStub = new Proxy(function styled() { return tagged("styled"); }, {
  get: (t, p) => (p === "default" ? styledStub : tagged(p.toString())),
  apply: () => tagged("styled"),
});

const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number, String,
  Boolean, Symbol, Proxy, RegExp, Error, parseInt, parseFloat, isFinite, isNaN,
  setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  styled: styledStub,
  keyframes: tagged("keyframes"),
  css: tagged("css"),
  /* Defined in theme.js, which these sandboxes do not load. Anything
   * interpolated into a styled block by every file has to be stubbed
   * here too, or the file throws before a single assertion runs. */
  themedScrollbar: "",
  touchTarget: "",
  touchBox: "",
  besideScreenSpine: "",
  refusedField: "",
  React: {
    Component: class {},
    createElement: () => null,
    Fragment: Symbol("Fragment"),
    Children: { toArray: (c) => (Array.isArray(c) ? c : [c]) },
  },
  PureComponent: class {},
  createRef: () => ({ current: null }),
  window: { matchMedia: () => ({ matches: false }) },
  debounce: (fn) => fn,
  _defineProperty: (obj, key, value) => {
    obj[key] = value;
    return obj;
  },
};
vm.createContext(sandbox);
const base = path.join(__dirname, "..", "src");
// Same order as index.html — settings.js reads DEFAULT_WIDGET_SIZE and
// WIDGET_SIZE_OPTIONS from widgets-data.js at definition time
for (const f of ["storage.js", "i18n.js", "config.js", "widgets-data.js", "shortcuts.js", "settings.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);

/* ── search filter ──────────────────────────────────────────────────────── */

const matches = (q, title, keywords) =>
  run(`matchesSetting(${JSON.stringify(q)}, ${JSON.stringify(title)}, ${JSON.stringify(keywords || "")})`);

// An empty search shows everything — the panel's normal state
assert.strictEqual(matches("", "Chart Color"), true, "no query shows every setting");
assert.strictEqual(matches("   ", "Chart Color"), true, "whitespace is not a query");

assert.strictEqual(matches("chart", "Chart Color"), true, "matches the title");
assert.strictEqual(matches("CHART", "Chart Color"), true, "case-insensitive");
assert.strictEqual(matches("color", "Chart Color"), true, "matches a later word");

// Words can be typed in any order and partially — "chart col" should find it
assert.strictEqual(matches("chart col", "Chart Color"), true, "all words must appear, partials count");
assert.strictEqual(matches("col chart", "Chart Color"), true, "order doesn't matter");
assert.strictEqual(matches("chart theme", "Chart Color"), false, "a word that doesn't appear excludes it");

// Keywords catch the words people actually reach for
assert.strictEqual(matches("colour", "Chart Color", "green red fill colour"), true, "British spelling via keywords");
assert.strictEqual(matches("ohlc", "Chart Details", "ohlc volume crosshair"), true, "jargon via keywords");
assert.strictEqual(matches("volume", "Chart Details", "ohlc volume crosshair"), true, "second keyword");
assert.strictEqual(matches("zzz", "Chart Details", "ohlc volume"), false, "nonsense matches nothing");

// Missing pieces must not throw — the panel renders on every keystroke
assert.strictEqual(matches("x", null, null), false, "no title, no keywords");
assert.strictEqual(matches(null, "Chart Color"), true, "null query behaves as empty");

/* ── every control is searchable ─────────────────────────────────────────
 * The preferences tab renders each control through panel.section(), which is
 * what search filters on. One added directly would still work but would
 * never be findable, so the count is asserted rather than trusted.
 */
const prefs = fs.readFileSync(`${base}/settings-preferences.js`, "utf8");
const wrapped = (prefs.match(/panel\.section\(/g) || []).length;
assert.ok(wrapped >= 11, `expected every preference control to be wrapped, found ${wrapped}`);

/* ── The three ways this tab breaks quietly as it grows ─────────────────
 *
 * None of these is a bug today; all three are one keystroke away, and none
 * would announce itself. The groups at the foot of `settings-preferences.js`
 * are a list of *names*, which is what makes reordering the panel eight lines
 * instead of forty — and it is also what makes a typo invisible to everything
 * except a person opening the tab.
 */

// 1. A group naming a section that does not exist takes the panel down with
//    it: `sections[name]()` on undefined throws inside render, and the whole
//    Preferences tab goes blank rather than losing one row.
const sectionNames = (prefs.match(/^ {4}(\w+): \(\) =>/gm) || []).map((m) =>
  m.trim().replace(/: \(\) =>$/, ""),
);
const grouped = [];
/* Since 26 Sep 2026 the groups are `preferenceGroups`, one entry per
 * section of Settings' menu, each listing its settings through `build(…)`.
 * What is read is still the list in the brackets (or the named constant). */
/* `keyed(…)` is `build(…)` keeping each row's key, for the chart's headings
   (27 Sep 2026) — the same list, read the same way. */
for (const block of prefs.match(/(?:build|keyed)\((?:\[[\s\S]*?\]|[A-Z_]+)\)/g) || []) {
  /* A group's list is usually written out in the brackets. One of them is a
     named constant instead — `CHART_SETTING_KEYS`, because the drawer beside
     the chart reads the same nine — so the name is resolved from its own
     declaration rather than the list being copied here. Missing that, the
     nine chart settings read as orphans and this file failed on a change
     that was correct. */
  const named = block.match(/\(([A-Z_]+)\)$/);
  const list = named
    ? (prefs.match(new RegExp(`const ${named[1]} = \\[([\\s\\S]*?)\\];`)) || [])[1] || ""
    : block.slice(block.indexOf("["));
  for (const q of list.match(/"(\w+)"/g) || []) grouped.push(q.slice(1, -1));
}
assert.ok(sectionNames.length >= 15, `expected the sections to be found, got ${sectionNames.length}`);
const unknown = grouped.filter((n) => !sectionNames.includes(n));
assert.deepStrictEqual(unknown, [], `a group names a section that does not exist: ${unknown}`);

// 2. …and a section in no group is built, kept in memory, and never shown.
const orphans = sectionNames.filter((n) => !grouped.includes(n));
assert.deepStrictEqual(orphans, [], `a setting exists but is in no group: ${orphans}`);

// 3. A setting placed twice renders twice, and the second copy silently
//    disagrees with the first about where it lives.
const twice = grouped.filter((n, i) => grouped.indexOf(n) !== i);
assert.deepStrictEqual(twice, [], `a setting is placed in more than one group: ${twice}`);

/* ── A key that works but is not advertised does not exist ──────────────
 *
 * The codebase guide states the rule and nothing enforced it: the "?" list is what
 * tells anyone a shortcut is there, so a key handled in `handleKeyDown` and
 * missing from `SHORTCUT_GROUPS` is a feature only its author can reach.
 * Letters only — Esc, the arrows and the digits are described in the list in
 * words rather than one chip per key, and a mapping table for those would rot
 * faster than the thing it guards.
 */
{
  const appSrc = fs.readFileSync(path.join(base, "app.js"), "utf8");
  const from = appSrc.indexOf('_defineProperty(this, "handleKeyDown"');
  assert.ok(from > 0, "handleKeyDown is where the keys are read");
  const to = appSrc.indexOf('_defineProperty(this, "handleVisibilityChange"', from);
  const body = appSrc.slice(from, to > from ? to : from + 30000);
  const handled = [
    ...new Set((body.match(/e\.key === "[a-z]"/g) || []).map((m) => m.slice(-2, -1).toUpperCase())),
  ].sort();
  const shortcutsSrc = fs.readFileSync(path.join(base, "shortcuts.js"), "utf8");
  const listed = new Set();
  for (const block of shortcutsSrc.match(/keys: \[[^\]]*\]/g) || []) {
    for (const q of block.match(/"[A-Z]"/g) || []) listed.add(q.slice(1, -1));
  }
  assert.ok(handled.length >= 8, `expected the chart's letter keys, found ${handled}`);
  const unlisted = handled.filter((k) => !listed.has(k));
  assert.deepStrictEqual(unlisted, [], `handled but missing from the "?" list: ${unlisted}`);
  const phantom = [...listed].filter((k) => !handled.includes(k)).sort();
  assert.deepStrictEqual(phantom, [], `advertised but no longer handled: ${phantom}`);
}

/* The tab is a plain function, not a method, so `this` in it is the global
 * object. It reached for `this.setState` in the search box's onChange and every
 * keystroke threw — the box took no text at all. Nothing in this file can
 * render it, so the promise is asserted on the source: state goes through the
 * `panel` it was handed. */
/* Comments stripped first, or the note explaining the bug reads as the bug.
 * The test is on `this.` — a member access — not on the word: the settings
 * notes are prose, and prose says "this setting" and "this governs the plain
 * chart". `this.setState` is the shape that actually threw. */
const prefsCode = prefs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
assert.ok(
  !/\bthis\s*[.[]/.test(prefsCode),
  "the preferences tab must not reach through `this` — it has no receiver",
);
/* The search box itself moved to the head of Settings' menu on 26 Sep 2026,
 * inside the SettingsPanel class, where `this` is the panel. It is asserted
 * there: the one place that writes the query. */
assert.ok(
  /this\.setState\(\{ query: e\.target\.value \}\)/.test(
    fs.readFileSync(path.join(__dirname, "..", "src", "settings.js"), "utf8"),
  ),
  "the search box writes the query through the panel",
);

/* ── modes ──────────────────────────────────────────────────────────────── */
/* A mode is recognised from the settings rather than remembered, so this is the
 * function the row's active pill depends on. It has to be exact: a row that
 * claims Minimal while the ticker is back on is worse than no row.
 */
const modes = run("APP_MODES");
const active = (settings, widgets) => {
  sandbox.__settings = settings;
  sandbox.__widgets = widgets;
  return run("activeAppMode(__settings, __widgets)");
};
const noWidgets = run("({ ...DEFAULT_WIDGETS })");

/* ── Custom: a slot, not a recipe ──────────────────────────────────────────
 *
 * The other four modes are written down in `config.js` and can be tested
 * against themselves. Custom holds whatever was saved into it, so what is
 * worth pinning is the two ways it can lie: lighting up when nothing has been
 * saved, and failing to light when the arrangement on screen is exactly the
 * one that was.
 *
 * The first is the one that matters. An unsaved Custom that reads as active
 * would tell someone their arrangement is safe when there is nothing behind
 * the button, and they would find out by pressing another mode.
 */
{
  const matches = (settings, widgets, saved) => {
    sandbox.__s = settings;
    sandbox.__w = widgets;
    sandbox.__saved = saved;
    return run("matchesCustomMode(__s, __w, __saved)");
  };
  const arrangement = { quietChrome: true, chartGrid: false, refreshInterval: 30000 };

  assert.strictEqual(
    matches(arrangement, noWidgets, null),
    false,
    "an empty slot never matches — Custom must not light before anything is saved",
  );
  assert.strictEqual(
    matches(arrangement, noWidgets, { settings: {}, widgets: {} }),
    false,
    "…nor does a slot saved with no settings in it",
  );
  assert.strictEqual(
    matches(arrangement, noWidgets, { settings: arrangement, widgets: noWidgets }),
    true,
    "the arrangement it was saved from matches it",
  );
  assert.strictEqual(
    matches(
      { ...arrangement, quietChrome: false },
      noWidgets,
      { settings: arrangement, widgets: noWidgets },
    ),
    false,
    "…and one setting changed by hand puts it out, like every other mode",
  );
  /* Widgets are half of an arrangement. Compared as booleans on both sides, so
   * a slot saved before a widget existed does not stop matching the moment
   * that widget ships turned off. */
  assert.strictEqual(
    matches(
      arrangement,
      { ...noWidgets, fearGreed: true },
      { settings: arrangement, widgets: noWidgets },
    ),
    false,
    "turning a widget on puts it out too",
  );
  assert.strictEqual(
    matches(arrangement, noWidgets, { settings: arrangement, widgets: {} }),
    true,
    "…while a widget absent on one side and off on the other still matches",
  );
}

/* Every key a mode governs is discovered from the modes themselves, so save
 * and restore cannot cover different ground from the recipes. */
{
  const keys = run("MODE_SETTING_KEYS");
  const named = new Set(
    modes.reduce((all, m) => all.concat(Object.keys(m.settings)), []),
  );
  assert.strictEqual(
    keys.slice().sort().join(","),
    [...named].sort().join(","),
    "MODE_SETTING_KEYS is exactly what the modes name, not a second hand-written list",
  );
}

assert.ok(modes.length >= 3, "there are modes to pick from");
assert.ok(
  modes.every((m) => m.value && m.label && m.desc && m.settings),
  "every mode has a name, a label, a description and settings",
);
/* None of them touches currency, number format or theme: those are yours
 * whatever you use the tab for, and a mode that took them would be a mode
 * people learn not to press. */
for (const mode of modes) {
  for (const key of ["currency", "decimalPlaces", "separatorFormat", "theme"]) {
    assert.ok(
      !(key in mode.settings),
      `${mode.value} must not set ${key}`,
    );
  }
  // Nor calls: turning them off would hide a record someone made
  assert.ok(!("predict" in mode.settings), `${mode.value} must not touch calls`);
}

/* Each mode has to be recognised as *itself*, which is not free: a mode that
 * names fewer settings than another can be a subset of it, and then applying
 * one lights up the other's pill. Fast was exactly that — with no chart
 * settings of its own it was Trader with the widgets off. */
for (const mode of modes) {
  const widgets =
    mode.widgets && mode.widgets !== "none"
      ? run(`({ ...DEFAULT_WIDGETS, ...WIDGET_PRESETS.${mode.widgets} })`)
      : noWidgets;
  assert.strictEqual(
    active(mode.settings, widgets),
    mode.value,
    `${mode.value} must be recognised as itself, not as another mode`,
  );
}

const minimal = modes.find((m) => m.value === "minimal");
assert.ok(minimal, "Minimal is one of them");
assert.strictEqual(
  active(minimal.settings, noWidgets),
  "minimal",
  "its own settings are recognised as it",
);
// One switch away is your own arrangement, not a lie about the mode
assert.strictEqual(
  active({ ...minimal.settings, pageTicker: true }, noWidgets),
  null,
  "flip one setting by hand and no mode claims to be in force",
);
// Widgets count: a mode that turns them all off is not on with six on screen
assert.strictEqual(
  active(minimal.settings, { ...noWidgets, fearGreed: true }),
  null,
  "…and a widget on screen contradicts a mode that turns them off",
);
// A mode that names a bundle wants that bundle, not merely no widgets
const trader = modes.find((m) => m.value === "trader");
assert.strictEqual(
  active(trader.settings, noWidgets),
  null,
  "a bundled mode is not in force with the bundle off",
);
assert.strictEqual(
  active(trader.settings, run("({ ...DEFAULT_WIDGETS, ...WIDGET_PRESETS.trader })")),
  "trader",
  "…and is in force with it on",
);
assert.strictEqual(active({}, noWidgets), null, "no settings, no mode");

/* Holder is the only mode that turns the headline row on, so it is the only
 * one that may name what the row carries. */
const holder = modes.find((m) => m.value === "holder");
const holderWidgets = run("({ ...DEFAULT_WIDGETS, ...WIDGET_PRESETS.holder })");
assert.strictEqual(
  holder.settings.newsFilter,
  "portfolio",
  "Holder narrows the headline row to what you hold",
);
for (const other of modes.filter((m) => m.value !== "holder")) {
  assert.ok(
    !("newsFilter" in other.settings),
    `${other.value} switches the headline row off, so it must not name a filter for it`,
  );
}
assert.strictEqual(
  active(holder.settings, holderWidgets),
  "holder",
  "Holder is recognised with the filter it names",
);
assert.strictEqual(
  active({ ...holder.settings, newsFilter: "all" }, holderWidgets),
  null,
  "…and widening the filter by hand makes the arrangement yours again",
);

/* ── every setting a mode names is actually read off state ──────────────
 *
 * The check above cannot see this: it calls `activeAppMode` with its own
 * object, while the app builds a snapshot from state. A setting named by a
 * mode and missing from that snapshot is compared against `undefined` for
 * ever, so the mode's pill simply never lights — nothing throws, nothing looks
 * wrong, and the only symptom is a row that has quietly stopped working. Same
 * shape of guard as the shortcut-list check below, and for the same reason:
 * two lists that must agree, kept in two files.
 *
 * It reads `modeSnapshot` rather than the call site. The snapshot used to be
 * written inline inside `activeAppMode(...)` and was then needed in a second
 * place — saving the Custom slot — so it became a method; this check caught
 * the move immediately, which is the check working. There is only one snapshot
 * now, so both readers are covered by testing it.
 */
{
  const src = fs.readFileSync(`${base}/app.js`, "utf8");
  const at = src.indexOf('_defineProperty(this, "modeSnapshot"');
  assert.ok(at > 0, "app.js builds one snapshot of the settings a mode governs");
  const snapshot = src.slice(at, src.indexOf("}));", at));
  assert.ok(
    /activeAppMode\(this\.modeSnapshot\(\)/.test(src),
    "…and the row is drawn from that snapshot, not from a second copy",
  );
  assert.ok(
    /saveCustomMode\(this\.modeSnapshot\(\)/.test(src),
    "…and so is the Custom slot, so the two can never cover different ground",
  );
  const named = new Set(modes.flatMap((m) => Object.keys(m.settings)));
  // `handleAppMode`'s map is the other half: a named setting with no handler
  // is a value a mode promises to set and then does not
  const applyAt = src.indexOf("const apply = {");
  const applyMap = src.slice(applyAt, src.indexOf("};", applyAt));
  for (const key of named) {
    assert.ok(
      new RegExp(`\\b${key}:`).test(snapshot),
      `${key} is named by a mode but never sent to activeAppMode — its pill cannot light`,
    );
    assert.ok(
      new RegExp(`\\b${key}:`).test(applyMap),
      `${key} is named by a mode but has no handler in handleAppMode — picking the mode would not set it`,
    );
  }
}

// Section titles are unique, otherwise a search would surface two identical
// looking rows and the tally would be misleading
const titles = [...prefs.matchAll(/panel\.section\(\s*\n\s*'([^']+)'/g)].map((m) => m[1]);
assert.strictEqual(
  new Set(titles).size,
  titles.length,
  `duplicate setting titles: ${titles.join(", ")}`,
);

/* ── shortcut list matches the handlers ──────────────────────────────────
 * The list is what we advertise; app.js is what actually runs. A shortcut
 * that drifts out of the code would be a lie in the UI, so every key in the
 * list has to appear in the key handler.
 */
const appSrc = fs.readFileSync(`${base}/app.js`, "utf8");
const handler = appSrc.slice(
  appSrc.indexOf('_defineProperty(this, "handleKeyDown"'),
  appSrc.indexOf('_defineProperty(this, "handleThemeChange"'),
);
/* The derivatives market's keys (P8, 19 Sep 2026) are the page's own and
 * are handled by `pageKey` in practice-page.js, not by the app's handler —
 * the app's keys stand down behind an open panel. Same rule, the file that
 * actually runs them. */
const pageSrc = fs.readFileSync(`${base}/practice-page.js`, "utf8");
const pageHandler = pageSrc.slice(pageSrc.indexOf("pageKey: (e) =>"), pageSrc.indexOf("focusContract: (pos, close) =>"));
const pageGroup = run("SHORTCUT_GROUPS").find((g) => g.title === "Derivatives market");
assert.ok(pageGroup && pageHandler.length > 200, "the derivatives market's keys are listed, and handled by pageKey");
for (const key of pageGroup.items.flatMap((i) => i.keys)) {
  if (key === "–") continue;
  const needle = { "1": 'k >= "1"', "4": 'k <= "4"', Enter: '"Enter"' }[key] || `"${key}"`;
  assert.ok(
    pageHandler.includes(needle) || pageHandler.includes(`"${key.toLowerCase()}"`),
    `derivatives shortcut "${key}" is advertised but not handled in practice-page.js`,
  );
}
/* The terminal's focused controls (27 Sep 2026): the chart's keyboard
 * cursor and the seams in practice-page.js, the book's levels in
 * alerts-futures.js. Each arrow listed has to be read in one of them. */
const focusGroup = run("SHORTCUT_GROUPS").find((g) => g.title === "Derivatives market — on a focused control");
assert.ok(focusGroup, "the terminal's focused keys are listed");
const terminalSrc = pageSrc + fs.readFileSync(`${base}/alerts-futures.js`, "utf8");
const arrowName = { "←": "ArrowLeft", "→": "ArrowRight", "↑": "ArrowUp", "↓": "ArrowDown" };
for (const key of focusGroup.items.flatMap((i) => i.keys)) {
  assert.ok(terminalSrc.includes(`"${arrowName[key] || key}"`), `terminal key "${key}" is advertised but not read by any focused control`);
}
const advertised = run("SHORTCUT_GROUPS")
  .filter((g) => g !== pageGroup && g !== focusGroup && g.title !== "Derivatives market")
  .flatMap((g) => g.items.flatMap((i) => i.keys));
const handled = {
  "←": "ArrowLeft",
  "→": "ArrowRight",
  Esc: "Escape",
  "1": 'e.key >= "1"',
  "6": 'e.key <= "6"',
  // The space bar is a key like any other, but its name is a literal space
  Space: 'e.key === " "',
};
/* A modifier held through a gesture is read by the gesture, not by the key
   handler: Shift + drag is the ruler (29 Sep 2026), read on the press in
   chart-viewport.js. It is advertised all the same, and must be read there. */
const gestures = { Shift: [fs.readFileSync(`${base}/chart-viewport.js`, "utf8"), "e.shiftKey"] };
for (const key of advertised) {
  if (key === "–") continue; // a range dash, not a key
  if (gestures[key]) {
    assert.ok(gestures[key][0].includes(gestures[key][1]), `gesture "${key}" is advertised but its gesture never reads it`);
    continue;
  }
  const needle = handled[key] || `"${key}"`;
  assert.ok(
    handler.includes(needle) || handler.includes(`"${key.toLowerCase()}"`),
    `shortcut "${key}" is advertised but not handled in app.js`,
  );
}

/* ── widgets don't fetch what they don't show ────────────────────────────
 * Two easy regressions to reintroduce: fetching a widget the user has
 * hidden, and re-adding a second request for data another widget already
 * pulls. Both are invisible at runtime — the panel looks identical — so
 * they're asserted against the source.
 */
const appWidgets = appSrc.slice(
  appSrc.indexOf('_defineProperty(this, "fetchWidgets"'),
  appSrc.indexOf('_defineProperty(this, "hideWidget"'),
);
assert.ok(
  appWidgets.includes("hiddenWidgets"),
  "widget fetching must skip widgets the user has hidden",
);
assert.ok(
  appWidgets.includes("Promise.all"),
  "widget requests are independent and should run together, not in sequence",
);

const widgetsSrc = fs.readFileSync(`${base}/widgets-data.js`, "utf8");
const altSeason = widgetsSrc.slice(
  widgetsSrc.indexOf("const fetchAltcoinSeason"),
  widgetsSrc.indexOf("const fetchAltcoinSeason") + 900,
);
assert.ok(
  altSeason.includes("fetchCoinloreGlobal"),
  "altcoin season must reuse the shared global fetch",
);
assert.ok(
  !altSeason.includes("COINLORE_GLOBAL_API"),
  "and must not request that endpoint a second time itself",
);

console.log("SETTINGS TESTS OK");
