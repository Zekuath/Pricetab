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
  align-items: stretch;
  justify-content: stretch;
  /* **The window, like Settings** (26 Sep 2026, *"news kısmının tasarımını
     da elden geçir… aynı şekilde base rate'i de"*): no rim and no card in the
     middle of it. The screens share one head, one left edge and one ground
     now, so moving between them is a change of content, not of furniture. */
  padding: 0;
  /* **Opaque, and the chart is not behind it.**
     It was 85% white over 90% black, with the price line showing through as a
     ghost. Asked for on 23 Sep 2026: *"arka planda bizim ana grafik
     görünmesin… her bir tab'ı tam ekranda yapabiliriz"*. A panel that covers
     the screen and still shows the chart is neither one thing nor the other —
     the chart cannot be read through it and its own content is competing with
     a line. These are screens now, in the app's own ground. */
  background: ${({ theme }) => theme.color.bg};
  ${besideScreenSpine};
`;

const BaseCard = styled.div`
  display: flex;
  flex-direction: column;
  /* **A screen, not a dialog** — 23 Sep 2026, *"her bir tab'i tam ekranda
     yapabiliriz"*. A border, a radius and a drop shadow all mean the same
     thing: a layer floating above a page. Once the ground behind is opaque
     there is no page under it, so the three of them draw an outline around
     nothing — which is exactly what the panel looked like. The surface
     reaches the window instead and keeps only its fill, which is what the
     white controls inside it are read against. */
  width: 100%;
  height: 100vh;
  background: ${({ theme }) => theme.color.bg};
  overflow: hidden;
  animation: ${baseRatesIn} 0.2s cubic-bezier(0.22, 1, 0.36, 1);
`;

/* Settings' head, to the pixel: the same padding, rule and left edge. */
const BaseHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 1.8rem 2.5rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  @media (max-width: 600px) {
    padding: 1rem;
  }
`;

/* In the screens' own head type (27 Sep 2026): News, Settings and the
   derivatives page set their names in tracked capitals, and this one alone
   was in sentence case at 0.02em — one of five screens with a head of its
   own kind. */
const BaseTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};
  /* Its key sits beside it — see KeyCap. */
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
`;

const BaseEyebrow = styled.div`
  flex: 1;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* A reading column on the head's left edge: the rows keep a measure however
   wide the window, and the scroller still runs to its edge. */
const BaseBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.6rem 2.5rem 3rem;
  ${themedScrollbar};

  & > * {
    max-width: 52rem;
  }

  @media (max-width: 600px) {
    padding: 1rem 1rem 2rem;
  }
`;

/* The two columns: the states and the candlestick shapes, side by side on
 * a wide window and stacked under 1100px. Wider than the body's reading
 * measure, since each column keeps its own. */
const BaseColumns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 2.5rem;
  align-items: start;
  max-width: 110rem;

  @media (min-width: 1100px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
`;

const BaseColumn = styled.div`
  min-width: 0;
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
  /* A row about a state the coin is in right now is the one you came for:
     it wears the fill; the rest are outlines on the page's own ground. */
  background: ${({ theme, live }) =>
    live ? theme.color.bgSecondary : "transparent"};
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

/* What a pattern is *said* to mean, under its name. Quieter than the count
 * beside it and in the secondary ink on purpose: it is the folklore the row
 * exists to test, not a finding of this panel's. */
const BaseClaim = styled.div`
  grid-column: 1 / -1;
  margin-top: -0.1rem;
  font-size: 0.68rem;
  font-style: italic;
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

/* Left, on the column's edge: a sentence in a reading column centred under
   left-aligned rows read as a caption that had lost its picture. */
const BaseEmpty = styled.div`
  padding: 0.6rem 0 1rem;
  text-align: left;
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
