# PriceTab - Feature Research & Widget Ideas

> Research document for potential new features. Focus on widgets that can be toggled on/off from settings and displayed on the main dashboard.

---

## Widget System Architecture

### Concept
Add a collapsible widget panel to the main page. Users can enable/disable individual widgets from Settings > Preferences tab.

```
┌─────────────────────────────────────────┐
│              PRICE CHART                │
│            (existing view)              │
├─────────────────────────────────────────┤
│  [Widget Panel - Toggleable]            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Fear/Greed│ │  Gas   │ │ Market │   │
│  │   72    │ │ 23 gwei│ │ BTC 54%│   │
│  └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

### Settings Integration
```javascript
// New state properties
widgetsEnabled: {
  fearGreed: true,
  gasTracker: false,
  marketStats: true,
  portfolio: false
}
```

---

## Widget 1: Fear & Greed Index

### Description
Shows the current market sentiment as a simple gauge (0-100). Helps users understand if the market is in fear (buying opportunity) or greed (potential correction).

### Visual Design
```
┌──────────────────┐
│   FEAR & GREED   │
│       72         │
│      GREED       │
│   ○○○○●○○○○○    │
└──────────────────┘
```

### API Source
**Alternative.me** - Free, no API key required

| Endpoint | `https://api.alternative.me/fng/` |
|----------|-----------------------------------|
| Method | GET |
| Rate Limit | Reasonable (not documented) |
| Response | JSON |
| Cost | Free with attribution |

### Sample Response
```json
{
  "data": [{
    "value": "72",
    "value_classification": "Greed",
    "timestamp": "1640995200",
    "time_until_update": "43200"
  }]
}
```

### Implementation Notes
- Cache aggressively (updates every 12 hours)
- Show gauge visualization with color gradient
- Display classification text (Extreme Fear → Extreme Greed)
- Attribution required: "Data from Alternative.me"

### Effort: Low | Priority: High

---

## Widget 2: Ethereum Gas Tracker

### Description
Shows current ETH gas prices for transactions. Useful for users who interact with DeFi or make on-chain transactions.

### Visual Design
```
┌──────────────────┐
│    ETH GAS       │
│   🐢 12  🚶 15  🚀 20 │
│      gwei        │
└──────────────────┘
```

### API Options

#### Option A: Etherscan (Recommended)
| Endpoint | `https://api.etherscan.io/api?module=gastracker&action=gasoracle` |
|----------|-------------------------------------------------------------------|
| Method | GET |
| API Key | Required (free tier available) |
| Rate Limit | 5 calls/sec (free) |
| Cost | Free |

#### Option B: ETH Gas Tracker
| Endpoint | `https://www.ethgastracker.com/api/gas/price` |
|----------|-----------------------------------------------|
| Method | GET |
| API Key | Not required |
| Cost | Free |

#### Option C: Owlracle
| Endpoint | `https://api.owlracle.info/v4/eth/gas` |
|----------|----------------------------------------|
| Method | GET |
| API Key | Not required for basic |
| Cost | Free tier available |

### Sample Response (Etherscan)
```json
{
  "result": {
    "SafeGasPrice": "12",
    "ProposeGasPrice": "15",
    "FastGasPrice": "20"
  }
}
```

### Implementation Notes
- Update every 30-60 seconds
- Show three tiers: Slow, Normal, Fast
- Color code by price (green = cheap, red = expensive)
- Consider showing USD cost estimate for standard transfer

### Effort: Low | Priority: Medium

---

## Widget 3: Market Overview

### Description
Shows global crypto market statistics: total market cap, 24h volume, and BTC dominance.

### Visual Design
```
┌──────────────────────────────────┐
│         MARKET OVERVIEW          │
│  MCap: $2.1T   Vol: $89B   BTC: 54% │
└──────────────────────────────────┘
```

### API Source
**CoinGecko** - Free tier available

| Endpoint | `https://api.coingecko.com/api/v3/global` |
|----------|-------------------------------------------|
| Method | GET |
| API Key | Optional (higher limits with key) |
| Rate Limit | 30 calls/min (free) |
| Cost | Free |

