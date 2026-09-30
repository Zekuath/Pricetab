# Architecture

How PriceTab is put together, for anyone about to change it. The README says
what the extension does; this file says where each part lives, the rules the
code keeps, and the reason behind each rule. The tests enforce most of them —
[tests/README.md](../tests/README.md) lists what each suite holds.

## The shape of it

PriceTab is a Manifest V3 Chrome extension whose whole interface is one page:
`index.html`, set as the new tab. A second, much smaller page, `popup.html`,
is the toolbar button's popup.

- **No build step.** The 57 files in `src/` are plain JavaScript loaded by
  ordered `<script>` tags. Edit a file, reload the extension, open a tab.
- **One global scope.** Classic scripts share it, so files do not import or
  export anything. A file may *execute* a reference only to a binding from a
  file loaded before it; a function body may call anything, because it runs
  after every file has loaded. `index.html`'s order is the dependency order.
- **Everything is vendored.** React 16.5, ReactDOM, styled-components 3.4.6, a
  custom D3 bundle holding only the modules the chart uses, and
  d3-interpolate-path live in `vendor/`, with the font and the CSS reset. The
  page makes no request for code or styles.
- **Zero permissions at install.** `permissions` is empty. Two things are
  optional and asked for only from a button inside the app: host access to
  eight newsroom feeds, and `notifications` for the alarm.

```
index.html            the new tab — loads vendor/ then src/ in order
popup.html            the toolbar popup — src/popup.js and four shared files, no React
manifest.json
src/                  the application (below)
vendor/               React, ReactDOM, styled-components, D3, the font
_locales/             thirteen message catalogues; en is generated from src/
assets/               icons, store images, the screenshot pipeline
tests/                every suite, and the dev-only dependencies
scripts/              packaging, catalogue extraction, the sanctions list build, probes
ios/                  the iPhone build: the same page in a WKWebView, plus a widget
site/                 the promotional page (GitHub Pages; not shipped)
docs/                 this file, the changelog, the privacy policy, the roadmap, the store listing
```

## `src/`, in load order

| Layer | Files | What they hold |
|---|---|---|
| **Before React** | `theme-init.js` | Sets the theme class before anything paints, so a dark tab never flashes white |
| **Foundations** | `theme.js`, `icons.js` | Colour palettes, spacing, the shared scrollbar and touch-target styles; inline SVG icons |
| **Data** | `api.js` | Every fetcher, every cache and its persistence, the price providers and their failover, the news archive |
| **Storage and language** | `storage.js`, `i18n.js` | Validated `localStorage` readers and writers, the sanitizers, the settings backup; `msg()` and the locale formatters |
| **Configuration** | `config.js`, `widgets-data.js`, `sanctions.js` | Coins, currencies, ranges, storage keys, defaults; the widget definitions and their fetchers; the bundled OFAC address list |
| **Pure logic** | `utils.js`, `outlook.js`, `regime-grid.js` | Formatting, statistics, base rates, XIRR, price scaling — no DOM |
| **The chart** | `chart-board.js`, `chart-axes.js`, `chart-tools.js`, `chart-studies.js`, `chart.js`, `chart-controls.js`, `chart-image.js`, `chart-viewport.js` | The board's geometry; the price scale and the time axis; the ruler and the drawings; the counted studies; the D3 drawing; the range switcher and the price readout; saving the chart as an image; the window in time (zoom, pan and the finer candles a narrow window asks for) |
| **Settings** | `styles-*.js`, `settings-preferences.js`, `settings-permissions.js`, `settings.js`, `chart-settings.js`, `onboarding.js` | The Settings screen, the chart's own drawer, the first-run tour |
| **Portfolio** | `portfolio-chart.js`, `portfolio-contribution.js`, `tax-world.js`, `tax-report.js`, `portfolio-ledger.js`, `tax-guide.js`, `portfolio.js` | Holdings, lots, sales and income; the charts; the ledger views; the tax guide's data, engine and screen |
| **Derivatives practice** | `practice-math.js`, `practice-model.js`, `assistant.js`, `styles-practice.js`, `alerts-futures.js`, `practice-page.js` | Integer money arithmetic; the account as a pure model with a ledger; the page |
| **Targets, calls, news** | `notify.js`, `alerts.js`, `news.js` | The optional alarm; price targets and the calls record; the news panel |
| **Base rates** | `candle-patterns.js`, `price-patterns.js`, `strategy-setups.js`, `baserates.js` | Named states and setups on daily candles, and the panel that counts what followed them |
| **The root** | `shortcuts.js`, `app-*.js`, `app.js` | The keyboard map; the root component's handlers, split by area; `CryptoChart` and the mount |

