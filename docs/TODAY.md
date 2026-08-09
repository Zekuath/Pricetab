# Today — August 8, 2026

Ideas that came out of reviewing a Perplexity Finance chart page, ordered by
value per unit of effort. The first two need **no new network requests** —
the data is already on the page or one hover away.

Context: candlesticks, the crosshair's OHLC readout and the volume band all
run off the same candles — Coinbase for most coins, Kraken for the ALL range
and for coins Coinbase doesn't list.

## 1. Comparison mode (two coins)

**Effort:** Medium–High · **New requests:** one extra history fetch

- [ ] Overlay a second coin's series
- [ ] **Normalise both to % change from the range start** — never a second
      y-axis. Two price scales on one chart is the classic misleading chart
- [ ] Direct-label both lines; a legend alone isn't enough
- [ ] Pick the second coin from the `/` jumper

---

## 2. Prediction markets widget (Polymarket)

**Effort:** Low–Medium · **New requests:** yes, a heavy one · **Status:**
researched, decision pending

- [x] **CORS and keys: clears the bar.** `gamma-api.polymarket.com` answers
      `access-control-allow-origin: *` with no key, and
      `/events?tag_slug=bitcoin&order=volume24hr` returns exactly the markets
      you'd want ("Bitcoin above ___ on August 9?" with a price per strike).
      Technically this is the easiest source we've added.
- [x] **The cost is the problem.** There is no field selection: one event
      carries its 11–25 nested markets at 91 fields each. The *smallest useful
      response is 40 KB* — more than the 37 KB Coinlore sweep that currently
      feeds the ticker, watchlist, top movers and market stats combined. One
      widget would weigh as much as everything else on the page.
- [ ] **Decide.** Two things to weigh beyond the payload:
      - *Single purpose.* The listing promises crypto price charts. "Will BTC
        be above $120k on Friday" is at least price-shaped, which is more than
        most feature sprawl can say — but it is a different product category.
      - *Gambling.* Polymarket is a betting venue. We would be displaying odds,
        not taking bets, but CWS reviews gambling-adjacent content more
        closely, and it is available in some jurisdictions and not others. This
        is a bigger risk than the 40 KB.

---

## Done today

- **Widget request fan-out** — the widget row was the largest remaining request
  count in the extension. Four things were wrong, in rising order of cost:
  market overview and altcoin season each fetched the *same* Coinlore URL (and
  altcoin season cached nothing), so both on meant two identical round trips
  every cycle; widgets the user had hidden were still being fetched; the eight
  requests ran one after another instead of together; and the four per-coin
  derivatives fetchers had no cache at all, which auto-rotate turned into a
  request every few seconds, re-paying for coins visited a minute earlier. Now:
  one shared, in-flight-deduped Coinlore fetch, hidden widgets skipped, all
  fetches in parallel, and per-coin caching under a `name:COIN` key (funding at
  15 min since it settles three times a day; the rest at the 5-minute cycle).
- **Price targets** (was "alerts") — renamed, because nothing is pushed and the
  old name promised more than it delivered. Detection now scans candle
  highs/lows since the target was set, so a target hit while no tab was open —
  even one that reverted before morning — is still reported, with when it
  happened. Closes the one real hole in the feature without touching the
  zero-permission stance.
- **Candlestick mode** (Settings → Appearance) — item 4 below, shipped. Ended up
  _cheaper_ than the line chart rather than equal: in candle mode the candles are
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
- **Move headlines** — when a coin moves more than its period's threshold (2% in
  an hour, 50% in a year; ALL excluded because every all-time chart is a big
  move), up to two headlines that *name that coin* from inside the same window.
  Deliberately narrow: a general feed beside a falling chart mostly shows other
  coins' news, and proximity alone reads as explanation. No mention, no line —
  and the label says where the stories came from, never why the price moved.
  Off by default, since it reads the news feed. Settings → Chart.
- **Stats row under the price** — range high/low for whatever period is shown,
  plus market cap and 24h volume. No new request: the range comes off the series
  already drawn, and the market figures were already arriving in the ticker's
  bulk response and being thrown away. Each stat hides itself when its source
  isn't loaded. Switchable from Settings → Chart.
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
- **One OKX request serving several widgets** — funding rate, open interest and
  liquidations are three different resources on three different paths; there is
  no combined endpoint. Per-coin caching was the win available here instead.
- **Background service worker + `chrome.alarms` for targets** — would catch
  crossings with no tab open, but the candle lookback already does that from
  the foreground, and `alarms` is still a permission we'd have to declare.
