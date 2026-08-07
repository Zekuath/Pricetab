/* COIN MARK
 * A small monogram badge for a coin: its symbol on a disc whose hue is
 * derived from the symbol itself, so every coin looks the same everywhere
 * and in every session.
 *
 * Deliberately not real brand logos: those would mean either shipping ~64
 * third-party trademark files or fetching them at runtime, and the
 * extension makes zero external requests by design. The letters carry the
 * identity; the colour is only a fast visual anchor.
 */

// Stable hue per symbol (FNV-style hash → 0-359). Same coin, same colour.
const coinMarkHue = (symbol) => {
  let hash = 2166136261;
  const s = String(symbol || "").toUpperCase();
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
};

// 1-3 letters: long symbols would just blur at this size
const coinMarkLabel = (symbol) => String(symbol || "?").toUpperCase().slice(0, 3);

// White text sits on a mid-dark disc, which keeps contrast usable across the
// whole hue circle in both themes.
const CoinMark = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ size }) => size || 1.5}rem;
  height: ${({ size }) => size || 1.5}rem;
  border-radius: 50%;
  background: hsl(${({ hue }) => hue}, 58%, 38%);
  color: #ffffff;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${({ size }) => (size || 1.5) * 0.42}rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  user-select: none;
`;

// Convenience wrapper so callers just pass the symbol
const coinMark = (symbol, size) =>
  React.createElement(
    CoinMark,
    {
      hue: coinMarkHue(symbol),
      size,
      "aria-hidden": "true",
      title: symbol,
    },
    coinMarkLabel(symbol),
  );
