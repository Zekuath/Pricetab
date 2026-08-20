# Chrome Web Store Listing - PriceTab

> **Live listing:** https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf

> **This is the single canonical source for Chrome Web Store submission content.**
> Each section below maps 1:1 to a field in the Developer Dashboard — work through it
> top to bottom and copy each block into the matching field.
> Do NOT use descriptions from any other file — `STORE_ASSETS.md` previously had a duplicate that caused a Yellow Argon rejection.

---

# 1. Store Listing Tab

## Extension Name

```
PriceTab - Crypto Charts on Every New Tab
```

**Character count:** 41/75 — the store title comes from `name` in `manifest.json`, so any change must be made there. Do NOT add coin names to the title — both rejections (Yellow Argon) were triggered by coin-name keywords.

---

## Short Description (Summary)

```
Every new tab opens a live crypto chart. Follow your coins, call where the price goes next, and keep the score. No account.
```

**Character count:** 123/132 — also mirrored in `manifest.json` `description`. The first sentence is what shows in search-result cards, so it must stand alone.

---

## Detailed Description

```
Turn every new browser tab into a live cryptocurrency dashboard.

New to crypto or trading every day, PriceTab puts the market in front of you with zero effort. Instead of a blank page, every new tab opens a clean, real-time price chart. No account, no sign-up, nothing to configure — install it and open a tab.

WHAT IT DOES (in plain words)
Every time you open a new tab, PriceTab shows the live price of a coin you choose, drawn as a smooth, easy-to-read chart. Click the price to flip to the next coin on your list. That is it. The market is always one tab away.

PICK YOUR COINS
Follow more than 60 cryptocurrencies, from the largest names to smaller projects. Add the ones you care about, drag to reorder them, and your list is remembered every time.

SEE ANY TIMEFRAME
Switch between one hour, one day, one week, one month, one year and all time with a single click — today's move or the entire history, at a glance.

CALL WHERE THE PRICE GOES
This is the part you will come back for. Switch on Calls and the right-hand side of the chart becomes a board of empty squares — real price bands at real moments in the future. Point at one and you are saying "it will be in there, then". Two clicks lock it in: one to draft, one to commit, so a stray click never becomes a prediction.

Then it settles itself. The next time you open a tab, PriceTab checks what actually happened at that moment and marks the square: called it, or missed. Your record — how many you got right, your best streak — is kept on the board with them. When several calls share a column, the one you placed first is marked as the claim rather than a hedge, because being early is the harder thing to get right.

The score is yours alone. It stays on your computer, it is worth nothing, and it is never sent anywhere. It exists so you can find out whether you actually read the market as well as you think you do.

WHAT YOU HOLD
Enter your holdings and PriceTab shows what they are worth now, what they cost, and the difference — with a value chart you can bring forward, buy and sell markers on it, and a cost-basis report you can export. Tracking only: no wallet is ever connected, and no key is ever asked for. You can also watch a public address and let the balance keep itself up to date.

TELL ME WHEN
Set a target — a price to cross, or a move of a given size in a day — and PriceTab tells you the next time you open a tab. Including one that happened while you were asleep: it searches the last week of candles rather than only the price right now, so a move that reverted overnight is still reported, with when it happened and what it was worth then.

TWO COINS, ONE HONEST AXIS
Compare any two coins as percent change from the start of the range you are looking at. One shared scale, never two — because two price scales on one chart put the crossing point wherever the scales happened to be placed rather than where the market put it.

MARKET DEPTH, ONLY IF YOU WANT IT
Switch on extra panels when you are ready: a market overview, the fear and greed reading, a halving countdown, an altcoin-season index, and — for people who trade — funding rates, long/short ratio, open interest and liquidations. A scrolling price bar can run along the edge of the screen with an optional headline row, which you can narrow to stories about the coins you follow or the ones you actually hold.

New here? Leave all of it off and PriceTab stays a clean chart. Want depth? One click turns it on.

ONE-CLICK SETUP
Not sure where to start? Pick a mode. Minimal leaves the price and the chart. Fast is for watching a number move. Trader puts up candles, volume and the derivatives panels. Holder is for checking in rather than watching. A mode is a shortcut, not a cage — every switch it sets is one you can change afterwards.

MADE THE WAY YOU LIKE
- Dark, light, or automatic (follows your system).
- Prices in your own currency, from a list of 37, with the decimals you prefer.
- Line or candlestick, with an optional price and time grid.
- Set how often it refreshes, or let the chart rotate through your coins.
- Keyboard throughout: every panel has a key, and pressing ? lists them.
Everything you choose is saved on your own computer and remembered next time.

PRIVATE BY DESIGN
PriceTab asks for ZERO permissions. It cannot read your browsing history or your other tabs, because it never requests access. There is no account, no analytics and no tracking. Your settings, your holdings and your record live only in your browser, and prices come straight from public market data.

HOW TO START
1. Click "Add to Chrome".
2. Open any new tab — your chart appears instantly.
3. Click the price to move between your coins.
4. Open settings (the gear, top right) to add coins and switch things on.

Questions or ideas? Find us on GitHub: github.com/zekuath/pricetab

Disclaimer: PriceTab is for information only and is not financial advice. Calls are a way of scoring your own reading of the market; they are not a wager, nothing can be staked on them and they carry no value. Cryptocurrency prices are volatile and risky. Always do your own research.
```

