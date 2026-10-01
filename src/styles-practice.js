/* Futures — the styled components the Calls panel draws the section with.
 *
 * They live in their own file rather than in `styles-alerts.js` because they
 * are one feature's worth of surface and that file is already 1,200 lines,
 * and they are written to the same measurements as the rest of the panel:
 * the foot block's padding, the 6px corner its buttons take, the 0.6rem
 * uppercase section label. A strip that sits under the Board strip and looks
 * like something else reads as a different product bolted on.
 */

/* ---- the type scale ---------------------------------------------------
 *
 * **Measured before it was written: this file had twelve font sizes and one
 * weight.** 0.54, 0.58, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74, 0.78,
 * 0.82 — steps so close together that nothing reads as louder than anything
 * else, which is what makes a screen of labelled figures feel like a wall.
 * Weight, the one lever that separates a figure from its label at a glance,
 * was declared eight times in 2,300 lines.
 *
 * So: **five sizes and three weights**, and hierarchy carried by weight and
 * ink rather than by a tenth of a rem. This panel has exactly one font family
 * — the extension ships one and adding another is not on the table — and a
 * monospace face gives less contrast than a proportional one, so what is left
 * has to be used properly. Roboto Mono's axis really is 100–700 (the sheet
 * used to clamp it and Chrome synthesised the bold; see
 * `vendor/roboto-mono.css`), so the weights below are real masters.
 *
 * The rule for the ladder: **a figure is one step heavier than the label that
 * names it.** That is the one piece of received wisdom about financial tables
 * that survives contact with this screen — columns of money have to pop in
 * scan mode, and a label that pops with them is noise. */
const posType = {
  /* The account's own number, and nothing else. */
  display: "1.2rem",
  /* A figure that is the subject of its block: an amount being typed, a score. */
  lead: "0.9rem",
  /* Money and prices you read off a row. */
  figure: "0.8rem",
  /* Prose, questions, buttons, anything made of words. */
  body: "0.72rem",
  /* Labels over figures, units, counts, section heads. */
  micro: "0.62rem",
};
const posWeight = {
  /* Words naming something. Quiet on purpose. */
  label: 400,
  /* The figure the label names — one step up, which is all it takes. */
  figure: 550,
  /* The one number a block exists for. */
  strong: 600,
};

/* ---- futures, inside the Calls panel -------------------------------- */

const AlertPosChevron = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.color.textSecondary};
  transform: rotate(${({ open }) => (open ? 180 : 0)}deg);
  transition: transform 0.18s ease;
`;

/* Measured open rather than given a fixed maximum: the ticket and an open
 * position are different heights, and a cap picked for one clips the other —
 * the settings groups learned this the expensive way. */
const AlertPosReveal = styled.div`
  /* **A row of its own, across every column — and it does not get a vote on
     how wide they are.** Spanning the tracks, the contract's own text (a
     sentence about what closing pays) was sizing the table's columns through
     its min-content: the head and the rows grew 88px past the column and the
     table scrolled sideways, with nothing visibly wrong in the row itself. */
  ${({ wide }) => (wide ? "grid-column: 1 / -1; min-width: 0;" : "")}
  overflow: hidden;
  max-height: ${({ open }) => (open ? "56rem" : "0")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  /* **Hidden, not merely flat.** A collapsed reveal is zero max-height with
   * overflow hidden, which clips the drawing and leaves everything inside it
   * focusable and in the accessibility tree — and this one holds four buttons
   * and two number fields per position, so a shut row was six Tab stops
   * leading nowhere. Visibility is the one property that takes the whole
   * subtree out of both, and it is held until the collapse has finished so
   * the close still animates. */
  visibility: ${({ open }) => (open ? "visible" : "hidden")};
  /* The contents also travel a few pixels, which is what separates "this
   * belongs to the header you just pressed" from "this appeared". Kept to a
   * transform so an idle new tab is not animating geometry. */
  transform: translateY(${({ open }) => (open ? "0" : "-4px")});
  transition:
    max-height 0.26s ease,
    opacity 0.2s ease,
    transform 0.26s ease,
    visibility 0s linear ${({ open }) => (open ? "0s" : "0.26s")};
`;

/* **The ticket, in blocks with air between them.**
 *
 * On a screen of its own the ticket was the same 0.4rem column it had been
 * inside a disclosure — side, leverage, size, three prices, a note and a
 * button, all at one rhythm, so nothing grouped and the whole card read as
 * one flat list. It is four decisions and they are made in order; the
 * spacing says so now. */
const AlertPosTicket = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  /* **Air above the first decision.** The Long/Short pair sat six pixels under
     the tab row — measured, tabs ending at 248 and the buttons starting at 254
     — so the two read as one block and the side you are choosing looked like a
     fourth tab. The gap between the ticket's own blocks is 0.85rem; the gap
     above the first one should not be a seventh of that. */
  padding-top: 0.9rem;
`;

/* **The order button does not leave the screen.**
 *
 * Sticky to the foot of whatever scrolls the panel, with the ground painted
 * behind it so the form passes underneath rather than through it, and a
 * hairline that only appears once there is something under it to separate
 * from. The negative bottom margin swallows the ticket's own gap, so the
 * button sits on the panel's floor instead of a stripe of background.
 *
 * `AlertPosNote` rides with it: a refusal printed above the fold with the
 * button pinned below is the same defect seen from the other end.
 */
const AlertPosTicketFoot = styled.div`
  position: sticky;
  /* On the phone app a bar floats over the foot of the page; the shim sets
     the lift and the extension never does, so this is 0 everywhere else. */
  bottom: var(--pt-dock-lift, 0px);
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0 0 -0.35rem;
  padding: 0.75rem 0 0.35rem;
  /* **The ground the panel is on, not the page's.** This painted
     color.bg — white — over a card whose own ground is bgSecondary
     (measured: the foot at rgb(255,255,255) on a panel at rgb(245,245,245)).
     A sticky strip has to be invisible when nothing is under it, and this one
     was a pale rectangle drawn around the order button: the button read as
     something nested inside a box rather than as the foot of the form, which
     is exactly how it was reported. */
  background: ${({ theme }) => theme.color.bgSecondary};
  /* **And the shadow obeys the same rule as the background.** It says
     "content passes under here", so on a screen with nothing to scroll it is
     a soft grey band across the middle of empty space — reported as a
     scrollbar in the main area, which is precisely what it looks like. The
     panel measures the body and hands the answer down. */
  box-shadow: ${({ theme, under }) =>
    under ? `0 -0.6rem 0.7rem -0.55rem ${theme.color.shadow}` : "none"};
`;

/* A named step of the ticket. The name is the same micro-label the price
 * fields already use, so "Leverage" and "ENTRY" read as the same kind of
 * thing rather than as a heading and a field. */
const AlertPosStep = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const AlertPosStepHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.55rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The readout beside a step's name, in full ink and tabular figures. */
const AlertPosStepValue = styled.span`
  font-size: ${posType.body};
  letter-spacing: 0;
  text-transform: none;
  color: ${({ theme }) => theme.color.text};
  font-weight: ${posWeight.figure};
`;

/* Scope and ceiling sit beside the editable value as one quiet cluster. The
 * words explain what the number belongs to; the field remains the strongest
 * thing in the heading, so a venue convention does not turn into a second
 * heading inside PriceTab's ticket. */
const AlertPosLevHeadRight = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
`;

const AlertPosLevMeta = styled.span`
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0;
  text-transform: none;
  /* **It gives way, the field does not** (27 Sep 2026). On one line it
     pushed the leverage field past the desk's edge once the ticket could be
     dragged to 26rem; it wraps onto a second line now, right-aligned
     against the field, and only when the desk is that narrow. */
  flex: 0 1 auto;
  min-width: 0;
  text-align: right;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* **The free balance is not a meta line.** It sat in `AlertPosLevMeta`, the
 * same quiet grey as "Isolated · account max 200x" — and it is the one figure
 * on this row that decides whether the order can be placed at all. Reported
 * as "shouldn't the part that's left be more obvious?", and it should: the
 * size chips are a proportion *of this number*. Full ink and the panel's
 * medium weight, one step up in size, while everything the sentence says
 * about it stays quiet — a separate component rather than a restyle of the
 * shared one, which would have shouted the leverage scope too. */
const AlertPosFreeNow = styled.span`
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.text};
`;

/* **The leverage value is an input, not a readout.** It used to be a small
 * `2x` at the right edge of the heading, while the only way to reach 37x was
 * to land a thumb on one of 200 pixels. The field keeps the same quiet 6px
 * corner and hairline as the chips around it; the `x` lives inside the same
 * border so it reads as one value rather than a unit floating beside a box. */
const AlertPosLevField = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: stretch;
  width: 4.2rem;
  box-sizing: border-box;
  overflow: hidden;
  font-family: ${({ theme }) => theme.font.primary};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid
    ${({ theme, invalid }) =>
      invalid ? theme.color.chartLineRed : theme.color.border};
  border-radius: 6px;
  transition: border-color 0.15s ease;
  opacity: ${({ locked }) => (locked ? 0.5 : 1)};

  &:focus-within {
    border-color: ${({ theme, invalid }) =>
      invalid ? theme.color.chartLineRed : theme.color.borderHover};
  }

  ${refusedField};
`;

const AlertPosLevInput = styled.input`
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.27rem 0.1rem 0.27rem 0.42rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  line-height: 1;
  text-align: right;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: none;
  outline: none;
  font-weight: ${posWeight.figure};
`;

const AlertPosLevUnit = styled.span`
  display: flex;
  align-items: center;
  padding: 0 0.42rem 0 0.08rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  letter-spacing: 0;
  text-transform: none;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertPosKey = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertPosValue = styled.span`
  font-family: ${({ theme }) => theme.font.primary};
  color: ${({ tone, theme }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.text};
  font-weight: ${posWeight.figure};
`;

const AlertPosChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

/* 6px, not a pill — the same corner every other button in this panel takes. */
const AlertPosChip = styled.button.attrs({ type: "button" })`
  padding: 0.28rem 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme, active }) => (active ? theme.color.bg : theme.color.textSecondary)};
  background: ${({ theme, active }) => (active ? theme.color.text : "transparent")};
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
  ${touchTarget};

  /* Inside a row that scrolls sideways on the phone the touch box is clipped
     to the row, so the chip itself grows to a finger's height there. */
  @media (pointer: coarse) {
    min-height: 28px;
  }
`;

/* The price fields, written to `AlertInput`'s measurements rather than to
 * their own: 0.82rem in the panel's font, 8px corner, the panel's own
 * background. They were 0.7rem in a 6px pill with a hard-coded width, which
 * is why they read as pasted in from somewhere else — a five-figure price
 * also does not fit 9rem at that size.
 *
 * `-moz-appearance: textfield` and the WebKit rule remove the spinner: a
 * number input with steppers on a price is two tiny targets nobody presses
 * and 18px of the field gone. */
/* **The currency, inside the field, beside the digits.** The three price
 * boxes were the only figures on the ticket with no symbol on them — a bare
 * `112480` under a header reading `$112,480.00`. It cannot go in the value:
 * the value is parsed straight back with `Number()`, so a formatted one would
 * have to be un-formatted on every keystroke. So it is an adornment, laid
 * over the field's own left padding, `aria-hidden` because the input already
 * names itself, and `pointer-events: none` so the whole box still focuses the
 * input when it is clicked. */
const AlertPosInputWrap = styled.div`
  position: relative;
  display: flex;
  min-width: 0;
`;

const AlertPosInputUnit = styled.span`
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.figure};
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertPosInput = styled.input`
  flex: 1 1 0;
  min-width: 0;
  box-sizing: border-box;
  /* The app's own control metrics, not this panel's: 0.75rem both ends and a
     12px radius are what every input in Settings uses, and a panel that
     invents its own is a panel that reads as a different product. */
  padding: 0.75rem 0.85rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.figure};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  text-align: right;

  /* Room for the currency adornment when there is one; the digits are
     right-aligned, so this only has to stop a long price reaching it.
     **Measured in the unit's own characters** (28 Sep 2026): 2.1rem was a
     "$"'s room, and since the account became USDT a narrow field's
     placeholder ran into it — "USDToptional" at a 416px desk. The unit is
     drawn in this input's font size, so 5ch here is four letters and a
     space of that font. */
  ${AlertPosInputWrap} & {
    padding-left: calc(0.85rem + 5ch);
  }
  -moz-appearance: textfield;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.textSecondary};
    opacity: 0.7;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:disabled {
    opacity: 0.5;
  }

  ${refusedField};
  font-weight: ${posWeight.figure};
`;

/* A field with its own name above it, which is how the rest of this panel
 * labels an input. The three price fields sit in one row on a wide card and
 * wrap on a narrow one. */
const AlertPosFields = styled.div`
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
`;

/* **One column per setting.** The stop and the take-profit each own a label,
 * a field, the percentage shortcuts that write into it and what that level is
 * worth — four things about one decision, stacked. They used to be split
 * across two blocks: a field up here and a second row below with its **own**
 * copy of the name, so a ticket with two settings carried four labels.
 * The chips sit outside the `label`, not inside it: a button inside a label
 * activates the label as well as itself. */
const AlertPosFieldCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1 1 7rem;
  min-width: 0;

  /* Tightened **here**, at the container this screen alone passes through,
     rather than on the shared chip: the same component carries the size
     shares, the close shares and the risk limits, and four percentages in a
     third of the ticket's width is the only place that needs the smaller
     one. */
  & button {
    padding: 0.24rem 0.42rem;
    font-size: ${posType.micro};
  }
`;

const AlertPosField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  min-width: 0;
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertPosNote = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* **The leverage consequence, before the order.** Four equal cells replace
 * the run-on preview sentence that mixed quantity, entry, liquidation and
 * margin into one line. The figures use the app font and tabular numerals;
 * labels stay in the same micro-language as every field in this ticket. */
/* The position the ticket is about to change, on one line above it. A row of
 * facts rather than a card: it is context for the form under it, not a thing
 * to operate — the controls for it are one tab away, and putting them here
 * would make the ticket two screens. */
const AlertPosHeld = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.6rem;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  background: ${({ theme }) => theme.color.bgSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};

  strong {
    font-weight: 500;
    color: ${({ theme }) => theme.color.text};
  }

  /* The result is pushed to the far end of the row — named rather than taken
     as ":last-child", which the rule line under it now is. */
  > ${AlertPosValue} {
    margin-left: auto;
  }
`;

/* The rule, on its own line under the facts it explains. Full width so it
 * cannot be mistaken for another fact in the row, and quiet: it is there to be
 * read once and then never noticed again. */
const AlertPosHeldWhy = styled.span`
  flex: 1 0 100%;
  font-size: ${posType.micro};
  line-height: 1.45;
  opacity: 0.75;
