# Promo & Screenshot Mockups

Browser-rendered templates for the Chrome Web Store visual assets, plus a
fully scripted pipeline that captures the raw UI from the **live extension**
and composes the final images — no manual screenshotting needed.

Design system shared by both templates: layered radial-glow backdrop (green /
red chart accents on deep charcoal), faint chart-paper grid, and the live UI
capture framed inside a mock browser window with depth shadow. Accent words
in titles use the brand green.

## Files

| File | Purpose |
|------|---------|
| `scenes.html` | Boots the real `index.html` in an iframe with per-scene localStorage state + scripted clicks (period, settings, tabs) — produces `raw/<scene>-<theme>.png` |
| `scene-server.py` | Serves the repo on `:8123` + a `/__delay` endpoint that stalls the page load event so screenshots fire after live data + animations settle |
| `store-frames.html` | The 6 store screenshots (backdrop + caption + framed UI), 1280×800 |
| `promo-tiles.html` | Small Tile 440×280, Large Tile 920×680, Marquee 1400×560 |
| `raw/*.png` | Raw live-UI captures produced by `scenes.html` |

## Window-chrome variants (`?os=`)

Both frame templates take `?os=mac|win|cros`:

- `mac` (default) — Safari-style traffic lights, 14px corners
- `win` — Windows caption glyphs (─ ▢ ✕) on the right, 8px corners
- `cros` — ChromeOS-style glyphs right, pill tab, extra-round corners

Rendered sets live in `../screenshots/safari|windows|chromeos/`.
**The official store set (root `../screenshots/01…06` + the promo tiles) uses
`win`** — the large majority of Chrome users are on Windows, and a familiar
window frame reads as "made for my browser".

## Full rebuild

```bash
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"   # or google-chrome
python3 assets/mockups/scene-server.py &                             # serves repo on :8123

shot() {  # shot <WxH> <out> <url-path>
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --timeout=60000 --window-size="$1" --screenshot="$2" "http://localhost:8123/$3"
}

# 1. Raw captures from the LIVE extension (real API data), every scene in
#    BOTH themes. Ticker/news scenes need a longer delay because the
#    all-coin sweep takes ~10 s.
M=assets/mockups
for theme in dark light; do
  for s in dashboard wl-movers signals news presets settings-coins settings-prefs minimal; do
    case "$s" in dashboard|wl-movers|signals|news) d=18000 ;; *) d=12000 ;; esac
    shot 1280,800 "$M/raw/$s-$theme.png" "$M/scenes.html?scene=$s&theme=$theme&delay=$d"
  done
done

# 2. Framed store screenshots (swap os=win for mac/cros alternates)
S=assets/screenshots
for f in f01:01-hero f02:02-dashboard f03:03-watchlist-movers \
         f04:04-signals f05:05-presets f06:06-themes f07:07-news; do
  shot 1280,800 "$S/windows/${f#*:}.png" "$M/store-frames.html?only=${f%%:*}&os=win"
done
cp $S/windows/*.png $S/   # chosen official set

# 3. Promo tiles
shot 440,280  "assets/promotional/Small Tile.png" "$M/promo-tiles.html?only=small&os=win"
shot 920,680  "assets/promotional/Large Tile.png" "$M/promo-tiles.html?only=large&os=win"
shot 1400,560 "assets/promotional/Marquee.png"    "$M/promo-tiles.html?only=marquee&os=win"
```

Add a new scene by extending `SCENES` in `scenes.html` (localStorage state +
optional clicks by button text or CSS selector).

## Final asset checklist (Chrome Web Store)

- [x] 7 framed screenshots at 1280×800 — first is the promotional hero (first 3
      show in search; if the dashboard caps the count, drop from the end)
- [x] 16-image raw library (8 scenes × dark/light) in `raw/` for the website,
      socials and future store experiments
- [x] Small Tile 440×280 (required if featured)
- [x] Large Tile 920×680 (optional, recommended)
- [x] Marquee 1400×560 (optional, for featuring)
- [x] Icon 128×128 (already in `assets/icons/`)
