# PriceTab - Development Roadmap

> Comprehensive development roadmap aligned with [VISION.md](VISION.md). Tasks are organized by priority, with clear acceptance criteria and dependencies.

---

## Project Status

| Metric | Value |
|--------|-------|
| **Current Version** | 1.0.0 |
| **Status** | Chrome Web Store Ready |
| **Codebase Size** | ~3,400 lines |
| **Next Milestone** | Chrome Web Store Launch |
| **Security Status** | Input validation complete |

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
- [x] 75+ cryptocurrencies available
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

---

## Phase 1: Chrome Web Store Launch

**Priority:** `CRITICAL` | **Target:** Q1 2026 | **Status:** In Progress

### 1.1 Store Visual Assets

| Task | Status | Effort | Owner |
|------|--------|--------|-------|
| Screenshots (9 total) | [x] | Low | Done |
| Small promotional tile (440x280) | [x] | Medium | Done |
| Large promotional tile (920x680) | [x] | Medium | Done |
| Marquee banner (1400x560) | [x] | Medium | Done |

**Assets Location:**
- Screenshots: `assets/screenshots/1-9.png`
- Small Tile: `assets/promotional/Small Tile.png`
- Large Tile: `assets/promotional/Large Tile.png`
- Marquee: `assets/promotional/Marquee.png`

### 1.2 Store Listing Content

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| Write 132-character summary | [x] | Low | See `docs/STORE_DESCRIPTION.md` |
| Write detailed description (2000+ chars) | [x] | Medium | See `docs/STORE_DESCRIPTION.md` |
| Select category: Productivity | [x] | Low | Productivity |
| Add privacy policy URL | [ ] | Low | Host on GitHub Pages |
| Setup support email | [ ] | Low | - |
| Prepare FAQ responses | [ ] | Low | Common questions |

**Store Description:** See `docs/STORE_DESCRIPTION.md` for ready-to-copy content.

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
| All 75+ coins load correctly | [ ] | High |
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

### 3.3 Widget System Foundation

| Widget | Status | Effort | API Source |
|--------|--------|--------|------------|
| Fear & Greed Index display | [ ] | Medium | Alternative.me |
| Ethereum Gas Tracker | [ ] | Medium | Etherscan / Alchemy |
| Quick stats bar (MCap, Volume, Dominance) | [ ] | High | CoinGecko |
| Whale Alert feed (optional) | [ ] | High | Whale Alert API |

**Design Considerations:**
- Widgets should be toggleable
- Minimal impact on load time
- Graceful fallback if API unavailable

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
| Split app.js when >5000 lines | [ ] | High | Low |
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
| [CODE_OPTIMIZATIONS.md](CODE_OPTIMIZATIONS.md) | Technical improvements |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [PRIVACY.md](PRIVACY.md) | Privacy policy |
| [STORE_ASSETS.md](STORE_ASSETS.md) | Web Store asset specs |

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