`;

/* **Five cells, and a count that divides.** It was four; the fee made it five,
 * and five into a four-column grid leaves one cell alone on a second row with
 * a hole beside it — the empty-space fault this panel was audited for. The
 * columns are the cell count now, and the narrow rule folds to a shape that
 * also divides: 5 → 3 + 2, with the last cell spanning the gap so the row
 * closes instead of trailing off. */
/* **The column count is the cell count**, whatever the ticket hands it.
 * Written as a fixed `repeat(5, …)` it kept three empty columns, and the
 * component's own background is the border colour — so the gap left by the
 * hidden cells was drawn as a grey slab with nothing in it. The grid is told
 * how many cells it was handed rather than guessing with `auto-fit`, which
 * would have stretched two cells across a screen that is 1,000px wide. */
const AlertPosImpact = styled.div`
  display: grid;
  grid-template-columns: repeat(${({ cells }) => cells || 5}, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.color.border};

  /* **Three where five do not fit** — a phone, and the desk's own column on
     a wide window, where five cells ran to 82px and "to liquidation" had
     nowhere to go. The last cell takes the empty place beside it rather than
     leaving a grey square in the grid's own background. */
  @media (max-width: 640px), (min-width: ${PORTFOLIO_WIDE}px) {
    grid-template-columns: repeat(
      ${({ cells }) => Math.min(cells || 5, 3)},
      minmax(0, 1fr)
    );

    > *:last-child {
      grid-column: ${({ cells }) => ((cells || 5) % 3 === 2 ? "span 2" : "auto")};
    }
  }
`;

const AlertPosImpactCell = styled.div`
  display: flex;
  flex-direction: column;
  /* A label that takes two lines (INITIAL MARGIN and its ring) must not push
     its own figure out of line with the four beside it: figures sit on the
     cell's floor, labels on its ceiling. */
  justify-content: space-between;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.5rem 0.5rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* **A label and its ring are one line, not two.**
 *
 * The cell is a column, so a label written as a fragment of text plus the
 * explain ring made the ring a second row: "INITIAL MARGIN" sat above a lone
 * question mark, and the figure under it dropped out of line with the four
 * cells beside it. The pair is a row of its own now. */
const AlertPosImpactLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
`;

/* Wraps at the space before its unit rather than cutting it: "1,850.93 US…"
   is a figure with its currency sliced off, and an ellipsis on money reads
   as a different number. */
const AlertPosImpactValue = styled.span`
  font-size: ${posType.body};
  letter-spacing: 0;
  text-transform: none;
  overflow-wrap: normal;
  color: ${({ theme }) => theme.color.text};
  font-weight: ${posWeight.figure};
`;

const AlertPosButton = styled.button.attrs({ type: "button" })`
  width: 100%;
  padding: 0.5rem;
  margin-top: 0.15rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  color: ${({ theme }) => theme.color.bg};
  background: ${({ theme }) => theme.color.text};
  border: 1px solid ${({ theme }) => theme.color.text};
  border-radius: 8px;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

const AlertPosQuiet = styled(AlertPosButton)`
  color: ${({ theme }) => theme.color.textSecondary};
  background: transparent;
  border-color: ${({ theme }) => theme.color.border};
`;

/* A held coin, in the shape a venue's Positions tab uses: what is held on the
 * first line with the number that moves, and the two facts that decide
 * whether to act underneath it. */
const AlertPosCard = styled.div`
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  /* **Room for what it now holds.** It was 0.5rem of padding and a 0.3rem gap
   * when the card was a coin, a P/L and one line of facts. It carries the
   * settlement block as well now — in with, out with, and the balance after —
   * plus four controls, and at the old spacing all of that ran together into
   * a block with no seams. */
  padding: 0.75rem 0.9rem;
  display: flex;
  flex-direction: column;

  /* A card's own gap from the one above: two contracts touching read as one
     box with a rule through it. */
  & + & {
    margin-top: 0.5rem;
  }
  /* **No gap, deliberately.** The card is a head and a reveal now, and a
   * column gap is drawn between them whether or not the reveal has any
   * height — so a shut position carried half a row of empty space under its
   * own line and the collapsed rows did not read as one list. The spacing
   * moved inside AlertPosCardBody, where it only exists when there is
   * something to space. */
  gap: 0;
`;

/* **The head is the control now, and the rest of the card is behind it.**
 *
 * Three open positions put three settlement blocks, three fact rows and
 * twelve buttons above the ticket, and the ticket is what the screen is for:
 * the card ran past the bottom of the panel and the way to open anything was
 * off the end of a scroll. Collapsed, a position is still the two things a
 * list of positions is read for — which one it is, and what it is doing —
 * and the answer to "what do I do about it" is one press away.
 *
 * The head carries the P/L as well as the coin, so it is what the button is
 * named by — a shut row still says which position it is and what it is doing,
 * which is the whole reason it is safe to shut. */
const AlertPosCardTop = styled.button.attrs({ type: "button" })`
  /* **Three columns, and the first one cannot be squeezed.** Adding the market
     price to the fact block pushed the contract's own name onto two and then
     three lines — flex shares the shortfall out among its children, and the
     name is the one child that must not take it. Named column, no wrap, and
     the facts get whatever is left. */
  display: grid;
  /* **The name's column is fixed, not max-content.** Sized to content it is a
     different width on every row — "BTC Short 2x" is two characters longer
     than "BTC Long 2x" — so the facts beside it start at a different x and the
     list stops being a table again. 17ch holds a two-digit number, a
     four-letter market, the side and the leverage. The slack goes to the third
     column, which keeps the result against the right edge. */
  /* **Two lines: the contract and its result, then its levels.** One line
     held name, three prices and the result, and once money carried its unit
     the result ran over the liquidation (measured at 1440: -2.50 USDT on top
     of "liq 50,176.00"). The name and the result keep the top line — the two
     things the row is read for — and the levels sit under them in their own
     character columns, so rows still line up down the list. */
  grid-template-columns: minmax(16ch, max-content) minmax(0, 1fr) max-content;
  grid-template-areas: "name . result" "facts facts facts";
  align-items: baseline;
  gap: 0.2rem 0.5rem;
  position: relative;

  > :first-child {
    grid-area: name;
  }

  > :nth-child(2):not(:last-child) {
    grid-area: facts;
  }

  > *:last-child {
    grid-area: result;
    justify-self: end;
  }

  /* **How close this contract is to the end, drawn behind its own row.**
   *
   * The order book's rows carry a fill as wide as the depth at that price, and
   * it is the one piece of trading-UI design that adds a dimension at no
   * layout cost — the shape is readable without reading a figure. The same
   * trick answers the question a position list is scanned for: *which of these
   * is in trouble?*
   *
   * Width is the inverse of the cover ratio, so it is full at the edge and a
   * sliver when the contract is nowhere near it. Drawn only inside five times
   * the requirement: on every row it would be a red tint on a healthy account,
   * which is an alarm rather than a reading. */
  &::before {
    content: "";
    position: absolute;
    top: -0.1rem;
    bottom: -0.1rem;
    left: 0;
    width: ${({ risk }) => Math.max(0, Math.min(100, risk || 0))}%;
    background: ${({ theme }) => theme.color.chartLineRed};
    opacity: ${({ risk }) => (risk > 0 ? 0.1 : 0)};
    pointer-events: none;
    transition: width 0.4s ease, opacity 0.4s ease;
  }
  width: 100%;
  padding: 0;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.figure};
  color: ${({ theme }) => theme.color.text};
`;

/* **The width bought a middle column, and this is what belongs in it.**
 *
 * A shut row said the market, the side, the leverage and the result — which
 * is a venue's position table with its two most-read columns missing. Where
 * you got in and where it ends are the facts you compare *across* contracts,
 * and comparing them was worth an unfold each. They sit between the name and
 * the result now, in the room the wider panel made, and they are quiet ink:
 * the P/L is still the thing the row is read for.
 *
 * Dropped below the small breakpoint rather than wrapped — at that width the
 * head is already two lines, and a third of quiet figures buries the result.
 */
const AlertPosHeadFacts = styled.span`
  /* **Columns counted in characters.** The ch unit on a monospace face is
     exact, so entry, liquidation and the distance to it start at the same x on
     every row in the list — which is the whole of what a position table is
     for. Widths: a price with a thousands separator and two decimals fits
     inside 18ch with its label, and the distance needs 6. Right-aligned
     within their cells so the digits line up rather than the words. */
  display: grid;
  /* now · entry · liquidation · how far that is. The first is the market and
     the rest are the contract, so the eye reads left to right from what is
     happening to what was agreed. */
  grid-template-columns: 16ch 18ch 23ch;
  justify-content: start;
  align-items: baseline;
  gap: 0 1.2ch;
  /* No padding of its own: the outer grid's column gap is what separates the
     last fact from the result, and padding here was buying that same gap
     twice out of a budget that had none — measured, the head wanted 738px
     inside 688 and the two blocks overlapped by 30. */
  padding-right: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-weight: ${posWeight.label};
  white-space: nowrap;
  color: ${({ theme }) => theme.color.textSecondary};

  span:last-child {
    text-align: right;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    display: none;
  }
`;

/* The number that moves, and the chevron that says the rest is under it. */
/* The number that moves, and the chevron that says the rest is under it.
   Its two figures get columns of their own for the same reason the facts do:
   a result that shifts sideways as the digits change is a result you have to
   re-find on every row. */
const AlertPosCardRight = styled.span`
  display: grid;
  grid-template-columns: max-content 6ch 1.1rem;
  align-items: baseline;
  gap: 0 0.3rem;
  white-space: nowrap;
  text-align: right;
`;

/* Everything the head is hiding, in the column the card used to be. */
const AlertPosCardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.5rem;
`;

const AlertPosCoin = styled.span`
  letter-spacing: 0.03em;
  white-space: nowrap;
`;

/* The standing facts — where you got in, where it ends, how close that is.
 * Ruled off above so they read as a different kind of thing from the
 * settlement block: that one is about ending the position, these are about
 * where it is. */
/* The readings a position is *studied* with, as label-over-value pairs that
 * wrap. Not the fact line above it: that one is a single sentence about what
 * the contract is, and these are separate answers to separate questions —
 * six of them, each of which may legitimately have no answer and simply not
 * be drawn. */

const AlertPosPaneHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-weight: ${posWeight.label};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* A counted statement about this market, and the denominator it was counted
   against. Never an arrow: the panel's standing rule is that it reports and
   does not advise, and a line that says "3 of 200" is a fact while the same
   line with a direction on it is a recommendation. */
const AlertPosMeasure = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};

  strong {
    font-weight: ${posWeight.figure};
    color: ${({ theme }) => theme.color.text};
  }
`;

/* **Headlines for this market, in the column that already holds its chart.**
 *
 * A list, not a ticker: the scrolling row under the price is for glancing at
 * while you are looking at something else, and this column is being read on
 * purpose. Four rows, each a link out with its age against it — the same two
 * facts the news panel puts on a row, because a headline with no date is a
 * headline you cannot weigh.
 *
 * Its own components rather than the news panel's: those are sized for a
 * full-width panel and restyling a shared one for a second screen is how a
 * change here lands somewhere nobody was looking. */
const AlertPosNews = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const AlertPosNewsRow = styled.li`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;

  a {
    flex: 1 1 auto;
    min-width: 0;
    font-family: ${({ theme }) => theme.font.primary};
    font-size: ${posType.micro};
    line-height: 1.45;
    color: ${({ theme }) => theme.color.text};
    text-decoration: none;
    /* Two lines, then an ellipsis. A headline cut to one line loses the half
       that says what happened; cut to none it is a link with no label. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;

    /* Not underlined until you reach for it — the news panel's own rule, and
       the polish suite asserts it there. */
    &:hover,
    &:focus-visible {
      text-decoration: underline;
    }
  }
`;

const AlertPosNewsAge = styled.span`
  flex: 0 0 auto;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* A resting order's row: the same character columns the position list uses,
   for the same reason — a list is read down its columns, and an order and a
   position are read the same way. The button takes what is left. */
/* **Three lines, whatever the desk's width** (28 Sep 2026). Five fixed
   columns (16ch, 14ch, 10ch, the rest, the button) needed ~540px; the desk
   can be dragged to 416px now, and "499.53 USDT held" was drawn under the
   Cancel button. The order on the first line, its price (and the stop and
   take it carries) on the second, how far away and what it holds on the
   third — and Cancel beside all three, so nothing is ever under it. */
const AlertPosOrderRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) max-content;
  grid-template-areas:
    "what what cancel"
    "at at cancel"
    "away held cancel";
  align-items: baseline;
  gap: 0.2rem 0.75rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  color: ${({ theme }) => theme.color.text};

  > :nth-child(1) { grid-area: what; }
  > :nth-child(2) { grid-area: at; }
  > :nth-child(3) { grid-area: away; }
  > :nth-child(4) { grid-area: held; text-align: right; }
  > :nth-child(5) { grid-area: cancel; align-self: center; }

  > span {
    min-width: 0;
    font-size: ${posType.micro};
    font-weight: ${posWeight.label};
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* ---- the order book ---------------------------------------------------
 *
 * **A ladder, not a table of numbers.** Every venue draws depth the same way
 * and for the same reason: each row carries a faint fill as wide as the
 * *running* size at that price, so the shape of the book — where it is thick,
 * where it thins out — is readable without reading a single figure. It is a
 * second dimension at no layout cost, which is the one piece of order-book
 * design worth copying exactly.
 *
 * Both sides are drawn against one scale (the deepest running total on either
 * side), so a thin side looks thin. Scaling each side to itself would make
 * every book look balanced, which is the opposite of what it is for. */
const AlertPosBook = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
`;

const AlertPosBookRow = styled.div`
  position: relative;
  display: grid;
  /* Price, size, running total — in ch so the columns hold their edges down
     the whole ladder however the digits change. */
  grid-template-columns: 11ch minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 0.5rem;
  padding: 0.12rem 0.35rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};

  /* The fill, behind the figures rather than beside them: it is context for
     the row, and a bar in a column of its own would be a third column nobody
     asked for. Drawn from the right, where the sizes are. */
  &::before {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: ${({ pct }) => Math.max(0, Math.min(100, pct || 0))}%;
    background: ${({ side, theme }) =>
      side === "ask" ? theme.color.chartLineRed : theme.color.chartLineGreen};
    opacity: 0.12;
    pointer-events: none;
  }

  span:first-child {
    position: relative;
    font-weight: ${posWeight.figure};
    color: ${({ side, theme }) =>
      side === "ask" ? theme.color.chartLineRed : theme.color.chartLineGreen};
  }

  span:nth-child(n + 2) {
    position: relative;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* The total is context for the size beside it, so it is the quieter one —
     in the secondary ink, not the row's at 0.7 (3.0:1 on the depth bar). */
  span:nth-child(3) {
    color: ${({ theme }) => theme.color.textSecondary};
  }

  /* **A level is a price you can take** (27 Sep 2026): a press puts it on
     the ticket as a resting order (pickBookPrice). The row says so on
     hover and focus with the hairline every other control here uses. */
  &[role="button"] {
    cursor: pointer;
    outline: none;
    border-radius: 3px;
  }

  &[role="button"]:hover,
  &[role="button"]:focus-visible {
    box-shadow: inset 0 0 0 1px ${({ theme }) => theme.color.borderHover};
    color: ${({ theme }) => theme.color.text};
  }
`;

/* The ladder's column heads, on the same grid as its rows. */
const AlertPosBookCols = styled.div`
  display: grid;
  grid-template-columns: 11ch minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 0.5rem;
  padding: 0 0.35rem 0.3rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};

  span:nth-child(n + 2) {
    text-align: right;
  }
`;

/* The book's filters: a side switch and two choices, on one line with space
   between them, wrapping on a narrow card rather than shrinking a control. */
const PracticeBookFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding-bottom: 0.75rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

/* Book | Trades, a clear step above the filters under it. */
const PracticeBookTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  margin-bottom: 0.75rem;

  /* The tabs themselves keep together; anything after them (Close all) goes
     to the far end of the row. */
  > button:first-child {
    margin-right: 0;
  }
`;

const PracticeSegment = styled.div`
  display: flex;
  gap: 0.25rem;
