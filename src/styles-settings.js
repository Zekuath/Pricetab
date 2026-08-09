const panelLift = keyframes`
  from { transform: translateY(24px) scale(0.95); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
`;

const SettingsCard = styled.div`
  width: min(92vw, 32rem);
  height: min(92vh, 40rem);
  display: flex;
  flex-direction: column;
  border-radius: ${({ theme }) => theme.scale * 8}rem;
  padding: ${({ theme }) => theme.spacing.large * 1.5}rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.98)"
      : "rgba(5, 5, 5, 0.92)"};
  border: 1px solid ${({ theme }) => theme.color.border};
  box-shadow: 0 25px 60px ${({ theme }) => theme.color.shadow};
  text-align: center;
  animation: ${panelLift} 0.4s ease;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  overflow: hidden;
  position: relative;
`;

const SettingsClose = styled.button.attrs(() => ({ type: "button" }))`
  position: absolute;
  top: ${({ theme }) => theme.spacing.medium}rem;
  right: ${({ theme }) => theme.spacing.medium}rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.color.bgSecondary};
    color: ${({ theme }) => theme.color.text};
  }
`;

const SettingsGroupTitle = styled.h4`
  width: 100%;
  max-width: 22rem;
  margin: ${({ theme }) => theme.spacing.medium}rem auto
    ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  color: ${({ theme }) => theme.color.textSecondary};
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;

  &:first-child {
    margin-top: 0;
  }
`;

const GroupChevron = styled.span`
  font-size: 0.6rem;
  opacity: 0.7;
  transition: transform 0.25s ease;
  transform: rotate(${({ open }) => (open ? "0deg" : "-90deg")});
`;

const GroupReveal = styled.div`
  overflow: hidden;
  max-height: ${({ open }) => (open ? "60rem" : "0")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  transition: max-height 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.28s ease;
`;

const SettingsTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 1.25rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const RatePromptBar = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 4}rem;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: left;
`;

const RatePromptText = styled.span`
  flex: 1;
`;

const RatePromptLink = styled.a`
  flex: 0 0 auto;
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-decoration: underline;
  cursor: pointer;
`;

const RatePromptClose = styled.button.attrs(() => ({ type: "button" }))`
  flex: 0 0 auto;
  background: transparent;
  border: none;
  padding: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 1rem;
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }

  &:focus {
    outline: none;
  }
`;

const TabContainer = styled.div`
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  padding-bottom: ${({ theme }) => theme.spacing.small}rem;
`;

const TabButton = styled.button.attrs(() => ({ type: "button" }))`
  background: transparent;
  border: none;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.875rem;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.medium : theme.fontWeight.normal};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${({ active, theme }) =>
    active ? theme.color.text : theme.color.textSecondary};
  cursor: pointer;
  transition: all 0.2s ease;
  border-bottom: 2px solid
    ${({ active, theme }) => (active ? theme.color.text : "transparent")};
  margin-bottom: -${({ theme }) => theme.spacing.small}rem;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }

  &:focus {
    outline: none;
  }
`;

const tabFadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const TabContent = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  /* Keep the scrollbar out by the card edge and reserve its lane so
     content never shifts when it appears */
  scrollbar-gutter: stable;
  margin-right: -${({ theme }) => theme.spacing.large}rem;
  padding-right: ${({ theme }) => theme.spacing.large}rem;
  animation: ${tabFadeIn} 0.25s ease-out;

  /* Custom scrollbar - Firefox */
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.color.border} transparent;

  /* Custom scrollbar - Webkit (Chrome, Edge, Safari) */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    margin: ${({ theme }) => theme.scale * 4}rem 0;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.color.border};
    border-radius: 3px;
    transition: background 0.2s ease;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.color.borderHover};
  }
`;

/* A setting that only applies while another one is on. Kept mounted so it
 * eases open instead of appearing from nowhere; `maxHeight` covers the cases
 * taller than a single row, since an unset max-height can't be transitioned. */
