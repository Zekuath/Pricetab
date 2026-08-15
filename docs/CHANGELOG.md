# Changelog

All notable changes to PriceTab will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Price-only coin tier via Coinlore (expand coverage beyond Coinbase-served coins)
- Ethereum gas tracker widget

---

## [1.4.0] - Portfolio, Onboarding & Settings Polish (staged locally, not yet in a store build)

### Added
- **Compare two coins** - pick a second coin, and both are drawn on the chart as percent change since the start of the range you're looking at. That shared scale is the only honest way to put a $60,000 coin and a $0.50 coin on one chart: giving each its own axis would let the lines cross wherever the scales happened to be placed. Each line is labelled with its coin and its result, and hovering reads out both at that moment. Start it from the compare button beside the widget control, or press `C`. The button takes on the compared line's colour while it's on; click it again, press `C`, or hit Esc to go back to one coin. Nothing is saved, so a new tab always opens on a single chart
- **Targets on a move, not just a price** - "BTC falls 5% in 24h" alongside "BTC rises above 80,000". A size of move means the same thing in every currency, so unlike a price target these are never paused when you switch display currency — and they get the same backward look: each candle in the last week is compared with the one 24 hours earlier, so a 5% drop that happened and recovered overnight is still reported, with when it happened and what the coin was worth then. Costs no extra request either way: the live check reads the 24h change the ticker already carries
- **The targets panel says where things stand** - it listed what you'd asked for and nothing else, which made it useless for the question you actually open it to ask. Each row now carries the current price and how far the target is from it (or, for a move target, how far the coin has moved today and how much further it needs to go), plus a thin meter showing how much of the distance has been covered since you set it. Targets sort nearest-to-firing first, so the one about to happen is at the top; hit ones sink to the bottom and can be **re-armed** in one click instead of being retyped. A hit row keeps saying when it happened and at what price
- **The targets panel got the room it needed** - it was a narrow list of hairline-separated lines, which was fine when a target was one sentence and wrong once each carries three stacked facts. The panel is wider and **centred** — it used to start near the top and grow downwards, so its size decided where on the screen it lived. It is now three fixed bands: heading, a scrolling list, and the form. Only the list scrolls, which means with ten targets the form is still there instead of below a long scroll. Every target is its own card with the direction shown as a coloured edge *and* an arrow (so it survives red/green colour blindness), and the coin symbol leads the line in bold so the list can be scanned rather than read. Targets already hit move into their own "Already hit" section instead of trailing the live ones, the header carries a tally ("2 armed · 1 hit"), and the empty state is a proper first-run panel rather than a paragraph in the corner of a tall box. The banner that reports a hit picked up the same arrow, and splits what happened from when onto two lines
- **One tap instead of arithmetic** - setting a price target means answering "what is 10% above the current price", which is a sum nobody wants to do against a five-figure number. The form offers ±1/5/10/25% off the live price (or a 2/5/10/20% move), which fills the box with a rounded, readable number and leaves it editable — nothing is added until you press Add
- **Undo a removed target** - removing one used to be a single silent click that threw away when it was set and where the price was then, neither of which retyping brings back. The row is now restorable, exactly as it was, until you close the panel
- **Target any supported coin** - the coin picker offered only the coins already on your chart, which had the dependency backwards: wanting to be told when something moves is exactly how a coin earns a place on that list. All of them are offered now, with your own still grouped at the top
- **The panel is usable from the keyboard alone** - it opens with the target box focused, Enter adds and keeps the focus for the next one, and Esc closes it. Esc previously did nothing while the cursor was in a text field, which is precisely where it now starts
- **The add form checks before you commit** - typing a target now tells you what it would mean: how far it is from the current price, or a warning that it is already true and would fire the instant you add it, or that you already have that exact target. Before, all three of those silently produced a target that fired immediately or a duplicate that fired twice
- **Move headlines** - when a coin makes an unusual move for the range you're on, up to two headlines that mention that coin from the same window appear under the price. Only stories naming the coin qualify, and the label says where they came from rather than claiming they explain anything. Off by default; shares the ticker's news feed
- **Market stats under the price** - the high and low of the range you're looking at, plus market cap and 24h volume. Nothing extra is fetched for it: the range is read off the chart's own series and the market figures already arrive with the ticker's data. Switchable from Settings → Chart
- **Volume bars** - a band along the bottom of the candlestick chart showing how much was traded, drawn from the same candles so it costs no extra request. Switchable from Settings → Chart, where it appears only once candlesticks are on
- **Candlestick charts** - switch the chart to open/high/low/close bars from Settings → Appearance → Candlesticks. Every range is split into even candles that cover exactly that range: 1H is 60 one-minute candles, 1D is 96 quarter-hours, 1W is 168 hours, 1M is 120 six-hour bars. Thinly traded coins merge their empty intervals, so a quiet hour still draws as candles rather than a row of dashes. Where candle data exists this is actually the *cheaper* mode: the candles are the only request the chart makes, since the price line is derived from their closes. The ALL range draws candles too, sourced from Kraken since no Coinbase request covers a multi-year window — BTC goes back to 2013. Ranges still without candle data (a currency Coinbase doesn't quote, or one of the four coins Kraken doesn't list) stay on the line
- **Monero (XMR)** - charts, prices and everything else, served by Kraken because Coinbase doesn't list it. Coins can now come from different price providers, which is the groundwork for covering more of the market

