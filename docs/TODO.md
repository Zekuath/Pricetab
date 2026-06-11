# PriceTab - Development Roadmap

> Comprehensive development roadmap aligned with [VISION.md](VISION.md). Tasks are organized by priority, with clear acceptance criteria and dependencies.

---

## Project Status

| Metric | Value |
|--------|-------|
| **Current Version** | 1.2.0 (staged — not yet uploaded) |
| **Live Build** | Older version published, ~0 installs |
| **Status** | Pre-relaunch: copy + visuals + marketing refresh |
| **Codebase Size** | ~6,400 lines |
| **Next Milestone** | Relaunch 1.2.0 with new listing |
| **Security Status** | Input validation complete |

---

## Active Focus

> **Current priority: bug fixes (in progress).** The store/visual/marketing relaunch
> work is staged and tracked in **Phase 1** below; resume it after the bugs are fixed.

### Bug Fixes (do first)
| Issue | Status | Notes |
|-------|--------|-------|
| Page ticker bar still visible behind open settings | [x] | Added `showSettings` to ticker render guard (`src/app.js`) |
| Settings panel resizes/jumps between tabs (click target moves) | [x] | `SettingsCard` now fixed height + flex column; `TabContent` scrolls internally |
| Widgets popped in instantly when enabled — no entrance animation | [x] | Shared `widgetAppear` fade+rise on `WidgetCard`; widgets enabled in settings defer mounting (`pendingWidgetReveal`) so the animation plays on panel close |
| Conditional sub-settings popped in/out instantly (e.g. Ticker Format, Page Ticker Position) | [x] | Shared `SettingReveal` with `open` prop — smooth fade + accordion expand AND collapse (always mounted, CSS transition) |
| Collapsible/dropdown sections in settings (smooth expand) | [ ] | Enhancement — decide which items become dropdowns |

---

## Completed Features

Core functionality that has been implemented and tested.

### Core Price Display
- [x] Real-time price charts with D3.js animations
- [x] Smooth path transitions between data updates
- [x] 6 time periods (1H, 1D, 1W, 1M, 1Y, ALL)
- [x] Dynamic browser tab title with live prices
- [x] Price change percentage with color coding

### Cryptocurrency Support
- [x] 60+ cryptocurrencies available
- [x] 4 default coins (BTC, ETH, XRP, LTC)
- [x] Coin search functionality in settings
- [x] Custom coin list per user

### Multi-Currency
- [x] 37 fiat currency options
- [x] Currency symbol display
- [x] Configurable decimal places (2, 4, 6, 8)
- [x] Number format options (US, EU, Space)

### User Preferences
- [x] Dark / Light / Auto theme modes
- [x] System theme detection (`prefers-color-scheme`)
- [x] Configurable refresh intervals (10s, 30s, 1m, 5m)
- [x] Drag-and-drop coin reordering
- [x] All settings persisted to localStorage

### Performance & Reliability
- [x] Smart caching with 30s TTL
- [x] Cache cleanup every 10 minutes
- [x] Maximum 10 coins cached
- [x] Retry mechanism with exponential backoff
- [x] Offline detection and handling

### Security
- [x] Input validation against SUGGESTED_COINS whitelist
- [x] Maximum 20 coins limit enforced
- [x] Coin symbols normalized to uppercase
- [x] Debug console.log removed from production

### User Interface
- [x] Skeleton loading states
- [x] Settings modal with tabs (Coins / Preferences)
- [x] Responsive design
- [x] Monospace typography (Roboto Mono)
- [x] Hover tooltips on all interactive elements
- [x] Scrolling price ticker bar (top/bottom, configurable)
- [x] Settings and widget-toggle buttons aligned across screen sizes
- [x] Bottom widget row horizontally scrollable on small screens
- [x] Chart fills available space without overflowing the controls

### Widget System
- [x] Fear & Greed Index widget (Alternative.me)
- [x] Market Overview widget (total MCap + volume)
- [x] BTC Halving Countdown widget
- [x] RSI Widget (14-period, coin-specific)
- [x] Funding Rate widget (OKX)
- [x] Long/Short Ratio widget (Bybit)
- [x] Open Interest widget (OKX)
- [x] Liquidations widget (OKX Public API)
- [x] Altcoin Season Index widget (Coinlore)
- [x] Watchlist heatmap widget
- [x] Top Movers (24h) widget
- [x] One-click widget presets (Holder / Trader / Minimal)
- [x] Enable/disable widgets from settings
- [x] Drag-and-drop widget reordering
- [x] Hide-all / show-all widgets toggle button

