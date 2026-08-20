# Today — August 18, 2026

This file was cleared and rewritten on request. It is now **the list of what
was asked, one item per request, in the order it was asked** — nothing else.
The previous contents (Pieces 1–17, August 12–18) were all marked done or
superseded and have been removed.

Status is one of: **done** (built and verified), **partial** (built, with a
stated departure), **not started**.

---

## 1. Calls needs its own menu button, separated from Targets

**Asked:** "calls modu kendisine özel bir menü buttonu istiyor ve targettan
ayrılması gerekiyor."

**Status: done.**

- A fourth corner control (`CallsToggleButton`, `src/styles-app.js`), left of
  the targets bell, with its own icon — a board with one square claimed
  (`icons.js` → `calls`). Deliberately not the target's rings: a target is a
  request, a call is a claim, and the two buttons sit next to each other.
- Its own key: **K**. Added to `SHORTCUT_GROUPS` (`src/shortcuts.js`), because
  an unlisted shortcut does not exist.
- The tab strip inside the panel is **gone**. `AlertsTabs` / `AlertsTab` were
  deleted from `styles-alerts.js` and replaced by `AlertsHeadTitle`, which
  says which panel you are in.
- `app.js`'s `showAlerts` boolean became `alertsView` (`null | "targets" |
  "calls"`) — one slot, because only one card can be in the middle of the
  screen. Every existing guard reads it as a truthy value and did not change.
- Whichever list is up owns the × in the corner; the other button stands down,
  so there are never two × -shaped controls in one corner.
- The button carries a dot when a call has settled since the panel was last
  opened (`callsSeenAt`, persisted in `crypto_chart_calls_seen`).

**Verified:** `test-calls-render.js` §19 (K opens calls and the info ring
follows it), `test-alerts.js` (the calls info card names K).

---

## 2. The top row of the call squares should be selectable; the row above it should not

**Asked:** "calls karelerinin en üst kısmının seçiliyor olması gerekiyor,
ondan sonraki üst row seçilmemeli."

**Status: done.**

**What was actually wrong:** the top fade was a whole pitch tall, but the
sliced row it exists for is only whatever fraction is left over. Measured at
1280×800: 19.4px of sliced row, and the fade ran on for another 45px and
swallowed the first **complete** square — drawn in full, in the middle of the
board, and quietly refusing to be called.

**Changed:** `fadeEnd()` (`src/chart.js`) now takes the boundary off the
lattice — the first gridline far enough down to have something above it worth
fading (`FADE_MIN` = 14px) — instead of assuming a whole pitch. The mask stop
reads the same function, so the fade and the callable region cannot disagree.

**Measured after:** the topmost whole square is callable; only the sliced row
above it is refused.

---

## 3. The dragged bar should stop at 1 square left and 1 right, not 2

**Asked:** "sürüklediğimiz bar şu an iki kare solda olacak şekilde oluyor, onu
hem min 1 sol olacak şekilde ve 1 sağ olacak şekilde yenilemeliyiz."

**Status: partial — the left is 1, the right stays 2, and here is the
measurement.**

- `MIN_HISTORY_CELLS`: **2 → 1**. That is the limit that was stopping the line
  two squares short of the left edge. Done as asked.
- `MIN_BOARD_CELLS`: **stays 2**, and it cannot be 1. The lattice is anchored
  to the clock, so "now" falls *inside* a column and `cellAt` refuses that
  column — half of it has already happened. Measured at 1280×800 with a 64.5px
  pitch: dragging to a one-square board left **zero** callable squares. Two is
  the smallest number that guarantees one whole square to the right of "now",
  so on that side two squares *is* one square you can use.

If you want the right-hand limit at 1 anyway, say so and I will change it —
the consequence is that at the far end of the drag there is nothing to click.

---

## 4. In the portfolio's explore chart, clicking outside should close it

**Asked:** "portfolyo kısmında explore chart'da chart dışında bir yere
dokununca chart kısmından çıkış yapması lazım — şu an sadece × ile yapılıyor."

**Status: done.**

`PortfolioStage` (`src/portfolio.js`) takes an `onMouseDown` that closes when
the event's target is the backdrop itself — the same rule the targets overlay
already uses. `onMouseDown` and not `onClick`, because the chart is a surface
people drag across to read the crosshair, and a drag that starts on the plot
and finishes in the margin is not a request to leave.

---

## 5. The scrolling news row needs a filter, settable from Settings

**Asked:** "üstte akan newsler'de filtre de olmalı, en azından ayarlardan
ayarlayabileceğimiz — sadece bizim tuttuğumuz para birimleri ile alakalı olsun
diye; belki bu kısmı holder/trader gibi seçeneklendirebiliriz."

**Status: done.**

- A three-way setting under Settings → Tickers → Price Ticker Bar, revealed
  with the news switch: **Everything** (default) · **My coins** (your coin
  list) · **What I hold** (the portfolio).
- `NEWS_FILTER_OPTIONS` / `NEWS_FILTER_KEY` (`config.js`),
  `loadNewsFilter` / `saveNewsFilter` (`storage.js`).
- `newsForCoins()` (`api.js`) shares `newsMentionsCoin` with the existing
  `headlinesForCoin`, so the row and the move-headlines line cannot come to
  disagree about what "about BTC" means.
- Filtered at **render**, not at fetch: the same feed also drives the
  move-headlines line under the price, which is already narrowed to the coin
  on screen. Narrowing the stored list would make a headline about the coin
  you are looking at disappear because it is not one you hold.
- An empty coin set gives the whole feed back — an empty portfolio must not
  look like a broken feature.

**Not done:** the "holder/trader" presets. `APP_MODES` recognises a mode from
its settings (`activeAppMode`), and adding a field only some modes name breaks
`test-settings.js`'s "every mode is recognised as itself". Say the word and I
will wire the filter into the modes properly.

**Verified:** `test-api.js` — union across a set, word boundaries, case rules,
empty set, null feed.

---

## 6. The Preferences accordions need to show that they open — an animated arrow

**Asked:** "preference kısmında açılan akordiyon stili, onların açıldığını
belli etmemiz lazım — animasyonlu bir ok ucu olabilir; açılınca ok ucu yer
değiştirecek, geri dönünce eski haline gelecek."

**Status: done.**

There *was* an arrow and nobody could see it: a `▾` text glyph at 0.6rem
(9.6px) and 0.7 opacity, drawn by whatever font the OS picked — the same
reason the emoji were replaced in `icons.js` in the first place.

- New `chevron` icon on the 24 grid (`icons.js`), rendered at 0.82rem.
- `GroupChevron` (`styles-settings.js`) is now a bordered 1.15rem well, so
  there is a control-shaped thing to aim at, and it rotates a quarter turn on
  the same easing curve as the drawer below it.
- The heading is the hit area, so hovering the word brightens the arrow.

---

## 7. In calls mode the lower squares are not visible

**Asked:** "calls modunda grafikte aşağı kareleri göremiyoruz, yine tam
anlamıyla istediğim gibi değil — bunu nasıl daha iyi hale getirebiliriz."

**Status: done.**

**What was actually wrong:** the board's lattice was laid out inside the line
chart's 24px inset. `base` is a whole multiple of the step, so the lowest
gridline landed on `height − PADDING` and what was left underneath was a strip
with vertical lines running through it and no horizontal one to close them —
measured at 1280×800, the mesh stopped at y=471 on a 495px chart. Two things
followed and both were wrong the same way: the bottom square was never a
square, and it was callable anyway, so a call could be locked on a box whose
lower half had never been drawn.

**Changed (`src/chart.js`):**
- The board's plot is now the **whole chart** (`top = 0`, `bottom = height`).
  The leftover fraction of a row goes to the top, where the fade is already
  there to finish it. `plotPadY()` gives the price line the same inset, or the
  mesh and the line would describe different prices at the same y.
- `cellAt` refuses a row running off the foot of the chart — the vertical
  mirror of the part-column rule at the right-hand edge. One rule, both ends:
  **a square you can see whole is a square you can point at.**
- The window's placement was briefly changed to `ceil`, to hand a fall the
  spare square on an uneven row count. **That has been reverted, on 19 Aug.**
  Measured, it moves the whole window down one step — the top price label went
  from $43.50K to $43.45K, stable across three runs each way — which is a
  square taken from *above* the price, and above is where a rising chart
  invites calls. The extra room below is bought by the full-height plot, which
  is a whole row and costs nothing at the other end; leaning the window as well
  was a guess with a real price and no evidence for it.
- `callableRows()` replaces the same row count computed separately in two
  readouts (the zoom pill and the panel's Board strip).

**Measured, 1280×800, 495px chart:**

| | before | after |
|---|---|---|
| lowest gridline | y=471.1 (24px short) | y=495.1 (the chart's own foot) |
| whole callable rows | 6 | **7** |
| clipped rows that were callable | 1 | **0** |
| topmost whole row | refused by the fade | callable |

**Verified:** `test-calls-render.js` §25. With the old geometry restored the
lowest gridline is 23.9px short and the topmost whole square is not callable.

---

## 8. Gamification: reminders, fireworks on a 1st call, background settling, no banner when off

**Asked:** "asıl noktamız gamification — insanların eklentimizi her on dakikada
bir kontrol etmesi gibi bir iş yaratacağız. Hatta arada hatırlatmalar olacak,
'bak calls is successful' gibi. Ve 1st call başarılı olursa havai fişek
animasyonu olsun istiyoruz. Ve calls ayarlarında ayarlar, calls kapalı olsa
bile arka planda takip edecek; ve evet başarılı olursa sadece havai fişek
olacak, banner olmayacak."

**Status: done.**

**Settling now runs with calls switched off.** It used to be gated on
`predict`, so a week with calls off left every open call frozen mid-flight —
and switching them back on, the ones whose moment had scrolled off the range
came back "expired" and were dropped without ever being judged. A call is a
claim someone already made; whether they are still looking at the board does
not change whether it came true. What the switch governs is the **board**:
drawing it, placing on it, and being told.

**Fireworks** (`fireworks()` in `chart.js`): three shells launched from the
foot of the chart at staggered moments, each rising and opening into a ring of
sparks that fall a little as they fade. Still the chart's own green and still
thin strokes — no confetti, no emoji. Drawn across the whole chart rather than
at a point, because it is about the record and not about one square; that is
also what lets it work when the board is not drawn at all.

They fire on three kinds of win, and each is a different reason:
1. **the first call ever settled right** — the moment this either becomes a
   habit or does not, and there is exactly one of them;
2. **the leading call in a contested column** — the chart's `CALLED · 1ST`
   tag: the claim every hedge in that column was placed against;
3. **any win while calls are off** — because then nothing is drawn and nothing
   is announced, so this is the only thing that says it happened.

**No banner when off.** `wonCalls` (the toast stack) is only fed while
`predict` is true. With calls off the win is shown on the chart and nowhere
else, exactly as asked.

**The reminder** is the dot on the calls button: it means "a call came back
since you last looked", it survives the tab being closed (`callsSeenAt`), and
it clears when you open the panel. `settledAt` is stamped on a call when its
answer is *found* — not when it was due, since a tab opened a day late settles
yesterday's call.

`callColumns` / `isLeadingCall` moved to `utils.js`: the rule was inline in
the chart's draw loop, and the app needed the same answer at settling time.
Two copies of "which call was the claim" is two things that can disagree.

**Verified:** `test-calls.js` (who leads a column, and that a lone call never
does), `test-calls-render.js` §26 (a due call settles with the feature off,
`settledAt` survives the write, nothing is announced, the show cleans up).

---

## 9. Verify Codex's bug audit, fix what is real, delete the file

**Asked:** "bugsbycodex.md'ye iyice bak ve doğrula — oradaki bugları Codex
buldu, bug olup olmadıklarını test et, değerlendir, gerekiyorsa ve mantıklıysa
düzelt; düzelttikten sonra o md dosyasını sil."

**Status: done. All five were real. All five are fixed, each with a permanent
test watched failing against the old behaviour. `docs/bugsbycodex.md` is
deleted.**

Codex marked 1–3 "confirmed" and 4–5 "source-reviewed risks". Everything below
was re-run here rather than taken on trust.

| # | Codex's claim | Verified how | Verdict |
|---|---|---|---|
| 1 | Quick Switch adds one coin, opens another | Picked BNB from BTC/ETH/XRP/LTC | **Real.** List became `[…,BNB]`, chart showed **LTC Price** |
| 2 | Move headlines never load on a fresh tab | Seeded headlines on, news row off | **Real.** **0** requests to Blockchair or Hacker News |
| 3 | `S` hijacks a focused dropdown | Focused Number Format, pressed `s` | **Real.** Settings closed, focus fell to `BODY` |
| 4 | A portfolio refresh mid-flight is dropped | Held the price route open, added ETH inside the window | **Real.** 6s later: BTC priced, **ETH blank** |
| 5 | The news cache is trusted unvalidated | Hand-edited cache with a `javascript:` and an `http://` URL | **Real, with a severity correction** |

