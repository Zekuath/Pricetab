// The tax report helper (src/tax-report.js): four countries' rules applied to
// the portfolio's records, checked against cases worked by hand — each rule
// at its edge, where getting it wrong would move money between two years or
// two tax treatments.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { console, Math, Number, Array, JSON, Object, String, Date, Map, isFinite };
vm.createContext(sandbox);
for (const f of ["tax-world.js", "tax-report.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const json = (code) => JSON.parse(JSON.stringify(run(code)));
const sec = (iso) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 1000);
sandbox.sec = sec;
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} ≠ ${b}`);

/* ── "More than one year": the anniversary is still inside it ─────────── */
assert.strictEqual(run(`taxHeldOverAYear(sec("2024-03-10"), sec("2025-03-10"))`), false,
  "a sale on the anniversary has been held one year, not more");
assert.strictEqual(run(`taxHeldOverAYear(sec("2024-03-10"), sec("2025-03-11"))`), true,
  "…the day after, more than one year (IRS long-term; outside §23)");
assert.strictEqual(run(`taxHeldOverAYear(0, sec("2025-03-11"))`), null, "an undated purchase has no holding period");

/* ── tax years ───────────────────────────────────────────────────────── */
assert.strictEqual(run(`taxYearOf("uk", sec("2025-04-05")).label`), "2024/25", "the UK year ends on 5 April");
assert.strictEqual(run(`taxYearOf("uk", sec("2025-04-06")).label`), "2025/26", "…and the next begins on the 6th");
assert.strictEqual(run(`taxYearOf("de", sec("2025-12-31")).label`), "2025", "Germany's is the calendar year");

/* A holding built the way the portfolio stores one: what is still held as
   lots, and each sale with the slices it consumed. */
const holding = (coin, lots, sales) => ({ coin, amount: 0, lots, watches: [], sales });

/* ── the US: recorded matches, short and long, and the netting ─────────── */
{
  sandbox.__us = [holding("BTC",
    [],
    [
      // Bought 1 BTC for 10,000 on 2023-01-02, sold 2024-06-01 for 30,000: long, +20,000
      { amount: 1, received: 30000, time: sec("2024-06-01"), currency: "USD", matched: [{ amount: 1, cost: 10000, acquired: sec("2023-01-02") }] },
      // Bought 1 for 40,000 on 2024-02-01, sold 2024-08-01 for 35,000: short, −5,000
      { amount: 1, received: 35000, time: sec("2024-08-01"), currency: "USD", matched: [{ amount: 1, cost: 40000, acquired: sec("2024-02-01") }] },
    ])];
  const r = json(`taxReport(__us, "us", "USD", { short: 30, long: 15 })`);
  const y = r.years[0];
  assert.strictEqual(y.label, "2024");
  close(y.long, 20000, "long-term");
  close(y.short, -5000, "short-term");
  /* Schedule D: the short-term loss reduces the long-term gain first. */
  close(y.estimate, 15000 * 0.15, "15,000 of net long-term gain at 15%");
  const csv = run(`taxReportCsv(taxReport(__us, "us", "USD", {}), 2024)`);
  assert.ok(/Part I — Short-term \(box I\)[\s\S]*1 BTC,02\/01\/2024,08\/01\/2024,35000\.00,40000\.00,,,-5000\.00/.test(csv),
    "Form 8949 Part I, box I, dates as MM/DD/YYYY, a loss in (h)");
  assert.ok(/Part II — Long-term \(box L\)[\s\S]*1 BTC,01\/02\/2023,06\/01\/2024,30000\.00,10000\.00,,,20000\.00/.test(csv),
    "…and the long-term sale in Part II, box L");
}

/* ── the UK: same day, 30 days, then the Section 104 pool ─────────────── */
{
  sandbox.__uk = [holding("ETH",
    [
      // Held now: 1 ETH bought 2025-06-01 for 1,000 (enters the pool),
      // 1 ETH bought 2025-09-10 for 1,500 — 10 days after the sale below
      { amount: 1, paid: 1000, time: sec("2025-06-01"), currency: "GBP" },
      { amount: 1, paid: 1500, time: sec("2025-09-10"), currency: "GBP" },
    ],
    [
      // Sold 1 ETH on 2025-09-01 for 2,000. Recorded (FIFO) against the 1,000 lot,
      // but HMRC matches it with the purchase 9 days later first: cost 1,500.
      { amount: 1, received: 2000, time: sec("2025-09-01"), currency: "GBP", matched: [{ amount: 1, cost: 800, acquired: sec("2025-05-01") }] },
    ])];
  const r = json(`taxReport(__uk, "uk", "GBP", { cgt: 24 })`);
  const y = r.years.find((x) => x.label === "2025/26");
  const rules = y.pairs.map((p) => p.rule);
  assert.deepStrictEqual(rules, ["30-day"], "a purchase within 30 days after the sale is matched to it first");
  close(y.pairs[0].cost, 1500, "…at that purchase's own cost, not the pool's");
  close(y.net, 500, "gain 2,000 − 1,500");
  close(y.estimate, 0, "under the £3,000 annual exempt amount there is nothing to estimate");

  /* The pool: two purchases, one sale, average cost. */
  sandbox.__ukPool = [holding("BTC",
    [{ amount: 1, paid: 30000, time: sec("2025-05-01"), currency: "GBP" }],
    [{ amount: 1, received: 50000, time: sec("2025-12-01"), currency: "GBP", matched: [{ amount: 1, cost: 10000, acquired: sec("2025-04-10") }] }])];
  const p = json(`taxReport(__ukPool, "uk", "GBP", { cgt: 24 })`).years.find((x) => x.label === "2025/26");
  assert.strictEqual(p.pairs[0].rule, "pool", "no purchase that day or in the next 30: the Section 104 pool");
  close(p.pairs[0].cost, 20000, "the pool's average: (10,000 + 30,000) / 2 BTC");
  close(p.estimate, (30000 - 3000) * 0.24, "net 30,000 less £3,000, at 24%");

  /* The same day beats the pool. */
  sandbox.__ukSame = [holding("SOL",
    [{ amount: 1, paid: 100, time: sec("2025-05-01"), currency: "GBP" }],
    [{ amount: 1, received: 300, time: sec("2025-07-01") + 3600, currency: "GBP", matched: [{ amount: 1, cost: 250, acquired: sec("2025-07-01") }] }])];
  const same = json(`taxReport(__ukSame, "uk", "GBP", {})`).years[0];
  assert.deepStrictEqual(same.pairs.map((x) => [x.rule, x.cost]), [["same-day", 250]], "a purchase the same day is matched first");
}

/* ── Germany: FIFO, the one-year rule and the Freigrenze ──────────────── */
{
  const de = (gain) => [holding("BTC",
    [],
    [{ amount: 1, received: 10000 + gain, time: sec("2025-05-01"), currency: "EUR", matched: [{ amount: 1, cost: 10000, acquired: sec("2025-01-10") }] }])];
  sandbox.__de999 = de(999);
  sandbox.__de1000 = de(1000);
  const under = json(`taxReport(__de999, "de", "EUR", { personal: 42 })`).years[0];
  assert.strictEqual(under.underFreigrenze, true, "€999 of short-term gain is under the Freigrenze");
  close(under.estimate, 0, "…and all of it is free");
  const at = json(`taxReport(__de1000, "de", "EUR", { personal: 42 })`).years[0];
  close(at.estimate, 1000 * 0.42, "at €1,000 the whole gain is taxable — a threshold, not a deduction");

  /* Held more than a year: outside §23, whatever the size. */
  sandbox.__deLong = [holding("BTC", [],
    [{ amount: 1, received: 90000, time: sec("2025-05-02"), currency: "EUR", matched: [{ amount: 1, cost: 10000, acquired: sec("2024-05-01") }] }])];
  const long = json(`taxReport(__deLong, "de", "EUR", { personal: 42 })`).years[0];
  close(long.exempt, 80000, "an 80,000 gain held a year and a day is exempt");
  close(long.estimate, 0, "…and estimates nothing");

  /* FIFO recomputed, whatever the sale was recorded under. */
  sandbox.__deFifo = [holding("ETH",
    [{ amount: 1, paid: 3000, time: sec("2025-03-01"), currency: "EUR" }],
    [{ amount: 1, received: 2500, time: sec("2025-06-01"), currency: "EUR", method: "hifo", matched: [{ amount: 1, cost: 3000, acquired: sec("2025-03-01") }] }])];
  // The held 3,000 lot and the sold slice are the same purchase: two of them
  // exist only if there were two purchases. Add the earlier one as held too.
  sandbox.__deFifo[0].lots.unshift({ amount: 1, paid: 1000, time: sec("2025-01-01"), currency: "EUR" });
  const fifo = json(`taxReport(__deFifo, "de", "EUR", {})`).years[0];
  close(fifo.pairs[0].cost, 1000, "Germany matches the oldest purchase first, even when the sale was recorded HIFO");

  /* Income: a Freigrenze of €256. */
  sandbox.__deIncome = [holding("ETH", [{ amount: 0.1, paid: 255, time: sec("2025-02-01"), currency: "EUR", kind: "income" }], [])];
  const inc = json(`taxReport(__deIncome, "de", "EUR", { personal: 40 })`).years[0];
  close(inc.income, 255, "staking received is counted at its value on receipt");
  close(inc.estimate, 0, "…and under €256 it is free (§22 Nr. 3)");
}

/* ── Türkiye: FIFO in TRY, no default rate ───────────────────────────── */
{
  sandbox.__tr = [holding("BTC", [],
    [{ amount: 1, received: 3000000, time: sec("2025-05-01"), currency: "TRY", matched: [{ amount: 1, cost: 2000000, acquired: sec("2024-01-01") }] }])];
  const y = json(`taxReport(__tr, "tr", "TRY", {})`).years[0];
  close(y.net, 1000000, "the gain is counted");
  close(y.estimate, 0, "…and no rate is assumed: nothing is estimated until one is entered");
  close(json(`taxReport(__tr, "tr", "TRY", { gains: 10 })`).years[0].estimate, 100000, "with a rate entered, it is applied");
}

/* ── what is set aside, and said ─────────────────────────────────────── */
{
  sandbox.__mixed = [holding("BTC",
    [{ amount: 1, paid: 20000, time: sec("2025-01-01"), currency: "USD" }],
    [{ amount: 2, received: 60000, time: sec("2025-06-01"), currency: "GBP", matched: [{ amount: 1, cost: 20000, acquired: sec("2025-02-01") }] }])];
  const r = json(`taxReport(__mixed, "uk", "GBP", {})`);
  assert.ok(r.gaps.otherCurrency >= 1 && r.gaps.otherCurrencies.includes("USD"), "a purchase in dollars is set aside from a sterling report, and named");
  assert.strictEqual(r.years[0].uncovered, 1, "…and the part of the sale it would have covered is counted as unmatched, not given a cost");
  const csv = run(`taxReportCsv(taxReport(__mixed, "uk", "GBP", {}), ${r.years[0].key})`);
  assert.ok(/not tax advice/i.test(csv) && /2026-09-28/.test(csv), "the file says it is an estimate and when the rules were read");
}

/* ── every source is an official one ───────────────────────────────────
   Asked for as "ciddi devlet kuruluşları olmalı": a tax authority, a law or
   gazette, a parliament, a ministry, a central bank. A government domain
   passes by its shape; an official body on another domain is named here,
   one by one — adding a host to this list is a claim about who runs it. */
const GOV_HOST = /(^|\.)(gov|gob|go|govt|gouv|gv)(\.[a-z]{2})?$/;
const OFFICIAL_HOSTS = {
  "admin.ch": "Swiss federal administration",
  "zh.ch": "Canton of Zurich",
  "baochinhphu.vn": "Government of Viet Nam, its e-portal",
  "public.lu": "Luxembourg state portal (ACD)",
  "investturksandcaicos.tc": "Invest Turks and Caicos, the government's investment agency",
  "lex.uz": "Uzbekistan's national database of legislation",
  "nra.bg": "Bulgaria's National Revenue Agency",
  "pisrs.si": "Slovenia's legal information system",
  "financnasprava.sk": "Slovakia's Financial Administration",
  "skat.dk": "Danish Tax Agency",
  "skm.dk": "Danish Ministry of Taxation",
  "anaf.ro": "Romania's National Agency for Fiscal Administration",
  "aade.gr": "Greece's Independent Authority for Public Revenue",
  "bank-of-algeria.dz": "Bank of Algeria",
  "bb.org.bd": "Bangladesh Bank",
  "belastingdienst.nl": "Dutch Tax Administration",
  "bundesfinanzministerium.de": "Germany's Federal Ministry of Finance",
  "canada.ca": "Government of Canada",
  "cbe.org.eg": "Central Bank of Egypt",
  "dekamer.be": "Belgian Chamber of Representatives",
  "lachambre.be": "Belgian Chamber of Representatives",
  "emta.ee": "Estonian Tax and Customs Board",
  "gesetze-im-internet.de": "German Federal Ministry of Justice",
  "gesetze.li": "Liechtenstein's official law database",
  "govern.ad": "Government of Andorra",
  "normattiva.it": "Italian state's legislation portal",
  "nrb.org.np": "Nepal Rastra Bank",
  "revenue.ie": "Irish Revenue",
  "sii.cl": "Chile's Internal Revenue Service",
  "skatteetaten.no": "Norwegian Tax Administration",
  "skatteverket.se": "Swedish Tax Agency",
  "skatturinn.is": "Iceland Revenue and Customs",
  "vero.fi": "Finnish Tax Administration",
  "vmi.lt": "Lithuania's State Tax Inspectorate",
};
const isOfficialHost = (host) => GOV_HOST.test(host) || Object.keys(OFFICIAL_HOSTS).some((d) => host === d || host.endsWith(`.${d}`));
for (const c of json("TAX_WORLD_CODES")) {
  const e = json(`taxWorldEntry("${c}")`);
  for (const [label, url] of e.src) {
    assert.ok(/^https:\/\//.test(url), `${c}: ${label} is https`);
    assert.ok(isOfficialHost(new URL(url).hostname), `${c}: ${new URL(url).hostname} is not an official host`);
  }
  if (e.l === "official") assert.ok(e.src.length >= 1, `${c} states rules, so it names at least one official source`);
  else {
    /* A card no official source confirmed states nothing. */
    assert.ok(!e.m && !(e.n && e.n.length) && Object.values(e.x || {}).every((v) => v === "?"), `${c} is unconfirmed and claims nothing`);
  }
  if (e.m) assert.ok(typeof e.cur === "string" && e.cur.length === 3, `${c} names the currency it reports in`);
}
assert.ok(isOfficialHost("www.irs.gov") && isOfficialHost("www.estv.admin.ch") && !isOfficialHost("taxsummaries.pwc.com") && !isOfficialHost("en.wikipedia.org") && !isOfficialHost("t24.com.tr"),
  "the host rule admits government domains and the named bodies, and nothing else");

/* ── the world's models, each at its edge ────────────────────────────── */
{
  /* One sale: bought 1 on `bought` for `cost`, sold on `sold` for `got`, in
     `cur`, stored the way the portfolio stores a FIFO sale. */
  const sale = (coin, cur, bought, cost, sold, got, amount = 1) => [holding(coin, [],
    [{ amount, received: got, time: sec(sold), currency: cur, matched: [{ amount, cost, acquired: sec(bought) }] }])];
  const year = (h, c, cur, rates) => json(`taxReport(${JSON.stringify(h)}, "${c}", "${cur}", ${JSON.stringify(rates || {})})`).years[0];

  // Spain: the savings-base brackets, 19% to 6,000, 21% on the next
  const es = year(sale("BTC", "EUR", "2025-01-01", 10000, "2025-06-01", 20000), "es", "EUR");
  close(es.estimate, 6000 * 0.19 + 4000 * 0.21, "Spain taxes 10,000 of gain by its brackets: 19% then 21%");

  // Sweden: a loss counts at 70%
  sandbox.__se = [holding("BTC", [], [
    { amount: 1, received: 20000, time: sec("2025-03-01"), currency: "SEK", matched: [{ amount: 1, cost: 10000, acquired: sec("2025-01-01") }] },
    { amount: 1, received: 5000, time: sec("2025-04-01"), currency: "SEK", matched: [{ amount: 1, cost: 15000, acquired: sec("2025-01-02") }] },
  ])];
  const se = json(`taxReport(__se, "se", "SEK", {})`).years[0];
  /* Average cost makes both coins 12,500: +7,500 and −7,500, of which 70%
     is deductible. */
  close(se.pairs[0].cost, 12500, "Sweden averages the two purchases");
  close(se.estimate, (7500 - 7500 * 0.7) * 0.3, "…and deducts only 70% of a loss");

  // France: sales totalling €305 or less are free; €306 is not
  close(year(sale("ETH", "EUR", "2025-01-01", 100, "2025-06-01", 305), "fr", "EUR").estimate, 0, "France: €305 of sales in the year are exempt");
  const fr = year(sale("ETH", "EUR", "2025-01-01", 100, "2025-06-01", 306), "fr", "EUR");
  close(fr.estimate, 206 * 0.314, "…€306 is taxed from the first euro, at 31.4% for a 2025 sale (the CSG rise applies from 2025 income)");
  close(year(sale("ETH", "EUR", "2024-01-01", 100, "2024-06-01", 306), "fr", "EUR").estimate, 206 * 0.30, "…and at 30% in 2024");

  // Portugal: 365 days or more is free; 364 is not
  close(year(sale("BTC", "EUR", "2024-06-01", 1000, "2025-06-01", 2000), "pt", "EUR").estimate, 0, "Portugal: held 365 days, exempt");
  close(year(sale("BTC", "EUR", "2024-06-02", 1000, "2025-06-01", 2000), "pt", "EUR").estimate, 280, "…364 days, 28%");

  // Australia: half of a gain held over a year, after losses come off the rest first
  sandbox.__au = [holding("BTC", [], [
    { amount: 1, received: 30000, time: sec("2025-09-01"), currency: "AUD", matched: [{ amount: 1, cost: 10000, acquired: sec("2024-01-01") }] },
    { amount: 1, received: 5000, time: sec("2025-10-01"), currency: "AUD", matched: [{ amount: 1, cost: 8000, acquired: sec("2025-08-01") }] },
  ])];
  const au = json(`taxReport(__au, "au", "AUD", { gains: 30 })`).years[0];
  assert.strictEqual(au.label, "2025/26", "Australia's year starts on 1 July");
  close(au.taxable, (20000 - 3000) * 0.5, "the 3,000 loss comes off first, then the 50% discount");
  close(au.estimate, 8500 * 0.30, "…at the marginal rate typed");
  assert.strictEqual(json(`taxReport(__au, "au", "AUD", {})`).years[0].missingRate, true, "with no rate typed, the screen is told one is missing");
  /* A gain held under a year is not discounted: 4,000 short plus half of
     20,000 long is 14,000 taxable, not half of 24,000. */
  sandbox.__au2 = [holding("BTC", [], [
    { amount: 1, received: 30000, time: sec("2025-09-01"), currency: "AUD", matched: [{ amount: 1, cost: 10000, acquired: sec("2024-01-01") }] },
    { amount: 1, received: 5000, time: sec("2025-10-01"), currency: "AUD", matched: [{ amount: 1, cost: 1000, acquired: sec("2025-08-01") }] },
  ])];
  close(json(`taxReport(__au2, "au", "AUD", { gains: 30 })`).years[0].taxable, 4000 + 20000 * 0.5, "Australia discounts only the gain held more than a year");

  // Canada: average cost, then half of the gain
  sandbox.__ca = [holding("ETH",
    [{ amount: 1, paid: 3000, time: sec("2025-02-01"), currency: "CAD" }],
    [{ amount: 1, received: 4000, time: sec("2025-03-01"), currency: "CAD", matched: [{ amount: 1, cost: 1000, acquired: sec("2025-01-01") }] }])];
  const ca = json(`taxReport(__ca, "ca", "CAD", { gains: 40 })`).years[0];
  close(ca.pairs[0].cost, 2000, "Canada's adjusted cost base is the average of what was bought before the sale");
  close(ca.estimate, (4000 - 2000) * 0.5 * 0.4, "…and half the gain is included");

  // Indonesia: 0.21% of the sale's value, gain or loss
  close(year(sale("BTC", "IDR", "2025-09-01", 900000000, "2025-10-01", 1000000000), "id", "IDR").estimate, 1000000000 * 0.0021, "Indonesia taxes the value of the sale");

  // Brazil: a month of sales at or under R$ 35,000 is exempt
  close(year(sale("BTC", "BRL", "2025-01-01", 10000, "2025-06-01", 35000), "br", "BRL").estimate, 0, "Brazil: R$ 35,000 of sales in a month, exempt");
  close(year(sale("BTC", "BRL", "2025-01-01", 10000, "2025-06-01", 35001), "br", "BRL").estimate, 25001 * 0.15, "…R$ 35,001, the gain at 15%");

  // Czechia: over three years, exempt; gross sales of CZK 100,000 or less, exempt
  close(year(sale("BTC", "CZK", "2022-01-01", 100000, "2025-06-01", 500000), "cz", "CZK").estimate, 0, "Czechia: held more than three years");
  close(year(sale("BTC", "CZK", "2025-01-01", 50000, "2025-06-01", 100000), "cz", "CZK").estimate, 0, "…CZK 100,000 of sales in the year");
  close(year(sale("BTC", "CZK", "2025-01-01", 50000, "2025-06-01", 100001), "cz", "CZK", { gains: 15 }).estimate, 50001 * 0.15, "…one koruna more is taxed, at the rate typed");
  assert.strictEqual(year(sale("BTC", "CZK", "2025-01-01", 50000, "2025-06-01", 100001), "cz", "CZK").missingRate, true, "…and no rate is assumed: the official pages give none");

  // India: a loss reduces nothing
  sandbox.__in = [holding("BTC", [], [
    { amount: 1, received: 200000, time: sec("2025-06-01"), currency: "INR", matched: [{ amount: 1, cost: 100000, acquired: sec("2025-05-01") }] },
    { amount: 1, received: 50000, time: sec("2025-07-01"), currency: "INR", matched: [{ amount: 1, cost: 100000, acquired: sec("2025-05-02") }] },
  ])];
  close(json(`taxReport(__in, "in", "INR", {})`).years[0].estimate, 100000 * 0.30, "India: 30% of the gain, the 50,000 loss set off against nothing");

  // Poland: the year's purchases are the cost, and what they exceed carries on
  sandbox.__pl = [holding("BTC",
    [{ amount: 1, paid: 50000, time: sec("2024-05-01"), currency: "PLN" }],
    [{ amount: 1, received: 30000, time: sec("2025-03-01"), currency: "PLN", matched: [{ amount: 1, cost: 20000, acquired: sec("2025-01-01") }] }])];
  const pl = json(`taxReport(__pl, "pl", "PLN", {})`);
  const pl25 = pl.years.find((y) => y.key === 2025);
  close(pl25.cost, 20000, "Poland: 2025's cost is what was spent buying in 2025");
  close(pl25.carried, 50000, "…plus 2024's purchases, which had no proceeds to meet");
  close(pl25.estimate, 0, "…so 30,000 of proceeds leaves no income");
  close(pl25.carryNext, 40000, "…and 40,000 of cost carries into 2026");

  // Romania: under RON 200 a sale and RON 600 a year, free
  sandbox.__ro = [holding("BTC", [], [1, 2, 3].map((i) => ({ amount: 0.1, received: 1190, time: sec(`2026-0${i}-10`), currency: "RON", matched: [{ amount: 0.1, cost: 1000, acquired: sec("2026-01-01") }] })))];
  close(json(`taxReport(__ro, "ro", "RON", {})`).years[0].estimate, 0, "Romania: three gains of 190, 570 in the year — free");
  sandbox.__ro.push(holding("ETH", [], [{ amount: 1, received: 1190, time: sec("2026-05-10"), currency: "RON", matched: [{ amount: 1, cost: 1000, acquired: sec("2026-01-01") }] }]));
  close(json(`taxReport(__ro, "ro", "RON", {})`).years[0].estimate, 760 * 0.1, "…a fourth makes 760: all of it at ANAF's 10%");

  // South Africa: the annual exclusion by tax year, then 40% inclusion
  const za = (sold) => year(sale("BTC", "ZAR", "2020-01-01", 100000, sold, 300000), "za", "ZAR", { gains: 30 });
  close(za("2026-02-01").estimate, (200000 - 40000) * 0.4 * 0.3, "South Africa 2025/26: R40,000 exclusion");
  close(za("2026-04-01").estimate, (200000 - 50000) * 0.4 * 0.3, "…2026/27: R50,000");

  // Colombia: two years or more at 15%, less at the rate typed
  close(year(sale("BTC", "COP", "2023-01-01", 1000, "2025-06-01", 2000), "co", "COP").estimate, 150, "Colombia: held over two years, 15%");
  close(year(sale("BTC", "COP", "2024-01-01", 1000, "2025-06-01", 2000), "co", "COP", { short: 30 }).estimate, 300, "…under two, at the ordinary rate");

  // Slovenia: the law to tax gains is still in preparation, so nothing is computed
  assert.strictEqual(json(`taxWorldEntry("si").s`), "exempt", "Slovenia: an individual's gains are not taxed today");
  assert.strictEqual(json(`taxReport([], "si", "EUR", {})`), null, "…so there is no gains model to estimate from");

  // Italy: 26% for 2025, 33% from 2026
  close(year(sale("BTC", "EUR", "2025-01-01", 1000, "2025-06-01", 2000), "it", "EUR").estimate, 260, "Italy 2025: 26%");
  close(year(sale("BTC", "EUR", "2026-01-01", 1000, "2026-06-01", 2000), "it", "EUR").estimate, 330, "Italy 2026: 33%");

  // Luxembourg: six months and a day is free; under €500 of speculative gain, free
  close(year(sale("BTC", "EUR", "2025-01-01", 1000, "2025-07-02", 5000), "lu", "EUR", { gains: 40 }).estimate, 0, "Luxembourg: held over six months");
  close(year(sale("BTC", "EUR", "2025-01-01", 1000, "2025-03-01", 1499), "lu", "EUR", { gains: 40 }).estimate, 0, "…€499 of speculative gain");
  close(year(sale("BTC", "EUR", "2025-01-01", 1000, "2025-03-01", 1500), "lu", "EUR", { gains: 40 }).estimate, 200, "…€500 of it is taxed whole");

  // The Netherlands: not gains — a deemed return on what is held
  const nl = json(`taxWealthEstimate(taxWorldEntry("nl").m, 100000)`);
  close(nl.tax, (100000 - 59357) * 0.06 * 0.36, "Box 3: 6% deemed on what exceeds the allowance, at 36%");
  assert.strictEqual(json(`taxReport([], "nl", "EUR", {})`), null, "…so there is no gains report");

  // Every country with a model computes on the same records without throwing
  sandbox.__any = [holding("BTC",
    [{ amount: 1, paid: 20000, time: sec("2025-02-01"), currency: "USD" }, { amount: 0.1, paid: 5000, time: sec("2025-05-01"), currency: "USD", kind: "income" }],
    [{ amount: 1, received: 40000, time: sec("2025-08-01"), currency: "USD", matched: [{ amount: 1, cost: 15000, acquired: sec("2024-06-01") }] }])];
  for (const c of json("Object.keys(TAX_WORLD)")) {
    const e = json(`taxWorldEntry("${c}")`);
    if (!e.m || e.m.wealth) continue;
    const r = json(`taxReport(__any, "${c}", "${e.cur}", {})`);
    assert.ok(r && Array.isArray(r.years), `${c} returns a report`);
    for (const y of r.years) assert.ok(Number.isFinite(y.estimate) && y.estimate >= 0, `${c} ${y.label}: an estimate that is a number`);
  }
  assert.strictEqual(json(`TAX_WORLD_CODES`).every((c) => json(`taxWorldEntry("${c}")`) !== null), true, "every listed country has an entry");
}

console.log("TAX REPORT TESTS OK");
