/* THE TAX GUIDE — every country's crypto tax rules, what is and is not taxed
 * there, and an estimate from the portfolio's records wherever the rule is
 * specific enough to compute (28 Sep 2026).
 *
 * Asked for as *"tax muhabbetini sadece dört ülkeye vermeyelim, tax
 * kuralları da yazsın, olabildiğince yardımcı olalım, bütün dünya ülkeleri
 * hakkında bir araştırma yap. Ve buna göre ne ne değildir detaylı bir
 * yardımcı hazırla"*. The data is `tax-world.js`, the arithmetic
 * `tax-report.js`; this is the screen. It keeps the helper's three promises
 * on every country: the rules with their sources and the day they were read,
 * the person's own rate, and what it could not use — and one more, asked
 * for as *"ciddi devlet kuruluşları olmalı"*: **every rule on a card was read
 * in the country's own official sources** (its tax authority, law, gazette,
 * parliament, ministry or central bank). Where none was confirmed, the card
 * states nothing and points to the tax authority.
 *
 * Country names come from the browser (`Intl.DisplayNames`), in the language
 * on screen, so none of the 244 is translated here.
 *
 * Attached to `Portfolio` as `Object.assign(this, taxGuide(this))`. */

// The events every card rules on, in the order a person meets them
const TAX_EVENTS = ["buy", "hold", "transfer", "sell", "swap", "spend", "staking", "mining", "airdrop"];
// Statuses grouped for the picker's filter
const TAX_FILTERS = {
  taxed: ["gains", "income", "turnover", "wealth"],
  free: ["exempt", "no-pit"],
  norule: ["unclear", "pending", "parent"],
  banned: ["banned"],
  unverified: ["unverified"],
};
// The display currencies an estimate can be made in: the ones the app shows
const taxCanReportIn = (cur) => CURRENCY_OPTIONS.some((o) => o.value === cur);

/* ── names ─────────────────────────────────────────────────────────────── */

let _taxNames = null;
const taxCountryLabel = (code) => {
  const tag = intlTag(activeLocale());
  if (!_taxNames || _taxNames.tag !== tag) {
    const make = () => {
      try {
        return new Intl.DisplayNames([tag, "en"], { type: "region" });
      } catch (e) {
        return null;
      }
    };
    _taxNames = { tag, dn: make(), cache: new Map() };
  }
  const c = String(code || "").toUpperCase();
  if (!_taxNames.cache.has(c)) {
    const read = () => {
      try {
        return (_taxNames.dn && _taxNames.dn.of(c)) || c;
      } catch (e) {
        return c;
      }
    };
    _taxNames.cache.set(c, read());
  }
  return _taxNames.cache.get(c);
};

/* The country a person most likely files in: the region of the browser's
   language where it names one, else the currency on screen — only a first
   guess, and the choice is kept once made. */
const TAX_CURRENCY_COUNTRY = {
  TRY: "tr", USD: "us", GBP: "gb", EUR: "de", JPY: "jp", AUD: "au", CAD: "ca", CHF: "ch", INR: "in", BRL: "br",
  MXN: "mx", ARS: "ar", CLP: "cl", COP: "co", PEN: "pe", ZAR: "za", KRW: "kr", CNY: "cn", HKD: "hk", SGD: "sg",
  MYR: "my", THB: "th", IDR: "id", PHP: "ph", VND: "vn", NZD: "nz", SEK: "se", NOK: "no", DKK: "dk", PLN: "pl",
  CZK: "cz", HUF: "hu", RON: "ro", RUB: "ru", ILS: "il", AED: "ae", SAR: "sa",
};
const taxGuessCountry = (currency) => {
  const langs = typeof navigator !== "undefined" && Array.isArray(navigator.languages) ? navigator.languages : [];
  for (const l of langs) {
    const m = /^[a-z]{2,3}-([A-Z]{2})\b/.exec(l || "");
    if (m && TAX_WORLD_CODES.includes(m[1].toLowerCase())) return m[1].toLowerCase();
  }
  return TAX_CURRENCY_COUNTRY[currency] || "us";
};

/* ── words ─────────────────────────────────────────────────────────────── */

const taxStatusLabel = (s) =>
  s === "gains"
    ? msg("tax_s_gains", "Taxed as capital gains")
    : s === "income"
      ? msg("tax_s_income", "Taxed as income at your rate")
      : s === "turnover"
        ? msg("tax_s_turnover", "A tax on each sale's value")
        : s === "wealth"
          ? msg("tax_s_wealth", "Holdings taxed, not gains")
          : s === "exempt"
            ? msg("tax_s_exempt", "Not taxed for private investors")
            : s === "no-pit"
              ? msg("tax_s_no_pit", "No personal income tax")
              : s === "pending"
                ? msg("tax_s_pending", "Not taxed yet — rules on the way")
                : s === "banned"
                  ? msg("tax_s_banned", "Crypto is prohibited")
                  : s === "parent"
                    ? msg("tax_s_parent", "Follows another country's rules")
                    : s === "unverified"
                      ? msg("tax_s_unverified", "Not confirmed from an official source")
                      : msg("tax_s_unclear", "No crypto-specific rule found");

/* Only two levels: a rule is on a card because an official source says it,
   or the card says nothing. */
const taxLevelLabel = (l) =>
  l === "official"
    ? msg("tax_l_official", "From official sources — the tax authority, the law or the government")
    : msg("tax_l_unverified", "No official source confirmed");

const taxEventLabel = (ev) =>
  ev === "buy"
    ? msg("tax_e_buy", "Buying with money")
    : ev === "hold"
      ? msg("tax_e_hold", "Holding")
      : ev === "transfer"
        ? msg("tax_e_transfer", "Moving between your own wallets")
        : ev === "sell"
          ? msg("tax_e_sell", "Selling for money")
          : ev === "swap"
            ? msg("tax_e_swap", "Swapping one coin for another")
            : ev === "spend"
              ? msg("tax_e_spend", "Paying for something with crypto")
              : ev === "staking"
                ? msg("tax_e_staking", "Staking rewards")
                : ev === "mining"
                  ? msg("tax_e_mining", "Mining")
                  : msg("tax_e_airdrop", "Airdrops");

const taxVerdictLabel = (v) =>
  v === "T"
    ? msg("tax_v_taxed", "Taxed")
    : v === "N"
      ? msg("tax_v_free", "Not taxed")
      : v === "I"
        ? msg("tax_v_income", "Income when received")
        : v === "S"
          ? msg("tax_v_on_sale", "Taxed only when sold")
          : v === "B"
            ? msg("tax_v_banned", "Prohibited")
            : v === "W"
              ? msg("tax_v_wealth", "Taxed as wealth")
              : v === "V"
                ? msg("tax_v_value", "Taxed on the sale's value")
                : v === "P"
                  ? msg("tax_v_pending", "Not taxed yet")
                  : msg("tax_v_unknown", "No source says");

/* One event's verdict in one country. Buying with money, holding and moving
   between one's own wallets are not taxed in any country an official source
   covers — except that a wealth tax taxes holding, and a ban prohibits all
   of it. Where no official source covers the country, even that is not
   claimed. */
const taxVerdict = (e, ev) => {
  if (e.s === "banned") return "B";
  const covered = e.l === "official";
  if (ev === "buy" || ev === "transfer") return covered ? "N" : "?";
  if (ev === "hold") return (e.x && e.x.hold) || (e.s === "wealth" ? "W" : covered ? "N" : "?");
  if (ev === "sell") {
    if (e.s === "gains" || e.s === "income") return "T";
    if (e.s === "turnover") return "V";
    if (e.s === "exempt" || e.s === "no-pit" || e.s === "wealth") return "N";
    if (e.s === "pending") return "P";
    return "?";
  }
  return (e.x && e.x[ev]) || "?";
};

/* Each country's own sentences: what the structured rules below cannot say
   by themselves — every one of them read in the country's official sources
   (tax-world.js lists them). */
