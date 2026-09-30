# Tests

Development-only regression tests for PriceTab. Nothing in this folder ships
with the extension or the store zip.

## Running

```bash
npm --prefix tests run check   # lint + ast-grep rules + every suite — the one that must be green
node tests/run-all.js          # the suites alone (syntax check first)
node tests/test-cache.js       # or any single suite
```

Dev dependencies are exact-pinned in `package.json` with a tracked
`package-lock.json`; CI installs them with `npm ci`:

```bash
npm --prefix tests ci            # one-time: eslint, ast-grep, jsdom, playwright
npm --prefix tests run browsers  # the Chromium the render suites drive
```

Without Playwright's browser the real-Chromium suites report *skipped* and
exit 0 — which means the rendering has **not** been tested. Without jsdom,
`test-smoke-jsdom.js` skips the same way.

## Suites, in the order `run-all.js` runs them

| File | Covers |
|------|--------|
| `test-invariants.js` | The codebase guide's prose as failing tests, with zero dependencies: nothing granted at install (and the optional lists closed), the new-tab override intact, no remote `<script>`/`<link>`, no `eval`, no `innerHTML`, no `console.log`, every `src/*.js` loaded by `index.html`, `updateTabTitle()` only inside `setTabTitle`, no `rem` in widget-card components, every remote host on the deliberate `ALLOWED_HOSTS` list, no credentials |
| `test-load.js` | All `src/*.js` execute cleanly in `index.html` script order (TDZ violations, duplicate declarations, load-order mistakes) |
| `test-storage.js` | The localStorage helpers: defaults, round trips, whitelist rejection, corrupt-JSON fallbacks for every setting; the "since your last visit" anchor rule; the settings backup (every `crypto_chart_*` key in one file, restore in two presses, undo); the widget lists naming one set |
| `test-i18n.js` | The thirteen catalogues against each other: every language has a file, every file carries the English key set, every `$1` placeholder survives translation; `scripts/i18n-extract.js --check` so a string added in `src/` cannot ship without its key |
| `test-api.js` | News fetchers and their parsing, the promo filter, the cross-source merge and clustering, the "what happened here?" archive, on-chain address lookups (balances, ERC-20 by contract, BTC history → dated deltas, stale-on-failure) and the per-coin page-ticker snapshot |
| `test-provider.js` | Which exchange a coin's prices come from, the runtime failover to Kraken on a network wall, and the coins routed there permanently |
| `test-cache.js` | The persistent price cache: hydrate on load, debounced persist, caps, per-range TTL, and the Date-revival regression (JSON turns Date fields into ISO strings; hydration must revive them or `scaleTime` renders a NaN path) |
| `test-bulk.js` | The Coinlore top-100 sweep: cache fill, currency conversion, duplicate-symbol dedupe, junk filtering, fallback signalling |
| `test-portfolio.js` | Holdings persistence with lots, sales, watched addresses and target shares; address → chain detection; lot maths under FIFO / LIFO / HIFO; `sanitizePortfolio`; the total-value series builder; the cost-basis CSV; XIRR; the sanctions check |
| `test-portfolio-chart.js` | The portfolio chart's arithmetic: which sample a moment lands on, event clustering, band assignment, the geometry the drawing is scaled to. The pixels are `test-portfolio-chart-render.js` |
| `test-onboarding.js` | The tour's steps stay well-formed and every `data-tour` selector anchors to a real element; show-once gate; navigation clamps and keys; a missing target skips instead of blocking |
| `test-settings.js` | Settings search (word order, partials, synonyms), the promise that every preference control is registered with the filter and has a unique title, and that every shortcut the "?" list advertises is handled in `app.js` |
| `test-chart.js` | The crosshair's nearest-point search against a brute-force scan, date labels, volume compaction, candlestick geometry and the candle-window table, the readout hiding on pointer-leave |
| `test-axes.js` | The chart's price and time ticks on the real d3 bundle (round steps, the log fallback, the label unit at a boundary), and the lane allocator: 300 random lanes, nothing overlapping, nothing outside, a fixed label never moved |
| `test-viewport.js` | The chart's window in time: the granularity a window asks for (never over 300 bars), zoom around an anchor, pan to either end, a window that follows the price, the series cut with interpolated edges, overlapping candles, move marks pointed again, and LTTB keeping the spike, the drop and both ends |
| `test-tools.js` | The chart's tools: the ruler's count (stretches, a fall counted like a rise, uneven spacing), how far a press is from a segment or a ray, a drawing moved by a drag on a linear and a log axis |
| `test-palette.js` | The palettes, read from `src/theme.js`: every ink a figure is set in clears 4.5:1 on both grounds, in both themes and both direction palettes; the focus ink clears 3:1; the blue/orange palette keeps up and down at least ΔE 60 apart under simulated protanopia and deuteranopia, twice what green and red manage, and keeps the comparison's line apart from up |
| `test-studies.js` | The chart's counted studies on hand-built series: volume by price (every unit placed, the busiest band, 70% around it), unusual volume (the one bar, its multiple, nothing under 30 bars), regime runs, where price has turned (a level three lows agree on, later visits counted, the base), where the price sits in each range |
| `test-practice-model.js` | The derivatives account's model, in Practice Units: **the ledger must explain the balance exactly**; open, reduce, close, liquidation, funding, fees, the risk ladder, resting orders, trailing stops, deposits and the schema migrations |
| `test-practice-fuzz.js` | The same model under a seeded random walk — opens, orders with their stop and take, moves, fills, triggers, margin in and out, deposits, reversals and gapping prices — asserting after every move that the ledger explains the account, nothing is negative or fractional, every level is on its side, and a save and a load change nothing (**it found the ledger's order id dropped on every reload**). `node tests/test-practice-fuzz.js 1500 120 777` for a long run |
| `test-tax-report.js` | The tax engine against cases worked by hand, each rule at its edge — the first four countries (below) and one case per kind of model the world data uses (Spain's brackets, Sweden's 70% losses, France's €305 sales limit and year rates, Portugal's 365 days, Australia's discount, Canada's average cost and inclusion, Indonesia's turnover, Brazil's monthly limit, Czechia, India, Poland's cost pool, Romania, South Africa, Colombia, Slovenia, Italy, Luxembourg, the Netherlands), then every country's model run on one record set: the anniversary is still inside "more than a year", the UK tax year turns on 6 April, HMRC's same-day → 30-day → Section 104 order, Germany's €1,000 Freigrenze as a threshold (at €1,000 all of it counts), FIFO recomputed whatever a sale was recorded under, no default rate for Türkiye, a record in another currency set aside and named, and Form 8949's columns in the file. Then the world data's own rule: every source of all 244 entries is an official host (a government domain or a named institution), an official entry names at least one, and an unconfirmed one claims nothing — no model, no notes, every event unknown |
| `test-portfolio-ledger.js` | The portfolio's ledger views: a partly sold purchase put back together as the one purchase it was, an undated record counted once, and the time-weighted return — a purchase or a sale is money moved, not a gain or a loss, while a coin received as income is return; months chained, and a month the range starts inside marked partial |
| `test-crowd.js` | The crowd reading: a long/short lean allowed only when its own record on the market says so — every case built so its answer is known before the function runs |
| `test-candle-patterns.js` | The fifteen candlestick shapes, each defined from a bar's body and wicks, on bars built so the answer is known before the function runs, then counted like any other base-rate state |
| `test-price-patterns.js` | Head and shoulders, its inverse, double tops and bottoms — found by rule on swing points, used only once confirmed, and followed to their measured target or invalidation — on hand-worked price paths |
| `test-strategy-setups.js` | The indicators behind the twelve strategy setups (averages, MACD, Bollinger, Donchian, Supertrend, ADX) on series whose values are known by hand, and each setup's state on a path built to contain exactly one of it |
| `test-regime-grid.js` | The Regimes card's nine cells: each entry into rising, flat or falling and the state twenty days on, beside every day's share, on hand-worked paths |
| `test-outlook.js` | The outlook: what the window's own history says about the next stretch, as counted readings |
| `test-assistant.js` | The assistant: a desk's checks as facts with their counts, in three phases, never a verdict |
| `test-quickswitch.js` | The "/" jumper's match and ranking: exact > prefix > substring, name search, owned coins first, the switch-vs-add flag |
| `test-alerts.js` | Price targets: storage validation, the hit rules (above/below, no re-firing, other-currency targets paused), the 1h/4h/24h move window stamped on the target, and the candle lookback that catches a target hit and reverted while no tab was open |
| `test-calls.js` | The calls record's storage rules: identity by real time rather than column index, the tally clamped to what could have happened, the newest surviving over the cap |
| `test-d3.js` | `vendor/d3-custom.min.js` exposes every d3 API the app uses |
| `test-smoke-jsdom.js` | The real page in jsdom with a fake network: the chart renders valid data cold and from cache, a hidden tab fires zero requests, switching coins in candlestick mode never blanks the chart |
| `test-render.js` | **Real Chromium.** Does the D3 path actually draw — the grid geometry, the square pitch, the comparison overlay, the call boxes |
| `test-calls-render.js` | Calls mode in a real browser: box placement, the axis under many squares, a locked call that cannot be replaced by a click, the drag of the "now" line |
| `test-modes-render.js` | Modes and the Preferences tab: the search box takes text, a mode moves its settings through their own switches, quiet controls fade and never lose pointer events |
| `test-polish-render.js` | The defects that neither throw nor look wrong: anything clickable is reachable by Tab and has a name, every button carries a `type`, every drawn attribute is a number, scrolling surfaces use the themed scrollbar, the ticker's `PureComponent` boundary holds, plus a bounded random walk over the derivatives page and dozens of state-machine edges in `app.js` |
| `test-i18n-render.js` | Language in a real browser: the catalogue reaches the screen, an override survives a reload, numbers and dates follow the locale |
| `test-portfolio-chart-render.js` | The portfolio chart's pixels: the three views, the stacked scale starting at zero, the markers, the crosshair |
| `test-transition-render.js` | What the chart does between two ranges: the line eases, the fill stays attached, the candles reshape rather than blink |
| `local-*.js` | Git-ignored suites that guard the local working notes (the agent rulebook is reachable, no local-only file is tracked) and a multi-contract walk. Picked up when present, absent in CI |

Not in the list on purpose: `sweep-erc20.js` asks every contract in
`ERC20_TOKENS` what it is over the network, so it is run by hand when a token
is added, never by `run-all.js`.

## Conventions

- Suites run app code inside `node:vm` sandboxes with stubbed
  `localStorage` / `fetch` — no network access. The browser suites drive
  Chromium with every request fulfilled from a fixture.
- Run **one browser suite at a time**. A failure from a concurrent run is
  unproven; re-run the suite alone before believing it.
- `run-all.js` prints one line per suite and hides a passing suite's output.
  Judge a run by the suite lines and the exit code.
- When asserting on objects created inside a vm context, compare via
  `JSON.stringify` (cross-realm prototypes break `assert.deepStrictEqual`).
- Test with real data shapes (e.g. `formatValueHistory` output with `Date`
  objects), not simplified literals — the Date-serialization bug slipped
  through a test that used plain numbers.
- Read the storage sanitizers before faking data: `sanitizeCalls`,
  `sanitizeSales`, `sanitizeLots`, `sanitizePractice` silently drop anything
  missing a field, so a fixture without one tests nothing.
