// The model outlook (src/model-outlook.js + the generated package
// src/outlook-model.js) against Python's numbers (scripts/outlook/
// make_fixture.py writes tests/fixtures/model-outlook.json): the t CDF against
// Simpson integration, the forecast from the real last 3,000 completed bars,
// and the rules — origin and target alignment, ordered quantiles, probability
// bounds, missing, duplicated and stale bars, replay, no future data, and
// records that are never rewritten. Fixtures test the implementation; they are
// not evidence of forecasting accuracy (that is docs/internal/research/
// model-outlook-final.md).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const sandbox = { console, Math };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["outlook-model.js", "model-outlook.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", f), "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "model-outlook.json"), "utf8"));
sandbox.__bars = fx.bars;
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} — ${a} vs ${b}`);
const rel = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} — ${a} vs ${b}`);
const HOUR = 3600e3;

/* ── the package ── */
const pkg = JSON.parse(JSON.stringify(run("OUTLOOK_MODEL")));
ok(pkg.id === fx.package, "the fixture was built from the bundled package");
ok(run("moPackageValid(OUTLOOK_MODEL)"), "the bundled package passes its own checks");
ok(pkg.evaluation && pkg.evaluation.n > 1000 && pkg.evaluation.nominal === 0.8, "the package carries its evaluation");
ok(!run("moPackageValid({ ...OUTLOOK_MODEL, params: { lambda: 1.2, nu: 4 } })"), "a lambda outside (0, 1) is refused");
ok(!run("moPackageValid({ ...OUTLOOK_MODEL, params: { lambda: 0.9, nu: 1.9 } })"), "nu at or under 2 is refused (no unit variance)");
ok(!run("moPackageValid({ ...OUTLOOK_MODEL, method: 'garch', params: { omega: 1e-6, alpha: 0.2, beta: 0.8 } })"), "a GARCH with alpha + beta = 1 is refused, not adjusted");

/* ── the distributions, against Simpson integration in Python ── */
for (const c of fx.cdf) {
  sandbox.__c = c;
  near(run("moStdTCdf(__c.z, __c.nu)"), c.t, 2e-6, `standardized t CDF at ${c.z}`);
  near(run("moNormCdf(__c.z)"), c.normal, 1e-12, `Normal CDF at ${c.z}`);
}
ok(Math.abs(run("moStdTScale(4)") - Math.sqrt(0.5)) < 1e-15, "the unit-variance scale is sqrt((nu-2)/nu), not the ordinary t's 1");
for (const p of [0.05, 0.1, 0.5, 0.9, 0.95]) {
  sandbox.__p = p;
  near(run("moStdTCdf(moZPpf('t', __p, 3.9), 3.9)"), p, 1e-10, `the t quantile inverts its CDF at ${p}`);
}
near(run("moZPpf('normal', 0.9)"), 1.2815515655446004, 1e-10, "the Normal 90th percentile");

/* ── the forecast from real bars, against Python ── */
sandbox.__now = fx.now;
const f = JSON.parse(JSON.stringify(run(`modelOutlookForecast(OUTLOOK_MODEL, __bars, __now, ${fx.checkpoint.k})`)));
ok(f.state === "estimate", `real bars give an estimate (${f.state})`);
rel(f.sigma, fx.checkpoint.sigma, 1e-9, "sigma matches Python");
rel(f.lo, fx.checkpoint.lo, 1e-9, "the 10th percentile matches Python");
rel(f.median, fx.checkpoint.median, 1e-12, "the median matches Python");
rel(f.hi, fx.checkpoint.hi, 1e-9, "the 90th percentile matches Python");
near(f.pAbove, fx.checkpoint.pAbove, 1e-7, "the terminal probability matches Python");
ok(f.lo < f.median && f.median < f.hi, "quantiles are ordered");
ok(f.median === f.s0, "zero mean and a symmetric Z: the median is the reference close");
// Units and time: read at 14:37, the forecast is still the 14:00 close's, for 15:00
ok(f.origin === fx.origin && f.target === fx.origin + HOUR, "origin = end of the last completed bar, target = origin + 1h");
ok(f.s0 === fx.bars[fx.bars.length - 1].close, "the reference price is that bar's close, not a later tick");
// The burn-in path (no checkpoint in reach) agrees with the checkpoint path
sandbox.__noCp = { ...pkg, checkpoint: null };
const fb = JSON.parse(JSON.stringify(run("modelOutlookForecast(__noCp, __bars, __now)")));
rel(fb.sigma, fx.burnin.sigma, 1e-9, "the burn-in path matches Python");
rel(fb.sigma, f.sigma, 1e-8, "…and the checkpoint path: restoring from either gives the same state");

/* ── probabilities ── */
for (const k of [1, f.s0 * 0.5, f.s0, f.s0 * 1.001, f.s0 * 2, 1e9]) {
  const p = run(`modelOutlookPAbove(OUTLOOK_MODEL, ${f.sigma}, ${f.s0}, ${k})`);
  ok(p >= 0 && p <= 1, `a probability is in [0, 1] (K ${k})`);
}
near(run(`modelOutlookPAbove(OUTLOOK_MODEL, ${f.sigma}, ${f.s0}, ${f.s0})`), 0.5, 1e-12, "above the reference itself: exactly one half, no invented direction");
ok(run(`modelOutlookPAbove(OUTLOOK_MODEL, ${f.sigma}, ${f.s0}, ${f.s0 * 1.01})`) > run(`modelOutlookPAbove(OUTLOOK_MODEL, ${f.sigma}, ${f.s0}, ${f.s0 * 1.02})`), "a higher target is less likely");

