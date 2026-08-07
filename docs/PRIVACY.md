# Privacy Policy for PriceTab

**Last Updated:** August 6, 2026
**Effective Date:** January 23, 2026

## Introduction

PriceTab ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our Chrome browser extension.

## Information We Collect

### Data Stored Locally

PriceTab stores the following information **locally on your device only**:

- **Cryptocurrency Preferences**: The list of cryptocurrency symbols you select (e.g., BTC, ETH, SOL)
- **Coin Order**: The order in which you arrange your selected coins
- **Widget Settings**: Which widgets are enabled and their display order
- **UI Preferences**: Theme, currency, refresh interval, auto-rotate, ticker and news settings, hidden widget states
- **News Cache**: The latest fetched headlines (kept for 10 minutes to reduce network requests)

This data is stored using the browser's `localStorage` API and **never leaves your device**.

### Data We DO NOT Collect

We want to be clear about what we DON'T do:

- ❌ We do NOT collect any personal information
- ❌ We do NOT collect your browsing history
- ❌ We do NOT track your activity
- ❌ We do NOT use cookies for tracking
- ❌ We do NOT share any data with third parties
- ❌ We do NOT use analytics or telemetry
- ❌ We do NOT store data on our servers (we don't have any servers)
- ❌ We do NOT sell or monetize user data in any way

## Third-Party Services

All APIs used by PriceTab are **public** — no authentication or accounts required.

### Coinbase Public API

- **Endpoint**: `https://www.coinbase.com/api/v2/prices/`
- **Purpose**: Real-time cryptocurrency prices and historical charts
- **Data Sent**: Coin symbol (e.g., "BTC-USD") and time period
- **Privacy**: See [Coinbase's Privacy Policy](https://www.coinbase.com/legal/privacy)

### Alternative.me (Fear & Greed Index)

- **Endpoint**: `https://api.alternative.me/fng/`
- **Purpose**: Crypto Fear & Greed Index widget
- **Data Sent**: No user data — plain GET request

### OKX Public API (optional widgets)

- **Endpoint**: `https://www.okx.com/api/v5/public/`
- **Purpose**: Funding rate, Open Interest, and Liquidations widgets
- **Data Sent**: Coin pair — no user data
- **Privacy**: See [OKX Privacy Policy](https://www.okx.com/privacy)

### Bybit Public API (optional widget)

- **Endpoint**: `https://api.bybit.com/v5/market/`
- **Purpose**: Long/Short ratio widget
- **Data Sent**: Coin symbol — no user data
- **Privacy**: See [Bybit Privacy Policy](https://www.bybit.com/en/privacy)

### Coinlore Public API (optional widgets)

- **Endpoint**: `https://api.coinlore.com/api/`
- **Purpose**: Market Overview (total market cap/volume, BTC/ETH dominance) and Altcoin Season Index
- **Data Sent**: No user data — plain GET requests
- **Privacy**: See [Coinlore](https://www.coinlore.com)

### mempool.space API (optional widget)

- **Endpoint**: `https://mempool.space/api/`
- **Purpose**: Bitcoin Halving Countdown (current block height)
- **Data Sent**: No user data — plain GET request
- **Privacy**: See [mempool.space Privacy Policy](https://mempool.space/privacy-policy)

### Address balance lookup (optional portfolio watching)

- **Endpoints**: `https://mempool.space/api/address/…` (BTC balance and transaction history) and `https://api.blockchair.com/{chain}/dashboards/address/…` (ETH, LTC, DOGE balances)
- **Purpose**: If you choose to watch one of your own addresses in the portfolio, its public on-chain balance is read so the holding's amount stays in sync; for BTC the public transfer history is also read to estimate dated purchase lots for the cost-basis view
- **Data Sent**: Only the address you enter, only to the balance provider for that coin — never anywhere else. Read-only lookup of public blockchain data; no keys, no signing, no wallet connection
- **Storage**: Watched addresses are stored locally like every other setting and can be removed at any time
- **Privacy**: See [mempool.space Privacy Policy](https://mempool.space/privacy-policy) and [Blockchair Privacy Policy](https://blockchair.com/privacy)

### News sources (optional ticker row, off by default)

- **Endpoints**: `https://api.blockchair.com/news` and `https://hn.algolia.com/api/v1/search` (Hacker News stories)
- **Purpose**: Crypto news headlines in the optional ticker bar
- **Data Sent**: No user data — plain GET requests
- **Outbound links**: Clicking a headline opens the news site in a new tab. The link carries no referrer information (`rel="noreferrer"`), so the site cannot tell the visit came from PriceTab. From that point the news site's own privacy policy applies.
- **Privacy**: See [Blockchair Privacy Policy](https://blockchair.com/privacy) and [Algolia Privacy Policy](https://www.algolia.com/policies/privacy/)

### Local Vendor Files

All JavaScript libraries (React, D3.js, styled-components), styles, and fonts are loaded from local files bundled with the extension — no external CDN or font requests.

## Data Storage Location

All preference data is stored:
- **Where**: Locally in your Chrome browser's localStorage
- **Encryption**: Not encrypted (data is not sensitive - just coin symbols)
- **Access**: Only accessible by this extension
- **Persistence**: Remains until you clear browser data or uninstall the extension
- **Size**: Typically 50-100 bytes (your coin list)

## Data Sharing

**We do not share any data because we do not collect any data.**

Your cryptocurrency preferences never leave your device and are not transmitted to us or any third party.

## Children's Privacy

PriceTab does not knowingly collect any information from anyone, including children under 13. The extension does not require any personal information to function.

## Data Retention

- **Local Data**: Your coin preferences remain in localStorage until you:
  - Clear your browser data
  - Uninstall the extension
  - Manually reset preferences

- **We Have No Server Data**: We cannot retain data because we don't collect it in the first place.

## Your Rights and Choices

You have complete control over your data:

### View Your Data
Open the browser console on any new tab and run:
```javascript
localStorage.getItem('crypto_chart_coin_options')
```

### Delete Your Data
You can delete all extension data by:
1. Opening the browser console on any new tab
2. Running: `localStorage.removeItem('crypto_chart_coin_options')`
3. Refreshing the page

Or simply uninstall the extension.

### Export Your Data
Your data is just a JSON array of coin symbols. You can copy it from the console at any time.

## Security

While we implement reasonable security measures:
- Data is stored using standard browser localStorage APIs
- We use HTTPS for all API calls
- We do not execute arbitrary code from external sources
- We follow Chrome extension security best practices

However, localStorage is not encrypted. Since we only store non-sensitive data (coin symbols), this is acceptable.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify users of any material changes by:
- Updating the "Last Updated" date at the top of this policy
- Posting a notice in the extension description
- Requiring acceptance of updated policy (if necessary)

Your continued use of PriceTab after any changes constitutes acceptance of the new Privacy Policy.

## Open Source

PriceTab is open source. You can review our code at:
- **GitHub Repository**: https://github.com/Zekuath/Pricetab
- **License**: MIT License

We encourage security researchers to review our code and report any concerns.

## Contact Us

If you have any questions about this Privacy Policy or our practices, please contact us:

- **GitHub Issues**: https://github.com/Zekuath/Pricetab/issues

## Compliance

### GDPR Compliance (EU)
Since we do not collect, process, or store any personal data:
- No data subject rights are applicable (there is no data to access, modify, or delete beyond what's in your local browser)
- No Data Protection Officer is required
- No data processing agreements are needed

### CCPA Compliance (California)
We do not sell personal information because we do not collect personal information.

### Other Jurisdictions
We do not collect personal data, so most privacy regulations do not apply.

## Disclaimer

This extension is provided "as is" without warranty. We are not responsible for:
- Accuracy of data from Coinbase API
- Financial decisions made based on displayed information
- Service interruptions or API downtime

**This extension is for informational purposes only and does not constitute financial advice.**

---

## Summary (TL;DR)

✅ **What we store**: Only your coin preferences, locally on your device
✅ **What we collect**: Nothing
✅ **What we share**: Nothing
✅ **Third parties**: Only public, no-auth APIs — Coinbase (prices), OKX/Bybit/Coinlore/Alternative.me/mempool.space (optional widgets), Blockchair + Hacker News/Algolia (optional news headlines), mempool.space/Blockchair (optional watched-address balances)
✅ **Your control**: Delete data anytime by clearing localStorage or uninstalling

**We respect your privacy because we simply don't collect any data.**

---

**PriceTab Privacy Policy v1.0.0**
Last Updated: August 6, 2026