### Sample Response
```json
{
  "data": {
    "total_market_cap": { "usd": 2100000000000 },
    "total_volume": { "usd": 89000000000 },
    "market_cap_percentage": { "btc": 54.2, "eth": 17.8 }
  }
}
```

### Implementation Notes
- Cache for 5 minutes (data doesn't change rapidly)
- Format large numbers (2.1T, 89B)
- Show BTC/ETH dominance percentages
- Match user's selected currency

### Effort: Low | Priority: High

---

## Widget 4: Mini Portfolio

### Description
Track holdings without leaving the new tab. Shows total value and 24h change.

### Visual Design
```
┌──────────────────────────────────┐
│          MY PORTFOLIO            │
│         $12,450.00               │
│         +$320 (+2.6%)            │
│  BTC: 0.15  ETH: 2.5  SOL: 10   │
└──────────────────────────────────┘
```

### Data Storage
All data stored locally in localStorage (privacy-first):

```javascript
{
  holdings: [
    { coin: "BTC", amount: 0.15 },
    { coin: "ETH", amount: 2.5 },
    { coin: "SOL", amount: 10 }
  ]
}
```

### Implementation Notes
- No external API needed (use existing Coinbase price data)
- Simple add/edit/remove holdings UI in settings
- Calculate total using current spot prices
- Track 24h change based on price movement
- Export/Import JSON for backup
- Max 20 holdings to keep it simple

### Privacy Considerations
- All data local, never transmitted
- No wallet connections
- Manual entry only
- Clear data option in settings

### Effort: Medium | Priority: Medium

---

## Widget 5: Quick Stats Bar

### Description
Compact horizontal bar showing key metrics for the currently selected coin.

### Visual Design
```
┌─────────────────────────────────────────────┐
│ MCap: $850B | Vol: $28B | Rank: #1 | ATH: $69K │
└─────────────────────────────────────────────┘
```

### API Source
Use existing Coinbase API or add CoinGecko for extended data.

### Implementation Notes
- Shows stats for currently viewed coin
- Updates with coin selection
- Minimal API calls (cache with price data)

### Effort: Low | Priority: Low

---

## Widget 6: Trending Coins

### Description
Shows top trending cryptocurrencies based on search volume.

### Visual Design
```
┌──────────────────────┐
│      TRENDING        │
│  1. PEPE   +125%     │
│  2. WIF    +89%      │
│  3. BONK   +45%      │
└──────────────────────┘
```

### API Source
**CoinGecko Trending**

| Endpoint | `https://api.coingecko.com/api/v3/search/trending` |
|----------|---------------------------------------------------|
| Method | GET |
| Rate Limit | 30 calls/min |
| Cost | Free |

### Implementation Notes
- Update every 10 minutes
- Show top 3-5 trending coins
- Click to add coin to watchlist
- Show 24h price change

### Effort: Low | Priority: Low

---

## Widget 7: Price Alerts Summary

### Description
Shows active price alerts and recently triggered alerts.

### Visual Design
```
┌──────────────────────────┐
│       ALERTS (3)         │
│  BTC > $50K    ⏳ waiting │
│  ETH < $2K     ✓ triggered│
│  SOL > $100    ⏳ waiting │
└──────────────────────────┘
```

### Implementation Notes
- Prerequisite: Price Alerts feature (Phase 3)
- No external API needed
- Shows status of user's alerts
- Quick add button

### Effort: Low (after alerts implemented) | Priority: Low

---

## Widget 8: BTC Fee Tracker (Mempool)

### Description
Shows current Bitcoin transaction fee recommendations from mempool.space. Helps users understand if it's a good time to transact.

### Visual Design
```
┌──────────────────────────┐
│       BTC FEES           │
│  🐢 8   🚶 12   🚀 15    │
│       sat/vB             │
│    ~$0.50  ~$0.75  ~$1   │
└──────────────────────────┘
```

### API Source
**Mempool.space** - Free, no API key required

| Endpoint | `https://mempool.space/api/v1/fees/recommended` |
|----------|------------------------------------------------|
| Method | GET |
| Rate Limit | Generous (not documented) |
| Cost | Free |

### Sample Response
```json
{
  "fastestFee": 15,
  "halfHourFee": 12,
  "hourFee": 8,
  "economyFee": 6,
  "minimumFee": 4
}
```

### Implementation Notes
- Update every 60 seconds
- Show sat/vB for each tier
- Optionally show USD estimate (based on avg tx size ~140 vB)
- Color code: green (cheap) → red (expensive)
- Historical context: "Low" / "Normal" / "High" based on 24h average

### Effort: Low | Priority: High

---

## Widget 9: Difficulty Countdown

### Description
Shows time until next Bitcoin difficulty adjustment and projected change percentage.

### Visual Design
```
┌──────────────────────────┐
│    DIFFICULTY ADJ        │
│      3d 14h 22m          │
│      +2.4% est.          │
│   ████████░░ 80%         │
└──────────────────────────┘
```

### API Source
**Mempool.space**

| Endpoint | `https://mempool.space/api/v1/difficulty-adjustment` |
|----------|-----------------------------------------------------|
| Method | GET |
| Cost | Free |

### Sample Response
```json
{
  "progressPercent": 80.5,
  "difficultyChange": 2.4,
  "estimatedRetargetDate": 1708300000,
  "remainingBlocks": 420,
  "remainingTime": 302400
}
```

### Implementation Notes
- Update every 5 minutes
- Show progress bar
- Color code adjustment: green (negative) / red (positive)
- Tooltip with block details

### Effort: Low | Priority: Medium

---

## Widget 10: Mempool Status

### Description
Shows current mempool congestion status - pending transactions and total fees.

### Visual Design
```
┌──────────────────────────┐
│       MEMPOOL            │
│     124,532 txs          │
│     2.4 BTC fees         │
│   ████░░░░░░ 40%         │
└──────────────────────────┘
```

### API Source
**Mempool.space**

| Endpoint | `https://mempool.space/api/mempool` |
|----------|-------------------------------------|
| Method | GET |
| Cost | Free |

### Sample Response
```json
{
  "count": 124532,
  "vsize": 98234567,
  "total_fee": 240000000,
  "fee_histogram": [[15, 1234], [12, 5678], ...]
}
```

### Implementation Notes
- Update every 30 seconds
- Show congestion level (Low/Medium/High)
- Total pending transactions
- Total fees in BTC

### Effort: Low | Priority: Low

---

## Widget 11: 24h High/Low

### Description
Shows the 24-hour price range for the currently selected coin.

### Visual Design
```
┌──────────────────────────┐
│       24H RANGE          │
│  L: $42,100  H: $44,800  │
│   ██████████░░░ 75%      │
│     Current: $44,200     │
└──────────────────────────┘
```

### API Source
**CoinGecko**

| Endpoint | `https://api.coingecko.com/api/v3/coins/{id}` |
|----------|----------------------------------------------|
| Method | GET |
| Cost | Free |

### Response Fields
- `market_data.high_24h.usd`
- `market_data.low_24h.usd`
- `market_data.price_change_percentage_24h`

### Implementation Notes
- Updates with coin selection
- Progress bar shows where current price sits in range
- Useful for quick support/resistance view

### Effort: Low | Priority: Medium

---

## Recommended Implementation Order

### Phase 1: Quick Wins (Implemented)
| Widget | Effort | Impact | API Complexity | Status |
|--------|--------|--------|----------------|--------|
| Fear & Greed Index | Low | High | Very Simple | ✅ Done |
| Market Overview | Low | High | Simple | ✅ Done |

### Phase 2: Bitcoin Network Data
| Widget | Effort | Impact | API Complexity | Status |
|--------|--------|--------|----------------|--------|
| BTC Fee Tracker | Low | High | Simple | Planned |
| Difficulty Countdown | Low | Medium | Simple | Planned |
| Mempool Status | Low | Low | Simple | Planned |

### Phase 3: Useful Additions
| Widget | Effort | Impact | API Complexity | Status |
|--------|--------|--------|----------------|--------|
| 24h High/Low | Low | Medium | Simple | Planned |
| ETH Gas Tracker | Low | Medium | Simple | Planned |
| Mini Portfolio | Medium | High | None (local) | Planned |

### Phase 4: Nice to Have
| Widget | Effort | Impact | API Complexity | Status |
|--------|--------|--------|----------------|--------|
| Quick Stats Bar | Low | Low | Reuse existing | Planned |
| Trending Coins | Low | Low | Simple | Planned |
| Price Alerts Summary | Low | Medium | None (local) | Planned |

---

## Technical Considerations

### API Rate Limits
- Stagger API calls to avoid hitting limits
- Implement request queuing
- Cache aggressively based on data freshness needs

### Bundle Size
- Each widget adds ~2-5KB
- Consider lazy loading for disabled widgets
- Keep total addition under 20KB

### Performance
- Widgets should not block main chart render
- Use requestIdleCallback for non-critical updates
- Skeleton loaders for async data

### Settings Storage
```javascript
// Add to existing localStorage structure
{
  "crypto_chart_preferences": {
    // ... existing settings
    "widgets": {
      "fearGreed": { "enabled": true, "position": 0 },
      "gasTracker": { "enabled": false, "position": 1 },
      "marketOverview": { "enabled": true, "position": 2 },
      "portfolio": { "enabled": false, "position": 3 }
    }
  }
}
```

---

## UI/UX Guidelines

### Widget Panel Behavior
- Collapsible with smooth animation
- Remember collapsed state
- Drag to reorder widgets
- Responsive: stack on mobile

### Widget Card Design
- Consistent padding and border radius
- Match existing theme colors
- Subtle shadow for depth
- Hover state for interactivity

### Loading States
- Skeleton pulse animation
- Graceful error handling
- "Data unavailable" fallback

---

## API Attribution Requirements

| API | Attribution Required |
|-----|---------------------|
| Alternative.me | Yes - "Data from Alternative.me" |
| CoinGecko | Yes - "Powered by CoinGecko" |
| Etherscan | Yes - "Powered by Etherscan.io APIs" |
| Mempool.space | Yes - "Powered by mempool.space" |
| Owlracle | Check terms |

Consider adding a small "Data Sources" link in settings or footer.

---

## Competitor Analysis

### Crypto Tab
- 20 coin limit
- Search bar widget
- Exchange rate charts
- No portfolio feature

### Crypto Pulse
- Nature background images
- RSS feed integration
- 3000+ coins
- Widget composition system

### Crypto New Tab
- Customizable dashboard
- Real-time charts
- Beautiful images
- Minimal permissions

### Our Differentiators
- Privacy-first (no tracking)
- Faster loading (no build process)
- Clean, minimal design
- Zero permissions required

---

## Sources & References

- [Alternative.me Fear & Greed Index](https://alternative.me/crypto/fear-and-greed-index/)
- [CoinGecko API Documentation](https://www.coingecko.com/en/api)
- [Mempool.space API Documentation](https://mempool.space/docs/api/rest)
- [Mempool.js GitHub](https://github.com/mempool/mempool.js)
- [Etherscan Gas Tracker API](https://docs.etherscan.io/api-endpoints/gas-tracker)
- [Owlracle Gas API](https://owlracle.info/)
- [ETH Gas Tracker](https://www.ethgastracker.com/docs)
- [CoinMarketCap API](https://coinmarketcap.com/api/)
- [Perplexity Finance](https://www.perplexity.ai/finance)
- [Crypto New Tab Extension](https://crypto-new-tab.en.softonic.com/chrome/extension)
- [Crypto Pulse Extension](https://chromewebstore.google.com/detail/crypto-pulse-tab-start-an/cnklededohhcbmjjdlbjdkkihkgoggol)
- [Best Crypto Portfolio Trackers 2025](https://www.blockpit.io/en-us/blog/best-crypto-portfolio-trackers)

---

## Perplexity Finance Research

### Overview
Perplexity Finance (https://www.perplexity.ai/finance/BTCUSD) provides cryptocurrency data with AI-powered analysis. We investigated whether we could integrate this data source.

### Why We Can't Use It

| Issue | Description |
|-------|-------------|
| **No Public API** | Perplexity does not offer a public API for finance data |
| **403 Forbidden** | Web scraping blocked by bot detection |
| **JS Rendered** | Page is dynamically rendered, static fetch doesn't work |
| **Rate Limiting** | Automated requests are blocked |
| **Coinbase Partnership** | Their crypto data comes from exclusive Coinbase partnership |

### Alternative Methods Considered

| Method | Feasibility | Notes |
|--------|-------------|-------|
| Official API | Not available | May come in future |
| Headless Browser | Not possible | Chrome extensions can't run Puppeteer |
| Proxy/Scraping Service | Not recommended | Paid, unreliable, ToS violation |
| Reverse Engineering | Not recommended | Against ToS, may break anytime |

### Data Comparison: Perplexity vs Free Alternatives

| Perplexity Data | Free Alternative | API |
|-----------------|------------------|-----|
| Price | CoinGecko | `/simple/price` |
| Market Cap | CoinGecko | `/coins/{id}` |
| 24h Volume | CoinGecko | `/coins/{id}` |
| 24h Change | CoinGecko | `/simple/price?include_24hr_change=true` |
| 52w High/Low | CoinGecko | `/coins/{id}` |
| Circulating Supply | CoinGecko | `/coins/{id}` |
| RSI Indicator | Calculate from historical | Use price history |
| MACD | Calculate from historical | Use price history |
| News Feed | CryptoPanic | `https://cryptopanic.com/api/` |
| AI Analysis | **Not available** | Perplexity exclusive |

### Conclusion
Perplexity's only unique value is AI-powered analysis. All other data points can be obtained from CoinGecko (free tier: 30 calls/min). We recommend using CoinGecko for extended market data.

### CoinGecko Endpoints for Extended Data

```
# Detailed coin data (market cap, volume, high/low, supply)
GET https://api.coingecko.com/api/v3/coins/{id}

# Simple price with extras
GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true

# Historical data for indicators
GET https://api.coingecko.com/api/v3/coins/{id}/market_chart?vs_currency=usd&days=30
```

---

## Future Feature Ideas

### Quick Wins (Low Effort, High Impact)

| Feature | Description | Effort | Priority |
|---------|-------------|--------|----------|
| **Keyboard Shortcuts** | ← → change coin, 1-6 period, S settings, T theme | Low | High |
| **BTC Fee Tracker** | Show recommended fees from mempool.space | Low | High |
| **Price Sound** | Optional "ding" on significant price change | Low | Low |
| **Coin Logos** | Show coin icon next to symbol | Low | Medium |
| **Sparkline Mini Chart** | 7-day mini chart in widgets | Medium | Medium |

### Medium Effort Features

| Feature | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| **Price Alerts** | "Notify when BTC > $50K" with browser notifications | Medium | Notifications API |
| **Mini Portfolio** | Track holdings (0.5 BTC, 2 ETH) → show total value | Medium | Local storage |
| **Comparison Mode** | Overlay 2 coins on same chart | Medium | D3 multi-line |
| **Candlestick Chart** | OHLC candle chart option | Medium | D3 candlestick |
| **RSI Indicator** | Show RSI below main chart | Medium | Calculate from history |
| **Moving Averages** | SMA/EMA lines on chart | Medium | Calculate from history |

### Advanced Features

| Feature | Description | Effort | API Required |
|---------|-------------|--------|--------------|
| **Chrome Sync** | Sync settings across devices | Medium | Chrome Storage Sync |
| **News Feed** | Latest crypto news widget | High | CryptoPanic API |
| **Whale Alerts** | Show large transactions | High | Whale Alert API |
| **DeFi Yields** | Best staking/lending rates | High | DeFiLlama API |
| **On-chain Metrics** | Active addresses, hash rate | High | Glassnode/Blockchain.com |
| **Social Sentiment** | Twitter/Reddit sentiment | High | LunarCrush API |

### Visual Enhancements

| Feature | Description | Effort |
|---------|-------------|--------|
| **Gradient Chart Fill** | Gradient fill below the line | Low |
| **Animated Background** | Subtle animation based on price movement | Medium |
| **Custom Themes** | Let users pick their own colors | Medium |
| **Fullscreen Mode** | F11 or button for fullscreen chart | Low |
| **Dark/Light Auto Transition** | Smooth animation between themes | Low |
| **Confetti on ATH** | Fun animation when coin hits all-time high | Low |

### Keyboard Shortcuts (Detailed Plan)

| Shortcut | Action | Implementation |
|----------|--------|----------------|
| `←` | Previous coin | `cycleCoinIndex(-1)` |
| `→` | Next coin | `cycleCoinIndex(1)` |
| `1` | 1 Hour period | `setPeriod('hour')` |
| `2` | 1 Day period | `setPeriod('day')` |
| `3` | 1 Week period | `setPeriod('week')` |
| `4` | 1 Month period | `setPeriod('month')` |
| `5` | 1 Year period | `setPeriod('year')` |
| `6` | All Time period | `setPeriod('all')` |
| `S` or `Esc` | Toggle settings | `toggleSettings()` |
| `T` | Toggle theme | `cycleTheme()` |
| `R` | Refresh data | `fetchData()` |
| `?` | Show shortcuts help | Show modal |

**Implementation:**
```javascript
componentDidMount() {
  document.addEventListener('keydown', this.handleKeyDown);
}

handleKeyDown = (e) => {
  // Don't trigger if user is typing in input
  if (e.target.tagName === 'INPUT') return;

  switch(e.key) {
    case 'ArrowLeft': this.cycleCoinIndex(-1); break;
    case 'ArrowRight': this.cycleCoinIndex(1); break;
    case '1': this.setPeriod(null, 'hour'); break;
    // ... etc
  }
}
```

### Price Alerts System (Detailed Plan)

**Data Structure:**
```javascript
{
  alerts: [
    {
      id: "uuid",
      coin: "BTC",
      condition: "above", // "above" | "below" | "change_percent"
      target: 50000,
      currency: "USD",
      enabled: true,
      triggered: false,
      createdAt: timestamp,
      triggeredAt: null
    }
  ]
}
```

**Features:**
- Max 10 active alerts
- Browser notification on trigger
- Optional sound
- Alert history
- One-click create from current price

**UI Location:**
- New "Alerts" tab in settings
- Quick alert button on main screen (bell icon)

### Mini Portfolio (Detailed Plan)

**Data Structure:**
```javascript
{
  holdings: [
    { coin: "BTC", amount: 0.5, note: "Cold wallet" },
    { coin: "ETH", amount: 2.0, note: "Staking" }
  ],
  showPortfolio: true,
  portfolioPosition: "bottom" // "bottom" | "widget"
}
```

**Features:**
- Add/edit/remove holdings
- Total value in selected currency
- 24h change (value and %)
- Per-coin profit/loss
- Export/import JSON
- Privacy mode (hide amounts)

**Privacy Considerations:**
- All data stored locally
- No cloud sync for portfolio
- Clear data option

---

## Next Steps

1. [x] Design widget panel UI mockup
2. [x] Add widget toggle settings to Preferences tab
3. [x] Implement Fear & Greed widget
4. [x] Implement Market Overview widget
5. [ ] Implement BTC Fee Tracker (mempool.space)
6. [ ] Implement Difficulty Countdown
7. [ ] Add 24h High/Low widget
8. [ ] Add keyboard shortcuts
9. [ ] Test performance impact
10. [ ] Update TODO.md with new tasks

---

*Last updated: February 2026*
