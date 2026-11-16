// frontend/lib/server/indexer.ts
// Server-only: reads the vault events ONCE for everybody and keeps them in memory + a small file.
// Every browser asks /api/events and /api/fees instead of scanning the chain itself.
// V2: big block steps with automatic splitting, progress is saved after every group,
//     and nobody gets an empty answer while the first full scan is still running.

import fs from "fs";
import os from "os";
import path from "path";
import { createPublicClient, http, parseAbiItem, parseEventLogs } from "viem";
import { baseSepolia } from "viem/chains";
import { TREASURY_ABI, TREASURY_ADDRESS } from "@/lib/contracts";

export type IndexedEvent = {
  kind: "deposit" | "withdraw" | "harvest";
  user: string | null;
  assets: string;
  shares: string;
  fee: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  timestamp: number; // ms
};
export type IndexedFee = {
  user: string;
  profit: string;
  fee: string;
  feeShares: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  timestamp: number; // ms
};
type State = { lastBlock: string; events: IndexedEvent[]; fees: IndexedFee[]; complete: boolean };

const RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const client: any = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC, { timeout: 30000, retryCount: 3, retryDelay: 500 }),
});

const FEE_EVENT = parseAbiItem(
  "event FeeSettled(address indexed user, uint256 profit, uint256 feeAssets, uint256 feeShares, uint256 newBasis)"
);
const ABI: any = [...(TREASURY_ABI as any), FEE_EVENT];

const CHUNK = 50000n; // start big; it splits itself if the RPC refuses
const MIN_CHUNK = 500n;
const LOG_WORKERS = 3; // gentle on the public RPC
const GROUP = 6; // steps per group; progress is saved after every group
const BLOCK_WORKERS = 6;
const MAX_LOOKBACK = 1_500_000n;
const REFRESH_MS = 6000; // at most one chain read every 6 seconds, no matter how many people are online
const RETRY_FIRST_MS = 3000; // while the first scan is not finished, retry after 3 seconds
const RANGE_ERR = /range|limit|too many|exceed|block.*(size|span)|10000|returned more|response size|timeout|timed out/i;
const FILE = path.join(os.tmpdir(), `yk-index2-${String(TREASURY_ADDRESS).toLowerCase()}.json`);

let state: State | null = null;
let running: Promise<void> | null = null;
let lastRun = 0;
let ready = false; // true only after one full scan has finished

const isBig = (v: unknown): v is bigint => typeof v === "bigint";
const isAddr = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
function pick(args: Record<string, unknown>, names: string[]): bigint | undefined {
  for (const n of names) if (isBig(args[n])) return args[n] as bigint;
  return undefined;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pool<T>(jobs: (() => Promise<T>)[], workers: number) {
  let next = 0;
  const run = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, run));
}

function parseLog(l: any): IndexedEvent | null {
  const args: Record<string, unknown> = l.args ?? {};
  const nums = Object.values(args).filter(isBig) as bigint[];
  const userArg = isAddr(args.user) ? (args.user as string) : (Object.values(args).find(isAddr) as string | undefined);
  const base = { txHash: String(l.transactionHash), logIndex: Number(l.logIndex ?? 0), blockNumber: String(l.blockNumber), timestamp: 0 };
  const name = String(l.eventName);
  if (name === "Deposit" && userArg) {
    return {
      kind: "deposit",
      user: userArg.toLowerCase(),
      assets: String(pick(args, ["amount", "assets"]) ?? nums[0] ?? 0n),
      shares: String(pick(args, ["sharesMinted", "shares"]) ?? nums[1] ?? 0n),
      fee: "0",
      ...base,
    };
  }
  if (name === "Withdraw" && userArg) {
    return {
      kind: "withdraw",
      user: userArg.toLowerCase(),
      assets: String(pick(args, ["amountReturned", "amount", "assets"]) ?? nums[1] ?? 0n),
      shares: String(pick(args, ["sharesBurned", "shares"]) ?? nums[0] ?? 0n),
      fee: "0",
      ...base,
    };
  }
  if (name === "Harvest") {
    return {
      kind: "harvest",
      user: null,
      assets: String(pick(args, ["amountDeployed", "amount", "assets", "deployed"]) ?? nums[0] ?? 0n),
      shares: "0",
      fee: String(pick(args, ["feePaid", "fee"]) ?? nums[1] ?? 0n),
      ...base,
    };
  }
  return null;
}

function load(): State {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8")) as State;
    if (s && typeof s.lastBlock === "string" && Array.isArray(s.events) && Array.isArray(s.fees)) {
      return { lastBlock: s.lastBlock, events: s.events, fees: s.fees, complete: s.complete === true };
    }
  } catch {
    /* no file yet */
  }
  return { lastBlock: "", events: [], fees: [], complete: false };
}
function save(s: State) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(s));
  } catch {
    /* read-only disk: memory still works */
  }
}