`;

const PracticeBookPick = styled.label`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  ${touchTarget};
`;

const PracticeBookSelect = styled.select`
  padding: 0.28rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0;
  text-transform: none;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    min-height: 28px;
  }
`;

/* What the two sides cost to cross, between them — the one figure a book is
   read for that is not on either ladder. */
const AlertPosBookSpread = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.1rem 0.5rem;

  /* The last trade takes the row's first line, large; the spread the
     second, quiet — a 15rem column had them wrapping into each other. */
  > [data-practice-book-last] {
    flex: 1 0 100%;
    font-size: ${posType.figure};
  }

  > [data-practice-book-last] strong {
    font-size: ${posType.lead};
    color: inherit;
  }
  padding: 0.3rem 0.35rem;
  margin: 0.15rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};

  strong {
    font-size: ${posType.body};
    font-weight: ${posWeight.figure};
    color: ${({ theme }) => theme.color.text};
  }
`;

/* The book's own head: whose book it is, and how old. A live figure with no
   age is a live figure you cannot trust when the network drops. */
const AlertPosBookHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-weight: ${posWeight.label};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertPosFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  padding: 0.1rem 0 0.5rem;
`;

/* The run's shape, under the figures it belongs to. Full width, short, and
 * stretched — `preserveAspectRatio: none` is right here because the x axis is
 * "contracts in order" and has no unit to preserve. */
const AlertPosCurve = styled.div`
  padding: 0.15rem 0 0.55rem;

  svg {
    display: block;
    width: 100%;
    height: 2.2rem;
    overflow: visible;
  }

  path {
    fill: none;
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .pt-up {
    stroke: ${({ theme }) => theme.color.chartLineGreen};
  }

  .pt-down {
    stroke: ${({ theme }) => theme.color.chartLineRed};
  }

  .pt-zero {
    stroke: ${({ theme }) => theme.color.border};
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 3 3;
  }
`;

/* **The two halves of studying a contract, side by side.**
 *
 * The settlement block answers *what would I get for ending this* and the
 * readings answer *where does it stand*. They were stacked, so an open card
 * ran 255px tall and a panel with three contracts in it scrolled with one of
 * them open — on a screen whose whole point is that every contract has its own
 * row you can reach.
 *
 * They are a pair rather than a flow: neither grows without bound (three rows
 * and at most six cells), and both are read at a glance rather than in order,
 * which is exactly when columns beat a column. Stacked again below the small
 * breakpoint, where two columns of figures would be two columns of ellipses.
 *
 * Both tracks are minmax from zero: a grid column's default minimum is its
 * own content, so a long price string would push the settlement block wider
 * than the card instead of wrapping inside it. */
const AlertPosStudy = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 0.8rem;
  /* **One block, not a box beside a grid.** The settlement used to be a
     white panel of its own next to readings drawn straight on the card —
     two materials and two alignments (label left and figure right, against
     label over figure) for one subject, and the white box stopped 41px
     short of the grid it sat beside. The ground belongs to the pair now,
     and a hairline says where one question ends and the other begins. */
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  background: ${({ theme }) => theme.color.bg};

  > :last-child {
    /* Stretched to the settlement column's height, a readings grid with
       two rows spread them apart and "held for" floated to the middle. */
    align-content: start;
    padding-left: 0.8rem;
    border-left: 1px solid ${({ theme }) => theme.color.border};
  }

  /* No quote, no settlement column — and then no rule down the left edge
     of the readings, dividing them from nothing. */
  > :only-child {
    padding-left: 0;
    border-left: 0;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;

    > :last-child {
      padding-left: 0;
      border-left: 0;
      border-top: 1px solid ${({ theme }) => theme.color.border};
      padding-top: 0.5rem;
    }

    > :only-child {
      border-top: 0;
      padding-top: 0;
    }
  }
`;

const AlertPosDetail = styled.div`
  display: grid;
  /* Two fixed columns rather than auto-fit: this now lives in one half of
     the card, and auto-fit against a 6.2rem minimum resolved to a single
     column there — six readings in a stack, taller than the block beside it
     and the reason the card needed the height in the first place. Three
     across the full width when the study block stacks. */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem 0.7rem;
  padding: 0.15rem 0 0.15rem;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding-top: 0.4rem;
  }
`;

const AlertPosDetailCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
  font-family: ${({ theme }) => theme.font.primary};

  span {
    font-size: ${posType.micro};
    font-weight: ${posWeight.label};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }

  strong {
    font-size: ${posType.figure};
    font-weight: ${posWeight.figure};
    color: ${({ theme }) => theme.color.text};
  }

  /* The scorecard's figures carry a tone the six readings do not: a profit
     factor under one is a fact worth the down colour. */
  strong[data-tone="up"] {
    color: ${({ theme }) => theme.color.chartLineGreen};
  }

  strong[data-tone="down"] {
    color: ${({ theme }) => theme.color.chartLineRed};
  }
`;

const AlertPosCardFacts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.8rem;
  padding-top: 0.45rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertPosClose = styled.button.attrs({ type: "button" })`
  padding: 0.2rem 0.55rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  /* "All" is the one that ends the position, so it carries the ink; the
   * shares beside it are quieter, which is also the order they are usually
   * wanted in. */
  color: ${({ theme, strong }) => (strong ? theme.color.text : theme.color.textSecondary)};
  background: transparent;
  border: 1px solid
    ${({ theme, strong }) => (strong ? theme.color.borderHover : theme.color.border)};
  border-radius: 6px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
    color: ${({ theme }) => theme.color.text};
  }
`;

/* **The settlement block: in with, out with, and the balance after.**
 *
 * It answers a different question from the readings beside it — the readings
 * say where the position stands; this says what happens if you end it now,
 * and that is the number somebody is actually deciding on. It used to say so
 * with a white panel of its own; the ground is shared now (`AlertPosStudy`)
 * and the difference is carried by the column and the rule between them. */
const AlertPosSettle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.15rem 0;
  font-family: ${({ theme }) => theme.font.primary};
`;

/* **Label over figure, the same as every reading beside it.** It was a
 * label column and a right-aligned figure column — the right grammar for a
 * receipt, and the wrong one next to a grid that reads the other way: the
 * eye had to change direction halfway across one block. The colour is set on
 * the row and inherited rather than set on the figure, so a toned value
 * (`AlertPosValue`) keeps its own green or red. */
const AlertPosSettleRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
  font-size: ${posType.figure};
  font-weight: ${posWeight.figure};
  color: ${({ theme }) => theme.color.text};

  ${AlertPosKey} {
    font-size: ${posType.micro};
    font-weight: ${posWeight.label};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
`;

/* The balance is the figure the whole block builds to — what the account
 * would read a second later — so it is the one step of the ladder above
 * every other figure on the card. */
const AlertPosSettleBalance = styled.span`
  font-weight: ${posWeight.strong};
`;

/* The row's controls, on one line: three shares to close and the way into the
 * levels. They wrap rather than shrink — four buttons squeezed to fit are
 * four targets nobody can hit. */
const AlertPosActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.15rem;
`;

/* **A contract walking toward its liquidation, said on the row.**
 *
 * The margin ratio was printed among the facts as `ratio 90.83` — a number
 * that means "how close am I to losing this" and that cannot be read without
 * knowing the maintenance rate. Nothing raised its voice, so the first
 * announcement of trouble was the toast saying the contract had gone.
 *
 * Outside the reveal, like the way out, and for the same reason: it is the
 * one thing on this screen that cannot wait for you to unfold the right row.
 * A left bar rather than a filled panel, because a red block behind a row is
 * the loudest thing in a panel that is otherwise all hairlines, and this has
 * to be able to sit there for an hour without becoming wallpaper. */
const AlertPosAlarm = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-left: 2px solid ${({ theme }) => theme.color.chartLineRed};
  border-radius: 0 6px 6px 0;
  background: ${({ theme }) => theme.color.bgSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.chartLineRed};
  /* Only the sharper of the two bands earns any movement, and it runs once. */
  animation: ${({ danger }) => (danger ? fieldNudge : "none")} 0.22s ease;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/* The distance, in the row's own quiet ink: the alarm says how urgent, this
 * says how far, and they are two different facts. */
const AlertPosAlarmWhere = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* Drop one settled contract from the record. A `×` on the row rather than a
 * button with a word, because it sits at the end of a line of figures and a
 * labelled control there would be wider than the result it removes. */
const AlertPosRecordDrop = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: 0.3rem;
  right: 0.35rem;
  padding: 0.1rem 0.3rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.55;
  transition:
    opacity 0.15s ease,
    color 0.15s ease;

  &:hover,
  &:focus-visible {
    opacity: 1;
    color: ${({ theme }) => theme.color.text};
  }
`;

/* **Selling part of a contract has to be reachable from every row, always.**
 *
 * This strip is outside the accordion's reveal, and that is the whole point
 * of it. One row opens at a time — right for the settlement figures, the
 * levels and the margin editor, which are a *study* of one position — and
 * catastrophic for the one thing you do in a hurry: with three contracts
 * running, exactly one Close button was reachable, so taking a piece off the
 * second one meant folding the first away to find it. Measured before this:
 * three positions, **one** visible Close.
 *
 * Every share here **opens the ticket pre-filled** rather than firing. That
 * keeps the guard the fixed buttons never had — nothing irreversible happens
 * on one press — while still putting a quoted quarter-close one click from
 * any row, open or shut. */
const AlertPosQuick = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding-top: 0.5rem;
`;

const AlertPosQuickKey = styled.span`
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-right: 0.15rem;
`;

/* **The close ticket: a unit toggle, an amount, and what it leaves behind.**
 *
 * Three fixed shares and an All button is a control that answers a question
 * nobody asks in those words. Taking a position off in the piece you decided
 * on is most of what managing one *is*, and every venue offers it the same
 * way: type the size, in the coin or in the money, with the percentages as
 * shortcuts rather than as the only way in.
 *
 * It is the shape `AlertPosEdit` already uses — inset, ruled off above, one
 * column — because it is the same kind of thing: a second decision made about
 * a position that is already open, not a second ticket. */
const AlertPosCloseForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 0.45rem;
  padding-top: 0.45rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

/* The amount and the unit it is in, as one control: the toggle sits inside
 * the field's own border, the way the currency sign does on the balance box,
 * so the two cannot read as a number and an unrelated switch beside it. */
const AlertPosAmountField = styled.div`
  display: flex;
  align-items: stretch;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.color.bg};
  overflow: hidden;
  transition: border-color 0.15s ease;

  &:focus-within {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const AlertPosAmount = styled(AlertPosInput)`
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.5rem 0.55rem;
  font-size: ${posType.lead};
  border: none;
  border-radius: 0;
  background: transparent;

  &:focus {
    border: none;
    box-shadow: none;
  }
  font-weight: ${posWeight.strong};
`;

/* Two halves of one switch, sized to the longer of the two labels so the
 * field's right edge does not move when you change unit. */
const AlertPosUnits = styled.div`
  display: flex;
  flex: 0 0 auto;
  border-left: 1px solid ${({ theme }) => theme.color.border};

  /* Inside a 12px-radius field: the last unit must not square off the corner
     its container just rounded. */
  > *:last-child {
    border-top-right-radius: 11px;
    border-bottom-right-radius: 11px;
  }
`;

const AlertPosUnit = styled.button.attrs({ type: "button" })`
  min-width: 3.2rem;
  padding: 0 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.04em;
  color: ${({ theme, active }) => (active ? theme.color.bg : theme.color.textSecondary)};
  background: ${({ theme, active }) => (active ? theme.color.text : "transparent")};
  border: none;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  & + & {
    border-left: 1px solid ${({ theme }) => theme.color.border};
  }

  &:hover:not(:disabled) {
    color: ${({ theme, active }) => (active ? theme.color.bg : theme.color.text)};
  }
`;

/* What is being taken and what is left, side by side. They are the two halves
 * of one decision, so they are drawn as two columns of one block rather than
 * as a settlement block and a note — a partial close is the only place in
 * this panel where "after" is a position and not a balance. */
const AlertPosSplit = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.45rem 0.8rem;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  background: ${({ theme }) => theme.color.bgSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
`;

const AlertPosSplitCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  min-width: 0;
`;

const AlertPosSplitHead = styled.span`
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The stop and take-profit, changed after the fact. Inset and ruled off from
 * the row above so it reads as belonging to that position rather than as a
 * second ticket. */
const AlertPosEdit = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.45rem;
  padding-top: 0.45rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

/* Side, as the pair of buttons every venue leads with. Equal halves, because
 * neither is the default answer — and in this app's ink rather than the
 * green/red the exchanges use, since those two already mean a rising and a
 * falling price on the chart behind this panel. */
const AlertPosSides = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
`;

const AlertPosSide = styled.button.attrs({ type: "button" })`
  padding: 0.42rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  letter-spacing: 0.03em;
  color: ${({ theme, active }) => (active ? theme.color.bg : theme.color.text)};
  background: ${({ theme, active }) => (active ? theme.color.text : "transparent")};
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

/* The leverage slider. Styled rather than left native because the default
 * track is the operating system's and would be the loudest thing in a panel
 * that is otherwise all hairlines — the same reason `themedScrollbar` exists. */
const AlertPosSlider = styled.input`
  width: 100%;
  display: block;
  height: 1rem;
  margin: 0;
  appearance: none;
  font-family: ${({ theme }) => theme.font.primary};
  background: transparent;
  cursor: pointer;

  /* The travelled part of the track is filled. On a control whose range is
   * 1 to 200 the thumb alone is a dot on a line and says nothing about how
   * far along it stands; the fill is what makes the position readable at a
   * glance, and it is what the ticks below then label. */
  &::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      ${({ theme }) => theme.color.accent} 0%,
      ${({ theme }) => theme.color.accent} ${({ pct }) => pct}%,
      ${({ theme }) => theme.color.border} ${({ pct }) => pct}%,
      ${({ theme }) => theme.color.border} 100%
    );
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 13px;
    height: 13px;
    margin-top: -5px;
    border-radius: 50%;
    background: ${({ theme }) => theme.color.text};
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease;
  }

  &:hover::-webkit-slider-thumb {
    transform: scale(1.15);
  }

  &:active::-webkit-slider-thumb {
    transform: scale(1.25);
  }

  &:focus {
    outline: none;
  }

  &:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px ${({ theme }) => theme.color.text}33;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

/* **The leverage control is the slider and the ticks together**, which is why
 * it gets a wrapper: the marks below have to line up with the travel above
 * them, and they only do that if both are the same width with no padding
 * between. It takes the whole line rather than sitting in the right-hand lane
 * with the other controls — 200 values in 10rem is a pixel and a half per
 * step, which is not a control anyone can land on a number with. */
const AlertPosLev = styled.div`
  min-width: 0;
  margin: 0.15rem 0 0.1rem;
`;

/* Evenly spaced because the range is linear. The first and last are pulled
 * onto the ends of the track rather than centred in their share of the row,
 * or "1x" floats half a tick to the right of where the thumb can actually
 * go. */
const AlertPosTicks = styled.div`
  position: relative;
  height: 1.05rem;
  margin-top: 0.2rem;
`;

/* A mark you can also press, placed at its own value. Absolute rather than in
 * a flex row so the geometry continues to come from the scale itself; the two
 * ends are pulled inward by their own width rather than hanging off the rail. */
const AlertPosTick = styled.button.attrs({ type: "button" })`
  position: absolute;
  left: ${({ at }) => at}%;
  transform: translateX(
    ${({ edge }) => (edge === "start" ? "0" : edge === "end" ? "-100%" : "-50%")}
  );
  display: flex;
  flex-direction: column;
  align-items: ${({ edge }) =>
    edge === "start" ? "flex-start" : edge === "end" ? "flex-end" : "center"};
  gap: 0.12rem;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.primary};
  /* The colour lives on the button so the mark and its label move together —
   * currentColor on the mark is what keeps them one thing. Filled once
   * passed, so the row reads as a position along the range rather than as a
   * handful of separate numbers; the one you are standing on is in full ink. */
  color: ${({ theme, here, past }) =>
    here ? theme.color.text : past ? theme.color.accent : theme.color.textSecondary};
  transition: color 0.15s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
    border-radius: 3px;
  }
  ${touchBox};
