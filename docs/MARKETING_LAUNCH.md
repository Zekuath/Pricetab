# PriceTab — Launch Checklist

A concrete, step-by-step plan to get the first real users for a zero-install, free Chrome extension. Work top to bottom. Copy-paste templates are provided — edit names/links before posting.

> Reality check: the single biggest lever for a 0-review listing is **getting the first 5–10 honest reviews** and **strong first-3 screenshots**. Do those before any big launch push.

---

## Phase 0 — Before you tell anyone (store readiness)

- [x] Upload the new build with the new title + description (`docs/STORE_DESCRIPTION.md`) — 1.3.0 live since August 2026.
- [ ] Host the privacy policy and put the URL in the **Privacy** field (not the description). GitHub Pages from `privacy.html` works.
- [ ] Add a support email in the dashboard (a plain Gmail is fine).
- [ ] Replace outdated screenshots with fresh captures (asset pipeline in `assets/mockups/`).
- [ ] First 3 screenshots must each show **one clear benefit** — they appear in search results.
- [ ] Confirm category = **Productivity**, language set.
- [ ] Install it yourself on a clean profile and use it for a day — catch anything embarrassing.

---

## Phase 1 — Seed the first reviews (week 1)

Reviews are social proof. A listing with 0 reviews converts far worse than one with 6–10.

- [ ] Ask 8–12 friends/colleagues who use Chrome to install it and leave an **honest** review (don't script the words — fake-looking reviews get flagged).
- [ ] Post in 2–3 small communities you're already part of (Discord/Telegram crypto groups, a uni group, a dev server) — as a "I built this, would love feedback" message, not a hard sell.
- [ ] Target: **5+ reviews, 4.5★+** before the public launch.

---

## Phase 2 — Owned channels (week 1–2)

### GitHub (organic discovery + trust)
- [ ] Polish the repo README: hero screenshot, one-line pitch, install link, feature list, privacy note.
- [ ] Add repo **topics**: `chrome-extension`, `cryptocurrency`, `new-tab`, `bitcoin`, `crypto-charts`, `manifest-v3`.
- [ ] Add the Chrome Web Store badge/link at the top.

### X / Twitter — build-in-public + launch thread
Template (launch thread, post 1):
```
I turned my browser's new tab into a live crypto dashboard 📈

PriceTab: real-time charts for 60+ coins, market widgets (Fear & Greed, funding, liquidations…), and the price right in your tab title.

Free. No account. No tracking. Zero permissions.

🧵👇
```
Post 2 (proof): a GIF/screenshot of a new tab loading the chart.
Post 3 (why): "I wanted to glance at the market without opening another site or app. So every new tab does it for me now."
Post 4 (CTA): the Web Store link + "would love your feedback / a review if you like it 🙏".

---

## Phase 3 — Launch day pushes (week 2–3)

Don't do these all at once — space them out so you can respond to comments on each.

### Product Hunt
- [ ] Schedule for **12:01 AM PT** on a Tue–Thu.
- [ ] Tagline (60 char): `Turn every new tab into a live crypto dashboard`
- [ ] First comment (maker):
```
Hi PH 👋 I'm the maker of PriceTab.

I kept opening price sites in a new tab all day, so I made the new tab BE the price site. Every time you open one, you get a live chart for your coins + optional market widgets (Fear & Greed, funding rate, liquidations, halving countdown…).

It's free, needs zero permissions, has no account and no tracking — your watchlist stays in your browser.

Would genuinely love your feedback on what to build next. AMA!
```
- [ ] Line up 5–10 people to support in the first hour (comments > upvotes).

### Reddit (value-first, read each sub's self-promo rules)
Good fits: `r/SideProject`, `r/chrome`, `r/chrome_extensions`, `r/cryptodevs`, `r/IndieHackers`. Avoid `r/CryptoCurrency` direct promo — it's heavily moderated.

Template (r/SideProject / r/chrome_extensions):
```
Title: I made a Chrome extension that turns every new tab into a live crypto dashboard

I built PriceTab because I was tired of opening a price site every time I wanted a quick glance at the market.

Now every new tab shows a live chart for my coins, the price in the tab title, and optional widgets like Fear & Greed and funding rates.

Tech notes for anyone curious: Manifest V3, React + D3, zero permissions, all data in localStorage, Coinbase public API. No build step — single bundled file.

Free, no account. Link in comments (per sub rules). Happy to answer anything.
```

### Hacker News — Show HN
- [ ] Title: `Show HN: PriceTab – every new tab becomes a live crypto dashboard`
- [ ] Body: 3–4 sentences on the "why", the privacy/zero-permission angle, and the tech stack. HN rewards honesty and technical detail over hype.

### Indie Hackers
- [ ] Post a short "I shipped this" with the why + ask for feedback.

---

## Phase 4 — Ongoing (week 3+)

- [ ] Reply to every Web Store review (especially negative ones) — it improves rating trajectory.
- [ ] Ship a small update every few weeks; "recently updated" gets a ranking nudge and gives you new launch reasons.
- [ ] Write 1–2 short blog/X posts on a feature (e.g. "how the Fear & Greed widget works") for organic SEO.
- [ ] Track installs weekly in the dashboard; note which channel drove spikes and double down there.

---

## Store SEO cheat-sheet

- Title carries the most weight → it now includes "Crypto Charts" + "New Tab".
- First 132 chars of the description matter for indexing → benefit + keywords are front-loaded.
- Ratings count + recency of updates feed ranking → keep both moving.
- **Never** keyword-stuff (comma-separated coin lists). That caused two past rejections (Yellow Argon). Natural language only.

## 30-day targets (realistic for an indie launch)

| Metric | Target |
|--------|--------|
| Reviews | 10+ (4.5★+) |
| Weekly installs | trending up week-over-week |
| Channels validated | 1–2 that actually convert |
