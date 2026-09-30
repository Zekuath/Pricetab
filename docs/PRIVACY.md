# Privacy Policy for PriceTab

**Last Updated:** September 29, 2026  
**Effective Date:** January 23, 2026

> **TL;DR:** Everything PriceTab knows about you — your coins, settings, targets, calls, holdings, tax-guide choices and the simulated derivatives account — lives in your browser, on your device. We collect nothing, share nothing, and have no servers. Nothing is granted at install. Two things are optional and off until you press a button inside the app: a Chrome notification, and eight newsroom feeds.

## Introduction

PriceTab ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our Chrome browser extension.

## Information We Collect

### Data Stored Locally

PriceTab stores the following information **locally on your device only**:

- **Cryptocurrency Preferences:** The list of cryptocurrency symbols you select (e.g., BTC, ETH, SOL)
- **Coin Order:** The order in which you arrange your selected coins
- **Widget Settings:** Which widgets are enabled and their display order
- **UI Preferences:** Theme, language, currency, refresh interval, auto-rotate, ticker and news settings, hidden widget states
- **Price Targets, Calls and the Portfolio:** the targets you set, the calls you record and their score, your holdings, purchases, sales and income records, any public address you choose to watch, and the country and tax rates you choose in the tax guide
- **Drawings:** the lines, boxes and notes you draw on a coin's chart, with the prices and times they are anchored to
- **The simulated derivatives account:** its balance in Practice Units, its contracts and its ledger — none of it is money
- **Caches:** recently fetched prices, widget readings and headlines, kept so a new tab can paint before any request returns

This data is stored using the browser's `localStorage` API and **never leaves your device**.

### Data We Do NOT Collect

