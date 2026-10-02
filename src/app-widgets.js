/* THE WIDGETS ARRANGED THE WAY iOS ARRANGES THEM (1 Oct 2026, *"kenardan
 * özelleştirme yapmayalım, eklerken Apple iOS gibi yapalım, araştır"*).
 *
 * Researched against Apple's own help and the iOS 18 reviews before any of
 * it was written:
 *  - **adding** is a gallery: pick a widget, swipe through its sizes as live
 *    previews, press "Add Widget";
 *  - **a size** is changed from the menu a long press opens — iOS 18 puts the
 *    sizes there as shapes, above "Edit Widget" and "Remove Widget", and the
 *    removal is asked twice;
 *  - **arranging** is an edit mode: the widgets jiggle, a "−" on the corner
 *    removes one, a drag moves one, "Done" ends it.
 * So nothing sits on a card's edge at rest — the ×, the size letter and the
 * corner grip that were there for a day are gone. The menu opens from a long
 * press, a right click, or Enter on a focused card; the keyboard reaches
 * everything a pointer does.
 *
 * Handlers attached to CryptoChart with `Object.assign(this,
 * widgetArrangeHandlers(this))`; the three render helpers are called from
 * app.js's widgets drawer. Loads before app.js. */

const WIDGET_HOLD_MS = 480;
const WIDGET_HOLD_SLOP = 8;
const WIDGET_MENU_W = 248;
const WIDGET_MENU_H = 196;