**On finding 5, Codex slightly overstated it and my own first test understated
it — both worth recording.** My first probe reported "not a bug"; it was a
false negative, because I had the storage key wrong (`crypto_chart_news_ticker`
rather than `crypto_chart_news_ticker_enabled`) so the row never rendered and
there was nothing to find. With the right key, both hostile URLs reach the DOM
as `href`s. But the `javascript:` one **does not execute when clicked** — the
link carries `target="_blank"` and MV3's CSP refuses that navigation, measured.
So it is not the "unsafe link" Codex implies; what is real is that the
HTTPS-only rule the fetchers enforce was simply absent on the way back in, and
a malformed item was handed to React unchecked. Low, and worth fixing anyway:
every other stored shape here has a sanitizer for exactly this reason.

**Changed:**
- `src/app.js` — `setCoinIndex` accepts a resolver so "add, then select" is
  read against the list as it *will* be; `startNewsTicker` runs for either
  consumer and both setting handlers go through it; `SELECT` joins the text
  fields in the shortcut guard; `fetchPortfolioPrices` remembers a refresh
  asked for mid-flight and runs it afterwards, and a run that is no longer the
  newest publishes nothing.
- `src/api.js` — `sanitizeNewsItems`, the same limits the fetchers apply,
  used wherever the cache is read.