/* ── the data rules ── */
// The hour still forming is ignored: add a bar for the current hour
sandbox.__more = [...fx.bars, { time: fx.origin, close: f.s0 * 1.05 }];
const fm = JSON.parse(JSON.stringify(run("modelOutlookForecast(OUTLOOK_MODEL, __more, __now)")));
ok(fm.origin === f.origin && fm.sigma === f.sigma, "the hour still forming is not used — no future data");
// Duplicates and order do not matter
sandbox.__shuffled = [...fx.bars].reverse().concat(fx.bars.slice(-50));
const fs2 = JSON.parse(JSON.stringify(run("modelOutlookForecast(OUTLOOK_MODEL, __shuffled, __now)")));
ok(fs2.sigma === f.sigma, "out-of-order and duplicated bars give the same forecast");
// Stale: two hours after the origin nothing is issued
ok(run(`modelOutlookForecast(OUTLOOK_MODEL, __bars, ${fx.origin + 2 * HOUR + 1}).state`) === "stale", "two hours past the origin the forecast is stale");
// Insufficient: too few bars, and a recent gap over 6 hours
ok(run(`modelOutlookForecast(OUTLOOK_MODEL, __bars.slice(-200), __now).state`) === "insufficient", "200 bars are not enough");
sandbox.__gappy = fx.bars.filter((b, i) => i < fx.bars.length - 20 || i >= fx.bars.length - 12);
ok(run("modelOutlookForecast(OUTLOOK_MODEL, __gappy, __now).state") === "insufficient", "an 8-hour hole in the last two days makes it insufficient");
sandbox.__oneHole = fx.bars.filter((b, i) => i !== fx.bars.length - 5);
const fh = JSON.parse(JSON.stringify(run("modelOutlookForecast(OUTLOOK_MODEL, __oneHole, __now)")));
ok(fh.state === "estimate" && fh.origin === f.origin, "one missing hour is filled with the last close and the forecast stands");
ok(run("modelOutlookForecast({ schema: 'x' }, __bars, __now).state") === "invalid", "a malformed package gives no numbers");
ok(run("modelOutlookForecast(OUTLOOK_MODEL, [], __now).state") === "insufficient", "no bars (a provider that failed over) give no estimate");

/* ── replay: one step at a time equals all at once ── */
{
  const v1 = run(`(() => { const r = __bars.map((b, i, a) => i ? Math.log(b.close / a[i - 1].close) : 0).slice(1); return moNextVariance(OUTLOOK_MODEL, r, 1e-5); })()`);
  const v2 = run(`(() => { const r = __bars.map((b, i, a) => i ? Math.log(b.close / a[i - 1].close) : 0).slice(1); const h = Math.floor(r.length / 2); return moNextVariance(OUTLOOK_MODEL, r.slice(h), moNextVariance(OUTLOOK_MODEL, r.slice(0, h), 1e-5)); })()`);
  rel(v2, v1, 1e-12, "replaying in two halves equals one pass");
}

/* ── the record ── */
const rec = JSON.parse(JSON.stringify(run(`modelOutlookRecord(modelOutlookForecast(OUTLOOK_MODEL, __bars, __now, ${fx.checkpoint.k}), "coinbase")`)));
ok(rec.id === `${pkg.id}|${fx.origin}` && rec.origin === fx.origin && rec.target === fx.origin + HOUR, "a record keeps its model, origin and target");
ok(rec.targetPrice === fx.checkpoint.k && rec.pAbove > 0, "…and the target and its probability at issue");
sandbox.__rec = rec;
const list = JSON.parse(JSON.stringify(run("modelOutlookAppend(modelOutlookAppend([], __rec), __rec)")));
ok(list.length === 1, "two tabs writing the same hour write one record");
// Outcome: the bar ending at the target completes later
const outcomeBar = { time: fx.origin, close: Math.max(rec.hi, rec.targetPrice) + 1 };
sandbox.__settleBars = [...fx.bars, outcomeBar];
const before = JSON.stringify(list);
const outcomes = JSON.parse(JSON.stringify(run(`modelOutlookSettle(${before}, {}, __settleBars, ${fx.origin + HOUR + 1})`)));
ok(outcomes[rec.id] && outcomes[rec.id].close === outcomeBar.close && outcomes[rec.id].inside === false, "the outcome is the close of the bar ending at the target");
ok(outcomes[rec.id].above === true, "…and says whether it closed above the target");
ok(JSON.stringify(list) === before, "settling writes beside the forecast and never into it");
const notYet = JSON.parse(JSON.stringify(run(`modelOutlookSettle(${before}, {}, __settleBars, ${fx.origin + HOUR - 1})`)));
ok(!notYet[rec.id], "an hour not yet ended settles nothing");
const tally = JSON.parse(JSON.stringify(run(`modelOutlookTally(${before}, ${JSON.stringify(outcomes)})`)));
ok(tally.n === 1 && tally.inside === 0, "the tally counts scored forecasts and the ones inside");
ok(run(`modelOutlookAppend(Array.from({ length: MODEL_OUTLOOK_RECORDS_MAX }, (_, i) => ({ id: "r" + i })), { id: "new" }).length`) === run("MODEL_OUTLOOK_RECORDS_MAX"), "the record is bounded");

console.log(`✔ ${checks} model-outlook checks`);
console.log("MODEL OUTLOOK TESTS OK");
