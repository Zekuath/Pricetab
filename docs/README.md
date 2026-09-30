# PriceTab documentation

Split by **who a file is for**, not by topic. A file's subject drifts; the
question "would this be published?" has one answer forever, and getting it
wrong is how working notes end up on a public remote.

```
docs/
├── ARCHITECTURE.md    how the code is put together
├── CONTRIBUTING.md    setting up, and what a change must pass
├── CHANGELOG.md       what changed, in the user's words
├── PRIVACY.md         the policy the store links to
├── product/           what PriceTab is for, and what comes next
├── store/             everything the Chrome Web Store listing needs
└── internal/          working material — never committed
```

## For contributors

| File | What it is |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The load model, `src/` layer by layer, state, persistence, data, drawing, language, the tests, and a table of common changes |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setting up, the one command that must pass, the checklist every change is held to |
| [../tests/README.md](../tests/README.md) | Every suite and what it holds |
| [../ios/README.md](../ios/README.md) | Building the iPhone app |

## For users

| File | What it is |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | Every release, in [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) form, written for the person using the extension |
| [PRIVACY.md](PRIVACY.md) | The privacy policy. `privacy.html` at the root is the same text, served to the store |

## `product/` — where it is going

| File | What it is |
|---|---|
| [VISION.md](product/VISION.md) | What PriceTab is for, the principles that settle arguments, the direction, and what it will not become |
| [TODO.md](product/TODO.md) | The roadmap: where things stand, the next release step by step, launch, then what follows |

Two local-only paths live here and are git-ignored: `product/TODAY.md`, the
working list of a session, and `product/derivatives-simulator/`, the research
the practice account grew from, which the code cites by file name.

## `store/` — the listing

| File | What it is |
|---|---|
| [STORE_DESCRIPTION.md](store/STORE_DESCRIPTION.md) | **The single canonical source** for every field in the Developer Dashboard, with the listing in thirteen languages |
| [STORE_ASSETS.md](store/STORE_ASSETS.md) | Which image goes in which slot, and how each is made |
| [SCREENSHOT_PLAN.md](store/SCREENSHOT_PLAN.md) | The five frames, why those five, and the capture traps |
| [MARKETING_LAUNCH.md](store/MARKETING_LAUNCH.md) | Launch copy for everywhere that is not the store |
| [policies/](store/policies/) | The store's policies, its rejection codes, the submission checklist, and where PriceTab stands against each |

**Never copy the description anywhere else.** A duplicate was submitted once
and earned a Yellow Argon rejection. `tests/test-invariants.js` checks that
the 132-character summary in `manifest.json` matches the copies here and that
the description carries no ticker list.

## `internal/` — working material

Research notes, the measurements behind decisions, contributor journals and
business thinking. The directory is **git-ignored as a whole** — one rule
rather than a path per file, so a new note dropped beside the others can never
be committed by accident — and a local test fails if anything under it is ever
tracked. Ignored means "not part of the published history", not
"disposable": the local snapshot script still copies it.

Nothing under `internal/` is a decision until it moves into `product/` or
`store/`. There is no file table for it here: a list of paths nobody else can
see goes stale silently, and this file is published.

## At the repository root

- **`README.md`** — the project's front page on GitHub.
- **`privacy.html`** — the privacy policy as a page, for the store's privacy
  field.
- **`LICENSE`** — MIT, with third-party attribution.
