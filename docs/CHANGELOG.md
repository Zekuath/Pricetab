# Changelog

Notable user-visible changes are recorded here.

## 2.0.0 — not yet released

Everything since 1.3.0: the 1.4.0 and 1.5.0 builds were packaged and never
submitted, so their changes reach the store here.

### Added

- The web version is a proper app on a phone: add it to the home screen and
  it opens full screen under its own name and icon, clear of the notch and
  the home indicator. The side tabs open with a swipe from either edge.
- Settings → This phone: the swipe edge's width, keeping the screen on while
  the app is open, and which screen it opens on.
- The derivatives page on a phone has Trade, Chart, Book and Open tabs, with
  the order ticket first.
- The monitor and the base rates are one screen: M opens it, B opens it on
  its Base rates tab, and the four tabs (Coins, Market, Correlation, Base
  rates) sit at its head. The screens' column has one tab for both.
- The toolbar popup is redesigned and does more: what you hold and its day
  at the top, each coin with its last day as a line, a press on a coin opens
  a tab on it, and your nearest price targets with how far each is. The
  next Bitcoin halving, Fear & Greed and the market's total value can sit at
  its top, and its gear chooses what it shows and its language — which it
  now actually follows, as the new tab does.
- PriceTab asks for a rating at a better moment — a few seconds after a call
  comes true or a target is reached, worded for it — and every Rate link
  opens the store's reviews tab directly. The website and the README ask
  too.
- A futures contract's exit plan: up to three take-profit targets, each with
  its share; the stop and the targets each triggered by Mark or Last; the
  stop moved to break-even after the first target; and price protection that
  holds the exits while Mark and Last disagree by more than 0.5%. Each target
  is its own line on the chart, and dragging one moves only that one.
- The monitor's market map takes the whole screen, and every tile opens its
  coin's card beside where you pressed it — with its market value and the
  day's trading too; a coin PriceTab prices but cannot draw says so.
- A coin in the monitor opens its own card — the price, its 30 days, how far
  it moved, its typical day and how it moves against Bitcoin — with the chart
  and its base rates one press away, instead of leaving for the chart.
- The monitor's correlation says each pair in words (in step, mostly together,
  loosely, unrelated, opposite), with how often the two went the same way and
  the pairs worth knowing in plain sentences.
- Inside the monitor the base rates wear the monitor's head, and switching
  tabs slides the new content in while the screen around it stays still.
- The base rates open on a row of four figures — the RSI, how many states
  are true right now, today's candle and how many years are counted — with
  stronger section heads, the rows about today marked down their edge, and
  one line of sections that shows where you are as you scroll.
- On a phone the two side columns stand face to face, every tab the same
  height, and the range row's + is drawn like the ranges beside it.
- The privacy page reads like the site: its theme, its type, and each
  heading typed out as its section arrives.
- Settings → This phone → Getting around: keep the tab bar at the foot, or
  use the swipes from the sides alone and give the chart the bar's height.
  Works in the browser and in the iPhone app.
- Settings → the chart → Room Ahead: the chart rests with some blank time to
  the right of the latest price, as TradingView does. Off by default.
- The practice account takes deposits up to 10,000,000.
- The line under the price gives the next 24 hours: the range the price
  ended in on 80% and on 50% of past days like this, from the calls board's
  own model, tested on data it had never seen before it was allowed on. It
  gives no odds for up or down, because those were no better than a coin
  toss.
- Settled calls are kept far longer (500), each says when its square was,
  and a press shows the square again over the price of those minutes.
- The monitor (M) has more to read: four facts over the table (how many of
  your coins rose today, the middle coin's 30 days, the widest typical day,
  the largest 30-day move), each coin's 30 days as a small line, and β — how
  far it moved for each 1% Bitcoin moved over the same days. ↑ and ↓ walk the
  rows. A new Market tab maps the top 100 coins by market value, each tile
  sized by it and shaded by its 24 hours, with the day's largest moves under
  it; a coin the chart can draw opens from its tile.
