# PriceTab - Chrome Web Store Compliance Report

> **Last Updated:** May 2026
> **Status:** Ready for Submission

---

## Summary

PriceTab is **FULLY COMPLIANT** with the vast majority of Chrome Web Store
policies. Both past rejections were **Yellow Argon (Keyword Spam)**, caused by
coin lists in the store description.

**Standing at 1.4.0 (19 Aug 2026):**

- The rewritten description in `STORE_DESCRIPTION.md` contains **zero coin
  names and zero tickers** — measured, not assumed. That is the direct answer
  to the only thing this listing has ever been rejected for.
- The one genuinely new policy surface is **calls**, which a reviewer can
  misread as gambling. The position, and the code that enforces it, is set out
  in *Calls and the gambling policy* below. Read it before submitting.
- Still zero permissions, still no remote code, still no data collection of any
  kind.

---

## Rejection History

### Rejection #1 - January 2026

| Field | Value |
|-------|-------|
| Rejection Code | Yellow Argon |
| Violation | Keyword Spam |
| Detail | "BTC, ETH, BNB.........................." |
| Location | Store description |
| Root Cause | Coin ticker list in description |
| Solution | Rewrote coin list in natural language in `STORE_DESCRIPTION.md` |

**Lesson learned:** But `STORE_ASSETS.md` still had a full coin list in its embedded description copy — and it was used for the next submission.

### Rejection #2 - May 2026

| Field | Value |
|-------|-------|
| Rejection Code | Yellow Argon |
| Violation | Keyword Spam |
| Detail | "Bitcoin, Ethereum, Solana, XRP, Dogecoin, Cardano" |
| Location | Store description (submitted from `STORE_ASSETS.md`) |
| Root Cause | Duplicate description in `STORE_ASSETS.md` still had coin names/list |
| Solution | Removed embedded description from `STORE_ASSETS.md`; it now points to `STORE_DESCRIPTION.md` as the single canonical source |

**Rule going forward:** `STORE_DESCRIPTION.md` is the **only** source of truth for the store description. Never copy it elsewhere.

---

## Policy Compliance Matrix

### Security Policies

| Policy | Status | Notes |
|--------|--------|-------|
| Malware/Spyware | COMPLIANT | No harmful code |
| Crypto Mining | COMPLIANT | No mining, only price display |
| Hate Content | COMPLIANT | Neutral financial data |
| Violence | COMPLIANT | Not applicable |
| Illegal Activities | COMPLIANT | Legal API usage |
| Gambling | COMPLIANT | Nothing can be staked, won or cashed out — see *Calls and the gambling policy* below |

### Privacy Policies

| Policy | Status | Notes |
|--------|--------|-------|
| Privacy Policy | COMPLIANT | `docs/PRIVACY.md` exists |
| Data Collection | COMPLIANT | No user data collected |
| Limited Use | COMPLIANT | No data sharing |
| User Consent | COMPLIANT | Consent not needed (no data) |
| Disclosure | COMPLIANT | All functions disclosed |

### Technical Requirements

| Policy | Status | Notes |
|--------|--------|-------|
| Manifest V3 | COMPLIANT | `manifest_version: 3` |
| Local Code | COMPLIANT | All JS in `vendor/` |
| eval() | COMPLIANT | Not used |
| Remote Code | COMPLIANT | No external scripts |
| Obfuscation | COMPLIANT | Code readable |
| CSP | COMPLIANT | Manifest V3 default |

### Permission Policies

| Policy | Status | Notes |
|--------|--------|-------|
| Minimum Permission | COMPLIANT | **ZERO** permissions |
| Unnecessary Permission | COMPLIANT | No extra permissions |
| Host Permissions | COMPLIANT | No host permissions |

### Quality Policies

| Policy | Status | Notes |
|--------|--------|-------|
| Single Purpose | COMPLIANT | "Crypto price charts" |
| Minimum Functionality | COMPLIANT | Fully functional product |
| Working State | COMPLIANT | All features active |
| Metadata | **FIXED** | Keyword spam removed |

### NTP Policies

| Policy | Status | Notes |
|--------|--------|-------|
| URL Overrides API | COMPLIANT | Using `chrome_url_overrides` |
| Search API | NOT APPLICABLE | No search functionality |
| User Settings | COMPLIANT | No interference with settings |

### Marketing Policies

| Policy | Status | Notes |
|--------|--------|-------|
| Deceptive Install | COMPLIANT | No misleading marketing |
| Impersonation | COMPLIANT | No impersonation |
| Keyword Spam | **FIXED** | Coin lists removed |
| Accurate Metadata | COMPLIANT | Accurate information |

---

## Fixed Issues

### 1. Keyword Spam (Yellow Argon)

**Previous Version:**
```
SUPPORTED CRYPTOCURRENCIES

Major: BTC, ETH, BNB, SOL, XRP, USDT, USDC, DOGE, ADA, AVAX
DeFi: LINK, UNI, AAVE, MKR, SNX, COMP, CRV, SUSHI
Layer 2: ARB, OP, MATIC, IMX, LRC
Meme: DOGE, SHIB, PEPE, BONK, WIF, FLOKI
And 55+ more...
```