**Tests, each watched failing first:** `test-polish-render.js` gains four
checks (quick switch opens what it added — fails with `LTC Price`; a focused
select keeps `S` — fails with `open false, focus BODY`; move headlines alone
loads the feed — fails with `0 requests`; a mid-refresh holding is priced —
fails with `no price for ETH`). `test-api.js` gains the `sanitizeNewsItems`
unit tests — without the function the suite throws `ReferenceError`.

**One judgement call I did not take:** `fetchPortfolioPrices` releases its
in-flight flag by assignment rather than in a `finally`, so a throw from an
unguarded await would strand it. I checked the two candidates
(`fetchErc20Balances`, `fetchAddressBalance`) and both swallow their own
errors, so it is not reachable today. Restructuring a 90-line async function to
harden a path nothing can currently take is a bigger diff than the bug
deserves — flagging it instead.

---

## 10. The optimization review: implement what earns its place, delete the file

**Asked:** "optsuggestbycodex.md'yi incele" → then "yapmayı uygun gördüğün
iyileştirmeleri yap ve bu optsuggestbycodex.md'yi sil."

**Status: done.** Five of the eleven suggestions are implemented, in the order
I argued for after checking the review's own numbers. `optsuggestbycodex.md` is
deleted.

**Every measurable claim in the review reproduced exactly** — `CryptoChart.render()`
at 1,528 lines, `Portfolio.render()` at 852, `renderPreferencesTab()` at 1,012,
23 source files at 26,958 lines, five unrelated updates causing five chart
renders, and the full-coverage sweep costing 19 root renders. It is a document
worth trusting.

