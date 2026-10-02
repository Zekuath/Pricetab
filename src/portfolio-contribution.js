/* WHAT MOVED THE TOTAL — a contribution chart, not a recommendation.
 *
 * The portfolio already answers "what is it worth" (the line), "what is it
 * made of" (the stacked bands) and "am I up" (P/L). It could not answer the
 * question people actually ask when the number changes: **which of these did
 * that?** Allocation is routinely misread as the answer and is not one — a
 * coin can be 40% of the basket and none of the month's move.
 *
 * Horizontal bars on one zero baseline, and that is a measured choice rather
 * than a taste: Cleveland and McGill put judgements of position on a common
 * scale, and of length, ahead of angle and area. A treemap or a second donut
 * would encode the same signed quantity worse. Sorted by **absolute** size,
 * because the biggest loser explains the move exactly as well as the biggest
 * winner.
 *
 * Three rules it does not break:
 *
 *   1. **The bars sum to the headline figure.** `contributionsOf` guarantees
 *      it arithmetically and `tests/test-portfolio.js` asserts it. A parts
 *      chart that does not add up to its whole quietly edits the number above
 *      it.
 *   2. **Colour is never the only carrier.** Sign, side of the axis and a
 *      written +/- all say direction, so the chart reads under either kind of
 *      red-green deficiency and in a screenshot.
 *   3. **It is history, and it says so.** Nine textbook rules over 21,669
 *      daily closes gave 0 of 70 results that survived correction for multiple
 *      testing, so there is no version of this that points forwards. The foot
 *      of the chart says what it is rather than leaving the reader to assume.
 *
 * Its own file, and its own grammar: `portfolio-chart.js` is a time series
 * with a crosshair, and this is a ranked bar chart with none. Adding it there
 * as a fourth mode is what that file's own comment warns against.
 */

const PcbWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
`;

const PcbRow = styled.div`
  display: grid;
  /* coin | bar | figures — one grid so every bar starts at the same x and the
     lengths are comparable across rows, which is the whole point of bars. */
  grid-template-columns: 3.2rem 1fr 8.5rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.1rem 0;
  border-radius: ${({ theme }) => theme.scale * 3}px;
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.accent || theme.color.text};
  }
`;

const PcbCoin = styled.div`
  font-size: 0.68rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/* The track holds the zero line. Both halves are always present even when
 * every contribution has the same sign — a diverging chart that silently
 * becomes one-sided hides the fact that nothing went the other way. */
const PcbTrack = styled.div`
  position: relative;
  height: 1.05rem;
  display: flex;
  align-items: center;
`;

const PcbZero = styled.div`
  position: absolute;
  left: ${({ pos }) => pos}%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: ${({ theme }) => theme.color.border};
`;

/* The bars grow out of the zero line rather than appearing at full length.
 *
 * `transform: scaleX` from the axis end, never an animated `width`: a width
 * transition lays out every frame, and this page's whole argument is what it
 * does not make the browser do. The transform origin is the side the bar
 * starts from, so a loss grows leftwards and a gain rightwards — the movement
 * itself says which way it went, which is the same job the sign and the side
 * of the axis are already doing. */
const pcbGrow = keyframes`
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
`;

const PcbBar = styled.div`
  /* backwards, not both — see the note on the price stats row: both leaves a
     finished animation in getAnimations() for the life of the page. */
  animation: ${pcbGrow} 380ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  transform-origin: ${({ up }) => (up ? "left" : "right")} center;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  position: absolute;
  top: 0.15rem;
  bottom: 0.15rem;
  left: ${({ left }) => left}%;
  width: ${({ width }) => width}%;
  min-width: 1px;
  border-radius: 2px;
  background: ${({ up, theme }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  /* Never the sole carrier of direction — see the header. The side of the
     zero line and the printed sign both say it too. */
  opacity: 0.85;
`;

const PcbFigures = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0.4rem;
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const PcbMoney = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
`;

const PcbShare = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PcbNote = styled.div`
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.35rem;
  opacity: 0.85;
