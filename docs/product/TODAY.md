# Today — August 21, 2026

This file is **the list of what was asked, one item per request, in the order
it was asked** — and nothing else. Finished items are removed rather than
archived: the account of what was done lives in `docs/CHANGELOG.md` for the
user-facing half and in `docs/internal/agents/<you>/JOURNAL.md` for the rest.

**Reviewed, then built, on 20 August 2026.** Every item was first re-verified
against the code and the live endpoints rather than against what this file said
last time, and then implemented. Items 2, 3, 4, 5, 7 and 8, plus the one live
defect item 9's research turned up, are **done and removed** — they are in
`docs/CHANGELOG.md` and the journal now, with a one-line pointer at the foot of
this file. What is left is item 1 (a decision that is yours), item 6 (a git
command reserved for you), and item 9, which is a research finding rather than
a task and is kept because it is the standing reason not to build buy points.

**21 August.** Two defects reported in use — "turn on full sources" appearing
to do nothing, and advertising reaching the news panel — were fixed and are
removed, along with Blockchair as a news source. See the foot of this file.
Items 1, 6 and 9 are unchanged and still the only things standing.

`npm --prefix tests run check` — green, exit 0, after every change.

Status is one of: **open** (built, waiting on a decision that is yours),
**remaining** (built, with a named tail still to do), **not started**.

---

## 1. The board-side drag limit: you asked for 1 square, it is 2

**Asked:** "sürüklediğimiz bar şu an iki kare solda olacak şekilde oluyor, onu
hem min 1 sol olacak şekilde ve 1 sağ olacak şekilde yenilemeliyiz."

**Status: open — the code now says what it means, and the one remaining
question is whether you want the behaviour changed as well.**

**What was done.** The constant was counted in the wrong unit, which is why
this read as a refusal. `MIN_BOARD_CELLS = 2` (pitches) is now
`MIN_BOARD_CALLABLE = 1` (squares you can call on) plus a named
`NOW_PART_COLUMN`, and each clamp adds the part-column itself. The slider on
the "now" handle announces callable squares too — it used to say "2 squares of
board" at a minimum where exactly one of them could be pointed at, which was
the same off-by-a-part-column in the one place a person actually hears the
number. **Nothing on screen moved**: the limits are the same pixels.

**What is still yours to decide.** Whether the far end should go to one
*pitch* — half a square of board, with nothing on it that can be clicked. It is
one line. The measurement stands: at 1280×800 with a 64.5px pitch, a one-pitch
board leaves **zero** callable squares, because the lattice is anchored to the
clock, so "now" falls inside a column and `cellAt` refuses that column.

---

## 6. Three worktrees that look superseded

**Status: open — the list is exact, and removing one is a writing git command,
which `docs/internal/AGENT_RULES.md` §3.1 reserves for you.**

```
Pricetab.worktrees/optimize-calls-system-implementation   1f0db11  [agents/optimize-calls-system-implementation]
Pricetab.worktrees/what-are-you-doing                     1f0db11  [agents/what-are-you-doing]
.claude/worktrees/calls-overhaul                          a03e43c  [worktree-calls-overhaul]
```

`main` is at `9c29d20`, two commits past `a03e43c` and already carrying that
work; the other two share one older commit. They are almost certainly dead.
`git -C <path> status --short` will say whether one is holding uncommitted
work — that is the only thing here worth more than the branch already in
`main`.

---

## 9. The algorithm: what the research says, and what was built because of it

**Asked:** "bir algoritma bul bana, RSI vs araştır, neye yatırım yapılırsa o
mantıklı olur ve alma noktası satma noktası falan olsa harika olur… tamamı ile
algoritmik bir analizle olmalı, AI değil."

**Status: researched twice, and the one part of it that was a defect in
shipping code has been fixed. Kept in this file because it is the standing
reason not to build buy points, and because whoever proposes them next should
have to read it first.**

### 9.1 What was measured

| | first round | second round |
|---|---|---|
| candles | 721 per asset, 2 years | **21,669 daily closes**, up to 11 years |
| assets | 3 | **8** — BTC, ETH, LTC, LINK, ADA, DOGE, SOL, XRP |
| rules | 5 | **9** |
| source | Kraken daily (capped at 720) | `api.exchange.coinbase.com` daily, paged |
| robustness | none | out-of-sample, fee, parameter, multiple-testing |