---

## Phase 1: Chrome Web Store Launch

**Priority:** `CRITICAL` | **Target:** Q1 2026 | **Status:** In Progress

### 1.1 Store Visual Assets

> **Old screenshots are outdated** — they predate the 1.1.x widget panel + ticker bar.
> Must be re-captured from the running 1.2.0 build before relaunch.
> Mockup/templating tools live in `assets/mockups/` (see its `README.md` for export steps).

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| Capture fresh screenshots (1.2.0, widgets/ticker visible) | [x] | Medium | 6 done → `assets/screenshots/01-06`; raw in `assets/mockups/raw/` |
| Wrap screenshots in caption frames (1280×800) | [x] | Low | `assets/mockups/store-frames.html` |
| Re-export Small Tile (440×280) | [ ] | Low | `assets/mockups/promo-tiles.html` (current tiles kept) |
| Re-export Large Tile (920×680) | [ ] | Low | `assets/mockups/promo-tiles.html` (current tiles kept) |
| Re-export Marquee (1400×560) | [ ] | Low | `assets/mockups/promo-tiles.html` (current tiles kept) |
| Mockup/template HTML created | [x] | Medium | `assets/mockups/store-frames.html` + `promo-tiles.html` |

**Asset status:**
- Screenshots: `assets/screenshots/01-hero … 06-themes.png` (fresh, 1.2.0)
- Promo tiles: `assets/promotional/*.png` (kept)

### 1.2 Store Listing Content

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| Rewrite extension name (SEO: "new tab") | [x] | Low | `manifest.json` + `STORE_DESCRIPTION.md` |
| Write 132-character summary | [x] | Low | 126 chars — `docs/STORE_DESCRIPTION.md` |
| Rewrite detailed description (trust-first) | [x] | Medium | `docs/STORE_DESCRIPTION.md` |
| Fix keyword spam (CWS policy compliance) | [x] | Low | No coin/currency lists |
| Select category: Productivity | [x] | Low | Productivity |
| Host privacy policy + add URL in CWS field | [~] | Low | `privacy.html` exists — needs GitHub Pages hosting |
| Setup support email | [ ] | Low | Add in CWS dashboard |
| Prepare FAQ responses | [ ] | Low | Common questions |

**Store Description:** See `docs/STORE_DESCRIPTION.md` (single canonical source — never copy elsewhere).

### 1.3 Pre-Launch Quality Assurance

#### Browser Compatibility
| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome | Latest 3 versions | [ ] | Primary target |
| Chrome | Canary | [ ] | Future compatibility |
| Edge | Latest | [ ] | Chromium-based |
| Brave | Latest | [ ] | Chromium-based |
| Opera | Latest | [ ] | Chromium-based |

#### Functional Testing
| Test Case | Status | Priority |
|-----------|--------|----------|
| All 60+ coins load correctly | [ ] | High |
| All 6 time periods work | [ ] | High |
| All 37 currencies display correctly | [ ] | High |
| Theme switching (auto/light/dark) | [ ] | High |
| Offline mode graceful handling | [ ] | High |
| Settings persistence across sessions | [ ] | High |
| Drag-and-drop coin reordering | [ ] | Medium |
| Tab title updates with price | [ ] | Medium |
| Cache invalidation works | [ ] | Medium |
| Memory usage under 100MB | [ ] | Medium |

#### Console & Errors
| Task | Status | Priority |
|------|--------|----------|
| Clear all console errors | [x] | Critical |
| Clear all console warnings | [x] | High |
| No uncaught promise rejections | [ ] | High |
| No memory leaks (1h runtime test) | [ ] | Medium |

### 1.4 Manifest & Permissions Audit

| Task | Status | Notes |
|------|--------|-------|
| Verify minimal permissions | [x] | Zero permissions required |
| Check CSP compliance | [x] | No inline scripts |
| Validate icon sizes (16, 48, 128) | [x] | All present |
| Test manifest.json validity | [x] | Chrome validates |

### 1.5 Marketing & Launch

> Full step-by-step plan with copy-paste templates: **`docs/MARKETING_LAUNCH.md`**.
> Goal: first real installs + first 10 reviews (4.5★+) for the ~0-install listing.