`;

/* Taller where a number is printed, so the labelled notches read as the
 * major ones and the rest as the places in between — which is what they are. */
const AlertPosTickMark = styled.span`
  width: 1px;
  height: ${({ tall }) => (tall ? "5px" : "3px")};
  background: currentColor;
`;

/* Tabular figures, because these sit under a thumb that moves and a
 * proportional 1 makes the whole row jitter. */
const AlertPosTickText = styled.span`
  font-size: 0.56rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
`;

/* Same field as the prices, narrower, and right-aligned: it sits in the
 * control lane opposite its label, where the eye is reading a number off the
 * right edge of the panel like every other figure in this block. */

const AlertPosPresets = styled.div`
  display: flex;
  gap: 0.3rem;
`;

/* The symbol sits *in* the field rather than beside it, so the two read as
 * one control and the number stays flush left against it — a currency symbol
 * floating in the label lane belongs to nothing. */
const AlertPosMoneyField = styled.div`
  display: flex;
  align-items: stretch;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.color.bg};
  overflow: hidden;
  transition: border-color 0.15s ease;

  &:focus-within {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const AlertPosMoneySign = styled.span`
  display: flex;
  align-items: center;
  /* 0.85rem in, matching the field's own inset, and real space before the
     digits — it was 0.15rem, so the symbol and the number ran together. */
  padding: 0 0.5rem 0 0.85rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.figure};
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
`;

/* Bigger than the price fields and in the panel's own figures, because this
 * is the number the whole exercise is scaled by. Its border and background
 * come from the wrapper, so the two cannot draw two boxes. */
/* **The same size as every other number on the screen.** It was 1.05rem —
 * the largest text input in the product — on the argument that it is the
 * figure the whole exercise is scaled by. On its own that was true; beside a
 * 0.82rem entry price and a 0.82rem stop, in a panel whose every other control
 * is 0.82rem, it read as a different product's control. Weight carries the
 * emphasis now instead of size, which is what the rest of the app does. */
const AlertPosMoney = styled(AlertPosInput)`
  flex: 1 1 auto;
  padding: 0.75rem 0.85rem 0.75rem 0;
  font-size: ${posType.figure};
  letter-spacing: 0.02em;
  border: none;
  border-radius: 0;
  background: transparent;

  &:focus {
    border: none;
    box-shadow: none;
  }
  font-weight: ${posWeight.figure};
`;

/* What the field will quietly do to a number outside the range, said before
 * it does it. */
const AlertPosHint = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  line-height: 1.4;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ---- the terms, shown once ------------------------------------------- */

const termsIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
`;

/* A card, not a banner. While it is up there is no ticket behind it and
 * nothing to press past it, so it is given the weight of the thing it is
 * gating rather than the weight of a footnote. */
const AlertPosTerms = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.bgSecondary};
  animation: ${termsIn} 0.28s ease both;
`;

const AlertPosTermsTitle = styled.h4`
  margin: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`;

/* Four points, each one sentence: what it is, what the balance is not, what
 * the prices are not, and what none of it is advice about. Read as a list
 * because a paragraph of the same words is a paragraph nobody reads. */
const AlertPosTermsList = styled.ul`
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};

  & > li::marker {
    color: ${({ theme }) => theme.color.border};
  }
`;

/* ---- tabs, and the record --------------------------------------------- */

/* **Open contracts / Closed**, because they are two questions: what is
 * running and what to do about it, against what already happened. They were
 * one column with the history folded into a disclosure at the foot, which put
 * a form, a live list and an archive on one screen. */
/* Wraps on a phone rather than running its last tab past the card's edge
   (measured at 420px: "Account" hung outside the desk). */
const AlertPosTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.2rem;

  /* In a column of its own the desk is 28rem, and five tabs wrapped onto a
     second line inside it. One line that scrolls instead — the tab you are
     on is always the one in view. */
  @media (min-width: ${PORTFOLIO_WIDE}px) {
    flex-wrap: nowrap;
    overflow-x: auto;
    ${themedScrollbar};

    > * {
      flex: 0 0 auto;
    }
  }
  /* The same folder band the reading card wears, bled to the desk's edges
     so the two cards speak one language. */
  margin: 0 -1.1rem 0.85rem;
  padding: 0.55rem 0.75rem 0;
  background: ${({ theme }) => theme.color.bgSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 13px 13px 0 0;
`;

const AlertPosTab = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.38rem 0.7rem 0.42rem;
  margin-bottom: -1px;
  white-space: nowrap;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  font-weight: ${({ active }) => (active ? posWeight.strong : posWeight.label)};
  color: ${({ theme, active }) => (active ? theme.color.text : theme.color.textSecondary)};
  background: ${({ theme, active }) => (active ? theme.color.bg : "transparent")};
  border: 1px solid ${({ theme, active }) => (active ? theme.color.border : "transparent")};
  border-bottom-color: ${({ theme, active }) => (active ? theme.color.bg : "transparent")};
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

const AlertPosTabCount = styled.span`
  font-size: ${posType.micro};
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The position's place in the list. With more than one running, "the BTC one"
 * stops being an address. Quiet, because it is a handle rather than a
 * reading. */
const AlertPosNumber = styled.span`
  margin-right: 0.4rem;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The three figures the record is for, across the top of the Closed tab. */
const AlertPosScore = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  padding: 0.7rem 0 0.75rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
`;

const AlertPosScoreCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
`;

const AlertPosScoreValue = styled.span`
  font-size: ${posType.lead};
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.text};
  font-weight: ${posWeight.strong};
`;

/* A coin-settled account is a set of wallets, never one total obtained by
 * adding BTC to ETH. Each row therefore keeps the asset beside its own free
 * balance and realised result. */
const AlertPosWallets = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.65rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
`;

const AlertPosWallet = styled.div`
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr) minmax(0, 1fr);
  align-items: baseline;
  gap: 0.55rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.text};

  & > span:not(:first-child) {
    text-align: right;
  }
`;

const AlertPosRecordList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 0.5rem;
`;

/* **One settled contract, one card.**
 *
 * The record was twenty text lines in a column — `BTC Long 37x · closed ·
 * +12.40 · ×` — and at that density it reads as a log file, not as a list of
 * things that each happened once. Nothing said where one entry ended and the
 * next began except a 0.28rem gap, and the × of one row sat a few pixels from
 * the coin of the next.
 *
 * A bordered card is the shape the rest of this app already uses for "one of
 * these" — the position card, the account summary, the money drawer — so this
 * is that idiom rather than a new one. It also buys the room to say what the
 * contract actually *was*, which the line had no space for: its size and the
 * price it left at were in the event all along and were never shown. */
const AlertPosRecordCard = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.55rem 2rem 0.55rem 0.65rem;
  font-family: ${({ theme }) => theme.font.primary};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const AlertPosRecordTop = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: ${posType.body};
`;

/* The coin carries the weight, because it is what the eye scans a record for.
 * The side and the leverage ride with it in secondary ink — one line, two
 * levels, no second row spent on furniture. */
const AlertPosRecordCoin = styled.span`
  color: ${({ theme }) => theme.color.text};

  > span {
    padding-left: 0.35rem;
    font-size: ${posType.micro};
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* **How it ended, which the result figure cannot say.** `-40.00` is a loss
 * whether the stop took it or the account ran out of margin, and those are
 * not the same event. Neutral by default — green and red beside it already
 * mean the money — and in the down colour only for a liquidation, which is a
 * different kind of ending rather than a worse number. */
const AlertPosRecordWhy = styled.span`
  align-self: flex-start;
  padding: 0.12rem 0.4rem;
  font-size: ${posType.micro};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme, liquidated }) =>
    liquidated ? theme.color.chartLineRed : theme.color.textSecondary};
  border: 1px solid
    ${({ theme, liquidated }) =>
      liquidated ? theme.color.chartLineRed : theme.color.border};
  border-radius: 999px;
`;

/* **The process grade**, one letter in the chip's own ink: A in the text
 * colour, B in secondary, C in the down colour — a C is the only one that
 * asks to be looked at, and the down colour beside it already means "this
 * cost". Same shape as the ending chip so the two read as one row of facts. */
const AlertPosRecordGrade = styled.span`
  align-self: flex-start;
  padding: 0.12rem 0.4rem;
  font-size: ${posType.micro};
  font-weight: ${posWeight.strong};
  letter-spacing: 0.06em;
  color: ${({ theme, grade }) =>
    grade === "C"
      ? theme.color.chartLineRed
      : grade === "B"
        ? theme.color.textSecondary
        : theme.color.text};
  border: 1px solid
    ${({ theme, grade }) => (grade === "C" ? theme.color.chartLineRed : theme.color.border)};
  border-radius: 999px;
  cursor: help;
`;

/* What the contract was, under what it came to. */
const AlertPosRecordLine = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ---- the active contract, on its chart ------------------------------- */

/* **A live position needs more than a dot on a toolbar icon.**
 *
 * The chart draws the contract's levels, but a level can be outside the
 * visible range and the old green dot said neither which contract was open
 * nor what it was doing. This quiet dock sits in the chart rather than taking
 * layout space from it: coin, side, leverage and live P/L are always one read,
 * and the whole thing is the route back to Futures.
 *
 * It keeps the panel's 8px corner instead of becoming a floating pill, and
 * uses no continuous animation — the numbers already move with the market. */
/* **The chart's position widget, which now opens where it stands.**
 *
 * It was a single button that threw you into the Futures panel — a chart-wide
 * overlay — to answer "how big is this and can I take some off". Both are two
 * lines of figures and a row of shares, so the widget carries them itself and
 * the panel stays for everything else.
 *
 * **It grows down and sideways, never up.** It is pinned at `top`, so the box
 * expanding cannot push its own header off the chart's top edge or over the
 * range switcher above it — the one direction it must not travel. Width is
 * animated from the same centre (`left: 50%` with a `translateX(-50%)`), so
 * widening opens evenly to both sides instead of shunting the header sideways.
 *
 * A container, not a button: the expanded body holds buttons of its own and a
 * button cannot contain a button — the rule `NewsCluster` already follows for
 * anchors. */
const PracticeChartDock = styled.div`
  position: absolute;
  top: 0.45rem;
  left: 50%;
  z-index: 35;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: calc(100vw - 2rem);
  padding: 0.38rem 0.58rem;
  transform: translateX(-50%);
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  box-shadow: 0 4px 14px ${({ theme }) => theme.color.shadow};
  white-space: nowrap;
  overflow: hidden;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 0;
  /* Widen on open, with width rather than a transform scale: a scaled box
     scales its text with it, and this has to stay legible the whole way. */
  /* 22rem, not 21: the readings now have an inset on both sides and the
     funding clock is the last of them — a width chosen against the old
     zero-padding row clips the new one. */
  width: ${({ open }) => (open ? "min(22rem, calc(100vw - 2rem))" : "auto")};
  transition:
    border-color 0.16s ease,
    width 0.22s ease,
    transform 0.16s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus-within {
    border-color: ${({ theme }) => theme.color.textSecondary};
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    top: 0.2rem;
    gap: 0.38rem;
    padding: 0.34rem 0.48rem;
    font-size: ${posType.micro};
  }
`;

const PracticeChartDockMark = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PracticeChartDockName = styled.span`
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

/* **"1 of 3" — because the chart draws one of them.**
 *
 * A market can carry as many contracts as the balance allows now, and the
 * chart draws the newest: five entries and five liquidations on one price
 * scale is a mesh, not a reading. So the strip has to say that the thing it
 * is showing is one of several, or it reads as the whole position. A count,
 * not a list: the panel is where the list lives, and the badge's job is to
 * send somebody there rather than to be it.
 *
 * Rests as a chip in the border colour rather than the accent — it is a fact
 * about the dock, not something to press. */
const PracticeChartDockCount = styled.span`
  padding: 0.05rem 0.32rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
`;

const PracticeChartDockPnl = styled.span`
  padding-left: 0.5rem;
  border-left: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.textSecondary};
`;

const PracticeChartDockOpen = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.color.textSecondary};
  /* Points along the way through while shut and down into the body once it is
     open, so the chevron says which way the box is about to travel. */
  transform: rotate(${({ open }) => (open ? "0deg" : "-90deg")});
  transition: transform 0.22s ease;
`;

/* ---- adding funds, and the four seconds it takes --------------------- */

/* **A wait with a shape, not a spinner.**
 *
 * The account is imaginary, and money that appears the instant a button is
 * pressed teaches the one habit this whole section exists to argue against —
 * that more funds are always a click away. So a deposit takes
 * `PRACTICE_DEPOSIT_MS`, and the bar is what makes that a wait somebody is
 * *shown* rather than a button that has gone unresponsive.
 *
 * `scaleX` on a `transform`, never a `width`: this is the new-tab page, and
 * animating a geometric property means layout and paint on every frame of
 * every tab that happens to be open on this screen. The fill is one composited
 * layer moving; the track never changes.
 *
 * The duration is interpolated from the model's constant rather than written
 * here, so the bar and the timer that lands the money cannot disagree — a bar
 * that finishes early is a promise the balance has not kept yet.
 */
const posFundFill = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

const AlertPosFundTrack = styled.div`
  position: relative;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.border};
`;

const AlertPosFundFill = styled.div`
  height: 100%;
  border-radius: 3px;
  background: ${({ theme }) => theme.color.accent};
  transform-origin: left center;
  transform: scaleX(0);
  animation: ${posFundFill} ${PRACTICE_DEPOSIT_MS}ms linear forwards;
`;

/* The button and the way out, side by side and the same height. Cancel is
 * offered for the whole four seconds because a wait you cannot leave is a
 * modal without a frame — and it is the *only* way the money does not land:
 * closing the panel commits, rather than throwing away a deposit somebody
 * asked for and then watched for three seconds. */
const AlertPosFundRow = styled.div`
  display: flex;
  gap: 0.4rem;
  align-items: stretch;

  > * {
    flex: 1 1 0;
  }
`;

/* What is happening, in words, for anyone who cannot see the bar move. The
 * bar itself is decorative to a screen reader — it carries no value it could
 * announce without a re-render a frame — so the sentence is the control's
 * real status and is what `aria-live` reads. */
const AlertPosFundStatus = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  line-height: 1.4;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* **The money button carries its own bar.** Asked for as "düğme üstü bar":
 * while a deposit or a withdrawal is landing, the four-second fill runs
 * *inside* the button behind its label — the button is the thing that was
 * pressed, so the button is where the wait is shown. The track fills the
 * button, the fill is the accent at a strength that keeps the label
 * readable in both palettes, and the label sits above it. When the money
 * has landed the button reads "Done"/"Sent" in the quiet style for a
 * moment. Same rules as the standalone bar: transform only, the model's
 * own duration. */
const AlertPosTransferButton = styled(AlertPosButton)`
  position: relative;
  overflow: hidden;
  min-height: 2.4rem;
  ${({ complete, theme }) =>
    complete
      ? `
    color: ${theme.color.text};
    background: ${theme.color.bgSecondary};
    border-color: ${theme.color.border};
  `
      : ""}

  > ${AlertPosFundTrack} {
    position: absolute;
    inset: 0;
    height: auto;
    border-radius: inherit;
    background: transparent;
  }

  > ${AlertPosFundTrack} > ${AlertPosFundFill} {
    border-radius: 0;
    opacity: 0.45;
  }

  &[aria-busy="true"] {
    cursor: progress;
    opacity: 1;
  }