`popup.js` belongs to the popup and is not loaded by `index.html`.

## State

One class component, `CryptoChart` in `app.js`, owns the application's state:
the coin list and the current coin, the range, the currency, the theme, which
panels are open, the portfolio, the targets, the calls record, the practice
account and the news. Components below it receive what they draw as props.

Its handlers live in `app-portfolio.js`, `app-calls.js`, `app-alerts.js`,
`app-news.js`, `app-ticker.js`, `app-view.js` and `app-tools.js`, each a function that returns an object of
methods; the constructor attaches them with `Object.assign(this, …)`. This
kept one component's behaviour in reviewable files without changing how it
works.

Rules the code keeps, and why:

- **No hooks.** React 16.5 has none; code that uses them looks correct until it
  throws. An ast-grep rule rejects them.
- **Never mutate `this.state`.** Updates go through `setState`, in the
  functional form when they depend on the previous state. An ast-grep rule
  rejects direct mutation.
- **The ticker is a `PureComponent` boundary** around roughly two thousand
  steady nodes. Props passed into it must keep their identity when their
  content has not changed, or every unrelated update re-renders it.
- **Everything persisted is sanitized on load.** A stored shape is rebuilt
  field by field, so a field the sanitizer does not name disappears at the
  next load. Adding a field to a stored shape means adding it to its
  sanitizer in the same change.

## Persistence

Everything a person enters — coins, settings, holdings, targets, calls, the
practice account — is in `localStorage` under `crypto_chart_*` keys and never
leaves the browser.

- **Every write goes through `writeStorage()`.** When the browser refuses a
  write for space, it drops only the four disposable caches and retries.
  Anything a person typed is never evicted.
- **Only four files touch `localStorage` directly**; an ast-grep rule keeps it
  that way.
- **Caches persist too.** A new tab is a fresh page, so a cache kept only in
  memory would never be reused. Each cache has a debounced, capped write and a
  load that drops what its lifetime would reject. A price series is kept for a
  day so the chart paints instantly, and revalidated after its own range's
  lifetime — one point's worth of time, from 30 seconds for the last hour to
  six hours for all time.
- **The settings backup** walks storage rather than a list of known keys, so a
  new setting cannot be left out of it by being forgotten.

## Data

Every request goes to a public, keyless API, and every host is declared in
`ALLOWED_HOSTS` in `tests/test-invariants.js`. A request to an undeclared host
fails the suite — adding a provider is a deliberate act. The README's privacy
table lists each host and what it is used for.

- **Prices** come from Coinbase, with a per-coin failover to Kraken when
  Coinbase does not answer, and six coins routed to Kraken permanently.
- **Widget and news requests** go through one door, `politeFetch()`. A host
  that answers 429 or 403 is left alone for fifteen minutes, doubling to two
  hours, and the card says it is paused. A news source that has not answered
  in fifteen seconds is abandoned (`NEWS_SOURCE_TIMEOUT_MS`), so one silent
  host cannot hold the feed.
- **A hidden tab stops polling**, except for the price-target check while
  the tab-title announcement is on — that is what lets a hit be announced on
  a tab you are not looking at.
