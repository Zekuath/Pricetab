# PriceTab - Development Roadmap

> Development roadmap aligned with [VISION.md](VISION.md) and [MONETIZATION.md](../internal/MONETIZATION.md).
> Tasks are organized by priority with clear status.
>
> **Last refreshed:** 22 August 2026. The July sector scan was re-verified
> against live Web Store listings and **Insight 3 did not survive it** — see
> the Insights section. Statuses, codebase size and the Known Issues table were
> re-measured rather than carried forward.

---

## Project Status

| Metric | Value |
|--------|-------|
| **Live Build** | 1.3.0 on the Chrome Web Store (August 2026) |
| **Staged Locally** | 1.4.0 — onboarding tour, portfolio v2 (cost basis, disposals, address watching), news panel, calls board, collapsible settings groups |
| **Uncommitted (22 Aug)** | Portfolio time-alignment + currency + coverage + undo fixes; per-range cache TTL; network-retry cap. `check` green |
| **Codebase Size** | 31,592 lines across 26 files in `src/` (22 Aug 2026) |
| **Testing** | 49 checks — lint, ast-grep rules, unit suites, five real-Chromium suites. CI on every push |
| **Next Milestone** | Ship 1.4.0 (portfolio + onboarding) to the store → launch marketing |

---

## Active Focus (ordered)

> **Everything below Phase 1 is secondary until the staged build is live.**
> The sector scan (see [MONETIZATION.md §2b](../internal/MONETIZATION.md)),
> re-verified 22 Aug 2026, says this more strongly than it did in July:
> installs are the bottleneck for every product and revenue goal, the feature
> list is already ahead of every competitor found, and PriceTab appears in none
> of the searches that return all of them. **Building more features is not what
> is missing.**

1. ~~Finish & commit the in-flight portfolio/onboarding polish~~ — done (committed August 2026)
2. ~~Ship 1.3.0 to the store~~ — done (live August 2026)
3. **Ship 1.4.0** (onboarding + portfolio + collapsible settings; `manifest.json` already bumped)
4. **Launch marketing Phase 0–1** (`MARKETING_LAUNCH.md`): privacy policy URL, support email, first reviews
5. ~~Quick Wins + Price Alerts~~ — shipped Aug 2026 (crosshair, since-last-visit, retry, flash, `/` jumper, alerts, coin badges)

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
| Keyboard shortcuts: `←`/`→` coins, `1`–`6` periods, `S`/`Esc` settings, `R` refresh | [x] | Low | Shipped (was already implemented; TODO was stale) |
| "Retry" button + friendly message on fetch failure | [x] | Low | Shipped Aug 2026 |
| Chart crosshair with price + date readout | [x] | Medium | Shipped Aug 2026 — biggest perceived-quality gap |
| "Since your last visit" price delta | [x] | Low | Shipped Aug 2026 — unique to the new-tab format |
| Loading spinner for initial fetch (when cache is cold) | [x] | Low | Shipped Aug 2026 — skeleton says "Fetching prices…" after 2.5s |
| Coin logos/icons in coin list & chips | [x] | Medium | Closed as *not wanted*. Real brand logos were rejected (~64 trademark files, or external requests); monogram badges shipped in their place Aug 2026 and were removed the same month — every row already named the coin in text beside the badge |
| Price change flash animation on update | [x] | Low | Shipped Aug 2026 |
| Seed price data so the very first open paints a chart | [ ] (declined) | Medium | Would ship fabricated prices that read as real for a moment, and go stale — the honest cold-start note was shipped instead |
| Quick coin switcher (`/` to search) | [x] | Low | Shipped Aug 2026 — `src/quickswitch.js` |
| localStorage quota exceeded handling | [x] | Medium | Shipped: `writeStorage` drops the four `EPHEMERAL_CACHE_KEYS` cheapest-first and retries, and returns a result so an import can say it failed. Portfolio, calls, targets and preferences are never evicted — everything else was typed by a person |

---

## Phase 3: Power User Features

**Priority:** `HIGH` (alerts) / `MEDIUM` (rest) | **Target:** Q3–Q4 2026

### 3.1 Price Alerts — *elevated priority (July 2026)*

> Sector scan result: price alerts are the **single most requested feature**
> across every competitor and portfolio tracker in 2026. They also drive
> re-engagement (more sessions), which every monetization channel depends on.

