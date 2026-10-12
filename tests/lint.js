// Lint runner — PriceTab.
//
// Wraps the ESLint API rather than calling the CLI for one reason: the
// no-unused-vars config has to carry a ~850-name varsIgnorePattern (every
// cross-file binding in the shared global scope), and ESLint prints that whole
// pattern inside each warning message. The CLI output becomes unreadable at
// about 4 KB per warning, so messages are truncated here.
//
// Usage:  npm --prefix tests run lint
//         node tests/lint.js --fix
const path = require("path");
const { ELint, ESLint: ESLintNamed } = require("eslint");
const ESLint = ESLintNamed || ELint;

const ROOT = path.join(__dirname, "..");
const FIX = process.argv.includes("--fix");
const MAX_MSG = 110;

(async () => {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: path.join(ROOT, "eslint.config.mjs"),
    fix: FIX,
  });

  const results = await eslint.lintFiles(["src", "tests"]);
  if (FIX) await ESLint.outputFixes(results);

  let errors = 0;
  let warnings = 0;

  for (const r of results) {
    if (!r.messages.length) continue;
    const rel = path.relative(ROOT, r.filePath);
    console.log(`\n${rel}`);
    for (const m of r.messages) {
      const level = m.severity === 2 ? "error  " : "warning";
      if (m.severity === 2) errors++;
      else warnings++;
      let text = m.message;
      if (text.length > MAX_MSG) text = text.slice(0, MAX_MSG) + "…";
      const where = `${m.line}:${m.column}`.padEnd(9);
      console.log(`  ${where}${level}  ${text}  [${m.ruleId || "core"}]`);
    }
  }

  const summary = `${errors} error(s), ${warnings} warning(s)`;
  if (errors) {
    console.error(`\n✘ lint: ${summary}`);
    process.exit(1);
  }
  console.log(`\n✔ lint: ${summary}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
