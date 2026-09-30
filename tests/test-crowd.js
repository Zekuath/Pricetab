/* The crowd reading (`crowdReading` in src/practice-page.js): a long/short
 * lean that may only lean when its own record on the market says so.
 *
 * Every case here is built so its answer is known before the function runs —
 * no random data, because a lean found in noise would pass or fail by luck.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src");
/* The floor is read from the source, not restated here: a test that copies
   the default stops testing the rule the day the default moves. */
const floor = Number(
  (fs.readFileSync(path.join(SRC, "utils.js"), "utf8").match(/const BASE_RATE_MIN_EPISODES = (\d+)/) || [])[1],
);
const sandbox = { BASE_RATE_MIN_EPISODES: floor, console };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(SRC, "practice-page.js"), "utf8") +
    "\nthis.crowdReading = crowdReading; this.crowdStateAt = crowdStateAt;" +
    "\nthis.CROWD_WINDOW = CROWD_WINDOW; this.CROWD_HORIZON = CROWD_HORIZON;" +
    "\nthis.practiceVolumeProfile = practiceVolumeProfile;" +
    "\nthis.structureReading = structureReading; this.structureReadings = structureReadings; this.STRUCTURE_FALL = STRUCTURE_FALL;",
  sandbox,
  { filename: "practice-page.js" },
);
const { crowdReading, crowdStateAt, CROWD_WINDOW, CROWD_HORIZON, practiceVolumeProfile, structureReading, structureReadings, STRUCTURE_FALL } = sandbox;

let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failed++;
    console.error(`  ✘ ${label}${detail !== undefined ? " — " + detail : ""}`);
  }
};

const DAY = 86400000;
/* A long share that walks through its own range: a slow saw, so every fifth
   of the window is visited again and again, with a crowded run every cycle. */
const shares = (n) => Array.from({ length: n }, (_, i) => 0.5 + 0.2 * Math.sin(i / 3));

console.log("crowd reading");
check(Number.isInteger(floor) && floor > 0, "the episode floor is read from utils.js", floor);

/* 1. The crowd was right to fear: after every crowded-long day the price fell
      for the next days, and otherwise it rose. The record must say short, and
      only because of what followed. */
{
  const n = 420;
  const s = shares(n);
  s[n - 1] = 0.95; // today: the most long this market has been
  const rows = [];
  let close = 100;
  for (let i = 0; i < n; i++) rows.push({ t: i * DAY, long: s[i], close });
  for (let i = 0; i < n; i++) {
    const st = crowdStateAt(rows, i);
    close += st && st.state === "long" ? -3 : 1;
    if (i + 1 < n) rows[i + 1].close = Math.max(1, close);
  }
  const r = crowdReading(rows);
  check(r && r.state === "long", "today at the top of its window reads as crowded long", r && r.state);
  check(r && r.n >= floor, "…with enough episodes to count", r && r.n);
  check(r && r.upRate < r.baseRate, "…and the record shows the price fell after them more than on an ordinary day",
    r && `${r.upRate} vs ${r.baseRate}`);
  check(r && r.lean === "short" && r.why === "edge", "…so it leans short, and says the gap is why",
    r && `${r.lean}/${r.why}`);
}

/* 2. The price rises every single day whatever the crowd does: the crowded
      days did exactly what an ordinary day did, so there is nothing to lean
      on — however many episodes there were. */
{
  const n = 420;
  const s = shares(n);
  s[n - 1] = 0.95;
  const rows = s.map((long, i) => ({ t: i * DAY, long, close: 100 + i }));
  const r = crowdReading(rows);
  check(r && r.n >= floor, "a market that rises regardless still has its episodes", r && r.n);
  check(r && r.lean === null && r.why === "ordinary", "…and no lean, because they were ordinary",
    r && `${r.lean}/${r.why}`);
}

/* 3. Too little history: whatever it shows, below the floor it refuses. */
{
  const n = CROWD_WINDOW + CROWD_HORIZON + 30;
  const s = shares(n);
  s[n - 1] = 0.95;
  const rows = s.map((long, i) => ({ t: i * DAY, long, close: 100 - i }));
  const r = crowdReading(rows);
  check(r && r.n < floor && r.lean === null && r.why === "thin", "below the floor it refuses to lean",
    r && `${r.n}/${r.lean}/${r.why}`);
}

/* 4. Episodes, not days: one long crowded run is one episode, not twenty. */
{
  const n = CROWD_WINDOW + 60;
  const rows = [];
  for (let i = 0; i < n; i++) {
    /* Flat and low for the window, then a single climb that stays high. */
    const long = i < CROWD_WINDOW ? 0.4 + (i % 5) * 0.001 : 0.9 + i * 0.0001;
    rows.push({ t: i * DAY, long, close: 100 });
  }
  const r = crowdReading(rows);
  check(r && r.state === "long" && r.n === 1, "a run of crowded days counts as one episode", r && `${r.state}/${r.n}`);
}

/* 5. Nothing to read. */
check(crowdReading(null) === null && crowdReading([]) === null, "no history is no reading");
check(
  crowdReading(Array.from({ length: CROWD_WINDOW }, (_, i) => ({ t: i, long: 0.5, close: 1 }))) === null,
  "a history shorter than the window and the horizon is no reading",
);

/* **The market-structure readings** (`structureReading`, `structureReadings`):
   the crowd's rule on funding, on open interest and on the pair. Built so the
   answers are known before the function runs, like the cases above. */
