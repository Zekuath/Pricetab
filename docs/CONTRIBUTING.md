# Contributing to PriceTab

Issues and pull requests are welcome.

## Set up

```bash
git clone https://github.com/Zekuath/Pricetab.git
cd Pricetab
npm --prefix tests ci
npm --prefix tests run browsers
```

Load the repository with **Load unpacked** at `chrome://extensions/`. There is
no build step: edit `src/`, reload the extension, then open a new tab.

## Before a pull request

```bash
npm --prefix tests run check
```

Please keep each pull request to one change and explain what changed and why.
Match the surrounding code and avoid unrelated reformatting.

Check the following when relevant:

- No new permission is granted at install.
- New remote hosts are added to `ALLOWED_HOSTS` in
  `tests/test-invariants.js` and disclosed in the privacy policy.
- No remote code, `eval`, `innerHTML` or production `console.log` is added.
- React 16.5 has no hooks.
- Stored objects validate every field on load.
- New text uses `msg()` and all locale catalogues are updated.
- User-visible changes are recorded in the changelog.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime model and test layers.

## Bugs and security

For bugs, open a GitHub issue with reproduction steps, the expected result,
the actual result and your Chrome version.

Do not include wallet private keys, recovery phrases or personal portfolio
data. For a vulnerability that could expose data or execute code, use GitHub's
private vulnerability reporting instead of a public issue.

Contributions are accepted under the [MIT licence](../LICENSE).
