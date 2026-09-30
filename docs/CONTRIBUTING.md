# Contributing to PriceTab

Issues and pull requests are welcome. This page is the short version; the
reasoning behind each rule is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Set up

```bash
git clone https://github.com/Zekuath/Pricetab.git
cd Pricetab
npm --prefix tests ci             # dev dependencies, exact-pinned — nothing here ships
npm --prefix tests run browsers   # the Chromium the render suites drive
```

Load the folder at `chrome://extensions` (Developer mode → **Load unpacked**)
and open a new tab. There is no build step: edit a file in `src/`, press the
extension's reload icon, open a new tab.

## Before you open a pull request

```bash
npm --prefix tests run check
```

It must pass. It runs ESLint, the ast-grep rules and every suite, and it is
the same command CI runs. Paste its last lines into the pull request.

Then check your change against the promises the project makes:

- [ ] **No new permission** at install. An optional one is asked for from a
      button inside the app, never at install.
- [ ] **No new host** unless it is added to `ALLOWED_HOSTS` in
      `tests/test-invariants.js` and to the README's privacy table, with a
      reason.
- [ ] **Nothing leaves the device** that the person did not ask to send.
- [ ] **No remote code, `eval`, `innerHTML` or `console.log`.**
- [ ] **No React hooks** — the vendored React is 16.5.
- [ ] **Every string goes through `msg()`** with a literal key, and
      `node scripts/i18n-extract.js` has been run.
- [ ] **A new stored field is named in its sanitizer**, or it is lost at the
      next load.
- [ ] **A claim on the screen is one the data supports.** Market readings
      print a count with its denominator, never an arrow or a verdict; a rule
      (a tax rate, a legal status) cites the authority that makes it.
- [ ] **The changelog** has a line under *Unreleased*, written for the person
      using the extension rather than for the code.

## Pull requests

- One change per pull request, with a description of what changed and why —
  including what you considered and rejected.
- Change the smallest thing that honestly solves the problem. A refactor goes
  in its own pull request.
- Comments explain *why*; the code already says what.
- Match the surrounding code: its naming, its comment density, its idioms.

## Reporting a bug

Open a [GitHub issue](https://github.com/Zekuath/Pricetab/issues) with the
steps, what you expected, what happened, and your Chrome version. A screenshot
helps for anything visual. Never include a wallet's private key or recovery
phrase — PriceTab never asks for one, and neither will anyone helping you.

## Security

If you find a way for the extension to leak data, run remote code or reach a
host it has not declared, please keep the details out of a public issue.
Use GitHub's private vulnerability reporting on the repository's Security
tab where it is available, or open an issue asking for a private contact.

## Licence

Contributions are accepted under the project's [MIT licence](../LICENSE).
