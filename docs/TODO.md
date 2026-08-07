# PriceTab - Development Roadmap

> Development roadmap aligned with [VISION.md](VISION.md) and [MONETIZATION.md](MONETIZATION.md).
> Tasks are organized by priority with clear status.
>
> **Last refreshed:** July 30, 2026 (post sector scan — see "Insights" section)

---

## Project Status

| Metric | Value |
|--------|-------|
| **Live Build** | 1.3.0 on the Chrome Web Store (August 2026) |
| **Staged Locally** | 1.4.0 — onboarding tour, portfolio tracking, collapsible settings groups |
| **In Flight (uncommitted)** | None — working tree clean |
| **Codebase Size** | ~8,100 lines across 15 script modules in `src/` |
| **Testing** | Node regression suite + jsdom smoke test, CI on every push |
| **Next Milestone** | Ship 1.4.0 (portfolio + onboarding) to the store → launch marketing |

---

## Active Focus (ordered)

> **Everything below Phase 1 is secondary until the staged build is live.**
> The July 2026 sector scan (see [MONETIZATION.md §2b](MONETIZATION.md)) confirmed:
> installs are the bottleneck for every product and revenue goal — affiliate-style
> extensions earn per active user, and we have ~0 installs on a listing that is
> one version behind the local build.

1. ~~Finish & commit the in-flight portfolio/onboarding polish~~ — done (committed August 2026)
2. ~~Ship 1.3.0 to the store~~ — done (live August 2026)
3. **Ship 1.4.0** (onboarding + portfolio + collapsible settings; `manifest.json` already bumped)
4. **Launch marketing Phase 0–1** (`MARKETING_LAUNCH.md`): privacy policy URL, support email, first reviews
5. Then: Quick Wins (keyboard shortcuts, retry, spinner) → Price Alerts

---

## Completed Features (summary)

<details>
<summary>Core, widgets, performance and UX shipped through 1.3.0 + staged work (click to expand)</summary>

### Core Price Display
- [x] Real-time D3 charts, 6 periods, animated transitions, trend-tinted fill
- [x] Instant chart on new tab (persisted price cache, background refresh)
- [x] Dynamic browser tab title with live prices
- [x] 60+ coins, coin search by name, drag-and-drop reordering, max 20 coins
- [x] 37 currencies, decimal places, number formats, popular currencies grouped

### User Preferences & UI
- [x] Dark / Light / Auto theme with system detection (no white flash)
- [x] Configurable refresh interval; auto-rotate through coins (10s–15m)
- [x] Scrolling price ticker bar (collapsible, position configurable) + opt-in news headlines row
- [x] Settings panel: tabbed, grouped (Appearance/Display/Data/Tickers), collapsible groups, ESC/× close, undo reset
- [x] Skeleton loading, responsive layout, themed scrollbar, hover tooltips
- [x] **Onboarding tour** — first-run spotlight tour (staged, unreleased)
- [x] **Portfolio tracking** — full-screen tracking-only holdings view, total value + 24h P/L, all local (staged, unreleased)
- [x] One-time rating prompt + toolbar popup → store listing

### Widget System (11 widgets)
- [x] Fear & Greed, Market Overview, BTC Halving, RSI, Funding Rate (OKX), Long/Short (Bybit), Open Interest (OKX), Liquidations (OKX), Altcoin Season, Watchlist heatmap, Top Movers
- [x] Presets (Holder / Trader / Minimal), toggle, drag-reorder, hide-all, entrance animations

### Performance & Reliability (1.3.0)
- [x] ~42% less vendor JS (custom D3 bundle, polyfill removed), zero external requests (fonts/CSS bundled)
- [x] Hidden tabs pause all polling; bulk ticker request (1 instead of 2/coin)
- [x] Smart cache (30s TTL, cleanup, offline fallback), retry with backoff
- [x] Error boundary — a crash shows a reload prompt, a broken widget hides itself

### Security & Quality
- [x] Input validation against whitelists, coins normalized, no console.log in production
- [x] `app.js` split into 15 focused modules (script-tag pattern, no build step)
- [x] Centralized validated localStorage helpers
- [x] Regression test suite (`tests/`) + jsdom smoke test + CI on push

</details>

---

## Phase 1: Ship & Launch

**Priority:** `CRITICAL` | **Status:** Store live at 1.3.0 (Aug 2026), 1.4.0 staged locally

### 1.1 Pre-ship (working tree → store)

| Task | Status | Notes |
|------|--------|-------|
| Commit in-flight portfolio/onboarding polish | [x] | Committed August 2026, working tree clean |
| Add portfolio + onboarding coverage to the regression suite | [x] | `tests/test-portfolio.js` + `tests/test-onboarding.js` (Aug 2026) |
| Update CHANGELOG (move shipped items out of Unreleased/Planned) | [x] | Done July 30, 2026 |
| Self-test on a clean Chrome profile (all coins/periods/currencies/themes, offline, persistence) | [ ] | One pass before upload |
| Decide version number (1.4.0 — new features, not just perf) | [x] | `manifest.json` bumped to 1.4.0 (Aug 2026) |
| Upload to CWS with fresh screenshots incl. portfolio + onboarding | [ ] | Asset pipeline ready in `assets/mockups/` |

