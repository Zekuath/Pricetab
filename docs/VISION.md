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
- 60+ cryptocurrencies from Coinbase API
- 6 time periods (1H, 1D, 1W, 1M, 1Y, ALL)
- Dark/Light/Auto themes
- Drag-and-drop coin reordering
- 37 currency options
- Configurable refresh interval
- Dynamic tab title with live prices
- Caching with TTL and offline fallback

### Phase 2: Widget System (Completed) ✅

- Watchlist heatmap + Top Movers (your coins / 24h gainers & losers)
- Fear & Greed Index (Alternative.me)
- Market Overview — market cap, volume + dominance (Coinlore)
- BTC Halving Countdown (mempool.space)
- RSI Widget — 14-period, coin-specific
- Funding Rate (OKX)
- Long/Short Ratio (Bybit)
- Open Interest in USD (OKX)
- Liquidations 24h (OKX)
- Altcoin Season Index — BTC dominance based (Coinlore)
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

**Mini Portfolio** — *tracking view shipped (June 2026)* ✅
- Manually enter coin holdings (any of the ~64 supported coins) ✅
- Full-screen view: total value + 24h profit/loss ✅
- No wallet address / connection needed — tracking only ✅
- All data local (`crypto_chart_portfolio`), no cloud sync ✅
- *Still planned:* JSON export/import, allocation breakdown, per-coin cost basis

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

## Monetization

PriceTab stays **free with no paywall and no locked features**. Revenue comes
only from optional, clearly-labeled, contextual surfaces — hardware-wallet &
exchange affiliate links, optional donations / tip jar, and a single
self-served (untracked, "Sponsored"-labeled) slot. No ad networks, no data
sold. Full strategy, placement, CWS compliance and phasing live in
**[MONETIZATION.md](MONETIZATION.md)**.

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
| App size | ~7,800 lines across 12 script modules | Keep files under ~800 lines where practical |
| Charts | Custom D3 v5 module bundle (only what the chart uses) | Revisit if chart needs outgrow it |
| Storage | localStorage (+ persisted price cache for instant paint) | Consider chrome.storage.sync for multi-device |
| Testing | Node regression suite + jsdom smoke test, CI on push | Playwright E2E for critical paths |

---

## What We Will NOT Build

- Wallet functionality (sending/receiving)
- DEX or trading integration
- Paid features or subscriptions
- User accounts or cloud sync (unless explicitly requested)
- AI-powered recommendations (out of scope for now)