**One thing it missed, and it matters to whoever implements #1:** the fallback
loop already carries `if (!this.needsCoinSweep()) break;`, which reads exactly
like the guard the finding asks for. It is not: it asks whether anything is
*watching* the ticker (`pageTicker || watchlist || topMovers`), not whether
there is anything to fetch. "Fixing" the bug by changing that condition would
break the feature check instead. Both are wanted, so both are now there.

### Done

| # | What | Measured before → after |
|---|---|---|
| 2 | Two theme objects built once, instead of one per render | 5 unrelated updates: **5 chart renders → 0** |
| 1 | The ticker's fallback loop walks only the coins the bulk sweep missed | full-coverage sweep: **19 root renders → 2**, time to ticker-ready **11,025ms → 2,992ms** |
| 4 | Widget answers commit once per frame instead of once per promise | up to 8 root updates per refresh → one per frame |
| 5 | The bulk sweep and the OHLC cache share an in-flight request per key | two concurrent readers of a cold key: 2 requests → 1 |
| 7 | A failed write spends the caches, cheapest first, and retries | a portfolio write into a full quota: **lost silently → kept** |

The ticker numbers are from the same probe and machine before and after; the
regression tests assert **counts**, never wall-clock, because a timing
threshold in CI measures the machine.

### Deliberately not done

- **#3, extract a `PageTicker` component.** The review puts this in P0 with the
  other two; I disagree with the priority, not the idea. Most of its benefit
  was the theme identity problem, which #2 fixed — the chart now renders **0**
  times during a full sweep. What is left is virtual-DOM work in a 1,528-line
  render, which is real but is a genuine refactor of the largest function in
  the project. Worth doing on its own, measured again first, not bundled here.
- **#6, split the big files.** Same reasoning, and the review says so itself:
  "the size problem is primarily review risk, not proven runtime cost".
- **#8–#10** — lazy script loading, the promo site's data-saver path, and a
  packaging script. The review gates #8 on a Chrome Performance trace, which is
  the right gate and one I have not run.
- **#11, the lint warnings.** Two are the `security/detect-non-literal-regexp`
  rule firing on `newsForCoins` / `headlinesForCoin`, where the input is a coin
  symbol from `SUGGESTED_COINS`. Suppressing a security rule to reach zero is
  how a real hit gets missed later.
- **Removing the outer `ThemeProvider`.** The review is right that it is
  redundant — nothing renders between it and the inner provider. But its cost
  is one context value that never changes, and it is styled-components' only
  fallback if anything ever renders outside `CryptoChart.render()`. No measured
  gain, a small tail risk: left alone.

### One judgement inside #4

