# PriceTab documentation

Four folders, split by **who the file is for** rather than by topic. That is
the only division that survives: a file's subject drifts, but the question
"would this be published?" has one answer forever, and getting it wrong is how
working notes end up on a public remote.

```
docs/
├── CHANGELOG.md     what changed, in the user's words
├── PRIVACY.md       the policy the store links to
├── product/         where the extension is going
├── store/           everything the Chrome Web Store listing needs
└── internal/        working material — never committed
```

## `product/` — the extension itself

| File | What it is |
|---|---|
| [VISION.md](product/VISION.md) | The roadmap: what this is for, and what it will not become |
| [TODO.md](product/TODO.md) | Development tasks, by phase |
| `product/TODAY.md` | The current session's working list — one numbered piece per job, newest first. **Local only**: it is a scratchpad in a working voice, not product documentation, so it is git-ignored and lives in the tree rather than in the history |

`TODAY.md` is the one to read before starting anything. It carries what was
asked, what was actually wrong, what was done about it and — the part worth
the most later — what was deliberately *not* done, and why.

## `store/` — the listing

| File | What it is |
|---|---|
| [STORE_DESCRIPTION.md](store/STORE_DESCRIPTION.md) | **The single canonical source** for every field in the Developer Dashboard |
| [STORE_ASSETS.md](store/STORE_ASSETS.md) | Which image goes in which slot, and how they are made |
| [SCREENSHOT_PLAN.md](store/SCREENSHOT_PLAN.md) | The five frames, why those five, and the capture traps |
| [MARKETING_LAUNCH.md](store/MARKETING_LAUNCH.md) | Launch copy for everywhere that is not the store |
| [policies/](store/policies/) | Chrome Web Store policy reference, rejection codes, the submission checklist and where this extension stands |

**Never copy the description anywhere else.** A duplicate in `STORE_ASSETS.md`
was submitted once and earned a Yellow Argon rejection — the store saw the old
copy, coin list and all. That file now holds the 132-character summary and a
pointer, and nothing more.

## `internal/` — working material

Contributor notes, tooling research and business thinking. All of it is
**git-ignored as a directory**, which is deliberate: the previous arrangement
named five individual paths, so a sixth note dropped beside them would have
been committed with nobody noticing. `tests/test-invariants.js` fails if
anything under it is ever tracked.

Ignored means "not part of the shipped history", not "disposable" —
`scripts/checkpoint.sh` still snapshots the folder.

What lives there: how to work in this repository (the one command that must be
green, the house style, how a change is verified), the security checklists
behind those rules, notes on the tooling, the monetization strategy and pricing
plan, business ideas, and per-contributor working notes. **Nothing under
`internal/` is a decision until it moves to `product/` or `store/`.**

No file table here on purpose — a list of paths for a folder nobody else can
see goes stale silently, and this file is published.

## What stays at the repository root, and why

- **`README.md`** — GitHub renders the root README as the repository's front
  page. Moved into `docs/`, the project would land on a bare file listing.
- **The codebase guide** — load order, globals, the invariants and why the
  chart is built the way it is. It is git-ignored, and it is the other half of
  the working rules under `internal/`: one describes **what the code is**, the
  other **how to work in it**.

Everything else that used to sit at the root — the monetization plan and the
business notes — is under `internal/` now. They were the two files a reader
could mistake for public documentation because of where they were sitting.