const widgetArrangeHandlers = (app) => ({
  /* The menu for one card, placed under it — or over it when there is no
     room below — and kept inside the window. */
  openWidgetMenu(key, node) {
    // A card in the drawer, or one pinned to the home screen (renderPinnedStack)
    const card = node && node.closest ? node.closest("[data-widget], [data-pinned]") : null;
    if (!card) return;
    app._widgetMenuFrom = card;
    const r = card.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDGET_MENU_W - 8));
    const below = r.bottom + 8;
    const top = below + WIDGET_MENU_H < window.innerHeight ? below : Math.max(8, r.top - WIDGET_MENU_H - 8);
    app.setState({ widgetMenu: { key, top, left, confirm: false } });
    if (!app._widgetMenuOn) {
      document.addEventListener("keydown", app.widgetMenuKey, true);
      document.addEventListener("mousedown", app.widgetMenuOutside, true);
      app._widgetMenuOn = true;
    }
  },

  closeWidgetMenu() {
    if (app._widgetMenuOn) {
      document.removeEventListener("keydown", app.widgetMenuKey, true);
      document.removeEventListener("mousedown", app.widgetMenuOutside, true);
      app._widgetMenuOn = false;
    }
    if (app.state.widgetMenu) {
      const key = app.state.widgetMenu.key;
      app.setState({ widgetMenu: null }, () => {
        // Focus goes back to the card it came from, as a menu's should
        const from = app._widgetMenuFrom;
        const card = from && from.isConnected ? from : document.querySelector(`[data-widget="${key}"]`);
        app._widgetMenuFrom = null;
        if (card && card.focus) card.focus();
      });
    }
  },

  /* Esc closes the menu before it reaches the handler that closes the
     drawer — the capture phase decides between listeners on one document. */
  widgetMenuKey(e) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    app.closeWidgetMenu();
  },

  widgetMenuOutside(e) {
    if (e.target.closest && e.target.closest("[data-widget-menu]")) return;
    // This press closed the menu and nothing more (see widgetsOutside)
    e.ptWidgetMenuClosed = true;
    app.closeWidgetMenu();
  },

  setWidgetCardSize(key, size) {
    if (!WIDGET_CARD_SIZES.includes(size)) return;
    const sizes = { ...(app.state.widgetCardSizes || {}), [key]: size };
    saveWidgetCardSizes(sizes);
    app.setState({ widgetCardSizes: sizes });
  },

  /* Removed is switched off — the gallery is where it comes back from. The
     menu asks twice, the way iOS does; the edit mode's "−" is the second
     ask already, because entering edit mode was the first. */
  removeWidget(key) {
    app.setState(
      (prev) => {
        const widgets = { ...prev.widgets, [key]: false };
        saveWidgetsToStorage(widgets);
        const hidden = { ...(prev.hiddenWidgets || {}) };
        delete hidden[key];
        saveHiddenWidgetsToStorage(hidden);
        const pinned = (prev.pinnedWidgets || []).filter((k) => k !== key);
        savePinnedWidgets(pinned);
        return { widgets, hiddenWidgets: hidden, widgetMenu: null, pinnedWidgets: pinned };
      },
      () => app.ensureCoinSweep(),
    );
    app.closeWidgetMenu();
  },

  /* Pinned to the home screen's corner, or not. A full stack refuses the
     fifth and the menu says why rather than dropping the oldest unasked. */
  togglePinWidget(key) {
    const pins = app.state.pinnedWidgets || [];
    const next = pins.includes(key) ? pins.filter((k) => k !== key) : pins.length >= WIDGET_PIN_MAX ? pins : [...pins, key];
    if (next === pins) return;
    savePinnedWidgets(next);
    app.setState({ pinnedWidgets: next });
    app.closeWidgetMenu();
  },

  /* Edit, from the drawer's head or from a menu — a pinned card's menu too,
     where the drawer is not out yet: it comes out, arranging. */
  startWidgetEditing() {
    app.closeWidgetMenu();
    if (app.leftDrawer() !== "widgets") app.showLeftDrawer("widgets");
    app.setState({ widgetsEditing: true, widgetsChoosing: false });
  },

  stopWidgetEditing() {
    app.setState({ widgetsEditing: false, widgetsChoosing: false, widgetGalleryKey: null });
  },

  /* A long press: held still for WIDGET_HOLD_MS on a card, not while
     editing (there a press is the start of a drag, as on iOS). */
  widgetPressStart(e, key) {
    if (app.state.widgetsEditing || e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const node = e.currentTarget;
    app.widgetPressCancel();
    const moved = (ev) => {
      if (Math.abs(ev.clientX - x0) > WIDGET_HOLD_SLOP || Math.abs(ev.clientY - y0) > WIDGET_HOLD_SLOP) app.widgetPressCancel();
    };
    app._widgetHold = {
      timer: window.setTimeout(() => {
        app.widgetPressCancel();
        app.openWidgetMenu(key, node);
      }, WIDGET_HOLD_MS),
      moved,
    };
    document.addEventListener("pointermove", moved);
    document.addEventListener("pointerup", app.widgetPressCancel);
    document.addEventListener("pointercancel", app.widgetPressCancel);
  },

  widgetPressCancel() {
    const hold = app._widgetHold;
    if (!hold) return;
    window.clearTimeout(hold.timer);
    document.removeEventListener("pointermove", hold.moved);
    document.removeEventListener("pointerup", app.widgetPressCancel);
    document.removeEventListener("pointercancel", app.widgetPressCancel);
    app._widgetHold = null;
  },

  widgetContextMenu(e, key) {
    e.preventDefault();
    app.widgetPressCancel();
    app.openWidgetMenu(key, e.currentTarget);
  },

  // Enter, Space, the menu key or Shift+F10 on a focused card
  widgetCardKey(e, key) {
    if (e.target !== e.currentTarget) return;
    const menu = e.key === "Enter" || e.key === " " || e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);
    if (!menu) return;
    e.preventDefault();
    e.stopPropagation();
    app.openWidgetMenu(key, e.currentTarget);
  },

  // A bundle from the gallery, then back to the cards it made, arranging
  applyWidgetBundle(k) {
    app._widgetPreview = null;
    app.handleWidgetPreset(k);
    app.setState({ widgetsChoosing: false, widgetGalleryKey: null, widgetsEditing: true });
  },

  closeWidgetGallery() {
    app._widgetPreview = null;
    app.setState({ widgetsChoosing: false, widgetGalleryKey: null });
  },

  /* ── the gallery ── */
  openWidgetGallery() {
    app.closeWidgetMenu();
    app.setState({ widgetsChoosing: true, widgetGalleryKey: null, widgetGalleryQuery: "" });
  },

  /* A widget's page. Its data is asked for now, so the previews are the
     card as it would be rather than three skeletons. */
  pickGalleryWidget(key) {
    const size = widgetCardSize(app.state.widgetCardSizes, key);
    app.setState({ widgetGalleryKey: key, widgetGallerySize: WIDGET_CARD_SIZES.indexOf(size) }, () => {
      const c = document.querySelector("[data-widget-carousel]");
      if (c) c.scrollLeft = c.clientWidth * app.state.widgetGallerySize;
    });
    app._widgetPreview = key;
    app.fetchWidgets();
  },

  galleryCarouselScroll(e) {
    const c = e.currentTarget;
    const i = Math.round(c.scrollLeft / Math.max(1, c.clientWidth));
    if (i !== app.state.widgetGallerySize) app.setState({ widgetGallerySize: i });
  },

  galleryShowSize(i) {
    const c = document.querySelector("[data-widget-carousel]");
    if (c) c.scrollTo({ left: c.clientWidth * i });
    app.setState({ widgetGallerySize: i });
  },

  /* Add Widget: on, at the size on screen, first in the order (iOS places a
     new widget at the top), and back to the arranged cards in edit mode. */
  addGalleryWidget() {
    const key = app.state.widgetGalleryKey;
    if (!key) return;
    const size = WIDGET_CARD_SIZES[app.state.widgetGallerySize] || "s";
    const sizes = { ...(app.state.widgetCardSizes || {}), [key]: size };
    saveWidgetCardSizes(sizes);
    app._widgetPreview = null;
    app.setState(
      (prev) => {
        const widgets = { ...prev.widgets, [key]: true };
        saveWidgetsToStorage(widgets);
        const hidden = { ...(prev.hiddenWidgets || {}) };
        delete hidden[key];
        saveHiddenWidgetsToStorage(hidden);
        const order = [key, ...(prev.widgetOrder || []).filter((k) => k !== key)];
        saveWidgetOrderToStorage(order);
        return {
          widgets,
          hiddenWidgets: hidden,
          widgetOrder: order,
          widgetCardSizes: sizes,
          widgetsChoosing: false,
          widgetGalleryKey: null,
          widgetsEditing: true,
        };
      },
      () => {
        app.fetchWidgets();
        app.ensureCoinSweep();
      },
    );
  },
});

