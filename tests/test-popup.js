// The toolbar popup's own money formatting. popup.js loads four of the app's
// files and not utils.js, so it carries its rules inline — and a rule kept in
// two places drifts: on 9 Oct 2026 the app learned to keep four significant
// digits on a price under one, and the popup still printed DOGE as $0.08.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const node = () => ({
  appendChild() {}, setAttribute() {}, addEventListener() {}, style: {}, textContent: "",
  classList: { add() {}, remove() {}, toggle() {} },
});
const sandbox = {
  console, Date, Math, JSON, Intl, URL, setTimeout, clearTimeout, setInterval, clearInterval,
  document: { getElementById: node, createElement: node, querySelector: () => null, addEventListener() {}, documentElement: node(), body: node() },
  navigator: { language: "en" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
  matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
  location: { search: "" },
  fetch: () => Promise.reject(new Error("no network in this test")),
};
sandbox.window = sandbox;
vm.createContext(sandbox);
// The files popup.html loads, in its order
for (const f of ["i18n", "config", "storage", "api", "popup"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", `${f}.js`), "utf8"), sandbox, { filename: `${f}.js` });
}
const run = (expr) => vm.runInContext(expr, sandbox);

assert.strictEqual(run(`popupMoney(82356.1, "$", 2, "us")`), "$82,356.10", "a price in thousands keeps the setting");
assert.strictEqual(run(`popupMoney(0.0849, "$", 2, "us")`), "$0.08490", "DOGE is not $0.08");
assert.strictEqual(run(`popupMoney(0.2351, "€", 2, "eu")`), "€0,2351", "ADA keeps its fourth digit, in the EU format too");
assert.strictEqual(run(`popupMoney(0.0849, "$", 6, "us")`), "$0.084900", "the setting stays the floor");
assert.strictEqual(run(`popupMoney(NaN, "$", 2, "us")`), "—", "junk prints a dash");
// The popup's rule and the app's are the same rule. utils.js needs d3 at
// load, so its definition is lifted out and run on its own.
const utilsSrc = fs.readFileSync(path.join(ROOT, "src", "utils.js"), "utf8");
const rule = utilsSrc.match(/const PRICE_SIGNIFICANT_DIGITS[\s\S]*?\n\};\n/);
assert.ok(rule, "utils.js still defines priceDecimals after PRICE_SIGNIFICANT_DIGITS");
const utils = vm.createContext({ Math, Number });
vm.runInContext(rule[0], utils);
for (const v of [0.5, 0.0849, 0.012, 0.00031, 0.000012345, 1, 7.5, 64000]) {
  for (const places of [2, 4, 6]) {
    assert.strictEqual(run(`popupPlaces(${v}, ${places})`), vm.runInContext(`priceDecimals(${v}, ${places})`, utils),
      `popup and app agree on ${v} at ${places} places`);
  }
}
console.log("POPUP TESTS OK");
