# Screenshot plan — 1.4.0

> **Set changed on 19 Aug 2026 for the 1.4.0 upload.** Frame 2 is now
> `02-calls` and not `02-compare`: the board is the feature this release
> exists for, and the dashboard takes five. Compare is still captured and
> kept in `assets/mockups/raw/` for the site.
>
> Two capture notes worth keeping, both learned against live data:
> **(a)** the calls frame is shot on **1D**, not 1M. With a board on, the
> price scale stops fitting the data and becomes a window onto a fixed
> lattice, so a range wider than the window keeps the live price and lets
> the rest clip — the month spans ~$7.8K against a ~$5.3K window and drew
> as a vertical spike at the right edge. It also carries one notch of
> board zoom, or the day's low sits on the window's floor and the line
> clips at the left. **(b)** the hero composite shows only the *top* of
> the capture, so the right range is whichever one puts the line where
> the frame can see it — a week that sat flat and then spiked left the
> hero looking like an empty chart. Re-check both when re-shooting.

Draft for agreement **before** any capture. The pipeline already exists
(`assets/mockups/`), so this is about *what* to shoot and *how it should
look*, not how to shoot it.

Brief: **minimal, but what a real install actually looks like.** Not a
maximalist demo.

---

## 1. Blockers — fix before capturing anything

| # | Problem | Why it matters |
|---|---------|----------------|
| B1 | `scenes.html` never sets `crypto_chart_onboarding_seen`. It calls `localStorage.clear()`, so **the first-run tour fires 600 ms into every scene** and the capture happens 12–18 s later — with a dimmed backdrop and a tour card over the UI. | Every single screenshot would be ruined. The file predates the tour; `crypto_chart_rate_prompt_dismissed` is already handled, this one was just never added. |
| B2 | The 8 scenes are the 1.3.0 feature set. Nothing covers the portfolio, price targets, compare, or candlesticks. | These are the reasons 1.4.0 exists. `TODO.md` already says "upload with fresh screenshots incl. portfolio". |
| B3 | `STORE_ASSETS.md` tells us to shoot "**ALL 11 widgets** enabled" and the `signals` scene does exactly that. | Directly against the brief. Also against the truth: every widget ships **off**. |

---

## 2. What "default" actually is

Straight from `config.js` / `widgets-data.js` — worth knowing, because a
screenshot that contradicts it is a promise the product doesn't keep:

| Setting | Ships as |
|---------|----------|
| Coins | `BTC, ETH, XRP, LTC` |
| Widgets | **all 11 off** |
| Page ticker | off |
| Tab-title ticker | off |
| Chart type | line |
| Chart colour | on |
| Market stats | on |
| Auto-rotate | off |

So a literal default screenshot is: **one chart, four coins, nothing else.**

That's the honest hero — but it undersells a product whose depth is the
selling point. The resolution below: **lead with near-default, earn the
density later.** No shot shows more than 5 widgets; the store never shows a
state the user can't reach in one click from Settings.

---

## 3. How many — our own docs disagree

| Source | Says |
|--------|------|
| `docs/store/policies/SUBMISSION_CHECKLIST.md` | Screenshots **1–5** |
| `assets/mockups/README.md` | "7 framed screenshots … if the dashboard caps the count, drop from the end" |
| `assets/screenshots/` | 7 files sitting there |

**Settled: the console accepts five.** The checklist was right; the mockups
README was wrong and has been corrected. Five frames, no overflow.

That makes the real problem compression, not selection — compare, widgets,
portfolio, targets and themes all have to land inside five.

## 4. Proposed set — 5 core

"Minimal" applies **per frame**, not to the count: one idea per image, no
clutter, near-default state. It does not mean leaving features out.

Ordered as uploaded. The first three carry the argument on their own.

| # | Frame | State | What it says | Details it carries |
|---|-------|-------|--------------|--------------------|
| 1 | **Hero — near default** | Default 4 coins, BTC 1W, no widgets, no ticker. Dark. | "Every new tab opens a live chart." The actual product in one look. | Market stats row, since-last-visit line |
| 2 | **Compare** | BTC vs ETH over 1W, both as % change on one axis, compare button lit. Dark. | The differentiator, and it reads instantly at thumbnail size. | Line end-labels, shared-axis honesty, crosshair reading both |
| 3 | **Portfolio** | 5 holdings with lots + one recorded sale. Dark. | The 1.4.0 headline; nothing else in the category does this. | Cost-basis line on the chart, per-row sparklines, Unrealized + Realized tier, sort row, allocation bars |
| 4 | **Widgets** | The widget column with 5 on, chart beside it. No panel. Dark. | Depth on demand — the thing itself, not the switch for it. | Watchlist with live prices, Fear & Greed gauge, halving progress, alt-season scale |
| 5 | **Targets, in light mode** | Targets panel open, 3 armed (one percent target) + 1 hit. Light. | "It tells you when it happens", with zero permissions. | Progress meters, distance-to-target, Already-hit section, direction arrows, light theme |