#### Phase 0 — Store readiness (before telling anyone)
| Task | Status | Priority |
|------|--------|----------|
| Upload 1.2.0 with new title + description | [ ] | Critical |
| Host privacy policy + URL in CWS Privacy field | [ ] | Critical |
| Add support email in dashboard | [ ] | High |
| Replace screenshots (first 3 = one benefit each) | [ ] | High |
| Self-test on a clean Chrome profile for a day | [ ] | Medium |

#### Phase 1 — Seed first reviews (week 1)
| Task | Status | Priority |
|------|--------|----------|
| Ask 8–12 contacts for honest reviews | [ ] | Critical |
| Post in 2–3 communities you already belong to | [ ] | High |
| Reach 5+ reviews, 4.5★+ before public launch | [ ] | High |

#### Phase 2 — Owned channels (week 1–2)
| Task | Status | Priority |
|------|--------|----------|
| Polish GitHub README (hero shot, pitch, install link) | [ ] | High |
| Add repo topics for organic discovery | [ ] | Medium |
| X/Twitter launch thread (template ready) | [ ] | Medium |

#### Phase 3 — Launch pushes (week 2–3, spaced out)
| Task | Status | Priority |
|------|--------|----------|
| Product Hunt launch (Tue–Thu, 12:01 AM PT) | [ ] | High |
| Reddit value-first posts (r/SideProject, r/chrome_extensions) | [ ] | Medium |
| Show HN post | [ ] | Medium |
| Indie Hackers "I shipped this" | [ ] | Low |

#### Phase 4 — Ongoing (week 3+)
| Task | Status | Priority |
|------|--------|----------|
| Reply to every store review | [ ] | High |
| Ship a small update every few weeks | [ ] | Medium |
| Track installs weekly, double down on best channel | [ ] | Medium |

---

## Phase 2: User Experience Polish

**Priority:** `HIGH` | **Target:** Q1 2026 | **Status:** Planned

### 2.1 Error Handling & Feedback

| Task | Status | Effort | Priority |
|------|--------|--------|----------|
| User-friendly API error messages | [ ] | Medium | High |
| "Retry" button on fetch failures | [ ] | Low | High |
| localStorage quota exceeded handling | [ ] | Medium | Medium |
| Invalid/unsupported coin feedback | [ ] | Low | Medium |
| Network timeout indication | [ ] | Low | Medium |
| Rate limit warning display | [ ] | Low | Low |

**Technical Notes:**
- Error messages should be non-technical
- Include actionable suggestions
- Log technical details to console only

### 2.2 Performance Optimization

| Task | Status | Effort | Priority |
|------|--------|--------|----------|
| Add loading spinner for initial fetch | [ ] | Low | High |
| Lighthouse audit (target: 90+ all categories) | [ ] | Medium | High |
| Memory profiling and optimization | [ ] | Medium | Medium |
| Bundle size analysis | [ ] | Low | Medium |
| Reduce D3 import size | [ ] | High | Low |
| Image lazy loading (if any) | [ ] | Low | Low |

**Current Metrics to Improve:**
- First Contentful Paint: Target < 500ms
- Largest Contentful Paint: Target < 1s
- Memory usage: Target < 50MB idle

### 2.3 Keyboard Navigation

| Shortcut | Action | Status | Priority |
|----------|--------|--------|----------|
| `←` / `→` | Previous / Next coin | [ ] | High |
| `1` - `6` | Time period shortcuts | [ ] | High |
| `S` or `Esc` | Toggle settings modal | [ ] | High |
| `T` | Toggle theme | [ ] | Medium |
| `/` | Focus coin search | [ ] | Medium |
| `?` | Show shortcuts help | [ ] | Low |
| `R` | Manual refresh | [ ] | Low |

**Implementation Notes:**
- Use `keydown` event on document
- Prevent shortcuts when input is focused
- Add visual indicator for current shortcuts

### 2.4 Visual Enhancements

| Task | Status | Effort | Priority |
|------|--------|--------|----------|
| Custom themed scrollbar for settings | [x] | Low | Medium |
| Add coin logos/icons | [ ] | Medium | Medium |
| Loading skeleton improvements | [ ] | Low | Low |
| Subtle hover animations | [ ] | Low | Low |
| Price change flash animation | [ ] | Medium | Low |

---

## Phase 3: Power User Features

**Priority:** `MEDIUM` | **Target:** Q2 2026 | **Status:** Planned

### 3.1 Price Alerts System

