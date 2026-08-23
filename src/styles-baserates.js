/* BASE RATES PANEL STYLES
 *
 * Split from `baserates.js` for the reason every other `styles-*.js` was: the
 * component is the behaviour, this is the look. **Loads before it** (see
 * `index.html`) — a styled component is built when its template literal runs.
 *
 * The panel's whole job is to make a *count* the loudest thing on the row, so
 * the type scale here is upside down compared with the rest of the app: the
 * sample size is not a footnote, it sits next to the figure at almost the same
 * weight. A percentage without its denominator is the failure this screen was
 * built to prevent.
 */
const baseRatesIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const BaseOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(0, 0, 0, 0.88)"};
`;

const BaseCard = styled.div`
  display: flex;
  flex-direction: column;
  width: min(46rem, 100%);
  max-height: min(42rem, calc(100vh - 3rem));
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  box-shadow: 0 8px 32px ${({ theme }) => theme.color.shadow};
  overflow: hidden;
  animation: ${baseRatesIn} 0.2s cubic-bezier(0.22, 1, 0.36, 1);
`;

const BaseHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 1rem 1.1rem 0.75rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

const BaseTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.text};
`;

const BaseEyebrow = styled.div`
  flex: 1;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseClose = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  padding: 0.15rem 0.45rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 1rem;
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};
  background: transparent;
  border: none;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

const BaseBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.9rem 1.1rem 1.1rem;
  ${themedScrollbar};
`;

/* The state now. One reading, said plainly, with the clock it was measured on
 * — the whole reason this panel exists is that the same three letters mean six
 * different numbers depending on which range is on screen. */
const BaseNow = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  margin-bottom: 0.9rem;
`;

const BaseNowValue = styled.div`
  font-size: 1.6rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  color: ${({ theme }) => theme.color.text};
`;

const BaseNowLabel = styled.div`
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseSectionLabel = styled.div`
  margin: 1.1rem 0 0.5rem;
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.2rem 1rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  margin-bottom: 0.5rem;
  /* A row about a state the coin is in right now is the one you came for */
  background: ${({ theme, live }) =>
    live ? theme.color.bg : "transparent"};
`;

const BaseRowTitle = styled.div`
  font-size: 0.82rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
`;

/* The count, and it is not small. `n` is the reason this panel can be trusted
 * and the reason most of its answers are "not enough" — putting it in a
 * footnote would be the same lie as leaving it out. */
const BaseCount = styled.div`
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: ${({ theme, weak }) =>
    weak ? theme.color.textSecondary : theme.color.text};
`;

const BaseDetail = styled.div`
  grid-column: 1 / -1;
  font-size: 0.72rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseCompare = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
`;

const BaseNote = styled.div`
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.7rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseEmpty = styled.div`
  padding: 1.4rem 0.4rem;
  text-align: center;
  font-size: 0.8rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseLoad = styled.button.attrs({ type: "button" })`
  display: block;
  margin: 0.6rem auto 0;
  padding: 0.4rem 0.9rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.74rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.text};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;
