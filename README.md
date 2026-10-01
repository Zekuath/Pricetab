# PriceTab

[![PriceTab](assets/promotional/Marquee.png)](https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf)

Live cryptocurrency charts on every new tab. No account, no tracking, and no
permissions at install.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf)

## Features

- Line and candlestick charts from one hour to all time, with a price scale and
  time axis, comparison, drawing tools and a ruler, indicators, counted
  studies, zoom, pan and pinch with a navigator, and point-by-point keyboard
  and screen-reader reading.
- Price targets and a private calls record stored on the device.
- Portfolio tracking with lots, sales, cost basis, performance views and CSV
  export. Public addresses can be watched read-only; PriceTab never connects to
  a wallet or asks for a private key.
- A simulated derivatives account using live public market data and valueless
  Practice Units. It cannot place a real order or connect to an exchange
  account.
- Optional market widgets, news, base-rate counts and a country-by-country tax
  guide. Market readings report their sample rather than giving buy or sell
  advice.
- Dark and light themes, a blue/orange palette for colour-blind readers, 13
  languages, a toolbar popup and keyboard shortcuts.

Press `?` in PriceTab for the complete shortcut list.

## Privacy

PriceTab has no account, analytics, telemetry or advertising. Settings,
holdings, targets, drawings and simulated trades stay in browser storage.

The extension makes HTTPS requests to public market-data services. Watching a
public blockchain address sends that address only to the balance provider for
its chain. Extra news sources and Chrome notifications are optional and are
requested only when you enable them inside the extension.

See the [privacy policy](docs/PRIVACY.md) for the full data-flow description.

## Install from source

1. Clone or download this repository.
2. Open `chrome://extensions/` and enable Developer mode.
3. Choose **Load unpacked** and select the repository folder.
4. Open a new tab.

There is no build step. Source files are plain JavaScript loaded in the order
listed in `index.html`.

## Development

Install the development dependencies and browser once:

```bash
npm --prefix tests ci
npm --prefix tests run browsers
```

Before opening a pull request, run:

```bash
npm --prefix tests run check
```

That command runs linting, structural checks, unit tests and browser tests.

Contributor documentation:

- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Changelog](docs/CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE) for the licence and third-party attribution.

PriceTab provides market information and personal record-keeping tools. It is
not financial or tax advice.
