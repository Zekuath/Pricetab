/* KEYBOARD SHORTCUTS REFERENCE
 * The shortcuts are the fastest way to use the extension and the least
 * discoverable part of it: the first-run tour mentions the buttons, not the
 * keys, and nothing else ever says they exist. This is the list, opened with
 * "?" or from Settings.
 *
 * The list is the single source of truth for what to advertise; the handlers
 * themselves live in app.js.
 */

const SHORTCUT_GROUPS = [
  {
    title: "Chart",
    items: [
      { keys: ["←", "→"], label: "Previous / next coin" },
      { keys: ["1", "–", "6"], label: "Switch range, 1H through ALL" },
      { keys: ["R"], label: "Refresh now" },
      { keys: ["C"], label: "Compare with a second coin" },
    ],
  },
  {
    title: "Open",
    items: [
      { keys: ["/"], label: "Jump to a coin by name" },
      { keys: ["A"], label: "Price targets" },
      { keys: ["S"], label: "Settings" },
      { keys: ["?"], label: "This list" },
    ],
  },
  {
    title: "Anywhere",
    items: [{ keys: ["Esc"], label: "Close whatever is open" }],
  },
];

/* ── styles ────────────────────────────────────────────────────────────── */

const shortcutsIn = keyframes`
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const ShortcutsOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 14vh 1rem 1rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(0, 0, 0, 0.88)"};
`;

const ShortcutsCard = styled.div`
  width: min(26rem, 100%);
  max-height: 70vh;
  overflow-y: auto;
  padding: 1.25rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  box-shadow: 0 8px 32px ${({ theme }) => theme.color.shadow};
  animation: ${shortcutsIn} 0.2s cubic-bezier(0.22, 1, 0.36, 1);
`;

const ShortcutsTitle = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.9rem;
`;

const ShortcutGroupTitle = styled.div`
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin: 0.9rem 0 0.35rem;

  &:first-of-type {
    margin-top: 0;
  }
`;

const ShortcutRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0;
  font-size: 0.8rem;
`;

const ShortcutKeys = styled.div`
  flex: 0 0 6.5rem;
  display: flex;
  gap: 0.25rem;
  align-items: center;
`;

const Key = styled.kbd`
  min-width: 1.35rem;
  padding: 0.15rem 0.35rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-bottom-width: 2px;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.bg};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.7rem;
  text-align: center;
  color: ${({ theme }) => theme.color.text};
`;

const KeySep = styled.span`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const ShortcutLabel = styled.span`
  flex: 1;
  min-width: 0;
  color: ${({ theme }) => theme.color.text};
`;

const ShortcutsNote = styled.div`
  margin-top: 1rem;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ── panel ─────────────────────────────────────────────────────────────── */

const ShortcutsPanel = ({ onClose }) =>
  React.createElement(
    ShortcutsOverlay,
    {
      onMouseDown: (e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      },
    },
    React.createElement(
      ShortcutsCard,
      null,
      React.createElement(ShortcutsTitle, null, "Keyboard shortcuts"),
      SHORTCUT_GROUPS.map((group) =>
        React.createElement(
          Fragment,
          { key: group.title },
          React.createElement(ShortcutGroupTitle, null, group.title),
          group.items.map((item) =>
            React.createElement(
              ShortcutRow,
              { key: item.label },
              React.createElement(
                ShortcutKeys,
                null,
                item.keys.map((key, i) =>
                  // A bare dash is a range ("1 – 6"), not a key to press
                  key === "–"
                    ? React.createElement(KeySep, { key: i }, "–")
                    : React.createElement(Key, { key: i }, key),
                ),
              ),
              React.createElement(ShortcutLabel, null, item.label),
            ),
          ),
        ),
      ),
      React.createElement(
        ShortcutsNote,
        null,
        "Shortcuts pause while you're typing in a field.",
      ),
    ),
  );