### 1.2 Store listing (mostly done)

| Task | Status | Notes |
|------|--------|-------|
| Name, 132-char summary, trust-first description, no keyword spam | [x] | `STORE_DESCRIPTION.md` (canonical) |
| Screenshots + promo tiles (refreshed for 1.3.0) | [x] | Re-capture only if portfolio/onboarding should be featured |
| Host privacy policy + URL in CWS Privacy field | [ ] | `privacy.html` exists — needs GitHub Pages URL in dashboard |
| Support email in CWS dashboard | [ ] | Required before wide promotion |
| FAQ responses prepared | [ ] | Common questions |

### 1.3 Marketing launch

> Full plan with templates: **`MARKETING_LAUNCH.md`**. Goal: first installs + 5–10 honest reviews at 4.5★+.

| Task | Status | Priority |
|------|--------|----------|
| Phase 0: store readiness (above) + clean-profile self-test for a day | [ ] | Critical |
| Phase 1: ask 8–12 contacts for reviews; post in 2–3 communities | [ ] | Critical |
| Phase 2: GitHub README polish (hero shot, install link), repo topics, X thread | [ ] | High |
| Phase 3: Product Hunt, r/SideProject, r/chrome_extensions, Show HN (spaced out) | [ ] | High |
| Phase 4: reply to every review; ship small updates every few weeks | [ ] | Ongoing |

---

## Phase 2: UX Quick Wins

**Priority:** `HIGH` | **Target:** first post-launch update

| Task | Status | Effort | Why |
|------|--------|--------|-----|
| Keyboard shortcuts: `←`/`→` coins, `1`–`6` periods, `S`/`Esc` settings, `R` refresh | [ ] | Low | Most-cited power-user gap; cheap |
| "Retry" button + friendly message on fetch failure | [ ] | Low | Reviews punish silent failures |
| Loading spinner for initial fetch (when cache is cold) | [ ] | Low | First-run impression |
| Coin logos/icons in coin list & chips | [ ] | Medium | Perceived quality → reviews |
| Price change flash animation on update | [ ] | Low | Polish |
| localStorage quota exceeded handling | [ ] | Medium | Rare but data-loss adjacent |

---

## Phase 3: Power User Features

**Priority:** `HIGH` (alerts) / `MEDIUM` (rest) | **Target:** Q3–Q4 2026

### 3.1 Price Alerts — *elevated priority (July 2026)*

> Sector scan result: price alerts are the **single most requested feature**
> across every competitor and portfolio tracker in 2026. They also drive
> re-engagement (more sessions), which every monetization channel depends on.

| Task | Status | Notes |
|------|--------|-------|
| Alert data model + localStorage persistence (max 10 active) | [ ] | See data structure below |
| Price target UI (above/below) + percentage change alerts | [ ] | In settings or coin overview |
| Browser notification integration | [ ] | ⚠ Requires adding the `notifications` permission — breaks "zero permissions". **Decide:** in-tab visual alerts only (badge/flash/title) keep zero permissions; push notifications need the permission + store copy update |
| Alert checked on each fetch cycle (no server, no background worker if possible) | [ ] | MV3 constraint |
| Alert history with timestamps | [ ] | Nice-to-have |

```javascript
{ id, coin, type: "above"|"below"|"percent_change", target, currency, created, triggered, active }
```

### 3.2 Portfolio v2 (tracking view shipped ✅)

| Task | Status | Notes |
|------|--------|-------|
| Full-screen tracking view: total value + 24h P/L, all local | [x] | Shipped (staged) |
| Allocation breakdown (% per coin) | [x] | Share meter + % per row (Aug 2026) |
| Per-coin cost basis → total P/L since purchase | [x] | Dated purchase lots ("bought X for Y"); row + headline unrealized P/L; BTC lots inferred from watched-address history (Aug 2026) |
| JSON export / import | [x] | Backup/restore, import validated via `sanitizePortfolio` (Aug 2026) |
| Tax report CSV (cost basis + unrealized P/L, "not tax advice") | [x] | Foundation for the seasonal affiliate line (Aug 2026) |
| Address watching (BTC/ETH/LTC/DOGE, read-only balance sync) | [x] | mempool.space + Blockchair, 10-min cache, opt-in (Aug 2026) |
| Tax-season affiliate line (Jan–Apr, local date check) | [ ] | See `MONETIZATION.md` §3.5 — portfolio v2 now shipped |

### 3.3 Coin Coverage Expansion — *new (July 2026)*

> Our biggest competitive gap: ~64 Coinbase-served coins vs. 3,000–10,000+ at
> competitors. We already fetch Coinlore's top-100 in one bulk request.

| Task | Status | Notes |
|------|--------|-------|
| Design: "price-only" coin tier (Coinlore-priced, no Coinbase history) | [ ] | Ticker/watchlist/portfolio support; chart shows "no chart data" or sparkline from cached snapshots |
| Whitelist + name map extension for Coinlore-only coins | [ ] | Keep validation pattern |
| Settings UX: mark price-only coins in search | [ ] | No surprises |

