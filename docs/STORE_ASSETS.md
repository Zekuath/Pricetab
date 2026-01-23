# Chrome Web Store Assets Guide

This document explains how to create all required assets for publishing PriceTab to the Chrome Web Store.

---

## 📋 Required Assets Checklist

### Icons (✅ COMPLETED)
- [x] 16x16 - `assets/icons/icon16.png`
- [x] 48x48 - `assets/icons/icon48.png`
- [x] 128x128 - `assets/icons/icon128.png`
- [x] Source icon - `assets/icons/icon.png`

### Screenshots (✅ COMPLETED)
- [x] 9 screenshots created - `assets/screenshots/1-9.png`
- [x] Recommended: 3-5 screenshots ✓ (9 provided)

### Promotional Images (✅ COMPLETED)
- [x] Small Tile: 440x280 - `assets/promotional/Small Tile.png`
- [x] Large Tile: 920x680 - `assets/promotional/Large Tile.png`
- [x] Marquee: 1400x560 - `assets/promotional/Marquee.png`

---

## 📸 Screenshot Guide

### What to Capture

Create 3-5 high-quality screenshots showing:

1. **Main View** (screenshot-1.png)
   - Clean new tab with BTC chart
   - Show time period buttons
   - Show price and change in top bar
   - Caption: "Real-time cryptocurrency price charts on every new tab"

2. **Settings Panel** (screenshot-2.png)
   - Settings modal open
   - Show selected coins
   - Show search/quick-add section
   - Caption: "Easy coin management with drag-and-drop reordering"

3. **Different Coin** (screenshot-3.png)
   - ETH or SOL chart
   - Different time period (1W or 1M)
   - Caption: "Support for 75+ cryptocurrencies with 6 time periods"

4. **Multiple Features** (screenshot-4.png - optional)
   - Show switching between $ and % view
   - Caption: "Toggle between dollar amount and percentage changes"

5. **Mobile/Responsive** (screenshot-5.png - optional)
   - Narrow browser window showing responsive design
   - Caption: "Fully responsive design works on any screen size"

### How to Create Screenshots

**Using Chrome DevTools:**
```bash
1. Open extension in new tab
2. Press F12 to open DevTools
3. Click "Toggle Device Toolbar" (Ctrl+Shift+M)
4. Select responsive or specific resolution
5. Use Chrome's built-in screenshot tool:
   - Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)
   - Type "screenshot"
   - Choose "Capture screenshot" or "Capture full size screenshot"
```

**Using macOS:**
```bash
# Capture specific window (Cmd+Shift+4, then Space, then click window)
# Saves to Desktop by default

# Resize to exact dimensions using sips:
sips -z 800 1280 ~/Desktop/Screenshot.png --out assets/screenshots/screenshot-1.png
```

**Using ImageMagick (all platforms):**
```bash
# Install: brew install imagemagick (macOS) or apt-get install imagemagick (Linux)

# Resize to 1280x800:
convert input.png -resize 1280x800 -gravity center -extent 1280x800 screenshot-1.png

# Add border and shadow for professional look:
convert screenshot-1.png -bordercolor white -border 20x20 \
  \( +clone -background black -shadow 80x3+5+5 \) \
  +swap -background white -layers merge +repage screenshot-1-final.png
```

### Screenshot Specifications

- **Dimensions**:
  - 1280x800 (recommended, 16:10 ratio)
  - 640x400 (alternative, 16:10 ratio)
  - Must be exactly these sizes
- **Format**: PNG or JPEG
- **File Size**: Under 2MB each
- **Quality**: High-quality, crisp, no blur
- **Content**: No dummy/lorem ipsum text, use real data
- **Branding**: Clean, professional, consistent

---

## 🎨 Promotional Images Guide

### Small Tile (440x280) - REQUIRED

**Purpose**: Shown in Chrome Web Store search results and category pages

**Design Tips:**
- Feature the app icon (graph.png)
- App name "CryptoTab" prominently
- Simple tagline: "Live Crypto Charts"
- Use brand colors (black background, white text)
- Keep it simple and recognizable at small size

