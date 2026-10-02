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

/* `[a-z0-9-]`, not `[a-z-]`: `i18n.js` has a digit in it, and the old class
 * silently skipped the file rather than failing — the same shape of bug as the
 * ERC20 sweep's key regex, which could not match "1INCH" and reported success
 * on 55 of 56 tokens. So the count is asserted against the page as well: a
 * filename this cannot read now fails loudly instead of being left out of the
 * load order it exists to check. */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const order = (html.match(/src\/[a-z0-9-]+\.js/g) || []).filter(
  (s, i, a) => a.indexOf(s) === i && !s.includes("theme-init"),
);
const declared = (html.match(/<script src="\.\/src\/[^"]+"/g) || []).length;
if (order.length + 1 !== declared) {
  console.error(
    `✘ index.html declares ${declared} src scripts but the load order parsed ` +
      `${order.length + 1} — a file name this regex cannot read would be skipped`,
  );
  process.exit(1);
}
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
