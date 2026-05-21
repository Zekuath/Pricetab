# AI Development Guidelines for PriceTab

This document provides AI-assisted development guidelines adapted from battle-tested patterns. Use these rules when working with Claude Code on this project.

## Quick Reference

| Category | Priority | When to Check |
|----------|----------|---------------|
| Security | CRITICAL | Every code change |
| Code Quality | HIGH | Before commits |
| Performance | MEDIUM | New features |
| Refactoring | LOW | When file > 800 lines |

---

## 1. Security Guidelines (CRITICAL)

### Chrome Extension Security

PriceTab runs in a privileged browser context. Security is non-negotiable.

#### Content Security Policy (CSP)
```
Manifest V3 enforces strict CSP:
- No eval() or Function() constructors
- No inline scripts (onclick="...")
- All JS must be local files
- Only whitelisted external resources
```

#### localStorage Security
```javascript
// SAFE: Only store non-sensitive preferences
localStorage.setItem('crypto_chart_coin_options', JSON.stringify(coins));
localStorage.setItem('crypto_chart_theme', 'dark');

// NEVER store in localStorage:
// - API keys or tokens
// - User credentials
// - Personally identifiable information (PII)
```

#### API Request Safety
```javascript
// CURRENT: Coinbase public API (no auth)
// Safe because: No secrets, public data only

// If adding authenticated APIs in future:
// - Store keys in chrome.storage.local (encrypted)
// - Never expose keys in source code
// - Use background service worker for API calls
```

### XSS Prevention

```javascript
// DANGER: Never use innerHTML with user data
element.innerHTML = userInput; // XSS vulnerability

// SAFE: Use textContent for user data
element.textContent = userInput;

// SAFE: React escapes by default
<span>{userInput}</span>

// DANGER: dangerouslySetInnerHTML without sanitization
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### Input Validation Checklist

Before processing any user input:
- [ ] Coin symbols: Validate against SUGGESTED_COINS whitelist
- [ ] Currency codes: Validate against CURRENCY_OPTIONS whitelist
- [ ] Period values: Validate against PERIOD_OPTIONS whitelist
- [ ] Numeric inputs: Parse and validate ranges
- [ ] Array inputs: Check length limits (max 20 coins)

```javascript
// Example: Validate coin input
function isValidCoin(coin) {
  return typeof coin === 'string' &&
         SUGGESTED_COINS.includes(coin.toUpperCase());
}

// Example: Validate coin array
function validateCoinOptions(coins) {
  if (!Array.isArray(coins)) return DEFAULT_COIN_OPTIONS;
  if (coins.length === 0) return DEFAULT_COIN_OPTIONS;
  if (coins.length > 20) coins = coins.slice(0, 20);
  return coins.filter(isValidCoin);
}
```

### Security Review Triggers

Run security review when:
- Adding new API endpoints or external fetches
- Modifying localStorage read/write operations
- Adding user input handling
- Changing manifest.json permissions
- Updating vendor dependencies

---

## 2. Code Quality Standards

### File Size Guidelines

| Size | Status | Action |
|------|--------|--------|
| < 400 lines | Ideal | Continue |
| 400-800 lines | Acceptable | Monitor |
| 800-1500 lines | Warning | Plan refactor |
| > 1500 lines | Critical | Refactor needed |

**Current: `src/app.js` is ~5600+ lines - CRITICAL**

Future refactoring target:
```
src/
├── app.js              # Main entry, state management (~500 lines)
├── components/
│   ├── Chart.js        # D3 chart rendering (~400 lines)
│   ├── Overview.js     # Price display (~200 lines)
│   ├── PeriodSwitcher.js (~150 lines)
│   └── SettingsPanel.js (~400 lines)
├── utils/
│   ├── api.js          # Coinbase API calls (~150 lines)
│   ├── cache.js        # Caching logic (~100 lines)
│   ├── format.js       # Price/date formatting (~100 lines)
│   └── storage.js      # localStorage helpers (~50 lines)
└── constants/
    └── config.js       # All constants (~200 lines)
```

### React Class Component Best Practices

PriceTab uses React 16.5 (class components, no hooks).

```javascript
// STATE UPDATES: Always use functional form for derived state
// WRONG
this.setState({ count: this.state.count + 1 });

// CORRECT
this.setState(prevState => ({ count: prevState.count + 1 }));

// BINDING: Bind in constructor, not in render
// WRONG (creates new function each render)
<button onClick={this.handleClick.bind(this)}>

// CORRECT (bind once in constructor)
constructor(props) {
  super(props);
  this.handleClick = this.handleClick.bind(this);
}

// CLEANUP: Always clean up in componentWillUnmount
componentWillUnmount() {
  clearInterval(this.refreshTimer);
  window.removeEventListener('online', this.handleOnline);
  window.removeEventListener('offline', this.handleOffline);
}
```

### Immutability Pattern

```javascript
// ARRAYS - Never mutate directly
// WRONG
this.state.coinOptions.push(newCoin);

// CORRECT
this.setState(prevState => ({
  coinOptions: [...prevState.coinOptions, newCoin]
}));

// OBJECTS - Use spread operator
// WRONG
this.state.settings.theme = 'dark';

