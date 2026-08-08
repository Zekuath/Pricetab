# Today — August 8, 2026

Ideas that came out of reviewing a Perplexity Finance chart page, ordered by
value per unit of effort. The first two need **no new network requests** —
the data is already on the page or one hover away.

Context: the crosshair now reads out open/high/low/close/volume from Coinbase
candles (`api.exchange.coinbase.com/products/{PAIR}/candles`, fetched lazily on
first hover, cached 5 min, USD/EUR/GBP and every period except ALL).

---

## 1. Volume bars under the chart

**Effort:** Medium · **New requests:** none (reuses the candles we already fetch)

Draw green/red volume bars across the bottom ~15% of the chart, the way every
serious price chart does. This is the single biggest "looks professional" jump
available right now.

- [ ] Render bars from `ohlcData` inside the existing SVG (no second chart)
- [ ] Colour each bar by that candle's direction (close ≥ open → up tint)
- [ ] Keep the price line's vertical scale unchanged — bars get their own band
- [ ] Hide bars when candles are unavailable (ALL range, unquoted currency)
- [ ] Settings toggle, default on — the minimal look has fans

**Watch out:** bars must not appear/disappear as a layout jump when the lazy
candle fetch resolves; reserve the band or fade them in.

---

## 2. Stats row under the price

**Effort:** Low–Medium · **New requests:** none

The screenshot's stat grid (24H Volume, Market Cap, Open, 52W High/Low) is the
context a glance actually wants. We can source all of it from data already in
hand:

- [ ] Market cap + 24h volume — already in the Coinlore bulk sweep
- [ ] Day's open / high / low — from the candles
- [ ] 52-week high/low — computed from the cached yearly series
- [ ] One quiet row under the price; hide any stat whose data is missing
- [ ] Settings toggle (same pattern as "Since Your Last Visit")

---

## 3. Big-move headlines

**Effort:** Medium · **New requests:** none (the news feed already exists)

Perplexity's "Notable Price Movement" is LLM-written prose; we can't and
shouldn't fake that. The cheap, honest version: when the active coin makes an
unusual move, surface the headlines from that window.

- [ ] Detect a notable move (e.g. |change| over a threshold for the period)
- [ ] Match Blockchair/HN headlines by timestamp, show 1–2 under the price
- [ ] Never imply causation — label it "headlines from this window"

---

## 4. Candlestick chart option

**Effort:** Medium · **New requests:** none

The data is already there; it's a rendering mode plus a toggle.

- [ ] Line / candles switch next to the period buttons
- [ ] Only offer it where candles exist (not ALL, not unquoted currencies)
- [ ] Thin candles — 300+ bars on a new tab is noise; consider capping the
      count or only offering candles on 1H/1D/1W

**Priority note:** lower than it looks. A new tab is a glance surface; the line
chart is the better default and candles mostly serve traders.

---

## 5. Comparison mode (two coins)

**Effort:** Medium–High · **New requests:** one extra history fetch

- [ ] Overlay a second coin's series
- [ ] **Normalise both to % change from the range start** — never a second
      y-axis. Two price scales on one chart is the classic misleading chart
- [ ] Direct-label both lines; a legend alone isn't enough
- [ ] Pick the second coin from the `/` jumper

---

## 6. Prediction markets widget (Polymarket)

**Effort:** Unknown · **New requests:** yes · **Status:** research first

- [ ] Check whether Polymarket's public API sends CORS headers and works
      without a key (same bar every other source had to clear)
- [ ] Decide against it if it muddies the store's single-purpose story —
      "crypto price charts" is what the listing promises, and Yellow Argon
      rejections come from feature sprawl as much as keyword spam

---

## Not doing (and why)

- **Seeded first-paint chart data** — would ship fabricated prices that read as
  real for a moment, and go stale in the repo. Shipped an honest
  "Fetching prices…" cold state instead.
- **Real brand coin logos** — either ~64 third-party trademark files in the
  bundle or runtime requests to an icon CDN; both break the zero-external-request
  guarantee. Monogram badges shipped instead.
- **Browser notifications for alerts** — needs the `notifications` permission and
  breaks the zero-permission story that keeps store review fast.