const SettingReveal = styled.div`
  overflow: hidden;
  max-height: ${({ open, maxHeight }) => (open ? maxHeight || "8rem" : "0")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  transform: translateY(${({ open }) => (open ? "0" : "-6px")});
  transition: max-height 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.28s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
`;

const CoinList = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  position: relative;
`;

const CoinChip = styled.button.attrs(() => ({ type: "button" }))`
  border-radius: 999px;
  border: 1px solid
    ${({ selected, theme }) =>
      selected ? theme.color.text : theme.color.border};
  padding: ${({ selected }) =>
    selected ? "0.45rem 1.8rem 0.45rem 0.85rem" : "0.35rem 0.75rem"};
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  background: ${({ selected, theme }) =>
    selected ? theme.color.text : "transparent"};
  color: ${({ selected, theme }) =>
    selected ? theme.color.bg : theme.color.text};
  text-transform: uppercase;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease,
    opacity 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
  min-width: 3.5rem;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: ${({ selected, theme }) =>
      selected ? theme.color.text : theme.color.borderHover};
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
    transform: none;
  }

  &[draggable="true"] {
    cursor: grab;
  }

  &[draggable="true"]:active {
    cursor: grabbing;
  }
`;

const CoinChipRemove = styled.span`
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 300;
  opacity: 0.5;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  border-radius: 50%;

  &:hover {
    opacity: 1;
    transform: translateY(-50%) scale(1.2);
  }
`;

const CoinSectionTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.875rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

const SettingsDescription = styled.p`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  max-width: 22rem;
  font-size: 0.875rem;
  opacity: 0.8;
  line-height: 1.5;
`;

const CoinDragHint = styled.p`
  font-size: 0.65rem;
  opacity: 0.4;
  margin: 0.2rem 0 0.75rem;
  letter-spacing: 0.04em;
`;

const CoinSectionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
`;

const CoinCounter = styled.span`
  font-size: 0.65rem;
  opacity: 0.4;
  letter-spacing: 0.05em;
`;

const ResetRow = styled.div`
  margin-top: ${({ compact, theme }) =>
    compact ? theme.spacing.small : theme.spacing.large}rem;
  padding-top: ${({ compact, theme }) =>
    compact ? theme.spacing.xsmall : theme.spacing.medium}rem;
  border-top: 1px solid ${({ theme }) => theme.color.border}22;
  transition: margin-top 0.45s cubic-bezier(0.33, 1, 0.68, 1),
    padding-top 0.45s cubic-bezier(0.33, 1, 0.68, 1);
`;

const ResetButton = styled.button.attrs(() => ({ type: "button" }))`
  background: none;
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.text};
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: 0.4rem 1.25rem;
  font-size: 0.7rem;
  font-family: inherit;
  letter-spacing: 0.06em;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
`;

const SuggestionHint = styled.p`
  margin: ${({ theme }) => theme.spacing.xsmall}rem 0 0;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  opacity: 0.7;
`;

const CoinChipName = styled.span`
  margin-left: 0.4em;
  font-size: 0.75em;
  opacity: 0.6;
  text-transform: none;
  letter-spacing: 0.02em;
`;

const SettingsForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.small}rem;
  width: 100%;
  position: relative;
`;

const SettingsInput = styled.input`
  padding: 0.75rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  text-transform: uppercase;
  letter-spacing: 0.15em;
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* Suggestion area between the search bar and the Add coin button.
   grid-template-rows 0fr→1fr animates to the REAL content height in one
   uninterrupted motion (no max-height guessing). */
const SuggestionsArea = styled.div`
  display: grid;
  grid-template-rows: ${({ open }) => (open ? "1fr" : "0fr")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  transition: grid-template-rows 0.45s cubic-bezier(0.33, 1, 0.68, 1),
    opacity 0.45s cubic-bezier(0.33, 1, 0.68, 1);
`;

const SuggestionsAreaInner = styled.div`
  min-height: 0;
  overflow: hidden;
`;