| Task | Status | Effort | Dependencies |
|------|--------|--------|--------------|
| Alert data model design | [ ] | Low | - |
| Price target UI (above/below) | [ ] | Medium | - |
| Percentage change alerts | [ ] | Medium | - |
| Browser notification integration | [ ] | Medium | Chrome Notifications API |
| Sound alerts (optional, muted by default) | [ ] | Low | - |
| Alert history with timestamps | [ ] | Medium | - |
| Max 10 active alerts limit | [ ] | Low | - |
| Alert persistence in localStorage | [ ] | Low | - |

**Data Structure:**
```javascript
{
  id: "uuid",
  coin: "BTC",
  type: "above" | "below" | "percent_change",
  target: 50000,
  currency: "USD",
  created: timestamp,
  triggered: timestamp | null,
  active: boolean
}
```

### 3.2 Mini Portfolio Mode

| Task | Status | Effort | Dependencies |
|------|--------|--------|--------------|
| Holdings data structure | [ ] | Low | - |
| "Add holding" UI | [ ] | Medium | - |
| Total portfolio value calculation | [ ] | Medium | - |
| 24h profit/loss display | [ ] | Medium | - |
| Portfolio toggle in settings | [ ] | Low | - |
| JSON export functionality | [ ] | Low | - |
| JSON import functionality | [ ] | Medium | - |
| Portfolio view on main screen | [ ] | High | - |

**Privacy Note:** All data local, no cloud sync in Phase 3.

### 3.3 Widget System Foundation ✅ COMPLETED

| Widget | Status | API Source |
|--------|--------|------------|
| Fear & Greed Index | [x] Done | Alternative.me |
| Market Overview (MCap + Volume + Dominance) | [x] Done | Coinlore |
| BTC Halving Countdown | [x] Done | mempool.space |
| RSI (14-period) | [x] Done | Coinbase history |
| Funding Rate | [x] Done | OKX |
| Long/Short Ratio | [x] Done | Bybit |
| Open Interest | [x] Done | OKX |
| Liquidations (24h) | [x] Done | OKX Public API |
| Altcoin Season Index | [x] Done | Coinlore Global |
| Watchlist heatmap | [x] Done | Coinbase (sweep) |
| Top Movers (24h) | [x] Done | Coinbase (sweep) |

### 3.4 Additional Widgets (Planned)

| Widget | Status | Effort | API Source |
|--------|--------|--------|------------|
| Ethereum Gas Tracker | [ ] | Medium | Etherscan / Blocknative |
| Whale Alert feed | [ ] | High | Whale Alert API |
| Crypto news feed | [ ] | High | CryptoPanic |

---

## Phase 4: Advanced Analytics

**Priority:** `LOW` | **Target:** Q3-Q4 2026 | **Status:** Future

### 4.1 Technical Indicators

| Indicator | Status | Effort | Complexity |
|-----------|--------|--------|------------|
| RSI (Relative Strength Index) | [ ] | High | Medium |
| Moving Averages (SMA, EMA) | [ ] | Medium | Low |
| MACD indicator | [ ] | High | High |
| Bollinger Bands | [ ] | High | Medium |
| Volume bars on chart | [ ] | Medium | Low |
| Support/Resistance lines | [ ] | High | High |

**Prerequisites:**
- More historical data points
- Performance optimization for calculations

### 4.2 Chart Enhancements

| Feature | Status | Effort | Priority |
|---------|--------|--------|----------|
| Candlestick chart option | [ ] | High | Medium |
| Comparison mode (2 coins overlay) | [ ] | High | Low |
| Zoom and pan gestures | [ ] | High | Low |
| Crosshair with price display | [ ] | Medium | Low |
| Time axis improvements | [ ] | Medium | Low |

### 4.3 External Integrations

| Integration | Status | Effort | API |
|-------------|--------|--------|-----|
| Crypto news feed | [ ] | High | CryptoPanic |
| Social sentiment indicator | [ ] | High | LunarCrush |
| DeFi yields widget | [ ] | Medium | DeFiLlama |
| On-chain metrics | [ ] | High | Glassnode |

---

## Phase 5: Platform Expansion

**Priority:** `LOW` | **Target:** 2027 | **Status:** Future

### 5.1 Multi-Browser Support

| Browser | Status | Effort | Notes |
|---------|--------|--------|-------|
| Firefox WebExtension | [ ] | Medium | Minor API differences |
| Safari Web Extension | [ ] | High | Xcode required |
| Chrome Sync storage | [ ] | Medium | Replace localStorage |