- **Link-only data.** The tax guide names official documents on many hosts;
  those are links a person may click, never requests the page makes, and the
  invariant suite forbids any request in that file.

## Drawing

The price chart is D3 inside a React component (`LineBase`, `chart.js`),
drawn into one SVG. Two rules hold it together:

- **Drawing is conditional; clearing is not.** Every layer is removed or
  hidden on every pass, whether or not it is drawn this time, so a feature
  switched off never leaves its last frame behind.
- **Nothing is created twice.** Nodes are pooled and reused between redraws.
  On a page that is open all day, an animation touches only `transform` and
  `opacity`, never SVG geometry.

Components are styled with styled-components 3.4.6, which differs from
current releases in ways that fail silently: `attrs` takes an object (the
callback form does nothing), refs are `innerRef`, and there is no `as` prop.
Every button declares its `type`.

## Language

`msg(key, english)` returns the string in the reader's language. The English
catalogue is generated from the calls in `src/` by
`scripts/i18n-extract.js`, so it cannot drift from the screen; the suite fails
when any of the thirteen catalogues misses a key or drops a placeholder. The
key must be a literal: a computed key is invisible to the extractor. A `$`
before a digit in a string is a placeholder.

## Testing

```bash
npm --prefix tests ci             # exact-pinned dev dependencies
npm --prefix tests run browsers   # the Chromium the render suites drive
npm --prefix tests run check      # lint + ast-grep rules + every suite
```

There is no type system, so three layers stand in for a compiler:

1. **ESLint**, whose `no-undef` knows every cross-file global because the
   configuration derives them from `src/`.
2. **ast-grep rules** in `.ast-grep/rules/` for what a regular expression gets
   wrong: hooks, state mutation, raw storage access.
3. **36 suites.** Pure logic runs in `node:vm` sandboxes with a stubbed
   network; the page runs in jsdom; seven suites drive real Chromium with
   every request answered from a fixture, because only a browser can say
   whether a path was drawn or a control can be reached by keyboard. One walks
   the derivatives model at random and checks after every move that its
   ledger still explains the account.

`tests/test-invariants.js` turns the project's promises into failures: no
permission at install, no remote code, no `eval`, no `innerHTML`, no
`console.log`, every source file loaded, every host declared.

## Packaging

`scripts/package.sh` builds the store upload — a folder and a zip — from an
allowlist rather than by zipping the tree, and checks the allowlist against
the files `index.html` loads, so a new source file that nobody added to it
fails the build instead of shipping a broken extension.

## Common changes

| To add | Do this |
|---|---|
| A source file | A `<script>` tag in `index.html` before the first file that uses it at load; the same file in every test sandbox that loads its neighbours; the packaging allowlist |
| A coin | `SUGGESTED_COINS` and `COIN_NAMES` in `config.js` |
| A currency | `CURRENCY_OPTIONS` in `config.js` |
| A setting | Its storage key and default in `config.js`, a loader in `storage.js`, a row in `settings-preferences.js`; a chart setting also goes in `CHART_SETTING_KEYS` |
| A keyboard shortcut | Handle it in `handleKeyDown` (`app.js`) **and** list it in `SHORTCUT_GROUPS` (`shortcuts.js`), which is what advertises it; the settings suite fails when a listed key is not handled, and every tab's tooltip names its key |
| A widget | `DEFAULT_WIDGETS`, `DEFAULT_WIDGET_ORDER` and `WIDGET_GROUPS` in `widgets-data.js` (the storage suite checks they name one set), its definition in `app.js`, and a fetch job if it needs data |
| A data provider | Its host in `ALLOWED_HOSTS` (`tests/test-invariants.js`) and in the README's privacy table |
| A string | `msg("a_new_key", "English text")`, then `node scripts/i18n-extract.js` and a translation for each catalogue. Changed English needs a new key, or the other languages keep the old meaning |
| A country's tax rule | The official document it comes from, as a source on the entry in `tax-world.js`; a new host must be a government domain or be named with its institution in the tax suite |