`;

const AlertPosButtonLabel = styled.span`
  position: relative;
  z-index: 1;
`;

/* **The Funds pane** — the two money cards, one under the other, each in
 * its own box so Add funds and Withdraw read as two equal actions rather
 * than a form with a footnote. The game note sits above both. */
const AlertPosFunds = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;

  > [data-practice-fund],
  > [data-practice-withdraw] {
    padding: 0.8rem 0.85rem 0.9rem;
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: 12px;
    background: ${({ theme }) => theme.color.bgSecondary};
  }
`;

/* ---- what a stop and a take-profit are worth -------------------------- */

const AlertPosLevelValue = styled.span`
  text-align: right;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.textSecondary};
  font-weight: ${posWeight.figure};
`;

/* Reward against risk, under the two figures it is drawn from. Neutral ink on
 * purpose: green and red two lines above already mean the take and the stop,
 * and a coloured ratio would read as a verdict on the trade — which is the
 * one thing this app does not offer. */
const AlertPosRatio = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  color: ${({ theme }) => theme.color.textSecondary};
  font-weight: ${posWeight.figure};
`;

/* The result as a share of the margin behind it, beside the money. Smaller
 * and lighter than the figure it qualifies: it is the second reading of one
 * number, not a second number. Takes the same tone, because a gain that read
 * green in money and neutral in percent would look like two different facts
 * about the same position. */
const AlertPosRoe = styled.span`
  padding-left: 0.35rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  opacity: 0.75;
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.textSecondary};
`;

/* ---- the account summary, and the tab's sections --------------------- */

/* **Where you stand, before anything you can set.** Four figures in a grid
 * rather than a column of rows: they are read together — equity against what
 * is committed against what is free — and a column makes that three separate
 * readings. Two columns rather than four, because at this panel's width four
 * money figures on one line wrap mid-number, which is worse than a second row.
 */
const AlertPosSummary = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.05rem 0.9rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.bgSecondary};
`;

const AlertPosSummaryCell = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.22rem 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};

  /* The equity cell leads: it spans both columns and carries the type, because
     it is the one figure that answers "how am I doing" on its own. */
  &:first-child {
    grid-column: 1 / -1;
    padding-bottom: 0.45rem;
    margin-bottom: 0.3rem;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
  }
`;

const AlertPosSummaryValue = styled.span`
  font-size: ${({ lead }) => (lead ? "1.15rem" : "0.8rem")};
  letter-spacing: 0;
  text-transform: none;
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.text};
`;

/* The loss cap as a proportion. A rule you can be stopped by is a rule you are
 * owed a sight of, and "5% of 10,000" is a sentence you have to do arithmetic
 * on — this is the same fact as a distance. `scaleX` on a transform, never a
 * width: this is the new-tab page. */
/* The caption the bar under it never had. Full width of the summary grid, so
 * the name sits at one end and the standing at the other — the shape every
 * other row of this card already uses. */
const AlertPosGaugeHead = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.7rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertPosGauge = styled.div`
  grid-column: 1 / -1;
  margin-top: 0.3rem;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.border};
`;

const AlertPosGaugeFill = styled.div`
  height: 100%;
  transform-origin: left center;
  transform: scaleX(${({ pct }) => Math.max(0, Math.min(1, pct / 100))});
  background: ${({ theme, pct }) =>
    pct >= 80 ? theme.color.chartLineRed : theme.color.textSecondary};
  transition: transform 0.3s ease;
`;

/* A named division of the tab. The screen was one flat column in which the
 * simulated balance and the loss limit had identical weight, one under the
 * other, with nothing saying which is a fact about your money and which is a
 * rule you set. Every venue read for this groups the screen — see
 * `docs/product/derivatives-simulator/ACCOUNT_SCREEN_RESEARCH.md`.
 *
 * A **sibling, not a wrapper**: `AlertPosTicket` is already a flex column with
 * its own gap, so a heading between two steps divides the flow without moving
 * a single step into a new argument list — and the next section is one line
 * rather than a re-nest. */
const AlertPosSectionHead = styled.h4`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.3rem 0 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};

  /* A rule that runs to the right edge, so the heading reads as a division of
     the screen and not as another label in the list under it. */
  &::after {
    content: "";
    flex: 1 1 auto;
    height: 1px;
    background: ${({ theme }) => theme.color.border};
  }
`;

/* ---- the chart widget, opened ---------------------------------------- */

/* The row you press. It carries the padding the container gave up, so the
 * collapsed widget looks exactly as it did before it could open. */
const PracticeDockHead = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.38rem 0.58rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: none;
  cursor: pointer;
  white-space: nowrap;

  &:focus-visible {
    outline: none;
  }
`;

/* **Opens downward on a max-height, the reveal idiom this codebase already
 * uses** (`SettingReveal`, `AlertPosReveal`). Not a scaleY: scaling squashes
 * the type on the way and the figures inside are the reason the thing opens.
 * `visibility` rather than `display` so the transition has something to run
 * on, and `[hidden]`-style removal would jump. */
const PracticeDockBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: ${({ open }) => (open ? "16rem" : "0")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  padding: ${({ open }) => (open ? "0 0.58rem 0.55rem" : "0 0.58rem")};
  overflow: hidden;
  transition:
    max-height 0.22s ease,
    opacity 0.16s ease,
    padding 0.22s ease;
`;

const PracticeDockFacts = styled.div`
  display: grid;
  grid-template-columns: auto auto;
  justify-content: space-between;
  gap: 0.12rem 0.9rem;
  padding-top: 0.45rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PracticeDockFactValue = styled.span`
  text-align: right;
  color: ${({ theme }) => theme.color.text};
`;

/* Take some off, without leaving the chart. The shares are the close ticket's
 * own (`practiceCloseShare`), so a quarter here and a quarter there cannot be
 * two different quantities. */
const PracticeDockActions = styled.div`
  display: flex;
  gap: 0.3rem;

  > * {
    flex: 1 1 0;
  }
`;

const PracticeDockAction = styled.button.attrs({ type: "button" })`
  padding: 0.32rem 0.2rem;
  border-style: ${({ armed }) => (armed ? "dashed" : "solid")};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid
    ${({ theme, armed }) => (armed ? theme.color.chartLineRed : theme.color.border)};
  border-radius: 7px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

/* The way through to everything this widget deliberately does not carry. */
const PracticeDockMore = styled(PracticeDockAction)`
  color: ${({ theme }) => theme.color.textSecondary};
  border-style: dashed;
`;

/* What the shares below are a share *of*. A bare "25%" beside a position could
 * be a quarter of the size, the profit or the margin; the heading names the
 * verb once so the buttons can stay as short as they need to be. */
const PracticeDockLabel = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: ${posType.micro};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The quantity the armed press would actually take. In the app's figures and
 * in full ink, because it is the fact the confirmation is asking about. */
const PracticeDockArmed = styled.span`
  letter-spacing: 0;
  text-transform: none;
  color: ${({ theme }) => theme.color.text};
`;

/* ---- the drawer at the foot of the Account tab ------------------------ */

/* Everything that changes the money, shut by default. Bordered rather than
 * headed with a rule, because unlike the sections above it this one is a thing
 * you open, and a heading that is also a button has to look like a button. */
const AlertPosDrawer = styled.div`
  margin-top: 0.4rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  overflow: hidden;
`;

const AlertPosDrawerHead = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

const AlertPosDrawerChevron = styled.span`
  display: inline-flex;
  align-items: center;
  transform: rotate(${({ open }) => (open ? "0deg" : "-90deg")});
  transition: transform 0.22s ease;
`;

const AlertPosDrawerBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  max-height: ${({ open }) => (open ? "44rem" : "0")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  padding: ${({ open }) => (open ? "0.2rem 0.75rem 0.85rem" : "0 0.75rem")};
  overflow: hidden;
  visibility: ${({ open }) => (open ? "visible" : "hidden")};
  transition:
    max-height 0.26s ease,
    opacity 0.18s ease,
    padding 0.26s ease,
    visibility 0s linear ${({ open }) => (open ? "0s" : "0.26s")};
`;

/* **The warning that has to be there.** Setting the balance does not adjust an
 * account, it *replaces* one: the record, the lots and every settled contract
 * go with it. That is a fine thing to offer and an indefensible thing to do on
 * one press of a chip that looks exactly like the plan chips above it. */
const AlertPosDanger = styled.p`
  margin: 0;
  padding: 0.5rem 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  line-height: 1.45;
  color: ${({ theme }) => theme.color.text};
  border: 1px dashed ${({ theme }) => theme.color.chartLineRed};
  border-radius: 9px;
`;

/* ---- "what is this?" ------------------------------------------------- */

/* A ring beside the label of a control that people misread. The same shape
 * the panel's own head uses, at the size of the label it sits against — the
 * idiom is `AlertsInfoBtn`'s, not a new one.
 *
 * Quiet until wanted: leverage and margin are the two words in this panel that
 * everybody thinks they know, so the ring has to be *there* without competing
 * with the number it is explaining. */
const AlertPosWhat = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.95rem;
  height: 0.95rem;
  margin-left: 0.35rem;
  padding: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  line-height: 1;
  color: ${({ theme, open }) => (open ? theme.color.text : theme.color.textSecondary)};
  background: transparent;
  border: 1px solid
    ${({ theme, open }) => (open ? theme.color.text : theme.color.border)};
  border-radius: 999px;
  cursor: pointer;
  /* Full strength shut as well: the secondary ink at 0.7 measured 2.9:1,
     and the ring is the only way into what it explains. */
  opacity: 1;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;

  &:hover,
  &:focus-visible {
    opacity: 1;
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.borderHover};
  }
  ${touchTarget};
  /* Its finger-sized box reaches the row of buttons under the alarm's head
     (390px): above them, or the lower half presses "Chrome notification". */
  @media (pointer: coarse) {
    z-index: 1;
  }
`;

/* **A card under the control, not a popover over it.** The rule the panel's
 * own info card already follows: a popover covers the thing it is describing,
 * and every one of these explanations is about a number that is on screen. */
const AlertPosExplain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.7rem 0.8rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
`;

/* One idea per line, with its own heading, so the card can be read by
 * skimming the left column rather than by reading the paragraph. */
const AlertPosExplainRow = styled.div`
  display: grid;
  grid-template-columns: 5.6rem 1fr;
  gap: 0.2rem 0.7rem;

  > strong {
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: ${posType.micro};
    color: ${({ theme }) => theme.color.text};
  }

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

/* ---- the outlook, before a contract ----------------------------------- */

/* **The fan.** Where the resampled paths landed at each horizon: the outer
 * band is the 5th to 95th, the inner the 25th to 75th, the line the median —
 * all as prices, on the market's own scale. Fills read the theme through
 * currentColor so the light and dark palettes need no second copy; the
 * opacities are what keep the two bands apart at a glance. Nothing here
 * animates: this is the new-tab page. */
const AlertPosFan = styled.svg`
  display: block;
  width: 100%;
  height: 4.6rem;
  overflow: visible;
  color: ${({ theme }) => theme.color.textSecondary};

  .fan-outer {
    fill: currentColor;
    opacity: 0.14;
  }

  .fan-inner {
    fill: currentColor;
    opacity: 0.22;
  }

  /* The box is stretched to its width (preserveAspectRatio none), so every
     stroke declares itself non-scaling or a line would be a wedge. */
  .fan-median {
    fill: none;
    stroke: ${({ theme }) => theme.color.text};
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }

  .fan-now {
    stroke: ${({ theme }) => theme.color.border};
    stroke-width: 1;
    stroke-dasharray: 2 3;
    vector-effect: non-scaling-stroke;
  }
`;

/* One horizon per row: how far, the 5–95 range, the median, and how many of
 * the paths landed above the start — the denominator is in the head. */
const AlertPosHorizons = styled.div`
  display: grid;
  grid-template-columns: 2.6rem 1fr auto auto;
  gap: 0.25rem 0.6rem;
  align-items: baseline;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};

  > strong {
    font-weight: ${posWeight.label};
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.text};
  }

  > b {
    font-weight: ${posWeight.figure};
    font-size: ${posType.body};
    color: ${({ theme }) => theme.color.text};
    white-space: nowrap;
  }

  > span {
    white-space: nowrap;
  }

  @media (max-width: 420px) {
    grid-template-columns: 2.6rem 1fr;

    > span {
      grid-column: 2;
    }
  }
`;

/* **The setup gates on the ticket.** Four rows in the explain card's own
 * grammar — a heading on the left, the fact on the right — with the code the
 * fact became in a chip, because the chip is what gets stamped on the
 * contract and what the record is later read by. A chip is a fact, so it is
 * never coloured as good or bad. */
const AlertPosGateCode = styled.span`
  display: inline-block;
  margin: 0 0.4rem 0.25rem 0;
  padding: 0.06rem 0.35rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  font-size: ${posType.micro};
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.color.text};
  white-space: nowrap;
`;

/* ---- folder tabs ----------------------------------------------------- */

/* **Tabs that sit on the card like a folder's.** The reading card's tabs
 * were chips spread across the card's width (justify: space-between), so
 * "Positions" was at one edge and "Headlines" at the other with nothing
 * between — asked for as "bunları biraz daha yaklaştır ama birbirleri içine
 * girmesinler". Now they stand together on a quiet band across the card's
 * head, the open one joined to the body below it (its own background, the
 * band's rule broken under it), the shut ones a step back. A fixed gap and
 * wrapping keep them apart at every width. Anything that is not a tab
 * (Close all) goes to the far end. */
const PracticeFolderTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.2rem;
  margin: -0.9rem -1.1rem 0.85rem;
  padding: 0.55rem 0.75rem 0;
  background: ${({ theme }) => theme.color.bgSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 13px 13px 0 0;

  > [data-practice-folder-end] {
    margin-left: auto;
    align-self: center;
    padding-bottom: 0.45rem;
  }
`;

