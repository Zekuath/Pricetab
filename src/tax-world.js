/* THE WORLD'S CRYPTO TAX RULES — every country, as far as an official
 * source says (28 Sep 2026).
 *
 * Asked for as *"tax muhabbetini sadece dört ülkeye vermeyelim … bütün
 * dünya ülkeleri hakkında bir araştırma yap. Ve buna göre ne ne değildir
 * detaylı bir yardımcı hazırla"*, and then, the same day: *"kaynaklarının
 * güvenilir olması gerekiyor … ciddi devlet kuruluşları olmalı"* — for every
 * country. So every source below is the country's own public authority: its
 * tax administration, its law or official gazette, its parliament, a
 * ministry, its central bank or financial regulator. No news site, no firm's
 * summary, no guide, no encyclopaedia. The research, document by document,
 * is in `docs/internal/research/tax-world-2026-09-28.md`; this file is what
 * it found, as data. Nothing here computes — `tax-report.js` does, from `m`.
 *
 * A rule no official source confirmed is not stated. Every entry says which
 * it is (`l`):
 *
 *   official  every rule on the card was read in an official source
 *   none      no official source was confirmed; the card states nothing
 *             and points to the tax authority
 *
 * `s`, the status — what happens to a private investor's gains:
 *
 *   gains       taxed as capital gains when disposed of
 *   income      taxed as income at the person's own rates
 *   turnover    a small tax on the value of each sale, gain or not
 *   wealth      gains are not taxed; what is held is (a deemed return)
 *   exempt      private investors' gains are not taxed (a trader's can be)
 *   no-pit      no personal income tax at all
 *   pending     a crypto tax is proposed or legislated but not in force
 *   banned      crypto is prohibited
 *   unclear     no crypto-specific rule; the official sources say so
 *   parent      follows another country's rules (`p`)
 *   unverified  no official source was confirmed (`l` is "none")
 *
 * `x`, what each event is: T taxed as a disposal, N not taxed, I income
 * when received, S taxed only when later sold, W held value in a wealth
 * tax (`hold` only), ? no official source says.
 *
 * `m`, the model the estimate runs on (only where the rule is specific
 * enough to compute): matching `method`, default `rates` in percent (every
 * one can be changed on screen), and the country's reliefs — see
 * `taxSummary` in tax-report.js for what each field does. A rate no official
 * source gave is `null`: the person types it.
 *
 * `y`, the tax year's first [month, day]; absent means the calendar year. */

const TAX_WORLD_CHECKED = "2026-09-28";

