/* THE CHART'S TOOLS, ON THE APP'S SIDE (the chart plan's Phase 3)
 *
 * `chart-tools.js` draws and hit-tests; `ChartView` (chart-viewport.js) owns
 * the gestures; this owns what is kept: the drawings (`drawings`, persisted
 * per coin under `DRAWINGS_KEY`, in the backup like anything typed), the tool
 * in the hand (`chartTool`), the selected drawing and the one whose note is
 * being written. And the three surfaces a person reaches them by: the strip of
 * tools at the range row's right end, the selected drawing's menu (rendered
 * by `ChartView`) and the list in the chart's drawer (V), which reaches every
 * drawing from the keyboard.
 *
 * **A line becomes a target** through the targets drawer, not a new alarm:
 * "Price target here" opens it with the line's price in the form
 * (`pickedPrice`, the chart click's own path), so the target is set, checked
 * and announced by the machinery that already does all three.
 *
 * The tools stand down where the window in time does — with calls on and
 * under a comparison (`chartViewEnabled`). The pattern is `app-view.js`'s.
 */
const TOOL_ORDER = ["measure", "hline", "trend", "ray", "box", "note"];

const toolHandlers = (app) => ({
  /* This coin's drawings in this currency, the same array while nothing
     changed — the chart compares by identity. */
  drawingsFor: () => {
    const coin = app.state.coinOptions[app.state.coinIndex];
    const all = app.state.drawings;
    const currency = app.state.currency;
    const m = app._drawingsMemo;
    if (m && m.all === all && m.coin === coin && m.currency === currency) return m.out;
    const list = (all && all[coin]) || [];
    const out = list.filter((d) => d.currency === currency);
    app._drawingsMemo = { all, coin, currency, out };
    return out;
  },

  // Store and keep, in one step, so a reload is the same chart
  writeDrawings: (next, extra) => {
    const clean = sanitizeDrawings(next);
    saveDrawings(clean);
    app.setState(Object.assign({ drawings: clean }, extra || {}));
  },

  handleToolPick: (kind) => {
    if (!TOOL_ORDER.includes(kind)) return;
    app.setState((prev) => ({
      chartTool: prev.chartTool === kind ? null : kind,
      drawingSelected: null,
      drawingEditing: null,
    }));
  },

  handleDrawingAdd: ({ kind, a, b }) => {
    const coin = app.state.coinOptions[app.state.coinIndex];
    if (!coin || !DRAWING_KINDS.includes(kind)) return;
    const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const item = { id, kind, currency: app.state.currency, a, at: Date.now() };
    if (b) item.b = b;
    const all = app.state.drawings || {};
    const list = (all[coin] || []).concat([item]).slice(-DRAWINGS_MAX_PER_COIN);
    app.writeDrawings(Object.assign({}, all, { [coin]: list }), {
      chartTool: null,
      // The drawing is down: the tools fold back to their +
      toolsOpen: false,
      toolHint: null,
      drawingSelected: id,
      // A note is a place to write, so writing starts at once
      drawingEditing: kind === "note" ? id : null,
    });
  },

  handleDrawingChange: (id, patch) => {
    const coin = app.state.coinOptions[app.state.coinIndex];
    const all = app.state.drawings || {};
    const list = all[coin] || [];
    if (!list.some((d) => d.id === id)) return;
    const next = list.map((d) => {
      if (d.id !== id) return d;
      const out = Object.assign({}, d);
      if (patch.a) out.a = patch.a;
      if (patch.b && d.b) out.b = patch.b;
      if (typeof patch.note === "string") out.note = patch.note.trim().slice(0, DRAWING_NOTE_MAX);
      return out;
    });
    app.writeDrawings(Object.assign({}, all, { [coin]: next }));
  },

  handleDrawingDelete: (id) => {
    const coin = app.state.coinOptions[app.state.coinIndex];
    const all = app.state.drawings || {};
    const list = (all[coin] || []).filter((d) => d.id !== id);
    const next = Object.assign({}, all);
    if (list.length) next[coin] = list;
    else delete next[coin];
    app.writeDrawings(next, { drawingSelected: null, drawingEditing: null });
  },

  handleDrawingSelect: (id) => {
    app.setState({ drawingSelected: id || null, drawingEditing: null });
  },

  handleDrawingEdit: (id) => {
    app.setState(id ? { drawingSelected: id, drawingEditing: id } : { drawingEditing: null });
  },

  /* A horizontal line's price, in the targets drawer's form. The drawer is
     opened first and the price handed over once it is up, so the form that
     receives it is the one on screen. */
  handleDrawingTarget: (id) => {
    const d = app.drawingsFor().find((x) => x.id === id);
    if (!d || d.kind !== "hline") return;
    const price = d.a.p;
    if (app.state.alertsView !== "targets") app.showLeftDrawer("targets");
    app.setState({ drawingSelected: null, drawingEditing: null }, () => {
      setTimeout(() => app.handlePickTargetPrice(price), 0);
    });
  },

  /* Put the tool down and let the selection go — Esc, from anywhere the
     chart has the keyboard. True when there was something to let go of. */
  dropTools: () => {
    const s = app.state;
    if (!s.chartTool && !s.drawingSelected && !s.drawingEditing && !s.toolsOpen) return false;
    app.setState({ chartTool: null, drawingSelected: null, drawingEditing: null, toolsOpen: false, toolHint: null });
    return true;
  },

  /* ── The strip over the chart ──
   *
   * **A + at rest** (30 Sep 2026, asked for: *"normalde sadece bir + olabilir,
   * üzerinde hover olunca bir saniye sonra buna dönüşebilir veya tıklayınca
   * hemen"*). Six icons over a chart nobody is drawing on are six things to
   * read past; the + opens to them after the pointer rests on it for
   * `CHART_TOOLS_DWELL_MS`, at once on a press (Enter or Space from the
   * keyboard), and stays open while a tool is in the hand. It folds again
   * `CHART_TOOLS_LINGER_MS` after the pointer leaves. Pointing at a tool (or
   * focusing it) shows its name and what it does under the strip. Settings
   * can take the + away altogether (`CHART_TOOLS_KEY`). It sits at the range
   * row's right end, off the plot — see `ChartHead` in styles-app.js. */
  openTools: () => {
    clearTimeout(app._toolsDwell);
    clearTimeout(app._toolsLinger);
    if (!app.state.toolsOpen) app.setState({ toolsOpen: true });
  },
  closeTools: () => {
    clearTimeout(app._toolsDwell);
    clearTimeout(app._toolsLinger);
    if (app.state.toolsOpen || app.state.toolHint) app.setState({ toolsOpen: false, toolHint: null });
  },
  toolsPointerIn: () => {
    clearTimeout(app._toolsLinger);
    if (app.state.toolsOpen) return;
    clearTimeout(app._toolsDwell);
    app._toolsDwell = setTimeout(app.openTools, CHART_TOOLS_DWELL_MS);
  },
  toolsPointerOut: () => {
    clearTimeout(app._toolsDwell);
    if (!app.state.toolsOpen) return;
    clearTimeout(app._toolsLinger);
    app._toolsLinger = setTimeout(() => {
      // A tool in the hand keeps the strip out
      if (!app.state.chartTool) app.closeTools();
    }, CHART_TOOLS_LINGER_MS);
  },

  handleChartToolsShownChange: (enabled) => {
    saveChartTools(enabled);
    app.setState({ chartToolsShown: enabled, toolsOpen: false, toolHint: null, chartTool: enabled ? app.state.chartTool : null });
  },

  toolInfo: () => ({
    measure: [msg("tool_nm_measure", "Ruler"), msg("tool_ds_measure", "Drag across the chart for the change, the time, the bars, and how often it moved that far. Shift + drag works anywhere.")],
    hline: [msg("tool_nm_hline", "Horizontal line"), msg("tool_ds_hline", "One press: a level across the chart. Its menu can set a price target there.")],
    trend: [msg("tool_nm_trend", "Trend line"), msg("tool_ds_trend", "Two presses: a line between two points in time and price.")],
    ray: [msg("tool_nm_ray", "Ray"), msg("tool_ds_ray", "Two presses: a line that runs on past the second point.")],
    box: [msg("tool_nm_box", "Box"), msg("tool_ds_box", "Two presses: the opposite corners of a stretch of time and price.")],
    note: [msg("tool_nm_note", "Note"), msg("tool_ds_note", "One press, then type: words kept at a time and price.")],
  }),

  // The + is drawn at all: not hidden in Settings, and the chart takes a window
  chartToolsOn: () => app.chartViewEnabled() && app.state.chartToolsShown !== false,

  renderToolStrip: () => {
    if (!app.chartToolsOn()) return null;
    const tool = app.state.chartTool;
    const open = app.state.toolsOpen || Boolean(tool);
    const info = app.toolInfo();
    const icons = { measure: "ruler", hline: "hline", trend: "trend", ray: "ray", box: "box", note: "note" };
    const count = TOOL_ORDER.length;
    // The last tool pointed at stays in the hint while it fades
    if (app.state.toolHint) app._toolHintLast = app.state.toolHint;
    const hintKind = app.state.toolHint || app._toolHintLast;
    const hint = hintKind && info[hintKind];
    const label = open ? msg("tool_close", "Fold the tools away") : msg("tool_open", "Chart tools — draw and measure");
    /* The toggle is the same button open and shut, and first in the
       document — so a press from the keyboard keeps its focus, and the next
       Tab goes into the tools it opened. The tray draws it last. */
    const toggle = React.createElement(
      ChartToolToggle,
      {
        key: "toggle",
        shown: open,
        "data-chart-tools-open": "1",
        "aria-expanded": open ? "true" : "false",
        "aria-label": label,
        onClick: () => {
          if (!open) return app.openTools();
          app.setState({ chartTool: null });
          return app.closeTools();
        },
      },
      icon("plus", 1, 1.9),
    );
    return React.createElement(
      ChartToolsBox,
      {
        "data-chart-tools": open ? "open" : "shut",
        "data-tour": "tools",
        onMouseEnter: app.toolsPointerIn,
        onMouseLeave: app.toolsPointerOut,
      },
      React.createElement(
        ChartToolStrip,
        { role: "toolbar", "aria-label": msg("tool_strip", "Chart tools"), count, shown: open },
        toggle,
        React.createElement(ChartToolRule, { key: "rule", shown: open, "aria-hidden": "true" }),
        ...TOOL_ORDER.map((kind, i) =>
          React.createElement(
            ChartToolButton,
            {
              key: kind,
              on: tool === kind,
              shown: open,
              // In from the + outwards: the nearest first
              delay: 40 + (count - 1 - i) * 28,
              "aria-pressed": tool === kind ? "true" : "false",
              "aria-label": `${info[kind][0]} — ${info[kind][1]}`,
              "data-tool": kind,
              onClick: () => app.handleToolPick(kind),
              onMouseEnter: () => app.setState({ toolHint: kind }),
              onMouseLeave: () => app.setState({ toolHint: null }),
              onFocus: () => app.setState({ toolHint: kind }),
              onBlur: () => app.setState({ toolHint: null }),
            },
            icon(icons[kind], 1.125, 1.6),
          ),
        ),
      ),
      React.createElement(
        ChartToolHint,
        {
          role: "tooltip",
          shown: Boolean(open && app.state.toolHint),
          caret: hint ? toolCaretRem(TOOL_ORDER.indexOf(hintKind), count) - 0.0625 : 1,
          "data-tool-hint": hintKind || "",
        },
        hint ? React.createElement("strong", null, hint[0]) : null,
        hint ? React.createElement("span", null, hint[1]) : null,
      ),
    );
  },

  /* ── The list in the chart's drawer: every drawing, from the keyboard ── */
  renderDrawingsList: () => {
    const coin = app.state.coinOptions[app.state.coinIndex];
    const list = app.drawingsFor();
    const fmt = (v) => app.formatChartPrice(v);
    const kindName = {
      hline: msg("tool_kind_hline", "Line"),
      trend: msg("tool_kind_trend", "Trend"),
      ray: msg("tool_kind_ray", "Ray"),
      box: msg("tool_kind_box", "Box"),
      note: msg("tool_kind_note", "Note"),
    };
    const rows = list.map((d) =>
      React.createElement(
        DrawingRow,
        { key: d.id, "data-drawing-row": d.id, on: d.id === app.state.drawingSelected },
        React.createElement(
          DrawingRowName,
          {
            onClick: () => app.handleDrawingSelect(d.id === app.state.drawingSelected ? null : d.id),
            "aria-pressed": d.id === app.state.drawingSelected ? "true" : "false",
          },
          React.createElement("strong", null, kindName[d.kind]),
          " ",
          d.b ? `${fmt(d.a.p)} → ${fmt(d.b.p)}` : fmt(d.a.p),
          d.note ? React.createElement("em", null, ` · ${d.note}`) : null,
        ),
        d.kind === "hline"
          ? React.createElement(
              DrawingRowAction,
              { onClick: () => app.handleDrawingTarget(d.id), title: msg("tool_target_here", "Price target here") },
              msg("tool_target_short", "Target"),
            )
          : null,
        React.createElement(
          DrawingRowAction,
          {
            onClick: () => app.handleDrawingDelete(d.id),
            "aria-label": msg("tool_delete_named", "Delete: $1", `${kindName[d.kind]} ${fmt(d.a.p)}`),
          },
          "×",
        ),
      ),
    );
    return React.createElement(
      DrawingsBox,
      { "data-drawings-list": "1" },
      React.createElement(DrawingsHead, null, msg("tool_list_head", "Drawn on $1", coin)),
      rows.length
        ? React.createElement(DrawingsList, null, ...rows)
        : React.createElement(
            DrawingsEmpty,
            null,
            msg(
              "tool_list_empty",
              "Nothing yet. The tools over the chart draw lines, boxes and notes that stay with this coin on every range.",
            ),
          ),
    );
  },
});
