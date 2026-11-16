"use client";

// frontend/lib/use-fee.ts
// Everything about the 10% performance fee for ONE treasury (the connected wallet):
//   useFeeInfo(address)   -> the fee that is still open (not yet charged), read live from the vault
//   useFeeEvents(address) -> every fee that was already deducted (FeeSettled events), with date and tx
// Fee history comes from the shared server index (/api/fees), so it opens instantly for everybody.

import { useCallback, useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
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

type RawFee = {
  profit: string;
  fee: string;
  feeShares: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  timestamp: number;
};
const fromRaw = (r: RawFee): FeeEvent => ({
  profit: BigInt(r.profit),
  fee: BigInt(r.fee),
  feeShares: BigInt(r.feeShares),
  txHash: r.txHash as `0x${string}`,
  logIndex: r.logIndex,
  blockNumber: BigInt(r.blockNumber),
  timestamp: r.timestamp || 0,
});

const POLL_MS = 20000;
const cacheKey = (user: string) => `yk_api_fees_v1_${String(TREASURY_ADDRESS).toLowerCase()}_${user}`;
const memory = new Map<string, FeeEvent[]>();
const newestFirst = (a: FeeEvent, b: FeeEvent) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1;

export function useFeeEvents(address?: string) {
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
    if (!user) {
      setFees([]);
      setLoaded(false);
      return;
    }
    const myRun = ++runRef.current;
    const cancelled = () => runRef.current !== myRun;

    // show the saved copy straight away
    let have = memory.get(user);
    if (!have) {
      try {
        const raw = localStorage.getItem(cacheKey(user));
        if (raw) have = (JSON.parse(raw) as RawFee[]).map(fromRaw).sort(newestFirst);
      } catch {
        /* ignore */
      }
      if (have) memory.set(user, have);
    }
    if (have) {
      setFees(have);
      setLoaded(true);
    } else {
      setFees([]);
      setLoaded(false);
    }

    (async () => {
      busy.current = true;
      try {
        const res = await fetch(`/api/fees?user=${user}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Server answered ${res.status}`);
        const j = (await res.json()) as { fees: RawFee[] };
        if (cancelled()) return;
        const list = j.fees.map(fromRaw).sort(newestFirst);
        memory.set(user, list);
        try {
          localStorage.setItem(cacheKey(user), JSON.stringify(j.fees));
        } catch {
          /* ignore */
        }
        setFees(list);
        setLoaded(true);
      } catch {
        if (!cancelled()) setLoaded(true);
      } finally {
        if (!cancelled()) busy.current = false;
      }
    })();

    return () => {
      runRef.current++;
      busy.current = false;
    };
  }, [user, address, tick]);

  return { fees, loaded, refresh };
}