BTC reaches back to 2015-07-20, so the window contains the 2018 bear market,
the 2021 top and the 2022 collapse rather than one bull leg. The source needs
**no new remote host**: `api.exchange.coinbase.com` is already in
`ALLOWED_HOSTS` and already serves the crosshair's candles. Long or flat,
textbook parameters chosen before the data was looked at, signal decided on day
*t*'s close and earning day *t+1*'s return, 0.5% per round trip.

### 9.2 The full-history table

Median across the eight coins, whole history each, 0.5% round trip:

| rule | median return | median Sharpe | median max drawdown | trades | beat holding |
|---|---|---|---|---|---|
| **Buy and hold** | **+330%** | 0.71 | **92%** | 8 | — |
| RSI 30/70 | +54% | 0.39 | 78% | 175 | 4 of 8 |
| RSI 20/80 | +21% | 0.27 | **36%** | 32 | 2 of 8 |
| SMA 50/200 cross | +119% | 0.53 | 76% | 112 | 3 of 8 |
| Above SMA 200 | +65% | 0.47 | 81% | 472 | 4 of 8 |
| MACD cross | +590% | 0.68 | 83% | 1,521 | 4 of 8 |
| Bollinger 20/2 | −50% | 0.14 | 82% | 444 | 2 of 8 |
| Momentum 90d | +2% | 0.29 | 79% | 908 | 4 of 8 |
| Donchian 20/10 | +350% | **0.74** | 59% | 873 | 5 of 8 |

Read alone that table argues *for* signals. Four tests say otherwise.

### 9.3 The four tests

**1. Out of sample.** Split at 2021-06-01, ranked by median Sharpe in each half:

| rule | rank 2015–2021 | rank 2021–2026 |
|---|---|---|
| MACD cross | **1** | 5 |
| Above SMA 200 | 2 | 2 |
| Buy and hold | 3 | 4 |
| SMA 50/200 cross | 4 | **8** |
| Donchian 20/10 | 5 | **1** |

Spearman rank correlation between the halves: **+0.42**.

**2. Fees.** Median return as the round trip rises: MACD +1006% → **+343%**,
Momentum 90d +26% → **−17%**, buy and hold +331% → +329%. Two thirds of MACD's
headline is the difference between a fee nobody pays and one everybody pays.

**3. Parameters.** Donchian's median return across neighbouring lookbacks:
10/5 +366%, 15/8 **+1175%**, 20/10 +453%, 25/12 +398%, 30/15 +445%, 40/20
+505%, 55/20 +259%. A 4.5× spread across a choice nobody can justify in advance.

**4. Multiple testing — the one that ends it.** Seventy permutation tests
(8 coins × 5 conditions × 2 horizons, 2,000 draws each): **7 clear raw p<0.05
where chance gives about 4, and 0 survive Holm–Bonferroni.** The two smallest
disagree in sign — BTC after RSI>70 is +10.2% over 30 days (n=87), XRP after
the same is −12.2% (n=20). A rule whose sign depends on which coin you ran it
on is not a rule. The published literature lands in the same place once
data-snooping controls are applied.

### 9.4 The one effect that survived

**Every rule cuts the fall; almost none pays for it.** Cuts the worst drawdown
vs holding: **59 of 64** rule × coin pairs. Beats holding on return: **28 of
64** — a coin flip. Buy and hold's worst fall runs **72% to 96%** per coin.
These are risk statements, not buy points.

### 9.5 The defect this found in shipping code — **fixed**

`calculateRSI` samples the visible series to ~50 points, so "RSI 14" spans 16
minutes on 1H and 3.5 years on ALL. Measured on live BTC at one instant, the
six ranges read **63.8 / 63.9 / 82.2 / 80.9 / 37.8 / 54.6** against **80.5**
for RSI 14 on daily closes — a 43-point spread on the same coin at the same
moment. The bar's ends said *Oversold* and *Overbought*, words that belong to
the daily RSI; and counting episodes over the 21,669 closes, the 30 days after
RSI 14 crosses above 70 beat the coin's ordinary month on **6 of 8** coins
(BTC +7.5pp, n=87, and +7.1pp / +2.0pp in the two halves separately).

