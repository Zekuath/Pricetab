# Changelog

Notable user-visible changes are recorded here.

## Unreleased

### Fixed

- The halving, difficulty, fee and mempool widgets fall back to Blockchair
  when mempool.space cannot be reached, instead of saying they could not load.
- The outlook widget has readings on the one-hour range (5 and 15 minutes
  ahead) instead of asking for a longer one.

### Added

- The chart can be dragged without zooming first: up and down slides the
  price window (a double-click puts it back), and pulling the past in from
  the whole range opens the next longer range on the same span.
- Twelve more chart patterns for the chart companion — triangles, wedges,
  ranges, flags, triple tops and bottoms — and twenty-one readings
  (divergences, Ichimoku, the stochastic, Fibonacci, weekly pivots, new
  highs, streaks, the Mayer multiple, quiet days), each with what followed
  it on the coin and how it did when tested on four coins.
- The base-rate screen (B) opens on what came after everything that is true
  now, lists the twenty most similar past stretches with what followed them,
  and the next day by weekday where that was found to differ.
- The chart's volume readout names the exchange the candles come from.
- The tour was refreshed for new installs, and an update now shows a short
  "what's new" tour once.
- A rating request that comes back at most three times, further apart each
  time, with a "Don't ask again" that ends it.
- The website: thirteen languages, a light theme, both remembered on the
  device without cookies; a "what's new" note on a returning visit; and a
  layout checked down to a 320-pixel phone.

- Pin up to four widgets to the home screen: they sit in the chart's
  lower-left corner as outlines and fill in when pointed at.
- Compare opens a drawer beside the chart instead of a window over it, and
  can compare a coin with the S&P 500, the Nasdaq 100 (both as Kraken's
  tokenized ETFs, from the one-day range up) or gold; which markets it
  offers is set in the drawer itself.
- Widgets arranged the way iOS arranges them: three sizes per card (small,
  medium, large) chosen from the menu a long press or right click opens, an
  Edit mode to move and remove them, and a gallery where each widget's sizes
  are previewed before it is added. A bigger card shows more; the large one
  says what it shows. Cards have a new, softer tile look.
- Comparison: the line under the price is now a small scoreboard — each
  coin's move, the gap, how many steps went the same way and how closely the
  two coins' steps moved together — with a Change button to pick another coin
  without stopping the comparison.
- News preview: on a wide screen the first click on a headline reads the
  story beside the list — its own text without pictures, where the newsroom
  allows it, or the feed's summary where it does not — with a counted reading
  of it: what kind of story its words make it, the coins and figures it
  names, its wording, its key sentences and what the chart's coin did since.
  A second click opens it.
- A "Next hour · model" widget (off by default): Bitcoin's next hourly close
  on Coinbase as a volatility model estimates it — a median, an 80% band and,
  for a Bitcoin price target in USD, the chance the close ends above it. It
  says how often its band held when tested on past data, and keeps its own
  record on this device.
- A "Chances" line under the price: the Regimes widget's reading for today
  (what followed past entries into the same state, beside any day) and the
  Outlook widget's range for the next stretch (the regime is off until
  switched on, since it reads years of daily history). Each chance — these
  two and the board's squares — is a switch in the chart's settings.
- Every square on the calls board carries its chance — the likelihood the
  price is in it when its column ends, worked out from the coin's own history
  and checked against years of past squares before it was allowed on; the
  readout says how often squares given that chance came true. Not shown on
  the all-time range, where the check failed.
- Chart zoom, pan, keyboard reading, a permanent price scale and time axis,
  finer candles for narrow windows, drawing tools and a ruler.
- Optional chart studies, pattern and strategy annotations, indicator overlays,
  CPI release markers and image export.
- Portfolio activity and holding-detail views, monthly time-weighted returns,
  dated income records, additional portfolio charts and a country tax guide
  based on official sources.
- A full derivatives practice page with contract candles, order book, movable
  layout, resting and scaled orders, order history and per-order stops and
  take-profits.
- Saved news items, day and coverage views, additional sources, exchange
  notices and source controls under Settings → Permissions.
- A colour-blind direction palette and keyboard access to chart data.
- A navigator of the whole range while the chart is zoomed, zooming out past a
  range into the next one, and two-finger pinch on touch screens.

### Changed

- The chart tools open after half a second on the "+" rather than a second.
- The derivatives page's About card has room around it.
- Panels now use separate left and right tab columns; Settings, News and Base
  rates use full-screen layouts.
- The chart, portfolio, derivatives page and widget drawer were reorganized for
  clearer controls and narrow screens.
- Background requests, cache reuse and news polling were reduced.
- Light-theme direction colours and portfolio colours were adjusted for
  contrast and clearer meaning.

### Fixed

- Chart scales, labels, candles, targets and comparison data stay aligned
  across range, theme and chart-type changes; labels inside the chart no
  longer print over each other, and the pointer's label no longer repeats the
  time shown on the axis.
- The calls board is moved by dragging it, like the chart: up and down for
  other prices, sideways for more board or more history. The four arrows at
  its edges are gone, and a drag no longer places a call — two clicks do.
- Zooming the calls board is smooth: the price, the dot and the squares glide
  together instead of jumping up and down every frame, the price scale's
  figures and the board's chances no longer flicker mid-zoom, and the zoom
  control shows where it is going at once.
- Zooming the chart steps through the ranges one at a time in both
  directions: out from 1H opens 1D (it could jump straight to 1W), and zooming
  back in from 1D now opens 1H. The range buttons say which range is on
  screen to a screen reader.
- The calls panel turns calls on and off from a switch in its head, where it
  is seen first (it was the last row of the panel). The panel shows no
  filters or empty lines before the first call, and price targets are no
  longer drawn over the board while calls are on.
- An idle new tab with calls on no longer redraws the chart every frame: the
  live price dot beats three times when a price arrives, then rests.
- On a phone, the targets and calls sheets start below the price instead of
  cutting through it and scroll as one page, so an empty list is readable;
  the target form's Add button, the widget size buttons and the two edge
  pulls are finger-sized.
- The news room: on a touch screen the bookmark stays in its row's corner
  instead of dropping onto a line of its own; the note on quiet sources is the
  list's last line (or under the sources, on a wide screen) instead of pinned
  under every screen; a quiet source's age is set in bold rather than red, a
  switched-off source is dashed rather than struck through, the column beside
  the feed fills the width, and a phone shows the first headline sooner.
- News sources recover correctly from timeouts, permission changes and stale
  refreshes.
- Portfolio lot, purchase and income updates remain consistent with holdings.
- Derivatives orders, fills, funding, layout and narrow-screen controls no
  longer overlap or report the wrong state.

## 1.3.0 — released August 2026

- Added persistent price caching, faster startup, provider fallback and chart
  performance improvements.

## 1.2.1

- Added settings polish, auto-rotation and the optional news ticker.

## 1.2.0

- Added watchlist and market widgets, top movers and reliability improvements.

## 1.1.1

- Improved privacy, performance and responsive layout.

## 1.1.0

- Added the widget system and additional market data.

## 1.0.0

- Initial Chrome Web Store release.
