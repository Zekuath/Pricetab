# Today — August 8, 2026

Ideas that came out of reviewing a Perplexity Finance chart page, ordered by
value per unit of effort. All shipped or decided — nothing left open.

Context: candlesticks, the crosshair's OHLC readout and the volume band all
run off the same candles — Coinbase for most coins, Kraken for the ALL range
and for coins Coinbase doesn't list.

---

## Done today

- **Comparison mode** — press `C`, pick a second coin, and both are drawn as
  percent change from the start of the range on **one** axis. Never a second
  y-axis: two price scales on one chart put the crossing point wherever the
  scales were placed rather than where the market put it, which is the classic
  misleading chart. Each line is named at its own end with its final percent,
  so identity never rests on colour, and the crosshair reports both coins at
  the moment under the pointer instead of only the one you were already on.
  The single-coin line and any candles fade out while it is up — they are
  drawn in price space, and leaving them there would put two different
  y-meanings on one chart. The pick isn't persisted: it answers a question you
  have once, and a tab that always opened with two lines on it would be
  answering a question nobody asked. Esc, `C` again, or the button clears it.
  The button sits beside the widget control on the left rather than in the
  right-hand cluster, because those three all open a panel over the chart
  while this changes how the chart is drawn. Its icon (two arrows passing) was
  picked by drawing four candidates and looking at them at 17px, the only size
  that matters: two curves diverging from a shared origin collapsed into a
  "<", two trend lines turned to mush, a pair of peaks read as a scribble.
  Active, it takes the compared line's colour.
- **Prediction markets widget (Polymarket) — researched, then deferred.**
  Not a rejection: the source clears our bar easily (keyless,
  `access-control-allow-origin: *`, and `tag_slug=bitcoin` returns exactly the
  right markets). What it costs is the issue — no field selection means the
  smallest useful response is 40 KB, more than the whole Coinlore sweep. The
  deciding factor was timing rather than either: it now waits until 1.4.0 is
  approved, so if displaying betting odds does draw a review question, it is
  obvious what caused it. Written up in `VISION.md` Phase 4 with the
  measurements, so nobody re-runs the research.
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
- **Candlestick mode** (Settings → Appearance) — ended up
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

- **Widget + ticker caches made to survive the tab** — the leftover half of the
  widget cost work. The fan-out fix above cut duplicate and wasted requests
  *within* a tab, but every cache was an in-memory `Map`, and a new-tab
  extension gets a fresh JS context each time. So the TTLs — Fear & Greed an
  hour, Coinlore's global figures five minutes, funding fifteen — were never
  actually spent: each tab started cold and re-paid for numbers it had just
  fetched. Both caches now persist to localStorage with the same
  debounce/cap/hydrate shape the price cache already had, and hydration re-
  applies the TTL so nothing expired is carried in. A tab opened inside the
  window now makes zero widget requests.
  The ticker's top-100 sweep needed one extra fix to benefit: it ran
  unconditionally, so persisting alone would have changed nothing. It now skips
  while the last sweep is inside the 60s TTL — and, because that guard is keyed
  on currency, the sweep had to stop filtering the response by the caller's coin
  list. Otherwise a three-coin alert sweep would satisfy the page ticker's
  sixty-five-coin request and push the remainder onto the per-coin Coinbase
  path, which is *more* expensive than what it replaced.

- **Widget design + accessibility pass** — the cards were designed once, small,
  and never revisited. Four things were wrong. (1) Nothing could be resized:
  every dimension inside a card was in `rem`, root-relative, so the card and
  its contents had no relationship — making them bigger would have meant
  editing every rule. The card now owns a `font-size` and everything inside is
  `em`, which turned "let people resize the widgets" into one number and a
  picker (S/M/L/XL, Settings → Widgets). (2) Labels were the primary text
  colour at `opacity: 0.5–0.6`, stacked on a translucent card — much less
  contrast than the number implies, on type already under 9px. They use
  `textSecondary` now, and the baseline came up. (3) The up/down colours were
  hardcoded to the dark-mode hex, so light mode drew mint green on white.
  (4) The per-card hide button only existed on hover — and the one layout
  where it matters most, the bottom row on a tablet, has no hover at all.
  Bars and markers keep a px floor so Compact doesn't collapse them.
  Value on top: hovering a label now gives the same one-line explanation
  Settings carries, since half the labels are terms of art ("open interest",
  "funding rate", "alt season") that a three-word card can't unpack itself.

- **Portfolio: tax report + the honesty gap it exposed.** Reading the CSV to
  improve it turned up a real problem first: cost basis only covers the amount
  you have logged purchases for, but the report printed the *full* holding
  beside a P/L covering part of it, with nothing saying so. Someone reconciling
  the sheet would find numbers that don't add up and no explanation. Fixed in
  both places — explicit "Amount with cost logged" / "Amount without cost"
  columns and a footnote in the file, and in the app the expanded holding says
  which part isn't covered while the P/L stat's tooltip names it.
  Then the actual improvement: short-term vs long-term is the split a return
  turns on, and the file left that arithmetic to the reader. Every lot now
  carries days held, which side of the 365-day mark it's on, and its own
  current value and gain; a summary block leads with the portfolio value, the
  basis, and the unrealized P/L split into both halves. The file states the
  cost-basis method (FIFO), that the threshold isn't universal, and that it
  records no sales — so nothing in it is a realized gain, which is the honest
  boundary of a tracking-only tool.
  Also: numbers are trimmed to 12 significant digits. A spreadsheet renders
  every digit of double error, so a clean $34,000 gain printed as
  33999.99999999999. Twelve digits is past anything real and short of the
  noise, and unlike fixed decimals it doesn't flatten a sub-cent coin to zero.
  Carried into the UI: a "Long term" share in the header stats, and lots
  marked "long" once they pass the mark.

---

## Not doing (and why)

- **Seeded first-paint chart data** — would ship fabricated prices that read as
  real for a moment, and go stale in the repo. Shipped an honest
  "Fetching prices…" cold state instead.
- **Real brand coin logos** — either ~64 third-party trademark files in the
  bundle or runtime requests to an icon CDN; both break the zero-external-request
  guarantee. Monogram badges were shipped instead and then removed — every row
  that carried one already spelled the coin out beside it ("BTC · Bitcoin",
  "BTC rises above $X"), so the badge was decoration repeating the text. That
  left `coinmark.js` with no callers, so it is gone.
- **Browser notifications for price targets** — needs the `notifications`
  permission and breaks the zero-permission story that keeps store review fast.
- **One OKX request serving several widgets** — funding rate, open interest and
  liquidations are three different resources on three different paths; there is
  no combined endpoint. Per-coin caching was the win available here instead.
- **Background service worker + `chrome.alarms` for targets** — would catch
  crossings with no tab open, but the candle lookback already does that from
  the foreground, and `alarms` is still a permission we'd have to declare.