### 5.2 Internationalization (i18n)

| Language | Status | Priority | Translator |
|----------|--------|----------|------------|
| English (default) | [x] | - | Built-in |
| Turkish | [ ] | High | Needed |
| Spanish | [ ] | Medium | Needed |
| German | [ ] | Low | Needed |
| Portuguese | [ ] | Low | Needed |

**Implementation:**
- i18n framework needed (e.g., i18next)
- JSON translation files
- Language picker in settings

---

## Technical Debt

### Code Quality

| Task | Status | Effort | Priority |
|------|--------|--------|----------|
| Split app.js (currently ~5600 lines, over threshold) | [~] | High | Medium |
| Add ESLint configuration | [ ] | Low | Medium |
| Add Prettier for formatting | [ ] | Low | Medium |
| TypeScript migration | [ ] | Very High | Low |
| React 18 upgrade (hooks) | [ ] | Very High | Low |
| Component documentation | [ ] | Medium | Low |

### Testing Infrastructure

| Task | Status | Effort | Priority |
|------|--------|--------|----------|
| Jest setup | [ ] | Medium | Low |
| React Testing Library setup | [ ] | Medium | Low |
| E2E tests with Playwright | [ ] | High | Low |
| API mocking layer | [ ] | Medium | Low |
| CI/CD pipeline | [ ] | Medium | Low |

### Build System (Optional)

| Task | Status | Effort | Priority |
|------|--------|--------|----------|
| Vite bundler setup | [ ] | Medium | Low |
| Source maps generation | [ ] | Low | Low |
| Code minification | [ ] | Low | Low |
| Tree-shaking optimization | [ ] | Medium | Low |

---

## Quick Wins Backlog

High-impact, low-effort tasks for immediate value.

| Task | Effort | Impact | Phase | Status |
|------|--------|--------|-------|--------|
| Take store screenshots | Low | Critical | 1 | [x] Done |
| Write store description | Low | Critical | 1 | [x] Done |
| Create promotional tiles | Low | Critical | 1 | [x] Done |
| Clear console errors/warnings | Low | High | 1 | [x] Done |
| Add keyboard shortcut: ←/→ | Low | High | 2 | [ ] |
| Add keyboard shortcut: 1-6 | Low | High | 2 | [ ] |
| Add "retry" button on error | Low | Medium | 2 | [ ] |
| Loading spinner | Low | Medium | 2 | [ ] |

---

## Known Issues & Bugs

Track and prioritize bug fixes.

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| *No known issues* | - | - | Report at GitHub Issues |

---

## Success Metrics & Goals

### Launch Goals (Month 1)
- [ ] 1,000+ users
- [ ] 4.5+ star rating
- [ ] < 0.1% crash rate
- [ ] < 1s load time
- [ ] Zero critical bugs

### Growth Goals
- [ ] 10,000 users by Month 3
- [ ] 50,000 users by Month 6
- [ ] 100,000 users by Year 1
- [ ] Featured in Chrome Web Store

---

## Current Strengths

What's working well:
- Clean, minimal UI design
- Fast loading (no build process)
- Privacy-first architecture
- Excellent drag-and-drop UX
- Responsive across screen sizes
- Comprehensive caching system
- Robust error recovery (retry mechanism)

## Areas for Improvement

What needs attention:
- No loading spinner for initial fetch
- Limited error messages (too technical)
- No keyboard navigation
- Single large source file
- No automated tests
- No coin logos/icons

---

## References

| Document | Purpose |
|----------|---------|
| [VISION.md](VISION.md) | Long-term feature vision |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [PRIVACY.md](PRIVACY.md) | Privacy policy |
| [STORE_DESCRIPTION.md](STORE_DESCRIPTION.md) | Web Store listing content (canonical) |
| [STORE_ASSETS.md](STORE_ASSETS.md) | Web Store asset specs |
| [MARKETING_LAUNCH.md](MARKETING_LAUNCH.md) | Launch checklist + copy templates |
| [../assets/mockups/README.md](../assets/mockups/README.md) | Promo tile + screenshot export tools |

---

## Contributing

When picking up a task:
1. Check dependencies are completed
2. Update status in this file
3. Follow existing code patterns
4. Test on Chrome, Edge, Brave minimum
5. Update CHANGELOG.md with changes

**Status Legend:**
- `[ ]` - Not started
- `[x]` - Completed
- `[~]` - In progress
- `[-]` - Blocked/On hold