| Task | Status | Notes |
|------|--------|-------|
| Alert data model + localStorage persistence (max 10 active) | [x] | Shipped Aug 2026 — `src/alerts.js`, validated in storage |
| Price target UI (above/below) | [x] | Shipped Aug 2026 — bell button / `A` key panel |
| Percentage-change targets ("moves 5% in 24h") | [x] | Shipped Aug 2026 — currency-independent, backfilled from the same weekly hourly candles (each compared with the one 24 steps earlier) |
| Live distance, progress meter, nearest-first sort, re-arm | [x] | Shipped Aug 2026 — rows read from data already on hand, so opening the panel costs no request |
| Browser notification integration | [ ] (declined) | ⚠ Requires adding the `notifications` permission — breaks "zero permissions". Decided: in-tab visual only. Shipped as the tab-title announcement below |
| Tab-title announcement + background target checking | [x] | Aug 2026 — a hit is announced in the tab title (alternating while the tab is away), and targets keep being checked while hidden. Still zero permissions: writing `document.title` needs none. Settings → Preferences, on by default; the switch governs the background polling too |
| Alert checked on each fetch cycle (no server, no background worker if possible) | [x] | Rides the normal fetch; one bulk request only when non-active coins have alerts |
| Alert history with timestamps | [x] | A hit row keeps when it happened and the price it happened at, until removed or re-armed |

```javascript
{ id, coin, kind: "price"|"percent", direction: "above"|"below", target,
  currency, created, startPrice, triggeredAt, hitPrice }
```

### 3.2 Portfolio v2 (tracking view shipped ✅)

| Task | Status | Notes |
|------|--------|-------|
| Full-screen tracking view: total value + 24h P/L, all local | [x] | Shipped (staged) |
| Allocation breakdown (% per coin) | [x] | Share meter + % per row (Aug 2026) |
| Per-coin cost basis → total P/L since purchase | [x] | Dated purchase lots ("bought X for Y"); row + headline unrealized P/L; BTC lots inferred from watched-address history (Aug 2026) |
| JSON export / import | [x] | Backup/restore, import validated via `sanitizePortfolio` (Aug 2026) |
| Cost basis report CSV (was "Tax report") | [x] | Renamed Aug 2026 — the old name promised a filing document, and the file is the record one is worked out *from*: it has no exchange history, transfers, fees or crypto-to-crypto trades. Foundation for the seasonal affiliate line |
| Cost basis report: holding period, short/long-term split, per-lot gain | [x] | Aug 2026 — summary block, days held + term per lot, FIFO and threshold stated in the file |
| Cost basis report: matched acquisition→disposal pairs | [x] | Aug 2026 — one line per purchase a sale consumed, with its own acquisition date, holding period and term. Proceeds split by amount; unmatched and pre-pairing sales still emitted so the proceeds column reconciles |
| Country-specific tax computation | [ ] (declined) | Rules differ on cost-basis method, tax-year end, holding-period effects, allowances and crypto-to-crypto treatment, and change annually. More decisive: the input is incomplete — no exchange import, transfers, fees or crypto-to-crypto — so a computed liability would be wrong for most people, and a confident-looking wrong number is worse than none. The matched-pair export is what an accountant or Koinly/CoinTracker actually needs |
| Cost basis report: unlogged-amount reconciliation | [x] | Aug 2026 — "Amount with/without cost logged" columns; the app says the same on the row |
| Benchmark: portfolio vs holding BTC over the chart range | [x] | Aug 2026 — gap in percentage points, aligned to the portfolio's own window; rides the chart's existing history requests |
| Realized P/L (record disposals, FIFO-match against lots) | [x] | Aug 2026 — "Sold" beside "Bought" on a holding; FIFO consumes the oldest lots, the disposal keeps the basis it used. Realized stat + a Disposals section in the CSV. Fixed a real bug on the way: a hand-edited amount left the lots alone, so a sold-down holding reported the whole position's gain |
| Sale out of a watched address | [ ] | The chain reports the balance going down but not the price you sold at, so it can't produce a realized figure. Recording it by hand would double-count the amount. Needs thought |
| Allocation donut | [ ] | What most portfolio apps lead with. We already show a share meter + % per row and a full-bleed value chart, so it may be a third view of the same fact rather than a new one — decide before building |
| Concentration note ("62% is in one coin") | [ ] | One number from data already computed. Factual, not advice — keep the wording that way |
| CSV import of exchange transaction history | [ ] | What Koinly/CoinTracker are actually for. Formats vary per exchange; only worth it after realized P/L exists, since that's what the rows would feed |
| Address watching (BTC/ETH/LTC/DOGE, read-only balance sync) | [x] | mempool.space + Blockchair, 10-min cache, opt-in (Aug 2026) |
| Tax-season affiliate line (Jan–Apr, local date check) | [ ] | See `MONETIZATION.md` §3.5 — portfolio v2 now shipped |

