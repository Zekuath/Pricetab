# Tests

Development-only regression tests for PriceTab. Nothing in this folder ships
with the extension or the store zip.

## Running

```bash
node tests/run-all.js        # everything (syntax checks + all suites)
node tests/test-cache.js     # or any single suite
```

All suites are plain Node scripts with zero dependencies, except the jsdom
smoke test:

```bash
cd tests && npm install      # one-time, installs jsdom locally
```

Without jsdom installed, `test-smoke-jsdom.js` reports SKIPPED and the rest
still run.

## Suites

| File | Covers |
|------|--------|
| `test-load.js` | All `src/*.js` files execute cleanly in `index.html` script order (catches TDZ violations, duplicate declarations, load-order mistakes) |
| `test-storage.js` | localStorage helpers: defaults, round trips, whitelist rejection, corrupt-JSON fallbacks for every setting |
| `test-api.js` | News fetchers (Blockchair + Hacker News parsing, clamping, filtering), the cross-source news merge (spam filter, title dedupe) and per-coin page ticker snapshot (24h change math, TTL skip) |
| `test-cache.js` | Persistent price cache: hydrate/persist/caps, plus the Date-revival regression (JSON turns Date fields into ISO strings; hydration must revive them or scaleTime renders a NaN path) |
| `test-bulk.js` | Coinlore bulk sweep: cache fill, currency conversion, duplicate-symbol dedupe, junk filtering, fallback signalling |
| `test-portfolio.js` | Portfolio: holdings persistence (whitelist, dedupe, amount coercion, corrupt-JSON fallback), chart period setting ("hour" excluded), total-value series builder (amount × price sums, end-alignment, shortest-history trim) and the history cache (TTL, stale-on-failure fallback) |
| `test-onboarding.js` | Onboarding tour: step definitions stay well-formed and every `data-tour` selector anchors to a real element in the app source; show-once localStorage gate; navigation clamps and keyboard handling (arrows/Enter/Escape); a missing target skips its step instead of blocking |
| `test-d3.js` | `vendor/d3-custom.min.js` exposes every d3 API the app uses (line, scales, transitions, interpolatePath) |
| `test-smoke-jsdom.js` | Boots the real page in jsdom with a fake network; asserts the chart renders valid (non-NaN) data in cold and hydrated-cache scenarios, that the coin prefetch stays off while the tab ticker / auto-rotate are off, and that a hidden tab fires zero requests until it becomes visible |

## Conventions

- Suites run app code inside `node:vm` sandboxes with stubbed
  `localStorage` / `fetch` — no network access, no real browser needed.
- When asserting on objects created inside a vm context, compare via
  `JSON.stringify` (cross-realm prototypes break `assert.deepStrictEqual`).
- Test with real data shapes (e.g. `formatValueHistory` output with `Date`
  objects), not simplified literals — the Date-serialization bug slipped
  through a test that used plain numbers.
