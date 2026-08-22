// Onboarding tour regression tests: step definitions stay well-formed and
// anchored to real elements, the tour only runs once (localStorage gate),
// navigation clamps at both ends, and a missing target skips instead of
// blocking. Runs config.js + onboarding.js in a vm context with a stubbed
// React whose setState applies synchronously.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const base = path.join(__dirname, "..", "src");

/* ── sandbox ────────────────────────────────────────────────────────────── */

const tagged = (name) => {
  const fn = (...args) => fn;
  fn.attrs = () => tagged(name);
  return new Proxy(fn, {
    get: (t, p) => (p in t ? t[p] : tagged(name)),
    apply: () => tagged(name),
  });
};
const styledStub = new Proxy(function styled() { return tagged("styled"); }, {
  get: (t, p) => (p === "default" ? styledStub : tagged(p.toString())),
  apply: () => tagged("styled"),
});

// Synchronous setState so assertions can run right after each action
class ComponentStub {
  constructor(props) {
    this.props = props || {};
  }
  setState(update, cb) {
    const partial = typeof update === "function" ? update(this.state, this.props) : update;
    Object.assign(this.state, partial);
    if (cb) cb();
  }
}

const store = {};
const timers = []; // captured setTimeout callbacks (the 600ms start delay)
let queryResult = null; // what document.querySelector returns

const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number, String,
  Boolean, Symbol, Proxy, RegExp, Error, parseInt, parseFloat, isFinite, isNaN,
  clearTimeout: () => {},
  setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
  requestAnimationFrame: () => 0, // never runs — retries stay pending
  cancelAnimationFrame: () => {},
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  styled: styledStub,
  keyframes: tagged("keyframes"),
  css: tagged("css"),
  /* Defined in theme.js, which these sandboxes do not load. Anything
   * interpolated into a styled block by every file has to be stubbed
   * here too, or the file throws before a single assertion runs. */
  themedScrollbar: "",
  React: { Component: ComponentStub, createElement: () => null, Fragment: Symbol("Fragment") },
  window: {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  document: { querySelector: () => queryResult },
};
vm.createContext(sandbox);

for (const f of ["config.js", "onboarding.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const steps = JSON.parse(JSON.stringify(run("ONBOARDING_STEPS")));

/* ── step definitions ───────────────────────────────────────────────────── */

assert.ok(steps.length >= 3, "tour has steps");
for (const [i, s] of steps.entries()) {
  assert.ok(typeof s.title === "string" && s.title.length, `step ${i} has a title`);
  assert.ok(typeof s.text === "string" && s.text.length, `step ${i} has text`);
  assert.ok(
    s.selector === null || /^\[data-tour="[a-z-]+"\]$/.test(s.selector),
    `step ${i} selector is null or a data-tour selector`,
  );
}

// every data-tour selector must anchor to a real element in the app source
// (rendered as "data-tour": "x" literals or via Overview's dataTour prop)
const srcBlob = fs
  .readdirSync(base)
  .filter((f) => f.endsWith(".js") && f !== "onboarding.js")
  .map((f) => fs.readFileSync(path.join(base, f), "utf8"))
  .join("\n");
for (const s of steps) {
  if (!s.selector) continue;
  const name = s.selector.match(/"([a-z-]+)"/)[1];
  assert.ok(
    srcBlob.includes(`"data-tour": "${name}"`) || srcBlob.includes(`dataTour: "${name}"`),
    `tour anchor "${name}" exists in the app markup`,
  );
}

/* ── show-once gate ─────────────────────────────────────────────────────── */

const mount = () => {
  const tour = run("new OnboardingTour({})");
  tour.componentDidMount();
  return tour;
};

// already seen → never schedules the start timer
store["crypto_chart_onboarding_seen"] = "1";
let tour = mount();
assert.strictEqual(timers.length, 0, "seen tour does not start");
assert.strictEqual(tour.state.active, false, "seen tour stays inactive");

// first run → starts after the delay timer fires
delete store["crypto_chart_onboarding_seen"];
tour = mount();
assert.strictEqual(timers.length, 1, "unseen tour schedules its start");
timers.pop().fn();
assert.strictEqual(tour.state.active, true, "tour becomes active");
assert.strictEqual(tour.state.step, 0, "tour starts at the first step");

/* ── navigation ─────────────────────────────────────────────────────────── */

tour.goPrev();
assert.strictEqual(tour.state.step, 0, "goPrev clamps at the first step");

tour.goNext();
assert.strictEqual(tour.state.step, 1, "goNext advances");
tour.goPrev();
assert.strictEqual(tour.state.step, 0, "goPrev goes back");

// walking past the last step finishes the tour and persists the seen flag
for (let i = 0; i < steps.length; i++) tour.goNext();
assert.strictEqual(tour.state.active, false, "tour ends after the last step");
assert.strictEqual(store["crypto_chart_onboarding_seen"], "1", "finish persists the seen flag");

// once finished, a remount is a no-op
timers.length = 0;
tour = mount();
assert.strictEqual(timers.length, 0, "finished tour never restarts");

/* ── keyboard + missing-target skip ─────────────────────────────────────── */

delete store["crypto_chart_onboarding_seen"];
tour = mount();
timers.pop().fn();
// The tour calls preventDefault — Space would otherwise scroll the page out
// from under it — so the fake event needs one, like a real KeyboardEvent.
const keyEvent = (key) => ({ key, preventDefault() {} });
tour.handleKeyDown(keyEvent("ArrowRight"));
assert.strictEqual(tour.state.step, 1, "ArrowRight advances");
tour.handleKeyDown(keyEvent("ArrowLeft"));
assert.strictEqual(tour.state.step, 0, "ArrowLeft goes back");
tour.handleKeyDown(keyEvent("Escape"));
assert.strictEqual(tour.state.active, false, "Escape dismisses the tour");
assert.strictEqual(store["crypto_chart_onboarding_seen"], "1", "Escape persists the seen flag");

// a target that never appears is skipped instead of blocking the tour
delete store["crypto_chart_onboarding_seen"];
tour = mount();
timers.pop().fn();
tour.goNext(); // step 1 targets [data-tour="settings"]
queryResult = null;
tour.measure(0); // retries exhausted, element still missing
assert.strictEqual(tour.state.step, 2, "missing target skips to the next step");

// a present target is measured into a spotlight rect
queryResult = { getBoundingClientRect: () => ({ top: 10, left: 20, width: 30, height: 40 }) };
tour.measure(0);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(tour.state.rect)),
  { top: 10, left: 20, width: 30, height: 40 },
  "present target is measured",
);

console.log("ONBOARDING TESTS OK");