**Fixed Version:**
```
WIDE CRYPTOCURRENCY SUPPORT

Track over 60 cryptocurrencies from the Coinbase API. Whether you
follow major coins like Bitcoin and Ethereum, explore DeFi protocols,
or keep an eye on meme coins, PriceTab has you covered. New coins
are added regularly based on Coinbase availability.
```

**Why Fixed:**
- Long coin lists are considered "keyword stuffing"
- Comma-separated lists look like spam
- Chrome Web Store prefers natural language

---

## Calls and the gambling policy

**Read this before the next submission.** Since 1.4.0 the extension has a
feature called *calls*: you point at a square on the chart — a price band at a
moment in the future — and it settles itself later as "called it" or "missed",
keeping a tally. A reviewer skimming the listing will see *predict the price
and keep score*, and gambling services are explicitly prohibited (see
`CHROME_STORE_POLICIES.md`; Grey Copper in `REJECTION_CODES.md`). The position
below is the answer, and it is enforced by the code rather than by intent.

**Nothing is staked.** There is no wager, no entry cost, no pot and no
counterparty. A call costs nothing to place and withdrawing one costs nothing.

**Nothing is won.** The outcome is two counters — how many were right, and the
best run — held in `localStorage` on that one machine. There is no currency, no
points that buy anything, no leaderboard, no account to attach a result to, and
no way to move a score to another device, let alone to another person.

**Nothing can be cashed out.** The extension has zero permissions and makes no
outbound request other than fetching public market data. There is no payment
path, no wallet connection anywhere in the product (the holdings view is
tracking-only and asks for no key), and no server that could hold a balance.

**This was a deliberate design constraint, not a happy accident.** The comment
in `src/config.js` beside the feature's storage key states it: a score that
could become something purchasable would turn a price chart into a wager on an
asset, which the store bans outright — and a number in `localStorage` could
never be trusted with value in any case.

**If asked, the one-line answer:** calls are a self-scored accuracy record for
your own reading of the market, like marking your own exam paper. The store
listing says the same in its disclaimer: *"they are not a wager, nothing can be
staked on them and they carry no value."*

**What would break this** — do not do any of these without a policy review
first: attaching a purchasable or transferable value to the score; a
leaderboard or any comparison against other users; syncing the record off the
device; or any wording in the listing that frames a call as a bet, a stake or a
prize.

---

## Strengths

Features that help PriceTab get easy approval:

### 1. Zero Permissions
```json
// manifest.json - NO PERMISSIONS
{
  "permissions": []  // Empty!
}
```
This significantly speeds up the review process.

### 2. Fully Local Code
```
vendor/
├── react.production.min.js       # Local
├── react-dom.production.min.js   # Local
├── d3.min.js                     # Local
├── styled-components.min.js      # Local
└── ...                           # All dependencies local
```
No external CDN or remote code.

### 3. Manifest V3 Compliance
- Modern extension platform
- Strong security guarantees
- CSP active by default

### 4. Privacy-Focused
- No user data collected
- No analytics
- No tracking
- Only preferences in localStorage

### 5. Single Purpose
- Clear and narrow focus: "Crypto price charts"
- All features serve this purpose
- No search functionality (no additional requirements)

---

## Potential Risk Areas

### Low Risk

| Area | Risk | Mitigation |
|------|------|------------|
| API Dependency | Coinbase down | Offline mode and cache |
| Content Currency | Outdated screenshots | Regular updates |
| Link Breakage | Privacy policy URL | Use GitHub Pages |

### Zero Risk

| Area | Reason |
|------|--------|
| Permission Issue | No permissions |
| Remote Code | All code local |
| Data Privacy | No data collected |
| Single Purpose | Single purpose: price display |

---

## Resubmission Checklist

### To Do

- [x] Keyword spam fixed (`STORE_DESCRIPTION.md`)
- [ ] Store description copied to Chrome Web Store
- [ ] Privacy policy URL verified
- [ ] Screenshots current
- [ ] ZIP file created
- [ ] Resubmitted

### Expected Outcome

**Approval time:** 24 hours - 3 days

After fix:
- Manifest V3 compliant
- Zero permissions
- Keyword spam fixed
- Full compliance with other policies

**Expectation:** APPROVAL

---

## Future Potential Issues

### Points to Watch

1. **When Adding New Features**
   - Don't violate single purpose policy
   - Don't add features unrelated to crypto
   - Consider separate extension if adding very different features

2. **When Updating Description**
   - Avoid long lists
   - Use natural language
   - Avoid keyword repetition

3. **When Adding Permissions**
   - Define justification for each permission
   - Follow minimum permission principle
   - Unnecessary permissions can cause rejection

4. **When Changing API**
   - Don't execute remote code
   - Keep all logic local
   - NEVER use eval()

---

## References

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [Troubleshooting Violations](https://developer.chrome.com/docs/webstore/troubleshooting)
- [Yellow Argon - Keyword Spam](https://developer.chrome.com/docs/webstore/troubleshooting#yellow-argon)
- [Quality Guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