### 3.4 Additional Widgets

| Widget | Status | API | Notes |
|--------|--------|-----|-------|
| Ethereum Gas Tracker | [ ] | Etherscan / Blocknative / mempool.space | Verify CORS + no-key access first |
| Whale Alert feed | [ ] | Whale Alert API | Likely needs key — probably not viable |

---

## Phase 4: Advanced Analytics

**Priority:** `LOW` | **Target:** Q4 2026+

- [ ] Moving averages (SMA/EMA) overlay — cheapest meaningful indicator
- [ ] Volume bars on chart
- [ ] MACD / Bollinger Bands (needs more data points — verify API depth first)
- [ ] Candlestick chart option
- [ ] Crosshair with price display; comparison mode (2 coins)

---

## Phase 5: Platform Expansion

**Priority:** `LOW` | **Target:** 2027

- [ ] Firefox WebExtension port (minor API differences)
- [ ] Safari Web Extension (Xcode required)
- [ ] `chrome.storage.sync` option (multi-device settings)
- [ ] i18n: Turkish first, then Spanish/German

---

## Monetization Track

> Strategy, principles, compliance and phasing live in **[MONETIZATION.md](MONETIZATION.md)**.
> Sequenced after launch traction — no channel matters at ~0 installs.

| Phase | Contents | Gate |
|-------|----------|------|
| M1 | Settings → Support & Partners + donations/tip jar + privacy disclosure | After store launch settles |
| M2 | Hardware wallet + exchange affiliate, contextual "Trade" button | After M1 + affiliate approvals |
| M3 | Self-served sponsor card (widget slot, labeled) | After M2, only with real traffic |
| M4 | Alert/portfolio contextual surfaces incl. tax-season affiliate (§3.5) | After alerts + portfolio v2 ship |

---

## Technical Debt

| Task | Status | Priority | Notes |
|------|--------|----------|-------|
| Test coverage for portfolio + onboarding | [ ] | High | Newest, least-tested code |
| ESLint + Prettier config | [ ] | Medium | Cheap consistency win |
| Keep files < 800 lines (watch `portfolio.js` growth) | [~] | Medium | In-flight diff adds ~300 lines |
| Playwright E2E for critical paths | [ ] | Low | After launch |
| React 18 + hooks migration | [ ] | Low | Only with a real driver |
| TypeScript migration | [ ] | Low | Not worth it under no-build constraint |

---

## Insights — July 2026 Sector Scan

Foresights that should shape prioritization (full data in `MONETIZATION.md` §2b):

1. **Installs are the bottleneck.** Every goal (revenue, reviews, motivation) scales with users; the local build is two versions ahead of the store. Shipping beats building right now.
2. **Price alerts are the sector's #1 requested feature** — and our sharpest retention lever. But push notifications cost our "zero permissions" claim; the in-tab-only alert variant preserves it. This trade-off deserves an explicit decision, not a default.
3. **Coin coverage is our visible weakness** (~64 vs. thousands). The Coinlore price-only tier closes most of the perceived gap for one bulk request we already make.
4. **Portfolio tools are converging on "wealth management"** (allocation, cost basis, tax). Our tracking-only + local-only stance is a differentiator — portfolio v2 + a seasonal tax-affiliate line captures the trend without breaking privacy.
5. **Privacy is a moat, not a constraint.** No major competitor leads with zero permissions/no tracking. Every store asset, review reply and README line should say it first.
6. **Ratings compound.** Small frequent updates + replying to every review is the highest-ROI ongoing marketing; it's free and no competitor in the minimal-clone tier does it.

---

## Known Issues & Bugs

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| *No known issues* | - | - | Report at GitHub Issues |

---

## Success Metrics & Goals

### Launch Goals (Month 1 after re-launch)
- [ ] 1,000+ users · 4.5★+ rating · <0.1% crash rate · <1s load · zero critical bugs

### Growth Goals
- [ ] 10,000 users by Month 3 · 50,000 by Month 6 · 100,000 by Year 1 · CWS featured

---

## References

| Document | Purpose |
|----------|---------|
| [VISION.md](VISION.md) | Long-term feature vision |
| [MONETIZATION.md](MONETIZATION.md) | Revenue strategy + market/competitor research |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [MARKETING_LAUNCH.md](MARKETING_LAUNCH.md) | Launch checklist + copy templates |
| [STORE_DESCRIPTION.md](STORE_DESCRIPTION.md) | Web Store listing content (canonical) |
| [STORE_ASSETS.md](STORE_ASSETS.md) | Web Store asset specs |
| [../assets/mockups/README.md](../assets/mockups/README.md) | Promo tile + screenshot export tools |

---

**Status Legend:** `[ ]` not started · `[x]` completed · `[~]` in progress · `[-]` blocked

When picking up a task: check dependencies → update status here → follow existing code patterns → test on Chrome/Edge/Brave → update CHANGELOG.
