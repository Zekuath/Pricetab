# API Key Feature - Implementation Plan

## 📋 Overview

This document outlines the plan to add **Coinbase API key support** to CryptoTab, enabling users to view multiple coins in the tab title.

---

## 🎯 Goals

1. **Free Mode (Current):** Single coin, public API, rate-limit safe
2. **Premium Mode (API Key):** Multiple coins, private API, higher limits
3. **User Control:** Settings to customize tab title format
4. **Security:** Proper API key storage and handling

---

## 🔒 Rate Limit Analysis

### Public API (No Authentication)
- **Limits:**
  - 10 requests/second per IP
  - 15 requests/second burst
  - 10,000 requests/hour max
- **Current Usage:**
  - 1 request every 30 seconds = 120 requests/hour
  - ✅ Well within limits

### Private API (With API Key)
- **Limits:**
  - Significantly higher (not publicly documented)
  - Typically 1000s of requests per minute
  - Batch endpoints available
- **Potential Usage:**
  - 10 coins × 1 request every 30s = 1,200 requests/hour
  - ✅ Safe with private API

---

## 🏗️ Architecture

### Data Flow

```
┌─────────────────────────────────────────────────┐
│           Settings Panel                         │
│  ┌──────────────────────────────────┐           │
│  │  API Key: [________________]     │           │
│  │  API Secret: [________________]  │           │
│  │  [Test Connection]               │           │
│  │                                   │           │
│  │  Tab Title Settings:             │           │
│  │  Number of coins: [Dropdown▼]    │           │
│  │    • Single (free)               │           │
│  │    • Top 3 (requires API)        │           │
│  │    • Top 5 (requires API)        │           │
│  │    • All (requires API)          │           │
│  │                                   │           │
│  │  Format: [Short (43.2K) ▼]       │           │
│  │  Show %: [✓] Show percentage     │           │
│  │                                   │           │
│  │  Preview:                         │           │
│  │  BTC $43.2K (+5%) | ETH $2.3K    │           │
│  └──────────────────────────────────┘           │
└─────────────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  localStorage        │
         │  - api_key          │
         │  - api_secret       │
         │  - tab_title_mode   │
         │  - tab_title_format │
         └──────────────────────┘
                    │
                    ▼
      ┌─────────────────────────────┐
      │  API Manager (script.js)    │
      │  - Detect API presence      │
      │  - Use public vs private    │
      │  - Batch fetch if API       │
      └─────────────────────────────┘
                    │
                    ▼
      ┌─────────────────────────────┐
      │  Tab Title Generator        │
      │  - Single or multi-coin     │
      │  - Format according to      │
      │    user preferences         │
      └─────────────────────────────┘
```

---

## 💾 localStorage Schema

### Current
```javascript
{
  "crypto_chart_coin_options": ["BTC", "ETH", "SOL"]
}
```

### New (with API support)
```javascript
{
  "crypto_chart_coin_options": ["BTC", "ETH", "SOL"],
  "crypto_api_key": "encrypted_or_plain_key",
  "crypto_api_secret": "encrypted_or_plain_secret",
  "tab_title_settings": {
    "mode": "single",          // "single" | "top3" | "top5" | "all"
    "format": "short",         // "full" | "short" | "percent"
    "showPercent": true,       // boolean
    "hasValidAPI": false       // boolean (cached validation status)
  }
}
```

---

## 🔐 Security Considerations

### Option 1: Plain Text (Simple, Less Secure)
```javascript
localStorage.setItem('crypto_api_key', apiKey);
```
- ⚠️ **Risk:** Anyone with access to localStorage can see key
- ✅ **Pro:** Simple implementation
- ⚠️ **Con:** Not recommended for production
- **Note:** Warn user in UI: "API keys are stored unencrypted"

### Option 2: Base64 Encoding (Security by Obscurity)
```javascript
const encoded = btoa(apiKey);
localStorage.setItem('crypto_api_key', encoded);
```
- ⚠️ **Risk:** Easily reversible
- ✅ **Pro:** Slightly better than plain text
- ⚠️ **Con:** Not real encryption

### Option 3: Web Crypto API (Recommended)
```javascript
// Generate encryption key from user password or device-specific data
// Encrypt API key before storing
// Decrypt when needed
```
- ✅ **Pro:** Real encryption
- ⚠️ **Con:** Complex implementation
- ⚠️ **Con:** Requires password or device-specific key

### **Recommended Approach for v1:**
- Use plain text with prominent warning
- Add encryption in v2
- Coinbase API keys can be revoked easily if compromised

---

## 🎨 UI Components

### Settings Panel Addition

```javascript
// New section in Settings
const APISettingsSection = styled.div`
  border-top: 1px solid #333;
  padding-top: 2rem;
  margin-top: 2rem;
