# Chrome Web Store Submission Checklist

> **Pre-Submission Verification Checklist for PriceTab**

This checklist is used to verify all requirements are met before submitting to Chrome Web Store.

---

## 1. Manifest Checks

### Basic Requirements
- [ ] Using `manifest_version: 3`
- [ ] `name` is 75 characters or less
- [ ] `description` is 132 characters or less
- [ ] `version` follows semantic versioning (x.y.z)
- [ ] All icon sizes present (16, 48, 128)

### Permissions
- [ ] Only necessary permissions requested
- [ ] Unused permissions removed
- [ ] Host permissions minimized
- [ ] Justification exists for broad permissions

### PriceTab Specific
- [x] Zero permissions (localStorage doesn't require permission)
- [x] Using `chrome_url_overrides.newtab`
- [x] All JS files local (vendor/)
- [x] CSP compliant (no eval, no inline scripts)

---

## 2. Code Quality

### Manifest V3 Compliance
- [ ] No external script tags
- [ ] No eval() usage
- [ ] No remote code execution
- [ ] All logic within extension

### Readability
- [ ] Code not obfuscated
- [ ] Minification acceptable
- [ ] Functionality discernible from code

### Security
- [ ] XSS protections in place
- [ ] Input validation implemented
- [ ] Sensitive data encrypted (if applicable)
- [ ] Using HTTPS (API calls)

---

## 3. Store Listing

### Required Fields
- [ ] Extension name (max 75 characters)
- [ ] Short description (max 132 characters)
- [ ] Detailed description
- [ ] At least 1 screenshot
- [ ] Icon (128x128)
- [ ] Category selected
- [ ] Language selected

### Optional Fields
- [ ] Promotional images
- [ ] Website URL
- [ ] Support URL

### Content Quality
- [ ] Description written in natural language
- [ ] NO keyword spam
- [ ] NO long coin/feature lists
- [ ] NO misleading statements
- [ ] All links working
- [ ] Screenshots up to date

---

## 4. Privacy

### Privacy Policy
- [ ] Privacy policy URL exists
- [ ] URL entered in designated field (NOT in description!)
- [ ] Policy accessible and current
- [ ] Data collection practices explained
- [ ] Data usage purpose stated
- [ ] Third-party sharing listed

### Data Collection Declaration (Dashboard)
- [ ] "Does your extension collect user data?" answered correctly
- [ ] Collected data types specified
- [ ] Usage purpose specified

### PriceTab Specific
- [x] No user data collected
- [x] No analytics
- [x] No tracking
- [x] Only localStorage used (preferences)

---

## 5. Single Purpose Policy

### Check Questions
- [ ] Does extension have narrow focus or function?
- [ ] Are all features directly related to this purpose?
- [ ] Does it modify browser behavior predictably?
- [ ] Does it request only necessary permissions?

### PriceTab Specific
- [x] Single purpose: "Displaying crypto price charts"
- [x] All features serve this purpose
- [x] No search functionality (Search API not required)
- [x] No interference with user settings

---

## 6. New Tab Page Specific

### Search Requirements
- [ ] Does web search functionality EXIST?
  - [ ] YES: Is Chrome Search API being used?
  - [ ] NO: Search requirements NOT APPLICABLE

### PriceTab Specific
- [x] No web search functionality
- [x] Chrome Search API NOT REQUIRED
- [x] NO interference with user search settings

---

## 7. Testing

### Functionality Tests
- [ ] Extension loads via chrome://extensions
- [ ] New tab opens correctly
- [ ] Price data loads
- [ ] Theme switching works
- [ ] Settings panel opens/closes
- [ ] Coin add/remove works
- [ ] Period switching works
- [ ] Currency switching works

### Error States
- [ ] Graceful fail in offline state
- [ ] Graceful fail on API errors
- [ ] Validation on invalid coin input
- [ ] Retry on network timeouts

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
- Zero permissions
- Full Manifest V3 compliance
- All JS local
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
