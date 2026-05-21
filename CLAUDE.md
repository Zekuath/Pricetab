# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PriceTab** is a Chrome extension (Manifest V3) that displays live cryptocurrency price charts on every new tab. Built with React, D3.js, and styled-components - all bundled locally without a build process.

**Key Characteristics:**
- Single-page React application (~5600+ lines in `src/app.js`)
- No build process - edit and reload
- Privacy-first - all data stored in localStorage
- Coinbase public API for price data

## Development Workflow

**Testing Changes:**
```
1. Edit files in src/
2. Go to chrome://extensions/
3. Click reload icon on "PriceTab"
4. Open new tab to test
```

**Install Extension:**
```
1. chrome://extensions/ → Enable "Developer mode"
2. Click "Load unpacked" → select this directory
```

**Debug:**
- Right-click new tab → "Inspect" for DevTools
- Console: `localStorage.getItem('crypto_chart_coin_options')`
- Network tab for API response inspection

**Clear User Data:**
```javascript
localStorage.removeItem('crypto_chart_coin_options');
location.reload();
```

## Project Structure

```
├── src/
│   ├── app.js              # Main application (React + D3)
│   └── theme-init.js       # Prevents white flash on load
├── vendor/                 # Bundled dependencies (no npm)
│   ├── react.production.min.js
│   ├── react-dom.production.min.js
│   ├── styled-components.min.js
│   ├── d3.min.js
│   └── d3-interpolate-path.min.js
├── assets/icons/           # Extension icons (16, 48, 128, 512px)
├── docs/                   # Extended documentation
│   ├── VISION.md           # Feature roadmap
│   ├── TODO.md             # Development tasks
│   ├── CHANGELOG.md        # Version history
│   └── ...
├── manifest.json           # Chrome extension config
├── index.html              # Entry point
└── LICENSE                 # MIT (includes third-party attribution)
```

## Source Code Reference (src/app.js)

### Constants & Configuration

| Constant | Line | Description |
|----------|------|-------------|
| `lightColors` / `darkColors` | 45-69 | Theme color palettes |
| `API_BASE` | 105 | Coinbase API base URL |
| `CACHE_TTL` | 136 | Cache lifetime (30s) |
| `DEFAULT_COIN_OPTIONS` | 395 | Initial coins `["BTC", "ETH", "XRP", "LTC"]` |
| `SUGGESTED_COINS` | 397 | All 75+ supported coins |
| `STORAGE_KEY` | 562 | localStorage key |
| `PERIOD_OPTIONS` | 480 | Time period definitions |
| `CURRENCY_OPTIONS` | 511 | 37 supported currencies |

### Core Functions

| Function | Line | Purpose |
|----------|------|---------|
| `getCachedData()` | 144 | Retrieve from cache with TTL check |
| `setCachedData()` | 166 | Store in cache (first 10 coins only) |
| `fetchWithRetry()` | 206 | API calls with exponential backoff |
| `loadCoinOptionsFromStorage()` | 1013 | Load coins from localStorage |
| `saveCoinOptionsToStorage()` | 1040 | Persist coins to localStorage |
| `updateTabTitle()` | 1049 | Dynamic browser tab title |
| `scalePrices()` | 1143 | D3 chart data scaling |

### Component Classes

| Component | Line | Purpose |
|-----------|------|---------|
| `LineBase` | 1361 | D3 SVG chart rendering |
| `PeriodSwitcher` | 1591 | Time period buttons (1H-ALL) |
| `Overview` | 1714 | Price and change display |
| `SettingsPanel` | 3267 | Settings modal (coins, preferences) |
| `CryptoChart` | 4041 | Root component with all state |

### CryptoChart State

```javascript
{
  coinOptions: string[],      // User's coin list (persisted)
  coinIndex: number,          // Current coin index
  coin: string,               // Current coin symbol
  period: string,             // Time period (hour/day/week/month/year/all)
  currency: string,           // Display currency (USD, EUR, etc.)
  theme: string,              // 'auto' | 'light' | 'dark'
  refreshInterval: number,    // Update frequency in ms
  priceHistory: array,        // Chart data from API
  spot: object,               // Current price data
  isOnline: boolean,          // Network connectivity
  showSettings: boolean,      // Settings panel visibility
  activeTab: string,          // Settings tab ('coins' | 'preferences')
}
```

## API Integration

**Coinbase Public API (no auth required):**

```
Historical: https://www.coinbase.com/api/v2/prices/{COIN}-{CURRENCY}/historic?period={PERIOD}
Spot:       https://www.coinbase.com/api/v2/prices/{COIN}-{CURRENCY}/spot
```

**Periods:** `hour`, `day`, `week`, `month`, `year`, `all`

**Response Format:**
```javascript
// Historic
{ "data": { "prices": [{ "price": "43250.50", "time": 1640995200 }, ...] }}

// Spot
{ "data": { "amount": "43250.50", "currency": "USD" }}
```

**Rate Limits:** Not documented, using 30s polling to be safe.

## Caching System

- **TTL:** 30 seconds per entry
- **Max Coins:** First 10 in user's rotation
- **Cleanup:** Every 10 minutes (unused entries)
- **Pattern:** Stale-while-revalidate

## Theme System

1. `theme-init.js` runs before React (prevents white flash)
2. Detects system preference via `prefers-color-scheme`
3. User can override: 'auto', 'light', 'dark'
4. Colors in `lightColors` / `darkColors` objects

## Common Development Tasks