The review offers one commit after `Promise.all` or a per-frame flush. One
commit is worse than it looks: the slowest provider would gate every card, so a
single endpoint on a retry backoff holds up seven that already answered. A
frame is the unit the eye can tell apart — answers landing together commit
together, a straggler still arrives on its own.

**Verified:** `npm --prefix tests run check` green. New regressions in
`test-polish-render.js` (a covered sweep publishes once; unrelated root state
never redraws the chart) and `test-storage.js` (a portfolio write survives a
full quota by spending the cheapest cache, and a cache write that does not fit
takes nothing else down with it). Each watched failing first: **19 root
renders**, **5 root / 5 chart**, and `a portfolio write survives a full quota`.

---

## 11. A flaky test found while verifying the optimization work

**Not asked for; found on the way.** After the optimization changes the full
check went red in the calls suite — seven checks in the "first call in a
contested column" block, reporting that none of the three seeded calls was
drawn.

**It was not the product.** Two wrong hypotheses were measured and discarded
before the right one: the window-placement `ceil` (deterministic either way,
three runs each) and the age of the fixture (a nine-minute-old fixture still
drew all three). The block also passed every time it was run on its own, and
drew 3, then 2, then 0 boxes across suite runs on unchanged source.

**What it actually was:** the block builds its calls from its own
`Date.now()`, but took the *module-level* `PRICES`, whose timestamps are fixed
when the file loads. The calls therefore sat as far into the future as the
suite had been running, and the board's reach is finite — so they drifted off
the right-hand edge. The four checks added in items 9 and 10 made the suite
long enough to cross that line. A fixture whose result depends on how long the
suite takes is reporting on the suite, not on the chart.

**Changed:** that block now builds a price series anchored to the same instant
as its calls (`tests/test-calls-render.js`). No product code was involved.

**Verified:** the suite passes standalone and under the full check (exit 0).

---

## 12. Calls tidied: a way back from the zoom, and three guards on the settings tab

**Asked:** "calls sistemine biraz daha çeki düzen verelim… sağ tarafta bir ayar
var, onda tıklanmayında artı eksiye direkt default moda hızlı dönüş gibi bişey
olmalı… ayarlar sekmesinin üzerine ilerleyen zamanlarda ne hata olabilir onun
dengesini kuralım."

**Status: done.**

### The way back from a zoomed board

The reach is held per range (`crypto_chart_board_zoom_<period>`) and outlives
the tab, so a board pushed out and left is still out a week later — and
clicking back was guesswork, because nothing on the strip said which notch was
the ordinary one.

- **The readout is the way home.** Pressing `±$3K` between the − and + returns
  `DEFAULT_BOARD_ZOOM`. It is where the eye already is when the question "how
  far does this reach?" is being asked, and it costs no extra furniture on a
  strip meant to be pointed at rather than operated.
- **Only while it leads somewhere.** At the default the group drops its `role`,
  its `tabindex`, its name and its underline — a button that cannot change
  anything is a promise the next click breaks. Measured: off the default it is
  `role=button`, tabbable, named, underlined at 0.5, reading ±$3K; one press
  → ±$250, stored zoom `1`, and all four of those gone.
- **The calls panel got the same action**, a `reset` beside its ± , shown on
  the same condition. Two controls for one thing that could not both undo it
  was the asymmetry worth removing.

### One product change that was really a trap

The underline began as a `<line>` and had to become a one-pixel `<rect>`. On
this chart **a line is the lattice**: three separate assertions collect lines
and divide consecutive ones to get the pitch, and a decorative 40px line at
y=21 lands in that set and halves the answer. It cost three red checks before
the cause was found. The two test sites that read rows now also require full
width, which is belt-and-braces — but the real fix is that a rect cannot be
mistaken for a gridline by anybody.

### Three guards on the settings tab

The groups at the foot of `settings-preferences.js` are a list of *names* —
which is what makes reordering the panel eight lines instead of forty, and also
what makes a typo invisible to everything except a person opening the tab.
None of these was broken; all three are one keystroke away and none announces
itself. Each was proved by breaking it on purpose:

| Guard | What it stops | Proved by |
|---|---|---|
| every grouped name exists | `sections[name]()` on undefined throws **inside render** — the whole tab goes blank rather than losing a row | `numberFormat` → `numberFormatt`: *"a group names a section that does not exist"* |
| every section is in a group | a setting built, kept in memory, never shown | dropping it from the list: *"a setting exists but is in no group"* |
| no section is placed twice | two copies that disagree about where they live | — |
| every handled letter key is in the "?" list | `CLAUDE.md` states this rule and nothing enforced it: an unadvertised key is one only its author can reach | removing `K`: *"handled but missing from the ? list"* |

Letters only for the key guard. Esc, the arrows and the digits are described in
the list in words rather than one chip each, and a mapping table for those
would rot faster than the thing it guards.

