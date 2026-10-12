/* The privacy page as the site reads (12 Oct 2026): the theme the visitor
 * chose on the site, and each heading typed out like a prompt, its section
 * rising in after it.
 *
 * A file of its own, not an inline script: this page also ships inside the
 * extension, where Manifest V3 runs no inline script. Without it — or under
 * reduced motion — the page is simply all there; nothing here hides text that
 * nothing will show. No request, no storage write: the theme is read, never
 * set, and only on the site's own origin does the key exist at all. */
(function () {
  var root = document.documentElement;

  /* The site's theme choice (site/index.html keeps it under this key). */
  try {
    var picked = localStorage.getItem("pricetab_site_theme");
    if (picked === "light" || picked === "dark") root.setAttribute("data-theme", picked);
  } catch (e) {
    /* storage refused: the system's setting decides, as with "auto" */
  }

  var still = false;
  try {
    still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    still = false;
  }
  if (still || !("IntersectionObserver" in window)) return;
  /* Before the first paint, so nothing shows and then hides */
  root.classList.add("pp-anim");

  var CHAR_MS = 26; // per character, so a long heading is still quick
  var TYPE_MAX_MS = 750;
  var RISE_GAP_MS = 70; // between the blocks of one section

  /* A heading's text goes into a span whose width grows to its measured
     width a character at a time — the site's own technique (sec-title). The
     text stays in the DOM, so a screen reader and a search read it whole. */
  function prepare(heading) {
    var text = heading.textContent;
    var span = document.createElement("span");
    span.className = "tw";
    span.textContent = text;
    heading.textContent = "";
    heading.appendChild(span);
    var width = span.scrollWidth;
    var chars = Math.max(1, text.trim().length);
    var ms = Math.min(TYPE_MAX_MS, chars * CHAR_MS);
    span.style.setProperty("--tw-w", width + "px");
    span.style.setProperty("--tw-n", String(chars));
    span.style.setProperty("--tw-ms", ms + "ms");
    return ms;
  }

  /* The blocks a heading introduces: everything after it up to the next one */
  function blocksAfter(heading) {
    var out = [];
    var n = heading.nextElementSibling;
    while (n && n.tagName !== "H2" && n.tagName !== "FOOTER") {
      out.push(n);
      n = n.nextElementSibling;
    }
    return out;
  }

  function play(heading, blocks, ms) {
    heading.classList.add("typing");
    blocks.forEach(function (b, i) {
      b.style.transitionDelay = ms + 60 + i * RISE_GAP_MS + "ms";
      b.classList.add("in");
    });
    /* Once typed, the heading may wrap again on a narrow screen */
    setTimeout(function () {
      heading.classList.remove("typing");
      heading.classList.add("typed");
    }, ms + 450);
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    var header = document.querySelector("main > header");
    var title = header && header.querySelector("h1");
    var lead = header ? Array.prototype.slice.call(header.children).filter(function (c) { return c !== title; }) : [];
    var intro = [];
    var first = header ? header.nextElementSibling : null;
    while (first && first.tagName !== "H2") {
      intro.push(first);
      first = first.nextElementSibling;
    }
    var sections = Array.prototype.map.call(document.querySelectorAll("main > h2"), function (h) {
      var blocks = blocksAfter(h);
      return { h: h, blocks: blocks, ms: prepare(h) };
    });
    var footer = document.querySelector("main > footer");

    // The title first, on arrival
    if (title) {
      var ms = prepare(title);
      requestAnimationFrame(function () { play(title, lead.concat(intro), ms); });
    }

    var seen = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          seen.unobserve(e.target);
          if (e.target === footer) {
            footer.classList.add("in");
            return;
          }
          sections.forEach(function (s) {
            if (s.h === e.target) play(s.h, s.blocks, s.ms);
          });
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    sections.forEach(function (s) { seen.observe(s.h); });
    if (footer) seen.observe(footer);
  }

  /* After the font: a width measured against the fallback face is the wrong
     width, and the heading would end clipped by a character or two. */
  function ready() {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start, start);
    else start();
    // A font that never settles must not keep the page hidden
    setTimeout(start, 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
