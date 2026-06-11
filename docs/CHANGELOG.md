# Changelog

All notable changes to PriceTab will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Price alerts with browser notifications
- Keyboard shortcuts (←/→ coins, 1-6 periods, S settings)
- Portfolio tracking (optional, local only)
- Ethereum gas tracker widget
- Whale alert feed widget

---

## [1.1.1] - Privacy, Performance & Layout Polish

### Changed
- Self-hosted the Roboto Mono font (no more external Google Fonts request) — faster, fully offline, zero third-party calls
- Spot price and chart history now fetched in parallel for faster loads

### Fixed
- Settings and widget-toggle buttons now stay aligned on small/short screens
- Bottom widget row is horizontally scrollable so all widgets stay reachable
- Chart now fills the available space without overflowing over the controls

---

## [1.1.0] - Widget System & Market Data

### Added
- **Widget System** - Toggleable side panel with 9 market data widgets
  - Fear & Greed Index (Alternative.me API)
  - Market Overview (total market cap + 24h volume)
  - BTC Halving Countdown
  - RSI Widget (coin-specific, 14-period)
  - Funding Rate (Binance Futures API)
  - Long/Short Ratio (Binance Futures API)
  - Open Interest in USD (Binance Futures API)
  - Liquidations 24h (OKX Public API)
  - Altcoin Season Index (CoinGecko BTC dominance)
- **Drag-and-drop widget reordering** - Widget panel order persisted to localStorage
- **Hide-all widgets button** - Single-click toggle to show/hide all widgets at once
- **Hover tooltips** - All interactive elements now have descriptive title tooltips
  - Period buttons (1H → "1 Hour", etc.)
  - Price area ("Next coin")
  - Change area ("Switch to price change / percent change")
  - Settings button ("Settings / Close settings")
- **Scrolling price ticker bar** - Optional top/bottom ticker showing multiple coins

### Changed
- Widget panel moves with coin changes for coin-specific data (funding, L/S, OI, liquidations)
- App source grown to ~5600+ lines

---

## [1.0.0] - Initial Release

### Added
- Real-time cryptocurrency price charts on every new tab
- **Dynamic Tab Title** - Live prices visible in browser tab (`BTC $43,250 (+5.2%)`)
- 75+ supported cryptocurrencies from Coinbase API
- Persistent coin selection using localStorage
- Drag-and-drop coin reordering
- 6 time periods: 1H, 1D, 1W, 1M, 1Y, ALL
- Interactive D3.js charts with smooth animations
- Settings panel with tabs (Coins / Preferences)
- Coin search and quick-add functionality
- Price and percentage change display
- **Dark/Light Theme** - Auto-detects system preference
- **37 Currency Options** - USD, EUR, GBP, TRY, JPY, and more
- **Customizable Refresh Intervals** - 10s, 30s, 1m, 5m
- **Advanced Caching** - 30s TTL, auto-cleanup
- **Retry Mechanism** - Exponential backoff for API failures
- **Offline Detection** - Shows cached data when disconnected
- **Skeleton UI** - Loading animation
- Mobile-responsive design

### Security
- Input validation against SUGGESTED_COINS whitelist
- Maximum 20 coins enforced
- All coin symbols normalized to uppercase

### Technical
- Chrome Extension Manifest V3
- React 16.5 for UI components
- D3.js v5 for chart visualization
- styled-components for CSS-in-JS
- Coinbase Public API integration
- localStorage for data persistence
- All dependencies bundled locally (no CDN)

---

## Change Types

- `Added` - New features
- `Changed` - Changes in existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Security improvements