**Verified:** `npm --prefix tests run check` green (exit 0). Four new checks in
`test-calls-render.js` for the reset, the three guards in `test-settings.js`,
each watched failing first.

---

## 13. Store-ready: new copy, new captures, a real package

**Asked:** get this build ready for the Web Store — new English description
carrying the new features but **not** using the word "free" — take several
detailed screenshots of the current extension, update the GitHub README, build
both a zip and an unpacked package, then bring every `.md` in the repo up to
date with everything we have done.

**Status: done.**

### The word "free" is gone from the copy

Three places had it and all three are rewritten: the manifest's `description`,
the store summary mirrored in `STORE_ASSETS.md`, and the "100% FREE" block in
the detailed description. The hero screenshot's third pill said
"**Free**, no premium tier" and now says "**Nothing** leaves your device" — a
screenshot claiming a price spends the one line that could say something the
store's own Payments field cannot. The dashboard's Payments field still reads
"Free of charge", because that is a required setting and not marketing copy.

### The description

Rewritten around what the build actually is now: calls get the longest section,
then holdings, targets, compare, and depth-on-demand. **Zero coin names or
tickers anywhere in it** — measured — which matters more here than anywhere
else: both of this extension's rejections were Yellow Argon (keyword spam)
caused by coin lists in the description. ~5,100 characters of 16,000.

The disclaimer gained a sentence: calls are a way of scoring your own reading
of the market, nothing can be staked on them and they carry no value. That is
the same claim the code makes, and the store cares about it.

### The captures

Shot from the live extension against **real market data** (BTC ~$69.3K), which
is the house rule, through the existing pipeline: `scene-server.py` →
`scenes.html` → `store-frames.html`. Nine raw frames, five composed for the
store.

The `predict` scene was dead — it set `crypto_chart_predict_ahead`, a key that
stopped existing when the board's width became a drag, and its bands were
written when BTC was in the low sixties, so they sat off the window entirely.
It is now `calls`, plus a `calls-panel` scene whose store is copied from it so
the two can never drift.

Two capture facts, both found the hard way and both now written into
`SCREENSHOT_PLAN.md`:

- **The calls frame is shot on 1D.** With a board on the price scale stops
  fitting the data and becomes a window onto a fixed lattice, so a range wider
  than the window keeps the live price and clips the rest — the month spans
  ~$7.8K against a ~$5.3K window and drew as a vertical spike at the right-hand
  edge. It also carries one notch of zoom, or the day's low sits exactly on the
  window's floor and the line clips at the left. Both are the board behaving as
  designed; both read as rendering faults in a still image.
- **The hero shows only the top of the capture.** The frame crops at about
  430px, so the right range is whichever one puts the line where the frame can
  see it. This week sat flat and then spiked, which left the hero looking like
  an empty chart with a tick in the corner — 1W, 1M, 1Y and 1D were all shot
  before 1D won, and 1Y was rejected for a second reason: the year is *down*,
  and the search-result image should not lead with a loss.

Frame 2 is now the board rather than compare. The dashboard takes five, the
board is what this release is for, and the compare capture is kept for the site.

### The package

`scripts/package.sh` — dependency-free, and it builds from an **allowlist**
rather than zipping the tree, because the tree carries docs, tests, mockups,
promotional art and previous releases. It also reads `index.html` and checks
every file the page loads is present, so a new `src/` file nobody added to the
allowlist fails the build instead of shipping an extension that breaks for
everyone on the store rather than on the machine that built it.

Both forms, as asked: `assets/upload/pricetab-1.4.0/` to load unpacked and
`assets/upload/pricetab-1.4.0.zip` for the dashboard. **40 files.** The three
icons the manifest names, not the whole icon folder.

**Verified by running it**: the staged package — not the working tree — was
loaded in Chromium. 27 scripts, the chart drew against live data, all four
corner controls present, the tab title live, zero failed requests and zero page
errors.

### The docs

`README.md` gained a Calls section, `K` and `[` `]` in the shortcut table, and
a "Building the upload" step. Swept for staleness: `assets/mockups/README.md`
and `assets/screenshots/README.md` (frame 2), `STORE_ASSETS.md` (the summary),
`MARKETING_LAUNCH.md` (its one "free"), `SCREENSHOT_PLAN.md` (the set change
and the two capture notes), `CLAUDE.md` (the `scripts/` tree and what
`package.sh` guarantees), and the changelog's 1.4.0 heading.

**Left undone, and it is the one thing I would look at before submitting:** the
hero frame is the weakest of the five. The line is real and green, but half the
frame is empty chart, because the crop and this week's shape disagree. Worth
either re-shooting on a choppier day or shifting the hero composite's crop —
which is a change to `store-frames.html`, not to the extension.

