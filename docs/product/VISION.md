# PriceTab Vision & Feature Roadmap

> **Last Updated:** July 30, 2026

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

### Phase 3: User Experience (Q2–Q3 2026)

**Onboarding** — *first-run spotlight tour shipped (staged, July 2026)* ✅

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

**Price Alerts** — *elevated priority (July 2026): #1 requested feature across the sector*
- Set price targets (above/below) per coin
- Percentage change alerts
- All stored locally, max 10 active alerts
- No server required — alerts checked on each fetch
- **Open decision:** browser push notifications require the `notifications`
  permission, which breaks the "zero permissions" promise. Default plan is
  in-tab alerts (title/badge/flash) first; add the permission only if users ask

**Coin Coverage Expansion** — *new (July 2026)*
- "Price-only" coin tier priced from the Coinlore bulk feed we already fetch
- Closes the visible gap vs. competitors (~64 coins vs. thousands) for
  ticker / watchlist / portfolio without new requests or permissions
- Chart remains Coinbase-only; price-only coins are marked as such in search

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

**Prediction markets widget (Polymarket)** — *researched Aug 2026, deferred
until after 1.4.0 is approved*

Deliberately held back so it ships alone: if it draws a rejection we want to
know it was this and not something else in a large release.

- Source clears our bar: `gamma-api.polymarket.com` is keyless and sends
  `access-control-allow-origin: *`; `/events?tag_slug=bitcoin&order=volume24hr`
  returns exactly the right markets ("Bitcoin above ___ on August 9?", one
  probability per strike)
- Known cost: no field selection, so the smallest useful response is 40 KB —
  more than the 37 KB Coinlore sweep that feeds the ticker, watchlist, top
  movers and market stats combined. Would need a long cache and off-by-default
- Open questions are not technical: whether prediction markets fit a listing
  that promises price charts, and how closely CWS reviews gambling-adjacent
  content when we display odds without taking bets

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
**[MONETIZATION.md](../internal/MONETIZATION.md)**.

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