Fixed: the two words are gone, the ends say `0` and `100`, and the bar's
green→amber→red ramp went with them — leaving the traffic light would have
moved the claim rather than dropped it. The widget's description in Settings
now says what the number is instead of what it means.

### 9.6 What the honest panel could afford to say

One keyless Kraken request returns 721 daily candles (`interval=1440`, capped).
Inside that window: **RSI < 30 gives 4 to 13 episodes, RSI > 70 gives 3 to 9,
RSI < 20 gives 1 or 2.** So on the data the app can get cheaply, a base-rate
panel's honest output is *"this has happened five times, which is not enough to
say anything"* for most conditions, most of the time. That is the
specification, not a reason to abandon it: the version worth building is one
whose commonest answer is *no different from usual*, designed so that answer
reads as the feature working.

Deeper history, costed: paging `api.exchange.coinbase.com` back to 2015 took
**17 requests, 4.7 seconds and 237 KB** for BTC's 4,050 closes, on an
already-allowed host — roughly 97 KB per coin in `localStorage`, which is fine
for the two or three coins someone actually studies and not for 81.

### 9.7 The standing recommendation

1. ~~Fix the RSI label~~ — **done, 20 August** (9.5).
2. **If a panel is built, build the base-rate one** — state, count, and what
   followed, with the sample size beside every number. Never a win rate without
   its denominator: in a two-year window these conditions fire three to nine
   times, so "100% win rate" is a sample of one with a percentage sign on it.
3. **Drawdown is the honest thing to put next to a coin** (9.4), and it needs
   no new data — the worst fall in the visible window is already in the series
   the chart holds.
4. **Do not build buy points and sell points.** Not on taste — on 9.3.
5. **Do not predict a price.** The board already lets someone say where they
   think it goes and scores them on it, which is the truthful version of that
   feature and is already shipped.

**And the compliance reason, which is not taste either.**
`docs/store/policies/` bans gambling outright (Grey Copper), and calls already
needed a written defence in `PRICETAB_COMPLIANCE.md` — that defence rests on
*nothing staked, nothing won, nothing cashed out*, and a buy point does not sit
inside it. It would also move the extension from **crypto price charts**, its
declared single purpose, to investment advice, in front of a reviewer already
reading a scoring feature carefully. If it is ever built,
`PRICETAB_COMPLIANCE.md` needs its section written **before** submission.

### 9.7b Re-asked 22 Aug 2026, and re-measured rather than re-argued

**Asked again:** "portföyde RSI çizgileri vs… traderlar ne kullanıyor… alım
zamanı satım zamanı… algoritmik al-sat sinyali… en güvenilir algoritmik
kaynakları araştır ve extension'a ekleyelim."

Two new things, neither of which moves the conclusion — both of which harden it.

**1. The literature now says it independently.** A study of BTC/USDT and
ETH/USDT from 17 Aug 2017 to 31 Oct 2023 tested EMA crossover, RSI, Bollinger
and MACD under White's reality check and a stepwise test, with 0.1% slippage
and 0.03% commission, split out of sample at 20 Dec 2021: *"previously
profitable technical approaches, observed prior to December 2021, generally
failed to generate profits during the subsequent out-of-sample period"* and
*"it is difficult to choose specialized trading strategies with out-of-sample
profitability"*. That is 9.3's permutation result, reached by a different
method on different data by people with no stake in this repository.