**Figma/Sketch Template:**
```
Canvas: 440x280px
Background: #000000 (black)
Icon: graph.png at 128x128 centered
Text: "CryptoTab" - Roboto Mono, 32px, white, bold
Subtext: "Real-time crypto price charts" - 14px, #CCCCCC
```

**Create with HTML/CSS (then screenshot):**
```html
<div style="width: 440px; height: 280px; background: #000;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; font-family: 'Roboto Mono', monospace;">
  <img src="assets/icons/graph.png" width="120" height="120">
  <h1 style="color: white; font-size: 32px; margin: 16px 0 4px 0;">CryptoTab</h1>
  <p style="color: #ccc; font-size: 14px; margin: 0;">Real-time crypto price charts</p>
</div>
```

### Large Tile (920x680) - Optional

**Purpose**: Featured placement, category highlights

**Design Tips:**
- More detailed than small tile
- Can show mini screenshot of the extension
- Include key features as bullet points or icons
- Professional, eye-catching design

### Marquee (1400x560) - Optional

**Purpose**: Premium featured placement on Chrome Web Store homepage

**Design Tips:**
- Horizontal banner format
- Hero image on one side, text on other
- Very eye-catching and professional
- Only needed if you want featured placement

---

## 🛠️ Tools for Creating Assets

