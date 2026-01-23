# Code Optimization Recommendations

This document outlines specific code improvements for PriceTab to make it more robust, performant, and maintainable.

---

## 🚨 Critical Issues to Fix

### 1. No Error Handling for API Failures

**Current Problem:**
```javascript
// script.js lines 295-306
const fetchValueHistory = async (coin, period) => {
  const d = await fetch(`${API_BASE}${coin}-USD/${API_HISTORY}${period}`).then(
    (r) => r.json()
  );
  // No try-catch, no network error handling, no timeout
```

**Issues:**
- Network failures cause silent crashes
- No user feedback when API is down
- No retry mechanism
- No timeout (can hang forever)

**Recommended Fix:**
```javascript
// Add retry with exponential backoff
const fetchWithRetry = async (url, retries = 3, backoff = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      const isLastAttempt = i === retries - 1;
      if (isLastAttempt) throw error;

      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
    }
  }
};

const fetchValueHistory = async (coin, period) => {
  try {
    const d = await fetchWithRetry(`${API_BASE}${coin}-USD/${API_HISTORY}${period}`);
    const prices = d?.data?.prices;

    if (Array.isArray(prices) && prices.length > 0) {
      return formatValueHistory(prices);
    }

    throw new Error(`Invalid price data for ${coin}`);
  } catch (error) {
    console.error(`Failed to fetch ${coin} history:`, error);
    throw error; // Re-throw for component to handle
  }
};
```

---

### 2. No Loading States

**Current Problem:**
- User sees blank screen while data loads
- No indication of what's happening
- Poor user experience on slow connections

**Recommended Fix:**

Add loading state to CryptoChart component:

```javascript
// In CryptoChart state:
state = {
  // ... existing state
  isLoading: true,
  error: null,
}

// In fetchData method:
fetchData = async () => {
  this.setState({ isLoading: true, error: null });

  try {
    // ... existing fetch logic
    this.setState({
      currentValue,
      valueHistory,
      isLoading: false
    });
  } catch (error) {
    this.setState({
      isLoading: false,
      error: error.message
    });
  }
}

// In render method:
render() {
  const { isLoading, error } = this.state;

  if (isLoading && !this.state.currentValue) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={this.fetchData} />;
  }

  // ... normal render
}
```

**Create Loading Component:**
```javascript
const LoadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};

  &::after {
    content: '';
    width: 40px;
    height: 40px;
    border: 4px solid #333;
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
```

---

### 3. No Cleanup of Intervals/Timeouts

**Current Problem:**
```javascript
// In componentDidMount and fetchData:
this.intervalId = setInterval(this.fetchData, 30000);
this.fetchTimeout = setTimeout(this.fetchData, 30000);

// But no cleanup on unmount!
```

**Issues:**
- Memory leaks
- Fetch continues even after unmount
- Can cause errors in unmounted components

**Recommended Fix:**
```javascript
componentWillUnmount() {
  // Clear all timers
  if (this.intervalId) {
    clearInterval(this.intervalId);
  }
  if (this.fetchTimeout) {
    clearTimeout(this.fetchTimeout);
  }
}
```

---

### 4. Race Conditions in Async Fetches

**Current Problem:**
- Multiple fetch requests can overlap
- Responses can arrive out of order
- Stale data might overwrite fresh data

**Recommended Fix:**
```javascript
class CryptoChart extends PureComponent {
  constructor(props) {
    super(props);
    this.fetchCounter = 0; // Track fetch requests
  }

  fetchData = async () => {
    const currentFetch = ++this.fetchCounter;
    clearTimeout(this.fetchTimeout);

    try {
      const { coinIndex, period, coinOptions } = this.state;
      const activeCoin = coinOptions[coinIndex] || coinOptions[0];

      if (!activeCoin) return;

      const [currentValue, valueHistory] = await Promise.all([
        fetchCurrentValue(activeCoin),
        fetchValueHistory(activeCoin, period)
      ]);

      // Only update if this is still the latest fetch
      if (currentFetch === this.fetchCounter) {
        this.setState({ currentValue, valueHistory });
      }
    } catch (error) {
      console.error('Fetch error:', error);
      if (currentFetch === this.fetchCounter) {
        this.setState({ error: error.message });
      }
    }

    this.fetchTimeout = setTimeout(this.fetchData, 30000);
  }
}
```

---

## ⚡ Performance Optimizations

### 5. Debounce Rapid State Updates

**Problem:**
Rapid coin cycling or period changes cause unnecessary re-renders

**Fix:**
```javascript
// Add debounce utility
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Use in component:
constructor(props) {
  super(props);
  this.debouncedFetch = debounce(this.fetchData, 300);
}

setPeriod = (e, period) => {
  this.setState({ period });
  this.debouncedFetch(); // Instead of immediate fetch
}
```