**Character count:** ~4,300/16,000

---

## Category

```
Tools
```

> ⚠️ The old "Productivity" category no longer exists — the Chrome Web Store
> reorganised categories in 2023 into three groups (Productivity, Lifestyle,
> Make Chrome Yours). "Tools" sits in the Productivity group and is where
> crypto price trackers live.

**Alternatives considered:**
- `Functionality & UI` — for new-tab customisers (Momentum-style); fine but users searching "crypto" browse Tools, not UI tweaks.
- `News & Weather` — plausible for market data, but lower discovery for crypto searches.

---

## Language

```
English (United States)
```

---

## Graphic Assets

| Dashboard field | File | Size |
| --- | --- | --- |
| Store icon | `assets/icons/icon128.png` | 128x128 |
| Screenshots (upload in this order) | `01-hero.png`, `02-calls.png`, `03-portfolio.png`, `04-widgets.png`, `05-targets.png` in `assets/screenshots/` | 1280x800 |
| Small promo tile | `assets/promotional/Small Tile.png` | 440x280 |
| Marquee promo tile | `assets/promotional/Marquee.png` | 1400x560 |

`01-hero` must be FIRST — it is the image shown in search results and drives most clicks. `02-calls` replaced `02-compare` for 1.4.0: the board is the feature this release is *for*, and the dashboard takes five. The compare frame is kept in `assets/mockups/raw/` for the site. (`Large Tile.png` 920x680 is no longer requested by the dashboard; keep it for other marketing use.)

---

## Additional Fields

| Field | Value |
| --- | --- |
| Official URL | (leave unset unless a verified domain is added) |
| Homepage URL | `https://zekuath.github.io/Pricetab/site/` |
| Support URL | `https://github.com/zekuath/pricetab/issues` |
| Mature content | No |

---

# 2. Privacy Tab

## Single Purpose Description

```
PriceTab replaces the browser's new tab page with a live cryptocurrency price chart. Every feature serves that one purpose — reading the cryptocurrency market on the new tab page — and each is a different way of reading the same data: the coin list and time ranges choose what the chart shows; comparison draws a second coin on the same axis; the optional market panels annotate it; price targets report when the chart reaches a level you named; the holdings view prices coins you own against the same feed; and calls let you record what you expect the chart to do next and score yourself against what it did. Nothing collects, transmits or sells data. The extension requests zero permissions, runs entirely from local files, and keeps every setting, holding and score in the browser's own localStorage.
```

## Permission Justifications

The manifest requests **no permissions and no host permissions**, so no justification fields appear. (`chrome_url_overrides.newtab` is not a permission.)

## Remote Code

