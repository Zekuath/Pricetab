# Content Security Policy (CSP) Fix

## Problem

When loading the extension in Chrome, you received this error:

```
'content_security_policy.extension_pages': Insecure CSP value "https://unpkg.com"
in directive 'script-src'.
```

## Root Cause

Chrome Extension Manifest V3 has strict security requirements and **does not allow loading JavaScript from external CDNs** (like unpkg.com, cdnjs.com, etc.) for security reasons.

PriceTab (formerly CryptoTab) originally had:
```json
"content_security_policy": {
  "extension_pages": "script-src 'self' https://unpkg.com; object-src 'self'"
}
```

And `index.html` was loading dependencies from CDN:
```html
<script src="https://unpkg.com/react@16.5.0/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@16.5.0/umd/react-dom.production.min.js"></script>
<!-- ... more CDN scripts -->
```

## Solution

### 1. Downloaded Dependencies Locally

Created a `vendor/` folder and downloaded all dependencies:

```bash
mkdir vendor
cd vendor
curl -L -o polyfill.min.js "https://unpkg.com/@babel/polyfill@7.0.0/dist/polyfill.min.js"
curl -L -o react.production.min.js "https://unpkg.com/react@16.5.0/umd/react.production.min.js"
curl -L -o react-dom.production.min.js "https://unpkg.com/react-dom@16.5.0/umd/react-dom.production.min.js"
curl -L -o styled-components.min.js "https://unpkg.com/styled-components@3.4.6/dist/styled-components.min.js"
curl -L -o d3.min.js "https://unpkg.com/d3@5.7.0/dist/d3.min.js"
curl -L -o d3-interpolate-path.min.js "https://unpkg.com/d3-interpolate-path@2.0.1/build/d3-interpolate-path.min.js"
```

**Total size:** ~470KB (all minified production builds)

### 2. Updated index.html

Changed from CDN URLs to local files:

```html
<!-- Before (CDN) -->
<script src="https://unpkg.com/react@16.5.0/umd/react.production.min.js"></script>

<!-- After (Local) -->
<script src="./vendor/react.production.min.js"></script>
```

### 3. Removed CSP Directive

Since we're now only using local scripts, we removed the CSP directive entirely from `manifest.json`. Chrome now uses the default secure policy:

```json
{
  "manifest_version": 3,
  "name": "PriceTab",
  "version": "1.0.0",
  "description": "Live cryptocurrency price charts on every new tab",
  "chrome_url_overrides": {
    "newtab": "index.html"
  },
  "icons": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

## Benefits of This Approach

✅ **Manifest V3 Compliant** - Meets Chrome's security requirements
✅ **Works Offline** - No internet needed for core functionality
✅ **Faster Loading** - No external network requests for dependencies
✅ **More Reliable** - No CDN downtime issues
✅ **More Secure** - No third-party script injection risks
✅ **Chrome Web Store Ready** - Can be published without issues

## Trade-offs

⚠️ **Larger Extension Size** - Extension is now ~470KB vs. ~50KB (HTML/CSS/script.js only)
⚠️ **Manual Updates** - Must manually update dependencies (not auto-updated from CDN)

These trade-offs are acceptable and standard practice for Chrome extensions.

## What About CSS and Fonts?

The extension still loads:
- Normalize CSS from codepenassets.com
- Roboto Mono font from fonts.googleapis.com

**This is OK!** CSP restrictions only apply to `script-src`. Stylesheets and fonts are allowed from external sources.

If you want to make everything local:

```bash
# Download normalize.css
curl -L -o vendor/normalize.css "https://public.codepenassets.com/css/normalize-5.0.0.min.css"

# For fonts, you'd need to download .woff2 files and host locally
# (More complex - not required for extension to work)
```

## Verification

To verify the fix works:

1. **Load Extension:**
   ```
   chrome://extensions/
   → Enable Developer Mode
   → Load unpacked
   → Select extension folder
   ```

2. **Check for Errors:**
   - No CSP errors should appear
   - Extension should load successfully
   - Open new tab and see CryptoTab working

3. **Check Network Tab:**
   - Open DevTools (F12)
   - Go to Network tab
   - Refresh new tab
   - You should see requests to:
     - ✅ Coinbase API (for price data) - ALLOWED
     - ✅ codepenassets.com (CSS) - ALLOWED
     - ✅ fonts.googleapis.com (fonts) - ALLOWED
     - ❌ No unpkg.com requests - scripts are local!

## Future Considerations

### If You Want to Update Dependencies:

1. **Check for Updates:**
   ```bash
   # React 16.5.0 is from 2018 - you might want newer version
   # Current latest: React 18.x
   ```

2. **Download New Version:**
   ```bash
   cd vendor
   curl -L -o react.production.min.js "https://unpkg.com/react@18.2.0/umd/react.production.min.js"
   curl -L -o react-dom.production.min.js "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"
   ```

3. **Test Thoroughly:**
   - API might change between versions
   - Check console for errors
   - Test all features

### Alternative: Use a Build Tool

For more advanced dependency management:

```bash
# Use webpack/rollup to bundle dependencies
npm install react react-dom styled-components d3
# Configure bundler
# Build extension
```

This approach offers:
- Automatic dependency updates via npm
- Tree-shaking (smaller bundle size)
- Modern JavaScript features
- Better development experience

See `CODE_OPTIMIZATIONS.md` Phase 2 for build process recommendations.

## Summary

**Problem:** CSP error preventing extension from loading
**Solution:** Downloaded dependencies locally, removed CSP directive
**Result:** Extension is now Manifest V3 compliant and ready for Chrome Web Store

---

**Status:** ✅ Resolved