---

### 6. Memoize Expensive Calculations

**Problem:**
Chart scaling calculations run on every render

**Fix:**
```javascript
// Cache scaled prices
class LineBase extends PureComponent {
  cachedPrices = null;
  cachedScaledPrices = null;

  getScaledPrices() {
    const { prices } = this.props;

    // Return cached if prices haven't changed
    if (this.cachedPrices === prices) {
      return this.cachedScaledPrices;
    }

    this.cachedPrices = prices;
    this.cachedScaledPrices = scalePrices(
      prices,
      this.height,
      this.width,
      PADDING,
      PADDING
    );

    return this.cachedScaledPrices;
  }
}
```

---

### 7. Lazy Load Settings Panel

**Problem:**
Settings panel loads even when not used

**Fix:**
```javascript
// Only render when shown
render() {
  const { showSettings } = this.state;

  return (
    <AppShell>
      {/* Main content always renders */}
      <Chart />

      {/* Settings only renders when needed */}
      {showSettings && (
        <SettingsPanel
          onClose={this.toggleSettings}
          {...settingsProps}
        />
      )}
    </AppShell>
  );
}
```

---

## 🧹 Code Quality Improvements

### 8. Split Large File

**Current Issue:**
- 1609 lines in single file
- Hard to navigate and maintain

**Recommended Structure:**
```
src/
├── components/
│   ├── Chart.js              # LineBase component
│   ├── Overview.js           # Overview component
│   ├── PeriodSwitcher.js     # PeriodSwitcher component
│   └── SettingsPanel.js      # Settings components
├── utils/
│   ├── api.js                # All API functions
│   ├── formatters.js         # formatPrice, formatValue, etc.
│   ├── storage.js            # localStorage functions
│   └── constants.js          # All constants
├── styles/
│   ├── theme.js              # Theme configuration
│   └── components.js         # Styled components
└── App.js                    # CryptoChart main component
```

---

### 9. Add Input Validation

**Current Issue:**
Minimal validation of user input

**Fix:**
```javascript
handleAddCoinOption = async (symbol) => {
  const normalized = (symbol || "").trim().toUpperCase();

  // Enhanced validation
  if (!normalized) {
    return { success: false, reason: "empty", message: "Please enter a coin symbol" };
  }

  if (!/^[A-Z0-9]{2,10}$/.test(normalized)) {
    return {
      success: false,
      reason: "format",
      message: "Symbol must be 2-10 uppercase letters/numbers"
    };
  }

  if (this.state.coinOptions.includes(normalized)) {
    return {
      success: false,
      reason: "duplicate",
      message: `${normalized} is already in your list`
    };
  }

  // Verify coin exists by testing API
  try {
    await fetchCurrentValue(normalized);
  } catch (error) {
    return {
      success: false,
      reason: "invalid",
      message: `${normalized} is not a valid coin symbol`
    };
  }

  // Add coin
  this.setState((prevState) => {
    const newCoinOptions = [...prevState.coinOptions, normalized];
    saveCoinOptionsToStorage(newCoinOptions);
    return { coinOptions: newCoinOptions };
  });

  return { success: true, message: `${normalized} added successfully` };
};
```

---

### 10. Add Defensive Programming

**Issue:**
Assumes data always exists

**Fix:**
```javascript
// Use optional chaining and nullish coalescing
const deriveValueDelta = (currentValue, valueHistory) => {
  const firstPrice = valueHistory?.[0]?.price;

  if (typeof currentValue === 'number' && typeof firstPrice === 'number') {
    return currentValue - firstPrice;
  }

  return null;
};

// Safe array access
const activeCoin = coinOptions?.[coinIndex] ?? coinOptions?.[0] ?? DEFAULT_COIN_OPTIONS[0];

// Safe localStorage
const loadCoinOptionsFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;

    if (Array.isArray(parsed) && parsed.length > 0) {
      // Validate each coin symbol
      const validCoins = parsed.filter(coin =>
        typeof coin === 'string' && /^[A-Z0-9]{2,10}$/.test(coin)
      );

      return validCoins.length > 0 ? validCoins : DEFAULT_COIN_OPTIONS.slice();
    }
  } catch (error) {
    console.error('Failed to load coin options:', error);
  }

  return DEFAULT_COIN_OPTIONS.slice();
};
```

---

## 📱 Accessibility Improvements

### 11. Add ARIA Labels

**Current Issue:**
No screen reader support

**Fix:**
```javascript
const PeriodButton = styled.button.attrs({
  role: 'button',
  'aria-label': props => `View ${props.label} time period`
})`
  // ... styles