```
No, I am not using remote code.
```

All JavaScript is bundled locally in `vendor/` and `src/`.

## Data Usage

**Check NONE of the data-type boxes.** PriceTab does not collect or transmit:
personally identifiable information, health info, financial and payment info,
authentication info, personal communications, location, web history,
user activity, or website content.

Holdings, watched addresses, price targets and the calls record never leave
the device: they are written to `localStorage` and read back by the same page.
A watched address is used only to ask a public block explorer for that
address's balance, which is a request about an address on a public chain and
carries nothing about the person making it.

Then certify all three disclosures:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy Policy URL

```
https://zekuath.github.io/Pricetab/privacy.html
```

**Verified live (HTTP 200).** Note the capital "P" in `Pricetab` — GitHub Pages
URLs are case-sensitive; `…github.io/pricetab/…` returns 404.
Source file: `privacy.html` in the repo root, served via GitHub Pages.

> Privacy policy URL goes in this designated field only — never in the description.

---

# 3. Distribution Tab

| Field | Value |
| --- | --- |
| Payments | Free of charge |
| Visibility | Public |
| Distribution regions | All regions |

---

# 4. Pre-Submit Checklist

- [ ] `manifest.json` `name`/`description` match the Name and Summary above exactly
- [ ] Description pasted from this file only (no coin ticker lists — Yellow Argon)
- [ ] Privacy policy URL opens in an incognito window (case-sensitive!)
- [ ] Screenshots uploaded in order — `01-hero` FIRST, then `02-calls`, `03-portfolio`, `04-widgets`, `05-targets` (the dashboard takes five)
- [ ] Small tile + marquee uploaded
- [ ] Category = Tools, Language = English (United States)
- [ ] Privacy tab: single purpose filled, no data types checked, all 3 certifications checked, remote code = No
- [ ] Account tab: contact email added and verified (required to publish)
- [ ] ZIP contains only: `manifest.json`, `index.html`, `privacy.html`, `rate.html`, `src/`, `vendor/`, `assets/icons/` — no `docs/`, `site/`, `.git/`, `CLAUDE.md`, screenshots, or mockups

**Build the ZIP:**

```bash
./scripts/package.sh
```

Writes `assets/upload/pricetab-<version>/` (to load unpacked and check by hand)
and `assets/upload/pricetab-<version>.zip` (for the dashboard), from an
allowlist — and it cross-checks that allowlist against every file `index.html`
actually loads, so a new `src/` file nobody added to it fails the build instead
of shipping an extension that is broken for everyone on the store. It prints
the file list; read it before uploading.

The command this replaced named the paths a second time, by hand, which is one
more place to forget a new directory.

---

# 5. Getting More Clicks (CTR Notes)

What users see in store search results: **small tile/icon + name + rating + user count + summary**. Optimise in this order:

1. **First screenshot (01-hero)** — the single biggest click driver on the listing page. Already a composed promotional hero; refresh it whenever the UI changes meaningfully.
2. **Name keywords** — "Crypto", "Charts", "New Tab" are already in the title and cover the main queries. Do not add coin names (e.g. Bitcoin) to the title or summary — coin-name keywords caused both Yellow Argon rejections.
3. **Early ratings** — listings with no rating get far fewer clicks. After launch, ask for reviews in the GitHub README and release notes (never inside the extension with nag prompts — policy risk).
4. **Verified publisher** — in the dashboard Account tab, verify a contact email; later, verify a website via Search Console to get the publisher badge ("Established publisher" comes automatically with time + good standing).
5. **Featured badge** — awarded by the CWS team to listings that follow best practices (quality listing, no spam, MV3, minimal permissions). PriceTab already qualifies on the technical side; a polished listing is the remaining criterion.
6. **Localized listings (later)** — CWS shows localized listings only for locales declared in the manifest (`_locales/` + `default_locale`). Turkish, Spanish, German, and Portuguese are cheap wins once the listing is stable.
7. **Update cadence** — regular updates (even small) keep the "last updated" date fresh, which users check before installing.
