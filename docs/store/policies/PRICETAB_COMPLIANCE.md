# PriceTab - Chrome Web Store Compliance Report

> **Last Updated:** 28 September 2026
> **Status:** Not yet ready — 1.5.0 is packaged, but the derivatives market, the alarm and the crypto tax guide are new since. Read the three sections below, then decide what the next build carries (`docs/product/TODO.md`, *Now*)

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
- Still zero permissions *at install*, still no remote code, still no data
  collection of any kind. Two things are **optional** now and both are asked
  for from a button inside the app, never at install: eight newsroom origins
  (`optional_host_permissions`) and `notifications` (`optional_permissions`).
  Each has a justification in `STORE_DESCRIPTION.md` §2.
- **Since 1.5.0 there is a simulated derivatives market** (the "Derivatives
  Market", key `F`): a practice account in valueless Practice Units, priced
  from a real perpetual contract's public quotes. It is the second surface a
  reviewer can misread as gambling; the position is under *The derivatives
  market and the gambling policy* below.
- **Since 28 Sep 2026 there is a crypto tax guide** on the portfolio: every
  country's rules from official sources, and an estimate from what the person
  recorded. It is the one feature a reviewer could read as outside the single
  purpose, or as financial advice; the position is under *The tax guide,
  single purpose and advice* below.

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
| Disclosure | **PENDING FOR NEXT BUILD** | The local privacy policy is current; the live page and store copy still need the final build's features |

### Technical Requirements

| Policy | Status | Notes |
|--------|--------|-------|
| Manifest V3 | COMPLIANT | `manifest_version: 3` |
| Local Code | COMPLIANT | All scripts ship locally in `src/` and `vendor/` |
| eval() | COMPLIANT | Not used |
| Remote Code | COMPLIANT | No external scripts |
| Obfuscation | COMPLIANT | Code readable |
| CSP | COMPLIANT | Manifest V3 default |

### Permission Policies

| Policy | Status | Notes |
|--------|--------|-------|
| Minimum Permission | COMPLIANT | **ZERO** granted at install. Eight news origins are declared `optional_host_permissions` and `notifications` is declared `optional_permissions`; both are requested from a button inside the app — see *Optional host permissions* and *The optional notifications permission* below |
| Unnecessary Permission | COMPLIANT | No extra permissions; `tests/test-invariants.js` §1 keeps both optional lists closed |
| Host Permissions | COMPLIANT | No `host_permissions`. The optional list is the narrowest that works: eight exact origins, no wildcards |

### Quality Policies

| Policy | Status | Notes |
|--------|--------|-------|
| Single Purpose | **PENDING FOR NEXT BUILD** | The argument is recorded below; the release scope and listing still have to agree |
| Minimum Functionality | COMPLIANT | Fully functional product |
| Working State | COMPLIANT | All features active |
| Metadata | **PENDING FOR NEXT BUILD** | Keyword spam is fixed; the description still predates the practice account and tax guide |

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

**Nothing can be cashed out.** The extension has zero permissions at install
and makes no outbound request other than fetching public data. There is no payment
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

## The derivatives market and the gambling policy

**Read this before the next submission.** Since 1.5.0 the extension carries a
simulated derivatives account: long and short contracts with leverage, stops,
funding and liquidation, priced from OKX's public perpetual quotes and settled
in **Practice Units**, a unit that exists only in this page's `localStorage`.
A reviewer will see *leverage*, *liquidation* and *USDT* and think of a
regulated product. The position:

**It is a simulation, and it says so where it cannot be missed.** The feature
is behind a terms screen (`renderPracticeTerms`) that is the *only* thing
drawn until it is accepted — no ticket, no balance, no button — and it states
that no real money is involved. The page head carries *Simulated · no real
money* permanently. Chrome's regulated-goods policy allows a simulation that
offers no winnings, payouts or prizes of value when it clearly states that;
the troubleshooting guide's Grey Copper still rejects anything that
*facilitates* real trading or routes into a venue, and this does neither.

**Nothing is staked, won or cashed out.** Practice Units are added by a button
and cannot be bought, sold, transferred or converted. There is no account with
any venue, no order ever leaves the device, no key, no wallet, no payment path.
The quotes it reads are the same public endpoints the funding-rate widget has
used since 1.1.0 (`www.okx.com`, `api.bybit.com`) — no new host.

**It is not financial advice, and the code enforces the wording.** The
assistant on the page *reports* (a stop against the window's ordinary steps,
the loss at the stop against the plan) and never advises; the crowd reading
leans only with its own counted record and says "no lean" otherwise; the
listing's disclaimer covers it.

**What would break this** — do not do any of these without a policy review
first: a way to fund the account with anything of value; a route from a
contract to a real venue (a "trade this for real" link counts); a
leaderboard or shared record; removing the terms screen or the *no real money*
line; or any wording that frames a Practice Unit as money.

---

## The tax guide, single purpose and advice

**Read this before the next submission.** Since 28 Sep 2026 the portfolio
carries a **Tax guide**: the crypto tax rules of 244 countries and
territories, and — where a rule is specific enough — an estimate of the tax on
the sales and income the person recorded in PriceTab.

**Single purpose.** It is part of the holdings view, not a second product: it
reads the same records the cost-basis report has exported since 1.4.0 and
explains what those records mean in the person's country. It adds no
permission, no host and no request — the data is bundled, and
`tests/test-invariants.js` fails if that file ever makes one. It is off the
new tab until the portfolio is opened and the button pressed. The
single-purpose description in `STORE_DESCRIPTION.md` §2 should name it in the
holdings clause if it ships.

**Not advice, and the code enforces the wording.** The screen and the
downloaded file open with *not tax advice*. Every rule comes from the
country's own authority — tax administration, law or gazette, parliament,
ministry, central bank — linked, with the day it was read; `tests/test-tax-report.js`
fails on any source host that is not a government domain or a named public
institution. A country with no official source confirmed states nothing. The
estimate uses the rate the person types where the law sets it by income, says
what it could not use, and never files anything or tells anyone what to do.

**Links, not requests.** A source opens only when clicked, in a new tab, with
no referrer. `PRIVACY.md` says so under *Outbound links*.

**What would break this** — do not do any of these without a policy review
first: a filing or submission path to any authority; a paid tax product or
affiliate link inside the guide; a recommendation ("sell before…", "hold to
save…"); or a source that is not the authority itself.

---

## Strengths

Features that help PriceTab get easy approval:

### 1. Zero Permissions at Install
```json
// manifest.json — nothing is granted when the extension is added
{
  "permissions": [],
  "optional_host_permissions": [
    "https://cointelegraph.com/*", "https://decrypt.co/*",
    "https://cryptoslate.com/*", "https://bitcoinmagazine.com/*",
    "https://coinjournal.net/*", "https://feeds.bbci.co.uk/*"
  ]
}
```
Chrome shows **no install-time warning** for `optional_host_permissions` and
does not treat them as granted, so the fast review path is unchanged.

#### Optional host permissions — the justification, if it is ever asked for

**Read this before the next submission**, alongside *Calls and the gambling
policy* below.

- **What it is for.** Headlines in the news panel. Every crypto newsroom worth
  reading serves its feed without an `Access-Control-Allow-Origin` header, so a
  browser page cannot read one at all. Measured 21 Aug 2026: the only keyless,
  CORS-enabled feed available carried **7 outlets** across a 580-article sample,
  a third from a single aggregator, and had published nothing for **101 hours**.
  GDELT, the only global alternative, answered **3 of 20** requests at 8-second
  spacing and **0 of 7** at 100 seconds.
- **It is never granted without a person asking.** There is a button in the
  news panel; Chrome shows its own dialog; a second button revokes it.
- **The narrowest scope that works.** Eight exact origins, no wildcards, no
  `<all_urls>`, no content scripts, no `tabs`, no `webRequest`. The extension
  fetches the published feed URL and nothing else.
- **Nothing is sent.** Plain GET requests for a public feed. No user data, no
  coin list, no holdings, no identifiers — and the request is not made at all
  until the permission is granted (`tests/test-polish-render.js` §10b asserts
  exactly that).
- **Single purpose is unchanged.** Crypto price charts; news about the coins
  you are charting is part of that surface, not a second product.

**What would break this** — do not do any of these without a policy review:
moving these origins into `host_permissions`; widening any of them to a
wildcard host; adding a content script; or fetching a feed before the
permission is granted.

#### The optional notifications permission

`optional_permissions: ["notifications"]` was added on 7 Sep 2026 for the one
thing the tab title cannot do: tell somebody who is looking at another tab
that a price target was hit or a contract was stopped out.

- **Never granted at install.** Chrome raises no install-time warning for an
  optional permission. It is requested from the alarm switch in the Targets
  panel and on the derivatives page, straight out of the click
  (`requestNotifyPermission` in `src/notify.js`), and the same row revokes it.
- **Nothing is sent.** A notification is drawn by the browser from data the
  page already has. There is no background service worker, so it fires only
  while a PriceTab tab is open — and the row says so.
- **Not stored.** `chrome.permissions.contains` is the only source of truth,
  because the permission can be revoked from `chrome://extensions` without
  the page hearing.
- The justification text for the dashboard is in `STORE_DESCRIPTION.md` §2.

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
- Settings, targets, holdings and simulated records stay in `localStorage`; there is no account or server

### 5. Single Purpose
- Clear and narrow focus: reading the crypto market on the new tab page
- Every feature reads the same prices a different way; the practice account
  and the tax guide are the two to re-check against the description (above)
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
| Permission Issue | No permissions granted at install; two optional ones, each justified |
| Remote Code | All code local |
| Data Privacy | No data collected |

### Read before submitting

| Area | Risk | Where the answer is |
|------|------|---------------------|
| Calls read as gambling | Medium | *Calls and the gambling policy* above |
| The derivatives market reads as gambling or as a trading product | Medium | *The derivatives market and the gambling policy* above; the terms screen and the *no real money* line are the enforcement |
| The tax guide reads as outside the single purpose, or as advice | Medium | *The tax guide, single purpose and advice* above; official sources only and *not tax advice* first are the enforcement |
| Optional permissions read as data collection | Low | Both justifications in `STORE_DESCRIPTION.md` §2; nothing is sent by either |

---

## Resubmission Checklist

### To Do

- [x] Keyword spam fixed (`STORE_DESCRIPTION.md`)
- [ ] Store description copied to Chrome Web Store
- [x] Privacy policy URL answers HTTP 200 (verified 28 Sep 2026)
- [ ] Publish the current 28 Sep policy — the live page still shows the 6 Aug copy
- [ ] Privacy policy URL entered and verified in the dashboard field
- [ ] Decide the build's scope — whether the derivatives market and the tax guide ship in it
- [ ] Single-purpose description and detailed description updated for what ships, with their translations
- [ ] Screenshots current (the 1.4.0 set predates the derivatives market, the news panel, the tax guide and the portfolio's card layout — see `STORE_ASSETS.md`)
- [ ] ZIP file created with `./scripts/package.sh`
- [ ] Resubmitted

### Expected Outcome

**Approval time:** 24 hours - 3 days

After fix:
- Manifest V3 compliant
- Zero permissions at install, two optional ones justified
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