const taxNoteText = (key) => {
  switch (key) {
    case "tr": return msg("tax_rule_tr_2026", "No crypto-specific rule is in force. A March 2026 bill (TBMM 2/3560) proposed taxing crypto gains and a 0.03% transaction tax; the law passed from it (No. 7577, Official Gazette 17 April 2026) left those articles out. Under the general law, regular trading can be commercial income. This lists your gains in TRY by calendar year, first in, first out, and estimates nothing until you enter a rate an adviser gave you.");
    case "us": return msg("tax_rule_us", "Held more than a year is long-term, taxed at 0, 15 or 20% by your income; a year or less is short-term, taxed as ordinary income. Each sale is matched with the purchases it was recorded against (FIFO, LIFO or HIFO). Staking and rewards are income at their value when received. The tax year is the calendar year.");
    case "gb": return msg("tax_rule_uk", "Each sale is matched with a purchase the same day, then with one in the next 30 days, then with the Section 104 pool at its average cost. The first £3,000 of gains a year are tax-free; the rest at 18% or 24% by your income. Staking is income when received. The tax year runs from 6 April to 5 April.");
    case "de": return msg("tax_rule_de", "Held more than a year: tax-free. Within a year: taxed at your personal rate, unless the year's gains from private sales total under €1,000 — a threshold, not an allowance: at €1,000 all of it counts. Matched first in, first out. Staking income is free under €256 a year. The tax year is the calendar year.");
    case "fr": return msg("tax_n_fr", "Occasional disposals only (art. 150 VH bis); regular trading is taxed as business profit. Swaps between crypto-assets are deferred, not taxed. You may choose the progressive scale instead of the flat rate. Losses offset only the same year's gains. Forms 2086 and 3916-bis.");
    case "fr_formula": return msg("tax_n_fr_formula", "France computes each gain with a formula that needs your whole portfolio's value at every sale. This estimate uses average cost instead — treat it as a first approximation.");
    case "es": return msg("tax_n_es", "Swapping one crypto for another is a taxable exchange (permuta), valued at the higher of the two market values. Losses offset gains in the savings base and carry forward four years. Holdings abroad above €50,000 go on Modelo 721.");
    case "it": return msg("tax_n_it_2026", "From 2026 the rate is 33%, and 26% for euro e-money tokens; the €2,000 exemption no longer applies. A swap between crypto-assets with the same features is not taxed; staking proceeds are taxed in full when received. Where an intermediary computes the gain it uses the weighted average cost, and so does this estimate.");
    case "method_unstated": return msg("tax_n_method_unstated", "The sources read do not fix a matching method for this country; the estimate uses first in, first out.");
    case "nl": return msg("tax_n_nl_box3", "Gains are not taxed: crypto belongs in Box 3, which taxes a deemed return of 6% on what you hold on 1 January above €59,357 a person (2026), at 36%. The estimate uses today's value as a stand-in for 1 January.");
    case "be": return msg("tax_n_be_law", "New from 1 January 2026 (law of 6 April 2026): 10% on gains above €10,000 a year, and a holding bought before 2026 counts at its value on 31 December 2025 — the estimate cannot know that value.");
    case "pt": return msg("tax_n_pt_at", "Held 365 days or more: excluded from tax, but declared (Annex G1). Crypto received for crypto — a swap, or income paid in crypto such as staking — is not taxed until you dispose of it for money or goods. Sales use the oldest coins first, per exchange. Losses carry forward five years if you opt to aggregate.");
    case "at": return msg("tax_n_at_bmf", "Crypto bought after 28 February 2021 is taxed at 27.5%, on a moving average cost per wallet. A swap is not a disposal; paying with crypto is. Staking and airdrops are not taxed when received — their cost is zero, so the sale is taxed in full.");
    case "ie": return msg("tax_n_ie", "Gains from January to November are paid by 15 December; December's by 31 January.");
    case "pl": return msg("tax_n_pl", "Income is the year's proceeds less the year's spending on crypto (PIT-38); spending above the proceeds carries to the next year. Swapping crypto for crypto is not a disposal.");
    case "se": return msg("tax_n_se", "Every disposal counts, including swaps and payments, on the average-cost method (form K4, section D). Losses are deductible at 70%.");
    case "dk": return msg("tax_n_dk_skat", "Gains are personal income, taxed at up to about 53%; losses are deductible at a value of about 26%. First in, first out, across all your exchanges, and swapping one crypto for another is a sale. In 2024 the Tax Law Council recommended taxing crypto on its yearly change in value instead.");
    case "fi": return msg("tax_n_fi", "Every disposal counts, including swaps. Instead of the real cost you may use a deemed cost of 20% of the price (40% if held ten years). Losses carry forward five years.");
    case "no": return msg("tax_n_no", "Gains are ordinary income at 22% and losses are deductible; holdings on 1 January are also in the wealth tax base at full value.");
    case "cz": return msg("tax_n_cz_fs", "Other income (§10). Exempt: a year's sales totalling up to CZK 100,000, and crypto held more than three years — within a CZK 40 million cap. Otherwise taxed at your income tax rate; enter it below.");
    case "ch": return msg("tax_n_ch", "Private investors' capital gains are tax-free, but holdings are in the cantonal wealth tax at year-end values. Staking and mining are taxable income, and a professional trader is taxed on gains.");
    case "ro": return msg("tax_n_ro_anaf", "Income from other sources: 10% of the gain. A gain under 200 lei in one transaction is not taxed while the year's total stays within 600 lei; exchanging crypto for goods, services or other crypto counts as a transfer. The health contribution (CASS) can apply.");
    case "hu": return msg("tax_n_hu", "Income is the year's proceeds less its documented costs, at 15% with no social contribution tax. Only exchange into money or goods counts — swaps do not. A loss carries forward two years.");
    case "sk": return msg("tax_n_sk_fs", "Other income, taxed at your income tax rate; health insurance contributions due on it are deductible. Exchanging crypto for other crypto, goods or services is taxed like a sale, and where expenses exceed income the difference is disregarded.");
    case "si": return msg("tax_n_si_furs", "An individual's gains from selling crypto outside a business are not taxed; mining and free tokens are income. A law to tax gains from disposing of crypto-assets is in preparation and has not been adopted.");
    case "hr": return msg("tax_n_hr", "Swaps are not taxed.");
    case "lu": return msg("tax_n_lu_acd", "Selling, swapping or paying with crypto held six months or less is a speculative gain at your income tax rate — untaxed while the year's speculative gains stay under €500. Held longer, the gain is not taxed. Where coins cannot be told apart the tax authority requires the weighted average cost; this estimate matches the oldest first so that it can count the six months.");
    case "mt": return msg("tax_n_mt", "Gains on crypto coins and utility tokens are not taxed for private investors; trading as a business is income.");
    case "cy": return msg("tax_n_cy", "8% from 2026 (Article 20E); losses offset only the same year's crypto gains, and mined crypto is outside this rate.");
    case "ee": return msg("tax_n_ee_emta", "Each sale or swap is taxed on its own gain. A loss counts only on crypto acquired through a MiCA-authorised provider; otherwise it cannot be declared. Mining is business income. Enter your income tax rate below.");
    case "lt": return msg("tax_n_lt_vmi", "As the tax authority's guidance of September 2022 reads: crypto is other property, a swap is income, and a year's gains up to €2,500 are not taxed; above it, 15% (20% on larger incomes).");
    case "lv": return msg("tax_n_lv_vid", "25.5% from 2025. Swapping one crypto for another defers the tax until you convert to money, and losses on crypto offset only crypto gains. First in, first out or the weighted average — the method you pick is kept.");
    case "bg": return msg("tax_n_bg_nra", "Taxable income is the year's gains less its losses, reduced by 10% for expenses, declared in Annex 5. Mining is business income. Enter your rate below.");
    case "rs": return msg("tax_n_rs_2020", "Digital assets are taxed as capital gains, declared within 120 days of the quarter's end. Half the tax is forgiven if the proceeds go into a Serbian company's or fund's capital within 90 days.");
    case "ad": return msg("tax_n_ad_cv", "A private individual's gain on digital currency is a capital gain, counted when it is transferred or converted. The €3,000 is the savings allowance, shared with interest and dividends.");
    case "li": return msg("tax_n_li_steg", "No crypto rule: the Tax Act exempts gains on movable private assets and instead taxes a standard 4% return on your net wealth as income.");
    case "by": return msg("tax_n_by_mns", "The income tax exemption for token operations ended on 1 January 2025, except for operations through High-Tech Park operators. The official pages read do not state the rate.");
    case "uz": return msg("tax_n_uz_pp", "Until 1 January 2029, operations with crypto-assets are not taxed, and income from them is left out of the tax base.");
    case "is": return msg("tax_n_is_rsk", "A gain on selling or swapping crypto is capital income at 22%. A loss offsets only gains on the same type of crypto in the same year. Mining is business income.");
    case "ua": return msg("tax_n_ua_rada", "Bill 10225-d, which would tax crypto profits the way securities are taxed and allow a one-off 10% on sales in a one-year transition, passed its first reading on 3 September 2025. It is not yet law.");
    case "ru": return msg("tax_n_ru_fns", "Digital currency is property (Federal Law 418-FZ). Gains on selling it: 13%, and 15% on the part above RUB 2.4 million; mining income is taxed at 13–22%.");
    case "ge": return msg("tax_n_ge_mof", "A 2019 Ministry of Finance decision treats an individual's income from supplying crypto as not sourced in Georgia, so it is not taxed.");
    case "kz": return msg("tax_n_kz_kgd", "Selling crypto is property income: the gain over its cost, taxed at 10% and declared on form 270.00.");
    case "ca": return msg("tax_n_ca", "A business of trading makes all of the gain income. The adjusted cost base is the average cost per coin, and the superficial-loss rule denies a loss if you buy back within 30 days.");
    case "br": return msg("tax_n_br_rfb", "Crypto held or traded through Brazilian institutions: a month whose sales total R$ 35,000 or less is exempt; above it the gain is taxed and paid by DARF by the last business day of the next month. Swaps are taxable. Crypto held through institutions abroad is taxed yearly, with no exemption.");
    case "ar": return msg("tax_n_ar", "5% for sales in pesos without indexation, 15% in foreign currency or from foreign sources. Holdings on 31 December are also in the personal assets tax.");
    case "cl": return msg("tax_n_cl", "Gains are income in the global complementary tax at progressive rates; habitual trading is business income.");
    case "co": return msg("tax_n_co", "Held two years or more: an occasional gain at 15%. Held less: ordinary income at progressive rates up to 39%.");
    case "sv": return msg("tax_n_sv_199", "Since the 2025 reform bitcoin remains legal tender, accepted voluntarily, and exchanges in bitcoin are not subject to capital gains tax. Other crypto is not covered.");
    case "pr": return msg("tax_n_pr_act60", "No crypto-specific rule was found. A resident investor under Act 60 has a 100% exemption on capital gains until 2035; for decrees requested from 2027 the rate is 4%.");
    case "au": return msg("tax_n_au", "A crypto-to-crypto swap is a CGT event. Crypto kept mainly to buy personal items, costing AUD 10,000 or less, can be a personal-use asset whose gain is disregarded.");
    case "nz": return msg("tax_n_nz_ird", "If you acquired crypto to sell or exchange it, the profit is taxable income at your rate. Selling, swapping, paying with or giving away crypto are disposals; moving it between your own wallets is not.");
    case "jp": return msg("tax_n_jp_2026", "Miscellaneous income added to your other income (national up to 45% plus 10% local), and a loss cannot offset other income. The default cost method is the total-average method; this estimate uses a moving average. The 2026 tax reform outline plans a separate 20% (15% national, 5% local) for crypto sold through registered businesses, from the year after the securities law change takes effect.");
    case "kr": return msg("tax_n_kr_nts", "From 1 January 2027: gains above KRW 2.5 million a year taxed at 20%, on the total-average cost, with holdings bought earlier costed at the higher of what was paid and their value on 31 December 2026. Filed in May of the next year.");
    case "in": return msg("tax_n_in_115bbh", "30% of each gain, with no deduction but the cost and no set-off of any loss — not even against other crypto gains. 1% is withheld on transfers (section 194S).");
    case "sg": return msg("tax_n_sg", "No capital gains tax; only someone trading as a business is taxed on the profit.");
    case "hk": return msg("tax_n_hk", "No capital gains tax; profits are taxable only when the trading is a business (the badges of trade in DIPN 39).");
    case "tw": return msg("tax_n_tw", "No crypto statute: gains are property-transaction income at progressive rates; profits on foreign exchanges are overseas income under the Income Basic Tax (below TWD 1 million disregarded).");
    case "th": return msg("tax_n_th_399", "Gains on crypto sold on a Thai-licensed exchange, through a licensed broker or to a licensed dealer are exempt for income received from 1 January 2025 to 31 December 2029. Elsewhere, a gain over cost is assessable income.");
    case "id": return msg("tax_n_id", "Since 1 August 2025 the seller pays a final 0.21% of each sale's value on a licensed Indonesian platform, 1% on a foreign one, gain or loss. Buying carries no tax.");
    case "vn": return msg("tax_n_vn_32", "From 2026, individuals pay 0.1% of each transfer's price when trading through a licensed crypto-asset service provider (Circular 32/2026). Transfers are outside VAT.");
    case "pk": return msg("tax_n_pk_pvara", "No crypto tax rule was found in official sources. Crypto businesses are licensed by the Pakistan Virtual Assets Regulatory Authority.");
    case "cn": return msg("tax_n_cn_pbc", "Crypto trading and services are illegal financial activities; in November 2025 the central bank and twelve other agencies restated this and included stablecoins.");
    case "ae": return msg("tax_n_ae_fta", "An individual pays corporate tax only on business turnover above AED 1 million a year; wages and personal investment income are not business.");
    case "qa": return msg("tax_n_qa_gta", "Qatar taxes Qatar-sourced income and capital gains at 10%; an individual's sale of real estate or securities outside a business is exempt. Crypto is not named.");
    case "om": return msg("tax_n_om_pit", "A personal income tax of 5% on total income above OMR 42,000 a year takes effect at the start of 2028 (Royal Decree 56/2025).");
    case "eg": return msg("tax_n_eg_cbe", "The Central Bank of Egypt warns against dealing in any cryptocurrency, says no licence to trade them has ever been granted, and treats such activity as a crime under Law No. 194 of 2020.");
    case "za": return msg("tax_n_za", "Trading is income in full; an investor's gain has the annual exclusion taken off, then 40% of the rest is added to income.");
    case "ng": return msg("tax_n_ng_nrs", "A resident's gains and income from crypto are taxed at the income tax rates. Holding, and moving between your own wallets, are not taxable; swaps are disposals; staking, mining and airdrops are income. Platforms withhold 1% of each disposal's proceeds.");
    case "ke": return msg("tax_n_ke_kra", "The digital asset tax (Income Tax Act section 12F) was repealed by the Finance Act 2025. No rule on an individual's gains was found.");
    case "mc": return msg("tax_n_mc", "Residents are not liable for income tax, except French nationals, who are taxed as if they lived in France.");
    default: return null;
  }
};

