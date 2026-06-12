# Promo & Screenshot Mockups

Browser-rendered templates for the Chrome Web Store visual assets, plus the raw
UI captures they're built from.

Design system shared by both templates: layered radial-glow backdrop (green /
red chart accents on deep charcoal), faint chart-paper grid, and the live UI
capture framed inside a mock browser window (tab strip + traffic lights) with
depth shadow. Accent words in titles use the brand green.

## Files

| File | Produces | Sizes |
|------|----------|-------|
| `store-frames.html` | The 6 store screenshots (backdrop + caption + framed UI) | 1280×800 each |
| `promo-tiles.html` | Small Tile, Large Tile, Marquee | 440×280, 920×680, 1400×560 |
| `raw/*.png` | Raw live-UI captures embedded by the templates | source |

Both templates use **relative paths**, so they work from `file://` — no local
server needed. Appending `?only=<id>` shows a single frame at the viewport
origin, which is what the headless render below relies on.

## Headless render (recommended)

If the UI changed, first re-capture the raw views into `raw/` (load each scene
in the running extension and screenshot the new tab at 1280×800). Then render
everything from WSL/macOS/Linux with Chrome:

```bash
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"  # or google-chrome
BASE="C:/Users/<you>/.../Pricetab/assets/mockups"                   # Windows-style path for chrome.exe

render() {  # render <html> <id> <WxH> <out>
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$3" --screenshot="$BASE/$4" "file:///$BASE/$1?only=$2"
}

render store-frames.html f01 1280,800 ../screenshots/01-hero.png
render store-frames.html f02 1280,800 ../screenshots/02-dashboard.png
render store-frames.html f03 1280,800 ../screenshots/03-watchlist-movers.png
render store-frames.html f04 1280,800 ../screenshots/04-signals.png
render store-frames.html f05 1280,800 ../screenshots/05-presets.png
render store-frames.html f06 1280,800 ../screenshots/06-themes.png
render promo-tiles.html small   440,280  "../promotional/Small Tile.png"
render promo-tiles.html large   920,680  "../promotional/Large Tile.png"
render promo-tiles.html marquee 1400,560 "../promotional/Marquee.png"
```

## Manual capture (alternative)

Open the template in Chrome, zoom 100% (`Ctrl+0`), right-click the frame/tile
element → **"Capture node screenshot"**. Upload order + on-image captions are
documented in `../screenshots/README.md`.

## Final asset checklist (Chrome Web Store)

- [x] 6 screenshots at 1280×800 — first is the promotional hero (first 3 show in search)
- [x] Small Tile 440×280 (required if featured)
- [x] Large Tile 920×680 (optional, recommended)
- [x] Marquee 1400×560 (optional, for featuring)
- [x] Icon 128×128 (already in `assets/icons/`)
