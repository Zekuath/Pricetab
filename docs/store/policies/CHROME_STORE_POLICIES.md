# Chrome Web Store Developer Program Policies

> **Last Updated:** January 2026
> **Source:** [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies)

This document contains all policies that must be followed to publish an extension on the Chrome Web Store.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Safe Ecosystem](#safe-ecosystem)
3. [User Privacy](#user-privacy)
4. [Marketing and Monetization](#marketing-and-monetization)
5. [Quality Product Requirements](#quality-product-requirements)
6. [Technical Requirements](#technical-requirements)
7. [Manifest V3 Specific Requirements](#manifest-v3-specific-requirements)
8. [New Tab Page Policies](#new-tab-page-policies)
9. [Enforcement Process](#enforcement-process)

---

## Core Principles

Chrome Web Store is built on three foundational principles:

### 1. Be Safe
- Extensions that pose security threats are removed
- Extensions accessing unnecessary data are removed
- Extensions encouraging harm are removed
- Extensions abusing the system are removed

### 2. Be Honest
- Developers must clearly disclose all functionalities
- Deceptive extensions are removed
- No misleading information to users

### 3. Be Useful
- Extensions must provide educational, informative, or entertaining value
- Positive user experience must be delivered
- Minimum functionality standards must be met

---

## Safe Ecosystem

### Prohibited Content Types

#### Adult and Sexual Content
- Pornography and sexually explicit content is **PROHIBITED**
- Products containing non-sexual artistic/educational nudity must be marked as "Mature"
- Enable "Mature content" option in Dashboard

#### Malicious and Prohibited Products
- Malware, spyware, phishing is **PROHIBITED**
- Cryptocurrency mining is **PROHIBITED** (even with user consent)
- Applications that disrupt other software or systems are **PROHIBITED**

#### Hate Speech and Violence
- Hate speech against protected groups is **PROHIBITED**
- Violent content and bullying is **PROHIBITED**
- Extremism propaganda is **PROHIBITED**

#### Regulated Goods and Services
- Drug sales is **PROHIBITED**
- Weapons sales is **PROHIBITED**
- Gambling services is **PROHIBITED** (explicitly banned in 2025 update)
- Illegal activities is **PROHIBITED**

---

## User Privacy

### Privacy Policy Requirements

**REQUIRED:** If your extension processes any user data:

1. **Privacy policy must be published**
   - Data collection practices must be explained
   - Purpose of data usage must be stated
   - Data sharing practices must be explained
   - All third parties receiving data must be listed

2. **Designated field must be used**
   - Privacy policy link must be entered in the Dashboard's designated field
   - Links written in the description are **NOT ACCEPTED**

### Limited Use

Collected data:
- Can **ONLY** be used for stated purposes
- Web browsing activity collection is **PROHIBITED** (despite user consent, unless required)

**Data Transfer Permitted Cases:**
1. Providing/improving core functionality
2. Legal compliance
3. Security/fraud prevention
4. Post-acquisition (with explicit user consent)

### Human Access Restrictions

Personnel **CANNOT** access user data, except:
- Explicit user consent for specific data access
- Anonymized aggregated data for internal operations
- Security investigations
- Legal requirements

### Permission Requirements

**Basic Rule:** "Request the narrowest permission"

```
WRONG: Requesting broad permissions for potential future needs
CORRECT: Requesting only minimum permissions required for current features
```

**Permission Best Practices:**
- `activeTab` does NOT provide passive access
- `tabs` only accesses specific tab properties
- `storage` permission is DIFFERENT from Web Storage API
- Unused permissions MUST BE REMOVED from manifest

### Disclosure Requirements

For non-core data collection:
1. Prominent pre-installation disclosure must be made
2. Affirmative user consent must be obtained
3. Details must be provided in privacy policy

---

## Marketing and Monetization

### Impersonation and Intellectual Property

- Copying other developers' work is **PROHIBITED**
- Brand/logo impersonation is **PROHIBITED**
- Using misleading names is **PROHIBITED**

### Deceptive Installation Tactics

**PROHIBITED:**
- Misleading marketing
- Hidden metadata
- Bundling unrelated extensions together
- Hiding what the user is installing

**REQUIRED:**
- All CTA buttons must clearly state "extension will be installed"
- Advertising and marketing materials must reflect actual functionality

### Advertising Policies

**Permitted:**
- Contextual advertisements
- Advertisements clearly stating which product they belong to

**PROHIBITED:**
- Advertisements simulating system warnings
- Interference with third-party sites
- Requiring clicks for application functionality
- Automatic ad injection in background

### Affiliate Programs

**REQUIRED:**
1. Prominent pre-installation disclosure
2. Direct user action required
3. Providing tangible benefit (discount, cashback, donation)

**PROHIBITED:**
- Automatic affiliate link injection in background
- Placing affiliate cookies without user action

### Payment Processing

- Credit card data must be processed securely
- Developer must be clearly identified as seller (not Google)
- Payment card industry rules must be followed

---

## Quality Product Requirements

### Single Purpose Policy

**CRITICAL:** Extensions must serve a single, narrow, and understandable purpose.

**Valid Approaches:**
1. Narrow focus area/subject (e.g., "news headlines", "weather")
2. Narrow browser function (e.g., "new tab page", "tab management")

**Checklist:**
- [ ] Does it have narrow focus or function?
- [ ] Are all features directly related to this purpose?
- [ ] Does it modify browser behavior predictably?
- [ ] Does it request only necessary permissions?

**VIOLATION EXAMPLES:**
- Weather + shopping coupons + tab management (combined)
- Web search + games + note taking (combined)

**SOLUTION:** Unrelated features must be separate extensions.

### Listing Requirements

**REQUIRED Elements:**
- [ ] Meaningful icon
- [ ] Descriptive title
- [ ] Detailed description
- [ ] Screenshots
- [ ] Explanation of all features

**PROHIBITED:**
- Empty or vague descriptions
- Keyword stuffing (excessive/irrelevant keywords)
- Site listings (without added value)
- Misleading metadata

### Minimum Functionality

**Extension MUST provide:**
- Direct benefit/service
- Features that work without external links
- Real functionality (just redirecting to other apps is PROHIBITED)

**INSUFFICIENT FUNCTIONALITY EXAMPLES:**
- Extensions that only open websites
- Extensions that only install other applications
- Broken/non-working features
- Click-bait templates

---

## Technical Requirements

### Code Readability Requirements

**REQUIRED:** "The full functionality of an extension must be easily discernible from its submitted code."

**PERMITTED:**
- Minification (removing whitespace, comments, block delimiters)

**PROHIBITED:**
- Obfuscation (code hiding)
- Base64 encoding
- Character encoding for hiding
- Hard-to-understand code structures

### API Usage

**REQUIRED:** Existing Chrome APIs must be used for designated purposes.

**PROHIBITED:** Using alternative methods when an API exists.

**Example:**
```
WRONG: Changing NTP outside of URL Overrides API
CORRECT: Changing NTP using chrome_url_overrides
```

### 2-Step Verification

**REQUIRED:** 2FA must be enabled for all developer accounts:
- Before publishing extension
- Before updating extension

---

## Manifest V3 Specific Requirements

> **Source:** [MV3 Requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)

### Core Principle

All extension functionality must be **easily discernible** from submitted code. Logic must be **self-contained** within the extension package.

### PROHIBITED Code Patterns

```javascript
// PROHIBITED: External script tag
<script src="https://external.com/script.js"></script>

// PROHIBITED: Remote code execution with eval()
eval(fetchedCode);

// PROHIBITED: Interpreter running remotely fetched commands
const commands = await fetch('https://api.com/commands');
executeCommands(commands); // PROHIBITED

// PROHIBITED: Executing logic from external sources
```

### PERMITTED Remote Communication

```javascript
// OK: Syncing user account data
await syncUserData(userId);

// OK: Fetching configuration file for A/B testing
// (provided all logic remains within extension)
const config = await fetch('config.json');
if (config.featureEnabled) { /* internal logic */ }

// OK: Loading non-logic resources (images, etc.)
const image = await fetch('https://api.com/image.png');

// OK: Server-side data operations
const encrypted = await serverEncrypt(data, privateKey);
```

### Exceptions

**APIs permitted for remote code execution:**
1. **Debugger API** - for debugging functions
2. **User Scripts API** - for user scripts

**Isolated Contexts:**
- Code in iframes and sandbox pages can load external code
- However, user data policies must still be followed

### Enforcement

Extensions with unclear functionality may be rejected or removed from Chrome Web Store.

---

## New Tab Page Policies

> **CRITICAL:** This section is especially important as PriceTab is an NTP extension.

### Web Search Requirements

**REQUIRED:** If NTP extensions provide web search experience:
- Must use Chrome Search API
- Must respect user's existing search settings
- Must not change default search engine

**PERMITTED:**
- AI chatbots
- Vertical search:
  - Searching among open tabs
  - Platform-specific search (like Zillow, Kayak)
  - Personalized search using browser data
- Multiple search provider options (top choice must reflect user settings)

**PROHIBITED:**
- Coupling web search changes with other features
- Changing user's default search
- Providing search function without using Chrome Search API

### PriceTab Compliance Note

PriceTab **DOES NOT INCLUDE** search functionality, therefore:
- **DOES NOT NEED** to use Chrome Search API
- **DOES NOT INTERFERE** with existing user search settings
- **COMPLIES** with "Single Purpose" policy (crypto price display)

---

## Enforcement Process

### Review Process

1. **Automated Scan:** Google bots check for malware, policy violations, and manifest issues
2. **Manual Review:** A reviewer manually checks the extension
3. **Decision:** Approval, rejection, or change request

### Review Timeline

| Status | Duration |
|--------|----------|
| Standard | 24 hours (90% within 3 days) |
| New developer/extension | Longer |
| Dangerous permission requests | Longer |
| Significant code changes | Longer |
| Broad host permissions | Longer |
| Large/hard-to-read code | Longer |

**If exceeding 3 weeks:** Contact Support.

### What Reviewers Check

1. **Host permissions:** Broad web activity access receives increased scrutiny
2. **Permission necessity:** Whether requested capabilities are actually needed
3. **Code safety:** Verifying code is secure and functional
4. **Policy compliance:** Adherence to current CWS policies

### Review Outcomes

**New Submissions:**
- Approval → Publication
- Rejection → Policy violation details

**Published Extensions (Periodic Review):**
- No violation → Remains active
- Minor violations → Warning (7-30 days to fix)
- Serious violations → Immediate removal
- Extreme violations → Immediate removal without notification

### Appeal Process

1. Open [One Stop Support](https://support.google.com/chrome_webstore/contact/one_stop_support) form
2. Select "My item (extensions, app, or theme)"
3. Select "My item was warned / removed / rejected"
4. Provide detailed explanation and evidence

**NOTE:** You have **1 appeal** per violation decision.

### Repeat Violations

- Repeated violations lead to account suspension
- Risk of permanent ban from Chrome Web Store

### Circumvention Attempts

**CRITICAL:** "Any attempt to circumvent intended limitations or enforcement actions will result in IMMEDIATE TERMINATION of your developer account."

---

## Resources

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [MV3 Requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Best Practices](https://developer.chrome.com/docs/webstore/program-policies/best-practices)
- [Troubleshooting Violations](https://developer.chrome.com/docs/webstore/troubleshooting)
- [Review Process](https://developer.chrome.com/docs/webstore/review-process)
- [Quality Guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
- [2024 Policy Updates](https://developer.chrome.com/blog/cws-policy-updates-2024)
- [2025 Policy Updates](https://developer.chrome.com/blog/cws-policy-updates-2025)
