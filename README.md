# PriceTab

**Live cryptocurrency price charts on every new tab.**

A lightweight, privacy-focused Chrome extension that transforms your new tab into a real-time crypto dashboard. No accounts, no tracking, just data.

![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Features

- **Real-time Charts** - Beautiful D3.js visualizations with smooth animations
- **75+ Cryptocurrencies** - Bitcoin, Ethereum, Solana, and many more
- **Dynamic Tab Title** - See prices without switching tabs (`BTC $43,250 (+5.2%)`)
- **6 Time Periods** - 1H, 1D, 1W, 1M, 1Y, ALL
- **Dark/Light Themes** - Auto-detects system preference
- **37 Currencies** - USD, EUR, GBP, TRY, JPY, and more
- **Drag & Drop** - Reorder your coin watchlist
- **Persistent Settings** - Your preferences survive browser restarts
- **Privacy First** - All data stored locally, no accounts required
- **Offline Capable** - Shows cached data when disconnected
- **Fast** - Loads instantly, no external dependencies

---

## Installation

### Chrome Web Store

*Submission ready - Coming soon*

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the extension folder
6. Open a new tab

---

## Usage

### Viewing Prices

- **Click the price** (top-left) to cycle through your coins
- **Click the change percentage** (top-right) to toggle between $ and %
- **Use time period buttons** below the chart to change timeframe

### Managing Coins

1. Click the **gear icon** (top-right) to open settings
2. **Search** for coins in the search box
3. **Click** a coin to add it to your watchlist
4. **Drag** coins to reorder
5. **Click X** on a coin to remove it

### Preferences

In the settings panel, you can customize:

- **Theme** - Dark, Light, or Auto (follows system)
- **Currency** - 37 fiat currencies available
- **Refresh Rate** - 10s, 30s, 1m, or 5m

---

## Tab Title Feature

Your browser tab shows live crypto prices - visible even when working in other tabs:

```
BTC $43,250 (+5.2%)
```

- Updates automatically every 30 seconds
- Shows current coin, price, and 24h change
- Changes when you switch coins

---

## Supported Cryptocurrencies

**Major:** BTC, ETH, BNB, SOL, XRP, DOGE, ADA, AVAX, DOT, MATIC

**DeFi:** LINK, UNI, AAVE, MKR, SNX, COMP, CRV, 1INCH, SUSHI

**Layer 2:** ARB, OP, MATIC, IMX, LRC

**And 60+ more** including SHIB, LTC, ATOM, FIL, APT, SUI, SEI, TIA, INJ, and others.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 16.5 | UI Framework |
| D3.js v5 | Chart Visualization |
| styled-components | CSS-in-JS Styling |
| Coinbase API | Price Data |
| Chrome Manifest V3 | Extension Platform |

All dependencies are bundled locally - no external CDN requests for JavaScript.

---

## Privacy

PriceTab is designed with privacy as a core principle:

- **No account required** - Use immediately after install
- **No data collection** - We don't track anything
- **No analytics** - No Google Analytics, no telemetry
- **Local storage only** - Your coin list stays on your device
- **No third-party sharing** - Your data is yours
- **Public API only** - No authentication tokens stored

The only network requests are to Coinbase's public API for price data.

---

## Development

### Prerequisites

- Chrome browser
- Text editor

### Quick Start

```bash
# Clone the repository
git clone https://github.com/zekuath/pricetab.git

# Load in Chrome
1. Go to chrome://extensions/
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the project folder
```

### Project Structure

```
pricetab/
├── src/
│   ├── app.js          # Main application (~3400 lines)
│   └── theme-init.js   # Prevents white flash on load
├── vendor/             # Bundled dependencies
├── assets/icons/       # Extension icons
├── docs/               # Documentation
├── manifest.json       # Chrome extension config
└── index.html          # Entry point
```

### Making Changes

1. Edit files in `src/`
2. Go to `chrome://extensions/`
3. Click reload icon on PriceTab
4. Open new tab to test

No build process required - changes are immediate after extension reload.

---

## Documentation

| Document | Description |
|----------|-------------|
| [VISION.md](docs/VISION.md) | Feature roadmap and future plans |
| [TODO.md](docs/TODO.md) | Development tasks and progress |
| [CHANGELOG.md](docs/CHANGELOG.md) | Version history |
| [PRIVACY.md](docs/PRIVACY.md) | Privacy policy |
| [STORE_DESCRIPTION.md](docs/STORE_DESCRIPTION.md) | Chrome Web Store listing content |

---

## Contributing

Contributions are welcome! Please read the documentation in `docs/` before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Acknowledgments

This project is based on work by [halvves](https://codepen.io/halvves/pen/JmgbVV). See LICENSE for full attribution.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/zekuath/pricetab/issues)
- **Discussions:** [GitHub Discussions](https://github.com/zekuath/pricetab/discussions)

---

**Made with care for the crypto community.**