const TAX_WORLD = {
  /* ── the four read first (tax-rules-2026-09-28.md) ─────────────────── */
  tr: {
    s: "unclear", l: "official", cur: "TRY",
    m: { method: "fifo", rates: { gains: 0, income: 0 } },
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["tr"],
    src: [
      ["GİB — özelge 38810 (GVK m.37)", "https://gib.gov.tr/mevzuat/kanun/435/ozelge/38810"],
      ["TBMM — Kanun Teklifi 2/3560 (2 Mar 2026), crypto articles 1 and 3–5", "https://cdn.tbmm.gov.tr/KKBSPublicFile/D28/Y4/T2/WebOnergeMetni/580785e4-e960-4817-a4cd-df3f46d6a987.pdf"],
      ["Resmî Gazete — Kanun No. 7577 (17 Apr 2026), passed without them", "https://www.resmigazete.gov.tr/eskiler/2026/04/20260417-21.htm"],
    ],
  },
  us: {
    s: "gains", l: "official", cur: "USD",
    m: { method: "recorded", rates: { short: 22, long: 15, income: 22 }, choices: { long: [0, 15, 20] }, long: { years: 1, mode: "rate" }, netting: true },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "I" },
    n: ["us"],
    src: [
      ["IRS Form 8949 instructions", "https://www.irs.gov/instructions/i8949"],
      ["IRS Topic 409 — capital gains rates", "https://www.irs.gov/taxtopics/tc409"],
      ["IRS — digital assets (Rev. Rul. 2023-14)", "https://www.irs.gov/filing/digital-assets"],
    ],
  },
  gb: {
    s: "gains", l: "official", cur: "GBP", y: [4, 6],
    m: { method: "uk-pool", rates: { cgt: 18, income: 20 }, choices: { cgt: [18, 24] }, allowance: 3000 },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["gb"],
    src: [
      ["HMRC Cryptoassets Manual CRYPTO22200 — pooling", "https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22200"],
      ["GOV.UK — Capital Gains Tax rates", "https://www.gov.uk/capital-gains-tax/rates"],
      ["GOV.UK — tax-free allowance", "https://www.gov.uk/capital-gains-tax/allowances"],
      ["HMRC CRYPTO21200 — staking income", "https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto21200"],
    ],
  },
  de: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { personal: 30 }, long: { years: 1, mode: "exempt" }, threshold: 1000, incomeThreshold: 256, incomeRate: "personal" },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["de"],
    src: [
      ["§23 EStG — private Veräußerungsgeschäfte", "https://www.gesetze-im-internet.de/estg/__23.html"],
      ["§22 Nr. 3 EStG — sonstige Einkünfte", "https://www.gesetze-im-internet.de/estg/__22.html"],
      ["BMF — Einzelfragen zur ertragsteuerrechtlichen Behandlung bestimmter Kryptowerte (6 Mar 2025)", "https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte-bmf-schreiben.html"],
    ],
  },

  /* ── Europe ─────────────────────────────────────────────────────────── */
  fr: {
    s: "gains", l: "official", cur: "EUR",
    // The CSG rise applies from 2025 income declared in 2026 (brochure IR 2026)
    m: { method: "average", rates: { gains: 31.4 }, byYear: [[2024, { gains: 30 }]], proceedsLimit: 305 },
    x: { swap: "N", spend: "T", staking: "?", mining: "I", airdrop: "?" },
    n: ["fr", "fr_formula"],
    src: [
      ["impots.gouv.fr — plus-values sur actifs numériques", "https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques"],
      ["BOFiP BOI-RPPM-PVBMC-30-30", "https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423"],
      ["impots.gouv.fr — brochure IR 2026: CSG at 10.6% from 2025 income", "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf"],
      ["impots.gouv.fr — brochure IR 2026: plus-values d'actifs numériques", "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/09-plus_values_137a156.pdf"],
    ],
  },
  es: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", brackets: [[6000, 19], [50000, 21], [200000, 23], [300000, 27], [null, 30]], rates: { income: 19 } },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["es"],
    src: [
      ["Agencia Tributaria — monedas virtuales (IRPF 2025)", "https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c11-ganancias-perdidas-patrimoniales/monedas-virtuales/compra-venta-monedas-virtuales-tributacion-inversor.html"],
    ],
  },
  it: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "average", rates: { gains: 33 }, byYear: [[2025, { gains: 26 }]] },
    x: { swap: "N", spend: "T", staking: "I", mining: "?", airdrop: "?" },
    n: ["it"],
    src: [
      ["Normattiva — Legge 207/2024, art. 1 commi 24–25 (33% from 2026)", "https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2024-12-31&atto.codiceRedazionale=24G00229&tipoDettaglio=singolavigenza&qId=&classica=true&dataVigenza=25%2F12%2F2025&generaTabId=true&bloccoAggiornamentoBreadCrumb=true&title=lbl.dettaglioAtto&tabID="],
      ["Normattiva — Legge 199/2025, art. 1 comma 28 (euro e-money tokens 26%)", "https://www.normattiva.it/eli/stato/LEGGE/2025/12/30/199/CONSOLIDATED"],
      ["Agenzia delle Entrate — circolare 30/E del 27 ottobre 2023", "https://www.agenziaentrate.gov.it/portale/documents/20143/5589638/Circolare+criptoattivita+del+27+ottobre+2023.pdf"],
    ],
  },
  nl: {
    s: "wealth", l: "official", cur: "EUR",
    m: { wealth: { deemed: 6, rate: 36, allowance: 59357 } },
    x: { swap: "N", spend: "N", staking: "?", mining: "?", airdrop: "?" },
    n: ["nl"],
    src: [
      ["Belastingdienst — box 3-inkomen 2026", "https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/berekening-box-3-inkomen-2026"],
      ["Belastingdienst — aangifte en crypto's", "https://www.belastingdienst.nl/wps/wcm/connect/nl/werk-en-inkomen/content/aangifte-doen-en-belasting-betalen-met-cryptos"],
    ],
  },
  be: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: 10 }, allowance: 10000, startsFrom: 2026 },
    x: { swap: "?", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["be", "method_unstated"],
    src: [
      ["De Kamer — dossier 56K1244: law of 6 April 2026, Staatsblad 21 April 2026", "https://www.lachambre.be/FLWB/html/56/N/56K1244.html"],
      ["De Kamer — DOC 56 1244/008, the text adopted", "https://www.lachambre.be/FLWB/PDF/56/1244/56K1244008.pdf"],
      ["De Kamer — DOC 56 1244/001, the bill and its explanatory memorandum", "https://www.dekamer.be/FLWB/PDF/56/1244/56K1244001.pdf"],
    ],
  },
  pt: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: 28 }, long: { days: 365, mode: "exempt" } },
    x: { swap: "N", spend: "T", staking: "S", mining: "S", airdrop: "?" },
    n: ["pt"],
    src: [["Autoridade Tributária — Criptoativos, conceito fiscal e tributação", "https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Folhetos_informativos/Documents/Criptoativos.pdf"]],
  },
  at: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "average", rates: { gains: 27.5 } },
    x: { swap: "N", spend: "T", staking: "S", mining: "I", airdrop: "S" },
    n: ["at"],
    src: [["BMF — steuerliche Behandlung von Kryptowährungen", "https://www.bmf.gv.at/themen/steuern/sparen-veranlagen/steuerliche-behandlung-von-kryptowaehrungen.html"]],
  },
  ie: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: 33 }, allowance: 1270 },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["ie"],
    src: [["Revenue — TDM 02-01-03, taxation of crypto-assets", "https://www.revenue.ie/en/tax-professionals/tdm/income-tax-capital-gains-tax-corporation-tax/part-02/02-01-03.pdf"]],
  },
  pl: {
    s: "gains", l: "official", cur: "PLN",
    m: { method: "pool", rates: { gains: 19 } },
    x: { swap: "N", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["pl"],
    src: [["podatki.gov.pl — zbycie kryptowalut", "https://www.podatki.gov.pl/podatki-osobiste/pit/informacje-podstawowe/co-jest-opodatkowane/zbycie-kryptowalut"]],
  },
  se: {
    s: "gains", l: "official", cur: "SEK",
    m: { method: "average", rates: { gains: 30 }, lossFactor: 0.7 },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["se"],
    src: [["Skatteverket — kryptotillgångar", "https://www.skatteverket.se/privat/skatter/vardepapper/andratillgangar/kryptovalutor.4.15532c7b1442f256bae11b60.html"]],
  },
  dk: {
    s: "income", l: "official", cur: "DKK",
    m: { method: "fifo", rates: { gains: null } },
    x: { swap: "T", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["dk"],
    src: [
      ["Skattestyrelsen — calculate and declare gains and losses on crypto", "https://skat.dk/en-us/individuals/shares-and-securities/tax-on-cryptocurrency-know-the-rules-and-avoid-a-tax-bill/calculate-and-declare-gains-and-losses-on-cryptoassets"],
      ["Skattestyrelsen — questions and answers on cryptocurrency", "https://skat.dk/en-us/individuals/shares-and-securities/tax-on-cryptocurrency-know-the-rules-and-avoid-a-tax-bill/questions-and-answers-on-cryptocurrency"],
      ["Skatteministeriet — Skattelovrådet: kryptoaktiver bør lagerbeskattes", "https://skm.dk/aktuelt/presse-nyheder/pressemeddelelser/ny-rapport-fra-skattelovraadet-kryptoaktiver-boer-fremover-lagerbeskattes"],
    ],
  },
  fi: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", brackets: [[30000, 30], [null, 34]], proceedsLimit: 1000 },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["fi"],
    src: [
      ["Vero — crypto assets", "https://www.vero.fi/en/individuals/property/investments/virtual-currencies/"],
      ["Vero — kryptovarojen verotus (syventävä ohje)", "https://www.vero.fi/syventavat-vero-ohjeet/ohje-hakusivu/48411/kryptovarojen-verotus/"],
    ],
  },
  no: {
    s: "gains", l: "official", cur: "NOK",
    m: { method: "fifo", rates: { gains: 22 } },
    x: { hold: "W", swap: "T", spend: "?", staking: "I", mining: "I", airdrop: "?" },
    n: ["no"],
    src: [
      ["Skatteetaten — tax regulations for virtual assets", "https://www.skatteetaten.no/en/person/taxes/get-the-taxes-right/shares-and-securities/about-shares-and-securities/digital-currency/tax-regulations-virtual-currency/"],
      ["Skatteetaten — kryptovaluta i skattemeldingen", "https://www.skatteetaten.no/en/press/nyhetsrommet/kryptovaluta-for-milliarder-av-kroner-rapporteres-i-skattemeldingen/"],
    ],
  },
  cz: {
    s: "income", l: "official", cur: "CZK",
    m: { method: "fifo", rates: { gains: null }, long: { years: 3, mode: "exempt" }, proceedsLimit: 100000 },
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["cz", "method_unstated"],
    src: [
      ["Finanční správa — osvobození příjmů z úplatného převodu kryptoaktiv (KV 29 Apr 2026)", "https://financnisprava.gov.cz/assets/cs/prilohy/d-placeni-dani/Krypto-29_4_2026.pdf"],
      ["Finanční správa — ostatní příjmy fyzických osob", "https://financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby/ostatni"],
    ],
  },
  ch: {
    s: "exempt", l: "official", cur: "CHF",
    x: { hold: "W", swap: "N", spend: "N", staking: "I", mining: "I", airdrop: "?" },
    n: ["ch"],
    src: [
      ["ESTV — Kryptowährungen, Besteuerung", "https://www.estv.admin.ch/de/kryptowaehrungen-besteuerung"],
      ["Kanton Zürich — Steuerbuch ZStB 16.5", "https://www.zh.ch/de/steuern-finanzen/steuern/treuhaender/steuerbuch/steuerbuch-definition/zstb-16-5.html"],
    ],
  },
  gr: { s: "unverified", l: "none", cur: "EUR", src: [["AADE — Independent Authority for Public Revenue", "https://www.aade.gr/"]] },
  ro: {
    s: "gains", l: "official", cur: "RON",
    m: { method: "fifo", rates: { gains: 10 }, smallGains: [200, 600] },
    x: { swap: "T", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["ro", "method_unstated"],
    src: [["ANAF — impozitarea veniturilor din transferul de monedă virtuală", "https://static.anaf.ro/static/10/Brasov/Brasov/imp_moneda_virtuala.pdf"]],
  },
  hu: {
    s: "gains", l: "official", cur: "HUF",
    m: { method: "pool", rates: { gains: 15 } },
    x: { swap: "N", spend: "T", staking: "?", mining: "I", airdrop: "?" },
    n: ["hu"],
    src: [["NAV — a kriptoügyletek jövedelmének adózása", "https://nav.gov.hu/ado/szja/a-kriptougyletek-jovedelmenek-adozasa"]],
  },
  sk: {
    s: "income", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: null } },
    x: { swap: "T", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["sk", "method_unstated"],
    src: [
      ["Finančná správa — zdaňovanie kryptomien", "https://podpora.financnasprava.sk/618784-Zda%C5%88ovanie-kryptomien"],
      ["Finančná správa — príjmy z predaja kryptoaktív u nepodnikateľa", "https://podpora.financnasprava.sk/293880-Pr%C3%ADjmy-z-predaja-kryproakt%C3%ADv--u-nepodnikate%C4%BEa-"],
    ],
  },
  si: {
    s: "exempt", l: "official", cur: "EUR",
    x: { swap: "N", spend: "N", staking: "?", mining: "I", airdrop: "I" },
    n: ["si"],
    src: [
      ["FURS — davčna obravnava poslovanja z virtualnimi valutami (April 2022)", "https://www.fu.gov.si/fileadmin/Internet/Davki_in_druge_dajatve/Podrocja/Dohodnina/Drugi_dohodki/Opis/Davcna_obravnava_poslovanja_z_virtualnimi_valutami_po_ZDoh-2_ZDDPO-2_ZDDV-1_in_ZDFS.docx"],
      ["PISRS — Zakon o davku od dobička iz odsvojitve kriptosredstev (in preparation)", "https://pisrs.si/pregledPredpisa?id=ZAKO9255"],
      ["e-uprava — the government's proposal", "https://e-uprava.gov.si/si/drzava-in-druzba/e-demokracija/predlogi-predpisov/predlog-predpisa.html?id=17803&lang=si"],
    ],
  },
  hr: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: 12 }, long: { years: 2, mode: "exempt" } },
    x: { swap: "N", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["hr", "method_unstated"],
    src: [
      ["Porezna uprava — porezni tretman kapitalnih dobitaka od kriptovaluta (2018)", "https://porezna-uprava.gov.hr/Misljenja/Detaljno/2335"],
      ["Porezna uprava — kriptoimovina stečena prije više od dvije godine (2026)", "https://porezna-uprava.gov.hr/hr/primjer-podnosenja-obrasca-joppd-za-primitke-po-osnovi-trgovanja-kriptoimovinom/8342"],
      ["Porezna uprava — dohodak od kapitala po osnovi kapitalnih dobitaka", "https://porezna-uprava.gov.hr/pozivni_centar/Stranice/dohodak-od-kapitala-po-osnovi-kapitalnih-dobitaka.aspx"],
    ],
  },
  lu: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: null }, long: { months: 6, mode: "exempt" }, threshold: 500 },
    x: { swap: "T", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["lu"],
    src: [["ACD — circulaire L.I.R. n° 14/5 – 99/3 – 99bis/3 du 26 juillet 2018", "https://impotsdirects.public.lu/dam-assets/fr/legislation/legi18/circulaireLIR14-5-99-3-99bis-3du26072018.pdf"]],
  },
  mt: {
    s: "exempt", l: "official", cur: "EUR",
    x: { swap: "N", spend: "N", staking: "?", mining: "I", airdrop: "?" },
    n: ["mt"],
    src: [["Commissioner for Revenue — guidelines on the income tax treatment of DLT assets", "https://cfr.gov.mt/en/inlandrevenue/legal-technical/Documents/Guidelines%20-DLTs%20Income%20tax.pdf"]],
  },
  cy: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: 8 }, startsFrom: 2026, sameYearLosses: true },
    x: { swap: "T", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["cy", "method_unstated"],
    src: [
      ["Tax Department — Tax Reform 2026, income tax (Article 20E)", "https://www.gov.cy/media/sites/167/2026/03/2026-%CE%A6%CE%BF%CF%81%CE%9C%CE%B5%CF%84%CE%B1%CF%81%CF%81%CF%8D%CE%B8%CE%BC%CE%B9%CF%83%CE%B7-%CE%A6%CF%8C%CF%81%CE%BF%CF%82-%CE%95%CE%B9%CF%83%CE%BF%CE%B4%CE%AE%CE%BC%CE%B1%CF%84%CE%BF%CF%82.pdf"],
      ["Tax Department — Tax Reform 2026", "https://www.gov.cy/mof-tax/en/documents/forologiki-metarrythmisi-2026/"],
    ],
  },
  ee: {
    s: "income", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: null }, noLosses: true },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["ee", "method_unstated"],
    src: [["EMTA — crypto-assets", "https://www.emta.ee/en/private-client/taxes-and-payment/taxable-income/crypto-assets"]],
  },
  lt: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: 15 }, allowance: 2500 },
    x: { swap: "T", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["lt", "method_unstated"],
    src: [["VMI — gyventojo gautų virtualios valiutos pardavimo pajamų apmokestinimas (2022-09-29)", "https://www.vmi.lt/evmi/documents/20142/391071/Virtualios+valiutos+GPM.PDF/954957f9-18f5-1ec9-8c77-fa79d956c6d8?t=1664350832765"]],
  },
  lv: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: 25.5 } },
    x: { swap: "N", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["lv"],
    src: [["VID — ienākums no kriptoaktīvu pārdošanas (updated 11.06.2025)", "https://www.vid.gov.lv/lv/media/30537/download?attachment="]],
  },
  bg: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: null }, inclusion: 0.9 },
    x: { swap: "T", spend: "?", staking: "?", mining: "I", airdrop: "?" },
    n: ["bg", "method_unstated"],
    src: [["НАП — виртуални валути", "https://nra.bg/wps/portal/nra/taxes/godishen-danak-varhu-dohdite/virtualni-valuti"]],
  },
  rs: {
    s: "gains", l: "official", cur: "RSD",
    m: { method: "fifo", rates: { gains: 15 } },
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["rs", "method_unstated"],
    src: [
      ["Narodna skupština — Zakon o izmenama Zakona o porezu na dohodak građana (2020)", "https://www.parlament.gov.rs/upload/archive/files/lat/pdf/zakoni/2020/1923-20-lat.pdf"],
      ["Poreska uprava — porez na kapitalni dobitak (2025)", "https://www.purs.gov.rs/upload/media/2025/2/4/658322/Poreznakapitalnidobitakkodprenosastvarnihpravananepokretnostijan.pdf"],
      ["Poreska uprava — uputstvo za PPDG-3R", "https://www.purs.gov.rs/lat/fizicka-lica/pregled-propisa/uputstva/4579/uputstvo-za-podnosenje-poreske-prijave-za-utvrdjivanje-poreza-na-kapitalne-dobitke-na-obrascu-ppdg--3r.html"],
    ],
  },
  ad: {
    s: "gains", l: "official", cur: "EUR",
    m: { method: "fifo", rates: { gains: 10 }, allowance: 3000 },
    x: { swap: "T", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["ad", "method_unstated"],
    src: [
      ["Govern d'Andorra — consulta vinculant CV0337-2025 (7 Mar 2025)", "https://www.govern.ad/ca/l/4969171"],
      ["Govern d'Andorra — guia pràctica de l'IRPF 2024", "https://www.govern.ad/documents/d/guest/Guia_IRPF_2024"],
    ],
  },
  li: {
    s: "exempt", l: "official", cur: "CHF",
    x: { hold: "W", swap: "N", spend: "N", staking: "?", mining: "?", airdrop: "?" },
    n: ["li"],
    src: [["gesetze.li — Steuergesetz (SteG)", "https://www.gesetze.li/konso/html/2010340000"]],
  },
  by: {
    s: "unclear", l: "official", cur: "BYN",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["by"],
    src: [
      ["МНС — налогообложение операций с токенами", "https://nalog.gov.by/individuals/income_taxation/transactions_with_digital_signs/"],
      ["МНС — комментарий к Указу № 166", "https://nalog.gov.by/clarifications/comments/31341/"],
    ],
  },
  uz: {
    s: "exempt", l: "official", cur: "UZS",
    x: { swap: "N", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["uz"],
    src: [["lex.uz — ПП-3832, пункт 2 (as amended by УП-140, 18.09.2024)", "https://lex.uz/docs/3806048"]],
  },
  is: {
    s: "gains", l: "official", cur: "ISK",
    m: { method: "fifo", rates: { gains: 22 } },
    x: { swap: "T", spend: "?", staking: "?", mining: "I", airdrop: "?" },
    n: ["is", "method_unstated"],
    src: [
      ["Skatturinn — rafmynt", "https://www.skatturinn.is/einstaklingar/skattskylda/rafmynt/"],
      ["Skatturinn — fjármagnstekjuskattur", "https://www.skatturinn.is/einstaklingar/skattar-og-gjold/fjarmagnstekjuskattur/"],
    ],
  },
  ua: {
    s: "pending", l: "official", cur: "UAH",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["ua"],
    src: [
      ["Verkhovna Rada — bill 10225-d", "https://itd.rada.gov.ua/billinfo/Bills/Card/56271"],
      ["Verkhovna Rada — the bill passes first reading (4 Sep 2025)", "https://www.rada.gov.ua/en/news/News/265708.html"],
    ],
  },
  ru: {
    s: "gains", l: "official", cur: "RUB",
    m: { method: "fifo", brackets: [[2400000, 13], [null, 15]] },
    x: { swap: "?", spend: "?", staking: "?", mining: "I", airdrop: "?" },
    n: ["ru", "method_unstated"],
    src: [
      ["ФНС России — майнинг цифровой валюты", "https://www.nalog.gov.ru/mining/"],
      ["ФНС России — операции с цифровой валютой (418-ФЗ)", "https://www.nalog.gov.ru/rn64/news/activities_fts/15603107/"],
    ],
  },
  ge: {
    s: "exempt", l: "official", cur: "GEL",
    x: { swap: "N", spend: "N", staking: "?", mining: "?", airdrop: "?" },
    n: ["ge"],
    src: [["Matsne — Ministry of Finance public decision No. 201 (28 Jun 2019)", "https://matsne.gov.ge/ka/document/view/4601215"]],
  },
  kz: {
    s: "gains", l: "official", cur: "KZT",
    m: { method: "fifo", rates: { gains: 10 } },
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["kz", "method_unstated"],
    src: [["КГД — вопросы и ответы по декларированию цифровых активов (5 Dec 2024)", "https://www.gov.kz/memleket/entities/kgd/press/news/details/896633?lang=ru"]],
  },

  /* ── The Americas ───────────────────────────────────────────────────── */
  ca: {
    s: "gains", l: "official", cur: "CAD",
    m: { method: "average", rates: { gains: null }, inclusion: 0.5 },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["ca"],
    src: [
      ["CRA — understanding crypto-assets and your tax obligations", "https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/cryptocurrency-guide/crypto-assets-tax-obligations.html"],
      ["CRA — reporting income from crypto-asset transactions", "https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/cryptocurrency-guide/income-crypto-transactions.html"],
      ["CRA — Capital Gains 2025 (T4037)", "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4037/capital-gains.html"],
    ],
  },
  br: {
    s: "gains", l: "official", cur: "BRL",
    m: { method: "fifo", monthlyProceedsLimit: 35000, brackets: [[5000000, 15], [10000000, 17.5], [30000000, 20], [null, 22.5]], bracketsBy: "month" },
    x: { swap: "T", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["br", "method_unstated"],
    src: [["Receita Federal — Perguntas e Respostas IRPF 2026 (questions 574 and 653)", "https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf"]],
  },
  mx: { s: "unverified", l: "none", cur: "MXN", src: [["SAT — Servicio de Administración Tributaria", "https://www.sat.gob.mx/"]] },
  ar: {
    s: "gains", l: "official", cur: "ARS",
    m: { method: "fifo", rates: { gains: 15 }, choices: { gains: [5, 15] } },
    x: { hold: "W", swap: "T", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["ar", "method_unstated"],
    src: [
      ["ARCA — criptoactivos, impuesto a las ganancias", "https://www.afip.gob.ar/economia-digital/criptoactivos/impuesto-a-las-ganancias.asp"],
      ["ARCA — criptoactivos, impuesto sobre los bienes personales", "https://www.afip.gob.ar/economia-digital/criptoactivos/impuesto-sobre-los-bienes-personales.asp"],
    ],
  },
  pr: {
    s: "unclear", l: "official", cur: "USD",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["pr"],
    src: [
      ["DDEC — Puerto Rico's Incentives Code (Act 60), March 2025", "https://docs.pr.gov/files/DDEC/Co%CC%81digo%20de%20Incentivos/Puerto%20Rico's%20Incentives%20Code%20Brochure%20_%20Ingl%C3%A9s%20Marzo%202025.pdf"],
      ["AAFAF — 4% for new resident investors under Act 60 (10 Mar 2026)", "https://www.aafaf.pr.gov/aafafinthenews/gobernadora-firma-ley-que-impone-tasa-contributiva-de-4-a-inversionistas-bajo-la-ley-60"],
    ],
  },
  pa: { s: "unverified", l: "none", cur: "USD", src: [["DGI — Dirección General de Ingresos", "https://dgi.mef.gob.pa/"]] },
  cl: {
    s: "income", l: "official", cur: "CLP",
    m: { method: "fifo", rates: { gains: null } },
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["cl", "method_unstated"],
    src: [["SII — mayor valor en la venta de criptomonedas", "https://www.sii.cl/preguntas_frecuentes/criptomonedas/001_250_7873.htm"]],
  },
  co: {
    s: "gains", l: "official", cur: "COP",
    m: { method: "fifo", rates: { short: null, long: 15 }, long: { years: 2, mode: "rate" } },
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["co"],
    src: [["DIAN — Concepto Unificado de Criptoactivos (2023)", "https://www.dian.gov.co/normatividad/Documents/100202208-1621-Concepto-Unificado-Criptoactivos-17102023.pdf"]],
  },
  sv: {
    s: "exempt", l: "official", cur: "USD",
    x: { swap: "?", spend: "N", staking: "?", mining: "?", airdrop: "?" },
    n: ["sv"],
    src: [["Asamblea Legislativa — Decreto No. 199, reformas a la Ley Bitcoin (2025)", "https://www.asamblea.gob.sv/sites/default/files/documents/decretos/FC2C7E66-490B-4420-B8B5-221C2F2A4C28.pdf"]],
  },

  /* ── Asia-Pacific ───────────────────────────────────────────────────── */
  au: {
    s: "gains", l: "official", cur: "AUD", y: [7, 1],
    m: { method: "fifo", rates: { gains: null }, long: { years: 1, mode: "discount", value: 0.5 } },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "I" },
    n: ["au"],
    src: [
      ["ATO — how to work out and report CGT on crypto", "https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/how-to-work-out-and-report-cgt-on-crypto"],
      ["ATO — CGT discount", "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/cgt-discount"],
      ["ATO — crypto as a personal use asset", "https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/crypto-asset-as-a-personal-use-asset"],
    ],
  },
  nz: {
    s: "income", l: "official", cur: "NZD", y: [4, 1],
    m: { method: "fifo", rates: { gains: null } },
    x: { swap: "T", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["nz", "method_unstated"],
    src: [
      ["Inland Revenue — buying and selling cryptoassets", "https://www.ird.govt.nz/cryptoassets/individual/buying-selling"],
      ["Inland Revenue — acquiring cryptoassets to sell or exchange", "https://www.ird.govt.nz/cryptoassets/individual/buying-selling/acquiring-sell-exchange"],
    ],
  },
  jp: {
    s: "income", l: "official", cur: "JPY",
    m: { method: "average", rates: { gains: null } },
    x: { swap: "T", spend: "T", staking: "I", mining: "I", airdrop: "?" },
    n: ["jp"],
    src: [
      ["国税庁 — 暗号資産等に関する税務上の取扱い", "https://www.nta.go.jp/publication/pamph/shotoku/kakuteishinkokukankei/kasoutuka/"],
      ["財務省 — 令和8年度税制改正の大綱 (26 Dec 2025)", "https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/20251226taikou.pdf"],
    ],
  },
  kr: {
    s: "pending", l: "official", cur: "KRW",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["kr"],
    src: [["국세청 — 거주자의 가상자산소득 과세 개요", "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=40370&cntntsId=238935"]],
  },
  in: {
    s: "gains", l: "official", cur: "INR", y: [4, 1],
    m: { method: "fifo", rates: { gains: 30 }, noLosses: true },
    x: { swap: "T", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["in", "method_unstated"],
    src: [
      ["Income Tax Department — section 115BBH", "https://www.incometaxindia.gov.in/w/section-115bbh-3"],
      ["Income Tax Department — section 194S", "https://www.incometaxindia.gov.in/w/section-194s-4"],
    ],
  },
  sg: {
    s: "exempt", l: "official", cur: "SGD",
    x: { swap: "N", spend: "N", staking: "?", mining: "?", airdrop: "?" },
    n: ["sg"],
    src: [
      ["IRAS — gains from sale of property, shares and financial instruments", "https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/what-is-taxable-what-is-not/gains-from-sale-of-property-shares-and-financial-instruments"],
      ["IRAS — income tax treatment of digital tokens", "https://www.iras.gov.sg/media/docs/default-source/e-tax/etaxguide_cit_income-tax-treatment-of-digital-tokens_091020.pdf"],
    ],
  },
  hk: {
    s: "exempt", l: "official", cur: "HKD", y: [4, 1],
    x: { swap: "N", spend: "N", staking: "?", mining: "?", airdrop: "?" },
    n: ["hk"],
    src: [["IRD — DIPN 39 (revised), digital assets", "https://www.ird.gov.hk/eng/pdf/dipn39.pdf"]],
  },
  tw: {
    s: "income", l: "official", cur: "TWD",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["tw"],
    src: [
      ["財政部賦稅署 — FTX 投資人虛擬資產損失之說明 (18 Nov 2022)", "https://www.dot.gov.tw/singlehtml/ch26?cntId=a2c19cf668c24866be41e6348a3d08a9"],
      ["財政部 — the same statement", "https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=8a1a083b299e49828ecb86da6463b2e0"],
    ],
  },
  my: { s: "unverified", l: "none", cur: "MYR", src: [["LHDN — Inland Revenue Board of Malaysia", "https://www.hasil.gov.my/"]] },
  th: {
    s: "exempt", l: "official", cur: "THB",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["th"],
    src: [
      ["กรมสรรพากร — กฎกระทรวง ฉบับที่ 399 (พ.ศ. 2568), Royal Gazette 5 Sep 2025", "https://www.rd.go.th/fileadmin/user_upload/kormor/newlaw/mr399A.pdf"],
      ["กรมสรรพากร — คำแนะนำการกรอก ภ.ง.ด.90 ปีภาษี 2568", "https://www.rd.go.th/fileadmin/tax_pdf/pit/2568/Ins90_241268.pdf"],
    ],
  },
  id: {
    s: "turnover", l: "official", cur: "IDR",
    m: { turnover: true, rates: { turnover: 0.21 }, choices: { turnover: [0.21, 1] } },
    x: { swap: "T", spend: "T", staking: "?", mining: "?", airdrop: "?" },
    n: ["id"],
    src: [
      ["DJP — PMK 50/2025, a new chapter for crypto tax", "https://www.pajak.go.id/en/node/117234"],
      ["BPK — PMK No. 50 Tahun 2025", "https://peraturan.bpk.go.id/Details/326291/pmk-no-50-tahun-2025"],
    ],
  },
  ph: { s: "unverified", l: "none", cur: "PHP", src: [["BIR — Bureau of Internal Revenue", "https://www.bir.gov.ph/"]] },
  vn: {
    s: "turnover", l: "official", cur: "VND",
    m: { turnover: true, rates: { turnover: 0.1 } },
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["vn"],
    src: [
      ["Cổng TTĐT Chính phủ — Chính sách thuế đối với tài sản mã hóa (1 Apr 2026)", "https://baochinhphu.vn/chinh-sach-thue-doi-voi-tai-san-ma-hoa-102260401165725044.htm"],
      ["Bộ Tài chính — Thông tư 32/2026/TT-BTC", "https://www.mof.gov.vn/tin-tuc-tai-chinh/tin-tuc-su-kien-8/bo-tai-chinh-ban-hanh-thong-tu-so-322026tt-btc-ve-chinh-sach-thue-doi-voi-tai-san-ma-hoa"],
    ],
  },
  pk: {
    s: "unclear", l: "official", cur: "PKR", y: [7, 1],
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["pk"],
    src: [["PVARA — Pakistan Virtual Assets Regulatory Authority", "https://pvara.gov.pk/"]],
  },
  cn: {
    s: "banned", l: "official", cur: "CNY",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["cn"],
    src: [
      ["People's Bank of China — joint meeting on virtual currency trading (28 Nov 2025)", "https://www.pbc.gov.cn/en/3688110/3688172/5552468/2025121116132332435/index.html"],
      ["gov.cn — the September 2021 notice on virtual currency trading", "https://english.www.gov.cn/statecouncil/ministries/202109/24/content_WS614dc30bc6d0df57f98e0c84.html"],
    ],
  },

  /* ── Middle East and Africa ─────────────────────────────────────────── */
  il: { s: "unverified", l: "none", cur: "ILS", src: [["Israel Tax Authority", "https://www.gov.il/en/departments/israel_tax_authority"]] },
  ae: {
    s: "exempt", l: "official", cur: "AED",
    x: { swap: "N", spend: "N", staking: "?", mining: "?", airdrop: "?" },
    n: ["ae"],
    src: [["Federal Tax Authority — Corporate Tax for natural persons", "https://tax.gov.ae/en/taxes/corporate.tax/corporate.tax.topics/basis.of.taxation.natural.person.aspx"]],
  },
  sa: { s: "unverified", l: "none", cur: "SAR", src: [["ZATCA — Zakat, Tax and Customs Authority", "https://zatca.gov.sa/"]] },
  qa: {
    s: "unclear", l: "official", cur: "QAR",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["qa"],
    src: [["General Tax Authority — taxes in Qatar", "https://gta.gov.qa/en/taxes-info"]],
  },
  kw: { s: "unverified", l: "none", cur: "KWD", src: [["Ministry of Finance — Kuwait", "https://www.mof.gov.kw/"]] },
  bh: { s: "unverified", l: "none", cur: "BHD", src: [["National Bureau for Revenue — Bahrain", "https://www.nbr.gov.bh/"]] },
  om: {
    s: "no-pit", l: "official", cur: "OMR",
    x: { swap: "N", spend: "N", staking: "N", mining: "N", airdrop: "N" },
    n: ["om"],
    src: [["Tax Authority — issuance of the Personal Income Tax Law (Royal Decree 56/2025)", "https://tms.taxoman.gov.om/portal/w/issuance-of-personal-income-tax-pit-law"]],
  },
  eg: {
    s: "banned", l: "official", cur: "EGP",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["eg"],
    src: [["Central Bank of Egypt — fourth warning statement on cryptocurrencies (8 Mar 2023)", "https://www.cbe.org.eg/en/news-publications/news/2023/03/08/warning-statement"]],
  },
  za: {
    s: "gains", l: "official", cur: "ZAR", y: [3, 1],
    m: { method: "fifo", rates: { gains: null }, inclusion: 0.4, allowance: 50000, allowanceByYear: [[2025, 40000]] },
    x: { swap: "?", spend: "T", staking: "?", mining: "I", airdrop: "?" },
    n: ["za", "method_unstated"],
    src: [
      ["SARS — crypto assets and tax", "https://www.sars.gov.za/individuals/crypto-assets-tax/"],
      ["SARS — annual exclusion", "https://www.sars.gov.za/types-of-tax/capital-gains-tax/proceeds/calculation-of-taxable-capital-gains-and-assessed-capital-losses/annual-exclusion/"],
      ["SARS — inclusion rate", "https://www.sars.gov.za/types-of-tax/capital-gains-tax/proceeds/calculation-of-taxable-capital-gains-and-assessed-capital-losses/inclusion-rate/"],
    ],
  },
  ng: {
    s: "income", l: "official", cur: "NGN",
    x: { swap: "T", spend: "?", staking: "I", mining: "I", airdrop: "I" },
    n: ["ng"],
    src: [
      ["Nigeria Revenue Service — guidelines on the taxation of virtual assets (31 Jul 2026)", "https://www.nrs.gov.ng/uploads/Guidelines_on_taxation_of_Virtual_Assets_31_7_26_7cd2ef8dab.pdf"],
      ["Nigeria Revenue Service — Nigeria Tax Act 2025", "https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf"],
    ],
  },
  ke: {
    s: "unclear", l: "official", cur: "KES",
    x: { swap: "?", spend: "?", staking: "?", mining: "?", airdrop: "?" },
    n: ["ke"],
    src: [["KRA — Income Tax Act (2026), section 12F repealed", "https://www.kra.go.ke/images/publications/Income-Tax-Act-2026.pdf"]],
  },
};

/* ── the rest of the world ────────────────────────────────────────────
 * Countries whose status an official source gives in one line: a ban, or
 * no personal income tax. Each with the document that says it. */
const TAX_WORLD_BANNED = {
  bd: { since: null, src: ["Bangladesh Bank — FE Circular No. 24 (15 Sep 2022): prohibition regarding virtual assets", "https://www.bb.org.bd/mediaroom/circulars/fepd/sep152022fepd24e.pdf"] },
  dz: { since: "2018", src: ["Bank of Algeria — Banking Commission guidelines 06/2025 on virtual-asset operations (Finance Law 2018)", "https://www.bank-of-algeria.dz/wp-content/uploads/2025/11/lignes-directrices-06-2025-FR-1.pdf"] },
  ma: { since: "2017", src: ["Office des Changes — communiqué on virtual currencies (20 Nov 2017)", "https://www.oc.gov.ma/sites/default/files/2018-05/communique%CC%81%20monnaies%20virtuelles%20fr.pdf"] },
  np: { since: null, src: ["Nepal Rastra Bank — notice that cryptocurrency trading is illegal (2021)", "https://www.nrb.org.np/contents/uploads/2021/09/FXMD-Notice-03-207879-Cryptocurrency.pdf"] },
};
const TAX_WORLD_NO_PIT = {
  ag: ["Government of Antigua and Barbuda — 2016 budget speech: personal income tax abolished", "https://ab.gov.ag/pdf/budget/2016/2016_budget_speech.pdf"],
  ai: ["Government of Anguilla — GST white paper: no comprehensive income tax", "https://gov.ai/document/GST%20White%20Paper%20for%20Anguilla-Revised_v2_09.03.2021%20(002).pdf"],
  bm: ["Government of Bermuda — types of taxes", "https://www.gov.bm/types-taxes-bermuda"],
  bn: ["Ministry of Finance and Economy — Brunei Darussalam, a growing investment destination: no personal income tax", "https://www.mofe.gov.bn/wp-content/uploads/2025/10/7.-Brunei-Darussalam-A-Growing-Investment-Destination.pdf"],
  bs: ["Ministry of Finance of The Bahamas — the economy: capital gains and personal income are tax exempt", "https://www.mof.gov.bs/the-economy"],
  ky: ["Cayman Islands Government — finance and economy", "https://gov.ky/economy"],
  mc: ["MonServicePublic.mc — tax in Monaco", "https://monservicepublic.gouv.mc/en/themes/tax/information/general-information/tax-in-monaco"],
  tc: ["Invest Turks and Caicos — National Investment Policy 2023", "https://investturksandcaicos.tc/wp-content/uploads/2024/05/Turks-and-Caicos-Islands-National-Investment-Policy-2023.pdf"],
};
/* Territories whose tax law is another country's: the card shows that
   country's rules under the territory's own name. */
const TAX_WORLD_PARENT = { ax: "fi", gf: "fr", gp: "fr", mq: "fr", re: "fr", yt: "fr", cc: "au", cx: "au", nf: "au" };

/* Every country and territory the app lists: ISO 3166-1 alpha-2, current,
   inhabited, plus Kosovo (XK). Names come from the browser, in the
   language on screen (`Intl.DisplayNames`), so none is translated here. */
const TAX_WORLD_CODES = (
  "ad ae af ag ai al am ao ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bw by bz " +
  "ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr " +
  "ga gb gd ge gf gg gh gi gl gm gn gp gq gr gt gu gw gy hk hn hr ht hu id ie il im in io iq ir is it je jm jo jp " +
  "ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr " +
  "ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re " +
  "ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tg th tj tk tl tm tn to tr tt " +
  "tv tw tz ua ug us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw"
).split(" ");

/* One entry for any code: the researched one, or one assembled from the
   lists above — never undefined, so a country picked from the list always
   has a card, even if what it says is that no official source was found. */
const taxWorldEntry = (code) => {
  const c = String(code || "").toLowerCase() === "uk" ? "gb" : String(code || "").toLowerCase();
  if (TAX_WORLD[c]) return { code: c, ...TAX_WORLD[c] };
  if (!TAX_WORLD_CODES.includes(c)) return null;
  const base = { code: c, s: "unverified", l: "none", x: {}, src: [] };
  if (TAX_WORLD_PARENT[c]) return { ...base, s: "parent", p: TAX_WORLD_PARENT[c] };
  const ban = TAX_WORLD_BANNED[c];
  if (ban) return { ...base, s: "banned", l: "official", since: ban.since, src: [ban.src] };
  const noPit = TAX_WORLD_NO_PIT[c];
  if (noPit) {
    return { ...base, s: "no-pit", l: "official", x: { swap: "N", spend: "N", staking: "N", mining: "N", airdrop: "N" }, n: c === "mc" ? ["mc"] : [], src: [noPit] };
  }
  return base;
};
