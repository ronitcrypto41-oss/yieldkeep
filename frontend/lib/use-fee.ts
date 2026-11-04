"use client";

// frontend/lib/use-fee.ts
// Everything about the 10% performance fee for ONE treasury (the connected wallet):
//   useFeeInfo(address)   -> the fee that is still open (not yet charged), read live from the vault
//   useFeeEvents(address) -> every fee that was already deducted (FeeSettled events), with date and tx
// Only this wallet's own fee events are read (the event has the wallet as an indexed field),
// so each treasury sees only its own fees. Results are cached in the browser.

import { useCallback, useEffect, useRef, useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { TREASURY_ADDRESS } from "@/lib/contracts";

export const FEE_ABI = [
  {
    type: "function",
    name: "feeInfo",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "value", type: "uint256" },
      { name: "costBasis", type: "uint256" },
      { name: "profit", type: "uint256" },
      { name: "feeDue", type: "uint256" },
      { name: "youKeep", type: "uint256" },
      { name: "nextSettleAt", type: "uint256" },
    ],
  },
  { type: "function", name: "feeRecipient", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "totalFeesPaid", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

/* ------------------------------------------------------------------ */
/* open fee (not yet charged)                                          */
/* ------------------------------------------------------------------ */
export type FeeInfo = {
  value: bigint; // current position value
  profit: bigint; // profit on the open position
  feeDue: bigint; // 10% of that profit, charged on the yearly date or at withdrawal
  nextSettleAt: number; // seconds, 0 = none
};

export function useFeeInfo(address?: string) {
  const q = useReadContract({
    address: TREASURY_ADDRESS,
    abi: FEE_ABI,
    functionName: "feeInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000, retry: false },
  } as any);

  const raw = Array.isArray(q.data) ? (q.data as readonly bigint[]) : undefined;
  const info: FeeInfo | undefined = raw
    ? { value: raw[0], profit: raw[2], feeDue: raw[3], nextSettleAt: Number(raw[5]) }
    : undefined;

  return {
    info, // undefined on an old (V2) vault
    loading: q.isLoading && !info,
    legacy: !info && (q.isError || !q.isLoading), // old vault without feeInfo()
  };
}

/* ------------------------------------------------------------------ */
/* fees already deducted                                               */
/* ------------------------------------------------------------------ */
export type FeeEvent = {
  profit: bigint; // profit the fee was charged on
  fee: bigint; // fee in USDC
  feeShares: bigint;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
  timestamp: number; // ms, 0 = unknown
};

const FEE_EVENT = parseAbiItem(
  "event FeeSettled(address indexed user, uint256 profit, uint256 feeAssets, uint256 feeShares, uint256 newBasis)"
);

const ENV_DEPLOY = process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK;
const MAX_LOOKBACK = 1_500_000n; // ~35 days, used only when the deploy block is unknown
const CHUNK = 10000n;
const MIN_CHUNK = 500n;
const WORKERS = 4;
const TIMEOUT = 15000;
const POLL_MS = 20000;
const RANGE_ERR = /range|limit|too many|exceed|block.*(size|span)|10000|returned more|response size|timeout|timed out/i;

const cacheKey = (user: string) => `yk_fee_events_v1_${String(TREASURY_ADDRESS).toLowerCase()}_${user}`;
type Cache = { lastBlock: bigint; events: FeeEvent[] };
const memory = new Map<string, Cache>();

const evKey = (e: FeeEvent) => `${e.txHash}:${e.logIndex}`;
const newestFirst = (a: FeeEvent, b: FeeEvent) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1;

function loadCache(user: string): Cache | null {
  try {
    const raw = localStorage.getItem(cacheKey(user));
    if (!raw) return null;
    const o = JSON.parse(raw);
    return {
      lastBlock: BigInt(o.lastBlock),
      events: (o.events as any[]).map((e) => ({
        profit: BigInt(e.profit),
        fee: BigInt(e.fee),
        feeShares: BigInt(e.feeShares),
        txHash: e.txHash,
        logIndex: Number(e.logIndex),
        blockNumber: BigInt(e.blockNumber),
        timestamp: Number(e.timestamp) || 0,
      })),
    };
  } catch {
    return null;
  }
}
function saveCache(user: string, c: Cache) {
  try {
    localStorage.setItem(cacheKey(user), JSON.stringify(c, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  } catch {
    /* storage blocked: it will just be read again next time */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("RPC timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}
async function pool<T>(jobs: (() => Promise<T>)[], workers: number) {
  let next = 0;
  const run = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, run));
}

export function useFeeEvents(address?: string) {
  const client = usePublicClient();
  const user = address?.toLowerCase();
  const [fees, setFees] = useState<FeeEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const runRef = useRef(0);
  const busy = useRef(false);

  const refresh = useCallback(() => {
    if (!busy.current) setTick((t) => t + 1);
  }, []);

  // re-read now and then, and right after any transaction made in this browser (a withdraw charges the fee)
  useEffect(() => {
    const id = setInterval(() => {
      if (!busy.current && !document.hidden) setTick((t) => t + 1);
    }, POLL_MS);
    const onActivity = () => {
      setTimeout(() => setTick((t) => t + 1), 2500);
      setTimeout(() => setTick((t) => t + 1), 9000);
    };
    window.addEventListener("yk-activity", onActivity);
    return () => {
      clearInterval(id);
      window.removeEventListener("yk-activity", onActivity);
    };
  }, []);

  useEffect(() => {
    if (!client || !user) {
      setFees([]);
      setLoaded(false);
      return;
    }
    const myRun = ++runRef.current;
    const cancelled = () => runRef.current !== myRun;

    const cached = memory.get(user) ?? loadCache(user);
    if (cached) {
      memory.set(user, cached);
      setFees([...cached.events].sort(newestFirst));
      setLoaded(true);
    } else {
      setFees([]);
      setLoaded(false);
    }

    (async () => {
      busy.current = true;
      try {
        const latest = (await withTimeout(client.getBlockNumber(), TIMEOUT)) as bigint;
        const lowest = cached
          ? cached.lastBlock + 1n
          : ENV_DEPLOY
          ? BigInt(ENV_DEPLOY)
          : latest > MAX_LOOKBACK
          ? latest - MAX_LOOKBACK
          : 0n;
        if (lowest > latest) {
          if (!cancelled()) setLoaded(true);
          return;
        }

        const ranges: [bigint, bigint][] = [];
        for (let c = lowest; c <= latest; c += CHUNK) ranges.push([c, c + CHUNK - 1n > latest ? latest : c + CHUNK - 1n]);

        let failed = false;
        const found: FeeEvent[] = [];
        const scan = async (a: bigint, b: bigint, attempt = 0): Promise<void> => {
          try {
            const logs: any[] = await withTimeout(
              client.getLogs({ address: TREASURY_ADDRESS, event: FEE_EVENT, args: { user: address as `0x${string}` }, fromBlock: a, toBlock: b } as any),
              TIMEOUT
            );
            for (const l of logs) {
              found.push({
                profit: l.args.profit as bigint,
                fee: l.args.feeAssets as bigint,
                feeShares: l.args.feeShares as bigint,
                txHash: l.transactionHash,
                logIndex: Number(l.logIndex ?? 0),
                blockNumber: l.blockNumber as bigint,
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
        if (cancelled()) return;

        // dates for the new fee events
        const stamps = new Map<string, number>();
        await pool(
          [...new Set(found.map((e) => e.blockNumber.toString()))].map((bn) => async () => {
            try {
              const blk = await client.getBlock({ blockNumber: BigInt(bn) });
              stamps.set(bn, Number(blk.timestamp) * 1000);
            } catch {
              /* date stays unknown */
            }
          }),
          WORKERS
        );
        for (const e of found) e.timestamp = stamps.get(e.blockNumber.toString()) ?? 0;

        const all = new Map<string, FeeEvent>();
        for (const e of cached?.events ?? []) all.set(evKey(e), e);
        for (const e of found) all.set(evKey(e), e);
        const list = [...all.values()].sort(newestFirst);

        if (cancelled()) return;
        setFees(list);
        setLoaded(true);
        if (!failed) {
          const next = { lastBlock: latest, events: list };
          memory.set(user, next);
          saveCache(user, next);
        }
      } catch {
        if (!cancelled()) setLoaded(true);
      } finally {
        if (!cancelled()) busy.current = false;
      }
    })();

    return () => {
      runRef.current++; // cancels this run
      busy.current = false;
    };
  }, [client, user, address, tick]);

  return { fees, loaded, refresh };
}