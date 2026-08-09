# Today — August 8, 2026

Ideas that came out of reviewing a Perplexity Finance chart page, ordered by
value per unit of effort. The first two need **no new network requests** —
the data is already on the page or one hover away.

Context: candlesticks, the crosshair's OHLC readout and the volume band all
run off the same candles — Coinbase for most coins, Kraken for the ALL range
and for coins Coinbase doesn't list.

---

## 1. Stats row under the price

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

## 2. Big-move headlines

**Effort:** Medium · **New requests:** none (the news feed already exists)

Perplexity's "Notable Price Movement" is LLM-written prose; we can't and
shouldn't fake that. The cheap, honest version: when the active coin makes an
unusual move, surface the headlines from that window.

- [ ] Detect a notable move (e.g. |change| over a threshold for the period)
- [ ] Match Blockchair/HN headlines by timestamp, show 1–2 under the price
- [ ] Never imply causation — label it "headlines from this window"

---

## 3. Comparison mode (two coins)

**Effort:** Medium–High · **New requests:** one extra history fetch

- [ ] Overlay a second coin's series
- [ ] **Normalise both to % change from the range start** — never a second
      y-axis. Two price scales on one chart is the classic misleading chart
- [ ] Direct-label both lines; a legend alone isn't enough
- [ ] Pick the second coin from the `/` jumper

---

## 4. Widget request fan-out

**Effort:** Medium · **Saves:** up to 8 requests per 5 min → fewer

With every widget on, each refresh cycle fires 8 separate endpoints (Fear &
Greed, market overview, halving, altcoin season, funding, long/short, open
interest, liquidations) every 5 minutes, on top of the chart's own polling and
the bulk ticker sweep. Hidden tabs already pause and the cadence is slow, so
this is not urgent — but it is the largest remaining request count in the
extension, and bigger than anything the coin-coverage work adds.

- [ ] Market overview and altcoin season both derive from Coinlore data we
      already pull for the ticker — check whether the bulk sweep can feed them
- [ ] Funding / open interest / liquidations all hit OKX for the same coin;
      see whether one request can serve more than one widget
- [ ] Skip fetches for widgets that are enabled but currently hidden
- [ ] Consider a longer interval for the slow-moving ones (halving moves once
      per block; the Fear & Greed index updates daily)

---

## 5. Prediction markets widget (Polymarket)

**Effort:** Unknown · **New requests:** yes · **Status:** research first

- [ ] Check whether Polymarket's public API sends CORS headers and works
      without a key (same bar every other source had to clear)
- [ ] Decide against it if it muddies the store's single-purpose story —
      "crypto price charts" is what the listing promises, and Yellow Argon
      rejections come from feature sprawl as much as keyword spam

---

## Done today

- **Price targets** (was "alerts") — renamed, because nothing is pushed and the
  old name promised more than it delivered. Detection now scans candle
  highs/lows since the target was set, so a target hit while no tab was open —
  even one that reverted before morning — is still reported, with when it
  happened. Closes the one real hole in the feature without touching the
  zero-permission stance.
- **Candlestick mode** (Settings → Appearance) — item 4 below, shipped. Ended up
  *cheaper* than the line chart rather than equal: in candle mode the candles are
  the only history request, because the line series is derived from their closes.
  Drawn as two SVG paths (one per direction) regardless of candle count, and
  aggregated to roughly one bar per 3px so a 350-candle range doesn't become a
  smear. Ranges without candles fall back to the line.
- **Monero (XMR) support via a second price provider** — Coinbase 404s on all
  three of its endpoints, so `COIN_PROVIDERS` now routes per coin and a Kraken
  adapter serves XMR. One Kraken request carries the line series, the crosshair
  candles and the spot price, making an XMR tab cheaper than a Coinbase one
  (which needs spot + history, plus candles on hover). Verified live across all
  six periods. Opens the door to the rest of the coins Coinbase doesn't list.
- **Volume bars** — a band along the bottom of the candlestick chart, drawn from
  the candles already fetched, so no extra request. Scaled against the 95th
  percentile of volume rather than the maximum: one spike would otherwise flatten
  every other bar into the baseline, and comparing ordinary days is the point.
  Switchable from Settings → Chart.
- **Settings pass** — search, a Chart group, and a `?` shortcut reference. Chose
  these over the full-screen settings screen that was on the table: the panel's
  structure was already sound, the real gaps were finding a setting among ~30
  and knowing the shortcuts exist at all. Also split `settings.js` (1,365 → 810
  lines) so the next settings change isn't a scroll hunt.
- **Overlay consistency pass** — audited every panel for two rules: only the
  panel's own close control is visible while it is open, and clicking outside
  closes it. Fixed price targets (main-view buttons showed through, bell now
  becomes ×), the portfolio (no click-outside at all) and settings (closed on a
  text selection that ended outside the card). The `A` key now toggles targets
  the way `S` toggles settings. The onboarding tour is deliberately excluded —
  a one-time flow shouldn't be dismissable by a stray click.
- **Close button pinned to the corner** — the × took its position from the page
  ticker, so it slid down 3rem whenever the ticker finished loading. Every panel
  covers the ticker (settings was the exception at z-index 50 and now sits at
  100 with the rest), so the close control ignores the ticker offset and snaps
  rather than sliding.
- **Chart Details toggle** (Settings → Appearance) — turns the crosshair's
  OHLC + volume readout off, which also stops the on-hover candle request for
  anyone who wants the leanest possible tab.

---

## Not doing (and why)

- **Seeded first-paint chart data** — would ship fabricated prices that read as
  real for a moment, and go stale in the repo. Shipped an honest
  "Fetching prices…" cold state instead.
- **Real brand coin logos** — either ~64 third-party trademark files in the
  bundle or runtime requests to an icon CDN; both break the zero-external-request
  guarantee. Monogram badges shipped instead.
- **Browser notifications for price targets** — needs the `notifications`
  permission and breaks the zero-permission story that keeps store review fast.
- **Background service worker + `chrome.alarms` for targets** — would catch
  crossings with no tab open, but the candle lookback already does that from
  the foreground, and `alarms` is still a permission we'd have to declare.