const SuggestionList = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  padding: 0.25rem 0;
`;

const SettingsActionButton = styled.button`
  padding: 0.75rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: none;
  cursor: pointer;
  background: ${({ theme }) => theme.color.text};
  color: ${({ theme }) => theme.color.bg};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px ${({ theme }) => theme.color.shadow};
  }

  &:active {
    transform: scale(0.98);
  }
`;

const SettingsFeedback = styled.p`
  margin: ${({ theme }) => theme.spacing.small}rem 0 0;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  color: ${({ error, theme }) =>
    theme.color.bg === "#ffffff"
      ? error
        ? "#c62828"
        : "#1e7e46"
      : error
        ? "#ff8a8a"
        : "#8affc1"};
`;

const ThemeSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const ThemeSectionTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const ThemeButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xsmall}rem;
  justify-content: center;
`;

const ThemeButton = styled.button.attrs(() => ({ type: "button" }))`
  flex: 1;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid
    ${({ active, theme }) => (active ? theme.color.text : theme.color.border)};
  background: ${({ active, theme }) =>
    active ? theme.color.text : "transparent"};
  color: ${({ active, theme }) => (active ? theme.color.bg : theme.color.text)};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 4rem;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderHover};
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const ThemeDescription = styled.p`
  margin: ${({ theme }) => theme.spacing.small}rem 0 0;
  font-size: 0.7rem;
  opacity: 0.6;
  text-align: center;
  line-height: 1.4;
`;

// Toggle Switch Components
const ToggleSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const ToggleSectionTitle = styled.div`
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
  margin-bottom: 0.25rem;
`;

const ToggleSectionDesc = styled.div`
  font-size: 0.65rem;
  opacity: 0.5;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  padding: 0.4rem 0;

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.color.border}22;
  }
`;

const ToggleLabel = styled.label`
  font-size: 0.7rem;
  opacity: 0.6;
`;

const WidgetGroupTitle = styled.h4`
  margin: ${({ theme }) => theme.spacing.medium}rem 0
    ${({ theme }) => theme.spacing.xsmall}rem;
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const ToggleTextCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 2px;
`;

const ToggleDesc = styled.span`
  font-size: 0.62rem;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PresetRow = styled.div`
  display: flex;
  gap: 6px;
  margin: 4px 0 10px;
  flex-wrap: wrap;
`;

const PresetButton = styled.button`
  flex: 1 1 auto;
  min-width: 64px;
  padding: 6px 8px;
  border: 1px solid
    ${({ active, theme }) =>
      active ? theme.color.text : theme.color.border};
  border-radius: 7px;
  background: ${({ active, theme }) =>
    active ? theme.color.bgSecondary : "transparent"};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.medium : theme.fontWeight.normal};
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
    background: ${({ theme }) => theme.color.bgSecondary};
  }
`;

const ToggleSwitch = styled.button`
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  background-color: ${({ active, theme }) =>
    active ? theme.color.text : theme.color.border};
  transition: background-color 0.2s ease;
  flex-shrink: 0;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.text}40;
  }

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ active }) => (active ? "22px" : "2px")};
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: ${({ active, theme }) =>
      active ? theme.color.bg : theme.color.text};
    transition: left 0.2s ease;
  }
`;

const RefreshIntervalSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const RefreshIntervalLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const RefreshIntervalSelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;

const NumberFormatSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const NumberFormatLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const NumberFormatSelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;

const CurrencySection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const CurrencyLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const CurrencySelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;


/* Settings search — sits above the groups in Preferences */
const SettingsSearch = styled.input`
  width: 100%;
  box-sizing: border-box;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 4}rem;
  transition: border-color 0.15s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const SettingsNoMatch = styled.div`
  padding: ${({ theme }) => theme.spacing.medium}rem 0;
  font-size: 0.8125rem;
  text-align: center;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Quiet pointer to the shortcut list, at the foot of Preferences
const ShortcutsHint = styled.button.attrs(() => ({ type: "button" }))`
  display: block;
  width: 100%;
  margin-top: ${({ theme }) => theme.spacing.medium}rem;
  padding: ${({ theme }) => theme.spacing.small}rem 0;
  background: transparent;
  border: none;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;