- We do NOT collect any personal information
- We do NOT collect your browsing history
- We do NOT track your activity
- We do NOT use cookies for tracking
- We do NOT share any data with third parties
- We do NOT use analytics or telemetry
- We do NOT store data on our servers (we don't have any servers)
- We do NOT sell or monetize user data in any way

## Third-Party Services

All APIs used by PriceTab are **public** — no authentication or accounts required.

### Coinbase Public API

- **Endpoints:** `https://www.coinbase.com/api/v2/prices/` and `https://api.exchange.coinbase.com/products/…/candles`
- **Purpose:** Real-time cryptocurrency prices, historical charts, and the chart's open/high/low/close/volume readout
- **Data Sent:** Coin symbol (e.g., "BTC-USD") and time period
- **Privacy:** [Coinbase Privacy Policy](https://www.coinbase.com/legal/privacy)

### Kraken Public API

- **Endpoints:** `https://api.kraken.com/0/public/OHLC` and `https://api.kraken.com/0/public/Ticker`
- **Purpose:** Prices and charts for the six coins Coinbase does not list, long-range candles for every coin, and a fallback for any coin while Coinbase is not answering
- **Data Sent:** Coin pair (e.g. "XMRUSD") and interval — no user data
- **Privacy:** [Kraken Privacy Policy](https://www.kraken.com/legal/privacy)

### Alternative.me (Fear & Greed Index)

- **Endpoint:** `https://api.alternative.me/fng/`
- **Purpose:** Crypto Fear & Greed Index widget
- **Data Sent:** No user data — plain GET request

### OKX Public API (optional widgets and the derivatives page)

- **Endpoint:** `https://www.okx.com/api/v5/public/`
- **Purpose:** Funding rate, Open Interest and Liquidations widgets; and, only while the derivatives page is open, the perpetual contract's own price, candles and order book (`https://www.okx.com/api/v5/market/`), which price the simulated account. Nothing about that account is ever sent; the page only reads
- **Data Sent:** Coin pair — no user data
- **Privacy:** [OKX Privacy Policy](https://www.okx.com/privacy)

### Bybit Public API (optional widget and the derivatives page)

- **Endpoint:** `https://api.bybit.com/v5/market/`
- **Exchange notices (opt-in):** if you switch on “Bybit notices” in the news panel, `https://api.bybit.com/v5/announcements/index` is asked for its delisting and network-upgrade notices; nothing is asked until you do, and its listings, campaigns and giveaways are never shown
- **Purpose:** Long/Short ratio widget; and, only while the derivatives page is open, its market readings — the share of accounts holding a long, and the history of funding and open interest they are ranked against **Data Sent:** Coin symbol — no user data
- **Privacy:** [Bybit Privacy Policy](https://www.bybit.com/en/privacy)

### Coinlore Public API (optional widgets)

- **Endpoint:** `https://api.coinlore.com/api/`
- **Purpose:** Market Overview (market cap, volume, dominance), Altcoin Season Index, and one bulk snapshot of the top 100 coins that prices the ticker, the watchlist, top movers and the portfolio's price-only coins
- **Data Sent:** No user data — plain GET requests
- **Privacy:** [Coinlore](https://www.coinlore.com)

### mempool.space API (optional widgets)

- **Endpoint:** `https://mempool.space/api/`
- **Purpose:** Bitcoin Halving Countdown (current block height), the network-fee, mempool and difficulty cards
- **Data Sent:** No user data — plain GET request
- **Privacy:** [mempool.space Privacy Policy](https://mempool.space/privacy-policy)

### Address balance lookup (optional portfolio watching)

- **Endpoints:** `https://mempool.space/api/address/…` (BTC balance and transaction history), `https://api.blockchair.com/{chain}/dashboards/address/…` (ETH, LTC, DOGE, BCH, ZEC balances) and `https://ethereum-rpc.publicnode.com` (ERC-20 token balances, read from each token's own contract)
- **Purpose:** If you choose to watch one of your own addresses in the portfolio, its public on-chain balance is read so the holding's amount stays in sync; for BTC the public transfer history is also read to estimate dated purchase lots for the cost-basis view
- **Data Sent:** Only the address you enter, only to the balance provider for that coin, and only while the portfolio feature is used — PriceTab never sends it anywhere else. This is a read-only lookup of public blockchain data; no keys, no signing, no wallet connection
- **Storage:** Watched addresses are stored locally in your browser like every other setting and can be removed at any time (⛓ icon on the holding)
- **Privacy:** [mempool.space Privacy Policy](https://mempool.space/privacy-policy), [Blockchair Privacy Policy](https://blockchair.com/privacy), [PublicNode Privacy Policy](https://www.publicnode.com/privacy)

### News sources (optional ticker row and news panel, off by default)

- **Endpoints:** `https://hn.algolia.com/api/v1/search` (Hacker News stories), `https://search.cnbc.com/…` (CNBC), `https://feeds.content.dowjones.io/…` (MarketWatch), `https://news.bitcoin.com/feed/` and `https://cryptopotato.com/wp-json/…` — the five feeds that can be read without any permission. MarketWatch, a general finance desk, is filtered to crypto stories on the device; CNBC is read from its crypto section
- **Politeness:** every request leaves your own browser with your own address; there is no proxy and no server of ours. A feed that answers 429 or 403 is left alone for fifteen minutes, doubling to two hours, and the panel says so
- **Tone:** the “worded up / worded down” mark on a headline is computed on your device from the words in it, with no request and no AI service
- **Purpose:** Crypto news headlines in the optional ticker bar and the news panel; a rolling archive of headlines this browser has already been shown is kept locally for 30 days so "what happened here?" can answer about recent weeks
- **Data Sent:** No user data — plain GET requests for a publicly published feed
- **Outbound links:** Clicking a headline opens the news site in a new tab. The link carries no referrer information (`rel="noreferrer"`), so the site cannot tell the visit came from PriceTab. From that point the news site's own privacy policy applies. The same holds for the tax guide's source links: each opens the government page it names in a new tab, without referrer information, and only when you click it.
- **Privacy:** [Algolia Privacy Policy](https://www.algolia.com/policies/privacy/); each newsroom's own policy applies to its feed

### "What happened here?" archive (optional chart feature, off by default)

- **Endpoints:** `https://api.blockchair.com/news` and `https://hn.algolia.com/api/v1/search`, each asked about a window in the past. If you have allowed the additional newsrooms, `https://coinjournal.net/wp-json/…` is asked about the same window
- **Purpose:** When you click a marked price move on the chart, the headlines published around that date
- **Data Sent:** Only the date range you clicked — no user data, no coin, no holdings
- **Privacy:** [Blockchair Privacy Policy](https://blockchair.com/privacy), [Algolia Privacy Policy](https://www.algolia.com/policies/privacy/)

### Alarms (opt-in, off until you turn them on)

PriceTab can raise a **Chrome notification** when a price target is hit, or when a contract on the simulated derivatives account is stopped out, takes profit or is liquidated. **It does not do so unless you ask it to.** `notifications` is declared as an *optional* permission, so Chrome grants nothing at install time; the extension still asks for no permissions when you add it.

- **How it is turned on:** the "Chrome notification" switch at the foot of the Targets panel or on the derivatives market page. Chrome shows you its own permission dialog and you decide. "Give it back" in the same row revokes it, and you can also revoke it from `chrome://extensions`
- **Data sent:** none. A Chrome notification is drawn by your own browser, on your own machine. Nothing about the target, the contract, your coins or your holdings leaves the device, and no server is involved at any point
- **What it does not allow:** this permission lets PriceTab draw a notification. It grants no access to any site, no reading of your browsing, and no background access to anything
- **When it can fire:** while a PriceTab tab is open, including one sitting in the background. PriceTab has no background service worker, so with every tab closed nothing is watching and nothing fires
- **The sound** is a separate switch beside it and needs no permission at all. It is generated by the page — two short tones — not a file, and nothing is downloaded to play it

### Additional newsrooms (opt-in, off until you turn them on)

PriceTab can read eight news feeds directly. **It does not do so unless you ask it to.** They are declared in the manifest as *optional* host permissions, which means Chrome grants nothing at install time; the extension still asks for no permissions when you add it.

- **How it is turned on:** a "Turn on full sources" button in the news panel. Chrome shows you its own permission dialog and you decide. There is a "Turn off" button in the same place that revokes it, and you can also revoke it from `chrome://extensions`
- **Endpoints** (only ever fetched once granted): `cointelegraph.com/rss`, `decrypt.co/feed`, `cryptoslate.com/feed/`, `bitcoinmagazine.com/wp-json/wp/v2/posts`, `coinjournal.net/wp-json/wp/v2/posts`, `feeds.bbci.co.uk/news/business/rss.xml`, `www.coindesk.com/arc/outboundfeeds/rss`, `www.theblock.co/rss.xml`
- **Purpose:** headlines in the news panel. The feeds PriceTab can read without permission carry only a handful of outlets, and are sometimes days out of date
- **Data Sent:** no user data — plain GET requests for the publicly published feed. Nothing about you, your coins, your holdings or your settings is included, and nothing is sent anywhere when you turn the permission on
- **What the permission does not allow:** PriceTab reads these feed URLs and nothing else. It does not read your browsing on those sites, does not run on their pages, and has no content script
- **Privacy:** each newsroom's own privacy policy applies to the request, and to any page you open by clicking a headline

### Sanctions list (on the device)

A watched address is checked against the US Treasury's published list of sanctioned addresses. The list is **bundled with the extension** and regenerated at release time, precisely so that the check never sends the address to anyone; the row prints the fact and the list's date, and nothing is refused.

### Crypto tax guide (bundled, link-only)

The tax guide's rules for every country are **bundled with the extension**; reading a country's card makes no request. The country you pick and any rate you type are stored locally like every other setting, and an estimate is worked out on your device from the records you entered. Each rule links to the official page it was read from — a tax authority, a law or gazette, a parliament, a ministry or a central bank — and that page opens only when you click it, in a new tab, without referrer information. The guide is not tax advice and sends nothing to any authority.

### Files you save

The chart image (*Save as image*), the cost-basis and tax CSV files, the portfolio export and the settings backup are all made **on your device** and handed to your browser's own download. None of them is uploaded anywhere. A backup contains your settings, holdings, targets and calls, so keep it as you would any personal file.

### Local Vendor Files

All JavaScript libraries (React, D3.js, styled-components), styles, and fonts are loaded from local files bundled with the extension — no external CDN or font requests. The toolbar popup prints prices from the same local cache and makes no request of its own.

## Data Storage

- **Where:** Locally in your Chrome browser's localStorage
- **Encryption:** Not encrypted. Nothing stored is a secret — no key, no password, no account — but the holdings and addresses you enter are yours, which is why the portfolio can be masked on screen (press `H`) and why every setting can be exported to a file you keep
- **Access:** Only accessible by this extension
- **Size:** From a few hundred bytes (your coin list) to a few hundred kilobytes once the caches, the news archive and the derivatives ledger have filled
- **Persistence:** Remains until you clear browser data or uninstall the extension

## Your Rights and Choices

### View Your Data

Open the browser console on any new tab and run:

```javascript
localStorage.getItem('crypto_chart_coin_options')
```

### Export Your Data

Settings → Preferences → *Backup* → *Save a backup* writes everything PriceTab stores to one file on your computer; *Read a backup…* puts it back, and shows what it would change before it writes anything. The portfolio also exports its own records as CSV and JSON.

### Delete Your Data

Every setting can be reset from Settings; the portfolio and the derivatives account each have their own remove control; and uninstalling the extension removes everything. To clear it all by hand, run the following in the browser console:

```javascript
Object.keys(localStorage).filter(k => k.startsWith('crypto_chart_')).forEach(k => localStorage.removeItem(k))
location.reload()
```

## Data Retention

Everything stays in your browser until you delete it, reset it, clear your browser data or uninstall the extension. The market-data caches are capped in size, and most expire by themselves — prices within a day, the headline archive after 30 days. We keep nothing on any server, because we have none.

## Children's Privacy

PriceTab does not knowingly collect any information from anyone, including children under 13. No personal information is required to use the extension.

## Security

- We use HTTPS for all API calls
- We do not execute arbitrary code from external sources
- All scripts, styles, and fonts are bundled locally — no external CDN or font requests
- We follow Chrome Manifest V3 security best practices

## Open Source

PriceTab is open source. You can review our code at [github.com/Zekuath/Pricetab](https://github.com/Zekuath/Pricetab).

## Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be noted by updating the "Last Updated" date above.

## Contact

Questions? Open an issue at [github.com/Zekuath/Pricetab/issues](https://github.com/Zekuath/Pricetab/issues).

## Compliance

**GDPR:** Since we do not collect, process, or store any personal data, no data subject rights are applicable beyond what is in your local browser.

**CCPA:** We do not sell personal information because we do not collect personal information.

**Other jurisdictions:** We do not collect personal data, so there is nothing for us to access, correct, export or erase on your behalf; everything is in your own browser, under your control.

## Disclaimer

PriceTab is provided "as is", without warranty. Prices, market readings and tax rules come from third parties and official sources and can be delayed, incomplete or change. PriceTab is for information only and is **not financial or tax advice**; the derivatives account is a simulation in units that have no value.

---

*PriceTab Privacy Policy v1.0.0 · MIT License · This extension is for informational purposes only and does not constitute financial advice.*
