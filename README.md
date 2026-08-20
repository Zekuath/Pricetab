# PriceTab

[![PriceTab Banner](assets/promotional/Marquee.png)](https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf)

**Live cryptocurrency price charts on every new tab.**

A lightweight, privacy-focused Chrome extension that turns your new tab into a
real-time crypto dashboard. No account, no tracking, **zero permissions**.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![Permissions](https://img.shields.io/badge/Permissions-none-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## The chart

- **A live chart on every new tab** — line or candlestick, six ranges from the
  last hour to all time
- **Crosshair readout** — hover for that point's open, high, low, close and
  volume; candles are fetched only once you actually hover
- **Compare two coins** — both drawn as percent change from the start of the
  range, on one shared axis. Never a second y-axis: two price scales on one
  chart put the crossing point wherever the scales were placed rather than
  where the market put it
- **Market stats** — the range's high and low, market cap and 24h volume
- **Optional grid** — price levels and time divisions read off the range on
  screen, so you can judge where a level sits and how far away it is. Hover a
  cell to light it up
- **Since your last visit** — how the coin moved since you last looked
- **Live tab title** — `BTC $43,250 (+5.2%)`, visible while you work elsewhere

## Calls — say where the price goes, and keep the score

Switch them on with <kbd>L</kbd> and the right-hand side of the chart becomes a
**board**: real price bands at real moments in the future, drawn as squares you
can point at.

- **Two clicks to commit** — the first drafts the square, the second locks it.
  A chart is a surface people click for other reasons, and one stray click
  should not put a prediction on a record
- **It settles itself**, the next time you open a tab, against the price at the
  moment that was called. Not against hours of drift afterwards: judging
  someone on a stretch they were never asked about would make the record untrue
- **The board is a fixed lattice, not a fitted scale** — one square stays
  fifteen minutes and $100 while you are on that range, so a box you locked
  yesterday is still on the gridlines it was drawn on. The chart's usual habit
  of fitting whatever it is given is right for reading a line and wrong under a
  board
- **Several calls can share a column, and they are not equal.** The one placed
  first is the claim; the rest are hedges around it, and only the first is
  marked. A mark every lone call carried would say nothing
- **Drag the "now" line** to trade history for board — it is the only control,
  because the board's size is a length and the edge you want to pull is already
  on the chart
- **A win is celebrated on the box that came true**, not at the live price. The
  first call you ever get right, and the first into a contested column, get the
  full show
- Its own key (<kbd>K</kbd>), its own control in the corner, and a mark on that
  control when something has settled since you last looked

Calls keep running with the feature switched off — a claim you already made
does not stop being true because you put the board away — but nothing is drawn
and nothing is announced while it is off.

**The score is local, valueless and never sent.** That is deliberate: a score
that could become something purchasable would turn a price chart into a wager
on an asset, which the Chrome Web Store bans outright and which is not what
this is for.

## Price targets

- **"BTC rises above 80,000"** or **"BTC falls 5% in 24h"**
- Reported the next time you open a tab — including targets hit **overnight**,
  because detection searches the last week of candles rather than only the
  price right now
- Announced in the tab title too, so a PriceTab tab you aren't looking at can
  tell you. Nothing is pushed: writing your own tab's title needs no
  permission, which is exactly why the feature is in-tab

## Portfolio

- **Track holdings by amount** — or paste a public address and let it read the
  balance (BTC, ETH, LTC, DOGE, BCH, ZEC, plus 28 ERC-20 tokens). Read-only,
  no wallet connection
- **Purchase lots** — log buys the way you made them; cost basis, unrealized
  P/L and allocation share follow
- **Record sales** — FIFO against the oldest purchases, with realized P/L kept
  after the purchases it consumed are gone
- **vs BTC** — whether holding *these* coins beat holding the obvious one over
  the range you're looking at
- **Cost basis report (CSV)** — holdings, purchases and disposals with each
  sale paired to the purchases it consumed. It is the record a tax return is
  worked out from, not the return itself: it knows only what you entered here

## Market widgets — all optional, all off by default

Watchlist · Top Movers · Fear & Greed · Market Overview · BTC Halving
Countdown · RSI · Funding Rate · Long/Short Ratio · Open Interest ·
Liquidations · Altcoin Season

One-click **Holder / Trader / Minimal** bundles, drag to reorder, and four
sizes from compact to extra large.

## Everything else

- **65 coins**, searchable by name or symbol
- **37 display currencies**
- **Dark / light / auto** themes, following your system by default
- **Auto-rotate** through your coins, 10 seconds to 15 minutes
- **Scrolling ticker** across the top or bottom, with an optional news row
- **Keyboard-first** — see below
- **No ads, no account, no premium tier**

---

## Keyboard shortcuts

Press <kbd>?</kbd> in a new tab for this list.

| | |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> | Previous / next coin |
| <kbd>1</kbd>–<kbd>6</kbd> | Switch range, 1H through ALL |
| <kbd>/</kbd> | Jump to a coin by name |
| <kbd>C</kbd> | Compare with a second coin |
| <kbd>T</kbd> | Line / candlestick chart |
| <kbd>G</kbd> | Price / time grid on the chart |
| <kbd>L</kbd> | Calls on / off |
| <kbd>[</kbd> <kbd>]</kbd> | Board reach: zoom out / in (with calls on) |
| <kbd>X</kbd> | Percent / price change |
| <kbd>W</kbd> | Hide / show widgets |
| <kbd>D</kbd> | Dark / light theme |
| <kbd>Space</kbd> | Auto-rotate on / off |
| <kbd>R</kbd> | Refresh now |
| <kbd>A</kbd> | Price targets |
| <kbd>K</kbd> | Calls — the board, the record, the settings |
| <kbd>P</kbd> | Portfolio |
| <kbd>S</kbd> | Settings |
| <kbd>Esc</kbd> | Close whatever is open |

---

## Install

### Chrome Web Store

**[Install PriceTab](https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf)**
— one click, auto-updates.

If PriceTab makes your new tab better, a rating helps others find it.

### From source

1. Clone or download this repository
2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. **Load unpacked** → select the project folder
5. Open a new tab

### Building the upload

```bash
./scripts/package.sh
```

Writes both forms side by side — `assets/upload/pricetab-<version>/` to load
unpacked, and `assets/upload/pricetab-<version>.zip` for the dashboard. The
archive is built from an allowlist rather than by zipping the folder: the tree
carries docs, tests, mockups and previous releases, and every one of those is
either dead weight in the package or something that should not be published.
The script also checks the allowlist against what `index.html` actually loads,
so a new `src/` file nobody added to it fails the build instead of breaking the
extension for everyone on the store.

---

## Privacy

PriceTab requests **no permissions at all**. There is no account, no
analytics, no telemetry, and nothing is sent anywhere except the price APIs
below. Your coin list, settings, portfolio and targets live in your browser's
local storage and never leave the device.

Every request goes to a public, keyless API:

| Host | What for |
|------|----------|
| `www.coinbase.com` | Prices and chart history; exchange rates for non-USD |
| `api.exchange.coinbase.com` | Candles for the crosshair and candlestick chart |
| `api.kraken.com` | Prices for coins Coinbase doesn't list, and long-range candles |
| `api.coinlore.com` | Market overview, altcoin season, and one bulk snapshot that feeds the ticker, watchlist and top movers |
| `api.alternative.me` | Fear & Greed index |
| `www.okx.com` | Funding rate, open interest, liquidations |
| `api.bybit.com` | Long/short ratio |
| `mempool.space` | BTC halving block height, and BTC address balances if you watch one |
| `api.blockchair.com` | News headlines, and ETH/LTC/DOGE/BCH/ZEC address balances if you watch one |
| `hn.algolia.com` | Crypto stories from Hacker News for the optional news row |
| `ethereum-rpc.publicnode.com` | ERC-20 token balances if you watch an Ethereum address |

Address balance lookups happen **only** for addresses you explicitly add, and
the address is sent only to the balance provider for that chain.

Opening the toolbar icon opens the Chrome Web Store listing; clicking a
headline opens that news site. Nothing else leaves the browser.

Full policy: [docs/PRIVACY.md](docs/PRIVACY.md)

---

## Development

No build step. Edit a file, reload the extension, open a new tab.

```bash
git clone https://github.com/Zekuath/Pricetab.git
# chrome://extensions/ → Developer mode → Load unpacked → select the folder
```

### Tests

```bash
cd tests && npm install && npm test
```

A Node regression suite plus a jsdom smoke test, run in CI on every push.

### Project structure

```
pricetab/
├── src/                    # ~19,000 lines across 22 modules, loaded as
│   │                       #   ordered <script> tags sharing one global scope
│   ├── app.js              # Root component and all state
│   ├── chart.js            # D3 chart, period switcher, price overview
│   ├── api.js              # Fetchers, caches, providers
│   ├── portfolio.js        # Holdings, lots, sales, cost basis report
│   ├── alerts.js           # Price targets
│   ├── settings*.js        # Settings panel
│   ├── styles-*.js         # styled-components, split per area
│   └── …                   # widgets, onboarding, quick switch, shortcuts
├── vendor/                 # Bundled deps — no npm, no CDN
├── assets/                 # Icons, store screenshots, mockup pipeline
├── docs/                   # Roadmap, changelog, store policy compliance
├── tests/                  # Regression suite
├── site/                   # Promo page (GitHub Pages, not shipped)
├── manifest.json
├── index.html              # The new tab page
└── privacy.html
```

`index.html` defines the load order, and it matters — a file may only execute
references to bindings from files loaded before it.

**Read [CLAUDE.md](CLAUDE.md) before changing anything.** It carries the
architecture, the conventions and the reasoning behind decisions that look
arbitrary until you know why.

---

## Tech stack

| | |
|---|---|
| React 16.5 | UI, class components (no hooks at this version) |
| D3 | Charts — a custom bundle of only the modules used, not full D3 |
| styled-components | CSS-in-JS |
| Chrome Manifest V3 | Extension platform |

Every dependency — scripts, styles and fonts — is bundled locally. **Zero
external CDN requests.**

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Architecture and conventions — start here |
| [VISION.md](docs/product/VISION.md) | Feature roadmap |
| [TODO.md](docs/product/TODO.md) | Tasks and progress |
| [CHANGELOG.md](docs/CHANGELOG.md) | Version history |
| [PRIVACY.md](docs/PRIVACY.md) | Privacy policy |
| [STORE_DESCRIPTION.md](docs/store/STORE_DESCRIPTION.md) | Store listing copy |
| [STORE_ASSETS.md](docs/store/STORE_ASSETS.md) · [SCREENSHOT_PLAN.md](docs/store/SCREENSHOT_PLAN.md) | Store visuals |
| [policies/](docs/store/policies/) | Chrome Web Store compliance |

---

## Contributing

Issues and pull requests are welcome.

1. Read [CLAUDE.md](CLAUDE.md)
2. Branch, change, and run `cd tests && npm test`
3. Open a PR describing what changed and why

---

## License

MIT — see [LICENSE](LICENSE).

Based on work by [halvves](https://codepen.io/halvves/pen/JmgbVV); see LICENSE
for full attribution.

---

## Support

- **Website** — [zekuath.github.io/Pricetab/site](https://zekuath.github.io/Pricetab/site/)
- **Issues** — [GitHub Issues](https://github.com/Zekuath/Pricetab/issues)
- **Discussions** — [GitHub Discussions](https://github.com/Zekuath/Pricetab/discussions)