/* The size names, said the same way in the menu and the gallery. */
const widgetSizeName = (size) =>
  size === "l" ? msg("widget_size_large", "large") : size === "m" ? msg("widget_size_medium", "medium") : msg("widget_size_small", "small");

/* The menu: sizes as shapes, Edit Widgets, Remove Widget (asked twice). */
const renderWidgetMenu = (app, labels) => {
  const m = app.state.widgetMenu;
  if (!m) return null;
  const size = widgetCardSize(app.state.widgetCardSizes, m.key);
  const name = labels[m.key] || m.key;
  return React.createElement(
    WidgetMenu,
    {
      role: "menu",
      "aria-label": msg("widget_menu_aria", "$1 widget", name),
      "data-widget-menu": m.key,
      style: { top: `${m.top}px`, left: `${m.left}px` },
      innerRef: (n) => {
        // The size it is takes the focus, so arrows and Enter work at once
        if (n && !app._widgetMenuFocused) {
          app._widgetMenuFocused = true;
          const b = n.querySelector("[aria-checked='true']");
          if (b) b.focus();
        }
        if (!n) app._widgetMenuFocused = false;
      },
    },
    React.createElement(
      WidgetMenuSizes,
      { role: "group", "aria-label": msg("widget_menu_sizes", "Size") },
      ...WIDGET_CARD_SIZES.map((s) =>
        React.createElement(
          WidgetMenuSize,
          {
            key: s,
            role: "menuitemradio",
            "aria-checked": s === size ? "true" : "false",
            "aria-label": widgetSizeName(s),
            title: widgetSizeName(s),
            active: s === size,
            "data-widget-menu-size": s,
            onClick: () => {
              app.setWidgetCardSize(m.key, s);
              app.closeWidgetMenu();
            },
          },
          React.createElement(WidgetMenuShape, { size: s, active: s === size, "aria-hidden": "true" }),
        ),
      ),
    ),
    (() => {
      const pins = app.state.pinnedWidgets || [];
      const pinned = pins.includes(m.key);
      const full = !pinned && pins.length >= WIDGET_PIN_MAX;
      return React.createElement(
        WidgetMenuItem,
        {
          role: "menuitem",
          "data-widget-menu-pin": pinned ? "on" : "off",
          "aria-disabled": full ? "true" : undefined,
          onClick: () => (full ? null : app.togglePinWidget(m.key)),
          title: full ? msg("widget_menu_pin_full", "Four are pinned — unpin one first") : undefined,
        },
        pinned
          ? msg("widget_menu_unpin", "Unpin from Home")
          : full
            ? msg("widget_menu_pin_full", "Four are pinned — unpin one first")
            : msg("widget_menu_pin", "Pin to Home"),
        React.createElement("span", { "aria-hidden": "true" }, pinned ? "○" : "●"),
      );
    })(),
    React.createElement(
      WidgetMenuItem,
      { role: "menuitem", "data-widget-menu-edit": "1", onClick: app.startWidgetEditing },
      msg("widget_menu_edit", "Edit Widgets"),
      React.createElement("span", { "aria-hidden": "true" }, "⋯"),
    ),
    React.createElement(
      WidgetMenuItem,
      {
        role: "menuitem",
        destructive: true,
        "data-widget-menu-remove": m.confirm ? "confirm" : "ask",
        onClick: () => (m.confirm ? app.removeWidget(m.key) : app.setState({ widgetMenu: { ...m, confirm: true } })),
      },
      m.confirm ? msg("widget_menu_remove_confirm", "Remove — press again") : msg("widget_menu_remove", "Remove Widget"),
      React.createElement("span", { "aria-hidden": "true" }, "−"),
    ),
  );
};

