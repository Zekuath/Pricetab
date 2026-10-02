/* Real alarms — a Chrome notification and a sound — and the permission that is
 * asked for in the app and never at install.
 *
 * **Why this is not a permission in the manifest.** `permissions: []` is the
 * product's central claim and the store listing rests on it: nothing is
 * granted when the extension is installed, and Chrome raises no install-time
 * warning. `notifications` therefore lives in `optional_permissions`, which
 * Chrome grants only when somebody presses a button, and the button is inside
 * the panel that wants it — the same shape the news panel already uses for its
 * six newsrooms. `tests/test-invariants.js` §1 enforces both halves.
 *
 * **What it can and cannot do, said plainly wherever it is offered.** There is
 * no background service worker here: this extension is a new-tab page, so it
 * runs while a tab is open and not otherwise. A target hit or a liquidation is
 * announced when a PriceTab tab is open — including one sitting in the
 * background, which is the case that matters and the one the tab title alone
 * could never cover, because a title you are not looking at says nothing. With
 * no tab open, nothing fires, and the row says so rather than implying a
 * watchman that is not there.
 *
 * **The sound is a separate switch and needs no permission.** It is generated,
 * not a file: two short tones from an oscillator, so nothing is downloaded and
 * nothing ships. Chrome's autoplay policy still requires the page to have been
 * interacted with; a tab opened and never touched refuses to play, which is
 * why the switch says "while a tab is open" and why the failure is swallowed
 * rather than reported as an error the person could do nothing about.
 */

/* `chrome.permissions` is absent in a plain page and in the test harness, so
 * everything here degrades to "nothing is granted" rather than throwing. That
 * is also the honest answer there: without the API there is no way to ask.
 *
 * Shared with the news panel, which is why it lives in this file rather than
 * in that one — two copies of "is there a permissions API" is two places for
 * the answer to drift. */
const hasPermissionsApi = () =>
  typeof chrome !== "undefined" &&
  chrome.permissions &&
  typeof chrome.permissions.contains === "function";

/* Read `chrome.runtime.lastError` **first**, unconditionally, then the answer.
 *
 * Every one of these callbacks used to say `Boolean(granted) && !lastError`,
 * and `&&` short-circuits: on a refusal Chrome passes `undefined`, so
 * `Boolean(undefined)` was false, the right-hand side never ran, and
 * `lastError` was never touched. Chrome only counts an error as handled once
 * something reads that property — so the one line written to check it was the
 * reason the console filled with *"Unchecked runtime.lastError: Only
 * permissions specified in the manifest may be requested."* on every load of a
 * profile whose installed manifest predates the optional key. Reading it first
 * also means the refusal is what it always should have been: "not granted",
 * not an unhandled error.
 */
const readGranted = (value) => {
  const failed = Boolean(
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError,
  );
  return !failed && Boolean(value);
};

const NOTIFY_PERMISSION = "notifications";

const notifyPermissionHeld = () =>
  new Promise((resolve) => {
    if (!hasPermissionsApi()) return resolve(false);
    try {
      chrome.permissions.contains({ permissions: [NOTIFY_PERMISSION] }, (granted) =>
        resolve(readGranted(granted)),
      );
    } catch (error) {
      resolve(false);
    }
  });

/* Must be called straight out of a click. Chrome refuses a permission request
 * that is not tied to a user gesture, and it refuses it silently enough that
 * routing this through a promise chain first is indistinguishable from the
 * person having declined. */
const requestNotifyPermission = () =>
  new Promise((resolve) => {
    if (!hasPermissionsApi() || typeof chrome.permissions.request !== "function") {
      return resolve(false);
    }
    try {
      chrome.permissions.request({ permissions: [NOTIFY_PERMISSION] }, (granted) =>
        resolve(readGranted(granted)),
      );
    } catch (error) {
      resolve(false);
    }
  });

/* Giving it back is a control of its own, in the same row. A permission you
 * cannot withdraw without going to `chrome://extensions` is one you think
 * twice about granting. */
const dropNotifyPermission = () =>
  new Promise((resolve) => {
    if (!hasPermissionsApi() || typeof chrome.permissions.remove !== "function") {
      return resolve(false);
    }
    try {
      chrome.permissions.remove({ permissions: [NOTIFY_PERMISSION] }, (done) =>
        resolve(readGranted(done)),
      );
    } catch (error) {
      resolve(false);
    }
  });

/* The API only exists once the permission is held — an optional permission is
 * not merely ungranted, its namespace is absent — so this is a second check
 * and not a duplicate of the first. */
const canFireNotification = () =>
  typeof chrome !== "undefined" &&
  chrome.notifications &&
  typeof chrome.notifications.create === "function";

const fireNotification = (id, title, message) => {
  if (!canFireNotification()) return false;
  try {
    chrome.notifications.create(String(id), {
      type: "basic",
      iconUrl:
        typeof chrome.runtime !== "undefined" && chrome.runtime.getURL
          ? chrome.runtime.getURL("assets/icons/icon128.png")
          : "assets/icons/icon128.png",
      title: String(title),
      message: String(message),
      priority: 2,
    });
    return true;
  } catch (error) {
    return false;
  }
};

/* **The sound, generated rather than shipped.**
 *
 * Two short tones a fifth apart, the second a little quieter — enough to be
 * recognisable across a room and short enough not to be a nuisance in an
 * office. An oscillator costs no file, no request and no bytes in the package,
 * and a bundled sound file would be the first binary asset in the extension
 * that is not an icon.
 *
 * One `AudioContext` for the life of the page, made on first use: a context
 * per alarm leaks them, and Chrome caps how many a page may have. It arrives
 * `suspended` unless the page has been interacted with, so a resume is
 * attempted and its refusal is swallowed — nothing the person can act on, and
 * the row already says the alarm needs a tab that is open.
 */
const ALARM_TONES = [880, 1320];
const ALARM_TONE_MS = 160;
let alarmAudio = null;

const alarmContext = () => {
  const Ctx =
    typeof window !== "undefined" &&
    (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  if (!alarmAudio) {
    try {
      alarmAudio = new Ctx();
    } catch (error) {
      return null;
    }
  }
  if (alarmAudio.state === "suspended" && alarmAudio.resume) {
    try {
      alarmAudio.resume();
    } catch (error) {
      /* autoplay policy: a tab nobody has touched does not get to make noise */
    }
  }
  return alarmAudio;
};

const playAlarmTone = () => {
  const ctx = alarmContext();
  if (!ctx || ctx.state !== "running") return false;
  try {
    ALARM_TONES.forEach((hz, i) => {
      const at = ctx.currentTime + (i * ALARM_TONE_MS) / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      /* Ramped rather than switched: a square edge on a sine is a click, and
         a click is what a cheap alarm sounds like. */
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(i === 0 ? 0.14 : 0.1, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + ALARM_TONE_MS / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + ALARM_TONE_MS / 1000 + 0.02);
    });
    return true;
  } catch (error) {
    return false;
  }
};

/* One call for both features. The two switches are independent — a
 * notification with no sound is the quiet option somebody in an office wants,
 * and a sound with no notification is the one somebody who dislikes system
 * banners wants — so neither is a fallback for the other. */
const announceAlarm = ({ id, title, message, notify, sound }) => {
  let told = false;
  if (notify) told = fireNotification(id, title, message);
  if (sound) told = playAlarmTone() || told;
  return told;
};