---

## 14. The site brought up to date, and the docs put in folders

**Asked:** "web sitemizdeki verileri ve güncel olmayan şeyleri de güncelleyelim,
md'leri düzenleyelim ve yeniden klasörlere koyalım."

**Status: done.**

### The site

- **"Free" is gone from every visible surface** — three meta descriptions, the
  "Add to Chrome — Free" call to action, and the `100% free` chip. The chip now
  reads *No remote code*, chosen because that block's own comment says the
  chips must carry only what the three big zeros above them do not already say;
  price is not one of those things, and the store states it in its own field.
  Measured after: **zero** occurrences of "free" in the rendered text.
- **Calls has a card**, as 02 — the release is for it. The other cards moved
  down and all seven were renumbered in document order, after a first attempt
  where sequential replacements caught each other and produced 01, 02, 07, 03…
- **A claim that had drifted:** the page said 65 coins; `SUGGESTED_COINS` is
  **66**. Currencies (37) and widgets (11) were checked against the source at
  the same time and were right.
- The keyboard chips gained `K`.
- **Verified by rendering it:** seven cards in the right order, the chips and
  CTA as intended, no "free", no page errors.

### The docs, in folders

Split by **who the file is for**, not by topic — a file's subject drifts, but
"would this be published?" has one answer forever, and getting that wrong is
how working notes reach a public remote.

```
docs/
├── README.md     (new) the index
├── CHANGELOG.md  ·  PRIVACY.md      stayed: both are referenced from outside
├── product/      VISION, TODO, TODAY
├── store/        STORE_DESCRIPTION, STORE_ASSETS, SCREENSHOT_PLAN,
│                 MARKETING_LAUNCH, policies/
└── internal/     AGENT_RULES, AI_GUIDELINES, AI_TOOLING_RESEARCH,
                  MONETIZATION, agents/
```

**The dangerous half, and it was worth the care.** The internal files are
git-ignored *by path*, so moving them silently un-ignores them. Checked before
touching anything, and it turned up something worse than the move: three of
them — `docs/AI_TOOLING_RESEARCH.md`, `MONETIZATION.md` and
`BUSINESS_IDEAS.md` — were **not in `.gitignore` at all**. They were protected
only by this clone's `.git/info/exclude`, which no fresh clone has, while
`AGENT_RULES.md` §3.2 states they are git-ignored. On a repository whose
history is public, that is a live exposure and not a tidiness question.

So `.gitignore` now carries one directory rule, `docs/internal/`, plus the two
root files — and `tests/test-invariants.js`'s protected list was reduced to the
same single directory. Both were a list of individual paths, and a sixth file
dropped beside the others would have walked past both. Verified with
`git check-ignore -v` on every moved file: all covered, none tracked.

**Everything relinked:** 26 files rewritten, then every relative markdown link
in the repository resolved — **41 checked, 0 broken**. Seven were broken by the
move and repointed (`docs/product/TODO.md` and `VISION.md` linking to siblings
that are no longer siblings). One reference the text sweep could not see was
`path.join(ROOT, "docs", "AGENT_RULES.md")` in the invariants test, which
builds its path from segments — the test caught it itself on the next run,
which is the test doing exactly its job.

**Verified:** `npm --prefix tests run check` exit 0.

---

## 15. The store docs brought level with the build

**Asked:** "docs'ta store açıklamasını falan bi yenileyelim, şu anki
durumumuzla aynı duruma gelelim."

**Status: done.** Four things had fallen behind the code, and one of them was
a policy exposure rather than a tidiness problem.

### The one that mattered

**Calls and the gambling policy.** The compliance matrix carried a single line
— *"Gambling | COMPLIANT | No betting/gambling features"* — written before
calls existed. The extension now ships a feature a reviewer will read as
*predict the price and keep score*, and gambling services are explicitly
prohibited. That line is not an answer.

`PRICETAB_COMPLIANCE.md` now has a section that gives one, built on what the
code actually enforces rather than on intent: nothing is **staked** (no wager,
no entry cost, no counterparty), nothing is **won** (two counters in
`localStorage`, no currency, no leaderboard, no account, no way off the
device), and nothing can be **cashed out** (zero permissions, no payment path,
no wallet connection anywhere, no server that could hold a balance). It ends
with the four things that would break the position — a transferable score, a
leaderboard, syncing the record, or listing copy that frames a call as a bet —
so the next person knows where the edge is.

### The single-purpose text

It listed "the coin watchlist, time-period switching, currency display and
optional market-data panels" — written two features ago. Calls, holdings and
targets were simply absent, which leaves a reviewer to decide for themselves
whether a board and a portfolio belong in a price-chart extension. Rewritten so
every feature is named as a different way of reading the same data.

