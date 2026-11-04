"use client";

// frontend/lib/use-vault-events.ts
// One shared, cached reader for ALL vault events (Deposit / Withdraw / Harvest).
// Dashboard (treasuries table, PnL) and Activity both use it, so the chain is read once
// and every page opens instantly from memory / localStorage.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { TREASURY_ABI, TREASURY_ADDRESS } from "@/lib/contracts";

export type VaultKind = "deposit" | "withdraw" | "harvest";
export type VaultEvent = {
  kind: VaultKind;
  user: string | null; // lower-case address, null for harvest
  assets: bigint;
  shares: bigint;
  fee: bigint; // performance fee paid (harvest only)
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
  timestamp: number; // ms, 0 = not fetched yet
};

// Optional: NEXT_PUBLIC_VAULT_DEPLOY_BLOCK in .env.local = exact first block of the vault.
const ENV_DEPLOY = process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK;
const MAX_LOOKBACK = 1_500_000n; // ~35 days on Base, used only when the deploy block is unknown
const CHUNK = 10000n;
const MIN_CHUNK = 500n;
const LOG_WORKERS = 4;
const BLOCK_WORKERS = 8;
const CALL_TIMEOUT = 15000;
const POLL_MS = 15000;
const RANGE_ERR = /range|limit|too many|exceed|block.*(size|span)|10000|returned more|response size|timeout|timed out/i;
const CACHE_KEY = `yk_vault_events_v2_${String(TREASURY_ADDRESS).toLowerCase()}`;

type Cache = { lastBlock: bigint; events: VaultEvent[] };
let memory: Cache | null = null; // survives page changes inside the app

/* ---------- helpers ---------- */
const isBig = (v: unknown): v is bigint => typeof v === "bigint";
const isAddr = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
function pick(args: Record<string, unknown>, names: string[]): bigint | undefined {
  for (const n of names) if (isBig(args[n])) return args[n] as bigint;
  return undefined;
}

function parseLog(l: any): VaultEvent | null {
  const args: Record<string, unknown> = l.args ?? {};
  const nums = Object.values(args).filter(isBig) as bigint[];
  const userArg = isAddr(args.user) ? (args.user as string) : (Object.values(args).find(isAddr) as string | undefined);
  const base = {
    txHash: l.transactionHash as `0x${string}`,
    logIndex: Number(l.logIndex ?? 0),
    blockNumber: l.blockNumber as bigint,
    timestamp: 0,
  };
  const name = String(l.eventName);
  if (name === "Deposit" && userArg) {
    return { kind: "deposit", user: userArg.toLowerCase(), assets: pick(args, ["amount", "assets"]) ?? nums[0] ?? 0n, shares: pick(args, ["sharesMinted", "shares"]) ?? nums[1] ?? 0n, fee: 0n, ...base };
  }
  if (name === "Withdraw" && userArg) {
    return { kind: "withdraw", user: userArg.toLowerCase(), assets: pick(args, ["amountReturned", "amount", "assets"]) ?? nums[1] ?? 0n, shares: pick(args, ["sharesBurned", "shares"]) ?? nums[0] ?? 0n, fee: 0n, ...base };
  }
  if (name === "Harvest") {
    return { kind: "harvest", user: null, assets: pick(args, ["amountDeployed", "amount", "assets", "deployed"]) ?? nums[0] ?? 0n, shares: 0n, fee: pick(args, ["feePaid", "fee"]) ?? nums[1] ?? 0n, ...base };
  }
  return null;
}

export const eventKey = (e: { txHash: string; kind: string }) => `${e.txHash.toLowerCase()}-${e.kind}`;
export const sortEvents = (a: VaultEvent, b: VaultEvent) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1;

function loadCache(): Cache | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    memory = {
      lastBlock: BigInt(p.lastBlock),
      events: p.events.map((e: any) => ({ ...e, assets: BigInt(e.assets), shares: BigInt(e.shares), fee: BigInt(e.fee ?? 0), blockNumber: BigInt(e.blockNumber) })),
    };
    return memory;
  } catch {
    return null;
  }
}
function saveCache(c: Cache) {
  memory = c;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  } catch {}
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