const evKey = (e: { txHash: string; logIndex: number; kind?: string }) => `${e.txHash.toLowerCase()}-${e.logIndex}-${e.kind ?? "fee"}`;
const newestFirst = (a: { blockNumber: string; logIndex: number }, b: { blockNumber: string; logIndex: number }) => {
  const x = BigInt(a.blockNumber);
  const y = BigInt(b.blockNumber);
  return x === y ? b.logIndex - a.logIndex : x > y ? -1 : 1;
};

type Found = { ev: IndexedEvent[]; fe: IndexedFee[] };

/** Reads one block range with ONE call. Splits itself if the RPC says the range is too big. */
async function scanRange(a: bigint, b: bigint, attempt = 0): Promise<Found> {
  try {
    const raw: any[] = await client.getLogs({ address: TREASURY_ADDRESS, fromBlock: a, toBlock: b });
    const logs = parseEventLogs({ abi: ABI, logs: raw, strict: false }) as any[];
    const ev: IndexedEvent[] = [];
    const fe: IndexedFee[] = [];
    for (const l of logs) {
      if (String(l.eventName) === "FeeSettled") {
        fe.push({
          user: String(l.args.user).toLowerCase(),
          profit: String(l.args.profit),
          fee: String(l.args.feeAssets),
          feeShares: String(l.args.feeShares),
          txHash: String(l.transactionHash),
          logIndex: Number(l.logIndex ?? 0),
          blockNumber: String(l.blockNumber),
          timestamp: 0,
        });
      } else {
        const e = parseLog(l);
        if (e) ev.push(e);
      }
    }
    return { ev, fe };
  } catch (e: any) {
    const msg = String(e?.shortMessage || e?.message || e);
    if (RANGE_ERR.test(msg) && b - a + 1n > MIN_CHUNK) {
      const mid = (a + b) / 2n;
      const left = await scanRange(a, mid);
      const right = await scanRange(mid + 1n, b);
      return { ev: [...left.ev, ...right.ev], fe: [...left.fe, ...right.fe] };
    }
    if (attempt < 4) {
      await sleep(1000 * 2 ** attempt); // 1s, 2s, 4s, 8s
      return scanRange(a, b, attempt + 1);
    }
    throw e;
  }
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
  if (from > latest) {
    s.complete = true;
    save(s);
    return;
  }

  const ranges: [bigint, bigint][] = [];
  for (let c = from; c <= latest; c += CHUNK) ranges.push([c, c + CHUNK - 1n > latest ? latest : c + CHUNK - 1n]);
  console.log(`[indexer] reading blocks ${from} to ${latest} (${ranges.length} steps)`);

  for (let i = 0; i < ranges.length; i += GROUP) {
    const slice = ranges.slice(i, i + GROUP);
    const results: Found[] = new Array(slice.length);
    await pool(
      slice.map(([a, b], k) => async () => {
        results[k] = await scanRange(a, b);
      }),
      LOG_WORKERS
    );
    const events = results.flatMap((r) => r.ev);
    const fees = results.flatMap((r) => r.fe);

    // dates for the new events
    const stamps = new Map<string, number>();
    const blocks = [...new Set([...events, ...fees].map((e) => e.blockNumber))];
    await pool(
      blocks.map((bn) => async () => {
        try {
          const blk = await client.getBlock({ blockNumber: BigInt(bn) });
          stamps.set(bn, Number(blk.timestamp) * 1000);
        } catch {
          /* date stays 0 */
        }
      }),
      BLOCK_WORKERS
    );
    for (const e of events) e.timestamp = stamps.get(e.blockNumber) ?? 0;
    for (const e of fees) e.timestamp = stamps.get(e.blockNumber) ?? 0;

    const allEv = new Map<string, IndexedEvent>();
    for (const e of s.events) allEv.set(evKey(e), e);
    for (const e of events) allEv.set(evKey(e), e);
    const allFee = new Map<string, IndexedFee>();
    for (const e of s.fees) allFee.set(evKey(e), e);
    for (const e of fees) allFee.set(evKey(e), e);

    s.events = [...allEv.values()].sort(newestFirst);
    s.fees = [...allFee.values()].sort(newestFirst);
    s.lastBlock = slice[slice.length - 1][1].toString(); // progress saved: a failure later resumes from here
    save(s);
    console.log(`[indexer] up to block ${s.lastBlock} of ${latest}`);
  }
  s.complete = true;
  save(s);
}

/** Returns the shared index, refreshing it from the chain at most once every few seconds. */
export async function getIndex(): Promise<State> {
  if (!state) {
    state = load();
    ready = state.complete;
  }
  const s = state;
  const wait = ready ? REFRESH_MS : RETRY_FIRST_MS;
  if (!running && (Date.now() - lastRun > wait || !ready)) {
    running = sync(s)
      .then(() => {
        ready = true;
      })
      .finally(() => {
        running = null;
        lastRun = Date.now();
      });
  }
  if (running) {
    try {
      await running;
    } catch (e) {
      console.error("[indexer]", e);
      if (!ready) throw e; // first full scan not finished: show a real error, never an empty answer
      /* otherwise keep serving the data we already have */
    }
  }
  return s;
}