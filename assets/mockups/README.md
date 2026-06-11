# Promo & Screenshot Mockups

Browser-rendered templates for the Chrome Web Store visual assets, plus the raw
UI captures they're built from.

## Files

| File | Produces | Sizes |
|------|----------|-------|
| `store-frames.html` | The 6 store screenshots (caption band + logo + live UI) | 1280×800 each |
| `promo-tiles.html` | Small Tile, Large Tile, Marquee | 440×280, 920×680, 1400×560 |
| `raw/*.png` | Raw live-UI captures embedded by `store-frames.html` | source |

## Store screenshots → `../screenshots/01-hero … 06-themes`

`store-frames.html` composes each final screenshot from a branded frame (caption
band, PriceTab logo, brand styling) wrapped around a raw UI capture in `raw/`.
The first frame is the promotional hero. To rebuild:

1. If the UI changed, re-capture the raw views into `raw/` — load each scene in
   the running extension (or a locally served `index.html`) and screenshot the
   new tab at 1280×800.
2. Open `store-frames.html` in Chrome, **served locally** (e.g. `python -m http.server`)
   so the `/vendor` and `/assets` paths resolve. Zoom 100% (`Ctrl+0`).
3. Right-click each `.frame` → **"Capture node screenshot"** (exact 1280×800), or
   run a headless render of each `#f01`…`#f06`.
4. Save into `../screenshots/` with the numbered names. Upload order + on-image
   captions are documented in `../screenshots/README.md`.

## Promo tiles → `../promotional/`

Open `promo-tiles.html`, zoom 100%, right-click `#small` / `#large` / `#marquee`
→ "Capture node screenshot". Sizes: 440×280, 920×680, 1400×560.

## Final asset checklist (Chrome Web Store)

- [ ] 6 screenshots at 1280×800 — first is the promotional hero (first 3 show in search)
- [ ] Small Tile 440×280 (required if featured)
- [ ] Large Tile 920×680 (optional, recommended)
- [ ] Marquee 1400×560 (optional, for featuring)
- [ ] Icon 128×128 (already in `assets/icons/`)