**2. The textbook labels are wrong in the direction that matters, live.**
Re-run on 22 Aug against `api.exchange.coinbase.com` daily closes (episodes =
the first day of each run, forward horizon 30 days, median and up-rate against
each coin's own ordinary 30 days):

| coin | closes | after RSI>70 ("sell") | after RSI<30 ("buy") | ordinary 30d |
|---|---:|---|---|---|
| BTC | 4,053 | n=92 · **+10.4%** · up 71% | n=40 · +4.3% · up 60% | +2.9% · up 57% |
| ETH | 3,748 | n=86 · +1.8% · up 52% | n=43 · **−5.4%** · up 35% | +1.5% · up 53% |
| SOL | 1,894 | n=31 · **+6.0%** · up 55% | n=19 · **−5.8%** · up 37% | −1.0% · up 48% |
| LINK | 2,615 | n=45 · **+5.0%** · up 60% | n=22 · +0.5% · up 50% | +0.4% · up 51% |
| DOGE | 1,908 | n=28 · −7.9% · up 46% | n=29 · +1.8% · up 55% | −4.2% · up 41% |
| XRP | 1,138 | n=9 · −5.2% · up 33% | n=11 · −0.4% · up 45% | −2.8% · up 42% |

**"Overbought" beat the coin's ordinary month on four of six**, and on BTC by
7.5 percentage points over 92 episodes. **"Oversold" was worse than ordinary on
two of six**, including ETH by 6.9pp over 43 episodes. The sign flips by coin,
which is 9.3's finding again: a rule whose direction depends on which coin you
ran it on is not a rule. And the smallest cells are n=9 and n=11 — over
**eleven years**. On the 721 candles the app can fetch cheaply it is 3 to 9,
exactly as 9.6 said.

**3. What traders actually use, and the split that matters.** The retail set is
RSI, EMA, MACD, Bollinger and volume profile. The reported institutional set is
different: roughly 78% use technical analysis, but primarily **volume-based** —
VWAP, volume profile, order flow — alongside fundamentals, and the 200-day
moving average as a regime line rather than as an entry. That distinction is
useful here: VWAP is not a prediction, it is **a price that happened**, and the
candles this app already fetches from `api.exchange.coinbase.com` carry the
volume to compute it. A reference line saying "the volume-weighted average of
this window is $X, you are 4% above it" claims nothing about tomorrow.

**Recommendation unchanged, and now with a shape.** 9.7.4 still holds: no buy
points, no sell points. What is buildable and true — **three of the four are
now built**:

1. ~~**The base-rate panel**~~ — **built 22 Aug**, `src/baserates.js`, opened
   with "B". 9.6's spec exactly: state, episode count, what followed, and the
   sample size beside every figure at almost the same weight. `edge` is
   suppressed under `BASE_RATE_MIN_EPISODES` (12), so the panel's most
   spectacular row on live BTC — RSI>80, +15.0% median, up 90% — is the one it
   refuses to draw a comparison from, because n=10. `dailyRsi` was verified
   against an independent implementation on 1,726 real values with a worst
   disagreement of **0.00e+0**. Cost measured in a browser: **0 requests before
   the panel is opened, 7 after.**
2. ~~**Drawdown in the portfolio**~~ — **built 22 Aug**, `maxDrawdown` in
   `portfolio.js`, shown as "Worst fall" beside the other stats. Peak-to-trough
   inside the window on screen, from a series already in memory; a series that
   only rose reports nothing rather than "0%".
3. **VWAP as a factual reference** — still open. What the professionals in (3)
   actually read, and a statement about the past.
4. ~~**An alert on the portfolio total**~~ — **built 22 Aug**, a third alert
   `kind`. "Tell me when what I hold is worth less than X" is about the
   person's own money and needs no claim about the market at all. Checked
   **live only**, and the panel says so: the other two kinds look back through
   a week of candles, and a total cannot do that honestly because the amounts
   held are only known as they are now — a holding added yesterday would be
   backdated into last week's total and the app would announce a crossing that
   never happened.

### 9.8 Where the working is

The eight price files, the rule library, the backtester and the four robustness
scripts are throwaway probes under `AGENT_RULES.md` §5 and are **not in the
repository**. Everything needed to re-derive every number above is in 9.1 and
9.6. If you want them kept, say so and they go to
`docs/internal/research/algo-signals/`, which is git-ignored as a whole
directory — about 300 lines of Python and 3 MB of candles.

---

## Departures still standing

1. **Item 1** — the board-side minimum stays at one *callable* square, which is
   two pitches. The constant now says so in the unit you asked in. Going to one
   pitch is still available and still leaves nothing to click.
2. **Item 9** — no buy point, no sell point, no predicted price. Seventy tests
   behind it, none of which survives a multiple-testing correction.

---

## Done and removed on 21 August

- **Advertising in the news.** Asked as a requirement, not a preference, so
  over-filtering was made the acceptable failure. Measured first: CoinJournal
  was running 5 ads in 20 stories and the existing title regex caught 0 of
  them. The filter now reads the outlet's own filing — `categories_exclude` on
  the two WordPress sources, a `/press-releases/` path, a `dc:creator` naming a
  wire — with the regex demoted to last. One shared `isPromoNews` predicate, so
  the panel, the ticker and the move archive cannot disagree.
- **Blockchair dropped as a news source.** Five days stale, 7 of 10 items not
  in English despite asking for `language(en)`. Kept for the "what happened
  here?" archive, where nothing else reaches back years, and for address
  balances. A fresh install now starts on Hacker News alone — stated and
  accepted.
- **"Turn on full sources".** Three faults, not one: the post-grant refetch was
  dropped whenever another news request was in flight; `loading` was
  `newsItems.length === 0`, so a finished-but-empty fetch showed "Fetching
  headlines…" for ever; and the permission was checked for all six origins at
  once, so revoking one read as revoking all. All three proved by restoring the
  defect and watching the new tests fail.
- **`moveNews` vs `moveHeadlines` — investigated, not a duplication.** Two
  separate features (chart marks with an archive card; a headline line under
  the price). Left alone.

---

## 10. The portfolio: what could be better

**Asked:** "portföy kısmına yapılabilecek iyileştirmeleri ve özellik
güncellemesi ne yapabiliriz onu araştıralım." Then, on the list that came
back: "sırayla."

**Status: remaining — the four things that were wrong are fixed and covered;
the feature ideas below are not started.**

The research found three defects before it found a single improvement, which
is why the order ran the way it did.

**10.1 The value chart summed series by position.** `buildPortfolioParts`
trimmed every history to the shortest and added them index for index. That is
only correct while two series are sampled at the same rate, and they routinely
are not. Measured against the live API on 22 Aug: Coinbase's `period=all`
spaces its points across each coin's own lifetime — BTC 351 points **13.19
days** apart, SUI 332 at **3.64** — so a BTC+SUI portfolio added BTC's
2014-08-18 price to SUI's 2023-05-04 price at the same x and took its dates
from whichever holding happened to be first in the array. Kraken-routed coins
(XMR, PI, USDE, XAUT, OKB, MNT, and anything the runtime failover has moved)
match Coinbase on *no* range: 60/96/168/180 points against 359/300/306/311, so
BTC + XMR on a day range summed 7.7 hours of BTC with 24 hours of XMR.
`benchmarkPct` inherited it and was the loudest symptom — it read BTC as
**+15,839.5%** where BTC did **+190.2%** over the window on screen, a "vs BTC"
gap out by about 15,650 percentage points.

Now: the window is the **intersection**, the grid is the densest series' own
timestamps inside it, and a sparse series **holds its last quote** instead of
being interpolated. `tests/test-portfolio.js` covers it; with the old
derivation restored the new case fails at `[10,20,30]` against `[20,25,30]`.

**10.2 A cost basis had no currency.** `paid` and `received` were bare
numbers, so switching the display currency re-read every one of them in the
new one: 15,000 USD became 15,000 EUR, and the row P/L, the headline
Unrealized, the chart's COST line and the CSV's own `All amounts in EUR`
header all repeated it. They are stamped at entry now, and anything in a
different currency is **set aside rather than converted** — shown in its own
currency, named on the row and in a note, and out of every total. Converting
at today's rate was considered and rejected: it states a gain that moves on
days the purchase did not. A lot with no currency is one recorded before the
field existed and is read as "whatever is on screen", which is how it always
behaved — the alternative is inventing a currency for someone's data. Proved
by reverting the filter and watching the CSV total go from 10,000 to 19,000.

**10.3 The total and the change beside it covered different portfolios.** The
header prints every holding; the percentage next to it came from the chart,
which draws the twelve biggest and silently drops anything no exchange quotes
a series for. `chartCoverage` now names the count, the share of value, the
coins it cannot draw and why. `test-polish-render.js` §13, with stETH priced
and refused a history, which is the live shape.

**10.4 Nothing threw data away with a way back.** Removing a holding took its
purchases and its recorded sales with it; Import replaced the whole list. Both
were one click, no confirmation, no undo, on the one screen holding numbers
that exist nowhere else. Both now snapshot the previous list and offer it back
through the same bar `alerts.js` uses for a removed target. §12 asserts the
*records* come back, not just the coin — a restore with an empty lot list
looks identical on the row and would have eaten the basis.

**What was found and deliberately not built.** In rough order of value:
a concentration note ("62% is in one coin"), which is one line off data
`donutSlices` already has and is still open in `TODO.md`; realized P/L for the
current tax year, one filter over `sales`; merge-instead-of-replace on import;
a cost-basis method choice (FIFO/LIFO/HIFO) for the report, which is a
reporting method and not the country-specific tax computation `TODO.md`
declined; and folding `matches()` into `quickSwitchMatches`, which is the
third copy of coin search and the reason the four tokens `sanitizePortfolio`
accepts but `SUGGESTED_COINS` omits (STETH, WBETH, FDUSD, TUSD) can be added
by watching an address and never by hand. Smaller: histories are loaded once
per coins|currency|period signature and never refreshed while the view is
open, so the chart's last point stands still under a total that moves every
60s; `donutSlices` runs twice per render.

**A stale claim, not a missing feature.** `CLAUDE.md`, this file's Item 7 and
a comment in `app.js`'s `newsWanted` all describe a headline strip in the
portfolio. There is no `renderNews` in `src/`. `test-polish-render.js` §10
says why in its own first line — *"The panel replaced a strip inside the
portfolio"* — so the strip was superseded, not lost. All three claims are
corrected rather than the feature rebuilt.

---

## 11. Two errors from the extension console

**Asked:** pasted from `chrome://newtab` — *"Unchecked runtime.lastError: Only
permissions specified in the manifest may be requested"* and a CORS block on
`coinbase.com/api/v2/prices/BTC-USD/historic?period=hour`.

**Status: remaining — the code defect is fixed; one of the two is not a bug
and one needs a reload that is yours to do.**

**The CORS block is the failover working.** Coinbase sends
`Access-Control-Allow-Origin` on everything it serves, successes and 404s
alike, so a response without it did not come from the API. `noteProviderFailure`
sends that coin to Kraken for the rest of the tab and the chart draws. Nothing
to fix — but it does mean the machine that produced this console is being
served by Kraken, which is exactly the mixed-sampling case §10.1 was about.

**The permission error has two halves.** The origins asked for are the six in
`NEWS_SOURCE_ORIGINS`, and all six are in `manifest.json` — but
`optional_host_permissions` was added in `8599cc3`, the current HEAD, and an
unpacked extension keeps the manifest it was loaded with. **Reload PriceTab in
`chrome://extensions` and the refusal goes.** What was a real defect is that
Chrome called it *unchecked*: every callback said
`Boolean(granted) && !chrome.runtime.lastError`, and `&&` short-circuits — on
a refusal `granted` is `undefined`, so the right-hand side never ran and the
one line written to check the error never read it. `readGranted` in `news.js`
reads it first, unconditionally, in all three callbacks.

---

## 12. A general improvement pass, and what the sector is doing

**Asked:** "genel bir iyileştirme çalışması yapalım. Ve özellik eklemeleri
düşünelim araştıralım sektördeki yakınları."

**Status: remaining — two measured defects fixed and covered; the feature
findings below are research, not tasks.**

### 12.1 What a new tab actually costs (measured, throwaway probes)

Real Chromium, network stubbed, defaults, nothing typed:

| | |
|---|---|
| chart on screen | **~55 ms** (painted from the persisted cache) |
| requests, cold install | **10** |
| requests, second tab 15 s later | 0 |
| coin switch | 7 (spot + hour + the five prefetched ranges) |
| range switch | **0** — the prefetch does its job |
| localStorage | 97.5 KB in 4 keys, 88 KB of it the price cache |
| shipped zip | 462 KB at 1.4.0, against 232 KB at 1.3.0 |

Two things were checked and found **not** broken, having first looked broken in
a bad probe: the arrow keys and 1–6 work on a tab nobody has clicked, and the
Fear & Greed / market widgets are properly cached across a coin switch. Both
early readings were the stub's fault — an invalid widget shape throws in the
fetcher, so nothing is cached and every call looks like a miss.

### 12.2 Seven seconds of blank tab behind a blocked API — fixed

The console pasted in item 11 was the clue. `fetchWithRetry` climbs 1s → 2s →
4s before giving up, which is right for a 500 or a 429 — the server answered,
and waiting is how you let it recover. It was also being spent on a
`TypeError`, which means *no response arrived at all*: a CORS wall, a region
block, something in front of the API. That answers identically four seconds
later, and every price request here can fail over to Kraken.

Measured in a real browser with Coinbase refusing everything:

| | before | after |
|---|---|---|
| price line on screen | **7,131 ms** | **1,063 ms** |
| Coinbase attempts before failover | 8 | 4 |

For those seven seconds the tab read `BTC PRICE` with nothing under it — no
price, no chart, no error. `NETWORK_ERROR_RETRIES = 1` keeps one retry, because
a real blip does recover inside a second; the second and third were just the
wall again. `tests/test-api.js` asserts the mechanism (2 calls and 1s of
backoff for a `TypeError`, 4 and 7s for a 5xx), proved by restoring the old cap.

### 12.3 One 30-second TTL for every range — fixed

`CACHE_TTL` covered spot and every history series alike, so a **year** chart was
revalidated on every new tab and every coin switch. The file already knew
better one screen up: `WIDGET_CACHE_TTL` gives Fear & Greed an hour and open
interest five minutes.

Measured point spacing on the live API (22 Aug): hour ~10s, day ~4.8m, week
~33m, month ~2.4h, year ~1.19d, all ~13.2d. Each `HISTORY_TTL` is one point's
worth of that series' own time, capped at six hours, with the 1H range keeping
the 30s floor.

| tab opened | before | after |
|---|---|---|
| 15 s later | 0 | 0 |
| 2 min later | 8 | **3** |
| 10 min later | 9 | **5** |
| 45 min later | 9 | **6** |

Time to chart is unchanged (~60 ms) — this was never a speed problem on
screen. What it saves is load on an API that is already refusing some people.

### 12.4 The sector, re-checked (22 Aug 2026)

`MONETIZATION.md` §2b was researched July 2026 and says to re-verify. Current
Chrome Web Store figures:

| | users | rating | what it has |
|---|---|---|---|
| **ChartsTab** (closest) | **1,000** | 5.0 (99) | 500+ Binance pairs, sparklines, a search box, a floating widget on any page — and asks to "access website content" |
| Crypto Pulse | 127 | 5.0 (2) | 3,000+ coins, metals, weather/notes/tasks/calculator, RSS. **56 MB**. Collects location + user activity |
| Crypto Price Tracker | 58 | 3.8 (13) | 10,000+ coins, custom contract addresses. Handles PII **and financial information** |

**The headline finding contradicts `TODO.md`'s standing assumption.** Coin
coverage is listed there as "our biggest funnel gap" — but the extension with
10,000 coins has **58 users** and the one with 3,000 has **127**, while the
one that wins the category carries **500 pairs** and is otherwise simpler than
PriceTab. Coverage is not what sells this category. It is still worth having
for the *portfolio*, where you cannot track what you do not support — that is
a retention argument, not an acquisition one, and the roadmap should say so.

**The search box is settled, and the answer is no.** Since Chrome 27 an
extension new-tab page cannot take focus from the omnibox, so the address bar
is still where typing goes; extensions that fought this are what the
long-standing complaints are about. ChartsTab's search box is a redundancy,
not a feature we lack.

**Chrome's new-tab-hijack block does not touch us.** The August 2026 change
(`kBlockDseNtpOverrideExtensionsOnUnmanagedDevices`) blocks *policy-installed*
extensions from overriding the new tab on unmanaged devices; user-installed
Web Store extensions are explicitly unaffected. Not a risk. Not yet in stable.

**PriceTab does not appear in any of these searches.** That is consistent with
`TODO.md`'s own reading — installs are the bottleneck and the local build is
ahead of the store — and it is the finding no feature fixes.

### 12.5 Features worth considering, in order of what the evidence supports

Nothing here is started.

1. **Nothing from the competitors is missing.** Alerts, portfolio, cost basis,
   charts, multi-currency, themes — PriceTab has all of it and more. The
   calls board has no equivalent anywhere in the category.
2. The two things ChartsTab has that we do not both cost the promise: the
   floating widget needs `content_scripts` on every site, and the search box
   is answered above.
3. **Coverage, reframed as a portfolio feature.** `SUGGESTED_COINS` is 81 and
   `sanitizePortfolio` already accepts a wider set. The Coinlore price-only
   tier in `TODO.md` §3.3 is the cheapest version and needs no new host.
4. Smaller, and from the portfolio pass in item 10: the concentration note,
   realized P/L for the current tax year, merge-on-import, FIFO/LIFO/HIFO for
   the report.
5. **Standing debt, unchanged:** `app.js` 5,541 lines and `chart.js` 5,176
   against a ~800 guideline. Their styled-components are already split out, so
   the next cut is behavioural and genuinely risky.

---

## Done and removed on 20 August

One line each, so the next session knows where they went. The record itself is
`docs/CHANGELOG.md` and `docs/internal/agents/claude/JOURNAL.md`.

- **Item 2 — the news filter in the app modes.** Wired into Holder
  (`newsFilter: "portfolio"`), the only mode that turns the headline row on.
  A new guard in `tests/test-settings.js` asserts every setting a mode names
  has a handler in `handleAppMode` *and* appears in the snapshot
  `activeAppMode` compares against — both proved by deleting the line and
  watching it fail. This file's old claim that the change risked making two
  modes indistinguishable was backwards: naming a setting narrows recognition,
  it cannot broaden it.
- **Item 3 — the two missing tests.** `test-polish-render.js` §1 now audits
  every button for an explicit `type` across all six surfaces, with the search
  box typed into first so the suggestion chips are actually on the page — they
  are only rendered on demand, and the audit had never seen them. §9 asserts
  that clicking a suggestion adds exactly one coin, and clicks a chip *below*
  the top one: click the top one and the stray submit adds the same coin twice,
  so the list grows by one and the test passes while the defect is live. Both
  proved by restoring the `.attrs(() => …)` form and watching them fail.
- **Item 4 — the `attrs` trap.** Now in `CLAUDE.md` beside the other
  React-16-era constraints. The new audit found **19 more buttons** that never
  had `attrs` at all: counted at `9c29d20`, all **52** styled buttons in `src/`
  defaulted to `submit`, not the 34 this file recorded. All 52 now say what
  they are.
- **Item 5 — the two guards on address watching.** `tests/sweep-erc20.js` asks
  every contract in `ERC20_TOKENS` for its own symbol and decimals (47
  contracts, one request, 155ms — run by hand, deliberately not in `check`,
  which has to stay offline). `test-portfolio.js` asserts a holding in stETH,
  wBETH, FDUSD or TUSD survives a save and reload, proved by restoring the old
  whitelist. The sweep also caught that the table holds **47** tokens, not the
  48 written in three places — corrected in all three.
- **Item 7 — headlines in the portfolio.** A strip below the holdings,
  narrowed to the coins in the list, with a named empty state so a quiet week
  cannot look like a broken feature. Opening the portfolio is now a third
  consumer of the shared feed, through one `newsWanted` predicate that the
  loader and the poller both ask — they were two copies of a condition that had
  already disagreed once.
- **Item 8 — "what happened here?"** Ships behind Settings → Chart → What
  Happened Here, off by default. Marks at the unusual moves
  (`findUnusualMoves`, measured in standard deviations of the series' own log
  returns, so it is right on DOGE and on USDC alike), one archive request per
  window on hover, a click-to-pin card, cached for a day and persisted.
  `test-polish-render.js` §11 asserts the economics — no request to draw, one
  to hover, none to hover the same mark again — and that the word "because"
  appears nowhere on the card.
