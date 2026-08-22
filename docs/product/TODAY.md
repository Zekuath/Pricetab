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
