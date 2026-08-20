# Chrome Web Store Rejection Codes

> **Source:** [Troubleshooting Violations](https://developer.chrome.com/docs/webstore/troubleshooting)

This document contains all rejection codes used by Chrome Web Store and their solutions.

---

## Rejection Code System

Google names rejection codes with color-element names (Blue Argon, Purple Potassium, Yellow Zinc, etc.). Each code points to a specific type of violation.

---

## Code Reference Table

| Code | Color-Element | Violation Type | Severity |
|------|---------------|----------------|----------|
| Blue Argon | Blue | Manifest V3 requirements | High |
| Blue Zinc | Blue | Prohibited products (paywall) | High |
| Blue Magnesium | Blue | Prohibited products (IP violation) | High |
| Blue Nickel | Blue | Overrides API bypass (NTP) | High |
| Blue Potassium | Blue | Overrides API bypass (search) | High |
| Blue Titanium | Blue | Enforcement circumvention attempt | Critical |
| Yellow Argon | Yellow | **Keyword spam** | Medium |
| Yellow Magnesium | Yellow | Functionality not working | Medium |
| Yellow Zinc | Yellow | Missing metadata | Medium |
| Yellow Lithium | Yellow | Redirection only | Medium |
| Yellow Nickel | Yellow | Spam (duplicate, manipulation) | Medium |
| Yellow Potassium | Yellow | Minimum functionality | Medium |
| Purple Potassium | Purple | Excessive permissions | High |
| Purple Lithium | Purple | Missing privacy policy | High |
| Purple Nickel | Purple | Inadequate data disclosure | High |
| Purple Copper | Purple | Insecure data transmission | High |
| Purple Magnesium | Purple | Other data requirements | High |
| Red Nickel | Red | Deceptive behavior | High |
| Red Potassium | Red | Deceptive behavior | High |
| Red Silicon | Red | Deceptive behavior | High |
| Red Magnesium | Red | Single purpose violation | High |
| Red Argon | Red | Single purpose violation | High |
| Red Zinc | Red | Deceptive installation | High |
| Red Titanium | Red | Code obfuscation | High |
| Grey Zinc | Grey | Illegal activities | Critical |
| Grey Copper | Grey | Gambling | Critical |
| Grey Lithium | Grey | Pornographic content | Critical |
| Grey Magnesium | Grey | Hate content | Critical |
| Grey Nickel | Grey | Non-family safe | Medium |
| Grey Potassium | Grey | Violent content | Critical |
| Grey Silicon | Grey | Cryptocurrency mining | Critical |
| Grey Titanium | Grey | Affiliate ad violation | Medium |

---

## Detailed Violation Explanations and Solutions

### Yellow Argon - Keyword Spam

**Violation:** Including unnecessary and/or irrelevant keywords in extension description.

**Example Violations:**
```
WRONG: "Bitcoin BTC Ethereum ETH BNB XRP LTC SOL ADA DOT LINK AVAX..."
WRONG: "cryptocurrency, crypto, bitcoin, ethereum, altcoin, token, coin..."
WRONG: Long coin lists separated by dots or commas
```

**Solution:**
1. Remove excessive, irrelevant, or repetitive keywords
2. Avoid site listings without added value
3. Make the description natural and readable
4. Use only genuinely relevant terms

**Correct Approach:**
```
CORRECT: "Track over 60 cryptocurrencies from the Coinbase API"
CORRECT: "Monitor the coins you care about with real-time price charts"
CORRECT: "Support for major, mid-cap, and emerging cryptocurrencies"
```

**What triggers Yellow Argon (confirmed by rejections):**
- Any comma-separated coin name list: "Bitcoin, Ethereum, Solana, XRP..."
- Ticker lists: "BTC, ETH, SOL, DOGE, ADA..."
- A dedicated "Supported Cryptocurrencies" section with names/tickers
- Even 4-6 coin names in a row can trigger it

**Safe rule:** Never list more than 1-2 coin names as examples. Use natural language to describe breadth.

---

### Blue Argon - Manifest V3 Requirements

**Violation:** Remotely hosted code or arbitrary string execution.

**Example Violations:**
```javascript
// WRONG: External script
<script src="https://external.com/script.js"></script>

// WRONG: eval() usage
eval(fetchedCode);

// WRONG: Executing remotely fetched commands
const commands = await fetch('https://api.com/commands');
executeCommands(commands);
```

**Solution:**
1. Include all script files in the extension package
2. Remove eval() and similar mechanisms
3. Review "Improve extension security" migration documentation
4. Keep logic within extension, only fetch data

---

### Yellow Magnesium - Functionality Not Working

**Violation:** Broken features or packaging errors.

**Solution:**
1. Test locally with packaged .crx files
2. Verify manifest references match actual file names
3. Handle network errors gracefully
4. Communicate account/environment requirements to users

---

### Purple Potassium - Excessive Permissions

**Violation:** Requesting unnecessary data access.

**Solution:**
1. Remove unused permissions
2. Request only what's necessary
3. Permission notes:
   - `activeTab` does NOT provide passive access
   - `tabs` only accesses specific properties
   - `storage` permission is DIFFERENT from Web Storage API

---

### Yellow Zinc - Missing Metadata

**Violation:** Missing or unclear listing information.

**Solution:**
1. Add meaningful icon
2. Write descriptive title
3. Add detailed description
4. Upload screenshots
5. Clearly state all features

---

### Red Nickel/Potassium/Silicon - Deceptive Behavior

**Violation:** Misrepresented functionality or impersonation.

**Solution:**
1. Ensure functionality matches descriptions
2. Don't impersonate entities or competitors
3. Disclose all actions in metadata

---

### Purple Lithium - Missing Privacy Policy

**Violation:** Undisclosed user data processing.

**Solution:**
1. Add working privacy policy link in Dashboard's designated field
2. Address data collection, usage, processing, and sharing practices

---

### Red Magnesium-Argon - Single Purpose Violation

**Violation:** Multiple unrelated functionalities.

**Solution:**
1. Focus on a single clear purpose
2. Separate new tab pages into standalone extensions
3. Use Chrome Search API for search experiences

---

### Purple Nickel - Inadequate Data Disclosure

**Violation:** Missing consent for data collection.

**Solution:**
1. Prominently disclose data practices in privacy policy and Chrome Web Store listing
2. Obtain user consent before collection
3. Provide opt-out options

---

### Purple Copper - Insecure Data Transmission

**Violation:** Unencrypted or insecure data transfer.

**Solution:**
1. Use HTTPS/modern encryption
2. Avoid transmitting data in headers/query parameters
3. Monitor network activity with DevTools

---

### Red Titanium - Code Obfuscation

**Violation:** Encoded or concealed code.

**Solution:**
1. Publish readable code
2. Minification (whitespace/comment removal) is PERMITTED
3. AVOID Base64 encoding or character encoding

---

### Yellow Potassium - Minimum Functionality

**Violation:** No discernible utility provided.

**Solution:**
1. Provide direct utility
2. Ensure features work without external links
3. Avoid click-bait templates

---

### Grey Titanium - Affiliate Ad Violation

**Violation:** Undisclosed affiliate links/cookies.

**Solution:**
1. Prominently disclose affiliate programs in listing and UI
2. Require related user action before applying codes/links

---

### Blue Titanium - Enforcement Circumvention

**Violation:** Attempts to circumvent review processes.

**Result:** Account suspension.

**Prevention:**
- Don't manipulate store state
- Don't bypass enforcement
- Repeated attempts result in permanent ban

---

## PriceTab Specific Notes

**Current Status:** Yellow Argon (Keyword Spam) rejection received.

**Issue:** Coin list in store description like "BTC, ETH, BNB..........................".

**Solution:**
1. Remove long coin lists
2. Rewrite description in natural language
3. Example: "Track over 60 cryptocurrencies"

---

## Appeal Process

1. Open [One Stop Support Form](https://support.google.com/chrome_webstore/contact/one_stop_support)
2. Select "My item (extensions, app, or theme)"
3. Select "My item was warned / removed / rejected"
4. Provide detailed explanation and evidence

**NOTE:** You have **1 appeal** per violation decision.