Frame 5 does two jobs, not three — see D3: the targets overlay deliberately
washes out the page behind it, so no chart mode can be shown through it.

**One extra idea for frame 5.** The store template draws a mock browser
window around the capture. We can set that mock tab's title to
`● BTC hit $80,000` — which demonstrates the tab-strip announcement in the
one place it actually lives, without spending a frame on it.
(Shipped as `● LINK hit $8.20` instead — see §7 step 5 for why that number
had to follow the seeded data rather than the other way round.)

### Not in the store set

Five is the hard cap, so these are captured into `raw/` for the website and
socials only: candlesticks + volume, the Coins tab (24h chips + sorting), the
news ticker, and the onboarding tour.

## 5. House rules for every capture

Things that make a set look composed rather than assembled.

**Consistency**
- One coin leads everywhere: **BTC**. Same coin, same range (1W) unless the
  shot is about ranges.
- Same window chrome: `?os=win` for the official set (already the standing
  decision — most Chrome users are on Windows).
- Frames 1–4 dark, frame 5 light. Mixing themes across the first three
  reads as inconsistency rather than as a feature.

**Honesty**
- No state a user can't reach from a fresh install in under a minute.
- Never more than 5 widgets in one frame.
- Real API data, never hand-written numbers. The pipeline already captures
  from the live extension — keep it that way.
- Portfolio holdings must be plausible, not a flex. Round-ish amounts, a mix
  of gains *and* one loss.

**Cleanliness**
- Tour suppressed, rating card suppressed, no toasts mid-animation.
- 5-minute refresh interval so the price count-up can't be caught mid-roll
  (already in `scenes.html`).
- Captions: one short line per image, sentence case, no exclamation marks, no
  feature-list caption. The image carries the feature; the caption says why it
  matters.

**Compliance** (`docs/store/policies/`)
- Captions must not be keyword lists. No "BTC, ETH, XRP, SOL…" strings on any
  image — Yellow Argon is this project's most likely rejection.
- No price predictions, no returns implied, nothing that reads as advice.
- The portfolio shot must not show a number that looks like a recommendation.

---

## 6. Decisions — made, with the reasoning

Handed to me, so here they are with why. Each says what would change it.

### D1 · Portfolio numbers → **mixed, slightly up, one clearly red row**

Not the flattering version. Three reasons, in order of weight:

1. **It shows more of the product.** An all-green portfolio makes the sort
   control look pointless and every sparkline the same colour. A mixed one is
   the only version where the ordering visibly does something and the colour
   system is legible.
2. **It doesn't imply returns.** `PRICETAB_COMPLIANCE.md` rests on "no
   misleading marketing" and "neutral financial data". A portfolio up 200% in
   the hero of a tracking tool reads as a claim about outcomes, which is not
   a claim this product makes or can keep.
3. **It survives contact.** Someone installs, sees their own red rows, and the
   screenshot still matches the product they were shown.

*Changes if:* we ever add a genuinely aspirational surface where a strong
number is the point. Not this one.

### D2 · Which sale → **one small sale, no row expanded**

A recorded sale is what makes **Realized** appear, so it earns its place. But
a large one reads as trading activity, which is the wrong story for a
tracking tool that connects to no exchange.

Not expanding a row is the harder call. Expanding shows the mechanism (the
Bought/Sold toggle, the lot list). Against it: this frame already carries the
cost line, sparklines, two stat tiers, the sort row and allocation bars — at
carousel size, adding an opened accordion is where it stops being readable.
The mechanism belongs on the website, where there is room to explain it.

*Changes if:* we get a dedicated 6th frame; then "how a sale is recorded" is
a better use of it than candlesticks.

### D3 · Frame 5 carrying three things → **it can't, and the code says so**

I proposed targets + light + candlesticks "at different depths". That was
wrong, and checking it settled it: `AlertsOverlay` paints
`rgba(255,255,255,0.85)` over the page in light mode. The chart behind is 85%
washed out **on purpose** — the panel is meant to take the screen. So there is
no candlestick chart visible behind an open targets panel.

Candlesticks then have no home in the five: frame 1 must be the default line,
and frame 2 (compare) fades candles out by design — that is deliberate
behaviour we wrote, not an oversight.

**So: candlesticks come out of the store set** and become overflow #1.
The honest cost: a real feature goes unshown. Accepted because targets is a
*benefit* ("it tells you when it happens") and candlesticks is a *mode*, and
benefits are what a listing has room to argue.

*Changes if:* the dashboard takes 6+. Candles is then the first thing added.

### D4 · Promo tiles → **re-render them, at the end**

