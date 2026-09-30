# PriceTab — Roadmap

> **Last updated:** 28 September 2026. Statuses were re-read against `src/`,
> the tests and the changelog, not carried forward.
> Why the product is going where it is: [VISION.md](VISION.md). What has
> shipped: [CHANGELOG.md](../CHANGELOG.md).
>
> `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` decided against

---

## Where things stand

| | |
|---|---|
| **On the Chrome Web Store** | 1.3.0 (August 2026) |
| **Packaged, never submitted** | 1.4.0 (19 Aug) and 1.5.0 (26 Aug) — superseded by what follows |
| **Built since, not yet released** | Thirteen languages · the derivatives practice account and its terminal page · the crypto tax guide for every country · the portfolio's ledger views (holding detail, activity, monthly time-weighted return, *As held* and *Mix* charts) · chart patterns, strategy setups and indicator lines, each with its record · US CPI marks · the Regimes card · the real alarm (optional notifications) · the log axis and the average line · save the chart as an image · the toolbar popup · the settings backup · the on-device sanctions check · target shares and the portfolio mask · 32 price-only coins · the mempool and difficulty cards · the iPhone build |
| **Code** | 83,407 lines across 57 files in `src/`, loaded as ordered script tags — no build step |
| **Tests** | ESLint, three ast-grep rules and 36 suites, seven of them in real Chromium with the network stubbed; one walks the derivatives model at random. CI runs the same command on every push |

**The gap that matters is the first two rows.** Everything below "Now" waits
until the store carries what the code already does.

---

## Now — the next store release

In order. Each step unblocks the next.

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | **Commit the working tree** | [ ] | About a month of work (135 paths, measured 28 Sep; since 28 Aug) exists only on the development machine and its local snapshots. Commit it in reviewable pieces, by area |
| 2 | **Decide the release's scope and number** | [ ] | What has landed since 1.5.0 is a major release, not a point one; `manifest.json` still says 1.5.0. The open question is whether the derivatives practice account and the tax guide ship in it — both are policy surfaces (step 3) |
| 3 | **Compliance review for what ships** | [~] | The calls, practice-account and tax-guide positions are recorded in `store/policies/PRICETAB_COMPLIANCE.md`; the final per-build review waits for step 2 to decide what ships |
| 4 | **Store listing copy** | [ ] | The detailed description predates the practice account and the tax guide; rewrite it for what ships, then its twelve translations. Keep the single canonical copy in `store/STORE_DESCRIPTION.md` — never a duplicate (Yellow Argon) |
| 5 | **Screenshots and promo tiles** | [ ] | Re-shoot per `store/SCREENSHOT_PLAN.md`; the portfolio, the calls board and the news reading room are the frames that changed most |
| 6 | **Clean-profile self-test** | [ ] | One pass on a fresh Chrome profile: every range and currency, both themes, offline, a reload, the two optional permissions granted and revoked |
| 7 | **Dashboard fields** | [~] | The privacy URL answers, but the live page is still the 6 Aug copy while the current 28 Sep policy is only in this working tree. Publish it, put the URL in the privacy field — never in the description — and add a support email |
| 8 | **Package and submit** | [ ] | `scripts/package.sh` builds the folder and zip from an allowlist and fails if `index.html` loads a file the allowlist lacks |

---

## Next — launch

The full plan and its copy templates are in
[`store/MARKETING_LAUNCH.md`](../store/MARKETING_LAUNCH.md). Goal: first
installs and 5–10 honest reviews at 4.5★ or better.

| Phase | Task | Status |
|---|---|---|
| 0 | Store readiness (above), then a day of using the released build | [ ] |
| 1 | Ask 8–12 people for honest reviews; post in 2–3 communities | [ ] |
| 2 | README hero shot and install link, repository topics, a short thread | [~] — README and Web Store badge done locally; commit them, then add the topics and thread |
| 3 | Product Hunt, r/SideProject, r/chrome_extensions, Show HN — spaced out | [ ] |
| 4 | Reply to every review; ship small updates every few weeks | ongoing |

---

## Later — product

Not started unless marked. Each follows the principles in
[VISION.md](VISION.md); the order within a group is the order of what it
costs.

### Derivatives readings — counts with their denominators

| Task | Status | Notes |
|---|---|---|
| Funding per year beside the venue's premium | [x] | 22 Sep 2026 |
| Funding and open interest ranked against their own history, alone and as a pair | [x] | 22 Sep 2026, *Market structure* on the practice page |
| Liquidation prints on the practice chart | [ ] | The venue's feed holds about the last hour, so the record starts when the tab opened and says so |
| Open interest against the visible order book | [ ] | Printed as reach, money and multiple; never an index |
| Two venues side by side | [ ] | A table of funding, open interest and long share; no new host |
| Liquidated notional as a share of the last five minutes' volume | [ ] | A now-cast, never a forecast |
| The market's state stored on each call and contract | [ ] | So a record can be broken down by the conditions it was made in |

