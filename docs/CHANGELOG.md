# Changelog

All notable changes to PriceTab will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Price alerts (in-tab first; browser notifications only if we accept the `notifications` permission — see TODO 3.1)
- Keyboard shortcuts (←/→ coins, 1-6 periods, S settings)
- Price-only coin tier via Coinlore (expand coverage beyond Coinbase-served coins)
- Ethereum gas tracker widget

---

## [1.4.0] - Portfolio, Onboarding & Settings Polish (staged locally, not yet in a store build)

### Added
- **Portfolio tracking** - full-screen, tracking-only holdings view (total value + change over a selectable period); manually entered amounts, all data local, no wallet connection
- **Portfolio value chart** - full-bleed background chart of total portfolio value over time, with a persisted period switcher (day/week/month/year/all)
- **Portfolio design polish** - per-holding allocation share (thin accent meter under each row + % next to the coin name), a quiet stats row under the total (24h P/L, best/worst 24h mover), unified uppercase section labels and a friendlier empty state
- **Onboarding tour** - first-run spotlight tour of the main controls (shown once, skippable)
- **Collapsible settings groups** - settings sections expand/collapse for faster scanning
- **One-time rating ask** - after two days of use, a small dismissible card in the corner of the new tab asks for a store rating; it appears exactly once and never returns after dismissing or rating
- **Hacker News in the news ticker** - well-upvoted crypto stories from the past week (via Algolia, CORS-enabled, no key) join Blockchair's headlines
- **News quality filter** - SEO/promo spam ("price prediction", presales, casinos, airdrops…) is dropped and the same story from multiple outlets is collapsed into one headline
- **Portfolio v2: purchase lots** - log purchases the way you made them ("bought 0.5 for 15,000, another 0.2 for 7,000"); each holding keeps a dated lot list that drives cost basis and unrealized P/L (per row and as a headline stat); allocation share per holding; JSON backup/restore (validated against the coin whitelist on import); "Tax report" CSV with a per-coin summary plus every dated lot (informational only, not tax advice)
- **Address watching** - optionally watch your own BTC/ETH/LTC/DOGE address: the holding's amount stays synced to the address's public on-chain balance (read-only lookup via mempool.space / Blockchair, 10-minute cache; the address is stored locally and sent only to the balance provider). For BTC the purchase lots are inferred from the real transfer history — every incoming transfer counts as a buy at that date's estimated price, outgoing transfers consume the oldest lots first; other chains start from one lot priced at the watch date and log later balance increases as new buys
- Viewport meta tag for responsive rendering; Google site verification file (promo site)

---

## [1.3.0] - Instant Charts & Performance (released August 2026)

### Added
- **Instant chart on new tabs** - the last fetched prices are cached locally, so a new tab paints the chart immediately and refreshes it in the background instead of showing a loading skeleton
- **Graceful error fallback** - if something unexpected crashes the page, a reload prompt appears instead of a blank tab; a broken widget now hides itself without taking the chart down

### Changed
- **~42% less JavaScript per new tab** - removed an unneeded compatibility polyfill and replaced the full D3 library with a custom bundle containing only the chart modules actually used (482 KB → 277 KB of vendor code)
- **Background tabs stop polling** - price, widget and ticker updates pause while the tab is hidden and resume the moment it becomes visible, saving network and battery
- **Far fewer ticker requests** - the price ticker bar, watchlist and top movers now share one bulk market-data request instead of two requests per coin
- Coin prefetching only runs when the browser-tab title ticker or auto-rotate actually needs it

### Internal
- Split the single 7,700-line `app.js` into 12 focused script modules (no build step added)
- Centralized all localStorage access behind shared, validated helpers
- Added a regression test suite (`tests/`) and a CI workflow that runs it on every push

---

## [1.2.1] - Settings Polish, Auto Rotate & News Ticker

### Added
- **Auto Rotate** (Preferences → Data) - the chart switches to the next coin on your list automatically; pick the interval (10s to 15m). Pauses while the tab is hidden or settings are open
- **News headlines row** in the price ticker bar (opt-in, off by default) - crypto headlines from Blockchair + Cointelegraph, merged and deduplicated, cached for 10 minutes. Clicking opens the article in a new tab with no referrer
- **Search coins by name** - typing "Dogecoin" now finds DOGE; suggestion chips show full names, Enter picks the top match
- **Undo for "Reset to defaults"** - the button flips to "Undo reset" so a mis-click can't destroy your list
- **ESC closes settings** and a visible × close button in the panel header
- **One-time rating reminder** in settings (dismiss forever with one click) and the toolbar icon now opens the store listing
- **Promo website** (`site/`) on GitHub Pages - extension-styled landing page with an animated lightbox screenshot gallery

### Changed
- **Settings panel reorganized** - larger card (32×40rem); Preferences grouped into Appearance / Display / Data / Tickers; Widgets grouped into Portfolio / Market / Trader with one-line explanations per widget
- **Search suggestions redesigned** - chips open in an animated area between the search bar and Add coin; several coins can be added from one search; the area collapses smoothly when cleared
- **Preset buttons show their active state** (Holder / Trader / Minimal highlight when they match)
- **Clearer names** - "Tab Ticker" → "Browser Tab Title", "Page Ticker" → "Price Ticker Bar"
- **Currency dropdown** groups popular currencies (USD, EUR, GBP, TRY, JPY) at the top
- Settings scrollbar moved to the card edge with a stable gutter (no more layout shift)
- Feedback message colors are now theme-aware (readable in light mode)

### Fixed
- Stale suggestion chips no longer repaint over the search placeholder after clearing the input (debounce is now cancellable)

---

## [1.2.0] - Watchlist, Top Movers & Reliability

### Added
- **Watchlist widget** - your coins as a colour-coded heatmap (green up / red down)
- **Top Movers widget** - the day's biggest 24h gainers and losers
- **One-click widget presets** - "Holder", "Trader" and "Minimal" bundles
- **Animated chart** - draws itself in on load, with a trend-tinted area fill (green when up, red when down) and a price count-up
- **Chart color toggle** (Preferences) - turn the green/red fill off for a plain line
- **Collapsible price ticker** - hover-reveal chevron to minimise it, pause-on-hover, and the collapsed state is remembered
- **Starter widgets for new installs** - Watchlist + Fear & Greed + Market Overview enabled out of the box

### Changed
- **Geo-resilient market data** - funding rate and open interest moved from Binance (geo-blocked in the US/UK) to OKX; long/short ratio to Bybit; global market data (cap, dominance, altcoin season) from CoinGecko to Coinlore. Derivatives widgets now work worldwide.
- Trimmed the suggested-coin list to coins Coinbase actually serves (no more 404/console noise)
- Gentler ticker fetching (slower refresh, smaller batches, no retry while rate-limited) to stay within Coinbase's limits
- Bolder coin names in settings
- Refreshed Chrome Web Store screenshots, listing copy and description

### Fixed
- Chart no longer overflows below the screen when the ticker appears or the layout resizes (re-measures via ResizeObserver)
- Removing a non-active coin no longer switches the displayed coin
- The last remaining coin can no longer be removed (no empty rotation)
- Coin-specific widgets no longer show the previous coin's values after switching coins
- Cleared a timer that was left running on unmount

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
- 60+ supported cryptocurrencies from Coinbase API
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