const PracticeFolderTab = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.38rem 0.7rem 0.42rem;
  margin-bottom: -1px;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  font-weight: ${({ active }) => (active ? posWeight.strong : posWeight.label)};
  white-space: nowrap;
  color: ${({ theme, active }) => (active ? theme.color.text : theme.color.textSecondary)};
  background: ${({ theme, active }) => (active ? theme.color.bg : "transparent")};
  border: 1px solid ${({ theme, active }) => (active ? theme.color.border : "transparent")};
  border-bottom-color: ${({ theme, active }) => (active ? theme.color.bg : "transparent")};
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }

  /* The count rides in the tab as a small numeral, not as part of the name. */
  > span {
    font-size: ${posType.micro};
    font-weight: ${posWeight.label};
    padding: 0.02rem 0.32rem;
    border-radius: 999px;
    background: ${({ theme, active }) => (active ? theme.color.bgSecondary : theme.color.bg)};
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* **The assistant on the chart.** What is missing and what has a clock on
 * it, as chips under the strip — the chart is where the eye is, and a tab
 * nobody has opened says nothing. Each chip opens the Assistant tab. */
const PracticeChartFlags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: -0.2rem 0 0.6rem;
`;

const PracticeChartFlag = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem 0.2rem 0.4rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme, kind }) => (kind === "missing" ? theme.color.text : theme.color.border)};
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  > b {
    font-weight: ${posWeight.strong};
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 0.55rem;
    color: ${({ theme, kind }) => (kind === "missing" ? theme.color.text : theme.color.textSecondary)};
  }

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
  ${touchTarget};
`;

/* ---- the assistant ------------------------------------------------------ */

/* A row: the kind on the left, then the title, the sentence with its
 * numbers, the why in secondary ink and, where a press can go somewhere, one
 * chip. The kind is a word in a pill, never a colour that means good or bad:
 * "missing" carries the text ink because a desk never trades without it,
 * "watch" and "note" the secondary ink. */
const AlertPosAssistRow = styled.div`
  display: grid;
  grid-template-columns: 4.2rem 1fr;
  gap: 0.2rem 0.7rem;
  align-items: start;

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  > div > strong {
    font-weight: ${posWeight.strong};
    font-size: ${posType.body};
    color: ${({ theme }) => theme.color.text};
  }

  > div > span {
    font-size: ${posType.micro};
    line-height: 1.5;
    color: ${({ theme }) => theme.color.text};
  }

  > div > button {
    align-self: flex-start;
    margin-top: 0.15rem;
  }

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const AlertPosKind = styled.span`
  justify-self: start;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
  font-size: ${posType.micro};
  font-weight: ${({ kind }) => (kind === "missing" ? posWeight.strong : posWeight.label)};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ theme, kind }) => (kind === "missing" ? theme.color.text : theme.color.textSecondary)};
  border: 1px solid ${({ theme, kind }) => (kind === "missing" ? theme.color.text : theme.color.border)};
`;

const AlertPosWhy = styled.span`
  && {
    color: ${({ theme }) => theme.color.textSecondary};
    font-style: italic;
  }
`;

const AlertPosAssistActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.15rem;

  &:empty {
    display: none;
  }
`;

const AlertPosAssistContract = styled.div`
  font-size: ${posType.micro};
  font-weight: ${posWeight.label};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ---- the strip across the top of the chart --------------------------- */

/* **The space either side of the widget was the point.**
 *
 * The dock sat centred at the top of the chart as a small pill with a hundred
 * empty pixels of chart on each side of it, and it carried the coin, the side,
 * the leverage and the money — none of which answers the question somebody
 * actually has open on a chart, which is *how close am I*.
 *
 * So the readings go in that space: the distance to liquidation, the health of
 * the margin behind the contract, and the clock to the next funding
 * settlement. They sit **outside** the pill rather than inside it, so the pill
 * keeps its own shape and its own press, and the strip is what widens.
 *
 * Hidden below the breakpoint rather than wrapped: a chart on a narrow window
 * has no space to give away, and three readings stacked over the price is
 * worse than three readings you can get by opening the widget. */
const PracticeDockStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  /* **The same inset as the head above it, on all four sides.** It had a left
     padding of its own (0.7rem against the head's 0.58rem, so the two rows
     did not line up), no right padding — measured, the funding clock ran to
     within a pixel of the edge and was clipped by the card's own overflow —
     and no bottom padding at all, so the row sat on the floor of the strip.
     Three readings pressed into a 40px box is what "cramped" looks like. */
  padding: 0.12rem 0.58rem 0.46rem;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;

  @media (max-width: 900px) {
    display: none;
  }
`;

const PracticeDockStat = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 0.28rem;

  > strong {
    font-weight: 400;
    color: ${({ theme, tone }) =>
      tone === "danger"
        ? theme.color.chartLineRed
        : tone === "warn"
          ? theme.color.accent
          : tone === "up"
            ? theme.color.chartLineGreen
            : tone === "down"
              ? theme.color.chartLineRed
              : theme.color.text};
  }
`;

/* How much of the way to liquidation has been used, as a distance rather than
 * a sentence — the rule the account's loss gauge already follows. `scaleX` on
 * a transform, never a width: this is the new-tab page. */
const PracticeDockGauge = styled.span`
  display: inline-block;
  width: 3.2rem;
  height: 3px;
  border-radius: 2px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.border};
`;

const PracticeDockGaugeFill = styled.span`
  display: block;
  height: 100%;
  transform-origin: left center;
  transform: scaleX(${({ pct }) => Math.max(0, Math.min(1, pct / 100))});
  background: ${({ theme, tone }) =>
    tone === "danger"
      ? theme.color.chartLineRed
      : tone === "warn"
        ? theme.color.accent
        : theme.color.textSecondary};
  transition: transform 0.3s ease;
`;

/* ── The Pro page (practice-page.js) ──────────────────────────────────────
 *
 * The page itself is the portfolio's (`PortfolioShell` and friends); what is
 * here is only what that screen has no equivalent of. */

/* **The right column's ground.** Every control in the tabs was drawn for the
 * panel's grey — white fields, a white study block, a sticky foot painted the
 * card's colour — and on the page's white they would lose their edges. The
 * portfolio puts its own holdings rows on the same grey for the same reason. */
/* **The page's one card.** Every block in the reading column and the book
 * under the desk share it — the same inset, the same corner, a card's gap
 * apart — so the page reads as a set of instruments rather than a stack of
 * paragraphs with a frame here and there. 1.25rem at the sides is the desk's
 * own inset, so the two columns' contents start the same distance in. */
const practicePanel = css`
  margin-top: 0.9rem;
  padding: 0.9rem 1.1rem 1rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  background: ${({ theme }) => theme.color.bg};
  min-width: 0;
`;

const PracticePanel = styled.section`
  ${practicePanel};
`;

/* The market's name and the chart's range, one line at the card's head. */
const PracticeMarketHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.8rem;

  > strong {
    font-family: ${({ theme }) => theme.font.primary};
    font-size: ${posType.lead};
    font-weight: ${posWeight.strong};
    color: ${({ theme }) => theme.color.text};
  }
`;

/* **The ticket stays with you.** On a window with two columns the reading
 * column is the long one; the desk is sticky beside it and scrolls inside
 * itself when the ticket is taller than the window, so the page does not
 * grow a second screen for a form that is always the same height. */
const PracticeDesk = styled.div`

  /* Tight at the foot on purpose: measured at 1440×900 with a contract held,
     the desk ended 3px past the window at 1.25rem, and the desk is the half
     of this page that must fit. */
  padding: 0.9rem 1.25rem 0.9rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  min-width: 0;
`;

/* Framed like the portfolio's chart: a white box with a hairline, so the
 * axis and the lines have an edge to be read against. */
/* The chart's style pair, set a little apart from the ranges it sits
   beside — two questions, one row. */
const PracticeChartStyle = styled.span`
  display: inline-flex;
  gap: 0.3rem;
  ${({ flush, theme }) =>
    flush
      ? ""
      : `margin-left: 0.6rem; padding-left: 0.6rem; border-left: 1px solid ${theme.color.border};`}
`;

/* The scaled order's row on the ticket: To and the count side by side, and
   the levels under them as a quiet ladder — price, then the size at it. */
const AlertPosScale = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.6rem 1rem;
  align-items: end;
  padding-top: 0.2rem;
`;

const AlertPosScaleLevels = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 0.2rem 0.9rem;
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.text};

  > span {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
  }

  em {
    font-style: normal;
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* The order history under the Orders tab: a ledger of three columns, the
   outcome in the text ink (filled) or quiet (cancelled, refused). */
const AlertPosHistory = styled.div`
  margin-top: 1rem;
`;

const AlertPosHistoryRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) auto;
  gap: 0.2rem 0.8rem;
  padding: 0.4rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};

  strong {
    font-weight: ${posWeight.strong};
    color: ${({ theme, status }) => (status === "filled" ? theme.color.text : theme.color.textSecondary)};
  }
`;

/* The Orders tab's head: how many are waiting, and Cancel all. */
const AlertPosOrdersHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  font-size: ${posType.micro};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* **The page's settings sheet** (renderPageSettings): a card over the
   terminal's top-right corner, under the head's Settings button, scrolling
   inside itself. Not a drawer: it changes this page, and the page stays
   in sight around it. */
const PracticeSettingsSheet = styled.div`
  position: absolute;
  z-index: 6;
  /* Under the head's buttons, not over them: the button that opened it
     is the one that closes it. */
  top: 4.4rem;
  right: 1.25rem;
  width: min(30rem, calc(100% - 2.5rem));
  max-height: calc(100% - 5.4rem);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 0.9rem 1.1rem 1rem;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  box-shadow: 0 18px 50px ${({ theme }) => theme.color.shadow};
  animation: ${portfolioFadeIn} 0.18s ease;
  ${themedScrollbar};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const PracticeSettingsHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.55rem;
  margin-bottom: 0.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  strong {
    font-size: ${posType.micro};
    font-weight: ${posWeight.strong};
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
`;

const PracticeSettingsGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.8rem 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  &:empty {
    display: none;
  }

  /* A Settings row is laid out for Settings' width; here it takes the
     sheet's. */
  > * {
    align-self: stretch;
  }
`;

const PracticeSettingsLabel = styled.div`
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PracticeSettingsLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: ${posType.body};
`;

const PracticeSettingsNote = styled.p`
  margin: ${({ foot }) => (foot ? "0.8rem 0 0" : "0")};
  font-size: ${posType.micro};
  line-height: 1.55;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* What the chart draws, in its top-left corner: the bar, the source and
   where the volume is. Quiet, and it takes no pointer — the plot under it
   is the cursor's. */
const PracticeChartLegend = styled.div`
  position: absolute;
  top: 0.1rem;
  left: 0.3rem;
  right: 0.3rem;
  z-index: 1;
  pointer-events: none;
  font-size: ${posType.micro};
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.textSecondary};
  /* **One line, whatever the width** — the parts that matter least leave
     first as the plot narrows (the page drops them from what measureBody
     reads of the plot's width; styled-components 3 drops an @container
     block whole): the hint about pressing the chart, then where the volume
     is. Two lines of it sat over the first candles at 1280. The hint is
     also for a pointer that has one. */
  white-space: nowrap;
  overflow: hidden;

  @media (pointer: coarse) {
    [data-legend-pick] {
      display: none;
    }
  }
`;

const PracticeChartFrame = styled.div`
  position: relative;
  /* Taller than it first was, asked for: it is the one thing on this page
     that is better for having more of it, and the cursor reads it closely.
     No frame of its own: the market card around it is the frame, and a box
     inside a box was a second border 16px from the first.

     **Its height follows the window**, because the page has to end at the
     fold: 20rem on a short screen, a third of a tall one, never more than
     22rem — which is where the axis labels stop gaining anything. */
  height: 20rem;
  background: ${({ theme }) => theme.color.bg};
  font-family: ${({ theme }) => theme.font.primary};
  font-variant-numeric: tabular-nums;

  /* On the terminal it is the rest of its card — which is the rest of the
     chart's cell, whatever the seams have made that (see PracticeCell). */
  @media (min-width: ${PORTFOLIO_WIDE}px) {
    flex: 1;
    height: auto;
    min-height: 9rem;
  }
`;

const PracticeChartEmpty = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${posType.body};
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The plot box. The SVG fills it at a 1000-unit scale with nothing that
 * scales its stroke, and the labels are HTML placed by percentage over the
 * same box — so a label is never stretched and never measured. */
const PracticePlot = styled.div`
  position: absolute;
  top: ${({ plot }) => plot.top}rem;
  bottom: ${({ plot }) => plot.bottom}rem;
  left: ${({ plot }) => plot.left}rem;
  right: ${({ plot }) => plot.right}rem;

  /* On a phone the gutters for the axis and the level tags took 205px of a
     351px card and left the chart 146px wide; narrower gutters give it a
     third more. */
  @media (max-width: 600px) {
    left: 3.2rem;
    right: 6.4rem;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  svg * {
    vector-effect: non-scaling-stroke;
  }

  /* Focused from the keyboard it reads a bar (the page's keyboard cursor),
     and says it has the focus with the hairline every control here uses. */
  outline: none;
  cursor: crosshair;

  &:focus-visible {
    box-shadow: 0 0 0 1px ${({ theme }) => theme.color.borderHover};
    border-radius: 2px;
  }

  .pp-grid {
    stroke: ${({ theme }) => theme.color.border};
    stroke-width: 1;
  }

  .pp-line {
    fill: none;
    stroke: ${({ theme }) => theme.color.text};
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  /* Candles and their volume (27 Sep 2026). Fill-only bodies and a 1px wick
     in the same ink; crispEdges so an edge lands on a pixel instead of
     smearing across two at a fractional x. */
  .pp-candle-up,
  .pp-candle-down {
    shape-rendering: crispEdges;
  }

  .pp-candle-up rect,
  .pp-candle-up line {
    fill: ${({ theme }) => theme.color.chartLineGreen};
    stroke: ${({ theme }) => theme.color.chartLineGreen};
  }

  .pp-candle-down rect,
  .pp-candle-down line {
    fill: ${({ theme }) => theme.color.chartLineRed};
    stroke: ${({ theme }) => theme.color.chartLineRed};
  }

  .pp-candle-up rect,
  .pp-candle-down rect {
    stroke: none;
  }

  .pp-candle-up line,
  .pp-candle-down line {
    stroke-width: 1;
  }

  .pp-vol-up,
  .pp-vol-down {
    shape-rendering: crispEdges;
    opacity: 0.28;
  }

  .pp-vol-up {
    fill: ${({ theme }) => theme.color.chartLineGreen};
  }

  .pp-vol-down {
    fill: ${({ theme }) => theme.color.chartLineRed};
  }

  /* The entry band — faint, because it is a reading of direction and the
     line through it is the thing being read. */
  .pp-band-up {
    fill: ${({ theme }) => theme.color.chartLineGreen};
    opacity: 0.1;
  }

  .pp-band-down {
    fill: ${({ theme }) => theme.color.chartLineRed};
    opacity: 0.1;
  }

  /* The outlook's first horizon at the right edge: where the window's own
     steps land, 5th to 95th and 25th to 75th — a band, never a direction. */
  .pp-cone {
    fill: ${({ theme }) => theme.color.textSecondary};
    opacity: 0.12;
  }

  .pp-cone-inner {
    fill: ${({ theme }) => theme.color.textSecondary};
    opacity: 0.16;
  }

  /* The assistant's hint, in the accent so it reads as "this, here" and
     not as another level of the account's. */
  .pp-focus-band {
    fill: ${({ theme }) => theme.color.accent};
    opacity: 0.14;
  }

  .pp-focus-level {
    stroke: ${({ theme }) => theme.color.accent};
    stroke-width: 1.5;
    stroke-dasharray: 5 3;
    vector-effect: non-scaling-stroke;
  }

  .pp-level {
    stroke-width: 1;
  }

  .pp-entry {
    stroke: ${({ theme }) => theme.color.text};
  }

  .pp-stop {
    stroke: ${({ theme }) => theme.color.chartLineRed};
    stroke-dasharray: 4 3;
  }

  .pp-take {
    stroke: ${({ theme }) => theme.color.chartLineGreen};
    stroke-dasharray: 4 3;
  }

  /* The liquidation carries weight rather than a new colour — the main
     chart's rule: it is not a level you chose, it is where the contract
     stops existing, and it must not be mistaken for the stop. */
  .pp-liq {
    stroke: ${({ theme }) => theme.color.chartLineRed};
    stroke-width: 1.75;
    stroke-dasharray: 8 4;
  }

  .pp-order {
    stroke: ${({ theme }) => theme.color.textSecondary};
    stroke-dasharray: 1 3;
  }

  /* The range's own levels — where it did its business — in the quiet ink
     and behind the account's: the point of control as a broken line, the
     value area's edges as a dotted pair. Without a rule an SVG line has no
     stroke at all, which is how these first shipped as tags with no line. */
  .pp-poc {
    stroke: ${({ theme }) => theme.color.textSecondary};
    stroke-dasharray: 6 3;
    opacity: 0.8;
  }

  .pp-vah,
  .pp-val {
    stroke: ${({ theme }) => theme.color.textSecondary};
    stroke-dasharray: 1 3;
    opacity: 0.7;
  }

  .pp-cursor {
    stroke: ${({ theme }) => theme.color.textSecondary};
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }

  cursor: crosshair;
`;

