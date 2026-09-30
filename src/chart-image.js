/* THE CHART AS AN IMAGE — "Save as image" (I, or the chart's drawer).
 *
 * Asked for on 27 Sep 2026 among "the features the sector has and we do
 * not" (*"sektörde olan bizde olmayan gerekli özellikleri ekle"*): every
 * charting venue lets you keep a picture of what you are looking at, to send
 * to somebody or to file next to a decision. This one is **local**: the SVG
 * already on screen is drawn onto a canvas and handed to the browser as a
 * download. Nothing is uploaded, no host is added and no permission is asked
 * — an `<a download>` needs none.
 *
 * **The clone is given its paint.** The chart's look lives partly in
 * attributes (d3 sets fill and stroke on most nodes) and partly in the
 * stylesheet (styled-components classes, the fonts, the live dot's pulse). A
 * cloned SVG carries only the attributes, and an SVG drawn as an image cannot
 * see the page's stylesheet at all — so every element's computed paint is
 * written onto its clone before serialising, and animation is stopped where
 * it stood. Pool nodes that are hidden stay hidden: `visibility` is one of
 * the properties copied.
 *
 * An SVG drawn as an image cannot load the page's web font either, so its
 * text falls back to the system monospace; the heading above the chart is
 * drawn on the canvas, where the page's font is loaded.
 */

const CHART_IMAGE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "visibility",
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "paint-order",
];

// Twice the CSS pixels, so the file is sharp on the screens it is sent to
const CHART_IMAGE_SCALE = 2;
// The band above the chart that names it
const CHART_IMAGE_HEAD = 64;

/* The file's name: the coin, the range and when, in a form every file
 * system accepts. Pure, so it is tested without a browser. */
const chartImageName = (coin, period, when) => {
  const d = when instanceof Date ? when : new Date(when);
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const safe = (s) => String(s || "").replace(/[^A-Za-z0-9]+/g, "").slice(0, 12) || "chart";
  return `pricetab-${safe(coin)}-${safe(period)}-${stamp}.png`;
};

const inlineChartPaint = (source, clone) => {
  const from = source.querySelectorAll("*");
  const to = clone.querySelectorAll("*");
  for (let i = 0; i < from.length && i < to.length; i += 1) {
    const cs = getComputedStyle(from[i]);
    let style = "";
    for (const p of CHART_IMAGE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) style += `${p}:${v};`;
    }
    to[i].setAttribute("style", `${style}animation:none;transition:none;`);
  }
};

/* Draws `svg` under a heading and offers it as a PNG. Resolves true once the
 * download has been handed to the browser, false if any step refused. */
const saveChartImage = ({ svg, title, note, colors, font, fileName }) =>
  new Promise((resolve) => {
    if (!svg || typeof XMLSerializer !== "function") {
      resolve(false);
      return;
    }
    const box = svg.getBoundingClientRect();
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    if (!(w > 0 && h > 0)) {
      resolve(false);
      return;
    }
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    inlineChartPaint(svg, clone);
    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = w * CHART_IMAGE_SCALE;
      canvas.height = (h + CHART_IMAGE_HEAD) * CHART_IMAGE_SCALE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.scale(CHART_IMAGE_SCALE, CHART_IMAGE_SCALE);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h + CHART_IMAGE_HEAD);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = colors.text;
      ctx.font = `600 18px ${font}`;
      ctx.fillText(title, 24, 32);
      ctx.fillStyle = colors.textSecondary;
      ctx.font = `12px ${font}`;
      ctx.fillText(note, 24, 52);
      ctx.drawImage(img, 0, CHART_IMAGE_HEAD, w, h);
      canvas.toBlob((png) => {
        if (!png) {
          resolve(false);
          return;
        }
        const href = URL.createObjectURL(png);
        const a = document.createElement("a");
        a.href = href;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1500);
        resolve(true);
      }, "image/png");
    };
    img.src = url;
  });
