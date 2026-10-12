#!/usr/bin/env node
/* The store's localized images, every language at once (11 Oct 2026).
 *
 *   node assets/mockups/store-kit.js            # the twelve languages after English
 *   node assets/mockups/store-kit.js tr de      # just these
 *
 * For each language: the five captures the frames are built around, made by
 * site-shots.js with the app in that language; the five 1280×800 frames from
 * store-frames.html with its own words (store-i18n.js); the small tile and the
 * marquee from promo-tiles.html. Into assets/upload/store-kit-2.0.0/<lang>/,
 * which git ignores. Live network, like site-shots.js. Local tooling. */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { createRequire } = require("module");

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
const ROOT = path.join(__dirname, "..", "..");
const KIT = path.join(ROOT, "assets", "upload", "store-kit-2.0.0");
const { chromium } = createRequire(path.join(ROOT, "tests", "package.json"))("playwright");
const LANGS = ["de", "es", "fr", "id", "it", "ja", "ko", "pt_BR", "ru", "tr", "uk", "zh_CN"];
const FRAMES = [["f01", "01-hero"], ["f02", "02-widgets"], ["f03", "03-news"], ["f04", "04-calls"], ["f05", "05-portfolio"]];
const TILES = [["small", "small-tile-440x280", 440, 280], ["marquee", "marquee-1400x560", 1400, 560]];
const SCENES = ["hero", "widgets", "newspreview", "calls", "portfolio"];

const size = (file) => {
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

(async () => {
  const want = process.argv.slice(2);
  const langs = want.length ? want : LANGS;
  for (const lang of langs) {
    const dir = path.join(KIT, lang);
    const shots = path.join(dir, "shots");
    fs.mkdirSync(path.join(dir, "screenshots"), { recursive: true });
    fs.mkdirSync(path.join(dir, "promo"), { recursive: true });
    console.log(`\n== ${lang}`);
    // A scene that fails once on the live network gets one more go
    for (let attempt = 0; attempt < 2; attempt++) {
      const missing = SCENES.filter((s) => !fs.existsSync(path.join(shots, `${s}.png`)));
      if (!missing.length) break;
      try {
        execFileSync("node", [path.join(__dirname, "site-shots.js"), `--lang=${lang}`, `--out=${shots}`, ...missing], { stdio: "inherit" });
      } catch (e) {
        console.log(`  (a scene failed; ${attempt ? "giving up" : "trying the missing ones again"})`);
      }
    }
    const browser = await chromium.launch();
    const rel = path.relative(path.join(ROOT, "assets", "mockups"), shots);
    for (const [id, name] of FRAMES) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
      await page.goto(`file://${path.join(__dirname, "store-frames.html")}?os=win&only=${id}&lang=${lang}&shots=${encodeURIComponent(rel)}`);
      await page.waitForTimeout(1200);
      const out = path.join(dir, "screenshots", `${name}.png`);
      await (await page.$(`#${id}`)).screenshot({ path: out });
      const [w, h] = size(out);
      console.log(`  ${w === 1280 && h === 800 ? "✔" : "✘"} screenshots/${name}.png ${w}×${h}`);
      await page.close();
    }
    for (const [id, name, W, H] of TILES) {
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await page.goto(`file://${path.join(__dirname, "promo-tiles.html")}?only=${id}&lang=${lang}&shots=${encodeURIComponent(rel)}`);
      await page.waitForTimeout(1000);
      const out = path.join(dir, "promo", `${name}.png`);
      await (await page.$(`#${id}`)).screenshot({ path: out });
      const [w, h] = size(out);
      console.log(`  ${w === W && h === H ? "✔" : "✘"} promo/${name}.png ${w}×${h}`);
      await page.close();
    }
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