const PracticeAxisY = styled.span`
  position: absolute;
  right: calc(100% + 0.5rem);
  transform: translateY(-50%);
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
`;

const PracticeAxisX = styled.span`
  position: absolute;
  top: calc(100% + 0.45rem);
  transform: ${({ edge }) =>
    edge === "start" ? "none" : edge === "end" ? "translateX(-100%)" : "translateX(-50%)"};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;

  /* Four stamps do not fit under a phone-wide plot — they ran into each
     other at 430px — so the two in the middle stand down there and the
     ends say the range. */
  @media (max-width: 600px) {
    display: ${({ mid }) => (mid ? "none" : "inline")};
  }
`;

/* A level's name and price, in the right gutter, on the level's own line.
 * The price now is the one filled tag — it is where everything else is
 * measured from. */
const PracticeTag = styled.span`
  position: absolute;
  left: calc(100% + 0.4rem);
  transform: translateY(-50%);
  padding: 0.08rem 0.35rem;
  border-radius: 4px;
  font-size: ${posType.micro};
  font-weight: ${({ kind }) => (kind === "now" ? posWeight.strong : posWeight.label)};
  white-space: nowrap;
  color: ${({ theme, kind }) =>
    kind === "now"
      ? theme.color.bg
      : kind === "stop" || kind === "liq"
        ? theme.color.chartLineRed
        : kind === "take"
          ? theme.color.chartLineGreen
          : kind === "order" || kind === "poc" || kind === "vah" || kind === "val"
            ? theme.color.textSecondary
            : theme.color.text};
  background: ${({ theme, kind }) => (kind === "now" ? theme.color.text : theme.color.bg)};
  /* P4 — a tag that can be dragged says so under the pointer, and keeps a
     touch drag from scrolling the page instead. */
  ${({ drag, theme }) =>
    drag
      ? `
    cursor: ns-resize;
    touch-action: none;
    border: 1px dashed ${theme.color.border};
    &:hover { border-color: ${theme.color.borderHover}; }
  `
      : ""}
`;

const PracticePeriods = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.3rem;
`;

/* The market's readings: the portfolio's stat groups under the portfolio's
 * eyebrow, so the two screens read the same way. */
const PracticeContext = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1.4rem;
`;

/* The counts that were already on this screen — the distance to the nearest
 * liquidation, the assistant, the headlines — under the market's readings,
 * the last things in the reading column. */
const PracticeReadings = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-top: 1.4rem;
  padding-top: 1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

/* The market's readings and its book, side by side in the reading column. */
/* The market's readings, two abreast under the crowd reading: the counts on
 * the left, the distance to liquidation and what followed on the right. One
 * column below the wide breakpoint, where they stack in reading order. */
const PracticeMarketRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 2rem;
  align-items: start;

  ${PracticeContext} {
    margin-top: 0;
  }

  @media (min-width: ${PORTFOLIO_WIDE}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > ${PracticeReadings} {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
  }
`;

/* The book under the desk, framed like the crowd reading: a white card on
 * the page's ground, so it reads as the market's instrument rather than as
 * more of the ticket. */
const PracticeBookCol = styled.section`
  ${practicePanel};
`;

/* The book's own column between the market and the desk on a wide window —
   a venue's middle column, where it is beside the ticket it prices and under
   the chart's eye at the same time. */
const PracticeColBook = styled.section`
  ${practicePanel};
  grid-area: book;
`;

/* **Two by two, not the portfolio's row of columns.** The portfolio lays its
 * groups across a 760px column with a hairline between each; this column
 * shares its width with the book, and at ~31rem the same rule stacked the
 * four groups and kept the hairline and indent on three of them — a ragged
 * left edge with no neighbour to be divided from. Here they sit in a grid,
 * each group a stack, and space does the dividing. */
const PracticeStats = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem 1.4rem;
  padding-top: 0.8rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const PracticeStatGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;

  /* The portfolio's items never wrap, which is right in its wide row and
     wrong in half of this column: "62.1% / 37.9%" ran through the book's
     rule beside it. */
  ${StatItem} {
    white-space: normal;
    flex-wrap: wrap;
  }
`;

/* The cursor's dot, on the line where the series is. HTML rather than an SVG
 * circle: the plot's SVG is stretched to its box, and a circle in it would be
 * an ellipse. */
const PracticeCursorDot = styled.span`
  position: absolute;
  width: 0.5rem;
  height: 0.5rem;
  margin: -0.25rem 0 0 -0.25rem;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.text};
  box-shadow: 0 0 0 2px ${({ theme }) => theme.color.bg};
  pointer-events: none;
`;

/* The point, and what has happened since it: its time and price, the change
 * to the price now, and the range in between. Pointer-transparent so it
 * never steals the hover it is describing. */
const PracticeReadout = styled.div`
  position: absolute;
  top: 0.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.color.bg};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;

  strong {
    font-size: ${posType.body};
    font-weight: ${posWeight.figure};
    color: ${({ theme }) => theme.color.text};
  }
`;

const PracticeReadoutLine = styled.span`
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.textSecondary};
`;

/* The crowd reading's box. The only thing on the page that points a
 * direction, so it is framed — but in the page's own hairline and ground,
 * never in green or red: the lean's colour is on its pill, and the box around
 * it does not shout what the record under it may not support. */
/* A card of its own, or — inside the reading tabs — the block alone, since
   the card around it is already drawn. */
const PracticeCrowd = styled.section`
  ${({ plain }) => (plain ? "" : practicePanel)};
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const PracticeCrowdHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;

  ${PortfolioEyebrow} {
    margin-bottom: 0;
  }
`;

const PracticeLean = styled.span`
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: ${posType.micro};
  font-weight: ${posWeight.strong};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ theme, lean }) =>
    lean === "long"
      ? theme.color.chartLineGreen
      : lean === "short"
        ? theme.color.chartLineRed
        : theme.color.textSecondary};
  border: 1px solid
    ${({ theme, lean }) =>
      lean === "long"
        ? theme.color.chartLineGreen
        : lean === "short"
          ? theme.color.chartLineRed
          : theme.color.border};
`;

/* One reading inside the market-structure block: its own head with the lean
 * pill, then its lines, and a hairline above every one after the first so
 * the three read as rows of one table rather than one run of prose. */
const PracticeStructureItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-top: 0.55rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const PracticeStructureTitle = styled.span`
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  font-weight: ${posWeight.strong};
  color: ${({ theme }) => theme.color.text};
`;

const PracticeCrowdLine = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text};
`;

/* The account's result under its equity: the portfolio's lead tier, then one
 * quiet line that explains the gap between its figures. */
const PracticeResult = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const PracticeResultNote = styled.div`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The head's left half: the equity and, beside it, the result — side by side
 * where there is room, the result under the equity where there is not. */
const PracticeHeadMain = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.8rem 3rem;
`;

/* The ticket's consequences under its grid — the card's own label-over-figure
 * cells, three across, so the ticket and the contract it becomes read alike. */
const AlertPosTicketMore = styled.div`
  display: grid;
  /* One row of five where the desk has the width — a second row put the
     desk's foot 55px past a 900px window. */
  grid-template-columns: repeat(auto-fit, minmax(6.2rem, 1fr));
  gap: 0.55rem 0.8rem;
  padding: 0.2rem 0.1rem 0;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

/* **The portfolio's shell, less its bottom padding.**
 *
 * A sticky element's limit is its scroll container's *padding box*, so the
 * shell's 3rem of bottom padding moved the ticket foot's "bottom: 0" 48px up
 * from the window's edge — measured at 1440×900: the foot pinned at 852 over
 * the stop chips at 775–796, taking their clicks, while the desk itself fitted
 * the window. The air under the page is kept, as a spacer the shell lays out
 * after its content rather than as padding the sticky rule measures from.
 * Derived here rather than changed on `PortfolioShell`, which the portfolio
 * still uses as it is. */
/* **Wider than the portfolio, because it is a trading screen.** At 1440 the
 * portfolio's 1320px left the market ~600px and put a table of prices,
 * the readings and the book side by side in it — every row ran its figures
 * into the next. The page takes what the window has (to 1600px), and the
 * market gets the larger share; the desk keeps a width the ticket's
 * five-figure rows fit in. */
const PracticeInner = styled(PortfolioInner)`
  /* On the head's left edge. 1.25rem rather than the 2.5rem the other
     screens keep: the desk is a trading screen of two columns and tables,
     and at 2.5rem the positions table scrolled sideways at 1280 — the same
     measure the page had before the band, with the band moved to it. */
  box-sizing: border-box;
  padding: 1.25rem 1.25rem 0;

  @media (max-width: 600px) {
    padding: 1rem 1rem 0;
  }

  @media (min-width: ${PORTFOLIO_WIDE}px) {
    && {
      /* **The window's width, all of it** (27 Sep 2026). It stopped at
         1600px, which on a 1920 screen left 300px of black either side of
         a terminal whose book and chart wanted every column of it. */
      max-width: none;
      display: flex;
      flex-direction: column;
      min-height: 0;
      flex: 1;
    }
  }
`;

/* **THE TERMINAL** (27 Sep 2026, *"futures kısmı borsa deneyimi yaşatmıyor,
 * yeniden boyutlandırılabilir itemler lazım"*). From the wide breakpoint up
 * the page is one grid the shape of a venue's screen: the chart, the book
 * and the ticket across the top, the positions panel under the chart and
 * the book, the ticket running the full height on the right. Three seams
 * between them are handles (`PracticeSplit`): the book's width, the
 * ticket's width and the panel's height, each dragged, stepped from the
 * keyboard, double-clicked back and kept (`PRACTICE_LAYOUT_KEY`). The
 * variables are written on this element by the page (`--pp-book`,
 * `--pp-desk`, `--pp-bottom`); absent, each falls back to a width that
 * follows the window.
 *
 * It replaced three layouts — two columns from 1280, three from 1440, one
 * below — with one and the phone's. The 1280–1439 arrangement put the book
 * under the ticket and the positions table in a 575px column; here the
 * table spans the chart and the book, and at 1280 that is 780px. */
const PRACTICE_SPLIT_PX = 10;

const PracticeColumns = styled(PortfolioColumns)`
  @media (max-width: ${PORTFOLIO_WIDE - 1}px) {
    display: flex;
    flex-direction: column;

    [data-practice-markets] { order: 0; }
    [data-practice-market-card] { order: 1; }
    [data-practice-positions] { order: 2; }
    [data-practice-desk] { order: 3; margin-top: 1rem; }
    [data-practice-book-card] { order: 4; }
    [data-practice-readings-card] { order: 5; }
  }

  @media (min-width: ${PORTFOLIO_WIDE}px) {
    && {
      display: grid;
      flex: 1;
      min-height: 0;
      gap: 0;
      align-items: stretch;
      grid-template-columns:
        minmax(0, 1fr)
        ${PRACTICE_SPLIT_PX}px
        var(--pp-book, clamp(15rem, 15vw, 18rem))
        ${PRACTICE_SPLIT_PX}px
        var(--pp-desk, clamp(26rem, 26vw, 31rem));
      /* The panel's 30%, not a third: the book shares this height with
         the chart, and at 1440×900 a 36% panel left it 456px — five
         levels a side under its tabs and filters. (No comment inside the
         value: styled-components 3 dropped the whole declaration.) */
      grid-template-rows:
        minmax(0, 1fr)
        ${PRACTICE_SPLIT_PX}px
        var(--pp-bottom, minmax(11rem, 30%));
      grid-template-areas:
        "chart splitA book splitB desk"
        "splitC splitC splitC splitB desk"
        "bottom bottom bottom splitB desk";
    }
  }
`;

/* One area of the terminal. Below the breakpoint it is not in the layout
   at all (display: contents), so the phone's order rules above reach the
   blocks inside it exactly as they did before it existed. */
const PracticeCell = styled.div`
  display: contents;

  @media (min-width: ${PORTFOLIO_WIDE}px) {
    display: block;
    grid-area: ${({ area }) => area};
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    ${themedScrollbar};

    /* The cells are the frames' distance apart already — the seam between
       them — so a card inside one keeps no margin of its own above it. */
    > section:first-child,
    > div:first-child > section:first-child {
      margin-top: 0;
    }

    /* **The chart takes what its cell has.** The market row keeps its
       height, the card under it grows, and the plot grows inside the card:
       drag the panel below down and the chart gets the pixels. */
    ${({ area }) =>
      area === "chart"
        ? css`
            display: flex;
            flex-direction: column;
            overflow: hidden;

            [data-practice-market-card] {
              flex: 1;
              min-height: 0;
              display: flex;
              flex-direction: column;
            }
          `
        : ""}

    /* The panel's tabs stay on screen while its rows scroll. */
    ${({ area }) =>
      area === "bottom"
        ? css`
            > section {
              margin-top: 0;
              min-height: 100%;
              box-sizing: border-box;
            }
          `
        : ""}
  }
`;

/* **A seam you can take hold of.** A 10px strip of the grid between two
   areas: invisible at rest (the gap is the division), a hairline on hover
   and focus, the text colour while held. The WAI-ARIA window splitter —
   role separator with its value, ←/→ (↑/↓ for the panel), Home and End,
   and a double-click back to the width the window chooses. */
const PracticeSplit = styled.div`
  display: none;

  @media (min-width: ${PORTFOLIO_WIDE}px) {
    display: block;
    position: relative;
    grid-area: ${({ area }) => area};
    cursor: ${({ dir }) => (dir === "row" ? "ns-resize" : "ew-resize")};
    touch-action: none;
    outline: none;
    user-select: none;

    &::after {
      content: "";
      position: absolute;
      ${({ dir }) =>
        dir === "row"
          ? "left: 0; right: 0; top: 50%; height: 2px; transform: translateY(-50%);"
          : "top: 0; bottom: 0; left: 50%; width: 2px; transform: translateX(-50%);"}
      border-radius: 1px;
      background: ${({ theme, dragging }) => (dragging ? theme.color.text : theme.color.borderHover)};
      opacity: ${({ dragging }) => (dragging ? 1 : 0)};
      transition: opacity 0.15s ease;
    }

    &:hover::after,
    &:focus-visible::after {
      opacity: 1;
    }

    &:focus-visible::after {
      background: ${({ theme }) => theme.color.text};
    }
  }
`;

/* The account's head, tighter on the terminal: the equity is a figure
   among the grid's, not a poster over it. Restyled here rather than on
   PortfolioHeader, which the portfolio keeps as it is. */
