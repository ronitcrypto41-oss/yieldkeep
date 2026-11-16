"use client";

// frontend/lib/use-vault-events.ts
// Vault events (Deposit / Withdraw / Harvest) for the whole app.
// The server reads the chain ONCE for everybody (/api/events); this hook only downloads the result,
// keeps a copy in the browser so pages open instantly, and refreshes every few seconds.
// useVaultEvents(user) gets only that wallet's events (plus vault harvests); without user it gets all.

import { useCallback, useEffect, useRef, useState } from "react";

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

const POLL_MS = 15000;

export const eventKey = (e: { txHash: string; kind: string }) => `${e.txHash.toLowerCase()}-${e.kind}`;
export const sortEvents = (a: VaultEvent, b: VaultEvent) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1;

type Raw = {
  kind: VaultKind;
  user: string | null;
  assets: string;
  shares: string;
  fee: string;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  timestamp: number;
};
const fromRaw = (r: Raw): VaultEvent => ({
  kind: r.kind,
  user: r.user,
  assets: BigInt(r.assets),
  shares: BigInt(r.shares),
  fee: BigInt(r.fee ?? "0"),
  txHash: r.txHash as `0x${string}`,
  logIndex: r.logIndex,
  blockNumber: BigInt(r.blockNumber),
  timestamp: r.timestamp || 0,
});

const memory = new Map<string, VaultEvent[]>();
const cacheKey = (user?: string) => `yk_api_events_v1_${user ? user.toLowerCase() : "all"}`;

function readLocal(user?: string): VaultEvent[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(user));
    if (!raw) return null;
    return (JSON.parse(raw) as Raw[]).map(fromRaw);
  } catch {
    return null;
  }
}
function writeLocal(user: string | undefined, raws: Raw[]) {
  try {
    localStorage.setItem(cacheKey(user), JSON.stringify(raws));
  } catch {
    /* storage full or blocked: just skip */
  }
}

export function useVaultEvents(user?: string) {
  const key = user ? user.toLowerCase() : "all";
  const [events, setEvents] = useState<VaultEvent[]>(() => memory.get(key) ?? []);
  const [loaded, setLoaded] = useState<boolean>(() => memory.has(key));
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updated, setUpdated] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const busy = useRef(false);
  const runRef = useRef(0);

  const refresh = useCallback(() => {
    if (!busy.current) setTick((t) => t + 1);
  }, []);

  // poll for new data, and refresh right after a transaction made in this browser
  useEffect(() => {
    const id = setInterval(() => {
      if (!busy.current && !document.hidden) setTick((t) => t + 1);
    }, POLL_MS);
    const onVisible = () => !document.hidden && !busy.current && setTick((t) => t + 1);
    const onActivity = () => {
      setTimeout(() => setTick((t) => t + 1), 2500);
      setTimeout(() => setTick((t) => t + 1), 9000);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("yk-activity", onActivity);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("yk-activity", onActivity);
    };
  }, []);

  useEffect(() => {
    const myRun = ++runRef.current;
    const cancelled = () => runRef.current !== myRun;

    // show the saved copy straight away
    let have = memory.get(key);
    if (!have) {
      const local = readLocal(user);
      if (local) {
        memory.set(key, local);
        have = local;
      }
    }
    if (have) {
      setEvents(have);
      setLoaded(true);
    }

    (async () => {
      busy.current = true;
      if (!have) {
        setSyncing(true);
        setProgress(40);
      }
      try {
        setError(null);
        const res = await fetch(`/api/events${user ? `?user=${key}` : ""}`, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || `Server answered ${res.status}`);
        }
        const j = (await res.json()) as { events: Raw[] };
        if (cancelled()) return;
        const list = j.events.map(fromRaw).sort(sortEvents);
        memory.set(key, list);
        writeLocal(user, j.events);
        setEvents(list);
        setLoaded(true);
        setWarning(null);
        setUpdated(Date.now());
      } catch (e: any) {
        if (!cancelled()) {
          setError(e?.message || "Failed to load vault events");
          setLoaded(true);
        }
      } finally {
        if (!cancelled()) {
          busy.current = false;
          setSyncing(false);
          setProgress(100);
        }
      }
    })();

    return () => {
      runRef.current++;
      busy.current = false;
    };
  }, [key, user, tick]);

  return { events, loaded, syncing, progress, updated, warning, error, refresh };
}