I was going to defer these as low value at ~0 installs. Checking changed it:
`promo-tiles.html` embeds `raw/dashboard-dark.png` directly. Once `raw/` is
re-captured, the tiles are three renders off a template that already exists —
a byproduct, not a project. And `PRICETAB_COMPLIANCE.md` lists outdated
screenshots under content-currency risk.

Order: Small Tile first (the one that can appear without editorial
featuring), Large and Marquee after, since those only matter if we are picked
up — which is not the situation we are in yet.

### D7 · Cost line in the portfolio frame → **let it go**

The cost-basis line only draws while the level is inside the range on screen —
by design, since a line pinned to an edge would claim a crossing the window
doesn't contain. A portfolio that hasn't been under water lately has its cost
below the floor of a short range, so on 1M the line isn't there.

A year does show it. It also puts **−49%** at the top of the frame (the series
holds today's amounts against year-old prices) and turns every sparkline red.
That is a worse screenshot than one missing a dashed line, and it fights D1 —
the frame should read honest, not alarming.

So: 1M, no cost line in the store frame.

*Outcome:* the year capture was **not** kept. It was shot under a scene name
that no longer exists, the website ended up using the 1M capture, and an
orphan PNG no scene can regenerate is worse than no PNG. If the site ever
grows a section that explains the cost line, add a `portfolio-1y` scene and
capture it then.

### D6 · Widget frame → **the row, not the Settings panel**

Captured both and compared. Opening Settings buries the subject: the overlay
dims the page so the widget column behind it is a ghost — the third time this
has come up (targets panel, candlesticks, now this). An overlay takes the
screen on purpose, so it can never be the *backdrop* for the thing it configures.

The row on its own is legible and shows real data: the watchlist with live
prices, the Fear & Greed gauge, the halving countdown, the alt-season scale.
A store frame should show the thing, not the switch. The Settings capture
stays in `raw/` for the website, where the size control can be explained.

### D5 · How many the dashboard takes → **5. Confirmed in the console.**

Checked: the upload form accepts a maximum of five. Our own checklist was
right and `assets/mockups/README.md` was wrong.

Three consequences:

- The five-frame set is the whole set. There is no overflow slot, so **D3 is
  final**: candlesticks do not appear in the store listing at all. They live
  in `raw/` and on the website.
- `assets/screenshots/` currently holds seven files, two of which can never
  be uploaded. The new set replaces it outright rather than being added to,
  so nothing ambiguous is left lying around.
- `assets/mockups/README.md` ("7 framed screenshots… if the dashboard caps
  the count, drop from the end") and `docs/store/STORE_ASSETS.md` ("ALL 11 widgets
  enabled") are both now known-wrong. Corrected.

## 7. Order of work

1. ~~Fix B1 — the tour firing over every capture.~~ **Done** —
   `crypto_chart_onboarding_seen` seeded in `scenes.html`.
2. ~~Correct the two docs that were wrong~~ **Done** — `STORE_ASSETS.md`
   ("ALL 11 widgets", stale set) and `assets/mockups/README.md` ("7 frames").
3. ~~Add the 1.4.0 scenes.~~ **Done** — `hero`, `compare`, `portfolio`,
   `widgets`, `targets`, plus `candles` for the website. Portfolio and targets
   are seeded from `PORTFOLIO` / `ALERTS` at the top of `scenes.html`, dated
   relative to capture time so holding periods stay right on a re-run.
4. ~~**Capture `raw/`**~~ **Done** — every scene, both themes, from the live
   extension. `check-scenes.js` was added after a deleted helper silently
   broke the scene script and produced fourteen blank frames twice over;
   `node --check` passes on a file whose `SCENES` throws, so syntax alone is
   not the check that was needed.
5. ~~**Recompose `store-frames.html`**~~ **Done** — five frames, new captions.
   The mock tab reads `● LINK hit $8.20`, not the `● BTC hit $80,000` this
   plan proposed: the seeded hit is LINK, and BTC trades near $64k, so a tab
   announcing a BTC hit at $80,000 would be contradicted by the live price in
   the same image. The format (`● ` + `alertTitleText()`) is verified against
   `app.js`; only the target changed.
6. ~~**Re-render the tiles**~~ **Done** (D4). Small, Large, Marquee.
7. ~~**Replace `assets/screenshots/`**~~ **Done** — the seven old files are
   gone from the root and all three OS variants, replaced by the five. No
   stale set is left to upload by accident.

### Notes for step 4

- The runner gained a `contains:` match, so a scene can click a row that has
  no hook of its own (the compare picker's "Ethereum"). Capture-only
  machinery: the extension did not grow an attribute for our convenience.
- `compare` clicks the compare button rather than pressing `C` — the runner
  has no key support and the button is the same action.
- Scene selectors all resolve against real `data-tour` hooks in `app.js`
  (`settings`, `alerts`, `portfolio`, `compare`). Verified.
