// frontend/scripts/settle-keeper.mjs
//
// YieldKeep keeper: finds every treasury whose yearly fee date has passed and calls settle(treasury).
// Anyone can call settle(), so this key does NOT need to be the owner. Use a separate wallet with a little gas.
//
// SAFE MODE (default): only LISTS the treasuries, sends nothing.
//   node --env-file=../.env scripts/settle-keeper.mjs
// SEND MODE: really sends the settle transactions.
//   node --env-file=../.env scripts/settle-keeper.mjs --send
//
// Run it from the "frontend" folder. It reads PRIVATE_KEY from the root .env (only needed for --send).

import { createPublicClient, createWalletClient, http, fallback, parseAbi, parseAbiItem, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// ─── settings ───────────────────────────────────────────────
const VAULT = "0xC064A4E028E77803fA86125b44a4491061c131c2";
const DEPLOY_BLOCK = 54777286n; // first block of the vault
// Several free RPC addresses: if one refuses a request, the next one is tried.
// (Optional: put your own in .env as KEEPER_RPC_URL and it is tried first.)
const RPCS = [
  process.env.KEEPER_RPC_URL,
  "https://base-sepolia-rpc.publicnode.com",
  "https://sepolia.base.org",
].filter(Boolean);
const transport = () => fallback(RPCS.map((u) => http(u, { retryCount: 2, timeout: 20_000 })));
const CHUNK = 2000n; // blocks per log request (free RPCs limit this)
const SEND = process.argv.includes("--send");

const vaultAbi = parseAbi([
  "function shares(address) view returns (uint256)",
  "function nextFeeAt(address) view returns (uint256)",
  "function feeRecipient() view returns (address)",
  "function feeInfo(address) view returns (uint256 value, uint256 costBasis, uint256 profit, uint256 feeDue, uint256 youKeep, uint256 nextSettleAt)",
  "function settle(address user)",
]);
const depositEvent = parseAbiItem(
  "event Deposit(address indexed user, uint256 amount, uint256 sharesMinted)"
);

const usdc = (v) => Number(formatUnits(v, 6)).toFixed(4);
const day = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 10);

async function main() {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: transport() });

  // 1) every wallet that ever deposited (read from Deposit events)
  const latest = await publicClient.getBlockNumber();
  const users = new Set();
  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await publicClient.getLogs({ address: VAULT, event: depositEvent, fromBlock: from, toBlock: to });
    for (const l of logs) users.add(l.args.user);
  }
  console.log(`Vault ${VAULT}`);
  console.log(`Treasuries that ever deposited: ${users.size}\n`);

  const feeWallet = await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "feeRecipient" });
  const block = await publicClient.getBlock();
  const now = block.timestamp;

  // 2) which ones are due
  const due = [];
  for (const user of users) {
    if (user.toLowerCase() === feeWallet.toLowerCase()) continue; // the fee wallet is never charged
    const sh = await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "shares", args: [user] });
    if (sh === 0n) continue; // no open position
    const info = await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "feeInfo", args: [user] });
    const [value, , profit, feeDue, , nextAt] = info;
    const isDue = now >= nextAt;
    console.log(
      `${user}  value ${usdc(value)}  profit ${usdc(profit)}  fee ${usdc(feeDue)}  next ${day(nextAt)}  ${isDue ? "DUE" : "not due"}`
    );
    if (isDue) due.push({ user, feeDue });
  }

  if (due.length === 0) {
    console.log("\nNo treasury is due. Nothing to do.");
    return;
  }
  console.log(`\n${due.length} treasury(ies) due.`);
  if (!SEND) {
    console.log("SAFE MODE: nothing sent. Add --send to settle them.");
    return;
  }

  // 3) send settle() for each due treasury
  let pk = (process.env.PRIVATE_KEY || "").trim();
  if (!pk) throw new Error("PRIVATE_KEY is missing in the .env file");
  if (!pk.startsWith("0x")) pk = "0x" + pk;
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: transport() });
  console.log(`Sending from ${account.address}\n`);

  for (const { user } of due) {
    try {
      const { request } = await publicClient.simulateContract({
        address: VAULT, abi: vaultAbi, functionName: "settle", args: [user], account,
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`settled ${user}  ${receipt.status}  https://sepolia.basescan.org/tx/${hash}`);
    } catch (e) {
      console.log(`FAILED ${user}: ${e.shortMessage || e.message}`);
    }
  }
}

main().catch((e) => {
  console.error("Keeper error:", e.shortMessage || e.message);
  const why = e.details || e.cause?.details || e.cause?.message;
  if (why) console.error("Reason:", why);
  process.exit(1);
});