/* The gallery: a search and every widget by group, or one widget's page
   with its sizes as live previews. `defs` are the cards app.js builds. */
const renderWidgetGallery = (app, defs, scale) => {
  const key = app.state.widgetGalleryKey;
  if (key && defs[key]) {
    const def = defs[key];
    const at = Math.max(0, Math.min(2, app.state.widgetGallerySize || 0));
    const added = app.state.widgets[key] === true;
    return React.createElement(
      WidgetDetail,
      { "data-widget-detail": key },
      React.createElement(WidgetDetailTitle, null, def.label),
      React.createElement(WidgetDetailDesc, null, WIDGET_DESCRIPTIONS[key] || ""),
      React.createElement(
        WidgetCarousel,
        {
          "data-widget-carousel": "1",
          onScroll: app.galleryCarouselScroll,
          tabIndex: 0,
          "aria-label": msg("widget_gallery_sizes", "Sizes — ← and → to see each"),
          onKeyDown: (e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              e.stopPropagation();
              app.galleryShowSize(Math.max(0, Math.min(2, at + (e.key === "ArrowRight" ? 1 : -1))));
            }
          },
        },
        ...WIDGET_CARD_SIZES.map((s) =>
          React.createElement(
            WidgetSlide,
            { key: s, "data-widget-slide": s, "aria-hidden": "true" },
            React.createElement(
              WidgetCard,
              { "data-widget": key, "data-size": s, scale, "data-preview": "true" },
              React.createElement(WidgetLabel, null, def.label),
              React.createElement(WidgetBody, { "data-size": s }, def.content),
              s === "l" && WIDGET_DESCRIPTIONS[key] ? React.createElement(WidgetFootnote, null, WIDGET_DESCRIPTIONS[key]) : null,
            ),
          ),
        ),
      ),
      React.createElement(WidgetSlideName, { "aria-live": "polite" }, widgetSizeName(WIDGET_CARD_SIZES[at])),
      React.createElement(
        WidgetDots,
        { role: "group", "aria-label": msg("widget_menu_sizes", "Size") },
        ...WIDGET_CARD_SIZES.map((s, i) =>
          React.createElement(WidgetDot, {
            key: s,
            active: i === at,
            "aria-pressed": i === at ? "true" : "false",
            "aria-label": widgetSizeName(s),
            onClick: () => app.galleryShowSize(i),
          }),
        ),
      ),
      React.createElement(
        WidgetAddButton,
        { onClick: app.addGalleryWidget, "data-widget-add": key },
        added ? msg("widget_gallery_use_size", "Use This Size") : msg("widget_gallery_add", "Add Widget"),
      ),
    );
  }
  const q = String(app.state.widgetGalleryQuery || "").trim().toLowerCase();
  const groups = WIDGET_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => defs[it.key] && (!q || `${it.label} ${it.desc}`.toLowerCase().includes(q))),
  })).filter((g) => g.items.length);
  return React.createElement(
    WidgetGallery,
    { "data-widget-gallery": "1" },
    React.createElement(WidgetGallerySearch, {
      type: "search",
      value: app.state.widgetGalleryQuery || "",
      placeholder: msg("widget_gallery_search", "Search widgets"),
      "aria-label": msg("widget_gallery_search", "Search widgets"),
      onChange: (e) => app.setState({ widgetGalleryQuery: e.target.value }),
    }),
    /* The bundles that were the Choose view's first row: a whole set at
       once, in place of what is there. */
    q
      ? null
      : React.createElement(
          Fragment,
          null,
          React.createElement(WidgetGalleryHead, null, msg("set_bundles", "Bundles")),
          React.createElement(
            WidgetGalleryGroup,
            null,
            ...["holder", "trader", "minimal"].map((k) =>
              React.createElement(
                WidgetGalleryRow,
                { key: k, "data-widget-bundle": k, onClick: () => app.applyWidgetBundle(k) },
                React.createElement(
                  "span",
                  null,
                  React.createElement(
                    WidgetGalleryName,
                    null,
                    k === "holder" ? msg("set_bundle_holder", "Holder") : k === "trader" ? msg("set_bundle_trader", "Trader") : msg("set_bundle_minimal", "Minimal"),
                  ),
                  React.createElement(WidgetGalleryDesc, null, msg("widget_bundle_desc", "$1 widgets, in place of the ones here", String(Object.keys(WIDGET_PRESETS[k] || {}).length))),
                ),
                React.createElement(WidgetGalleryTag, null, isPresetActive(app.state.widgets, k) ? msg("widget_gallery_added", "Added") : "›"),
              ),
            ),
          ),
        ),
    ...groups.map((g) =>
      React.createElement(
        Fragment,
        { key: g.title },
        React.createElement(WidgetGalleryHead, null, g.title),
        React.createElement(
          WidgetGalleryGroup,
          null,
          ...g.items.map((it) =>
            React.createElement(
              WidgetGalleryRow,
              { key: it.key, "data-widget-gallery-item": it.key, onClick: () => app.pickGalleryWidget(it.key) },
              React.createElement(
                "span",
                null,
                React.createElement(WidgetGalleryName, null, it.label),
                React.createElement(WidgetGalleryDesc, null, it.desc),
              ),
              React.createElement(
                WidgetGalleryTag,
                null,
                app.state.widgets[it.key] && !(app.state.hiddenWidgets || {})[it.key] ? msg("widget_gallery_added", "Added") : "›",
              ),
            ),
          ),
        ),
      ),
    ),
    groups.length ? null : React.createElement(WidgetEmptyNote, null, msg("widget_gallery_none", "No widget matches that")),
  );
};

