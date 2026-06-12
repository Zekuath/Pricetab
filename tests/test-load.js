// Full load-order test: run every src file in index.html order inside one vm
// context with stubbed React/styled/d3. Catches top-level ReferenceErrors,
// TDZ violations and duplicate top-level declarations across files.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const vm = require("vm");

const tagged = (name) => {
  const fn = (...args) => fn; // chainable + callable
  fn.attrs = () => tagged(name);
  return new Proxy(fn, {
    get: (t, p) => (p in t ? t[p] : tagged(name)),
    apply: () => tagged(name),
  });
};
const styledStub = new Proxy(function styled() { return tagged("styled"); }, {
  get: (t, p) => {
    if (p === "default") return styledStub;
    return tagged(p.toString());
  },
  apply: () => tagged("styled"),
});

class FakeComponent { constructor() {} setState() {} }
const ReactStub = {
  Component: FakeComponent,
  PureComponent: class extends FakeComponent {},
  createRef: () => ({ current: null }),
  Fragment: Symbol("Fragment"),
  createElement: () => null,
};

const chain = () => {
  const o = new Proxy(function () { return o; }, {
    get: (t, p) => (p === Symbol.toPrimitive ? () => "" : () => o),
    apply: () => o,
  });
  return o;
};
const d3Stub = new Proxy({}, { get: () => chain() });

const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number, String,
  Boolean, Symbol, Proxy, RegExp, Error, parseInt, parseFloat, isFinite, isNaN,
  setTimeout, clearTimeout, setInterval, clearInterval, AbortController,
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  navigator: { onLine: true },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  DOMParser: class { parseFromString() { return { querySelectorAll: () => [] }; } },
  React: ReactStub,
  ReactDOM: { render: () => {} },
  d3: d3Stub,
  interpolatePath: () => () => "",
  document: {
    createElement: () => ({ style: {}, setAttribute: () => {} }),
    body: { appendChild: () => {}, style: {} },
    addEventListener: () => {},
    hidden: false,
    title: "",
  },
};
sandbox.window = Object.assign(Object.create(null), sandbox, {
  styled: styledStub,
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {},
});
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const order = fs
  .readFileSync(path.join(ROOT, "index.html"), "utf8")
  .match(/src\/[a-z-]+\.js/g)
  .filter((s, i, a) => a.indexOf(s) === i && !s.includes("theme-init"));
console.log("load order:", order.join(" → "));

for (const f of order) {
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
    console.log("LOADED OK:", f);
  } catch (e) {
    console.error("LOAD FAILED:", f, "—", e.message);
    process.exit(1);
  }
}
console.log("ALL FILES LOAD CLEANLY IN DOCUMENT ORDER");
