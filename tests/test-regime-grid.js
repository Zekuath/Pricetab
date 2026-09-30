/* The regime grid (`src/regime-grid.js`): nine cells, counted — each entry
 * into a state and the state 20 days after it, beside the share of all days
 * in each state. Every case is a drawn path whose answer was worked out by
 * hand before the function ran (docs/internal/research/regimes-prereg.md).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "src", "regime-grid.js"), "utf8") +
    "\nthis.regimeGrid = regimeGrid; this.regimeStates = regimeStates;",
  sandbox,
  { filename: "regime-grid.js" },
);
const grid = (c) => JSON.parse(JSON.stringify(sandbox.regimeGrid(c)));

let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failed++;
    console.error(`  ✘ ${label}${detail !== undefined ? " — " + detail : ""}`);
  }
};

console.log("\nRegime grid");

{
  /* 100 for forty days, then 110 for sixty. Days 20–39 compare 100 with 100:
     flat. Days 40–59 compare 110 with 100: +10%, rising. Days 60–99 compare
     110 with 110: flat again. Entries: flat at 20, rising at 40, flat at 60.
     Twenty days after each: day 40 is rising, day 60 is flat, day 80 flat. */
  const c = Array.from({ length: 100 }, (_, i) => (i < 40 ? 100 : 110));
  const g = grid(c);
  check(g.days === 80 && g.base[0] === 0.25 && g.base[1] === 0.75 && g.base[2] === 0,
    "the base is every day with a full window: 20 rising, 60 flat, none falling", JSON.stringify(g.base));
  check(g.rows[0].n === 1 && g.rows[0].cells.join(",") === "0,1,0",
    "the one entry into rising was flat twenty days later", JSON.stringify(g.rows[0]));
  check(g.rows[1].n === 2 && g.rows[1].cells.join(",") === "1,1,0",
    "…the two entries into flat, one rising and one flat — episodes, not the sixty flat days", JSON.stringify(g.rows[1]));
  check(g.rows[2].n === 0 && g.rows[2].cells.join(",") === "0,0,0", "…and falling has no episodes to count");
  check(g.now === 1 && g.since === 40, "today is flat, and has been for forty days", JSON.stringify({ now: g.now, since: g.since }));
}

{
  /* The mirror, cut short: a 10% fall at day 40 is falling, and with 55
     days there is no day 60 to answer it. Exactly −5% counts (≤). */
  const c = Array.from({ length: 55 }, (_, i) => (i < 40 ? 100 : 90));
  const g = grid(c);
  check(g.rows[2].n === 0 && g.rows[2].pending === 1,
    "an entry too recent to have its twenty days is pending, not counted", JSON.stringify(g.rows[2]));
  const edge = sandbox.regimeStates(Array.from({ length: 21 }, (_, i) => (i < 20 ? 100 : 95)));
  check(edge[20] === 2, "exactly −5% over the window is falling", String(edge[20]));
}

{
  check(grid([]).days === 0 && grid(null).now === null, "no closes, no grid — and no throw");
}

if (failed) {
  console.error(`\n✘ ${failed} REGIME GRID CHECK(S) FAILED`);
  process.exit(1);
}
console.log("REGIME GRID TESTS OK");
