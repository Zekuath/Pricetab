# PriceTab Vision & Feature Roadmap

> **Last Updated:** August 22, 2026

PriceTab aims to be the go-to new tab experience for crypto enthusiasts — beautiful design, real-time data, and useful widgets while staying fast and privacy-first.

---

## Core Value Proposition

- No account required, zero permissions at install
- **Measured 22 Aug 2026: chart on screen in ~55 ms**, painted from the
  persisted cache before any request returns
- Privacy-first: all preferences stored locally
- Crypto-first: not an add-on to a productivity tool

---

## Feature Roadmap

### Phase 1: Core (Completed) ✅

- Real-time price charts with D3.js
- 81 cryptocurrencies (Coinbase, with a runtime failover to Kraken and six coins routed there permanently)
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

**Keyboard shortcuts** — *shipped* ✅ — navigate without a mouse. The list
outgrew this file: `SHORTCUT_GROUPS` in `src/shortcuts.js` is the one that has
to stay in sync with `handleKeyDown`, and `?` is what advertises it. Verified
22 Aug 2026 that the arrows and `1`–`6` work on a tab nobody has clicked.

**Improved error handling** — *shipped Aug 2026*
- User-friendly error messages ✅
- Retry button on fetch failures ✅
- Rate limit warnings ✅

**Visual polish**
- Coin logos/icons — *closed as not wanted*: real brand marks meant ~64
  trademark files or external requests, and the monogram badges that shipped in
  their place were removed the same month because every row already names the
  coin in text beside the badge
- Price flash animation on update ✅
- Loading spinner for initial fetch ✅

### Phase 4: Power User Features (Q3 2026)

**Price Alerts** — *elevated priority (July 2026): #1 requested feature across the sector*
- Set price targets (above/below) per coin
- Percentage change alerts
- All stored locally, max 10 active alerts
- No server required — alerts checked on each fetch
- **Decided (Aug 2026): in-tab only.** Browser push needs the `notifications`
  permission, which costs the promise. What shipped instead announces a hit in
  the tab title and keeps checking while the tab is hidden — both of which need
  no permission at all. Revisit only if users actually ask

**Coin Coverage Expansion** — *reframed 22 Aug 2026*
- "Price-only" coin tier priced from the Coinlore bulk feed we already fetch
- **Not an acquisition lever.** July's reading was that coverage is our biggest
  funnel gap. Re-measured on the Web Store on 22 Aug: the extension carrying
  10,000+ coins has **58 users**, the one with 3,000+ has **127**, and the one
  that leads this category has **1,000 users with 500 pairs** and is otherwise
  simpler than PriceTab. Coverage does not sell here
- **It is a portfolio argument.** You cannot track what the app does not
  support, and that is a retention cost paid by the people most invested in it
- Chart remains Coinbase/Kraken-only; price-only coins are marked as such in
  search

**Mini Portfolio** — *tracking view shipped (June 2026)* ✅
- Manually enter coin holdings ✅ — the 81 chartable coins, plus the tokens
  `isWatchableCoin` accepts, which can be held and priced but not charted
- Full-screen view: total value + 24h profit/loss ✅
- No wallet address / connection needed — tracking only ✅
- All data local (`crypto_chart_portfolio`), no cloud sync ✅
- JSON export/import ✅ · allocation breakdown + donut ✅ · per-coin cost basis
  with dated purchase lots ✅ · realized P/L from recorded disposals ✅ ·
  cost-basis report CSV with matched acquisition→disposal pairs ✅ ·
  read-only on-chain address watching (6 chains + 47 ERC-20 tokens) ✅ ·
  benchmark against holding BTC ✅ (Aug 2026)
- *Still open:* concentration note, realized P/L for the current tax year,
  merge-on-import, a cost-basis method choice for the report

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

No monetization is live, and none is planned before the store launch settles.

The constraints are the part that is settled and will not move: **no ad
networks, no tracking, no telemetry, no data sold, and nothing that is free
today ever stops being free.** Any revenue surface has to be optional, clearly
labeled and contextual.

The direction itself was revisited on 21 Aug 2026 and this file no longer
summarises it — a one-line summary here went stale the moment the position
changed, and a stale promise in a public document is worse than no promise.
Current strategy, placement, CWS compliance and phasing live in
`docs/internal/MONETIZATION.md` and the plan beside it.

---

## Design Philosophy

1. **Speed first** — no build step, no bloat, no CDN for JS
2. **Privacy always** — zero telemetry, localStorage only, and **zero
   permissions at install**. There is one optional host permission, for the six
   newsrooms, and Chrome grants it only when someone presses the button; it
   raises no install-time warning, so the claim on the listing still holds
3. **Single purpose** — crypto price dashboard, not a productivity tool
4. **Progressive disclosure** — simple by default, powerful when needed
5. **Graceful degradation** — always show cached data, never a blank screen

---

## Technical Direction

| Topic | Current | Future |
|-------|---------|--------|
| React | 16.5 (class components) | Consider React 18 + hooks when ready to refactor |
| App size | **31,592 lines across 26 files** (22 Aug 2026) — 25 loaded by `index.html`, plus `rate.js` for the popup. `app.js` 5,541 and `chart.js` 5,176 are the outliers | Keep files under ~800 lines where practical. Their styled-components are already split out, so the next cut for those two is behavioural and genuinely risky |
| Charts | Custom D3 v5 module bundle (only what the chart uses) | Revisit if chart needs outgrow it |
| Storage | localStorage (+ persisted price cache for instant paint) | Consider chrome.storage.sync for multi-device |
| Testing | 49 checks: lint, ast-grep rules, unit suites and five real-Chromium suites | Keep the browser suites as the net for anything about pixels, events or what React actually renders |

---

## What We Will NOT Build

- Wallet functionality (sending/receiving)
- DEX or trading integration
- **Subscriptions** — whatever else changes, PriceTab does not become a
  recurring charge
- Anything that removes a feature people already have
- User accounts or cloud sync (unless explicitly requested)
- AI-powered recommendations (out of scope for now)
- **A search box on the new tab.** Settled 22 Aug 2026: since Chrome 27 an
  extension new-tab page cannot take focus from the omnibox, so the address bar
  is still where typing goes. Competitors ship one; it is a redundancy, and the
  extensions that fought Chrome for that focus are what the standing complaints
  are about
- **Anything needing a content script.** The floating price widget the leading
  competitor offers requires access to every site you visit, which is the one
  thing this product is built not to ask for