`;

const APIInput = styled.input`
  width: 100%;
  padding: 0.5rem;
  background: #1a1a1a;
  border: 1px solid #333;
  color: white;
  font-family: 'Roboto Mono', monospace;
  border-radius: 4px;

  &::placeholder {
    color: #666;
  }
`;

const APIWarning = styled.p`
  color: #ff9800;
  font-size: 0.75rem;
  margin-top: 0.5rem;
`;

// Component structure:
<APISettingsSection>
  <h3>API Settings</h3>
  <p>Connect your Coinbase API key to show multiple coins in tab title</p>

  <label>API Key</label>
  <APIInput
    type="text"
    placeholder="Enter your Coinbase API key"
    value={apiKey}
    onChange={handleAPIKeyChange}
  />

  <label>API Secret</label>
  <APIInput
    type="password"
    placeholder="Enter your API secret"
    value={apiSecret}
    onChange={handleAPISecretChange}
  />

  <APIWarning>
    ⚠️ API keys are stored unencrypted in your browser.
    Only use read-only API keys. Never share them.
  </APIWarning>

  <button onClick={testConnection}>
    {isTestingAPI ? "Testing..." : "Test Connection"}
  </button>

  {apiStatus === "success" && (
    <SuccessMessage>✓ API connection successful!</SuccessMessage>
  )}

  {apiStatus === "error" && (
    <ErrorMessage>✗ API connection failed. Check your credentials.</ErrorMessage>
  )}

  <h4>Tab Title Display</h4>

  <label>Number of coins to show</label>
  <select value={tabTitleMode} onChange={handleTabTitleModeChange}>
    <option value="single">Single coin (free)</option>
    <option value="top3" disabled={!hasValidAPI}>
      Top 3 coins {!hasValidAPI && "(requires API)"}
    </option>
    <option value="top5" disabled={!hasValidAPI}>
      Top 5 coins {!hasValidAPI && "(requires API)"}
    </option>
    <option value="all" disabled={!hasValidAPI}>
      All coins {!hasValidAPI && "(requires API)"}
    </option>
  </select>

  <label>Price format</label>
  <select value={priceFormat} onChange={handlePriceFormatChange}>
    <option value="full">Full ($43,250)</option>
    <option value="short">Short ($43.2K)</option>
    <option value="percent">Percentage only (+5.2%)</option>
  </select>

  <label>
    <input
      type="checkbox"
      checked={showPercent}
      onChange={handleShowPercentChange}
    />
    Show percentage change
  </label>

  <PreviewSection>
    <label>Preview:</label>
    <PreviewText>{getPreviewTitle()}</PreviewText>
  </PreviewSection>
</APISettingsSection>
```

---

## 🔧 Implementation Steps

### Phase 1: Basic Infrastructure (2-3 hours)

1. **Add localStorage helpers:**
   ```javascript
   const API_KEY_STORAGE = "crypto_api_key";
   const API_SECRET_STORAGE = "crypto_api_secret";
   const TAB_TITLE_SETTINGS_STORAGE = "tab_title_settings";

   const saveAPICredentials = (key, secret) => { /* ... */ };
   const loadAPICredentials = () => { /* ... */ };
   const clearAPICredentials = () => { /* ... */ };
   const saveTabTitleSettings = (settings) => { /* ... */ };
   const loadTabTitleSettings = () => { /* ... */ };
   ```

2. **Add API detection:**
   ```javascript
   const hasValidAPI = () => {
     const creds = loadAPICredentials();
     return creds && creds.key && creds.secret;
   };
   ```

3. **Add state to CryptoChart:**
   ```javascript
   state = {
     // ... existing state
     apiKey: "",
     apiSecret: "",
     hasValidAPI: false,
     tabTitleSettings: {
       mode: "single",
       format: "short",
       showPercent: true
     }
   };
   ```

### Phase 2: Settings UI (3-4 hours)

1. Create API settings section component
2. Add input fields and validation
3. Add "Test Connection" functionality
4. Add tab title customization controls
5. Add preview of tab title

### Phase 3: API Integration (4-5 hours)

1. **Create authenticated API client:**
   ```javascript
   const fetchWithAuth = async (url, apiKey, apiSecret) => {
     // Implement Coinbase API authentication
     // https://docs.cloud.coinbase.com/sign-in-with-coinbase/docs/api-key-authentication
   };
   ```

2. **Batch price fetching:**
   ```javascript
   const fetchMultiplePrices = async (coins, useAPI) => {
     if (useAPI) {
       // Use authenticated endpoints, batch if possible
       return fetchBatchPricesWithAPI(coins);
     } else {
       // Use public endpoint for single coin
       return fetchSinglePricePublic(coins[0]);
     }
   };
   ```

