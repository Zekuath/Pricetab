# Architecture

PriceTab is a Manifest V3 Chrome extension. `index.html` is the new-tab page;
`popup.html` is the toolbar popup.

## Runtime model

There is no application build step. Files in `src/` are classic scripts loaded
by ordered `<script>` tags, so they share one global scope. Code executed while
a file loads may only use bindings created by earlier files. Function bodies
may call later bindings because they run after the page has loaded.

All runtime dependencies, styles and fonts are stored in `vendor/`. The
extension loads no remote code.

## Source layout

| Area | Main files |
|---|---|
| Theme, icons and configuration | `theme*.js`, `icons.js`, `config.js`, `i18n.js` |
| Data and persistence | `api.js`, `storage.js`, `widgets-data.js` |
| Chart | `chart*.js`, `outlook.js`, `regime-grid.js`, `*-patterns.js`, `strategy-setups.js` |
| Settings and onboarding | `settings*.js`, `onboarding.js`, `shortcuts.js` |
| Portfolio and tax guide | `portfolio*.js`, `tax-*.js` |
| Derivatives practice | `practice*.js`, `assistant.js`, `alerts-futures.js` |
| Targets, calls and news | `alerts.js`, `notify.js`, `news.js`, `baserates.js` |
| Root application | `app-*.js`, `app.js` |

`app.js` owns the root `CryptoChart` class and its state. Area-specific handler
sets live in `app-*.js` and are attached by the constructor. React is 16.5, so
the code uses class components and does not use hooks.

## Storage

User-entered data and preferences are stored under `crypto_chart_*` keys in
`localStorage`. Reads go through the validators and sanitizers in `storage.js`;
a new field in a stored object must be added to its sanitizer or it will be
dropped on the next load.

Caches are persisted because every new tab creates a new JavaScript context.
They are capped and disposable. User-entered records are not evicted to make
room for a cache.

## Network access

Requests are made only to public, keyless data services. The allowed hosts are
listed in `tests/test-invariants.js`; a new host fails the test until it is
reviewed and added deliberately.

The manifest grants no permission at install. Notifications and eight newsroom
origins are optional and requested from controls inside the extension. The tax
guide contains links to official sources but does not fetch those pages.

## Drawing and UI

The chart is D3 drawing into an SVG owned by a React component. Chart nodes are
reused between redraws, and every optional layer is cleared when disabled.
styled-components 3.4 is vendored; at this version `attrs` takes an object,
DOM refs use `innerRef`, and there is no `as` prop.

Visible text goes through `msg()` in `i18n.js`. English strings are extracted
from source, and every locale must preserve the same keys and placeholders.

## Tests

```bash
npm --prefix tests run check
```

The command runs ESLint, ast-grep rules and the full test suite. Pure logic is
tested in Node sandboxes; page behaviour is covered in jsdom and Chromium with
network requests stubbed.

Important enforced rules include:

- no permission at install and no undeclared remote host;
- no remote scripts, `eval`, `innerHTML` or production `console.log`;
- no React hooks or direct state mutation;
- every source file is loaded by `index.html`;
- interactive controls are keyboard reachable and named.

## Common changes

| Change | Update |
|---|---|
| Source file | `index.html`, relevant test sandboxes and `scripts/package.sh` |
| Coin or currency | `config.js` |
| Stored setting | key/default, loader, UI and any affected sanitizer |
| Shortcut | `app.js` and `shortcuts.js` |
| Widget | defaults, order, group metadata, renderer and fetch job if needed |
| Data provider | implementation, `ALLOWED_HOSTS`, privacy policy and tests |
| User-facing string | literal `msg()` key, extracted English catalogue and every translation |
