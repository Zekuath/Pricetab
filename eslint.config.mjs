// ESLint flat config — PriceTab
//
// This repo has no bundler, no module system and no types: src/*.js load as
// classic <script> tags into one shared global scope. That means a typo, a
// stale reference left behind by a half-finished refactor, or a call to a
// helper that no longer exists survives all the way to a blank new tab.
// no-undef is the closest thing this project can have to a compiler.
//
// Dependencies live in tests/node_modules (the repo root stays npm-free so the
// packaged extension directory contains nothing but shipped files), so the
// plugins are required through a resolver anchored at tests/.
//
// Run:  npm --prefix tests run lint
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(new URL("./tests/package.json", import.meta.url));
const js = require("@eslint/js");
const security = require("eslint-plugin-security");
const globals = require("globals");

const here = path.dirname(new URL(import.meta.url).pathname);

// --- the shared global scope -------------------------------------------
// Derived from the source rather than hand-listed: there are ~850 top-level
// bindings and a static copy would be stale within a week. Every top-level
// const/let/var/function/class in src/ is a global that any other file may
// legitimately reference at runtime.
//
// Note on load order: CLAUDE.md's rule is that a file may only *execute*
// references to bindings declared in files loaded before it, while runtime
// calls inside functions may reference anything. no-undef cannot tell those
// apart, so this config deliberately declares every project binding for every
// file. It catches undefined and misspelled names — not ordering. Ordering is
// still enforced by tests/test-load.js and the jsdom smoke test.
// `let`/`var` bindings are mutable module state (cache handles, in-flight
// promise guards, debounce timers) and must be "writable", or no-global-assign
// fires on every legitimate reassignment. Everything else is "readonly", which
// is what makes no-global-assign useful: reassigning a const export is a bug.
const projectGlobals = {};
for (const file of fs.readdirSync(path.join(here, "src")).filter((f) => f.endsWith(".js"))) {
  const body = fs.readFileSync(path.join(here, "src", file), "utf8");
  for (const m of body.matchAll(/^(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    projectGlobals[m[2]] = m[1] === "let" || m[1] === "var" ? "writable" : "readonly";
  }
  // Top-level destructuring, e.g. `const { css, keyframes } = styled;`
  for (const m of body.matchAll(/^const\s*\{([^}]+)\}\s*=/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(":").pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) projectGlobals[name] = "readonly";
    }
  }
}

// Bundled in vendor/, so they are globals at runtime but declared nowhere in src/.
const vendorGlobals = {
  React: "readonly",
  ReactDOM: "readonly",
  styled: "readonly",
  d3: "readonly",
  // src/rate.js is the toolbar popup (loaded by rate.html, not index.html) and
  // is the one file that touches the extension API.
  chrome: "readonly",
};

export default [
  {
    ignores: [
      "vendor/**",
      "tests/node_modules/**",
      "assets/**",
      "site/**",
      "docs/**",
    ],
  },

  // --- extension source ------------------------------------------------
  {
    files: ["src/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      // Classic scripts, not modules — this is the whole architecture.
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...vendorGlobals,
        ...projectGlobals,
      },
    },
    plugins: { security },
    rules: {
      ...js.configs.recommended.rules,

      // The rules that earn their keep in a no-compiler codebase.
      "no-undef": "error",

      // In this architecture a top-level declaration IS the export: it puts a
      // name into the one shared scope for the files loaded after it. Both of
      // the following would otherwise fire on every single one of them.
      "no-implicit-globals": "off",
      "no-redeclare": ["error", { builtinGlobals: false }],
      "no-unused-vars": [
        "warn",
        {
          args: "none",
          // `catch (e) {}` with an unused binding is the deliberate
          // "fail quiet, fall back to cache" pattern used throughout api.js.
          caughtErrors: "none",
          // Skip the ~850 cross-file bindings (a helper defined in utils.js and
          // called from app.js is not unused, but ESLint sees one file at a
          // time and cannot know that). Locals are still checked.
          varsIgnorePattern: `^(?:_|${Object.keys(projectGlobals).join("|")})$`,
        },
      ],

      // Correctness, all cheap and all silent-failure classes.
      eqeqeq: ["warn", "smart"],
      "no-var": "warn",
      "prefer-const": "warn",
      "no-constant-binary-expression": "error",
      // `let ok = false; try { ok = … } catch { ok = false; }` is the codebase's
      // deliberate fail-quiet idiom. The rule is technically right that the
      // initialiser is redundant, but it is a style call, not a defect — so it
      // stays visible as a warning instead of failing the build.
      "no-useless-assignment": "warn",
      "no-self-compare": "error",
      "no-template-curly-in-string": "warn",
      "no-unmodified-loop-condition": "error",
      "require-atomic-updates": "off", // noisy on this codebase's async setState patterns

      // MV3 CSP forbids dynamic code. tests/test-invariants.js also asserts
      // this; keeping both means the editor flags it before the test run does.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // Security plugin: only the rules that are meaningful for a browser
      // extension with no filesystem and no server. The Node-oriented ones
      // (child_process, non-literal fs paths) are off because they cannot fire.
      "security/detect-unsafe-regex": "warn",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-eval-with-expression": "error",
      "security/detect-possible-timing-attacks": "off",
      "security/detect-object-injection": "off", // ~universal false positives on chart maths
    },
  },

  // --- test suite (Node, CommonJS) --------------------------------------
  {
    files: ["tests/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      // Same call as in src/: a redundant initialiser is a style note, not a
      // defect that should stop the build.
      "no-useless-assignment": "warn",
    },
  },
];
