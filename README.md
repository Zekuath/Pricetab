# PriceTab

**A live cryptocurrency chart on every new tab — with no account, no tracking
and no permission asked at install.**

[Chrome Web Store](https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf) ·
[Website](https://zekuath.github.io/Pricetab/site/) ·
[Open it on the web](https://zekuath.github.io/Pricetab/) ·
[Privacy policy](docs/PRIVACY.md) ·
[Changelog](docs/CHANGELOG.md)

![A new tab with PriceTab: Bitcoin over one day, the price scale on the right and the six ranges](site/shots/hero.png)

PriceTab replaces the new tab page with a chart of the coin you follow, and
builds out from there: price targets, a private record of the moves you call,
a portfolio with a country-by-country tax guide, a derivatives account in units
that are worth nothing, news, and widgets. Everything you keep stays in your
browser.

One rule runs through all of it: **the app counts, it does not advise.** There
is no buy or sell signal anywhere. Where it says something about the market —
how often a move this size happened, what followed a pattern, where the price
may be tomorrow — the number carries the count behind it, and every reading of
that kind was written down and tested on data it had never seen before it was
allowed into the product. Several did not pass, and the app says so instead of
showing them.

## Contents

- [The chart](#the-chart)
- [Calls and price targets](#calls-and-price-targets)
- [Portfolio and tax guide](#portfolio-and-tax-guide)
- [Practice derivatives](#practice-derivatives)
- [Reading the market](#reading-the-market)
- [Widgets](#widgets)
- [On a phone](#on-a-phone)
- [Privacy](#privacy)
- [Install](#install)
- [Keyboard](#keyboard)
- [Development](#development)

## The chart

Line or candlesticks over six ranges, from one hour to all time, with a price
scale and a time axis. Drag it in any direction — through time, or through
prices — scroll or pinch to zoom where you point, and finer candles load as you
go in. A logarithmic axis, a moving average that says what it covers, the US
inflation, jobs, Fed and PCE releases marked where they fall, and every point
readable from the keyboard and by a screen reader.

| | |
|---|---|
| ![A day of Bitcoin zoomed in, with a drawn level, a trend line and a note](site/shots/tools.png) | ![A month of Bitcoin candles with volume by price, the usual range as a cone, regimes and turn levels](site/shots/studies.png) |
| **Draw and measure.** Lines, rays, boxes and notes that stay at their price and time. The ruler says the change, the time, and how often a move that far happened in that long. | **Counted studies.** Volume by price, where the price sits in its range, the usual range ahead, regimes and turn levels — each tested first, each saying what it counts. |
| ![Bitcoin against the S&P 500 as percent change over one month](site/shots/compare.png) | ![A month of Bitcoin with US releases marked and the next 24 hours under the price](site/shots/events.png) |
| **Compare with anything.** Another coin, the S&P 500, the Nasdaq 100 or gold, from the same moment on one axis — with the gap and how closely they moved. | **The next 24 hours.** Two ranges for a day from now: the one the price should land in four times in five, and half the time. Tested on 3,945 days it had never seen: 80.1% and 49.4%. |

The **chart companion** names sixteen chart patterns, twelve strategy setups and
twenty-one readings where they appear, each beside what followed it on this coin
— counted, never scored.

![A year of Bitcoin with named patterns, their target and stop on the price scale, and the card for a group of recent setups open beside its badge](site/shots/companion.png)

## Calls and price targets

The right of the chart becomes a board of squares — real price bands at real
moments ahead, each with its chance, worked out from the coin's own history and
checked against years of past squares before it was allowed on. Click a square
twice to call it; it settles itself against the price at that moment. Every
settled call can be replayed, and the record says how often chance alone would
have done as well. The score is local and worth nothing.

| | |
|---|---|
| ![The board one day ahead, with two squares called](site/shots/calls.png) | ![A settled call drawn again over the price it settled on](site/shots/replay.png) |
| ![Price targets with how far each has to go](site/shots/targets.png) | **Price targets.** "BTC rises above 80,000" or "falls 5% in 4h". Reported the next time you open a tab — even a move that happened and reverted overnight — and, if you switch it on, as a Chrome notification. A target is a line on the chart, and a click on the chart fills one in. |

## Portfolio and tax guide

Holdings by amount, or a public address read for its balance — PriceTab never
connects to a wallet and never asks for a key. Dated purchases, sales and
income; cost basis by FIFO, LIFO or HIFO; the value as held, the return month by
month, and CSV export. Press <kbd>H</kbd> and the amounts are masked.

The **tax guide** covers 244 countries and territories: what is taxed and what
is not, rates and the tax year, each read from the country's own tax authority
or law, linked and dated. Where no official source was confirmed, it says so and
claims nothing. It is not tax advice.

| | |
|---|---|
| ![Portfolio with holdings, cost basis, allocation and a month of value](site/shots/portfolio.png) | ![The tax guide showing the United States card](site/shots/tax.png) |

## Practice derivatives

A perpetual-contract terminal priced from a real venue's public quotes and order
book: long or short up to 200x, limit and stop orders, funding, margin and
liquidation. You trade on its chart — the order you are writing is drawn before
it is placed, and stops and take-profits are dragged into place — while a guide
names what is missing, opened over the chart with the number it draws beside
each item. Every area can be enlarged or moved, every contract you close is
kept, and the account can start over. It is in simulated USDT that cannot be
bought or cashed out; it cannot place a real order or connect to an exchange
account.

![The practice terminal with the perpetual's candles, the order book and an order ticket](site/shots/practice.png)

## Reading the market

| | |
|---|---|
| ![The news reading room with dated headlines and every source's age](site/shots/news.png) | ![A story read beside the list under a counted reading of it](site/shots/newspreview.png) |
| **News, dated and read.** Fourteen sources, narrowed to your coins or holdings, advertising kept out, one story told four times shown once. A story opens beside the list without its pictures. Point at a sharp move and the chart marks the stretch that moved, with what was written about it ranked first. | **Has this happened before?** What followed every past time this coin entered the state it is in now — with the count behind every figure, and no comparison at all under twelve episodes. |
| ![The base-rate screen for Bitcoin](site/shots/baserates.png) | ![The monitor: every followed coin on one sortable table](site/shots/monitor.png) |
| Each month of each year sits in a grid too. It was tested; no month stood apart, so none is called better. | **The monitor** (<kbd>M</kbd>). Every coin you follow on one sortable table, and how closely each pair has moved together. |

## Widgets

Twenty-six widgets — Fear & Greed, market overview, halving, difficulty, fees,
gas, RSI, funding, open interest, liquidations, long/short, alt season, regimes,
options, the US spot bitcoin ETFs' flows, stablecoins, a watchlist, top movers, a
model of Bitcoin's next hour and more — added from a
gallery at three sizes and arranged the way a phone arranges them. Pin up to
four to the home screen, where they rest as outlines.

| | |
|---|---|
| ![The widgets drawer with cards at three sizes](site/shots/widgets.png) | ![Three widgets pinned to the chart's corner as outlines](site/shots/pinned.png) |

## On a phone

The same page runs on the web at
[zekuath.github.io/Pricetab](https://zekuath.github.io/Pricetab/). Add it to a
phone's home screen and it opens full screen with its own icon: a tab bar for
the chart, calls, targets and the portfolio, sheets that swipe away, and the
side columns swiped in from the edges, clear of the browser's own back gesture.

![PriceTab on a phone: the chart with its tab bar, a call being placed, and the More sheet](site/shots/phone.png)

## Privacy

PriceTab has no account, no analytics, no telemetry and no advertising.

| | |
|---|---|
| Permissions at install | **None.** Eight optional newsroom feeds and Chrome notifications are asked for only when you press their button inside the app. |
| Background activity | **None.** There is no service worker: nothing runs when no PriceTab tab is open. |
| Where your data lives | Your browser's local storage — coins, settings, holdings, targets, calls, drawings and the practice account. A backup file is something you make and carry yourself. |
| What leaves the device | Requests for public market data, carrying a coin symbol, a currency or a date range. A public address you choose to watch goes to that chain's balance provider and nowhere else; the sanctions check on it runs on your device from a bundled list. |
| Code | Unminified and unbundled, loaded from the extension itself. No remote script, no `eval`. |

The [privacy policy](docs/PRIVACY.md) describes every data flow, and the
website's [Verify it yourself](https://zekuath.github.io/Pricetab/site/#verify)
section lists every host the code can reach, what for, and what is sent to it —
with three checks that take a minute each.

## Install

**From the Chrome Web Store:**
[PriceTab](https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf).

**From source:**

1. Clone or download this repository.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository folder.
4. Open a new tab.

There is no build step: the source files are plain JavaScript, loaded in the
order listed in `index.html`.

PriceTab is available in English, Deutsch, Español, Français, Bahasa Indonesia,
Italiano, 日本語, 한국어, Português (Brasil), Русский, Türkçe, Українська and
简体中文, with dark, light and automatic themes and a blue/orange palette for
colour-blind readers.

## Keyboard

Press <kbd>?</kbd> in PriceTab for the complete list. The most used:

| Key | |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> | Previous / next coin |
| <kbd>1</kbd>–<kbd>6</kbd> | Range, 1H through ALL |
| <kbd>/</kbd> | Command line: a coin, a range, `compare spx`, `target +5%` |
| <kbd>T</kbd> · <kbd>Y</kbd> · <kbd>G</kbd> | Candles · log axis · grid |
| <kbd>L</kbd> · <kbd>K</kbd> · <kbd>A</kbd> | Calls on the chart · the calls record · price targets |
| <kbd>C</kbd> · <kbd>W</kbd> · <kbd>V</kbd> | Compare · widgets · the chart's settings |
| <kbd>P</kbd> · <kbd>F</kbd> · <kbd>N</kbd> · <kbd>B</kbd> · <kbd>M</kbd> | Portfolio · derivatives · news · base rates · monitor |
| <kbd>I</kbd> | Save the chart as an image |
| <kbd>Esc</kbd> | Close whatever is open |

## Development

The extension is React 16.5, D3 and styled-components, vendored in `vendor/`
and loaded as ordered classic scripts — no bundler, no build, no runtime
dependency from a network. Development tools live in `tests/` and never ship.

```bash
git config core.hooksPath .githooks
npm --prefix tests ci
npm --prefix tests run browsers
```

Before sending a change, run the whole check — lint, structural rules, unit
tests and the real-browser suites:

```bash
npm --prefix tests run check
```

- [Architecture](docs/ARCHITECTURE.md) — how the code is laid out and why
- [Contributing](docs/CONTRIBUTING.md) — setup, the checklist, reporting a bug
  or a security issue
- [Changelog](docs/CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE), which also carries the third-party attributions.

PriceTab provides market information and personal record-keeping tools. It is
not financial or tax advice. The derivatives account is a simulation in units
with no value.