/* ---------- the hook ---------- */
export function useVaultEvents() {
  const client = usePublicClient();
  const [events, setEvents] = useState<VaultEvent[]>(() => memory?.events ?? []);
  const [loaded, setLoaded] = useState<boolean>(!!memory);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updated, setUpdated] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const runRef = useRef(0);
  const syncingRef = useRef(false);

  const refresh = useCallback(() => {
    if (!syncingRef.current) setTick((t) => t + 1);
  }, []);

  // poll for new blocks
  useEffect(() => {
    const id = setInterval(() => {
      if (!syncingRef.current && !document.hidden) setTick((t) => t + 1);
    }, POLL_MS);
    const onVisible = () => !document.hidden && !syncingRef.current && setTick((t) => t + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!client) return;
    const cached = loadCache();
    if (cached) {
      setEvents((p) => (p.length ? p : cached.events));
      setLoaded(true);
    }

    const myRun = ++runRef.current;
    const cancelled = () => runRef.current !== myRun;
    const all = new Map<string, VaultEvent>();
    for (const e of cached?.events ?? []) all.set(eventKey(e), e);

    (async () => {
      syncingRef.current = true;
      const firstScan = !cached;
      if (firstScan) setSyncing(true);
      try {
        setError(null);
        if (firstScan) setProgress(2);
        const latest = await withTimeout(client.getBlockNumber(), CALL_TIMEOUT);
        let failed = false;
        let lastErr = "";

        const scan = async (a: bigint, b: bigint, out: VaultEvent[], attempt = 0): Promise<void> => {
          try {
            const logs: any[] = await withTimeout(
              client.getContractEvents({ address: TREASURY_ADDRESS, abi: TREASURY_ABI, fromBlock: a, toBlock: b } as any),
              CALL_TIMEOUT
            );
            for (const l of logs) {
              const ev = parseLog(l);
              if (ev) out.push(ev);
            }
          } catch (e: any) {
            const msg = String(e?.shortMessage || e?.message || e);
            lastErr = msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
            if (RANGE_ERR.test(msg) && b - a + 1n > MIN_CHUNK) {
              const mid = (a + b) / 2n;
              await scan(a, mid, out);
              await scan(mid + 1n, b, out);
            } else if (attempt < 2) {
              await sleep(700 * (attempt + 1));
              await scan(a, b, out, attempt + 1);
            } else {
              failed = true;
            }
          }
        };

        const absorb = async (fresh: VaultEvent[]) => {
          const need = [...new Set(fresh.filter((e) => !e.timestamp).map((e) => e.blockNumber))];
          const ts = new Map<string, number>();
          await pool(
            need.map((bn) => async () => {
              try {
                const blk = await client.getBlock({ blockNumber: bn });
                ts.set(bn.toString(), Number(blk.timestamp) * 1000);
              } catch {}
            }),
            BLOCK_WORKERS
          );
          for (const e of fresh) {
            if (!e.timestamp) e.timestamp = ts.get(e.blockNumber.toString()) ?? 0;
            all.set(eventKey(e), e);
          }
          if (!cancelled()) {
            setEvents([...all.values()].sort(sortEvents));
            setLoaded(true);
          }
        };
        const snapshot = () => [...all.values()].sort(sortEvents);

        if (cached) {
          // quick mode: only blocks added since last time
          const from = cached.lastBlock + 1n;
          if (from <= latest) {
            const ranges: [bigint, bigint][] = [];
            for (let c = from; c <= latest; c += CHUNK) ranges.push([c, c + CHUNK - 1n > latest ? latest : c + CHUNK - 1n]);
            const fresh: VaultEvent[] = [];
            await pool(ranges.map(([a, b]) => () => scan(a, b, fresh)), LOG_WORKERS);
            if (cancelled()) return;
            await absorb(fresh);
            if (!failed) saveCache({ lastBlock: latest, events: snapshot() });
          }
        } else {
          // first load: newest blocks first, results appear as they arrive
          const lowest = ENV_DEPLOY ? BigInt(ENV_DEPLOY) : latest > MAX_LOOKBACK ? latest - MAX_LOOKBACK : 0n;
          const span = latest - lowest + 1n;
          let hi = latest;
          let reachedStart = false;

          while (hi >= lowest && !cancelled()) {
            const ranges: [bigint, bigint][] = [];
            for (let k = 0; k < LOG_WORKERS && hi >= lowest; k++) {
              const lo = hi - CHUNK + 1n < lowest ? lowest : hi - CHUNK + 1n;
              ranges.push([lo, hi]);
              hi = lo - 1n;
            }
            const fresh: VaultEvent[] = [];
            await pool(ranges.map(([a, b]) => () => scan(a, b, fresh)), LOG_WORKERS);
            if (cancelled()) return;
            await absorb(fresh);
            setProgress(Math.min(99, Number(((latest - hi) * 100n) / span)));

            if (!ENV_DEPLOY) {
              try {
                const code = await client.getCode({ address: TREASURY_ADDRESS, blockNumber: ranges[ranges.length - 1][0] });
                if (!code || code === "0x") {
                  reachedStart = true;
                  break;
                }
              } catch {
                /* historical state unavailable: keep scanning to the lookback limit */
              }
            }
          }
          if (cancelled()) return;
          setEvents(snapshot());
          setLoaded(true);
          if (!failed) saveCache({ lastBlock: latest, events: snapshot() });
          if (failed) setWarning(`The RPC did not answer for some block ranges (${lastErr || "unknown error"}). The newest data is shown; press Refresh to retry.`);
          else if (!ENV_DEPLOY && !reachedStart)
            setWarning("Showing roughly the last 35 days. Set NEXT_PUBLIC_VAULT_DEPLOY_BLOCK in .env.local to load the full history.");
          else setWarning(null);
        }
        if (!cancelled()) setUpdated(Date.now());
      } catch (e: any) {
        if (!cancelled()) {
          setError(e?.shortMessage || e?.message || "Failed to read vault events");
          setLoaded(true);
        }
      } finally {
        if (!cancelled()) {
          syncingRef.current = false;
          setSyncing(false);
          setProgress(100);
        }
      }
    })();

    return () => {
      runRef.current++; // cancels this run
      syncingRef.current = false;
    };
  }, [client, tick]);

  return { events, loaded, syncing, progress, updated, warning, error, refresh };
}