console.log("market structure");
{
  /* 1. A generic reading: hits on every tenth day, the price falls 4% by the
        horizon after each hit and rises otherwise — so the fall count is the
        episode count, the base fall count is small, and it leans short. */
  const n = 400;
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ t: i * DAY, value: i % 10 === 0 ? 1 : 0, close: 100 });
  for (let i = 0; i + CROWD_HORIZON < n; i++) {
    const hit = rows[i].value === 1;
    /* Set the close at the horizon relative to today's, then keep it. */
    rows[i + CROWD_HORIZON].close = hit ? rows[i].close * (1 - STRUCTURE_FALL - 0.01) : rows[i].close * 1.005;
  }
  const r = structureReading(rows, (i) => rows[i].value === 1);
  check(r && r.n >= floor, "hits on every tenth day give enough episodes", r && r.n);
  check(r && r.fell === r.n, "…and every one fell past the threshold by the horizon", r && `${r.fell}/${r.n}`);
  check(r && r.baseFell < r.baseN / 2, "…while most ordinary days did not", r && `${r.baseFell}/${r.baseN}`);
  check(r && r.lean === "short" && r.why === "edge", "…so it leans short on the record", r && `${r.lean}/${r.why}`);
  check(structureReading(rows.slice(0, CROWD_WINDOW), () => true) === null, "a series no longer than the window is no reading");
}
{
  /* 2. The three readings aligned by day: a funding series in its top fifth
        today, open interest rising over the last day, and a crowd history
        with the closes — the pair reads as high & rising and carries the
        day's move. */
  const n = 200;
  const crowd = Array.from({ length: n }, (_, i) => ({ t: i * DAY, long: 0.5, close: 100 + (i % 7) }));
  const funding = Array.from({ length: n }, (_, i) => ({ t: i * DAY, value: i === n - 1 ? 0.001 : 0.0001 * ((i % 9) + 1) }));
  const oi = Array.from({ length: n }, (_, i) => ({ t: i * DAY, value: 1000 + (i === n - 1 ? 200 : (i % 11)) }));
  const s = structureReadings(funding, oi, crowd);
  check(s && s.funding && s.funding.state === "high", "today's funding reads in the top fifth", s && s.funding && s.funding.state);
  check(s && s.oi && s.oi.state === "high", "…and open interest too", s && s.oi && s.oi.state);
  check(s && s.joint && s.joint.funding === "high" && s.joint.oi === "rising", "…so the pair is high & rising", s && JSON.stringify(s.joint && [s.joint.funding, s.joint.oi]));
  /* Yesterday's value is 1000 + (198 % 11) = 1000, today's 1200. */
  check(s && Math.abs(s.oi24 - 0.2) < 1e-9, "…with the day's open-interest move carried along", s && s.oi24);
  check(structureReadings(funding, oi, null) === null, "no crowd history, no closes, no reading");
  check(structureReadings(null, null, crowd) && structureReadings(null, null, crowd).funding === null, "a missing series is simply missing");
}
{
  /* 3. Middle funding is most days, so the pair refuses to count it. */
  const n = 200;
  const crowd = Array.from({ length: n }, (_, i) => ({ t: i * DAY, long: 0.5, close: 100 }));
  const funding = Array.from({ length: n }, (_, i) => ({ t: i * DAY, value: i === n - 1 ? 0.0005 : 0.0001 * ((i % 9) + 1) }));
  const oi = Array.from({ length: n }, (_, i) => ({ t: i * DAY, value: 1000 + (i % 11) }));
  const s = structureReadings(funding, oi, crowd);
  check(s && s.joint && s.joint.funding === "middle" && s.joint.n === 0, "middle funding is not a state to count against", s && JSON.stringify(s.joint));
}

/* **The volume profile**, checked against a range whose answer is known: all
   the business at one price puts the POC there and a value area one bin
   wide; volume spread evenly makes the value area hold ~70% of the bins. */
console.log("volume profile");
{
  const rows = [];
  for (let i = 0; i < 100; i += 1) rows.push({ price: 100 + (i % 10), time: i, vol: 1 });
  rows.push({ price: 105, time: 200, vol: 500 });
  const vp = practiceVolumeProfile(rows);
  check(vp && Math.abs(vp.poc - 105) < 0.3, "the point of control is where the volume is", vp && vp.poc);
  check(vp && vp.val <= 105 && vp.vah >= 105 && vp.vah - vp.val < 2, "…and one heavy price makes a narrow value area", vp && `${vp.val}–${vp.vah}`);
  check(vp && vp.share >= 0.7, "…holding at least 70% of the volume", vp && vp.share);
  const flat = practiceVolumeProfile(Array.from({ length: 400 }, (_, i) => ({ price: 100 + (i % 40) * 0.25, time: i, vol: 1 })));
  check(flat && flat.share >= 0.7 && flat.share < 0.8 && flat.vah - flat.val > 6, "an even range gives a value area about 70% wide", flat && `${flat.val}–${flat.vah} ${flat.share}`);
  check(practiceVolumeProfile(rows.map((r) => ({ price: r.price, time: r.time }))) === null, "no volume on the bars is no profile");
  check(practiceVolumeProfile(rows.slice(0, 5)) === null, "…and too few bars is none either");
}

if (failed) {
  console.error(`\n✘ ${failed} CROWD CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CROWD TESTS PASSED");