### 3.3 Coin Coverage Expansion — *reframed 22 Aug 2026*

> **Not the funnel fix this was filed as.** See Insight 3 below: the coverage
> leaders have the fewest users in the category. What coverage actually buys is
> the portfolio — you cannot track what the app does not support — so it is a
> retention feature for the people most invested in it, and it is priced as
> one. We already fetch Coinlore's top-100 in a single bulk request, so the
> price-only tier costs no new host and no new permission.

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

> Strategy, principles, compliance and phasing live in **[MONETIZATION.md](../internal/MONETIZATION.md)**.
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
| Test coverage for portfolio + onboarding | [x] | High | `test-portfolio.js`, `test-portfolio-chart.js`, `test-onboarding.js`, plus `test-polish-render.js` §9c/§12/§13 in real Chromium (Aug 2026) |
| ESLint + Prettier config | [x] | Medium | ESLint 9 flat config (`eslint.config.mjs`) derives ~850 cross-file globals from `src/`; `no-undef` is this project's compiler. Errors fail, warnings inform |
| Keep files < 800 lines | [~] | Medium | Measured 22 Aug 2026: 31,592 lines across 26 modules. `app.js` 5,541 · `chart.js` 5,176 · `portfolio.js` 2,908. Six style files have already been cut out; the next cut for the top two is behavioural, not cosmetic, and genuinely risky |
| Playwright E2E for critical paths | [x] | Low | Five real-Chromium suites in `check`; 49 checks total |
| React 18 + hooks migration | [ ] | Low | Only with a real driver |
| TypeScript migration | [ ] | Low | Not worth it under no-build constraint |

---

## Insights — July 2026 Sector Scan, re-verified 22 August 2026

Foresights that should shape prioritization (full data in `MONETIZATION.md` §2b).
**Insight 3 did not survive re-measurement** and is struck through below; the
Chrome Web Store figures behind that are:

| | users | rating | what it carries |
|---|---|---|---|
| **ChartsTab** — the category leader, and the closest thing to us | **1,000** | 5.0 (99) | 500 Binance pairs, sparklines, a search box, a floating widget on any page — and asks to "access website content" |
| Crypto Pulse | 127 | 5.0 (2) | 3,000+ coins, metals, weather/notes/tasks/calculator, RSS. **56 MB**. Collects location and user activity |
| Crypto Price Tracker | 58 | 3.8 (13) | 10,000+ coins, custom contract addresses. Handles PII **and financial information** |

Two questions closed by the same scan, so they are not re-derived:

- **A search box on the new tab: no.** Since Chrome 27 an extension new-tab
  page cannot take focus from the omnibox, so the address bar is still where
  typing goes. ChartsTab's box is a redundancy, and the extensions that fought
  Chrome for that focus are what the long-standing complaints are about.
- **Chrome's new-tab-hijack block does not affect us.** The August 2026 change
  (`kBlockDseNtpOverrideExtensionsOnUnmanagedDevices`) blocks *policy-installed*
  extensions from overriding the new tab on unmanaged devices; user-installed
  Web Store extensions are explicitly unaffected, and it is not yet in stable.

1. **Installs are the bottleneck.** Every goal (revenue, reviews, motivation) scales with users; the local build is two versions ahead of the store. Shipping beats building right now.
   **Confirmed 22 Aug 2026, and it is now the only finding that matters:**
   PriceTab appears in *none* of the sector searches that surface every
   competitor below. Against them the feature list is already ahead — alerts,
   portfolio with cost basis, charts, 37 currencies, and a calls board with no
   equivalent anywhere in the category. Nothing on this page changes that
   except getting it in front of people.
