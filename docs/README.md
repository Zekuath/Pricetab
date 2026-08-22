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
| [TODAY.md](product/TODAY.md) | The current session's working list — one numbered piece per job, newest first |

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

Agent rules, journals, memories, tooling research and business thinking. All of
it is **git-ignored as a directory**, which is deliberate: the previous
arrangement named five individual paths, so a sixth note dropped beside them
would have been committed with nobody noticing. `tests/test-invariants.js`
fails if anything under it is ever tracked.

Ignored means "not part of the shipped history", not "disposable" —
`scripts/checkpoint.sh` still snapshots the folder.

| File | What it is |
|---|---|
| `internal/AGENT_RULES.md` | Binding on every AI agent working here. Read it first |
| `internal/AI_GUIDELINES.md` | The security checklists behind those rules |
| `internal/AI_TOOLING_RESEARCH.md` | Notes on the tooling itself |
| `internal/MONETIZATION.md` | The long-form strategy and the principles a paid version still has to keep. Its "no paywall" position was superseded on 21 Aug 2026 |
| `internal/MONETIZATION_PLAN.md` | The pricing plan, and **the current direction**: freemium, one-time "Pro", new features only. Kept apart from the strategy above deliberately: one is the principles, this is the price |
| `internal/BUSINESS_IDEAS.md` | Working notes. Nothing here is a decision until it moves to `product/` or `store/` |
| `internal/agents/` | One journal and one memory file per agent |

## What stays at the repository root, and why

Four files, and each has a reason that is not preference:

- **`README.md`** — GitHub renders the root README as the repository's front
  page. Moved into `docs/`, the project would land on a bare file listing.
- **`CLAUDE.md`** — the codebase guide, and the door Claude and Codex arrive
  through. `AGENTS.md` is a symlink to it and **`GEMINI.md`** is the third
  door. All three are git-ignored, and `tests/test-invariants.js` checks each
  one still points at `internal/AGENT_RULES.md`.

Everything else that used to sit at the root — the monetization plan and the
business notes — is under `internal/` now. They were the two files a reader
could mistake for public documentation because of where they were sitting.

## Where the rest lives

`CLAUDE.md` at the repository root describes **the codebase** — load order,
globals, the invariants and why the chart is built the way it is. It is the
other half of `internal/AGENT_RULES.md`, which describes **how to work here**.
`AGENTS.md` is a symlink to it; `GEMINI.md` is the third door to the same
rules. All three are git-ignored.