- The derivatives page's chart is now the same chart as the main screen —
  its price scale, time axis, crosshair, zoom into the point under the wheel
  and drag — on the perpetual's own candles, and you can trade on it:
  - The order you are writing is drawn before you place it: where it would
    fill, where it would be liquidated and how far that is, and "+ SL" and
    "+ TP" handles. Drag one out to set the stop or the take-profit; the
    ticket's field follows, and the label on the chart shows what the stop
    would lose (and its share of the account) or what the take would make,
    with the reward against the risk, as you drag. The risk and the reward
    are shaded from now into the space ahead.
  - Open contracts and resting orders are lines you can drag: a stop or a
    take-profit, or an order's price. A move to the wrong side is refused
    and says why. A resting order has a × on its line to cancel it.
  - Ahead of the latest bar, a fan shows where the price stood across 2,000
    replays of the chart's own recent moves, and each stop, take-profit and
    liquidation line says how often the replays reached it first. These are
    counts of replays, not chances of profit.
  - The assistant's findings are numbered in a row above the chart, and the
    same numbers sit on the chart beside what each is about; pointing at
    one shows its band, pressing keeps it. Where the chart can do what it
    asks, it says so ("drag + SL on the chart").
  - Volume by price along the left edge with yesterday's high and low, the
    next funding settlement as a line ahead (or, when it is further off, a
    note at the edge with the time to it), the day's largest forced closes
    on OKX as dots where they happened, and (switched off by default) the
    order book's largest levels at the right edge. Each layer can be
    switched off in the page's Settings → On the chart.
  - Pointing at the chart shows the price there, how far that is from now
    and what your open contracts would be worth at it.
- Six more widgets, from sources the app already reads: Options (from
  Bybit — the strike where option holders would collect least at the
  nearest expiry, puts against calls, and the implied volatility at the
  money), a Funding Board across every perpetual the app charts, the
  Open Interest Leaders, the Stablecoins' combined size and share of the
  market, ETH / BTC, and the next US releases the chart marks.
- Calls you have made stay on the chart as marked squares — the ones that
  hit, missed or are still open — on every range, with the board up or not,
  until you remove them from the record.
- The derivatives page's Settings has a Layout choice: Simple (the ticket
  beside the chart) or Terminal (the chart, the order book and the ticket
  side by side, with the book's width a seam of its own).
- A BTC ETF Flows widget: what went into and out of the US spot bitcoin
  funds on the last trading day and over five and twenty of them, with the
  day's largest inflow and outflow (published daily by TFTC from SoSoValue
  and Farside).
- The derivatives page's guide opens over the chart: point at its last
  chip, or press it to keep it open, and every item is listed with the number
  the chart draws beside it and what you can do about it. Esc or a press
  elsewhere puts it away; the Assistant tab is still one press from it.
- Closed lists every contract the account has closed, not only the last
  twenty, twenty more at a press — and it keeps them after the account's own
  record has let the oldest go. Account → Start over makes a fresh account
  (once no contract is running, confirmed like every press that cannot be
  undone), and the contracts of the accounts before it stay readable under
  Closed → Earlier accounts until you delete them.
- On the derivatives page every area can be enlarged to the whole page for
  a moment and put back with Esc; the areas swap places by dragging one by
  its grip onto another; any tab under the chart can be pinned as its own
  panel beside it; and Settings → Layout puts everything back. The tab
  names under the chart stay put while their content scrolls.
- Opening a contract on the derivatives page has a moment of its own: the
  screen dims and a card shows the side, the leverage, the market, the price
  it filled at, the size and the margin, then goes. It is not shown when the
  system asks for reduced motion.

### Changed

- "Has this happened before?" (B) is easier to read: an index of its
  sections stays at the top and jumps to each, your coins sit in its head to
  read another without leaving, and every count is drawn as two bars — after
  this state and after any day — with the count beside each.
- The monitor (M): its summary cards sort the table by what they measure, a
  row shows that it opens the coin on the chart, and what each column means
  is one press away under the table.