### The chart

| Task | Status | Notes |
|---|---|---|
| A permanent price scale and a time axis | [ ] | Needs one right-hand gutter the board, the comparison ticks and the end labels agree on — a layout decision first |
| Prediction markets card | [ ] | Researched Aug 2026; the source is keyless with CORS, but a 40 KB answer and a gambling-adjacent listing question. Ships alone, in its own release, if at all |

### The portfolio and the tax guide

| Task | Status | Notes |
|---|---|---|
| Import an exchange's transaction history (CSV) | [ ] | Formats differ per exchange; the records it would feed (lots, sales, income) exist now |
| A sale out of a watched address | [ ] | The chain reports the balance falling, not the price sold at, and recording it by hand double-counts. Needs a design |
| An allocation donut | [ ] | Decide first whether it adds anything to the share strip and the *Mix* chart |
| Promote unconfirmed countries in the tax guide | [ ] | 155 of 244 have no official source confirmed. A country moves only on an official document |
| Re-read the rules most likely to change | [ ] | Türkiye (the crypto articles dropped from Law 7577 may return), South Korea (from 2027), Japan (separate taxation expected 2028), Ukraine, Denmark, and the EU's DAC8 reporting |

### Platforms

| Task | Status | Notes |
|---|---|---|
| Firefox port | [ ] | Minor API differences; the optional-permission flows need checking |
| Settings that follow a person between their own browsers | [ ] | `chrome.storage.sync`, opt-in, preferences only — never holdings |
| iPhone build | [x] | 21 Sep 2026 — the same page in a WKWebView, a home-screen widget; see `ios/README.md` |

---

## Engineering

| Task | Status | Notes |
|---|---|---|
| Files under ~800 lines | [~] | Measured 28 Sep 2026: `alerts-futures.js` 7,796 · `app.js` 7,400 · `chart.js` 6,382 · `portfolio.js` 5,467 · `styles-practice.js` 4,928 · `practice-model.js` 3,819. A split buys headroom, not a smaller feature; the next cut is chosen by counting how far a block reaches into the rest of its class, not by where it sits |
| Unit tests for `app.js` | [~] | It has none of its own; its state machine is covered in real Chromium by the polish suite instead |
| React 18 with hooks | [-] | Only with a real driver. The vendored React is 16.5 and an ast-grep rule blocks hooks, which do not exist there |
| TypeScript | [-] | Not worth a build step; ESLint's `no-undef` over the derived globals is the compiler |

---

## Known issues

None open. Report one at
[GitHub Issues](https://github.com/Zekuath/Pricetab/issues).

---

## Why this order

Measured on the Chrome Web Store on 22 August 2026:

| Extension | Users | Rating | What it carries |
|---|---|---|---|
| ChartsTab — the category leader | 1,000 | 5.0 (99) | 500 exchange pairs, sparklines, a floating widget that needs access to every site |
| Crypto Pulse | 127 | 5.0 (2) | 3,000+ coins plus notes, tasks and weather; 56 MB |
| Crypto Price Tracker | 58 | 3.8 (13) | 10,000+ coins |

1. **Installs are the bottleneck.** PriceTab appears in none of the searches
   that return all three, and its feature list is already ahead of each.
   Nothing on this page changes that except getting the build in front of
   people.
2. **Coverage does not sell here.** The extension with the most coins has the
   fewest users. Coverage is a portfolio feature — you cannot track what the
   app cannot price — and was built as one (32 price-only coins, no new host).
3. **Privacy is the difference.** None of them leads with zero permissions at
   install and no tracking. Every asset, review reply and README line should
   say it first.
4. **Ratings compound.** Small, frequent updates and a reply to every review
   cost nothing and no competitor does them.

---

## Goals

- **Month 1 after release:** 1,000 users · 4.5★ or better · no critical bug ·
  the chart painted in under a second on a cold tab
- **Growth:** 10,000 users by month 3 · 50,000 by month 6 · 100,000 in the
  first year · a store feature

---

## Decided against

Recorded so they are not proposed again without new evidence.

| Idea | Why not |
|---|---|
| Seed prices so the very first open paints a chart | Fabricated prices that read as real, then go stale. An honest cold-start note shipped instead |
| Coin logos | ~64 trademark files or an external request per logo; every row already names the coin |
| A search box on the new tab | An extension's new-tab page cannot take focus from the address bar |
| *Oversold* / *overbought* and other signal labels | They did not survive 21,669 daily closes. The base-rate panel prints what followed instead |
| A whale-alert feed | Needs an API key |
| A fragility score, market heatmap or fitted model | A count with its denominator says what is known; a score claims more |