/* **The pinned stack** — mockup C. The home screen keeps these few in its
 * lower-left corner: at rest only their edges and faint figures, so the
 * chart reads through them; under the pointer or the focus one fills in and
 * says a line more. A press opens the widgets drawer. Not drawn while a
 * drawer on that edge is out (it would sit under the drawer's glass), on a
 * phone, or with nothing pinned. */
const renderPinnedStack = (app, defs, scale, liftForTicker) => {
  const pins = (app.state.pinnedWidgets || []).filter((k) => defs[k] && app.state.widgets[k] && !(app.state.hiddenWidgets || {})[k]);
  // While a pinned card's menu is up the stack stays, so the menu has its card
  if (!pins.length || (app.leftDrawer() !== null && !(app.state.widgetMenu && pins.includes(app.state.widgetMenu.key)))) return null;
  return React.createElement(
    PinnedStack,
    { key: "pinned-stack", lift: liftForTicker, "data-pinned-stack": pins.join(",") },
    ...pins.map((key) =>
      React.createElement(
        PinnedCard,
        {
          key,
          scale,
          role: "button",
          tabIndex: 0,
          "data-pinned": key,
          // Its own size, the one the menu sets, as on the drawer's grid
          "data-size": widgetCardSize(app.state.widgetCardSizes, key),
          "data-menu-open": app.state.widgetMenu && app.state.widgetMenu.key === key ? "true" : undefined,
          "aria-haspopup": "menu",
          "aria-label": msg("widget_pinned_aria2", "$1, pinned — Enter opens the widgets, the menu key its options", defs[key].label),
          onClick: () => app.showLeftDrawer("widgets"),
          // A right click edits it where it is: size, unpin, Edit Widgets, remove
          onContextMenu: (e) => app.widgetContextMenu(e, key),
          onKeyDown: (e) => {
            if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
              e.preventDefault();
              e.stopPropagation();
              app.openWidgetMenu(key, e.currentTarget);
              return;
            }
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              app.showLeftDrawer("widgets");
            }
          },
        },
        React.createElement(WidgetLabel, null, defs[key].label),
        React.createElement(WidgetBody, { "data-size": widgetCardSize(app.state.widgetCardSizes, key), "data-widget-body": "true" }, defs[key].content),
      ),
    ),
  );
};

