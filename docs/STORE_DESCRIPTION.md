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
Every new tab opens a live crypto chart. Watch your coins, spot the top movers, and read 9 market signals. Free, no account.
```

**Character count:** 124/132 — also mirrored in `manifest.json` `description`. The first sentence is what shows in search-result cards, so it must stand alone.

---

## Detailed Description

```
Turn every new browser tab into a live cryptocurrency dashboard.

New to crypto or a seasoned trader, PriceTab puts the market in front of you with zero effort. Instead of a blank page, every new tab opens a clean, real-time price chart. No account, no sign-up, nothing to configure — just install it and open a tab.

WHAT IT DOES (in plain words)
Every time you open a new tab, PriceTab shows the live price of a coin you choose, drawn as a smooth, easy-to-read chart. Click the price to flip to the next coin on your list. That is it. The market is always one tab away.

PICK YOUR COINS
Track over 60 popular cryptocurrencies, whether you follow major coins like Bitcoin and Ethereum or keep an eye on smaller projects. Add the ones you care about and drag to reorder them. Your list is saved and remembered every time.

SEE ANY TIMEFRAME
Switch between 1 Hour, 1 Day, 1 Week, 1 Month, 1 Year and All Time with one click — see today's move or the full history at a glance.

YOUR WATCHLIST, AT A GLANCE
An optional panel shows all your coins as a colour-coded grid: green when a coin is up, red when it is down — so you can read the whole market in a second. A "Top Movers" panel highlights the biggest gainers and losers of the day.

PRICE IN YOUR TAB TITLE
PriceTab can show the current price and 24-hour change in the browser tab itself, so you can keep an eye on the market even while you work in another tab.

MARKET SIGNALS (optional — only if you want them)
Switch on extra panels whenever you are ready for more:
- Fear & Greed Index — is the market fearful or greedy today?
- Market Overview — total market size and Bitcoin / Ethereum dominance.
- Halving Countdown — time until the next Bitcoin halving.
- A scrolling price bar with an optional crypto news headline row.
- For active traders: RSI, funding rate, long/short ratio, open interest, liquidations and an altcoin-season index.
New here? Leave them off and PriceTab stays clean and simple. Want depth? One click turns them on.

ONE-CLICK SETUP
Not sure where to start? Pick a preset: "Holder" for a simple watchlist view, "Trader" for the pro signals, or "Minimal" for just the essentials.

MADE THE WAY YOU LIKE
- Dark, light, or automatic theme (follows your system).
- Show prices in your local currency — 37 supported — with adjustable decimals.
- Turn the chart's green/red fill on or off for a cleaner look.
- Set how often prices refresh, or let the chart rotate through your coins automatically.
Everything you choose is saved on your own computer and remembered next time.

PRIVATE BY DESIGN
PriceTab asks for ZERO permissions. It cannot read your browsing history or your other tabs, because it never requests access. There is no account, no analytics and no tracking. Your settings live only in your browser, and prices come straight from public market data.

100% FREE
No ads. No paid tier. No in-app purchases. Just a fast, clean crypto dashboard on every new tab.

HOW TO START
1. Click "Add to Chrome".
2. Open any new tab — your chart appears instantly.
3. Click the price to switch between your coins.
4. Open settings (the gear icon, top right) to add coins and turn on widgets.

Questions or ideas? Find us on GitHub: github.com/zekuath/pricetab

Disclaimer: PriceTab is for information only and is not financial advice. Cryptocurrency prices are volatile and risky. Always do your own research.
```

**Character count:** ~3,400/16,000

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
| Screenshots (upload in this order) | `assets/screenshots/01-hero.png` … `05-targets.png` | 1280x800 |
| Small promo tile | `assets/promotional/Small Tile.png` | 440x280 |
| Marquee promo tile | `assets/promotional/Marquee.png` | 1400x560 |

`01-hero` must be FIRST — it is the image shown in search results and drives most clicks. (`Large Tile.png` 920x680 is no longer requested by the dashboard; keep it for other marketing use.)

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
PriceTab replaces the browser's new tab page with a live cryptocurrency price chart. Every feature — the coin watchlist, time-period switching, currency display and optional market-data panels — serves this one purpose: showing cryptocurrency market data on the new tab page. The extension requests zero permissions, runs entirely locally, and stores user preferences only in the browser's localStorage.
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
- [ ] Screenshots uploaded in order — `01-hero` FIRST, then `02`–`06`
- [ ] Small tile + marquee uploaded
- [ ] Category = Tools, Language = English (United States)
- [ ] Privacy tab: single purpose filled, no data types checked, all 3 certifications checked, remote code = No
- [ ] Account tab: contact email added and verified (required to publish)
- [ ] ZIP contains only: `manifest.json`, `index.html`, `privacy.html`, `rate.html`, `src/`, `vendor/`, `assets/icons/` — no `docs/`, `site/`, `.git/`, `CLAUDE.md`, screenshots, or mockups

**Build the ZIP:**

```bash
cd /path/to/Pricetab
zip -r pricetab-$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])").zip \
  manifest.json index.html privacy.html rate.html src vendor assets/icons
```

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
