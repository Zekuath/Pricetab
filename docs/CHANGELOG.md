# Changelog

All notable changes to PriceTab will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Price alerts with browser notifications
- Fear & Greed Index widget
- Ethereum gas tracker
- Whale alert integration
- Keyboard shortcuts
- Portfolio tracking (optional)

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