const PracticeHeader = styled(PortfolioHeader)`
  @media (min-width: ${PORTFOLIO_WIDE}px) {
    margin-bottom: 0.7rem;

    /* One line of account, measured: it was 100px of a 800px window over
       the grid, and every one of them came out of the chart. The equity
       leads at a figure's size, the line under it and the three results
       beside it at the strip's. */
    > div {
      align-items: center;
    }

    [data-practice-equity] {
      font-size: 1.45rem;
    }

    [data-practice-equity] + div {
      margin-top: 0.15rem;
      font-size: 0.72rem;
    }
  }
`;


/* The unit after the account's own number: the figure's size would make
 * "USDT" as loud as the balance, so it sits small and quiet on its baseline. */
const PracticeTotalUnit = styled.span`
  /* The space is in the text, so the figure reads "10,000.00 USDT" to a
     screen reader and a copy; this adds a little to it at the unit's size. */
  margin-left: 0.2ch;
  font-size: 0.38em;
  font-weight: ${posWeight.label};
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PracticeShell = styled(PortfolioShell)`
  padding-bottom: 0;
  /* The band above the page reaches the shell's edges, so the shell keeps
     none of the portfolio's top and side padding (26 Sep 2026). */
  padding-top: 0;
  padding-left: 0;
  padding-right: 0;

  &::after {
    content: "";
    flex: none;
    height: 3rem;
  }

  /* **A window is a screen, not the start of a scroll.** Asked for: nothing
     left below the fold. From the two-column breakpoint up, the page is
     exactly the window: the account's head stays put and each column scrolls
     inside itself — which is what a trading screen does, and what stops the
     ticket (always taller than the readings) from growing a second page.
     Below the breakpoint it is one column and the page scrolls as before. */
  @media (min-width: ${PORTFOLIO_WIDE}px) {
    overflow: hidden;
    padding-bottom: 1rem;

    &::after {
      display: none;
    }
  }
`;

/* The market row above the chart: the tracked coins as chips, each with its
 * price and 24h move, and the way to every other market. */
const PracticeMarkets = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

/* **One line, and it scrolls if the markets outrun it.** Wrapped, the row
   took two lines of a page that has to end at the fold; the markets you keep
   are a strip, the way a venue draws its symbol bar. */
/* The scrolling strip of markets, and the door to the rest beside it. */
const PracticeMarketBar = styled.div`
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
  min-width: 0;

  > button {
    flex: 0 0 auto;
  }

  /* More markets than a phone is wide: the row scrolls sideways rather
     than cutting the fourth chip off, and the scrollbar it grows is thin. */
  @media (max-width: 600px) {
    overflow-x: auto;
    padding-bottom: 0.25rem;
    -webkit-overflow-scrolling: touch;
    ${themedScrollbar};
  }
`;

const PracticeMarketRow2 = styled.div`
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.15rem;
  ${themedScrollbar};

  > * {
    flex: 0 0 auto;
  }
`;

/* **One line per market, not three.** Stacked, four chips and the way into
   the rest took 60px of a page that has to fit a window; on one line they
   are a venue's symbol bar and the row is 30px. */
const PracticeMarketChip = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.3rem 0.55rem;
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 8px;
  background: ${({ theme, active }) => (active ? theme.color.bgSecondary : theme.color.bg)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: left;
  cursor: pointer;
  /* A coin with no perpetual stays in the row — it is one you track — but
     reads as the quiet one, and its title says why. */
  opacity: ${({ quiet }) => (quiet ? 0.5 : 1)};
  transition: border-color 0.15s ease;

  strong {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: ${posType.body};
    font-weight: ${posWeight.figure};
    color: ${({ theme }) => theme.color.text};
  }

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
`;

/* Where this account holds something: a dot, the order book's language for
 * "yours is here". */
const PracticeHeldDot = styled.span`
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.text};
`;

const PracticeMarketAll = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.6rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.color.bg};
`;

/* The account's markets as a table: one column per figure, measured in ch so
 * a column of money lines up down its whole length (the position list's
 * rule). Wrapped in a scroller of its own on a narrow screen rather than
 * squeezed — a table is the one thing allowed to be wider than the page. */
const AlertPosMarketTable = styled.div`
  display: flex;
  flex-direction: column;
  overflow-x: auto;
  ${themedScrollbar};
`;

const AlertPosMarketRow = styled.div`
  display: grid;
  grid-template-columns: 7ch 5ch minmax(10ch, 1fr) minmax(11ch, 1fr) minmax(11ch, 1fr) minmax(10ch, 1fr);
  gap: 0 0.8rem;
  align-items: baseline;
  padding: 0.35rem 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${({ head }) => (head ? posType.micro : posType.body)};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ theme, head }) => (head ? theme.color.textSecondary : theme.color.text)};
  ${({ head }) => (head ? "letter-spacing: 0.08em; text-transform: uppercase;" : "")}

  > :nth-child(n + 2) {
    text-align: right;
  }

  strong {
    font-weight: ${posWeight.figure};
  }
`;

/* The venue's bottom panel, under the chart: every open contract, one row
 * each, the columns in ch so a column of prices reads down its length. A
 * scroller of its own when the column is narrower than the table. */
const PracticePositions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`;

/* **One grid for the whole table, not one per row.** Each row used to size
 * its own columns, so the head's short words ("SIZE") and a row's long
 * figures ("100,050.00") landed on different x — the head read as though it
 * belonged to the row above. The table owns the columns now and every row
 * takes them through `subgrid`, which is what makes a column a column.
 *
 * Contract · size · entry · mark · liq · margin · P/L · close. Prices are
 * bare (the market's quote is named in the head) and money carries its unit;
 * the gaps are a whole character, so no two figures ever touch. */
const PracticePosTable = styled.div`
  display: grid;
  /* **The columns are counted in the rows' own characters.** The ch unit
     resolves against the element that declares the track, so moving the
     template up here from the row measured it in the panel's 16px font
     instead of the row's 11.5px one — every column grew by a fifth and the
     table scrolled sideways inside a column it used to fit. */
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  grid-template-columns: minmax(13ch, 1.4fr) 10ch 10ch 10ch 10ch 10ch minmax(17ch, 1fr) auto;
  gap: 0 1.2ch;
  align-content: start;
  min-width: 94ch;
  overflow-x: auto;
  ${themedScrollbar};

  /* **Between the two-column breakpoint and 1600 the market column is
     ~634px** and the table wanted 672 — its Close buttons were cut off at
     1280. The mark goes: it is the same figure for every row of a market
     and it is printed in the strip right above. */
  @media (min-width: ${PORTFOLIO_WIDE}px) and (max-width: 1599px) {
    grid-template-columns: minmax(13ch, 1.4fr) 10ch 10ch 10ch 10ch minmax(17ch, 1fr) auto;
    min-width: 0;
  }
`;

const PracticePosRow = styled.div`
  /* The table's own columns, so every row lines up with the head. */
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;

  > [role="columnheader"]:nth-child(n + 2):nth-child(-n + 6),
  > [role="cell"]:nth-child(n + 2):nth-child(-n + 6) {
    text-align: right;
  }

  /* The result reads from the left, a clear two characters off the margin
     beside it: both are money, and right-aligned they ran together. */
  > :nth-child(7) {
    padding-left: 2ch;
  }

  /* **Between the two-column breakpoint and 1440 the market column is
     ~634px** and the table wanted 672 — its Close buttons were cut off at
     1280. The mark goes: it is the same figure for every row of a market
     and it is printed in the strip right above. */
  @media (min-width: ${PORTFOLIO_WIDE}px) and (max-width: 1599px) {
    > :nth-child(4) {
      display: none;
    }
  }
  padding: 0.35rem 0 0.35rem 0.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  /* A contract close to its end is tinted, the way its card's head is. */
  background: ${({ theme, band }) =>
    band === "danger"
      ? `${theme.color.chartLineRed}1f`
      : band === "warn"
        ? `${theme.color.chartLineRed}12`
        : "transparent"};

  /* The side as a rule at the row's edge — the order book's colours, read
     before anything else on the row. */
  border-left: 2px solid
    ${({ theme, side, head }) =>
      head ? "transparent" : side === "short" ? theme.color.chartLineRed : theme.color.chartLineGreen};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${({ head }) => (head ? posType.micro : posType.body)};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ theme, head }) => (head ? theme.color.textSecondary : theme.color.text)};
  ${({ head }) => (head ? "letter-spacing: 0.08em; text-transform: uppercase;" : "")}
`;

/* **The contract opened out under its row**, inside the table rather than
   beside it: the page's own list is where a contract is read, so the extra
   the card used to hold — what closing pays, where it stands, and the
   controls — unfolds here. No frame: the row above it is the frame. */
const AlertPosContractDetail = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 0 0.2rem 0.6rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

/* The row's own warning, in the contract's cell: the same words the card's
   band carries, in the colour of how close it is. */
const PracticeRowAlarm = styled.span`
  && {
    font-size: ${posType.micro};
    font-weight: ${posWeight.figure};
    color: ${({ theme, danger }) => (danger ? theme.color.chartLineRed : theme.color.text)};
  }
`;

/* The contract's name is the row's way in: a button, so it is reached by the
 * keyboard and named, rather than a clickable row nobody can tab to. */
const PracticePosOpen = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;

  strong {
    font-weight: ${posWeight.figure};
  }

  span {
    font-size: ${posType.micro};
    color: ${({ theme }) => theme.color.textSecondary};
  }

  &:hover strong {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
  }
  ${touchTarget};
`;

/* P3 — one line above the chart: the market's name, then label-over-figure
 * cells, the venue's header strip. Wraps rather than shrinking a figure. */
const PracticeStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.35rem 1rem;
  margin-bottom: 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-variant-numeric: tabular-nums;

  /* The market's name on a line of its own, the cells in one row under it:
     sharing the line, the six cells wrapped the last one under the rest
     (measured at 1440, open interest alone on a second row). */
  > strong {
    flex: 0 0 100%;
    font-size: ${posType.lead};
    font-weight: ${posWeight.strong};
    color: ${({ theme }) => theme.color.text};
  }
`;

const PracticeStripCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: ${posType.body};
  font-weight: ${posWeight.figure};
  color: ${({ theme }) => theme.color.text};

  > span:first-child {
    font-size: ${posType.micro};
    font-weight: ${posWeight.label};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* Why a dragged level did not move — inside the chart's frame, under the
 * plot, where the eye already is. */
const PracticeDragWhy = styled.div`
  position: absolute;
  left: 0.8rem;
  right: 0.8rem;
  bottom: 0.25rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.chartLineRed};
  background: ${({ theme }) => theme.color.bg};
`;

const PracticePosHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;

  ${PortfolioEyebrow} {
    margin-bottom: 0;
  }
`;

/* P7 — the tape: time, price in the taker's colour, size in money. Aligned in
 * columns like the book above it, so the two read as one instrument. */
const PracticeTape = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-top: 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
`;

/* The tape's sum, above its prints: the delta of what just traded and how
   one-sided it was. Label over figure, like every reading on this page. */
const PracticeTapeSum = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.1rem 0 0.45rem;
  margin-bottom: 0.3rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  > span:first-child {
    font-size: ${posType.micro};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

const PracticeTapeRow = styled.div`
  display: grid;
  grid-template-columns: 9ch 1fr auto;
  gap: 0 0.5rem;
  padding: 0.12rem 0;
  color: ${({ theme }) => theme.color.textSecondary};

  > :nth-child(2),
  > :nth-child(3) {
    text-align: right;
  }
`;

/* P9 — what was written about a closed contract: its tags, then the note, in
 * the record card's own quiet type. */
const AlertPosRecordNote = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-top: 0.35rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  line-height: 1.45;
  color: ${({ theme }) => theme.color.text};
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  strong {
    font-size: ${posType.micro};
    font-weight: ${posWeight.figure};
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* **The account's value, event by event** (26 Sep 2026) — the readings
 * card's own tab. Four figures on one line, each with its label under it,
 * then the line itself. The figures are tabular so they do not twitch as the
 * account moves; the chart takes the card's width and a fixed height, and
 * carries no text inside it — an SVG stretched to its box stretches its
 * letters too — so the one label it needs sits under it in the card's type. */
const PracticeValueFigures = styled.div`
  display: grid;
  /* Two by two at every width: four across broke three-and-one on the
     column's width, which read as a list that had lost an item. */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1.25rem;
  padding: 0.9rem 1.1rem 0.4rem;
`;

const PracticeValueFigure = styled.div`
  min-width: 0;

  strong {
    display: block;
    font-size: 0.95rem;
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
    font-variant-numeric: tabular-nums;
    color: ${({ tone, theme }) =>
      tone === "up" ? theme.color.chartLineGreen : tone === "down" ? theme.color.chartLineRed : theme.color.text};
    white-space: nowrap;
  }

  span {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

const PracticeValueChart = styled.div`
  padding: 0.6rem 1.1rem 0.2rem;

  svg {
    display: block;
    width: 100%;
    height: 6rem;
    overflow: visible;
  }

  .pv-line {
    fill: none;
    stroke: ${({ theme }) => theme.color.text};
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }

  .pv-start {
    stroke: ${({ theme }) => theme.color.border};
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 4 4;
  }

  .pv-deposit {
    stroke: ${({ theme }) => theme.color.textSecondary};
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

`;

/* **The book as a depth curve** (27 Sep 2026): two step lines on one axis
   of distance from the mid, in the colours the ladder already gives the two
   sides, with the table's distances drawn faintly behind them. */
const PracticeDepthChart = styled.div`
  margin-top: 0.4rem;

  svg {
    display: block;
    width: 100%;
    height: 7rem;
    margin: 0.25rem 0;
    overflow: visible;
  }

  .dc-bid,
  .dc-ask {
    fill: none;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }

  .dc-bid {
    stroke: ${({ theme }) => theme.color.chartLineGreen};
  }

  .dc-ask {
    stroke: ${({ theme }) => theme.color.chartLineRed};
  }

  .dc-mark {
    stroke: ${({ theme }) => theme.color.border};
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 2 3;
  }
`;

const PracticeDepthAxis = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};

  .dc-key {
    display: inline-block;
    width: 0.7rem;
    height: 2px;
    margin: 0 0.3rem 0.2em 0.6rem;
    vertical-align: middle;
  }

  .dc-key-bid {
    background: ${({ theme }) => theme.color.chartLineGreen};
  }

  .dc-key-ask {
    background: ${({ theme }) => theme.color.chartLineRed};
  }
`;

const PracticeDepthTable = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.2rem 0.9rem;
  margin: 0.5rem 0 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.text};

  .h {
    color: ${({ theme }) => theme.color.textSecondary};
  }

  .num {
    text-align: right;
  }
`;

const PracticeValueNote = styled.p`
  margin: 0;
  padding: 0.35rem 1.1rem 0.9rem;
  font-size: 0.64rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* **The screen's head** (26 Sep 2026, *"futures'a da yeni ekran dili"*):
 * the band Settings, the news and the base rates open with — the same
 * padding, rule and left edge, the name in the same small capitals — with
 * what kind of account this is beside the name, where it used to be an
 * eyebrow over the balance. */
const PracticeScreenHead = styled.div`
  align-self: stretch;
  flex: none;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  /* The page's own left edge (see PracticeInner), not the other screens'. */
  padding: 1.8rem 1.25rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  h2 {
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
  }

  span {
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }

  @media (max-width: 600px) {
    padding: 1rem;
  }
`;
