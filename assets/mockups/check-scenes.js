/* Runs scenes.html's script for real, in a stubbed browser, and asserts each
 * scene resolves. `node --check` only proves the file parses — it said OK
 * while the script was dying on a ReferenceError for a helper an edit had
 * deleted, which is how fourteen blank screenshots got captured twice. */
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("assets/mockups/scenes.html", "utf8");
const src = html.slice(
  html.indexOf("<script>") + 8,
  html.lastIndexOf("</script>"),
);

const made = [];
const el = () => ({
  style: { cssText: "" },
  set src(v) { made.push(v); },
  addEventListener() {},
  appendChild() {},
});

const sandbox = {
  console,
  Date,
  Math,
  JSON,
  URLSearchParams,
  Image: function () { return el(); },
  localStorage: { _d: {}, clear() { this._d = {}; }, setItem(k, v) { this._d[k] = v; } },
  document: {
    body: { appendChild() {}, set textContent(v) { throw new Error("scene not found: " + v); } },
    createElement: el,
  },
  location: { search: "?scene=SCENE&theme=dark&delay=1000" },
};

const scenes = [
  "hero", "compare", "portfolio", "widgets", "widget-row", "targets", "candles",
  "dashboard", "wl-movers", "signals", "news", "presets",
  "settings-coins", "settings-prefs", "minimal",
];

let bad = 0;
for (const scene of scenes) {
  const ctx = vm.createContext({
    ...sandbox,
    localStorage: { _d: {}, clear() { this._d = {}; }, setItem(k, v) { this._d[k] = v; } },
    location: { search: `?scene=${scene}&theme=dark&delay=1000` },
  });
  try {
    vm.runInContext(src, ctx);
    const store = ctx.localStorage._d;
    const keys = Object.keys(store).length;
    if (!keys) throw new Error("no localStorage written");
    console.log(`  ok    ${scene.padEnd(16)} ${keys} anahtar`);
  } catch (e) {
    bad++;
    console.log(`  HATA  ${scene.padEnd(16)} ${e.message}`);
  }
}
console.log(bad ? `\n${bad} sahne kirik` : "\nhepsi calisiyor");
process.exit(bad ? 1 : 0);
