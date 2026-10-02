/* PriceTab on iPhone — the shim loaded before every other script.
 *
 * Five jobs, none of which touch the web app's own files:
 *   1. the phone's safe areas, the app's own bar, the tap highlight;
 *   2. the bridge: the page's own ticker cache and coin list, read off
 *      localStorage and posted to the app every minute and on load, so the
 *      home-screen widget draws what the page already knows; and the page's
 *      ground colour, so the app paints the status-bar band to match;
 *   3. the app's bar pressing the page's own keyboard shortcuts;
 *   4. a `chrome` the page can ask for notifications through — Chrome's API
 *      shape, answered by iOS's notification centre over the bridge — so the
 *      alarm's switch works here and the news permission (a Chrome host
 *      permission, no such thing on iOS) is honestly refused;
 *   5. the alarm's sound: iOS keeps an AudioContext silent until a touch
 *      has unlocked one, so the first touch unlocks a context and the page's
 *      own context creation is handed it.
 */
(() => {
  const style = document.createElement("style");
  style.textContent = [
    "html { -webkit-text-size-adjust: 100%; }",
    ":root { --pt-dock-lift: 4.5rem; }",
    "body { padding-bottom: calc(env(safe-area-inset-bottom) + 4.5rem); }",
    "* { -webkit-tap-highlight-color: transparent; }",
  ].join("\n");
  document.head.appendChild(style);
  document.documentElement.dataset.platform = "ios";
  window.PriceTabPlatform = "ios";

  const handler = () =>
    window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pricetab;
  const send = (body) => {
    const h = handler();
    if (!h) return false;
    try {
      h.postMessage(body);
      return true;
    } catch {
      return false;
    }
  };

  /* Round trips: a request carries an id, the app answers by calling
     PriceTabIOS.resolve(id, value). Without the app (the page in a plain
     WebKit) every ask resolves to false at once. */
  const pending = new Map();
  let nextId = 1;
  const ask = (body) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      if (!send({ ...body, id })) {
        pending.delete(id);
        resolve(false);
        return;
      }
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve(false);
        }
      }, 30000);
    });

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch {
      return fallback;
    }
  };

  const post = () => {
    if (!handler()) return;
    const coins = read("crypto_chart_coin_options", []);
    const currency = String(read("crypto_chart_currency", "USD") || "USD").replace(/"/g, "");
    const cache = read("crypto_chart_ticker_cache", null);
    const prices = {};
    if (cache && Array.isArray(cache.entries)) {
      for (const entry of cache.entries) {
        if (!Array.isArray(entry)) continue;
        const [key, value] = entry;
        if (typeof key !== "string" || !value || typeof value.price !== "number") continue;
        const [coin, cur] = key.split("-");
        if (!coin || (cur && cur !== currency)) continue;
        prices[coin] = {
          price: value.price,
          change: typeof value.change === "number" ? value.change : null,
        };
      }
    }
    let symbol = "";
    try {
      symbol = typeof getCurrencySymbol === "function" ? getCurrencySymbol(currency) : "";
    } catch {
      symbol = "";
    }
    send({
      kind: "snapshot",
      coins: Array.isArray(coins) ? coins : [],
      currency,
      symbol,
      prices,
    });
  };

  /* The page's own ground, so the app can paint the status-bar band in the
     same colour: the page's theme is its own setting and can differ from
     the phone's. Reported on load, again while the page settles, and
     whenever the theme flips (the root's attributes change). */
  let lastBg = "";
  const theme = () => {
    if (!handler()) return;
    try {
      const bg = getComputedStyle(document.body).backgroundColor;
      if (!bg || bg === lastBg) return;
      lastBg = bg;
      send({ kind: "theme", bg });
    } catch {
      /* nothing to report */
    }
  };

  /* ---- the alarm's sound: unlock a context on the first touch ---------- */
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let unlocked = null;
  const unlock = () => {
    if (unlocked || !Ctx) return;
    try {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(ctx.currentTime + 0.01);
      if (ctx.state === "suspended" && ctx.resume) ctx.resume();
      unlocked = ctx;
    } catch {
      unlocked = null;
    }
  };
  if (Ctx) {
    /* The page makes one context on first use and keeps it; handing it the
       unlocked one means the alarm sounds even when the first alarm comes
       before the first touch on that context. A context asked for before
       any touch is a fresh one, resumed on the next touch. */
    const Patched = function PriceTabAudioContext(...args) {
      if (unlocked) return unlocked;
      const ctx = new Ctx(...args);
      unlocked = ctx;
      return ctx;
    };
    Patched.prototype = Ctx.prototype;
    window.AudioContext = Patched;
    if (window.webkitAudioContext) window.webkitAudioContext = Patched;
    const onTouch = () => {
      if (unlocked && unlocked.state === "suspended" && unlocked.resume) {
        try {
          unlocked.resume();
        } catch {
          /* a refusal is silence, not an error */
        }
      } else if (!unlocked) unlock();
    };
    ["touchend", "pointerup", "click", "keydown"].forEach((ev) =>
      document.addEventListener(ev, onTouch, { passive: true }),
    );
  }

  /* ---- chrome, as far as the page needs it ------------------------------ */
  const chromeLike = window.chrome && typeof window.chrome === "object" ? window.chrome : {};
  chromeLike.runtime = chromeLike.runtime || {};
  chromeLike.runtime.lastError = undefined;
  if (!chromeLike.runtime.getURL) chromeLike.runtime.getURL = (path) => String(path).replace(/^\/+/, "");
  if (!chromeLike.runtime.getManifest) chromeLike.runtime.getManifest = () => ({ version: "1.6.0" });
  const isNotify = (q) => Boolean(q && Array.isArray(q.permissions) && q.permissions.includes("notifications"));
  chromeLike.permissions = {
    contains: (q, cb) => {
      (isNotify(q) ? ask({ kind: "notifyStatus" }) : Promise.resolve(false)).then((v) => cb && cb(Boolean(v)));
    },
    request: (q, cb) => {
      (isNotify(q) ? ask({ kind: "notifyRequest" }) : Promise.resolve(false)).then((v) => cb && cb(Boolean(v)));
    },
    remove: (q, cb) => {
      if (isNotify(q)) send({ kind: "notifyOff" });
      if (cb) cb(true);
    },
  };
  chromeLike.notifications = {
    create: (id, options) => {
      const o = options || {};
      send({ kind: "notify", id: String(id), title: String(o.title || "PriceTab"), message: String(o.message || "") });
    },
  };
  window.chrome = chromeLike;

  window.PriceTabIOS = {
    /* The native bar's way in: the page's own keyboard shortcuts, dispatched
       on the document the way a keyboard would — S, A, K, P, F, N, / and
       Escape are the same keys the "?" list advertises. */
    press: (key) => {
      try {
        const target = document.activeElement;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) target.blur();
        document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      } catch {
        /* nothing to press */
      }
    },
    resolve: (id, value) => {
      const r = pending.get(id);
      if (!r) return;
      pending.delete(id);
      r(value);
    },
  };

  window.addEventListener("load", () => {
    theme();
    [500, 1500, 3000, 6000].forEach((ms) => setTimeout(theme, ms));
    try {
      new MutationObserver(theme).observe(document.documentElement, { attributes: true, subtree: false });
      new MutationObserver(theme).observe(document.body, { attributes: true, subtree: false });
    } catch {
      /* no observer, the timers did their part */
    }
    setTimeout(post, 3000);
  });
  setInterval(post, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") post();
  });
})();
