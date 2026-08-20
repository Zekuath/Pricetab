# Chrome Web Store — Screenshots (upload in this order)

All images are **1280×800 PNG**. Upload them in the numbered order below — the
number prefix in each filename IS the order. Each image carries an on-image
caption describing what it shows.

**The dashboard accepts five.** This is the whole set; there is no sixth file
to drop or hold back.

| Order | File | What it shows | Caption on image |
|-------|------|---------------|------------------|
| **1** | `01-hero.png` | **Promotional hero** — logo, name, tagline, and a near-default new tab: the four coins that ship, one chart, nothing switched on. **Put this first.** | "pricetab — Live crypto charts on every new tab." |
| 2 | `02-calls.png` | The board on a day range: a settled call marked *called it*, one marked *missed*, and a contested column where the first claim carries the `1ST` mark | "Say where the price goes — and keep the score" |
| 3 | `03-portfolio.png` | Five holdings with cost basis, sparklines, allocation bars, Unrealized + Realized, and one clearly red row | "What you hold, what it cost, what it's worth" |
| 4 | `04-widgets.png` | The widget column with five on — watchlist, Fear & Greed, market cap, halving countdown, alt season — beside the chart | "The market data you want — and nothing else" |
| 5 | `05-targets.png` | Targets panel in light mode: three armed (one a percent target) plus one already hit, with the tab strip showing the announcement | "It tells you the moment it happens" |

> The first three appear in search results, so they carry the argument on
> their own: what it is, what only it does, what 1.4.0 added.

Frame 5's mock tab reads `● LINK hit $8.20` — the same target the panel
underneath lists as hit. If the targets scene is ever reseeded, that string
has to move with it, or the frame is claiming something the image disproves.

## What is deliberately not here

- **Candlesticks.** The targets overlay washes the page out at 85% by design,
  so no chart mode can be shown behind it, and frames 1–2 need the line. A
  mode lost to a benefit; see `docs/store/SCREENSHOT_PLAN.md` D3.
- **The Settings panel.** An overlay takes the screen on purpose, so it can
  never be the backdrop for the thing it configures (D6).

Both live in `../mockups/raw/` for the website.

## Regenerating these

Composed from a template plus real app captures:

- **Template:** `../mockups/store-frames.html` (caption bands, logo, framing)
- **Raw app captures:** `../mockups/raw/*.png` (the live UI behind each frame)

To rebuild, run the scripted pipeline in `../mockups/README.md` — it captures
the raw UI from the live extension, then renders the frames.

The root `01…05` files are the **official upload set** (Windows-style window
frame). Alternate window chrome lives in `safari/`, `windows/` and
`chromeos/` — same content, different framing.

## Promotional tiles

The store's promotional images live in `../promotional/` and share the design
system: `Small Tile.png` (440×280), `Large Tile.png` (920×680),
`Marquee.png` (1400×560). Rebuilt by the same headless render via
`../mockups/promo-tiles.html`.
