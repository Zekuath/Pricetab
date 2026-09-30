# Chrome Web Store Submission Checklist

> **Pre-Submission Verification Checklist for PriceTab**

This checklist is used to verify all requirements are met before submitting to Chrome Web Store.

> **Working-tree audit, 28 Sep 2026:** `[x]` means repository inspection, a
> direct probe or the full automated check proves the item; `[~]` means part
> exists but the next release still needs work. Dashboard fields, a
> clean-profile pass and submission stay unchecked because they cannot be
> inferred from source.

---

## 1. Manifest Checks

### Basic Requirements
- [x] Using `manifest_version: 3`
- [x] `name` is 75 characters or less (41)
- [x] `description` is 132 characters or less (123)
- [x] `version` follows semantic versioning (1.5.0)
- [x] All icon sizes present and measured (16, 48, 128)

### Permissions
- [x] Only necessary permissions requested — none at install; notifications and eight newsroom origins are optional
- [x] Unused permissions removed
- [x] Host permissions minimized — no `host_permissions`; eight exact optional origins
- [x] Each optional permission has a justification; no broad permission exists

### PriceTab Specific
- [x] Zero permissions at install (`localStorage` requires none)
- [x] Using `chrome_url_overrides.newtab`
- [x] All scripts local (`src/` and `vendor/`)
- [x] CSP compliant (no eval, no inline scripts)

---

## 2. Code Quality

### Manifest V3 Compliance
- [x] No external script tags
- [x] No `eval()` or `new Function` usage
- [x] No remote code execution
- [x] All executable logic ships within the extension

### Readability
- [x] Product code is not obfuscated
- [x] Only the named vendored libraries are minified
- [x] Functionality is discernible from source

### Security
- [x] XSS protections enforced — no `innerHTML`, `outerHTML` or `document.write`
- [x] Stored data passes through tested validators and sanitizers
- [x] No secret, credential or private key is stored; local portfolio data is not encrypted and the privacy policy says so
- [x] Remote API calls use HTTPS

---

## 3. Store Listing

### Required Fields
- [x] Extension name (max 75 characters)
- [x] Short description (max 132 characters)
- [~] Detailed description exists in 13 languages but predates the practice account and tax guide
- [x] At least 1 screenshot — five 1280×800 images exist
- [x] Icon (128×128)
- [ ] Category selected
- [ ] Language selected

### Optional Fields
- [x] Promotional images — 440×280, 920×680 and 1400×560
- [ ] Website URL
- [ ] Support URL

### Content Quality
- [x] Description written in natural language
- [x] No keyword spam
- [x] No long coin or ticker lists
- [ ] No misleading or missing claims — re-check after the release scope and copy are final
- [ ] All links working
- [ ] Screenshots up to date

---

## 4. Privacy

### Privacy Policy
- [x] Privacy policy URL exists and answered HTTP 200 on 28 Sep 2026
- [ ] URL entered in designated field (NOT in description!)
- [~] Policy is accessible, but the live page is still the 6 Aug copy; publish the current 28 Sep file
- [x] Data collection practices explained
- [x] Data usage purpose stated
- [x] Third-party services and the absence of sharing are explained

### Data Collection Declaration (Dashboard)
- [ ] "Does your extension collect user data?" answered correctly
- [ ] Collected data types specified
- [ ] Usage purpose specified

### PriceTab Specific
- [x] No user data collected
- [x] No analytics
- [x] No tracking
- [x] App records stay in browser-local storage; there is no account or server

---

## 5. Single Purpose Policy

### Check Questions
- [~] The single-purpose position is documented; final confirmation waits for the release scope
- [ ] Are all features directly related to this purpose?
- [x] It predictably replaces only the new-tab page and adds a toolbar popup
- [x] It requests only the optional access described above

### PriceTab Specific
- [x] Single purpose: reading the crypto market on the new tab page
- [ ] Every feature in *this* build serves it, and the single-purpose
      description names each one — re-check the calls board, the practice
      account and the tax guide against `PRICETAB_COMPLIANCE.md` before each
      submission
- [x] No search functionality (Search API not required)
- [x] No interference with user settings

---

## 6. New Tab Page Specific

### Search Requirements
- [x] No web search functionality exists; Chrome Search API requirements are not applicable

### PriceTab Specific
- [x] No web search functionality
- [x] Chrome Search API NOT REQUIRED
- [x] NO interference with user search settings

---

## 7. Testing

### Functionality Tests
- [ ] Extension loads via chrome://extensions
- [x] New-tab page renders in real Chromium with the network stubbed
- [x] Price data loads in the API and render suites
- [ ] Theme switching works in an installed-extension pass
- [x] Settings panel opens/closes in the render suite
- [x] Coin add/remove works in the render suite
- [x] Period switching works in the chart and render suites
- [ ] Currency switching works in an installed-extension pass

### Error States
- [ ] Graceful fail in an installed-extension offline pass
- [ ] Graceful fail on live API errors
- [x] Validation on invalid coin input
- [x] Network failures follow the tested retry/failover rules

### Browser Compatibility
- [ ] Tested in Chrome stable
- [ ] Tested in Chrome beta (optional)
- [ ] Manifest V3 features working

---

## 8. Pre-Submission Final Check

### Dashboard Checks
- [ ] Developer account 2FA enabled
- [ ] Contact information current
- [ ] Payment profile set up (if needed)

### Package Checks
- [ ] ZIP file created
- [ ] Unnecessary files excluded (node_modules, .git, etc.)
- [ ] File size reasonable (<10MB ideal)

### Final Read
- [ ] All metadata reviewed
- [ ] Typos corrected
- [ ] Links tested

---

## 9. Post-Submission

### Waiting Period
- [ ] Standard: 24 hours - 3 days
- [ ] Complex: 1-2 weeks
- [ ] If exceeding 3 weeks: Contact Support

### In Case of Rejection
1. [ ] Review rejection code
2. [ ] Read related policy
3. [ ] Make necessary fixes
4. [ ] Resubmit
5. [ ] Appeal if needed (1 chance)

---

## PriceTab Specific Notes

### Strengths (Easy Approval)
- Zero permissions at install
- Full Manifest V3 compliance
- All scripts local
- No search functionality
- No user data collection

### Watch Out For
- Avoid keyword spam in store description
- Write coin lists in natural language
- Keep screenshots current
- Ensure privacy policy link works

---

## Quick Reference

| Element | Limit |
|---------|-------|
| Extension name | 75 characters |
| Short description | 132 characters |
| Detailed description | 16,000 characters |
| Screenshots | 1-5 items |
| Icon | 128x128 px |
| Small tile | 440x280 px |
| Large tile | 920x680 px |
| Marquee | 1400x560 px |

---

## Resources

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [Review Process](https://developer.chrome.com/docs/webstore/review-process)
- [Troubleshooting](https://developer.chrome.com/docs/webstore/troubleshooting)