**Add new coin to suggestions:**
Edit `SUGGESTED_COINS` array at line 242

**Change default coins:**
Edit `DEFAULT_COIN_OPTIONS` at line 240

**Add new currency:**
Edit `CURRENCY_OPTIONS` array at line ~440

**Modify cache behavior:**
Edit `CACHE_TTL`, `MAX_CACHED_COINS` at lines 113-115

**Change polling interval options:**
Edit refresh interval options in SettingsPanel (~line 2200)

**Update icons (macOS):**
```bash
cd assets/icons
sips -z 16 16 graph.png --out icon16.png
sips -z 48 48 graph.png --out icon48.png
sips -z 128 128 graph.png --out icon128.png
```

## Dependencies

All pre-bundled in `vendor/` (no npm/yarn):

| Library | Version | Size | Purpose |
|---------|---------|------|---------|
| React | 16.5 | 9.5 KB | UI Framework |
| ReactDOM | 16.5 | 92 KB | DOM Rendering |
| D3.js | 5.7 | 232 KB | Chart Visualization |
| styled-components | 3.4.6 | 43 KB | CSS-in-JS |
| d3-interpolate-path | 2.0.1 | 3.4 KB | Path Animations |
| Babel Polyfill | 7.0.0 | 90 KB | ES6+ Support |

**External (allowed by CSP):**
- Normalize.css (codepenassets.com)
- Roboto Mono font (fonts.googleapis.com)

## Manifest V3 Constraints

- All scripts must be local (no CDN for JS)
- Zero permissions required (localStorage doesn't need permission)
- `"chrome_url_overrides": {"newtab": "index.html"}`
- No `eval()` or inline scripts

## Architecture Notes

**Why monolithic?**
- No build process = simpler deployment
- Single file = easier to understand flow
- Future: Consider splitting if exceeds 5000 lines

**Why class components?**
- React 16.5 (hooks not available)
- Future: Consider upgrading to React 18 with hooks

**Why D3 instead of lightweight alternatives?**
- Proven, well-documented
- Complex animations supported
- Future: Consider Lightweight Charts for bundle size

## Documentation

| File | Purpose |
|------|---------|
| `docs/VISION.md` | Feature roadmap, future plans |
| `docs/TODO.md` | Development tasks with phases |
| `docs/CHANGELOG.md` | Version history |
| `docs/PRIVACY.md` | Privacy policy |
| `docs/STORE_ASSETS.md` | Chrome Web Store assets guide |
| `docs/STORE_DESCRIPTION.md` | Chrome Web Store listing content |
| `docs/AI_GUIDELINES.md` | AI development rules and security |

### Chrome Web Store Policies (CRITICAL)

| File | Purpose |
|------|---------|
| `docs/policies/CHROME_STORE_POLICIES.md` | Complete CWS policy reference |
| `docs/policies/REJECTION_CODES.md` | All rejection codes and fixes |
| `docs/policies/SUBMISSION_CHECKLIST.md` | Pre-submission verification |
| `docs/policies/PRICETAB_COMPLIANCE.md` | PriceTab-specific compliance status |

**Key Policy Reminders:**
- **NO keyword spam** in store description (coin lists, comma-separated terms)
- Use **natural language**, avoid "BTC, ETH, XRP..." style listings
- Privacy policy URL must be in **designated field**, NOT in description
- **Single purpose**: "Crypto price charts" - don't add unrelated features
- **Zero permissions** = faster review approval
- Yellow Argon = Keyword Spam (most common rejection for this project)

## Security Guidelines (CRITICAL)

**Chrome Extension Context:**
- Manifest V3 enforces strict CSP (no eval, no inline scripts)
- All JS must be local files in vendor/
- localStorage for preferences only (no secrets)

**Before Any Code Change:**
- [ ] No hardcoded secrets or API keys
- [ ] User inputs validated against whitelists (SUGGESTED_COINS, CURRENCY_OPTIONS)
- [ ] No innerHTML with user data (XSS risk)
- [ ] Error handling on all API calls
- [ ] Memory cleanup in componentWillUnmount

**Input Validation Pattern:**
```javascript
// Always validate against whitelist
function isValidCoin(coin) {
  return typeof coin === 'string' && SUGGESTED_COINS.includes(coin.toUpperCase());
}
```

## Code Quality Rules

**File Size Warning:** `src/app.js` is ~5600+ lines (CRITICAL)
- Target: < 800 lines per file
- Future: Consider splitting into components/utils

**React 16.5 Patterns (No Hooks):**
```javascript
// State updates - use functional form
this.setState(prev => ({ count: prev.count + 1 }));

// Immutability - never mutate
this.setState(prev => ({ coins: [...prev.coins, newCoin] }));

// Cleanup - always in componentWillUnmount
componentWillUnmount() {
  clearInterval(this.refreshTimer);
}
```

**Code Review Checklist:**
- [ ] Functions < 50 lines
- [ ] Nesting < 4 levels
- [x] No console.log in production (removed)
- [ ] Named constants (no magic numbers)
- [ ] Error boundaries for graceful failures

## Quick Reference

```javascript
// Get current coin
const coin = this.state.coinOptions[this.state.coinIndex];

// Force refresh data
this.fetchData();

// Toggle settings
this.setState({ showSettings: !this.state.showSettings });

// Change period
this.setPeriod(null, 'week');

// Add coin programmatically
this.handleAddCoinOption('SOL');

// Inspect cache (debug only)
// cache is a Map object in memory
```