### Free Tools
- **Figma** (https://figma.com) - Best for all promotional images
- **Canva** (https://canva.com) - Easy templates
- **GIMP** (https://gimp.org) - Free Photoshop alternative
- **Inkscape** (https://inkscape.org) - Vector graphics
- **ImageMagick** - Command-line image processing

### Paid Tools
- **Adobe Photoshop** - Professional standard
- **Adobe Illustrator** - Vector graphics
- **Sketch** (macOS only) - UI/UX design

### Online Screenshot Tools
- **Chrome DevTools** - Built-in, best option
- **Nimbus Screenshot** - Chrome extension
- **Awesome Screenshot** - Chrome extension

---

## ✅ Chrome Web Store Listing

### Store Listing Information

**Name** (required, max 75 characters):
```
PriceTab - Live Crypto Price Charts
```

**Summary** (required, max 132 characters):
```
Real-time cryptocurrency price charts on every new tab. Track 75+ coins with customizable charts and persistent preferences.
```

**Description** (required, max 16,000 characters):
```markdown
# PriceTab - Your Personal Crypto Dashboard

Transform every new tab into a real-time cryptocurrency price tracker. PriceTab brings live price charts and data for 75+ cryptocurrencies right to your browser.

## 🚀 Key Features

✅ **Real-Time Price Charts** - Live data from Coinbase API, updated every 30 seconds
✅ **75+ Cryptocurrencies** - BTC, ETH, SOL, DOGE, and 70+ more
✅ **6 Time Periods** - 1 Hour, 1 Day, 1 Week, 1 Month, 1 Year, All Time
✅ **Persistent Preferences** - Your coin selections saved automatically
✅ **Drag & Drop** - Easily reorder your favorite coins
✅ **Beautiful Charts** - Interactive D3.js visualizations
✅ **Zero Configuration** - Works instantly, no API keys needed
✅ **Privacy First** - No tracking, no data collection, all preferences stored locally

## 📊 How It Works

1. **Install** the extension
2. **Open** a new tab - CryptoTab loads automatically
3. **Click** the settings icon (⚙) to add/remove coins
4. **Drag** coins to reorder them
5. **Click** the price box to cycle through your selected coins
6. **Choose** time periods with the buttons below the chart

## 🎯 Perfect For

- Crypto investors tracking portfolio assets
- Traders monitoring price movements
- Enthusiasts keeping up with the crypto market
- Anyone who wants quick access to crypto data

## 💎 Supported Cryptocurrencies

Bitcoin (BTC), Ethereum (ETH), Tether (USDT), Binance Coin (BNB), Solana (SOL), XRP, USD Coin (USDC), Dogecoin (DOGE), Cardano (ADA), Avalanche (AVAX), Tron (TRX), Chainlink (LINK), Polkadot (DOT), Polygon (MATIC), Toncoin (TON), Shiba Inu (SHIB), Litecoin (LTC), Bitcoin Cash (BCH), and 55+ more...

## 🔒 Privacy & Security

- **No tracking** - We don't collect any data
- **No accounts** - No sign-up required
- **Local storage** - Preferences saved in your browser only
- **Open source** - Code available for review
- **No analytics** - Zero telemetry

## 🆓 100% Free

PriceTab is completely free with no premium features, no ads, and no in-app purchases. Enjoy all features with no limitations.

## 📝 Feedback & Support

Found a bug? Have a feature request? We'd love to hear from you!
- GitHub: [Your Repo URL]
- Email: [Your Email]

## ⚡ Quick Start

Install PriceTab now and transform your new tab into a powerful crypto dashboard. No configuration needed - it just works!

---

**Disclaimer**: This extension is for informational purposes only and does not constitute financial advice. Cryptocurrency investments are risky. Always do your own research.
```

**Category**:
```
Productivity
```

**Language**:
```
English (United States)
```

**Additional Languages** (optional):
```
Turkish (Türkçe) - for future releases
```

---

## 📊 Asset Creation Checklist

### Immediate (Before Publishing)
- [x] Take 3-5 screenshots (1280x800) ✓ 9 screenshots ready
- [x] Create small tile (440x280) ✓
- [x] Write store description - see `docs/STORE_DESCRIPTION.md`
- [ ] Prepare privacy policy URL (host PRIVACY.md on GitHub Pages)

### Optional (For Better Results)
- [x] Create large tile (920x680) ✓
- [x] Create marquee (1400x560) ✓
- [ ] Create demo video (30-60 seconds, MP4, max 100MB)
- [ ] Add feature graphics to screenshots (arrows, callouts)
- [ ] Create promotional banner for social media
- [ ] Create animated GIF demo

### Pre-Launch
- [ ] Test extension on fresh Chrome install
- [ ] Verify all assets meet size requirements
- [ ] Proofread all text for typos
- [ ] Check links in description
- [ ] Preview how listing looks in store

---

## 🎬 Optional: Demo Video

**Specs:**
- Max duration: 60 seconds recommended
- Format: MP4, WebM
- Max size: 100MB
- Dimensions: 1280x720 or 1920x1080

**Content:**
1. (0-5s) Logo reveal + tagline
2. (5-15s) Show installing and opening new tab
3. (15-30s) Demonstrate adding/removing coins
4. (30-40s) Show different time periods
5. (40-50s) Highlight drag-and-drop
6. (50-60s) CTA: "Install CryptoTab Now"

**Tools:**
- **Free**: OBS Studio, ShareX, QuickTime (macOS)
- **Paid**: Camtasia, ScreenFlow, Adobe Premiere

---

## 📐 Quick Reference: All Sizes

| Asset | Size | Required | Location |
|-------|------|----------|----------|
| Icon 16 | 16x16 | ✅ Yes | `assets/icons/icon16.png` |
| Icon 48 | 48x48 | ✅ Yes | `assets/icons/icon48.png` |
| Icon 128 | 128x128 | ✅ Yes | `assets/icons/icon128.png` |
| Screenshot 1 | 1280x800 | ✅ Yes | `assets/screenshots/screenshot-1.png` |
| Screenshot 2-5 | 1280x800 | ⚠️ Recommended | `assets/screenshots/screenshot-N.png` |
| Small Tile | 440x280 | ✅ Yes | `assets/promotional/tile-small.png` |
| Large Tile | 920x680 | ⭐ Optional | `assets/promotional/tile-large.png` |
| Marquee | 1400x560 | ⭐ Optional | `assets/promotional/marquee.png` |
| Demo Video | 1280x720 | ⭐ Optional | `assets/promotional/demo-video.mp4` |

---

## 🚀 Next Steps

1. **Create screenshots** using guide above
2. **Design small tile** using template
3. **Write store listing** using description template
4. **Host privacy policy** on GitHub Pages or include link
5. **Submit to Chrome Web Store** via [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)

**Developer Account Fee**: $5 (one-time)

---

**Need Help?** See TODO.md for full development roadmap and publishing checklist.
