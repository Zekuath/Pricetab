# Chrome Web Store — Screenshots (upload in this order)

All images are **1280×800 PNG** (Chrome Web Store screenshot size). Upload them
in the numbered order below — the number prefix in each filename IS the order.
Each image also carries an on-image caption describing what it shows.

| Order | File | What it shows | Caption on image |
|-------|------|---------------|------------------|
| **1** | `01-hero.png` | **Promotional hero** — logo, name, tagline and the headline features. Hooks the visitor and explains the whole product at a glance. **Put this first.** | "pricetab — Live crypto charts on every new tab" + feature pills |
| 2 | `02-dashboard.png` | The real new-tab view: live chart + ticker + widget panel | "Every new tab is a live crypto chart" |
| 3 | `03-watchlist-movers.png` | Watchlist heatmap + Top Movers widgets (personalization) | "Your watchlist + the day's top movers" |
| 4 | `04-signals.png` | All 9 market widgets enabled (depth for traders) | "9 market signals traders actually watch" |
| 5 | `05-presets.png` | Settings → Widgets tab with one-click Holder / Trader / Minimal presets | "Holder or Trader — set up in a tap" |
| 6 | `06-themes.png` | Light theme, clean minimal view | "Dark, light, or auto — your call" |

> The first 3 images matter most — they appear in search results. `01-hero` is
> the promotional/lead image, so it must be uploaded first.

## Regenerating these

The images are composed from a template + real app captures:

- **Template:** `../mockups/store-frames.html` (caption bands + logo + brand styling)
- **Raw app captures:** `../mockups/raw/*.png` (the live UI behind each frame)

To rebuild: run the fully scripted pipeline documented in `../mockups/README.md`
(captures the raw UI from the live extension, then renders the frames).

The root `01…06` files are the **official upload set (Windows-style window
frame)**. Alternate window-chrome sets live in `safari/`, `windows/` and
`chromeos/` — same content, different OS framing.

## Promotional tiles

The store's promotional images live in `../promotional/` and share the same
design system (glow backdrop + browser-framed UI):
`Small Tile.png` (440×280), `Large Tile.png` (920×680), `Marquee.png` (1400×560).
Rebuild them with the same headless render via `../mockups/promo-tiles.html`.