// CORRECT
this.setState(prevState => ({
  settings: { ...prevState.settings, theme: 'dark' }
}));

// REMOVING FROM ARRAY
this.setState(prevState => ({
  coinOptions: prevState.coinOptions.filter(c => c !== coinToRemove)
}));
```

### Error Handling

```javascript
// API calls must have error handling
async fetchData() {
  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    this.setState({ priceHistory: data, error: null });
  } catch (error) {
    console.error('Fetch failed:', error);
    this.setState({
      error: 'Unable to load data. Check your connection.',
      isLoading: false
    });
    // Don't crash - show cached data or graceful fallback
  }
}
```

### Code Quality Checklist

Before any commit:
- [x] No console.log statements (removed from production)
- [ ] All async operations have error handling
- [ ] State updates use functional form when needed
- [ ] Event listeners cleaned up in componentWillUnmount
- [ ] No magic numbers (use named constants)
- [ ] Functions are < 50 lines
- [ ] Nesting depth < 4 levels

---

## 3. Performance Guidelines

### D3 Chart Optimization

```javascript
// EXPENSIVE: Full re-render on every update
// Avoid recreating SVG elements unnecessarily

// BETTER: Update only data-dependent attributes
// Use D3 enter/update/exit pattern efficiently

// CURRENT OPTIMIZATION in LineBase:
// - Transition animations for smooth updates
// - Reuse existing DOM elements when possible
// - Debounce resize handlers
```

### API & Caching

```javascript
// Current caching strategy (good):
const CACHE_TTL = 30000;        // 30 seconds
const MAX_CACHED_COINS = 10;    // Limit memory usage

// Stale-while-revalidate pattern:
// 1. Return cached data immediately
// 2. Fetch fresh data in background
// 3. Update UI when fresh data arrives
```

### Memory Management

```javascript
// Clear old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL * 10) {
      cache.delete(key);
    }
  }
}, 600000); // Every 10 minutes

// Limit stored data
// - Max 20 coins in rotation
// - Max 10 coins in cache
// - Clear localStorage on uninstall (manifest.json)
```

---

## 4. Code Review Checklist

### Critical Issues (Block Commit)
- [ ] No hardcoded secrets or API keys
- [ ] No eval() or innerHTML with user data
- [ ] All user inputs validated
- [ ] Error handling on all API calls
- [ ] No memory leaks (intervals, listeners)

### High Priority (Should Fix)
- [ ] Functions > 50 lines need splitting
- [ ] Nesting > 4 levels needs flattening
- [ ] Missing error handling
- [x] Console.log statements (removed)
- [ ] Magic numbers without constants

### Medium Priority (Consider)
- [ ] Performance optimizations
- [ ] Code duplication
- [ ] Unclear variable names
- [ ] Missing comments on complex logic

---

## 5. Refactoring Guide

### When to Refactor

| Trigger | Action |
|---------|--------|
| File > 800 lines | Extract components/utilities |
| Function > 50 lines | Split into smaller functions |
| Duplicate code > 3 times | Create reusable utility |
| Complex conditionals | Extract to named functions |
| Before adding new features | Clean related code first |

### Safe Refactoring Process

```
1. BACKUP: Create git branch before refactoring
2. TEST: Verify current behavior works
3. EXTRACT: Move code to new location
4. VERIFY: Test that behavior unchanged
5. CLEANUP: Remove old code
6. COMMIT: Small, focused commits
```

### Refactoring Priority for PriceTab

1. **Extract Constants** (Easy, Safe)
   - Move all constants to separate section/file
   - Named exports for each constant group

2. **Extract Utilities** (Medium)
   - `formatPrice()`, `formatDate()` to utils
   - `fetchWithRetry()`, cache functions to api utils

3. **Extract Components** (Complex)
   - `SettingsPanel` is self-contained, extract first
   - `PeriodSwitcher` is simple, extract next
   - `Chart` components need careful state handling

---

## 6. AI Collaboration Tips

### Effective Prompts

```
GOOD: "Add rate limiting to the API fetch function with
       exponential backoff, max 3 retries, starting at 1s delay"

BAD:  "Make the API better"

GOOD: "Refactor SettingsPanel (lines 2112-2650) into a
       separate file, keeping the same props interface"

BAD:  "Split up the code"
```

### Context to Provide

When asking for help, include:
- Relevant line numbers from CLAUDE.md reference
- Current behavior vs expected behavior
- Any constraints (no build process, React 16.5, etc.)
- Error messages if debugging

### Review AI Output

Always verify AI-generated code:
- [ ] Follows immutability patterns
- [ ] Uses class component syntax (not hooks)
- [ ] Respects CSP constraints (no eval)
- [ ] Handles errors appropriately
- [ ] Doesn't introduce security issues

---

## Quick Commands

```javascript
// Debug current state
console.log(JSON.stringify(this.state, null, 2));

// Inspect cache
console.log([...cache.entries()]);

// Check localStorage
console.log(localStorage.getItem('crypto_chart_coin_options'));

// Force refresh
this.fetchData();

// Clear all user data
localStorage.clear();
location.reload();
```

---

*Guidelines adapted from [everything-claude-code](https://github.com/affaan-m/everything-claude-code) for PriceTab Chrome extension context.*
