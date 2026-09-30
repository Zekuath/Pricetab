# PriceTab — Vision

> **Last updated:** 28 September 2026 · The roadmap that turns this into work
> is [TODO.md](TODO.md); what has already shipped is in the
> [changelog](../CHANGELOG.md).

## What PriceTab is

**The crypto market, read honestly, on every new tab.** A Chrome extension
that opens a live price chart where the blank page used to be, and grows —
only when asked — into the tools someone following the market reaches for
next: price targets, a portfolio with its cost basis, a practice derivatives
account, the news around a move, and what followed the last time the chart
looked like this.

It is for people who look at crypto prices many times a day and do not want
to open an exchange, sign in or be tracked to do it.

## Principles

These decide arguments. A feature that needs one of them bent is a feature
that does not get built.

1. **Speed first.** The chart is on screen before any request returns —
   first contentful paint measured at 52 ms, painted from a persisted cache.
   No build step, no remote code, nothing loaded from a CDN.
2. **Privacy is the product.** Zero permissions at install, no account, no
   analytics, no telemetry. Everything a person enters stays in their
   browser. The two optional permissions — eight newsroom feeds, and
   notifications for the alarm — are asked for from a button inside the app,
   never at install.
3. **One purpose.** Reading the crypto market on the new tab page. Every
   feature is a different way of reading the same prices; nothing turns the
   page into a productivity suite.
4. **Count, never claim.** Where the app says something about the market it
   prints a number with its denominator — "8 of 25 times", never an arrow, a
   score or a signal. Below twelve episodes it prints the counts and refuses
   the comparison. A label that makes a claim (*oversold*, *better*) must
   survive the app's own data first, and most have not.
5. **Official or nothing.** Where the app states a rule — a tax rate, a
   holding period, a legal status — it comes from the authority that makes
   the rule, with the day it was read. Where no official source was
   confirmed, the app says so and states nothing.
6. **Simple by default, deep on request.** Every panel is off until
   switched on; the four modes (Minimal, Fast, Trader, Holder) set sensible
   bundles; the chart alone is the product for anyone who wants only that.
7. **Never a blank screen.** A failed request shows the last good data and
   says how old it is.

## What exists today

| Area | In one line |
|---|---|
| **The chart** | Line or candles over six ranges, 81 coins, 37 currencies; comparison on one percent axis, a log axis, an average named by what it covers, US CPI release marks, and named chart patterns with their record on this coin |
| **Calls** | Say where the price will be on a board of real price-and-time squares; each call settles itself against the price at that moment, and the record is scored locally with its *n* |
| **Price targets** | A price crossing or a move over 1h / 4h / 24h, caught even when it happened overnight, announced in the tab title and — if switched on — by a Chrome notification |
| **Portfolio** | Holdings by amount, dated purchases, sales and income; cost basis by FIFO, LIFO or HIFO; value, P/L, contribution and mix charts; the time-weighted return by month; target shares with drift; a mask for when someone is leaning over the desk |
| **Tax guide** | Every country's crypto tax rules — 244 countries and territories — from official sources only, with an estimate from what was recorded where the rule is specific enough. Not tax advice, and it says so first |
| **Derivatives practice** | A simulated USDT-margined perpetual priced from a real venue's public quotes, in Practice Units that cannot be bought or cashed out: orders, stops, funding, liquidation on a mark, a ledger that explains the balance exactly |
| **News** | Thirteen newsrooms and boards (eight behind an optional permission) and an exchange's notices if wanted; dated, read by day or by coverage, advertising kept out, one event written up four times shown once |
| **Base rates** | "Has this happened before?" — what followed every past time this coin entered the state it is in now |
| **Widgets** | Eighteen optional cards, from Fear & Greed to open interest, with Holder / Trader / Minimal bundles and four sizes |
| **Everywhere** | Thirteen languages, dark and light themes, keyboard-first, a toolbar popup that costs no request, and an iPhone build of the same page |

## Direction

Ordered by what matters most, not by what is most interesting to build.

### 1. Be found

The feature list is already ahead of every extension in the category that
was measured (August 2026), yet the store carries 1.3.0 while two packaged
builds and everything since sit unreleased, and PriceTab appears in none of
the searches that return its competitors. **Shipping and launching comes before any new feature.** The
open question for the next store build is scope: the derivatives practice
account and the tax guide are both policy surfaces, and each is reviewed
against the store's single-purpose and financial-content rules before it
ships.

### 2. Derivatives readings, as base rates

What a crypto market has that an equity market does not is its mechanics:
perpetual funding, leverage, forced liquidation, and one coin traded on many
venues. The rule for all of it is the crowd reading's: a count with its
denominator, a lean only with its record. Already built: funding written
per year beside the venue's premium, and funding and open interest ranked
against their own history, alone and as a pair. Next, in order of what they
cost — all from providers already declared, no new host:

- liquidation prints on the derivatives chart, kept from while a tab is open;
- open interest against the visible order book, printed as the reach, the
  money and the multiple — never as a "fragility index";
- two venues side by side as a table;
- a snapshot of the market's state stored on each call and contract, so a
  record can be broken down by the conditions it was made in.

Not doing: a 0–100 score, a red/amber/green market state, liquidation
heatmaps, or any model fitted in the browser.

### 3. A chart that reads like a venue's

A permanent price scale down the right and dates along the foot. The parts
exist (the grid draws both); what is missing is one right-hand gutter that
the board, the comparison ticks and the end labels all agree on.

### 4. A portfolio that needs less typing

Importing an exchange's transaction history, recording a sale out of a
watched address, and promoting more of the tax guide's 155 unconfirmed
countries as their authorities publish rules.

### 5. More places

A Firefox port, and settings that can follow a person between their own
browsers without an account.

## Money

Nothing is monetised today, and nothing will be before the store launch
settles. What is settled, and will not move: **no ad networks, no tracking,
no data sold, no subscriptions, and nothing that is free today ever moves
behind a paywall.** Any revenue surface is optional, labelled and contextual.

## What we will not build

- **A wallet.** Nothing that sends, receives or holds keys. Addresses are
  watched read-only, and checked against the sanctions list on the device.
- **Real trading.** The derivatives account is a simulation in valueless
  units; a route from it to a real venue is the one thing that would make it
  something else.
- **Tax filing or tax advice.** The guide explains official rules and
  estimates from what was recorded; it never files, and it never tells
  anyone what to do.
- **Buy and sell signals, scores or AI recommendations.** Counts with their
  denominators are what got built instead.
- **Accounts or cloud sync** of anyone's data.
- **A search box on the new tab.** An extension's new-tab page cannot take
  focus from the address bar, which is still where typing goes.
- **Anything that needs a content script.** A floating price widget on every
  page would need access to every site visited — the one thing this product
  is built not to ask for.
- **Anything that removes a feature people already have.**