- Russian and Ukrainian text uses the system's monospace typeface instead of
  falling back to a typewriter face.

- The mouse wheel zooms into the exact point under the pointer — the price
  as well as the time — wherever the pointer is. Off the price line the
  zoom used to drift towards the line, and near the right edge the point
  slid away a little more with every notch. A mouse wheel's notch now glides
  over a few frames instead of jumping, as a trackpad's zoom always did.
- Every new tab shows PriceTab's icon in the tab strip.
- Dragging the chart sideways no longer changes its shape: merged candles
  keep the same minutes wherever the window stands, a long line keeps the
  same points, and with the grid on the price scale stays put. Zooming out
  no longer leaves a growing blank stretch past the latest price.

- The derivatives page stays smooth with several contracts open. With eight
  open it froze for up to half a second every few seconds while doing
  nothing; now it does not freeze at all. Opening it, switching its range and
  its tabs are several times faster.
- "Has this happened before?" (B) opens twice as fast.
- The derivatives page is laid out for reading: nothing on it is smaller
  than 12 pixels, and the order ticket is short — side, leverage, size,
  stop and take-profit, then what the order means in words (what the stop
  would lose and its share of the account, what the take would make and the
  reward against the risk, where it would be liquidated) above the button.
  The setup, the margin figures, the size bracket and margin mode, the stop
  and scaled order types, a summary of what you already hold and, on a
  market order, the entry price are under Details; while a stop or a
  take-profit is missing the ticket says it can be dragged out on the chart.
  On a wide window the account's balance heads the ticket and its results
  sit in the page's title bar, the chart's own heading is three rows, and
  the chart takes about half the window. The panel under the chart is as
  tall as what it lists — one line when there is nothing — and the ticket's
  width can be dragged again. The page's Settings and the chart's settings
  drawer both list the two things the derivatives market draws on the main
  chart: the contract strip and the open contract's lines. Under
  More, the book, its depth and the trades are tabs of their own, and the
  book lays its bids and asks side by side, as many levels as the panel
  holds.
- On the main chart, a two-finger pinch and the + and − keys now zoom the
  price with the time, the way the mouse wheel does.
- Dragging across the page or double-clicking a figure no longer paints
  labels and numbers blue: the page's own words are not selectable, while
  fields and a news story's text still are.
- Dragging the main chart sideways only ever moves it: past the start of the
  range it carries on into older bars of the same size instead of switching
  to the next range, and the price scale stays as it was.

- Under an open contract, "If you close it all now" is a statement: the
  result in large type with its share of the margin, what comes back and the
  balance after, then the lines it is made of — the price move to the price a
  close fills at, the fee to close, the total, what was paid on the way in and
  the contract's whole result — and a sentence on why the row's P/L, valued
  at the mark, is not what a close banks.
- On the main chart the card for a companion mark opens beside the mark, not
  in the corner.
- The ticket's reward-against-risk line read the ratio backwards; it now
  reads "risk : reward 1 : x".
- Every press on the derivatives page that cannot be taken back now works
  the same way: a fill runs across the button — two seconds, or four when
  money is moving — the button says what is happening and that pressing it
  again stops it, and the action happens when the fill ends. It replaces the
  second press that reverse, close all, cancel all and the shares on the
  chart's contract strip asked for, and the extra press before a withdrawal.
  A fill whose button leaves the screen stops instead of going through.
- Opening a contract asks this way by default. Settings → Ask Before
  Opening turns it off, and opening then happens on the press.
- Dragging the chart sideways keeps its shape: the price scale no longer
  re-fits to every stretch the drag passes over, and the line moves up and
  down with the hand. While the scale is held this way, "Auto" under the
  price scale gives it back to the line (as do Whole range and a
  double-click).
- The mouse wheel zooms into the point under the pointer, in price as well as
  in time, so the dot on the line stays where it is. A zoom into a point
  further back no longer jumps to the 1H range at the present moment; it
  stays on the range it is in.
