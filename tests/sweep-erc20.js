// Asks every contract in ERC20_TOKENS what it is.
//
// Not part of `npm --prefix tests run check`, and deliberately not in
// run-all.js's suite list: it needs the network, and the check has to stay
// runnable offline and deterministic. Run it by hand whenever a token is added
// or the table has not been swept in a while:
//
//   node tests/sweep-erc20.js
//
// Why it exists. CLAUDE.md's rule is that a token is identified by its
// contract address and never by its symbol — anyone can deploy a contract
// calling itself USDC — and the way that rule was enforced was "the person
// adding the entry checks by hand". That is how a candidate quoted as TON got
// as far as the table before it was caught calling itself TONCOIN. A rule
// checked by hand is a rule that holds until somebody is in a hurry.
//
// Both facts matter and both are checked: a wrong `address` prices someone
// else's token, and a wrong `decimals` misreports the balance by a factor of a
// thousand or a million while looking perfectly plausible.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "src", "config.js"), "utf8");

const RPC = (src.match(/const ETH_RPC = "([^"]+)"/) || [])[1];
const table = (src.match(/const ERC20_TOKENS = \{([\s\S]*?)\n\};/) || [])[1] || "";
const TOKENS = {};
for (const m of table.matchAll(
  /(\w+):\s*\{\s*address:\s*"(0x[0-9a-fA-F]{40})",\s*decimals:\s*(\d+)/g,
)) {
  TOKENS[m[1]] = { address: m[2], decimals: Number(m[3]) };
}

const SYMBOL = "0x95d89b41"; // symbol()
const DECIMALS = "0x313ce567"; // decimals()

/* Two shapes come back for symbol(). The ABI says a dynamic string — offset,
 * length, bytes — but tokens written before that settled (MKR is the one in
 * this table) return a raw bytes32 padded with zeros. Reading only the first
 * would report the older ones as unanswerable and invite someone to "fix" a
 * contract that is perfectly fine. */
const decodeSymbol = (hex) => {
  if (!hex || hex === "0x") return null;
  const body = hex.slice(2);
  if (body.length === 64) {
    const bytes = body.replace(/(00)+$/, "");
    return Buffer.from(bytes, "hex").toString("utf8").trim() || null;
  }
  const len = parseInt(body.slice(64, 128), 16);
  if (!Number.isFinite(len) || len <= 0 || len > 64) return null;
  return Buffer.from(body.slice(128, 128 + len * 2), "hex").toString("utf8").trim();
};

const main = async () => {
  const names = Object.keys(TOKENS);
  if (!names.length || !RPC) {
    console.error("could not read ERC20_TOKENS or ETH_RPC out of src/config.js");
    process.exit(1);
  }

  /* One request for the lot. Batched `eth_call` is what makes the whole
   * address-watching feature affordable — 400 calls measured at 86ms — so the
   * sweep costs about as much as a single balance refresh. */
  const calls = [];
  names.forEach((sym, i) => {
    calls.push({
      jsonrpc: "2.0", id: i * 2,
      method: "eth_call",
      params: [{ to: TOKENS[sym].address, data: SYMBOL }, "latest"],
    });
    calls.push({
      jsonrpc: "2.0", id: i * 2 + 1,
      method: "eth_call",
      params: [{ to: TOKENS[sym].address, data: DECIMALS }, "latest"],
    });
  });

  const started = Date.now();
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(calls),
  });
  if (!res.ok) {
    console.error(`${RPC} answered ${res.status}`);
    process.exit(1);
  }
  const out = await res.json();
  const byId = new Map((Array.isArray(out) ? out : [out]).map((r) => [r.id, r]));
  const elapsed = Date.now() - started;

  let bad = 0;
  let unanswered = 0;
  names.forEach((sym, i) => {
    const want = TOKENS[sym];
    const s = byId.get(i * 2);
    const d = byId.get(i * 2 + 1);
    const onChainSymbol = decodeSymbol(s && s.result);
    const onChainDecimals = d && d.result ? parseInt(d.result, 16) : null;

    if (onChainSymbol === null && onChainDecimals === null) {
      unanswered++;
      console.log(`  ? ${sym.padEnd(7)} ${want.address}  no answer — retry before believing it`);
      return;
    }
    const symbolOk =
      onChainSymbol !== null &&
      onChainSymbol.toUpperCase().replace(/[^A-Z0-9]/g, "") ===
        sym.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const decimalsOk = onChainDecimals === want.decimals;
    if (symbolOk && decimalsOk) {
      console.log(`  ✔ ${sym.padEnd(7)} ${onChainSymbol} · ${onChainDecimals} decimals`);
      return;
    }
    bad++;
    const why = [];
    if (!symbolOk) why.push(`calls itself ${JSON.stringify(onChainSymbol)}`);
    if (!decimalsOk) why.push(`says ${onChainDecimals} decimals, table says ${want.decimals}`);
    console.error(`  ✘ ${sym.padEnd(7)} ${want.address} — ${why.join("; ")}`);
  });

  console.log(
    `\n${names.length} contracts in one request, ${elapsed}ms` +
      (unanswered ? `, ${unanswered} unanswered` : ""),
  );
  if (bad) {
    console.error(
      `\n✘ ${bad} entr${bad === 1 ? "y does" : "ies do"} not match the chain. ` +
        `Fix the table, not this sweep — a contract is what it says it is.`,
    );
    process.exit(1);
  }
  console.log("✔ every contract answers with its own symbol and decimals");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
