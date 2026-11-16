import fs from "fs";
import os from "os";
import path from "path";
import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { USDC_ADDRESS } from "@/lib/contracts";

export type Payment = {
  from: string;
  amount: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  timestamp: number;
};
type State = { lastBlock: string; payments: Payment[] };

const PAY_TO = (process.env.NEXT_PUBLIC_PAYMENT_ADDRESS ?? "").trim().toLowerCase();
export const paymentWalletSet = /^0x[0-9a-f]{40}$/.test(PAY_TO);

const RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const client: any = createPublicClient({ chain: baseSepolia, transport: http(RPC, { timeout: 20000, retryCount: 2 }) });
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const CHUNK = 10000n;
const MIN_CHUNK = 500n;
const WORKERS = 6;
const MAX_LOOKBACK = 1_500_000n;
const REFRESH_MS = 6000;
const RANGE_ERR = /range|limit|too many|exceed|block.*(size|span)|10000|returned more|response size|timeout|timed out/i;
const FILE = path.join(os.tmpdir(), `yk-payments-${PAY_TO || "none"}.json`);

let state: State | null = null;
let running: Promise<void> | null = null;
let lastRun = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pool<T>(jobs: (() => Promise<T>)[], workers: number) {
  let next = 0;
  const run = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, run));
}

function load(): State {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8")) as State;
    if (s && typeof s.lastBlock === "string" && Array.isArray(s.payments)) return s;
  } catch {}
  return { lastBlock: "", payments: [] };
}
function save(s: State) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(s));
  } catch {}
}

async function sync(s: State) {
  const latest: bigint = await client.getBlockNumber();
  const deploy = process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK;
  const from =
    s.lastBlock !== ""
      ? BigInt(s.lastBlock) + 1n
      : deploy
      ? BigInt(deploy)
      : latest > MAX_LOOKBACK
      ? latest - MAX_LOOKBACK
      : 0n;
  if (from > latest) return;

  const ranges: [bigint, bigint][] = [];
  for (let c = from; c <= latest; c += CHUNK) ranges.push([c, c + CHUNK - 1n > latest ? latest : c + CHUNK - 1n]);

  const found: Payment[] = [];
  let failed = false;
  const scan = async (a: bigint, b: bigint, attempt = 0): Promise<void> => {
    try {
      const logs: any[] = await client.getLogs({
        address: USDC_ADDRESS,
        event: TRANSFER,
        args: { to: PAY_TO as `0x${string}` },
        fromBlock: a,
        toBlock: b,
      });
      for (const l of logs) {
        found.push({
          from: String(l.args.from).toLowerCase(),
          amount: String(l.args.value),
          txHash: String(l.transactionHash),
          logIndex: Number(l.logIndex ?? 0),
          blockNumber: String(l.blockNumber),
          timestamp: 0,
        });
      }
    } catch (e: any) {
      const msg = String(e?.shortMessage || e?.message || e);
      if (RANGE_ERR.test(msg) && b - a + 1n > MIN_CHUNK) {
        const mid = (a + b) / 2n;
        await scan(a, mid);
        await scan(mid + 1n, b);
      } else if (attempt < 2) {
        await sleep(700 * (attempt + 1));
        await scan(a, b, attempt + 1);
      } else {
        failed = true;
      }
    }
  };
  await pool(ranges.map(([a, b]) => () => scan(a, b)), WORKERS);
  if (failed) throw new Error("The RPC did not answer for some block ranges");

  const stamps = new Map<string, number>();
  await pool(
    [...new Set(found.map((p) => p.blockNumber))].map((bn) => async () => {
      try {
        const blk = await client.getBlock({ blockNumber: BigInt(bn) });
        stamps.set(bn, Number(blk.timestamp) * 1000);
      } catch {}
    }),
    8
  );
  for (const p of found) p.timestamp = stamps.get(p.blockNumber) ?? 0;

  const all = new Map<string, Payment>();
  for (const p of s.payments) all.set(`${p.txHash}-${p.logIndex}`, p);
  for (const p of found) all.set(`${p.txHash}-${p.logIndex}`, p);
  s.payments = [...all.values()].sort((a, b) => a.timestamp - b.timestamp);
  s.lastBlock = latest.toString();
  save(s);
}

export async function getPayments(): Promise<Payment[]> {
  if (!paymentWalletSet) return [];
  if (!state) state = load();
  const s = state;
  if (running) {
    await running.catch(() => {});
    return s.payments;
  }
  if (Date.now() - lastRun > REFRESH_MS || s.lastBlock === "") {
    running = sync(s).finally(() => {
      running = null;
      lastRun = Date.now();
    });
    try {
      await running;
    } catch (e) {
      if (s.lastBlock === "") throw e;
    }
  }
  return s.payments;
}