/* A period in words: "1 year", "6 months", "365 days". */
const taxPeriodText = (rule) =>
  rule.days
    ? msg("tax_p_days", "$1 days", String(rule.days))
    : rule.months
      ? msg("tax_p_months", "$1 months", String(rule.months))
      : rule.years === 1
        ? msg("tax_p_year", "1 year")
        : msg("tax_p_years", "$1 years", String(rule.years));

/* When the tax year runs, in the language on screen. */
const taxYearText = (e) => {
  const y = e && e.y;
  if (!y || (y[0] === 1 && y[1] === 1)) return msg("tax_calendar_year", "the calendar year");
  const tag = intlTag(activeLocale());
  const f = (d) => new Date(d).toLocaleDateString(tag, { day: "numeric", month: "long", timeZone: "UTC" });
  const start = Date.UTC(2001, y[0] - 1, y[1]);
  return msg("tax_year_span", "$1 to $2", f(start), f(start - 86400000));
};

/* An amount in the country's own currency, whole units. */
const taxAmount = (v, cur) => {
  try {
    return new Intl.NumberFormat(intlTag(activeLocale()), { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
  } catch (e) {
    return `${Math.round(v)} ${cur}`;
  }
};

const taxPct = (v) => `${Number(v)}%`;

/* The model, read out as rules: every field the estimate runs on, in words,
   so a card never computes something it does not also say. */
const taxRuleLines = (e) => {
  const m = e.m;
  if (!m) return [];
  const cur = e.cur;
  const out = [];
  const rates = m.rates || {};
  if (m.turnover) out.push(msg("tax_r_turnover", "$1 of each sale's value, gain or loss", taxPct(rates.turnover)));
  else if (m.wealth) out.push(msg("tax_r_wealth", "A deemed return of $1 on holdings above $2 a person, taxed at $3", taxPct(m.wealth.deemed), taxAmount(m.wealth.allowance, cur), taxPct(m.wealth.rate)));
  else if (m.brackets) {
    const parts = m.brackets.map(([upTo, p], i) => (upTo == null ? msg("tax_r_bracket_top", "$1 above", taxPct(p)) : msg("tax_r_bracket", "$1 up to $2", taxPct(p), taxAmount(upTo, cur))));
    out.push((m.bracketsBy === "month" ? msg("tax_r_brackets_month", "By brackets on each month's gain: $1", parts.join(" · ")) : msg("tax_r_brackets", "By brackets: $1", parts.join(" · "))));
  } else {
    const name = taxGainsRateName(m);
    if (m.long && m.long.mode === "rate") {
      out.push(rates.short == null ? msg("tax_r_short_marginal", "Held $1 or less: your income rate", taxPeriodText(m.long)) : msg("tax_r_short_rate", "Held $1 or less: $2 by default", taxPeriodText(m.long), taxPct(rates.short)));
      out.push(msg("tax_r_long_rate", "Held longer: $1 by default", taxPct(rates.long)));
    } else if (name && rates[name] == null) out.push(msg("tax_r_marginal", "At your own income tax rate — enter it below"));
    else if (name) out.push(msg("tax_r_flat", "$1 on gains", taxPct(rates[name])));
  }
  for (const [until, r] of m.byYear || []) {
    const name = taxGainsRateName(m) || Object.keys(r)[0];
    if (r[name] != null) out.push(msg("tax_r_by_year", "$1 in $2 and earlier", taxPct(r[name]), String(until)));
  }
  if (m.long && m.long.mode === "exempt") out.push(m.long.days ? msg("tax_r_exempt_days", "Held $1 or more: tax-free", taxPeriodText(m.long)) : msg("tax_r_exempt", "Held more than $1: tax-free", taxPeriodText(m.long)));
  if (m.long && m.long.mode === "discount") out.push(msg("tax_r_discount", "Held more than $1: $2 of the gain is taxed", taxPeriodText(m.long), taxPct(100 - m.long.value * 100)));
  if (m.startsFrom) out.push(msg("tax_r_starts", "Taxed from $1; earlier gains are not", String(m.startsFrom)));
  if (m.allowance) out.push(msg("tax_r_allowance", "The first $1 of gains a year is tax-free (an allowance)", taxAmount(m.allowance, cur)));
  for (const [until, v] of m.allowanceByYear || []) out.push(msg("tax_r_allowance_year", "$1 in the tax year starting $2 and earlier", taxAmount(v, cur), String(until)));
  if (m.threshold) out.push(msg("tax_r_threshold", "Gains under $1 a year are free — at $1 or more, all of it is taxed (a threshold, not an allowance)", taxAmount(m.threshold, cur)));
  if (m.proceedsLimit) out.push(msg("tax_r_proceeds", "If the year's sales total $1 or less, none of it is taxed", taxAmount(m.proceedsLimit, cur)));
  if (m.monthlyProceedsLimit) out.push(msg("tax_r_proceeds_month", "A month whose sales total $1 or less is not taxed", taxAmount(m.monthlyProceedsLimit, cur)));
  if (m.smallGains) out.push(msg("tax_r_small", "A gain under $1 per sale is free while the year's total stays within $2", taxAmount(m.smallGains[0], cur), taxAmount(m.smallGains[1], cur)));
  if (m.inclusion) out.push(msg("tax_r_inclusion", "$1 of the gain is added to your income", taxPct(m.inclusion * 100)));
  if (m.lossFactor) out.push(msg("tax_r_loss_factor", "Losses count at $1", taxPct(m.lossFactor * 100)));
  if (m.noLosses) out.push(msg("tax_r_no_losses", "Losses reduce nothing"));
  if (m.incomeThreshold) out.push(msg("tax_r_income_threshold", "Income received (staking and the like) is free under $1 a year", taxAmount(m.incomeThreshold, cur)));
  if (m.method === "fifo") out.push(msg("tax_r_fifo", "Sales use up the oldest purchases first (FIFO)"));
  else if (m.method === "average") out.push(msg("tax_r_average", "Each sale takes the average cost of what is held"));
  else if (m.method === "uk-pool") out.push(msg("tax_r_uk_pool", "Matched with the same day's purchases, then the next 30 days', then the pool's average cost"));
  else if (m.method === "recorded") out.push(msg("tax_r_recorded", "Each sale is matched as it was recorded (FIFO, LIFO or HIFO)"));
  else if (m.method === "pool") out.push(msg("tax_r_pool", "The year's proceeds less the year's spending on crypto; excess spending carries on"));
  return out;
};

/* How each summary step reads, with its rate or period where it has one. */
const taxStepLabel = (e, name, rates, rateName) => {
  const m = e.m || {};
  const r = rateName && rates[rateName] != null ? String(rates[rateName]) : "—";
  const yearRule = m.long && m.long.years === 1 && !m.long.months;
  switch (name) {
    case "short":
      if (!m.long) return msg("tax_net", "Net gain");
      if (yearRule) return msg("tax_step_short", "Gain held a year or less");
      return m.long.days ? msg("tax_step_short_days", "Gain held under $1", taxPeriodText(m.long)) : msg("tax_step_short_p", "Gain held $1 or less", taxPeriodText(m.long));
    case "long":
      if (yearRule) return msg("tax_step_long", "Gain held more than a year");
      return m.long && m.long.days ? msg("tax_step_long_days", "Gain held $1 or more", taxPeriodText(m.long)) : msg("tax_step_long_p", "Gain held more than $1", taxPeriodText(m.long || { years: 1 }));
    case "exempt":
      if (yearRule) return msg("tax_step_exempt", "Held more than a year — tax-free");
      return msg("tax_step_exempt_p", "Held long enough — tax-free");
    case "net": return msg("tax_net", "Net gain");
    case "taxShort": return msg("tax_step_tax_short", "Tax on the short-term gain at $1%", r);
    case "taxLong": return msg("tax_step_tax_long", "Tax on the long-term gain at $1%", r);
    case "taxIncome": return msg("tax_step_tax_income", "Tax on income at $1%", r);
    case "allowance": return msg("tax_step_allowance", "Annual exempt amount");
    case "taxable": return msg("tax_step_taxable", "Taxable gain");
    case "taxGains": return rateName === "brackets" ? msg("tax_step_tax_brackets", "Tax on it by the brackets") : msg("tax_step_tax_gains", "Tax on the gain at $1%", r);
    case "incomeTaxable": return m.incomeThreshold === 256 ? msg("tax_step_income_taxable", "Taxable income (free under €256)") : msg("tax_step_income_threshold", "Taxable income (free under $1)", taxAmount(m.incomeThreshold || 0, e.cur));
    case "lossesReduced": return msg("tax_step_losses_reduced", "Losses, as far as they count");
    case "discount": return msg("tax_step_discount", "Discount on gains held more than a year");
    case "underThreshold": return msg("tax_step_under_threshold", "Under the threshold — nothing taxed");
    case "inclusion": return msg("tax_step_inclusion", "The share of the gain that is taxed");
    case "proceeds": return msg("tax_step_proceeds", "Proceeds from sales");
    case "taxTurnover": return msg("tax_step_tax_turnover", "Tax on the sales' value at $1%", r);
    case "poolCost": return msg("tax_step_pool_cost", "Spent buying crypto in the year");
    case "carried": return msg("tax_step_carried", "Costs carried from earlier years");
    case "monthsExempt": return msg("tax_step_months_exempt", "Months under the monthly limit");
    case "underProceeds": return msg("tax_step_under_proceeds", "The year's sales — under the limit, nothing taxed");
    case "smallGains": return msg("tax_step_small_gains", "Small gains — within the yearly limit, nothing taxed");
    case "notYet": return msg("tax_step_not_yet", "Not taxed in this year");
    default: return name;
  }
};

/* What a matched pair counts as, in the country's own terms. */
const taxPairLabel = (e, p) => {
  const m = e.m || {};
  if (p.rule === "same-day") return msg("tax_pair_same_day", "Same day");
  if (p.rule === "30-day") return msg("tax_pair_30_day", "30-day rule");
  if (p.rule === "pool") return msg("tax_pair_pool", "Section 104 pool");
  if (p.rule === "average") return msg("tax_pair_average", "Average cost");
  if (p.rule === "cost-pool") return msg("tax_pair_cost_pool", "The year's cost pool");
  if (!m.long) return msg("tax_pair_fifo", "First in, first out");
  const held = taxHeldLong(p.acquired, p.disposed, m.long);
  if (e.code === "us") {
    return held === true ? msg("tax_pair_long", "Long-term") : held === false ? msg("tax_pair_short", "Short-term") : msg("tax_pair_short_undated", "Short-term · no purchase date");
  }
  if (e.code === "de") {
    return held === true ? msg("tax_pair_exempt", "Over a year · tax-free") : held === false ? msg("tax_pair_within", "Within a year") : msg("tax_pair_within_undated", "No purchase date · counted as within");
  }
  if (held == null) return msg("tax_pair_undated", "No purchase date · counted as short");
  if (m.long.mode === "exempt") return held ? msg("tax_pair_long_free", "Held long enough · tax-free") : msg("tax_pair_taxed", "Taxed");
  if (m.long.mode === "discount") return held ? msg("tax_pair_discounted", "Held over a year · discounted") : msg("tax_pair_taxed", "Taxed");
  return held ? msg("tax_pair_long", "Long-term") : msg("tax_pair_short", "Short-term");
};

const taxRateLabel = (name) =>
  name === "short"
    ? msg("tax_rate_short", "Short-term (your income rate)")
    : name === "long"
      ? msg("tax_rate_long", "Long-term")
      : name === "income"
        ? msg("tax_rate_income", "Income")
        : name === "cgt"
          ? msg("tax_rate_cgt", "Capital gains")
          : name === "personal"
            ? msg("tax_rate_personal", "Your personal rate")
            : name === "turnover"
              ? msg("tax_rate_turnover", "On each sale's value")
              : msg("tax_rate_gains", "Rate on gains");

/* ── the guide: what is what ───────────────────────────────────────────── */

const taxGlossary = () => [
  [msg("tax_gl_event", "A taxable event (a disposal)"), msg("tax_gl_event_d", "The moment you give a coin up — selling it, swapping it, spending it. In most countries this, not buying or holding, is when tax arises.")],
  [msg("tax_gl_proceeds", "Proceeds"), msg("tax_gl_proceeds_d", "What you received for what you gave up, in your country's currency at the time.")],
  [msg("tax_gl_cost", "Cost basis"), msg("tax_gl_cost_d", "What the coin cost you, in your country's currency — the price, and in most countries the fees. For a coin received as income, its value when it arrived.")],
  [msg("tax_gl_gain", "Gain or loss"), msg("tax_gl_gain_d", "Proceeds less cost basis. A loss can usually reduce gains; how far, and for how long, differs by country.")],
  [msg("tax_gl_holding", "Holding period"), msg("tax_gl_holding_d", "How long you held a coin before disposing of it. Some countries tax a gain held long enough at a lower rate (the US), tax part of it (Australia), or not at all (Germany, Portugal).")],
  [msg("tax_gl_allowance", "Allowance"), msg("tax_gl_allowance_d", "An amount of gain each year that is tax-free, with tax only on what exceeds it — the UK's £3,000, Ireland's €1,270.")],
  [msg("tax_gl_threshold", "Threshold (Freigrenze)"), msg("tax_gl_threshold_d", "A limit below which nothing is taxed — but once reached, all of it is. Germany's €1,000 is one; it is easily mistaken for an allowance.")],
  [msg("tax_gl_sales_limit", "Sales limit"), msg("tax_gl_sales_limit_d", "A few countries exempt a year whose total sales — not gains — stay under a limit: France €305, Finland €1,000, Czechia CZK 100,000, Brazil R$ 35,000 a month.")],
  [msg("tax_gl_fifo", "FIFO, LIFO, HIFO"), msg("tax_gl_fifo_d", "Which purchase a sale uses up: the first bought, the last bought, or the most expensive. Many countries require FIFO; the US lets you choose and record it.")],
  [msg("tax_gl_average", "Average cost"), msg("tax_gl_average_d2", "Every purchase goes into one pool per coin, and a sale takes the pool's average cost — Canada, Sweden, Austria, Japan, and Italy where an intermediary computes the gain.")],
  [msg("tax_gl_pool", "Pooling (the UK)"), msg("tax_gl_pool_d", "A sale is matched first with a purchase the same day, then with one in the next 30 days, then with the Section 104 pool's average cost.")],
  [msg("tax_gl_income", "Capital gain or income"), msg("tax_gl_income_d", "Most countries tax an investor's gains as capital gains; some add them to income at your ordinary rates (Japan, New Zealand, Denmark). Trading as a business is income almost everywhere.")],
  [msg("tax_gl_rewards", "Staking, mining, airdrops"), msg("tax_gl_rewards_d", "Often income at their value when received, and that value becomes the coin's cost when you sell it later. Some countries tax them only when sold (Austria).")],
  [msg("tax_gl_swap", "Coin-to-coin swap"), msg("tax_gl_swap_d", "A disposal in many countries (the US, the UK, Germany, Spain, Canada, Australia); in others nothing is taxed until you exchange into money (France, Portugal, Poland, Italy, Austria).")],
  [msg("tax_gl_transfer", "Moving between your own wallets"), msg("tax_gl_transfer_d2", "Not a disposal in any country an official source covers — but keep the records, because a tax office may ask where coins came from.")],
  [msg("tax_gl_wealth", "Wealth tax, deemed return"), msg("tax_gl_wealth_d", "A tax on what you hold rather than on gains: the Netherlands taxes a deemed return, Switzerland and Norway tax holdings in their wealth taxes.")],
  [msg("tax_gl_turnover", "A tax on each sale's value"), msg("tax_gl_turnover_d", "A small percentage of what a sale brings in, gain or loss — Indonesia and Vietnam.")],
  [msg("tax_gl_residency", "Tax residency"), msg("tax_gl_residency_d", "You are usually taxed where you live for tax purposes, on crypto wherever it is held. Moving country has rules of its own.")],
  [msg("tax_gl_reporting", "Reporting by exchanges"), msg("tax_gl_reporting_d", "From 2026 exchanges in many countries report their customers' transactions to tax authorities (the OECD's CARF, the EU's DAC8, the US Form 1099-DA).")],
  [msg("tax_gl_records", "Records to keep"), msg("tax_gl_records_d", "The date, amount, price and fees of every purchase, sale, swap and receipt. PriceTab keeps the purchases, sales and receipts you enter here — not your exchange history, fees or swaps.")],
];

/* ── the component's half ──────────────────────────────────────────────── */

const taxGuide = (view) => ({
  taxCountry() {
    const saved = view.state.taxSettings && view.state.taxSettings.country;
    return saved && taxWorldEntry(saved) ? saved : taxGuessCountry(view.props.currency);
  },

  /* Only what the person typed: the defaults, and a year's own where the
     law changed, are the engine's to fill in. */
  taxGiven(country) {
    return (view.state.taxSettings.rates || {})[country] || {};
  },

  setTaxCountry(country) {
    if (!taxWorldEntry(country)) return;
    view.setState((s) => {
      const taxSettings = { ...s.taxSettings, country };
      saveTaxSettings(taxSettings);
      return { taxSettings, taxYear: null, taxView: "country" };
    });
  },

  /* A rate is typed as text and kept as a draft until it is a number — the
     lot form's rule, so "1" on the way to "18" is not a saved 1%. Empty
     clears the person's rate and the default returns. */
  setTaxRate(country, name, raw) {
    const d = numericDraft(raw);
    const key = `${country}:${name}`;
    view.setState((s) => {
      const drafts = { ...s.taxDrafts, [key]: d.value };
      const mine = { ...((s.taxSettings.rates || {})[country] || {}) };
      const v = Number(d.value);
      if (d.value === "") delete mine[name];
      else if (!Number.isFinite(v) || v < 0 || v > 100) return { taxDrafts: drafts };
      else mine[name] = v;
      const rates = { ...(s.taxSettings.rates || {}), [country]: mine };
      const taxSettings = { ...s.taxSettings, rates };
      saveTaxSettings(taxSettings);
      return { taxDrafts: drafts, taxSettings };
    });
  },

  taxReportFor(country) {
    const { holdings, currency } = view.props;
    const given = view.taxGiven(country);
    const memo = view._taxMemo;
    const sig = JSON.stringify(given);
    if (memo && memo.holdings === holdings && memo.country === country && memo.currency === currency && memo.sig === sig) {
      return memo.report;
    }
    const report = taxReport(holdings, country, currency, given);
    view._taxMemo = { holdings, country, currency, sig, report };
    return report;
  },

  downloadTaxCsv(report, year) {
    downloadTextFile(`pricetab-tax-${report.country}-${String(year.label).replace("/", "-")}.csv`, taxReportCsv(report, year.key), "text/csv");
  },

  /* Every country, named in the language on screen, sorted by that name —
     built once per language and reused. */
  taxCountries() {
    const tag = intlTag(activeLocale());
    if (view._taxList && view._taxList.tag === tag) return view._taxList.list;
    let en = null;
    try {
      en = new Intl.DisplayNames(["en"], { type: "region" });
    } catch (e) {
      en = null;
    }
    const english = (code) => {
      try {
        return en ? en.of(code.toUpperCase()).toLowerCase() : "";
      } catch (e) {
        return "";
      }
    };
    const list = TAX_WORLD_CODES.map((code) => ({ code, name: taxCountryLabel(code), en: english(code), entry: taxWorldEntry(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, tag));
    view._taxList = { tag, list };
    return list;
  },

  /* ── the picker ── */

  renderTaxPicker(country) {
    const all = view.taxCountries();
    const q = (view.state.taxQuery || "").trim().toLocaleLowerCase();
    const filter = view.state.taxFilter || "all";
    const shown = all.filter((c) => {
      if (filter !== "all" && !TAX_FILTERS[filter].includes(c.entry.s)) return false;
      if (!q) return true;
      return c.name.toLocaleLowerCase().includes(q) || c.code === q || c.en.includes(q);
    });
    const count = (k) => all.filter((c) => TAX_FILTERS[k].includes(c.entry.s)).length;
    const move = (e) => {
      const keys = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity };
      if (!(e.key in keys) || !shown.length) return;
      e.preventDefault();
      const at = Math.max(0, shown.findIndex((c) => c.code === country));
      const step = keys[e.key];
      const next = step === -Infinity ? 0 : step === Infinity ? shown.length - 1 : Math.min(shown.length - 1, Math.max(0, at + step));
      view.setTaxCountry(shown[next].code);
      const list = e.currentTarget;
      requestAnimationFrame(() => {
        const node = list.querySelector(`[data-tax-code="${shown[next].code}"]`);
        if (node) node.focus();
      });
    };
    return React.createElement(
      TaxPicker,
      { "data-tax-picker": "true" },
      React.createElement(TaxSearch, {
        type: "search",
        value: view.state.taxQuery,
        placeholder: msg("tax_search", "Search a country"),
        "aria-label": msg("tax_search", "Search a country"),
        onChange: (e) => view.setState({ taxQuery: e.target.value }),
      }),
      React.createElement(
        LedgerChips,
        { role: "group", "aria-label": msg("tax_filter", "Show"), style: { margin: "0.6rem 0" } },
        [
          ["all", msg("tax_f_all", "All $1", String(all.length))],
          ["taxed", msg("tax_f_taxed", "Taxed $1", String(count("taxed")))],
          ["free", msg("tax_f_free", "Not taxed $1", String(count("free")))],
          ["norule", msg("tax_f_norule", "No clear rule $1", String(count("norule")))],
          ["banned", msg("tax_f_banned", "Banned $1", String(count("banned")))],
          ["unverified", msg("tax_f_unverified", "Not confirmed $1", String(count("unverified")))],
        ].map(([k, label]) =>
          React.createElement(
            LedgerChip,
            { key: k, active: filter === k, "aria-pressed": filter === k ? "true" : "false", onClick: () => view.setState({ taxFilter: k }) },
            label,
          ),
        ),
      ),
      React.createElement(
        TaxList,
        {
          role: "listbox",
          "aria-label": msg("tax_country", "Country"),
          onKeyDown: move,
          /* The chosen country is brought into the list's view when it
             changes — the list's own scroll, never the page's — and left
             alone when it is already showing. */
          innerRef: (node) => {
            if (!node || view._taxScrolled === country) return;
            view._taxScrolled = country;
            requestAnimationFrame(() => {
              const item = node.querySelector(`[data-tax-code="${country}"]`);
              if (!item) return;
              const top = item.offsetTop;
              if (top < node.scrollTop || top + item.offsetHeight > node.scrollTop + node.clientHeight) {
                node.scrollTop = Math.max(0, top - (node.clientHeight - item.offsetHeight) / 2);
              }
            });
          },
        },
        shown.length
          ? shown.map((c) =>
              React.createElement(
                TaxListItem,
                {
                  key: c.code,
                  role: "option",
                  "aria-selected": c.code === country ? "true" : "false",
                  "data-tax-code": c.code,
                  active: c.code === country,
                  tabIndex: c.code === country || (!shown.some((x) => x.code === country) && c === shown[0]) ? 0 : -1,
                  onClick: () => view.setTaxCountry(c.code),
                },
                React.createElement("span", null, c.name),
                React.createElement(TaxListStatus, { kind: c.entry.s }, taxStatusLabel(c.entry.s)),
              ),
            )
          : React.createElement(LedgerNote, { style: { padding: "0.6rem" } }, msg("tax_no_match", "No country matches.")),
      ),
    );
  },

  /* ── one country ── */

  renderTaxCard(shown, totalNow) {
    /* A territory under another country's law shows that country's rules
       under its own name. */
    const e = shown.s === "parent" && taxWorldEntry(shown.p) ? taxWorldEntry(shown.p) : shown;
    const rows = TAX_EVENTS.map((ev) => {
      const v = taxVerdict(e, ev);
      return { key: ev, cells: [taxEventLabel(ev), React.createElement(TaxVerdict, { kind: v, "data-tax-verdict": v }, taxVerdictLabel(v))] };
    });
    const notes = (e.n || []).map((k) => taxNoteText(k)).filter(Boolean);
    const rules = taxRuleLines(e);
    return React.createElement(
      TaxCard,
      { "data-tax-card": shown.code },
      React.createElement(
        TaxCardHead,
        null,
        React.createElement("h3", null, taxCountryLabel(shown.code)),
        React.createElement(TaxBadge, { kind: e.s }, taxStatusLabel(e.s)),
      ),
      React.createElement(
        LedgerNote,
        { style: { marginTop: "0.35rem" } },
        msg("tax_card_meta", "Tax year: $1 · $2 · read $3", taxYearText(e), taxLevelLabel(e.l), TAX_WORLD_CHECKED),
      ),
      shown.s === "parent" &&
        React.createElement(
          LedgerNote,
          null,
          msg("tax_parent", "The tax law of $1 applies here, so its rules are shown.", taxCountryLabel(shown.p)),
          " ",
          React.createElement(LedgerLink, { onClick: () => view.setTaxCountry(shown.p) }, msg("tax_parent_open", "Open $1", taxCountryLabel(shown.p))),
        ),
      e.s === "banned" &&
        React.createElement(LedgerNote, null, e.since ? msg("tax_banned_since", "Crypto has been prohibited since $1; tax rules on gains do not apply to an activity that is not allowed.", e.since) : msg("tax_banned", "Crypto is prohibited; tax rules on gains do not apply to an activity that is not allowed.")),
      e.s === "no-pit" && React.createElement(LedgerNote, null, msg("tax_no_pit", "There is no personal income tax, so an individual's crypto gains are not taxed. A business, or residence elsewhere, can change that.")),
      e.l === "none" && React.createElement(LedgerNote, { "data-tax-unverified": "true" }, msg("tax_unverified", "No official source was confirmed for this country, so nothing about its crypto tax is stated here. Check with its tax authority, or a local adviser, before you file.")),
      e.l !== "none" && React.createElement(LedgerSectionTitle, null, msg("tax_what_is_taxed", "What is taxed, and what is not")),
      e.l !== "none" && ledgerTable("minmax(0, 1fr) minmax(12ch, auto)", null, rows, true),
      rules.length > 0 && React.createElement(LedgerSectionTitle, null, msg("tax_rules", "The rules")),
      rules.length > 0 && React.createElement(TaxRuleList, null, rules.map((r, i) => React.createElement("li", { key: i }, r))),
      notes.length > 0 && React.createElement(LedgerSectionTitle, null, msg("tax_notes", "Worth knowing")),
      notes.map((t, i) => React.createElement(LedgerNote, { key: i, style: { marginTop: i ? "0.4rem" : 0 } }, t)),
      e.m && view.renderTaxEstimate(e, totalNow),
      e.src && e.src.length > 0 &&
        React.createElement(
          LedgerSectionTitle,
          null,
          e.l === "none" ? msg("tax_where_check", "Where to check") : msg("tax_sources_official", "Official sources · read $1", TAX_WORLD_CHECKED),
        ),
      (e.src || []).map(([label, url]) =>
        React.createElement(
          LedgerNote,
          { key: url, style: { marginTop: "0.25rem" } },
          React.createElement("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, label),
        ),
      ),
    );
  },

  renderTaxRates(e) {
    const m = e.m;
    const given = view.taxGiven(e.code);
    return React.createElement(
      "div",
      { "data-tax-rates": "true" },
      Object.keys(m.rates || {}).map((name) => {
        const choices = m.choices && m.choices[name];
        const value = given[name] != null ? given[name] : m.rates[name];
        if (choices) {
          return React.createElement(
            LedgerRateGroup,
            { key: name, role: "group", "aria-label": taxRateLabel(name) },
            taxRateLabel(name),
            choices.map((v) =>
              React.createElement(
                LedgerChip,
                { key: v, active: Number(value) === v, "aria-pressed": Number(value) === v ? "true" : "false", onClick: () => view.setTaxRate(e.code, name, String(v)) },
                `${v}%`,
              ),
            ),
          );
        }
        const key = `${e.code}:${name}`;
        const draft = view.state.taxDrafts[key];
        return React.createElement(
          LedgerRate,
          { key: name },
          taxRateLabel(name),
          React.createElement("input", {
            type: "text",
            inputMode: "decimal",
            value: draft != null ? draft : value == null ? "" : String(value),
            placeholder: msg("tax_rate_yours", "yours"),
            "aria-label": `${taxRateLabel(name)} %`,
            onChange: (ev) => view.setTaxRate(e.code, name, ev.target.value),
            onBlur: () => view.setState((s) => ({ taxDrafts: { ...s.taxDrafts, [key]: undefined } })),
          }),
          "%",
        );
      }),
    );
  },

  /* ── the estimate ── */

  renderTaxEstimate(e, totalNow) {
    const cur = e.cur;
    const money = (v, sign) => view.fmtMoney(v, sign, cur);
    const head = React.createElement(LedgerSectionTitle, null, msg("tax_estimate_head", "An estimate from your records"));
    if (!taxCanReportIn(cur)) {
      return React.createElement(
        React.Fragment,
        null,
        head,
        React.createElement(LedgerNote, null, msg("tax_cannot_report", "PriceTab cannot show amounts in $1, so it has no records in it to estimate from. The rules above still apply.", cur)),
      );
    }
    const currencyNote =
      view.props.currency !== cur &&
      React.createElement(
        LedgerNote,
        null,
        msg("tax_currency_note", "This report is in $1, and the portfolio is showing $2. Only records entered while $1 was on screen are counted; the rest are set aside, never converted.", cur, view.props.currency),
      );
    if (e.m.wealth) {
      const w = view.props.currency === cur ? taxWealthEstimate(e.m, totalNow) : null;
      return React.createElement(
        React.Fragment,
        null,
        head,
        currencyNote,
        w
          ? React.createElement(
              LedgerCells,
              null,
              React.createElement(LedgerCell, { lead: true }, React.createElement("span", null, msg("tax_wealth_tax", "Box 3 tax on today's value")), React.createElement("strong", null, money(w.tax, false))),
              React.createElement(LedgerCell, null, React.createElement("span", null, msg("tax_wealth_value", "Value today")), React.createElement("strong", null, money(w.value, false))),
              React.createElement(LedgerCell, null, React.createElement("span", null, msg("tax_wealth_deemed", "Deemed return")), React.createElement("strong", null, money(w.deemed, false))),
            )
          : React.createElement(LedgerNote, null, msg("tax_wealth_none", "Nothing held in $1 to value.", cur)),
      );
    }
    const report = view.taxReportFor(e.code);
    const years = report ? report.years : [];
    const year = years.find((y) => y.key === view.state.taxYear) || years[0] || null;
    const cell = (label, value, extra) =>
      React.createElement(
        LedgerCell,
        { key: label, tone: extra && extra.tone, lead: extra && extra.lead },
        React.createElement("span", null, label),
        React.createElement("strong", null, value),
        extra && extra.note ? React.createElement("em", null, extra.note) : null,
      );
    const gaps = report ? report.gaps : null;
    return React.createElement(
      React.Fragment,
      null,
      head,
      view.renderTaxRates(e),
      currencyNote,
      !year
        ? React.createElement(LedgerNote, { style: { marginTop: "0.8rem" } }, msg("tax_empty", "Nothing to report yet in $1: record a sale (a holding's editor → Sold) or a receipt (→ Received), and it is matched here.", cur))
        : React.createElement(
            React.Fragment,
            null,
            years.length > 1 &&
              React.createElement(
                LedgerChips,
                { role: "group", "aria-label": msg("tax_year", "Tax year"), style: { marginTop: "0.8rem" } },
                years.map((y) =>
                  React.createElement(
                    LedgerChip,
                    { key: y.key, active: y.key === year.key, "aria-pressed": y.key === year.key ? "true" : "false", onClick: () => view.setState({ taxYear: y.key }) },
                    y.label,
                  ),
                ),
              ),
            React.createElement(
              LedgerCells,
              { style: { marginTop: "0.6rem" } },
              cell(msg("tax_estimate", "Estimated tax · $1", year.label), year.missingRate ? "—" : money(year.estimate, false), {
                lead: true,
                note: year.missingRate ? msg("tax_needs_rate", "Enter your rate above to estimate") : null,
              }),
              year.net != null && cell(msg("tax_net", "Net gain"), money(year.net, true), { tone: ledgerTone(year.net) }),
              cell(msg("tax_disposals", "Disposals"), String(year.disposals), {
                note: msg("tax_proceeds_cost", "proceeds $1 · cost $2", money(year.proceeds, false), money(year.cost, false)),
              }),
              year.income > 0 &&
                cell(msg("tax_income", "Income received"), money(year.income, false), {
                  note: year.incomeList.length === 1 ? msg("po_asset_receipt_one", "1 receipt") : msg("po_asset_receipts", "$1 receipts", String(year.incomeList.length)),
                }),
            ),
            React.createElement(LedgerSectionTitle, null, msg("tax_working", "The working")),
            ledgerTable(
              "minmax(0, 1fr) minmax(14ch, auto)",
              null,
              [
                ...year.steps.map(([name, value, rateName]) => ({
                  key: name,
                  cells: [
                    taxStepLabel(e, name, year.rates, rateName),
                    name === "monthsExempt" ? String(value) : name === "notYet" ? "—" : money(value, name === "short" || name === "long" || name === "net"),
                  ],
                })),
                {
                  key: "total",
                  strong: true,
                  cells: [msg("tax_step_total", "Estimated tax"), year.missingRate ? "—" : money(year.estimate, false)],
                },
              ],
              true,
            ),
            e.code === "us" && year.netLoss < 0 && React.createElement(LedgerNote, null, msg("tax_us_loss", "A net loss offsets up to 3,000 USD a year of other income, and the rest carries forward — not computed here.")),
            e.code === "tr" && !(Number(year.rates.gains) > 0) && React.createElement(LedgerNote, null, msg("tax_tr_no_rate", "No rate is assumed: enter one an adviser gave you and the estimate follows.")),
            year.income > 0 && !e.m.incomeRate && !(e.m.rates && "income" in e.m.rates) &&
              React.createElement(LedgerNote, null, msg("tax_income_not_estimated", "Income received is listed but not estimated here: the sources give no single rate for it.")),
            gaps && (gaps.otherCurrency > 0 || year.uncovered > 0 || gaps.undated > 0) && React.createElement(LedgerSectionTitle, null, msg("tax_gaps", "What it could not use")),
            gaps && gaps.otherCurrency > 0 &&
              React.createElement(LedgerNote, null, msg("tax_gap_currency", "$1 records in $2 set aside — not converted.", String(gaps.otherCurrency), gaps.otherCurrencies.join(", ") || msg("po_another_currency", "another currency"))),
            year.uncovered > 0 && React.createElement(LedgerNote, null, msg("tax_gap_uncovered", "$1 sales this year had no recorded purchase to match, and are not in the figures.", String(year.uncovered))),
            gaps && gaps.undated > 0 && React.createElement(LedgerNote, null, msg("tax_gap_undated", "$1 matched purchases have no date, so they have no holding period.", String(gaps.undated))),
            year.pairs.length > 0 && React.createElement(LedgerSectionTitle, null, msg("tax_pairs", "Each sale, matched — $1", String(year.pairs.length))),
            year.pairs.length > 0 &&
              ledgerTable(
                "minmax(9ch, auto) minmax(9ch, 1fr) minmax(10ch, auto) minmax(11ch, auto) minmax(11ch, auto) minmax(11ch, auto) minmax(12ch, auto)",
                [
                  { label: msg("tax_col_sold", "Sold") },
                  { label: msg("tax_col_bought", "Bought"), left: true },
                  { label: msg("po_col_amount", "Amount") },
                  { label: msg("tax_col_proceeds", "Proceeds") },
                  { label: msg("po_col_cost", "Cost") },
                  { label: msg("po_col_gain", "Gain") },
                  { label: msg("tax_col_counts", "Counts as") },
                ],
                year.pairs.map((p, i) => ({
                  key: i,
                  cells: [
                    ledgerDate(p.disposed),
                    ledgerDate(p.acquired),
                    `${view.fmtAmount(p.amount)} ${p.coin}`,
                    money(p.proceeds, false),
                    p.cost == null ? "—" : money(p.cost, false),
                    p.gain == null ? "—" : { v: money(p.gain, true), tone: ledgerTone(p.gain) },
                    taxPairLabel(e, p),
                  ],
                })),
              ),
            year.incomeList.length > 0 && React.createElement(LedgerSectionTitle, null, msg("tax_income_list", "Received as income — $1", String(year.incomeList.length))),
            year.incomeList.length > 0 &&
              ledgerTable(
                "minmax(9ch, 1fr) minmax(10ch, auto) minmax(12ch, auto)",
                [{ label: msg("po_col_date", "Date") }, { label: msg("po_col_amount", "Amount") }, { label: msg("tax_col_value", "Value received") }],
                year.incomeList.map((x, i) => ({ key: i, cells: [ledgerDate(x.time), `${view.fmtAmount(x.amount)} ${x.coin}`, money(x.value, false)] })),
              ),
            React.createElement(
              LedgerChips,
              { style: { marginTop: "1.2rem" } },
              React.createElement(
                LedgerChip,
                {
                  onClick: () => view.downloadTaxCsv(report, year),
                  title: msg("tax_csv_hint", "The year as the country's form reads it, with the rules' date and the words that it is an estimate. Files are never masked."),
                },
                msg("tax_csv", "Download $1 (CSV)", year.label),
              ),
            ),
          ),
    );
  },

  /* ── what is what ── */

  /* The world at a glance, counted from the data rather than written: how
     many countries tax each event, and which ones do not. */
  renderTaxWorld() {
    const all = view.taxCountries();
    /* Only what an official source confirmed is counted as known. */
    const official = all.filter((c) => c.entry.l === "official");
    const researched = official.filter((c) => TAX_WORLD[c.code]);
    const byStatus = {};
    for (const c of all) byStatus[c.entry.s] = (byStatus[c.entry.s] || 0) + 1;
    const events = ["swap", "spend", "staking", "mining", "airdrop"];
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(LedgerSectionTitle, null, msg("tax_world_head", "The world at a glance · $1 countries and territories", String(all.length))),
      React.createElement(
        TaxWorldGrid,
        null,
        ["gains", "income", "turnover", "wealth", "exempt", "no-pit", "pending", "banned", "unclear", "parent", "unverified"].map((s) =>
          React.createElement(
            LedgerCell,
            { key: s },
            React.createElement("span", null, taxStatusLabel(s)),
            React.createElement("strong", null, String(byStatus[s] || 0)),
          ),
        ),
      ),
      React.createElement(LedgerNote, null, msg("tax_world_note_official", "$1 of them have rules read in official sources — the tax authority, the law, the parliament, a ministry or the central bank. For the rest no official source was confirmed, and their cards say so and state nothing.", String(official.length))),
      React.createElement(LedgerSectionTitle, null, msg("tax_world_events_official", "What the countries with official sources do with each event")),
      ledgerTable(
        "minmax(0, 1fr) repeat(5, minmax(8ch, auto))",
        [
          { label: msg("tax_col_event", "Event"), left: true },
          ...["T", "I", "S", "N", "?"].map((v) => ({ label: taxVerdictLabel(v) })),
        ],
        events.map((ev) => {
          const n = (v) => researched.filter((c) => taxVerdict(c.entry, ev) === v).length;
          return { key: ev, cells: [taxEventLabel(ev), ...["T", "I", "S", "N", "?"].map((v) => String(n(v)))] };
        }),
      ),
      React.createElement(
        LedgerNote,
        null,
        msg("tax_world_swap_free", "Swapping coin to coin is not taxed in: $1.", researched.filter((c) => taxVerdict(c.entry, "swap") === "N" && !["no-pit", "exempt", "wealth", "pending"].includes(c.entry.s)).map((c) => c.name).join(", ")),
      ),
    );
  },

  renderTaxGlossary() {
    return React.createElement(
      React.Fragment,
      null,
      view.renderTaxWorld(),
      React.createElement(LedgerSectionTitle, null, msg("tax_glossary", "What is what")),
      React.createElement(
        TaxGlossary,
        null,
        taxGlossary().map(([term, text]) =>
          React.createElement(
            "div",
            { key: term },
            React.createElement("dt", null, term),
            React.createElement("dd", null, text),
          ),
        ),
      ),
    );
  },

  /* ── the screen ── */

  renderTaxStage(totalNow) {
    const country = view.taxCountry();
    const e = taxWorldEntry(country);
    const close = () => view.setState({ taxOpen: false });
    const tab = view.state.taxView || "country";
    return React.createElement(
      LedgerStage,
      {
        "data-portfolio-tax": country,
        onMouseDown: (ev) => {
          if (ev.target === ev.currentTarget) close();
        },
      },
      React.createElement(
        LedgerStageInner,
        { style: { maxWidth: "1180px" } },
        React.createElement(
          LedgerHead,
          null,
          React.createElement("h2", null, msg("tax_title_world", "Crypto tax guide")),
          React.createElement("span", null, msg("tax_band", "An estimate · rules read $1", TAX_WORLD_CHECKED)),
          React.createElement(LedgerClose, { onClick: close, "aria-label": msg("tax_close", "Close the tax report (Esc)"), title: msg("tax_close", "Close the tax report (Esc)") }, "×"),
        ),
        React.createElement(
          LedgerCaution,
          null,
          msg("tax_caution", "An estimate from what you recorded here and the rates you enter — not tax advice. It knows only the purchases, sales and receipts on this screen: no exchange history, fees, transfers or trades between coins. Rules change; check with a tax adviser or the tax authority before you file."),
        ),
        React.createElement(
          LedgerChips,
          { role: "group", "aria-label": msg("tax_views", "View") },
          React.createElement(
            LedgerChip,
            { active: tab === "country", "aria-pressed": tab === "country" ? "true" : "false", "data-tax-tab": "country", onClick: () => view.setState({ taxView: "country" }) },
            msg("tax_tab_country", "By country"),
          ),
          React.createElement(
            LedgerChip,
            { active: tab === "guide", "aria-pressed": tab === "guide" ? "true" : "false", "data-tax-tab": "guide", onClick: () => view.setState({ taxView: "guide" }) },
            msg("tax_tab_guide", "What is what"),
          ),
        ),
        tab === "guide"
          ? view.renderTaxGlossary()
          : React.createElement(TaxLayout, null, view.renderTaxPicker(country), e ? view.renderTaxCard(e, totalNow) : null),
      ),
    );
  },
});