- With a drawing tool chosen, dragging moves the chart — into the empty time
  ahead of the latest price too — so a line can be drawn there; a click
  still places the point.
- The chart companion no longer covers the chart. The numbered list in the
  corner is gone: the setups are numbered badges along the foot of the
  chart, at their day, and badges that would touch become one — point at it
  for the list, click to read them one at a time. A live pattern's measured
  move and invalidation are tagged on the price scale beside the price, and
  finished patterns are named only while you point at them.
- The chart companion's card is easier to read: larger type on a solid
  plate, so lines no longer run through the words. Turn-level labels sit by
  the price scale.
- "What happened here?" marks a move as a whole — the fall from its high to
  its low — instead of putting a mark on each sharp five minutes of it, and
  tiny blips no longer get marks. The card says when the move began and
  ended, and lists the headlines worded the way the price went, and run by
  more newsrooms, first, saying why each is there.

### Fixed

- Longer languages stay inside their boxes: German, French, Russian and the
  rest no longer run out of buttons, column heads, tabs and fields; a word
  that cannot fit breaks with a hyphen, and a field too narrow for its hint
  ends in an ellipsis. "Allocation" in the portfolio is translated.
- Opened from an iPhone's home screen, the screens' × and the Settings head
  sit under the clock instead of on it, and Settings keeps an even margin on
  both sides.
- Text size has a smaller step (XS), and on a phone it heads Settings → This
  phone.

- Calls and targets are no longer left in English in the twelve translated
  interfaces, and awkward literal wording across those catalogues — especially
  Turkish — now reads naturally and uses the app's established terms.
- Hacker News stories about cryptography no longer appear as crypto news.
- A coin worth less than one unit kept only the decimals the setting asked
  for, so at the default two DOGE at $0.0849 headed the chart as $0.08, moved
  "+$0.00" and ranged from $0.09 to $0.08. Prices under one now keep four
  significant digits — on the chart, the monitor, the tab title and the
  toolbar popup — and the setting is still the least they show.
- The first tap on a square of the calls board wrote its chance over the
  "Lock?" that asks for the second; the square now shows only the question,
  and the chance stays in the line beside it.
- On a window less than about 850 pixels tall — 1366×768, 1280×800, 1280×720
  — the last tab on the right (Monitor) ran off the bottom and could not be
  pressed. On a short window the tabs drop their icons and keep their names
  and keys, and all of them fit.
- The price above the chart and the price tag on its axis could differ by
  tens of dollars: the tag showed the chart's last point, a few minutes old.
  The tag now shows the same live price, unless that price is outside the
  range drawn, where it still marks the end of the line.
- A phone held sideways now has the tab bar too — a slimmer one — instead
  of the two thin edge tabs, and the chart is taller there than before.
- With More open on a phone the tab bar stays usable: another tab, or More
  again, takes you on.
- On a narrow phone a long price (six figures and up) no longer runs out
  of its place at the top, and the row no longer slides sideways.
- On a phone every button, switch, tab, chip and field now takes a
  fingertip — 44 points, measured on every screen, upright and on its side.
  121 controls fell short held upright and 101 on its side, among them the
  switches, the "About" rings, the Settings menu, the derivatives page's
  tabs and every screen's ×.
- The example commands under "/" are a finger's height on a touch screen.
- In the iPhone app the bottom of the chart, its time axis included, sat
  under the app's own bar; the page now ends above it.
- The price's count-up on a new tab could show a negative price for a frame
  and showed the final price for a frame before counting up to it. It now
  starts at zero, and it does not run at all when the system asks for
  reduced motion.
- Monero (and the other coins priced on Kraken) drew far fewer points than
  the rest: a day had 96, a week 168, a month 180. They now use the finest
  candles Kraken gives for the whole window — 288, 672 and 720 — and weekly
  candles across their whole history.
- The halving, difficulty, fee and mempool widgets fall back to Blockchair
  when mempool.space cannot be reached, instead of saying they could not load.
- The outlook widget has readings on the one-hour range (5 and 15 minutes
  ahead) instead of asking for a longer one.
