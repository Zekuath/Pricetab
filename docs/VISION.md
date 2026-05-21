# PriceTab Vision & Feature Roadmap

> **Last Updated:** May 2026

PriceTab aims to be the go-to new tab experience for crypto enthusiasts — beautiful design, real-time data, and useful widgets while staying fast and privacy-first.

---

## Core Value Proposition

- No account required, zero permissions
- Loads in under 1 second
- Privacy-first: all preferences stored locally
- Crypto-first: not an add-on to a productivity tool

---

## Feature Roadmap

### Phase 1: Core (Completed) ✅

- Real-time price charts with D3.js
- 75+ cryptocurrencies from Coinbase API
- 6 time periods (1H, 1D, 1W, 1M, 1Y, ALL)
- Dark/Light/Auto themes
- Drag-and-drop coin reordering
- 37 currency options
- Configurable refresh interval
- Dynamic tab title with live prices
- Caching with TTL and offline fallback

### Phase 2: Widget System (Completed) ✅

- Fear & Greed Index (Alternative.me)
- Market Overview — total MCap + 24h volume (CoinGecko)
- BTC Halving Countdown
- RSI Widget — 14-period, coin-specific
- Funding Rate (Binance Futures)
- Long/Short Ratio (Binance Futures)
- Open Interest in USD (Binance Futures)
- Liquidations 24h (OKX Public API)
- Altcoin Season Index — BTC dominance based (CoinGecko)
- All widgets toggleable from settings
- Drag-and-drop widget reordering
- Hide-all / show-all widget toggle

### Phase 3: User Experience (Q2 2026)

**Keyboard shortcuts** — navigate without a mouse
- `←` / `→`: previous / next coin
- `1`–`6`: switch time period
- `S` or `Esc`: toggle settings
- `R`: manual refresh

**Improved error handling**
- User-friendly error messages
- Retry button on fetch failures
- Rate limit warnings

**Visual polish**
- Coin logos/icons in the coin list
- Price flash animation on update
- Loading spinner for initial fetch

### Phase 4: Power User Features (Q3 2026)

**Price Alerts**
- Set price targets (above/below) per coin
- Percentage change alerts
- Browser push notifications (Chrome Notifications API)
- All stored locally, max 10 active alerts
- No server required — alerts checked on each fetch

**Mini Portfolio**
- Manually enter coin holdings
- Track total value and 24h profit/loss
- No wallet address needed
- JSON export/import
- All data local, no cloud sync

**Additional Widgets**
- Ethereum Gas Tracker (Etherscan/Blocknative)
- Whale Alert feed (large transaction monitoring)
- Crypto news widget (CryptoPanic)

### Phase 5: Platform Expansion (2027+)

- Firefox WebExtension port
- Safari Web Extension (Xcode required)
- Chrome sync storage option
- Internationalization (Turkish, Spanish, German)

---

## Design Philosophy

1. **Speed first** — no build step, no bloat, no CDN for JS
2. **Privacy always** — zero telemetry, zero permissions, localStorage only
3. **Single purpose** — crypto price dashboard, not a productivity tool
4. **Progressive disclosure** — simple by default, powerful when needed
5. **Graceful degradation** — always show cached data, never a blank screen

---

## Technical Direction

| Topic | Current | Future |
|-------|---------|--------|
| React | 16.5 (class components) | Consider React 18 + hooks when ready to refactor |
| App size | ~5600 lines monolithic | Split into components when approaching 8000 lines |
| Charts | D3.js v5 | Consider Lightweight Charts for bundle size |
| Storage | localStorage | Consider chrome.storage.sync for multi-device |
| Testing | None | Jest + Playwright for critical paths |

---

## What We Will NOT Build

- Wallet functionality (sending/receiving)
- DEX or trading integration
- Paid features or subscriptions
- User accounts or cloud sync (unless explicitly requested)
- AI-powered recommendations (out of scope for now)
