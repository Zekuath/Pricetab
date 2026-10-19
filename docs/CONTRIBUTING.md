# Contributing to PriceTab

Issues and pull requests are welcome.

## Set up

```bash
git clone https://github.com/Zekuath/Pricetab.git
cd Pricetab
git config core.hooksPath .githooks
npm --prefix tests ci
npm --prefix tests run browsers
```

Load the repository with **Load unpacked** at `chrome://extensions/`. There is
no build step: edit `src/`, reload the extension, then open a new tab.

The hooks in `.githooks/` run on every commit and push: they refuse files the
ignore list covers, files over 5 MB, co-author trailers, and force pushes, and
they run the invariant suite. If one stops you, it says why.

## Before a pull request

```bash
npm --prefix tests run check
```

Please keep each pull request to one change and explain what changed and why.
Match the surrounding code and avoid unrelated reformatting.

Check the following when relevant:

- No new permission is granted at install.
- Nothing leaves the device that the person did not ask to send.
- New remote hosts are added to `ALLOWED_HOSTS` in
  `tests/test-invariants.js` and disclosed in the privacy policy.
- A claim on the screen is one the data supports: a market reading prints a
  count with its denominator, never an arrow or a verdict, and a tax rule
  cites the authority that makes it.
- No remote code, `eval`, `innerHTML` or production `console.log` is added.
- React 16.5 has no hooks.
- Stored objects validate every field on load.
- New text uses `msg()` and all locale catalogues are updated.
- User-visible changes are recorded in the changelog.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime model and test layers.

## How you can help

Not every useful contribution is code.

- **Test on real devices.** A phone from its home screen (the safe areas,
  the swipe from the edges, the keyboard over a drawer), a ChromeOS laptop
  in tablet mode, a small window. Report what feels wrong with the
  Design or usability form.
- **Read it in your language.** PriceTab ships in thirteen languages, and a
  machine-checked catalogue is not a native reader. The Translation form
  takes one sentence at a time.
- **Small interface fixes.** A label cut short, a control that is hard to
  reach by keyboard, a contrast too low in one theme. Run the one command
  above, and send a screenshot before and after.

## Bugs and security

For bugs, open a GitHub issue with the Bug report form: reproduction steps,
the expected result, the actual result and your Chrome version.

Do not include wallet private keys, recovery phrases or personal portfolio
data. For a vulnerability that could expose data or execute code, use GitHub's
private vulnerability reporting instead of a public issue.

Contributions are accepted under the [MIT licence](../LICENSE).