`;

const PcbEmpty = styled.div`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  padding: 0.8rem 0;
`;

/* Below this share of the total movement a bar is a hairline with a label
 * beside it, which is noise rather than information. They are folded into one
 * row that names its members in its own title — folded, never dropped: a chart
 * that quietly loses rows stops summing to its headline. */
const PCB_MIN_SHARE = 2;
const PCB_MAX_ROWS = 8;

class PortfolioContributionBase extends Component {
  /* Rows to draw, with the tail folded.
   *
   * Two ways in: too small to see, and too many to read. Both end in the same
   * `Other`, and its `members` keeps every coin that went into it so the
   * tooltip can name them. */
  rows() {
    const built = contributionsOf(this.props.parts);
    if (!built) return null;
    const kept = [];
    const folded = [];
    for (const row of built.rows) {
      if (kept.length < PCB_MAX_ROWS && row.share >= PCB_MIN_SHARE) kept.push(row);
      else folded.push(row);
    }
    if (folded.length === 1) {
      // One leftover is not a group; it is that coin, and naming it costs a row.
      kept.push(folded[0]);
    } else if (folded.length > 1) {
      const change = folded.reduce((sum, r) => sum + r.change, 0);
      kept.push({
        coin: null,
        change,
        share: folded.reduce((sum, r) => sum + r.share, 0),
        pct: null,
        members: folded.map((r) => r.coin),
      });
    }
    return { ...built, rows: kept };
  }

  render() {
    const built = this.rows();
    const { formatMoney, periodLabel } = this.props;
    if (!built) {
      return React.createElement(
        PcbEmpty,
        null,
        msg("pcb_empty", "Not enough history to say what moved this."),
      );
    }

    /* One scale for every bar, from the largest absolute contribution — so a
     * bar twice as long is twice the money, across the whole chart. Scaling
     * each row to itself would make every position look equally decisive. */
    const widest = built.rows.reduce((m, r) => Math.max(m, Math.abs(r.change)), 0);
    const anyDown = built.rows.some((r) => r.change < 0);
    const anyUp = built.rows.some((r) => r.change > 0);
    /* Where zero sits. With losses and gains it is the middle; with only one
     * direction the axis is pushed to the edge so the bars use the full width
     * instead of half of it — but the line is still drawn, so a one-sided
     * chart still looks like one side of an axis rather than a plain bar
     * chart with no zero. */
    const zero = anyDown && anyUp ? 50 : anyDown ? 100 : 0;
    const span = anyDown && anyUp ? 50 : 100;

    return React.createElement(
      PcbWrap,
      null,
      ...built.rows.map((row) => {
        const up = row.change >= 0;
        const width = widest > 0 ? (Math.abs(row.change) / widest) * span : 0;
        const left = up ? zero : zero - width;
        const name = row.coin || msg("po_other", "Other");
        const money = formatMoney(row.change, true);
        const label = msg(
          "pcb_row_label",
          "$1: $2, $3% of the movement",
          name,
          money,
          row.share.toFixed(0),
        );
        return React.createElement(
          PcbRow,
          {
            key: row.coin || "__other",
            tabIndex: 0,
            /* Each row is a stop, with the whole sentence as its name: a
             * screen reader that lands here should get the figure, not the
             * word "BTC" and a bar it cannot see. */
            role: "img",
            "aria-label": label,
            title: row.members
              ? msg("pcb_other_members", "Other: $1", row.members.join(", "))
              : label,
          },
          React.createElement(PcbCoin, null, name),
          React.createElement(
            PcbTrack,
            null,
            React.createElement(PcbZero, { pos: zero, "aria-hidden": true }),
            React.createElement(PcbBar, {
              up,
              left,
              width,
              "aria-hidden": true,
              /* A hook for the browser test, for the same reason the value
               * chart's plot carries one: the width lives in a generated
               * class, so there is nothing stable to select on otherwise. */
              "data-pcb-bar": up ? "up" : "down",
            }),
          ),
          React.createElement(
            PcbFigures,
            null,
            React.createElement(PcbMoney, null, money),
            React.createElement(PcbShare, null, `${row.share.toFixed(0)}%`),
          ),
        );
      }),
      React.createElement(
        PcbNote,
        null,
        msg(
          "pcb_note",
          "How much of this $1's move each holding accounted for, using the amounts you hold now. It adds up to the change above it. This is what happened, not what happens next.",
          String(periodLabel || "").toLowerCase(),
        ),
      ),
    );
  }
}

const PortfolioContribution = withTheme(PortfolioContributionBase);