`;

const SettingsToggleButton = styled.button.attrs({
  'aria-label': 'Open settings',
  'aria-expanded': props => props.isOpen
})`
  // ... styles
`;
```

---

### 12. Keyboard Navigation

**Issue:**
Can't navigate without mouse

**Fix:**
```javascript
componentDidMount() {
  // Add keyboard shortcuts
  document.addEventListener('keydown', this.handleKeyPress);
}

componentWillUnmount() {
  document.removeEventListener('keydown', this.handleKeyPress);
}

handleKeyPress = (e) => {
  // Don't interfere with settings input
  if (this.state.showSettings) return;

  switch(e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault();
      this.cycleCoinIndex(-1); // Previous coin
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault();
      this.cycleCoinIndex(1); // Next coin
      break;
    case 's':
    case 'S':
      e.preventDefault();
      this.toggleSettings();
      break;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
      e.preventDefault();
      this.setPeriod(null, PERIOD_OPTIONS[parseInt(e.key) - 1].value);
      break;
  }
};
```

---

## 🎨 UX Improvements

### 13. Add Smooth Error Recovery

```javascript
// Error boundary component
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen>
          <h1>😕 Oops! Something went wrong</h1>
          <p>{this.state.error?.message || 'Unknown error'}</p>
          <button onClick={this.handleReset}>Reload Extension</button>
        </ErrorScreen>
      );
    }

    return this.props.children;
  }
}

// Usage:
ReactDOM.render(
  <ErrorBoundary>
    <ThemeProvider theme={theme}>
      <CryptoChart />
    </ThemeProvider>
  </ErrorBoundary>,
  document.getElementById('root')
);
```

---

### 14. Add Offline Detection

```javascript
class CryptoChart extends PureComponent {
  state = {
    // ... existing state
    isOnline: navigator.onLine
  }

  componentDidMount() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  handleOnline = () => {
    this.setState({ isOnline: true });
    this.fetchData(); // Refresh data when back online
  }

  handleOffline = () => {
    this.setState({ isOnline: false });
  }

  render() {
    const { isOnline } = this.state;

    return (
      <AppShell>
        {!isOnline && (
          <OfflineBanner>
            📡 You're offline. Prices will update when connection is restored.
          </OfflineBanner>
        )}
        {/* ... rest of render */}
      </AppShell>
    );
  }
}
```

---

## 📊 Monitoring & Analytics (Optional)

### 15. Add Performance Monitoring

```javascript
// Measure key metrics
class CryptoChart extends PureComponent {
  componentDidMount() {
    // Measure time to first data
    performance.mark('app-start');

    this.fetchData().then(() => {
      performance.mark('app-ready');
      performance.measure('time-to-ready', 'app-start', 'app-ready');

      const measure = performance.getEntriesByName('time-to-ready')[0];
      console.log(`App ready in ${measure.duration}ms`);

      // Could send to analytics (privacy-friendly like Plausible)
    });
  }
}
```

---

## 🚀 Implementation Priority

### Phase 1: Critical (Do First) - ✅ COMPLETED
1. ✅ Add error handling to API calls
2. ✅ Add loading states
3. ✅ Fix memory leaks (cleanup timers)
4. ✅ Fix race conditions

### Phase 2: Important (Do Soon) - 🔄 IN PROGRESS
5. ✅ Add input validation (whitelist validation)
6. ✅ Add offline detection
7. ✅ Add error boundary (API error banner)
8. ✅ Debounce rapid updates (resize handler)

### Phase 3: Nice to Have - 📋 PLANNED
9. [ ] Split code into modules (when >5000 lines)
10. [ ] Add keyboard shortcuts
11. [ ] Add ARIA labels
12. ✅ Memoize calculations (chart scaling)

---

## 📝 Testing These Changes

After implementing each optimization:

1. **Test error handling:**
   - Disconnect internet during load
   - Enter invalid coin symbol
   - Use browser dev tools to throttle network to "Slow 3G"

2. **Test loading states:**
   - Clear cache and reload
   - Throttle network to "Slow 3G"

3. **Test memory:**
   - Open Chrome Task Manager (Shift+Esc)
   - Monitor memory usage over 5 minutes
   - Should stay stable, not grow

4. **Test race conditions:**
   - Rapidly click through coins
   - Rapidly change time periods
   - Should not flicker or show wrong data

---

## 🎯 Expected Improvements

After implementing all optimizations:

- **Reliability**: 99%+ uptime even with network issues
- **Performance**: < 1s load time on good connection
- **User Experience**: No blank screens, clear error messages
- **Maintainability**: Easy to add features and fix bugs
- **Accessibility**: Usable by keyboard and screen readers

---

**Next Steps:** See TODO.md for full implementation roadmap.
