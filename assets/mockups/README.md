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
| `store-frames.html` | The 5 store screenshots (backdrop + caption + framed UI), 1280×800 |
| `promo-tiles.html` | Small Tile 440×280, Large Tile 920×680, Marquee 1400×560 |
| `check-scenes.js` | Runs `scenes.html`'s script for real in a stubbed browser and asserts every scene resolves. **Run it after editing `scenes.html`** — see below |
| `raw/*.png` | Raw live-UI captures produced by `scenes.html` |

## Shooting the promo site

`site/index.html` fetches its own hero chart and ticker, so a plain
`--screenshot` fires before either lands. Wrap it the same way the scenes are
wrapped — an iframe plus a `/__delay` blocker — rather than guessing a sleep:

```bash
cat > /tmp/siteshot.html <<'HTML'
<!DOCTYPE html><meta charset="utf-8">
<style>html,body{margin:0;overflow:hidden;background:#000}iframe{display:block;width:1280px;height:1000px;border:0}</style>
<script>
  var b=new Image(); b.src="/__delay?ms=14000";
  b.style.cssText="position:absolute;width:1px;height:1px;opacity:0";
  document.body.appendChild(b);
  var f=document.createElement("iframe"); f.src="/site/index.html";
  document.body.appendChild(f);
</script>
HTML
cp /tmp/siteshot.html assets/mockups/.siteshot.html   # served from the repo root
```

## Check the scenes before capturing

```bash
node assets/mockups/check-scenes.js
```

`node --check` is not enough. It proves the file parses, not that it runs — an
edit once deleted the `W()` widget helper that `SCENES` calls, and `--check`
reported OK while the script died on a ReferenceError before it could append
the iframe. Every capture came out a blank black frame, twice, because a
screenshot of a page whose script never ran still writes a valid PNG.

Two guards now exist:

- `check-scenes.js` executes the script per scene in a stubbed browser and
  fails if any scene throws or writes no state.
- The capture loop flags any output under 10 KB — an all-black 1280×800 PNG
  compresses to about 4.7 KB, so silence can no longer look like success.

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
#    all-coin sweep takes ~10 s; widget-row waits on the chart transition.
M=assets/mockups
for theme in dark light; do
  for s in dashboard wl-movers signals news presets settings-coins settings-prefs minimal \
           hero compare portfolio widgets widget-row targets candles; do
    case "$s" in
      dashboard|wl-movers|signals|news) d=18000 ;;
      widget-row)                       d=20000 ;;
      compare|portfolio|targets)        d=16000 ;;
      *)                                d=12000 ;;
    esac
    shot 1280,800 "$M/raw/$s-$theme.png" "$M/scenes.html?scene=$s&theme=$theme&delay=$d"
  done
done

# 2. Framed store screenshots — five, the cap the upload form accepts.
S=assets/screenshots
for os in win:windows mac:safari cros:chromeos; do
  for f in f01:01-hero f02:02-compare f03:03-portfolio f04:04-widgets f05:05-targets; do
    shot 1280,800 "$S/${os#*:}/${f#*:}.png" "$M/store-frames.html?only=${f%%:*}&os=${os%%:*}"
  done
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

- [x] 5 framed screenshots at 1280×800 — **five is the hard cap the upload form
      accepts** (verified in the CWS console, Aug 2026). First is the
      promotional hero; the first three are what show in search results.
- [x] 30-image raw library (15 scenes × dark/light) in `raw/` for the website,
      socials and future store experiments — including the two the store set
      has no room for (candlesticks, the Settings widget tab)
- [x] Small Tile 440×280 (required if featured)
- [x] Large Tile 920×680 (optional, recommended)
- [x] Marquee 1400×560 (optional, for featuring)
- [x] Icon 128×128 (already in `assets/icons/`)