2. **Price alerts are the sector's #1 requested feature** — and our sharpest retention lever. But push notifications cost our "zero permissions" claim; the in-tab-only alert variant preserves it. This trade-off deserves an explicit decision, not a default.
3. ~~**Coin coverage is our visible weakness** (~64 vs. thousands).~~
   **Re-measured 22 Aug 2026 and this does not hold.** On the Web Store today
   the extension carrying **10,000+ coins has 58 users**; the one with 3,000+
   has **127**; and the one that leads this category — ChartsTab, **1,000
   users, 5.0 from 99 reviews** — carries **500 pairs** and is otherwise
   simpler than PriceTab. Coverage does not sell here, and prioritising it as a
   funnel fix would have been work aimed at the wrong problem.
   Coverage is still worth building, for a different reason: **you cannot track
   what the app does not support**, so it is a portfolio and retention cost,
   paid by the people most invested in the product. Priced accordingly in §3.3.
4. **Portfolio tools are converging on "wealth management"** (allocation, cost basis, tax). Our tracking-only + local-only stance is a differentiator — portfolio v2 + a seasonal tax-affiliate line captures the trend without breaking privacy.
5. **Privacy is a moat, not a constraint.** No major competitor leads with zero permissions/no tracking. Every store asset, review reply and README line should say it first.
6. **Ratings compound.** Small frequent updates + replying to every review is the highest-ROI ongoing marketing; it's free and no competitor in the minimal-clone tier does it.

---

## Known Issues & Bugs

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Blocked price API left the tab blank for 7 seconds | High | Fixed 22 Aug 2026 | The retry ladder (1s → 2s → 4s) was being spent on a `TypeError` — no response at all, a CORS wall or region block — as well as on 5xx. Measured with Coinbase refusing everything: price line at **7,131 ms**, against 54 ms normally, with the tab reading "BTC PRICE" and nothing under it throughout. `NETWORK_ERROR_RETRIES = 1` → **1,063 ms** |
| Every range revalidated on a 30-second TTL | Medium | Fixed 22 Aug 2026 | A year chart was re-fetched on every new tab and every coin switch. `HISTORY_TTL` sizes each range to one point's worth of its own time. A tab opened 2 min later: 8 requests → **3** |
| Portfolio value chart summed series by position | High | Fixed 22 Aug 2026 | Different coins are quoted at different rates, so it added one coin's 2014 to another's 2023. The "vs BTC" stat read +15,839.5% where BTC did +190.2% over the window on screen |
| Cost basis had no currency | High | Fixed 22 Aug 2026 | Switching display currency re-read every `paid` in the new one. Lots and sales are stamped now, and anything in another currency is set aside rather than converted |
| Total and the change beside it covered different holdings | Medium | Fixed 22 Aug 2026 | The chart draws twelve and cannot draw an unchartable token; the header counted everything. It now says what it covers |
| Removing a holding, or importing over one, was unrecoverable | High | Fixed 22 Aug 2026 | Both took every lot and sale with them, one click, no confirmation. Undo bar, restored through the sanitizing path |
| "Unchecked runtime.lastError" on every new tab | Low | Fixed 22 Aug 2026 | `Boolean(x) && !chrome.runtime.lastError` short-circuits before reading the property. The underlying refusal was an installed manifest older than `8599cc3` — a reload in `chrome://extensions` clears that |
| *Nothing else known* | - | - | Report at GitHub Issues |

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
| [MONETIZATION.md](../internal/MONETIZATION.md) | Revenue strategy + market/competitor research |
| [CHANGELOG.md](../CHANGELOG.md) | Version history |
| [MARKETING_LAUNCH.md](../store/MARKETING_LAUNCH.md) | Launch checklist + copy templates |
| [STORE_DESCRIPTION.md](../store/STORE_DESCRIPTION.md) | Web Store listing content (canonical) |
| [STORE_ASSETS.md](../store/STORE_ASSETS.md) | Web Store asset specs |
| [../assets/mockups/README.md](../../assets/mockups/README.md) | Promo tile + screenshot export tools |

---

**Status Legend:** `[ ]` not started · `[x]` completed · `[~]` in progress · `[-]` blocked

When picking up a task: check dependencies → update status here → follow existing code patterns → test on Chrome/Edge/Brave → update CHANGELOG.
