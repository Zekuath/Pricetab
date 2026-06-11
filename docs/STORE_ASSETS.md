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
- [x] 6 store screenshots (1280×800) - `assets/screenshots/01-hero.png` … `06-themes.png`
- [x] Upload order + on-image captions documented in `assets/screenshots/README.md`
- [x] First image is the promotional hero

### Promotional Images (✅ COMPLETED)
- [x] Small Tile: 440x280 - `assets/promotional/Small Tile.png`
- [x] Large Tile: 920x680 - `assets/promotional/Large Tile.png`
- [x] Marquee: 1400x560 - `assets/promotional/Marquee.png`

---

## 📸 Screenshot Guide

> ✅ **Current screenshots are fresh (1.2.0)** — composed from the live UI via
> `assets/mockups/store-frames.html` + `assets/mockups/raw/`. Re-capture from there if features change.

### What to Capture (v1.2.0)

Take 5 screenshots at **1280x800**. Minimum 1, recommended 5.

**1. Main view with widgets (dark mode)**
- BTC 1D or 1W chart
- Widget panel visible on the left: Fear & Greed + Market Overview + Halving Countdown at minimum
- × button visible top-left
- Shows the full new feature set

**2. Widget panel close-up**
- BTC chart with ALL 9 widgets enabled and visible
- Shows Fear & Greed, Market Overview, Halving, RSI, Funding Rate, Long/Short, OI, Liquidations, Altcoin Season
- Demonstrates the depth of market data

**3. Settings — Widgets tab**
- Settings panel open, Preferences tab selected, scrolled to WIDGETS section
- Shows widget toggles (some on, some off)
- Demonstrates customisability

**4. Settings — Coins tab**
- Settings panel open, Coins tab selected
- A few coins selected (BTC, ETH, SOL, XRP)
- Shows the coin management UI

**5. Light mode — clean view**
- BTC ALL chart, light theme, no widgets (clean/minimal look)
- Demonstrates theme support and minimal option

### How to Take Screenshots on Windows

```
1. Load the extension: chrome://extensions/ → Reload PriceTab
2. Open a new tab
3. Set up the view you want (widgets, coin, period)
4. Press F12 → Console → run: document.title  (just to confirm it's loaded)
5. Press Ctrl+Shift+P → type "screenshot" → "Capture screenshot"
   OR use the Snipping Tool: Win+Shift+S → set window to exactly 1280×800
6. Save as 1.png, 2.png, etc. to assets/screenshots/
```

**Resize to exact 1280×800 if needed (PowerShell):**
```powershell
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\path\to\screenshot.png")
$bmp = New-Object System.Drawing.Bitmap(1280, 800)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, 0, 0, 1280, 800)
$bmp.Save("C:\path\to\1.png")
```

### Screenshot Specifications

- **Dimensions**: 1280x800 exactly (Chrome Web Store requirement)
- **Format**: PNG
- **File Size**: Under 2MB each
- **Content**: Real live data, not placeholders

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
- App name "PriceTab" prominently
- Simple tagline: "Live Crypto Charts"
- Use brand colors (black background, white text)
- Keep it simple and recognizable at small size

**Figma/Sketch Template:**
```
Canvas: 440x280px
Background: #000000 (black)
Icon: graph.png at 128x128 centered
Text: "PriceTab" - Roboto Mono, 32px, white, bold
Subtext: "Real-time crypto price charts" - 14px, #CCCCCC
```

**Create with HTML/CSS (then screenshot):**
```html
<div style="width: 440px; height: 280px; background: #000;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; font-family: 'Roboto Mono', monospace;">
  <img src="assets/icons/graph.png" width="120" height="120">
  <h1 style="color: white; font-size: 32px; margin: 16px 0 4px 0;">PriceTab</h1>
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
PriceTab - Crypto Charts on Every New Tab
```

**Summary** (required, max 132 characters) — keep in sync with `manifest.json` and `STORE_DESCRIPTION.md`:
```
Every new tab opens a live crypto chart. Watch your coins, spot the top movers, and read 9 market signals. Free, no account.
```

**Description** (required, max 16,000 characters):

> ⚠️ **Use the description from `docs/STORE_DESCRIPTION.md`** — that file is the canonical, policy-compliant version.
> Do NOT use the description below; it has been removed to prevent accidental keyword spam rejections.

**Category**:
```
Productivity
```

**Language**:
```
English (United States)
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
6. (50-60s) CTA: "Install PriceTab Now"

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
