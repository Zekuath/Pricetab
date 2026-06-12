// Runs every test suite plus a syntax check over src/.
// Usage: node tests/run-all.js
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let failed = false;

const step = (label, fn) => {
  try {
    fn();
    console.log(`✔ ${label}`);
  } catch (e) {
    failed = true;
    console.error(`✘ ${label}`);
    if (e.stdout) process.stderr.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
  }
};

for (const f of fs.readdirSync(path.join(ROOT, "src")).filter((f) => f.endsWith(".js"))) {
  step(`syntax: src/${f}`, () =>
    execFileSync("node", ["--check", path.join(ROOT, "src", f)]),
  );
}

const suites = [
  "test-load.js",
  "test-storage.js",
  "test-api.js",
  "test-cache.js",
  "test-bulk.js",
  "test-d3.js",
  "test-smoke-jsdom.js",
];
for (const suite of suites) {
  step(suite, () =>
    execFileSync("node", [path.join(__dirname, suite)], { stdio: "pipe" }),
  );
}

process.exit(failed ? 1 : 0);