### Changed
- **A hit target tells you from the tab strip** - the banner only ever existed on the tab you were looking at, so a target that went off while you were elsewhere waited silently until you happened to come back — and a PriceTab tab in the background wasn't even checking, because the extension deliberately stops polling when hidden. Both are fixed: a hit is announced in the tab title, alternating with a marker while the tab is away so the movement catches your eye the way an unread count does, and settling to a steady line the moment you look at it. Targets are now checked while the tab is hidden as well. This stays a zero-permission extension — writing your own tab's title needs no permission, which is the whole reason the feature is in-tab rather than a browser notification
- **…and you can switch it off** - Settings → Preferences → "Announce Targets In The Tab Title". The switch governs the background checking too, not just the message, because that's the part that costs something: it is the only thing PriceTab fetches while you're looking elsewhere, and it does so only when you have a target armed, only for that target's coins, and every two minutes
- **Fixed: selling reported a gain on coins you no longer had** - there was no way to record a sale, so selling meant editing the amount down by hand — and that left the purchase lots untouched. A holding bought at 30,000 and sold in half still carried the full original cost basis, so a position now worth 45,000 kept reporting the whole position's 60,000 gain. Cost basis is now clamped to what you actually hold, wherever the mismatch came from: a recorded sale, a hand edit, or an import
- **Record a sale, and see what you actually made** - the expanded holding takes "Sold" as well as "Bought" — the same two questions, how much and for how much. Recording one does the three things that have to happen together: takes the coins off, consumes the oldest purchases against them (FIFO), and keeps the resulting gain, which the lots it consumed can no longer be asked for. A **Realized** figure joins the portfolio stats: settled money, sitting beside the unrealized position rather than folded into it. Selling coins you never logged a purchase for is handled honestly — the gain covers the part that had a cost, and the rest is reported as proceeds with nothing to set against them
- **"Tax report" is now "Cost basis report"** - the old name promised a document you could file from, and the file is the record one is worked out *from*: it holds only what you entered in PriceTab, with no exchange history, transfers, fees, crypto-to-crypto trades or staking income. The caveat also moved to where it gets read — on the button, before the click, rather than in a footnote inside a file you've already downloaded — and the file now opens by saying what it is and what it doesn't contain
- **The cost basis report pairs each sale with the purchases it consumed** - a disposal on its own is half a record. Every tax form and every tax tool asks the same thing in the same shape: which acquisition, which disposal, what it cost, what it fetched. A single line per sale can't answer that, because one sale can eat several purchases bought on different days at different prices — and each of those pairs has its own holding period, so the same sale can be part long-term and part short. The Disposals table is now one line per pair, with the acquisition date, the sale date, the days held and the term. Proceeds are split across the pairs by amount, which is arithmetic rather than an allocation: a sale happens at one price, so every unit fetched the same. Lines that have no acquisition to name are still emitted — the uncovered part of a sale, and sales recorded before the pairing existed — because a proceeds column that doesn't add up to what you received is the first thing anyone checks
- **The report has a Disposals section** - it used to state outright that it recorded no sales, which made it half a report. Every recorded sale is now a line with its date, proceeds, the basis it consumed and the realized gain, and the summary block carries the total. The disclaimer that replaced it is the accurate one: sales are in there if you recorded them, and anything sold outside PriceTab is not
- **The portfolio chart says something now** - the full-bleed chart behind the portfolio was texture: no axis, no readout, nothing you could take a number off. It now carries your cost basis as a labelled line across it, so where the curve sits above that line is where you're ahead and where it crosses is when you got there. It draws only while the level is inside the range on screen — a line pinned to the edge would claim a crossing the window doesn't contain
- **The portfolio stats found a shape** - seven equal-weight figures in one flat run had grown to about 950px in a 760px column, wrapping into two ragged lines of 10px uppercase with nothing to say where to look first. The two results — unrealized and realized — now lead at a readable size, and what qualifies them (vs BTC, long-term share, 24h, best and worst) sits in a quiet grid underneath that actually lines up into columns
- **Holdings are ordered by what they're worth** - the list rendered in the order coins were added, so your biggest position could sit at the bottom — while the chart behind it was already ranking the same holdings by value to decide which twelve to draw. Biggest first is now the default, with one-tap ordering by value, P/L, today's move or name, remembered between visits. Rows with nothing to sort on — no price yet, no cost basis — go to the back instead of sorting as zero and scattering through the middle, and the coin symbol breaks ties so the order doesn't shuffle as prices tick. The exported report follows the same order, so the file reads like the screen
- **Every holding shows its shape** - a small curve on each row, over whatever range the chart is on. It's drawn from history already fetched for the background chart, so for most rows it costs nothing and the rest simply show no curve. Each is scaled to its own range and tinted by its own direction: the value beside it says how big the holding is, so the curve is free to say only how it got there
- **Portfolio: how you did against just holding BTC** - a portfolio's own percentage answers "did it go up", which in a market that moves together is nearly everyone's answer. It can't be read for the part that was actually yours: whether holding *these* coins beat holding the obvious one. The stats row now carries the gap in percentage points over whichever range the chart is on, with both numbers spelled out on hover. The comparison is exact rather than indicative — the value series holds amounts fixed across the window, so there are no deposits or withdrawals inside it to distort either side, and the benchmark is trimmed to the portfolio's own window so it can't win on span. It rides along with the chart's existing requests, and usually costs none at all since BTC is already cached
- **The coin list shows how its coins are doing** - Settings → Coins was a list of bare symbols: a naming exercise, when the question you open it with is usually "which of these is doing what". Each chip now carries its 24h move. Nothing is fetched for it — the ticker snapshot is already in memory, so the numbers are free
- **Sort your coin list in one tap** - A–Z, biggest 24h move, or largest market cap. Dragging is precise but it's a chore past a handful of coins, and these are orders you want back regularly rather than once. The previous order goes into the same undo the reset uses, so a sort can't silently discard an arrangement you dragged into place
- **The report knows how long you've held things** - short-term versus long-term is the split a return actually turns on, and the CSV had no idea: it listed each purchase's date and left the arithmetic to you. Every lot now carries its days held and which side of the one-year mark it falls on, plus its own current value and unrealized gain, so the sheet can be sorted or filtered on the split without recomputing anything. A summary block at the top gives the portfolio value, the cost basis, and the unrealized P/L broken into its short-term and long-term halves. The file states which cost-basis method it used (FIFO), that the one-year threshold isn't universal, and that it records no sales — so nothing in it is a realized gain
- **The report stops quietly under-reporting** - cost basis only exists for amounts you have logged a purchase for, which can be less than what you hold, and the old CSV showed the full amount beside a P/L covering part of it with nothing to say the two disagreed. There are now explicit "Amount with cost logged" and "Amount without cost" columns, and a note at the foot when either applies. The same is true in the app: a holding with an unlogged remainder says so when you open it, and the P/L stat's tooltip names what it does and doesn't cover
- **Long-term share, in the portfolio header** - what proportion of your logged purchases has passed the one-year mark. It's the one thing about a holding that changes while you do nothing, and each purchase line is now marked "long" once it gets there
- **Report numbers are clean** - a spreadsheet showed every digit of double-precision error, so a $34,000 gain printed as 33999.99999999999 and 1.2 minus 0.7 left 0.49999999999999994 in the remainder column. Values are trimmed to twelve significant digits, which is past anything real and short of where the noise lives — and, unlike rounding to a fixed number of decimals, doesn't flatten a fraction-of-a-cent coin to zero
- **Widgets can be made bigger — Settings → Widgets → Size** - the cards were built at one size, small, and everything inside them was fixed to the browser's root font size, so nothing scaled together and there was no way to make them readable short of zooming the whole page. The card now sets a single size and its contents are measured against it, so one setting scales the text, the bars, the gauges and the padding at once. Four steps from Compact to Extra large, which is roughly half again the old size
- **Widgets are legible at any size** - a pass over every card: labels moved from a dimmed version of the text colour to the proper secondary colour (dimming already-small type on a translucent card gave far less contrast than the number suggested), the smallest text came up from under 9px, and the up/down greens and reds now come from the theme instead of fixed hex — they were dark-mode colours being drawn on white in light mode. The bars and dots keep a pixel floor so they survive the Compact end
- **Widgets explain themselves** - "Open Interest", "Funding Rate" and "Alt Season" are terms of art, and a card three words wide has no room to unpack one. Hovering a widget's label now gives the same one-line explanation Settings already carried
- **The widget close button works on touch** - it only appeared on hover, and on a tablet — where the widget row sits along the bottom of the screen and space is tightest — there is no hover, so it could not be reached at all. It is now visible on devices without hover, and reachable from the keyboard
- **Widget data survives the tab** - the widget cache and the ticker's coin snapshot now persist to localStorage, the way the price cache already did. Every widget had a sensible cache lifetime — Fear & Greed an hour, the market figures five minutes, funding fifteen — but a new tab is a brand new page, so those lifetimes were never actually spent: each tab started empty and paid for the same numbers again. Open a second tab while the first one's data is still inside its lifetime and it now makes **no** widget requests at all, and the widget row paints instantly instead of filling in. Nothing is shown any staler than it already could be within one open tab: the same lifetimes decide what counts as fresh, on the way out as on the way in
- **The top-100 sweep runs once, not once per tab** - the biggest single request in the extension (Coinlore's top-100 tickers, which feeds the page ticker, the watchlist and top movers) ran unconditionally on every new tab, plus an exchange-rates request on non-USD. It now reuses the last sweep while it's inside the 60-second window it already treats as fresh, so a burst of tabs costs one sweep rather than one each
- **Widgets ask for less** - the widget row now makes noticeably fewer network requests without changing what it shows. Market overview and altcoin season share one fetch instead of requesting the same data twice; widgets you have hidden are no longer fetched; the remaining requests go out together rather than in a queue; and the funding, open-interest, long/short and liquidation figures are cached per coin, so auto-rotating through your list no longer re-asks for a coin it visited a minute ago
- **Settings search** - a filter at the top of Preferences finds a setting by name or by what you'd call it ("colour", "ohlc", "decimals"); matching groups open automatically
- **Chart settings grouped together** - the chart colour, candlestick and detail switches moved out of Appearance into their own Chart group, instead of sitting beside the theme picker
- **Keyboard shortcuts are discoverable** - press `?` (or open it from Settings) for the full list; they were previously mentioned nowhere after the first-run tour
- **Six more shortcuts** - `P` opens the portfolio (alongside the existing `S` and `A`), and a new View group covers the things you previously had to open Settings to change: `T` flips between the line and candlesticks, `X` between percent and price change, `W` clears or restores the widget row, `D` switches light/dark, and `Space` starts or stops rotating through your coins. Space is left alone when a button or dropdown has the focus, so it still activates the control you tabbed to
- **The first-run tour covers the whole extension** - it used to stop at the price, the range switcher and "everything else is in Settings". It now also walks through the coin jumper, comparing two coins, price targets, the portfolio, and both widget controls — the row itself (switch them on, drag to reorder, × to hide one) and the button that clears the whole row — twelve short steps, still skippable from any of them. Each step names its shortcut on a key chip, and a closing step hands over the four that have no button (`T`, `D`, `Space`, `R`). The steps run in the order your eye reads the page instead of hopping across the screen, the footer shows where you are with a progress line rather than a row of dots that stopped fitting, and the tour holds the keyboard while it's up, so Esc and the arrows no longer drive the tour and the chart at the same time
- **The widgets step survives having no widgets** - a fresh install has every widget off, so there was no widget row for the tour to point at and the step that explains how to turn them on was silently skipped. Steps whose target may legitimately be absent now show centred instead of disappearing
- **Replay the tour** - Settings → Preferences now has a "Replay tour" link beside "Keyboard shortcuts". The tour otherwise shows itself exactly once, with no way back to it
- **Real icons instead of emoji** - the settings, portfolio, price-target, hidden-widget and watched-address controls are drawn as inline SVG rather than 💼🔔👁 emoji. They now follow the theme colour, look identical on every platform (emoji are drawn by the operating system) and share the chart's thin round-capped stroke
- **Watchlist and Top Movers now list prices** - both widgets show symbol, current price and 24h change on one row, and read the same way. The watchlist keeps its heat wash behind the rows, so the colour still tells you the shape of your list at a glance without hiding the numbers

### Fixed
- **RSI widget says what it is measuring** - the value is computed from the chart's current coin and range, so the label now names both ("BTC RSI · 1D"); before, the same number silently meant something different after switching period
- **Panels no longer show the main view's buttons** - opening price targets left the settings, portfolio and widget buttons floating on top of it; every panel now shows only its own close control
- **Close button stays in the corner** - the × no longer slides down when the top price ticker loads; a panel covers the ticker, so there was nothing to dodge (settings now covers it too, like the other panels already did)
- **Click outside to close, everywhere** - the portfolio can be dismissed by clicking beside it like the other panels, and settings no longer closes when a text selection happens to end outside the card
- **Crosshair readout no longer lingers** - the open/high/low/close table stayed on the chart after the cursor left. Moving off the screen in one motion, switching to another app, or opening a panel with the keyboard now clears it too
- **Portfolio close button no longer jumps** - opening the portfolio before the top price ticker had loaded made the × slide down once the ticker arrived behind the panel, even though the ticker is hidden by the portfolio

### Added
- **Portfolio tracking** - full-screen, tracking-only holdings view (total value + change over a selectable period); manually entered amounts, all data local, no wallet connection
- **Portfolio value chart** - full-bleed background chart of total portfolio value over time, with a persisted period switcher (day/week/month/year/all)
- **Portfolio design polish** - per-holding allocation share (thin accent meter under each row + % next to the coin name), a quiet stats row under the total (24h P/L, best/worst 24h mover), unified uppercase section labels and a friendlier empty state
- **Onboarding tour** - first-run spotlight tour of the main controls (shown once, skippable)
- **Collapsible settings groups** - settings sections expand/collapse for faster scanning
- **Clearer cold start** - if the very first fetch is slow the loading placeholder now says so ("Fetching prices…", or that you're offline) instead of shimmering silently
- **Price targets** - set "BTC rises above X" / "ETH drops below Y" and PriceTab tells you when it was hit, as a dismissible banner on your next new tab (press `A` or the bell). Deliberately not called alerts: nothing is pushed, which is what keeps the extension free of the `notifications` permission. Detection looks backwards through candle highs and lows, so a target hit overnight — even one that reverted before morning — is still reported, with when it happened. Up to 10 targets; ones set in a different display currency show as paused rather than compared against the wrong number
- **Quick coin jumper** - press `/` on the new tab, type a symbol or name and hit Enter. Your own coins rank first; picking a coin you don't track yet adds it and switches to it
- **Retry on failure** - when prices can't be fetched the banner now says so plainly and offers a Retry button instead of silently sitting on cached data
- **Price flash** - the price tints green or red for a moment whenever it moves, so a tab left open visibly reacts (colour only, no layout shift; coin switches don't flash)
- **Since your last visit** - a quiet line under the price shows how the coin moved since you last looked ("Since your last visit (3h ago) +1.24% · $512"), switchable from Settings → Appearance. The reference point is the price you last saw before a break (20+ minutes away), and it holds still for the whole browsing session, so the comparison stays meaningful instead of always measuring against a few minutes ago
- **Chart crosshair with OHLC + volume** - hovering the chart reads out that point's open, high, low, close and volume (from Coinbase candles, fetched only once you actually hover — tabs you just glance at cost nothing extra). Switchable from Settings → Appearance → Chart Details; ranges or currencies without candle data fall back to the price and date (clock times on 1H/1D, plain dates on longer ranges); the readout follows the nearest data point, flips sides at the edges and stays inside the chart. Built to stay cheap: no React re-render per pointer move, a binary search over pre-scaled points, and DOM writes batched into one animation frame
- **One-time rating ask** - after two days of use, a small dismissible card in the corner of the new tab asks for a store rating; it appears exactly once and never returns after dismissing or rating
- **Hacker News in the news ticker** - well-upvoted crypto stories from the past week (via Algolia, CORS-enabled, no key) join Blockchair's headlines
- **News quality filter** - SEO/promo spam ("price prediction", presales, casinos, airdrops…) is dropped and the same story from multiple outlets is collapsed into one headline
- **Portfolio v2: purchase lots** - log purchases the way you made them ("bought 0.5 for 15,000, another 0.2 for 7,000"); each holding keeps a dated lot list that drives cost basis and unrealized P/L (per row and as a headline stat); allocation share per holding; JSON backup/restore (validated against the coin whitelist on import); a cost basis CSV with a per-coin summary plus every dated lot (informational only, not tax advice)
- **Address watching** - paste one of your addresses and PriceTab works out the rest: the address itself says which chain it is on (BTC, ETH, LTC, DOGE, BCH, ZEC), and every positive balance it holds becomes a holding — including, on Ethereum, the 29 supported ERC-20 tokens, found in a single batched call: a coin can combine several watched addresses with a hand-entered amount, and the row expands into a breakdown showing exactly how much came from each source (with each address shown in full and its own "Stop" button); compact ⛓ chips summarise everything being watched, and each address's amount stays synced to its public on-chain balance (read-only lookup via mempool.space / Blockchair, 10-minute cache; the address is stored locally and sent only to the balance provider). For BTC the purchase lots are inferred from the real transfer history — every incoming transfer counts as a buy at that date's estimated price, outgoing transfers consume the oldest lots first; other chains start from one lot priced at the watch date and log later balance increases as new buys
- Viewport meta tag for responsive rendering; Google site verification file (promo site)

---

## [1.3.0] - Instant Charts & Performance (released August 2026)

### Added
- **Instant chart on new tabs** - the last fetched prices are cached locally, so a new tab paints the chart immediately and refreshes it in the background instead of showing a loading skeleton
- **Graceful error fallback** - if something unexpected crashes the page, a reload prompt appears instead of a blank tab; a broken widget now hides itself without taking the chart down

### Changed
- **~42% less JavaScript per new tab** - removed an unneeded compatibility polyfill and replaced the full D3 library with a custom bundle containing only the chart modules actually used (482 KB → 277 KB of vendor code)
- **Background tabs stop polling** - price, widget and ticker updates pause while the tab is hidden and resume the moment it becomes visible, saving network and battery
- **Far fewer ticker requests** - the price ticker bar, watchlist and top movers now share one bulk market-data request instead of two requests per coin
- Coin prefetching only runs when the browser-tab title ticker or auto-rotate actually needs it

### Internal
- Split the single 7,700-line `app.js` into 12 focused script modules (no build step added)
- Centralized all localStorage access behind shared, validated helpers
- Added a regression test suite (`tests/`) and a CI workflow that runs it on every push

---

## [1.2.1] - Settings Polish, Auto Rotate & News Ticker

### Added
- **Auto Rotate** (Preferences → Data) - the chart switches to the next coin on your list automatically; pick the interval (10s to 15m). Pauses while the tab is hidden or settings are open
- **News headlines row** in the price ticker bar (opt-in, off by default) - crypto headlines from Blockchair + Cointelegraph, merged and deduplicated, cached for 10 minutes. Clicking opens the article in a new tab with no referrer
- **Search coins by name** - typing "Dogecoin" now finds DOGE; suggestion chips show full names, Enter picks the top match
- **Undo for "Reset to defaults"** - the button flips to "Undo reset" so a mis-click can't destroy your list
- **ESC closes settings** and a visible × close button in the panel header
- **One-time rating reminder** in settings (dismiss forever with one click) and the toolbar icon now opens the store listing
- **Promo website** (`site/`) on GitHub Pages - extension-styled landing page with an animated lightbox screenshot gallery

### Changed
- **Settings panel reorganized** - larger card (32×40rem); Preferences grouped into Appearance / Display / Data / Tickers; Widgets grouped into Portfolio / Market / Trader with one-line explanations per widget
- **Search suggestions redesigned** - chips open in an animated area between the search bar and Add coin; several coins can be added from one search; the area collapses smoothly when cleared
- **Preset buttons show their active state** (Holder / Trader / Minimal highlight when they match)
- **Clearer names** - "Tab Ticker" → "Browser Tab Title", "Page Ticker" → "Price Ticker Bar"
- **Currency dropdown** groups popular currencies (USD, EUR, GBP, TRY, JPY) at the top
- Settings scrollbar moved to the card edge with a stable gutter (no more layout shift)
- Feedback message colors are now theme-aware (readable in light mode)

### Fixed
- Stale suggestion chips no longer repaint over the search placeholder after clearing the input (debounce is now cancellable)

---

## [1.2.0] - Watchlist, Top Movers & Reliability

### Added
- **Watchlist widget** - your coins as a colour-coded heatmap (green up / red down)
- **Top Movers widget** - the day's biggest 24h gainers and losers
- **One-click widget presets** - "Holder", "Trader" and "Minimal" bundles
- **Animated chart** - draws itself in on load, with a trend-tinted area fill (green when up, red when down) and a price count-up
- **Chart color toggle** (Preferences) - turn the green/red fill off for a plain line
- **Collapsible price ticker** - hover-reveal chevron to minimise it, pause-on-hover, and the collapsed state is remembered
- **Starter widgets for new installs** - Watchlist + Fear & Greed + Market Overview enabled out of the box

### Changed
- **Geo-resilient market data** - funding rate and open interest moved from Binance (geo-blocked in the US/UK) to OKX; long/short ratio to Bybit; global market data (cap, dominance, altcoin season) from CoinGecko to Coinlore. Derivatives widgets now work worldwide.
- Trimmed the suggested-coin list to coins Coinbase actually serves (no more 404/console noise)
- Gentler ticker fetching (slower refresh, smaller batches, no retry while rate-limited) to stay within Coinbase's limits
- Bolder coin names in settings
- Refreshed Chrome Web Store screenshots, listing copy and description

### Fixed
- Chart no longer overflows below the screen when the ticker appears or the layout resizes (re-measures via ResizeObserver)
- Removing a non-active coin no longer switches the displayed coin
- The last remaining coin can no longer be removed (no empty rotation)
- Coin-specific widgets no longer show the previous coin's values after switching coins
- Cleared a timer that was left running on unmount

---

## [1.1.1] - Privacy, Performance & Layout Polish

### Changed
- Self-hosted the Roboto Mono font (no more external Google Fonts request) — faster, fully offline, zero third-party calls
- Spot price and chart history now fetched in parallel for faster loads

### Fixed
- Settings and widget-toggle buttons now stay aligned on small/short screens
- Bottom widget row is horizontally scrollable so all widgets stay reachable
- Chart now fills the available space without overflowing over the controls

---

## [1.1.0] - Widget System & Market Data

### Added
- **Widget System** - Toggleable side panel with 9 market data widgets
  - Fear & Greed Index (Alternative.me API)
  - Market Overview (total market cap + 24h volume)
  - BTC Halving Countdown
  - RSI Widget (coin-specific, 14-period)
  - Funding Rate (Binance Futures API)
  - Long/Short Ratio (Binance Futures API)
  - Open Interest in USD (Binance Futures API)
  - Liquidations 24h (OKX Public API)
  - Altcoin Season Index (CoinGecko BTC dominance)
- **Drag-and-drop widget reordering** - Widget panel order persisted to localStorage
- **Hide-all widgets button** - Single-click toggle to show/hide all widgets at once
- **Hover tooltips** - All interactive elements now have descriptive title tooltips
  - Period buttons (1H → "1 Hour", etc.)
  - Price area ("Next coin")
  - Change area ("Switch to price change / percent change")
  - Settings button ("Settings / Close settings")
- **Scrolling price ticker bar** - Optional top/bottom ticker showing multiple coins

### Changed
- Widget panel moves with coin changes for coin-specific data (funding, L/S, OI, liquidations)
- App source grown to ~5600+ lines

---

## [1.0.0] - Initial Release

### Added
- Real-time cryptocurrency price charts on every new tab
- **Dynamic Tab Title** - Live prices visible in browser tab (`BTC $43,250 (+5.2%)`)
- 60+ supported cryptocurrencies from Coinbase API
- Persistent coin selection using localStorage
- Drag-and-drop coin reordering
- 6 time periods: 1H, 1D, 1W, 1M, 1Y, ALL
- Interactive D3.js charts with smooth animations
- Settings panel with tabs (Coins / Preferences)
- Coin search and quick-add functionality
- Price and percentage change display
- **Dark/Light Theme** - Auto-detects system preference
- **37 Currency Options** - USD, EUR, GBP, TRY, JPY, and more
- **Customizable Refresh Intervals** - 10s, 30s, 1m, 5m
- **Advanced Caching** - 30s TTL, auto-cleanup
- **Retry Mechanism** - Exponential backoff for API failures
- **Offline Detection** - Shows cached data when disconnected
- **Skeleton UI** - Loading animation
- Mobile-responsive design

### Security
- Input validation against SUGGESTED_COINS whitelist
- Maximum 20 coins enforced
- All coin symbols normalized to uppercase

### Technical
- Chrome Extension Manifest V3
- React 16.5 for UI components
- D3.js v5 for chart visualization
- styled-components for CSS-in-JS
- Coinbase Public API integration
- localStorage for data persistence
- All dependencies bundled locally (no CDN)

---

## Change Types

- `Added` - New features
- `Changed` - Changes in existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Security improvements