- Between 601 and 1023px wide (a phone on its side, a tablet, a narrow
  window) the chart sat 48px in from the left and its price tag was cut at
  the right; it runs edge to edge again.
- On a phone held sideways the price readout closes up, so the chart — and
  the calls board — has room instead of 26px.
- The calls drawer said "off" twice while calls were off.
- A pinch anywhere off the chart zoomed the whole page and left the edge
  tabs and drawers stranded; the page no longer zooms (text size is a
  setting), and its height follows a phone browser's bars.
- After zooming the calls board, the squares stopped a hair off their round
  size ("±$1000" for "±$1K") and a refresh could undo the zoom.
- On a phone: the target form's fields are no longer cut short, its span
  menu is tall enough to press, the base-rate screen's title no longer runs
  under its ×, and the sheets and the edge pulls sit above the iPhone app's
  bar.

### Changed

- The fireworks for a winning call last twice as long, with five shells,
  wider and brighter sparks and a few white glints.
- On a touch screen the keyboard hints are hidden and the drawers speak of
  tapping and holding instead of clicking and keys.

### Added

- The base-rate screen (B) shows each month of each year for the coin on
  screen — the month's change, how many of that month closed higher, and the
  median — with what testing found: no calendar month differed from the
  others, so none of it is a forecast.
- The chart marks three more US releases beside CPI — the Federal Reserve's
  rate decisions, the monthly jobs report and PCE inflation — each counted
  first: in 2022–2024 Bitcoin moved more in the half hour after each of them
  than in any of the seven before far more often than chance. The line under
  the price names whichever comes next, and the base-rate screen (B) counts
  what the last twelve of each did to the coin on screen. A year's chart
  keeps CPI and the jobs report; a month shows all four.
- On a phone the page works like a phone app: a tab bar at the foot (Chart,
  Calls, Targets, Portfolio, More) in place of the edge notches; a tapped
  square on the calls board is confirmed on a sheet that says the band, when
  it settles and its chance, with a confidence and Lock; hold a finger on
  the chart to read the price under it, pinch to zoom, double-tap for the
  whole range; and the gestures are explained once.
- A monitor screen (M): every coin you track on one row — price, 24 hours,
  7 and 30 days, where it sits in its 30-day range, how far it is from the
  high and how far a day usually goes — sortable, a row opens the coin; and
  a correlation tab showing how each pair moved together over 30 days, with
  the count each figure rests on.
- The "/" box is a command line: "eth 1y" opens a coin on a range, "1w" a
  range, "compare sol" or "vs spx" a comparison, "target 90000" (or
  "target +5%") the targets drawer with that price, and any shortcut's name
  runs it. Empty, it shows lines to try; half-typed, it suggests how the
  line goes on and says its shape; Tab completes; the commands also answer
  to their words in your language.
- The chances on the calls board for the day, week and month ranges come
  from a better model, chosen by a test fixed before it was run: rare
  squares are now about as rare as they say (on the month range, squares
  given 0.4% came true 0.6% of the time, where they came true 0.9%).
- The calls record says how often chance alone would do at least as well
  as your calls did, and beside each confidence level what chance would
  have given those squares. A call now keeps the chance the board printed
  on its square when it was locked.
- The chart's drawer (V) now also holds what sits under the price and how
  the chart updates — refresh interval and auto-rotate included.
- The chart can be dragged past the latest price into blank time, as on a
  trading terminal; the window keeps that room as new prices arrive.
- The price scale behaves as on a trading terminal: once the chart is
  dragged up or down its price range is held, so sideways drags no longer
  stretch it; dragging the scale on the right stretches it, and a
  double-click there hands it back to the data. A hand's small drift while
  dragging sideways no longer moves the price.
- On a phone, swipe in from the left or right edge to bring that side's
  tabs out, and swipe them back to put them away.
- On a phone, the drawers that open from the bottom have a grabber and are
  swiped down to close; with calls on, one finger drags the board and two
  fingers zoom its reach; one finger drags the chart in every direction.
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