### Two instructions that had gone stale

- The pre-submit checklist said *"01-hero FIRST, then 02–06"*. There are five.
- The ZIP was built by a hand-written `zip -r …` naming the paths a second
  time. It is `./scripts/package.sh` now, which builds from an allowlist and
  cross-checks it against what `index.html` loads.
- `STORE_ASSETS.md` still told you to take screenshots by hand with Windows
  tools, `sips` or ImageMagick, and still warned that "the 1.3.0 set is stale".
  The 1.4.0 set is shot; the pipeline is documented at the top and the manual
  routes are labelled as the fallback they now are.

### And a guard, because this exact drift is what got the listing rejected

The store summary is written in three places — `manifest.json`,
`STORE_DESCRIPTION.md` and `STORE_ASSETS.md`. The **second** Yellow Argon
rejection came from a duplicate that had drifted: `STORE_ASSETS.md` still held
an old description with a coin list, and that was the copy someone submitted.
The rule that came out of it ("one canonical source") was written down and
never enforced.

`tests/test-invariants.js` now checks it: the summary must appear verbatim in
both docs, must be within the dashboard's 132 characters, and the detailed
description must contain no run of comma-separated tickers. Proved by breaking
each one — a drifted duplicate reports *"does not carry the manifest's summary
verbatim"*, and injecting `BTC, ETH, XRP` reports *"contains a ticker list …
Yellow Argon"*.

**Verified:** check exit 0; 41 relative links still resolve.

---

## 16. The last two root documents moved into `docs/internal/`

**Asked:** "bu ana dizindeki AI harici md'leri docs'ta yerleştir."

**Status: done, with one file deliberately left where it is.**

| Was | Now | Why |
|---|---|---|
| `MONETIZATION.md` | `docs/internal/MONETIZATION_PLAN.md` | The private pricing plan — the file whose own first line says never commit it |
| `BUSINESS_IDEAS.md` | `docs/internal/BUSINESS_IDEAS.md` | Working notes, same bucket |
| `README.md` | **stays at the root** | GitHub renders the root README as the repository's front page. Moved into `docs/`, the project lands on a bare file listing |

`CLAUDE.md`, `AGENTS.md` (a symlink to it) and `GEMINI.md` also stay: they are
the three doors an agent arrives through, and `test-invariants.js` checks each
still points at the rulebook.

**The name collision was real and worth resolving.** `docs/internal/` already
held a `MONETIZATION.md` — 383 lines of long-form strategy and roadmap, dated
July — while the root file was 96 lines of pricing plan dated August. Two
different documents with one name is how the wrong one gets read at the wrong
moment, so the incoming file is `MONETIZATION_PLAN.md` and each now opens by
saying which of the two it is. Nothing was merged: one is where the money
could come from, the other is what it would cost.

**A stale list caught on the way.** `scripts/checkpoint.sh` named its
git-ignored extras file by file — and still said `docs/agents`, which stopped
existing when the journals moved. A checkpoint had quietly stopped capturing
them. It names `docs/internal` now, which is the same fix already applied to
`.gitignore` and to the invariants test: a directory cannot go stale when a
seventh file is added.

**Verified:** `git check-ignore -v` on both moved files (covered by the
`docs/internal/` rule, and no longer only by this clone's
`.git/info/exclude`); `git ls-files docs/internal` empty; `bash -n` and a live
`checkpoint.sh list`; 41 relative links resolve; check exit 0.

---

## Departures, in one place

Two, both stated above and neither silent:

1. **Item 3** — the board-side drag limit stays at 2 squares. At 1 there is
   nothing callable left; measured.
2. **Item 5** — the news filter is a three-way setting, not a holder/trader
   preset. Wiring it into `APP_MODES` needs the mode-recognition test
   revisited, which is its own piece.

---

## One bug found on the way

`sanitizeCalls` (`storage.js`) rebuilds a stored call field by field, so
`settledAt` was being dropped on the way to localStorage — the unseen-calls
dot would have lit for one session and never again. Caught by the new render
test, not by reading the code.

---

## Where this work lives

Everything above is on branch `worktree-calls-overhaul`, in
`.claude/worktrees/calls-overhaul/` — **not** in the main checkout, which is
why nothing appears to have changed there. It is uncommitted, because
`docs/internal/AGENT_RULES.md` §3.1 reserves every writing git command for you.

To bring it across:

```bash
rsync -a --exclude '.git' --exclude 'node_modules' \
  .claude/worktrees/calls-overhaul/ ./
```

`npm --prefix tests run check` is green there: 0 lint errors, 10 warnings
(9 pre-existing, 1 new and of the same kind as the one beside it), and every
suite passing including the four real-Chromium ones.