3. **Update tab title generator:**
   ```javascript
   const updateTabTitleMultiCoin = (coins, prices, settings) => {
     const { mode, format, showPercent } = settings;

     // Determine which coins to show
     const coinsToShow = getCoinsToShow(coins, mode);

     // Format each coin
     const formatted = coinsToShow.map(coin =>
       formatCoinForTitle(coin, prices[coin], format, showPercent)
     );

     document.title = formatted.join(" | ");
   };
   ```

### Phase 4: Testing & Polish (2-3 hours)

1. Test with real API credentials
2. Test error cases (invalid key, rate limits)
3. Test UI on different screen sizes
4. Add help text and documentation
5. Update README with API setup instructions

---

## 📝 Coinbase API Authentication

### How to Get API Key

**User Instructions:**
1. Go to https://www.coinbase.com/settings/api
2. Click "New API Key"
3. **Permissions:** Select "wallet:accounts:read" only (read-only)
4. ⚠️ Never select write permissions for browser extensions
5. Copy API Key and API Secret
6. Paste into CryptoTab settings

### Authentication Method

```javascript
// Coinbase uses HMAC SHA256 authentication
const crypto = require('crypto'); // Browser: use SubtleCrypto

const generateSignature = (timestamp, method, path, body, secret) => {
  const message = timestamp + method + path + body;
  const hmac = crypto.createHmac('sha256', secret);
  return hmac.update(message).digest('hex');
};

const fetchWithAuth = async (url, apiKey, apiSecret) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = new URL(url).pathname;
  const signature = generateSignature(timestamp, method, path, '', apiSecret);

  const headers = {
    'CB-ACCESS-KEY': apiKey,
    'CB-ACCESS-SIGN': signature,
    'CB-ACCESS-TIMESTAMP': timestamp,
    'CB-VERSION': '2021-11-09' // API version
  };

  return fetch(url, { headers });
};
```

---

## 🎯 Feature Flags

Add feature flags for gradual rollout:

```javascript
const FEATURES = {
  API_SUPPORT: true,        // Enable/disable API feature
  MULTI_COIN_TITLE: true,   // Enable/disable multi-coin titles
  ENCRYPTED_STORAGE: false  // Enable when encryption is ready
};

if (FEATURES.API_SUPPORT) {
  // Show API settings
}
```

---

## 📊 Success Metrics

### User Adoption
- [ ] % of users who add API key
- [ ] Average number of coins in tab title
- [ ] Tab title mode distribution (single vs multi)

### Performance
- [ ] API error rate
- [ ] Average response time
- [ ] Rate limit hits (should be 0)

### User Satisfaction
- [ ] Reviews mentioning multi-coin feature
- [ ] Support requests about API setup
- [ ] Uninstalls after API feature (regression?)

---

## 🚀 Launch Plan

### v1.1.0 - API Support Beta
1. Add API settings (read-only)
2. Test with 10-20 beta users
3. Gather feedback
4. Fix bugs

### v1.2.0 - Public Release
1. Launch to all users
2. Blog post: "How to connect your Coinbase API"
3. Video tutorial
4. Marketing push

### v1.3.0 - Polish
1. Add encryption
2. Add more customization
3. Support other exchanges (Binance, Kraken)

---

## ⚠️ Known Limitations

1. **Browser API Key Storage:**
   - Less secure than server-side
   - Recommend read-only keys only
   - User education critical

2. **Rate Limits:**
   - Still limited by Coinbase
   - Need smart caching strategy
   - Batch fetching where possible

3. **API Cost:**
   - Coinbase API is free
   - But user's API key quota is theirs
   - Clear communication needed

4. **Complexity:**
   - Feature adds significant complexity
   - More moving parts = more bugs
   - Good error handling essential

---

## 📚 Documentation Needed

### User-Facing
- [ ] How to get Coinbase API key (with screenshots)
- [ ] Step-by-step setup guide
- [ ] FAQ: "Is my API key safe?"
- [ ] FAQ: "Why do I need an API key?"
- [ ] Video tutorial

### Developer-Facing
- [ ] API authentication flow diagram
- [ ] Code architecture documentation
- [ ] Testing guide with test credentials
- [ ] Troubleshooting guide

---

## 🎬 Next Steps

1. **Decision:** Plain text vs encrypted storage?
2. **Priority:** High or medium priority feature?
3. **Timeline:** Aim for which version?
4. **Beta:** Need beta testers?

**Recommendation:** Start with plain text + warning, add encryption in v2.

---

**Last Updated:** November 9, 2025
**Status:** 📋 Planning Complete - Ready for Implementation
**Estimated Effort:** 10-15 hours total
