"use client";

// frontend/lib/use-pnl-history.ts
// Net PnL history for ONE wallet, as a true profit/loss line (deposits and withdrawals do not
// move it, only yield does).
//   1) Past points: for every deposit, withdrawal and harvest we read the vault's totalAssets and
//      totalShares AT THAT BLOCK, so the line shows how your PnL really moved at each harvest.
//   2) Live points: while the dashboard is open, a new point is saved whenever your PnL changes.
// If the RPC cannot serve old blocks, step 1 is skipped and the line is built from step 2.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { TREASURY_ABI, TREASURY_ADDRESS } from "@/lib/contracts";
import type { VaultEvent } from "@/lib/use-vault-events";

export type PnlPoint = { t: number; v: number; kind?: "deposit" | "withdraw" | "harvest" };

const LIVE_KEY = (vault: string, addr: string) => `yk-pnl-v1:${vault.toLowerCase()}:${addr.toLowerCase()}`;
const PX_KEY = (vault: string) => `yk-px-v1:${vault.toLowerCase()}`;
const MAX_POINTS = 3000;
const HEARTBEAT_MS = 15 * 60 * 1000;
const SETTLE_MS = 4000;
const MAX_EVENTS = 80; // newest events used for the history reconstruction

const valid = (s: any): s is PnlPoint => s && Number.isFinite(s.t) && Number.isFinite(s.v);
const toNum = (v: bigint) => Number(v) / 1e6;

type Px = { ta: bigint; ts: bigint };
const pxMemory = new Map<string, Px>();

function loadPx(vault: string) {
  try {
    const raw = localStorage.getItem(PX_KEY(vault));
    const obj = raw ? JSON.parse(raw) : {};
    for (const k of Object.keys(obj)) pxMemory.set(k, { ta: BigInt(obj[k][0]), ts: BigInt(obj[k][1]) });
  } catch {
    /* ignore */
  }
}
function savePx(vault: string) {
  try {
    const obj: Record<string, [string, string]> = {};
    for (const [k, v] of pxMemory) obj[k] = [v.ta.toString(), v.ts.toString()];
    localStorage.setItem(PX_KEY(vault), JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

export function usePnlHistory(
  vault: string,
  address: string | undefined,
  pnl: number | undefined,
  events: VaultEvent[],
  ready: boolean
) {
  const client = usePublicClient();
  const me = address?.toLowerCase();
  const [live, setLive] = useState<PnlPoint[]>([]);
  const [past, setPast] = useState<PnlPoint[]>([]);
  const [loadedFor, setLoadedFor] = useState("");
  const ref = useRef<PnlPoint[]>([]);

  /* ----- saved live points ----- */
  useEffect(() => {
    if (!address) {
      ref.current = [];
      setLive([]);
      setLoadedFor("");
      return;
    }
    let arr: PnlPoint[] = [];
    try {
      const raw = localStorage.getItem(LIVE_KEY(vault, address));
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) arr = parsed.filter(valid).sort((a, b) => a.t - b.t);
    } catch {
      /* storage blocked */
    }
    ref.current = arr;
    setLive(arr);
    setLoadedFor(address.toLowerCase());
  }, [vault, address]);

  /* ----- record a live point once the value has settled ----- */
  const rounded = pnl === undefined ? undefined : Math.round(pnl * 1e6) / 1e6;
  useEffect(() => {
    if (!address || !ready || rounded === undefined) return;
    if (loadedFor !== address.toLowerCase()) return;
    const id = setTimeout(() => {
      const arr = ref.current.slice();
      const last = arr[arr.length - 1];
      const now = Date.now();
      if (last && Math.abs(last.v - rounded) <= 1e-6 && now - last.t <= HEARTBEAT_MS) return;
      arr.push({ t: now, v: rounded });
      const next = arr.length > MAX_POINTS ? arr.slice(arr.length - MAX_POINTS) : arr;
      ref.current = next;
      setLive(next);
      try {
        localStorage.setItem(LIVE_KEY(vault, address), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }, SETTLE_MS);
    return () => clearTimeout(id);
  }, [vault, address, rounded, ready, loadedFor]);

  /* ----- rebuild the past from the vault state at each event block ----- */
  const sig = useMemo(
    () => (me ? events.filter((e) => e.kind === "harvest" || e.user === me).map((e) => `${e.txHash}${e.kind}`).join("|") : ""),
    [events, me]
  );
  useEffect(() => {
    if (!me || !client || !sig) {
      setPast([]);
      return;
    }
    let dead = false;
    (async () => {
      if (pxMemory.size === 0) loadPx(vault);
      const asc = events
        .filter((e) => e.kind === "harvest" || e.user === me)
        .slice()
        .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
      // replay ALL of this wallet's events for the share balance, but only read prices for the newest ones
      const need = asc.filter((e) => e.timestamp > 0).slice(-MAX_EVENTS);
      const needBlocks = Array.from(new Set(need.map((e) => e.blockNumber.toString())));
      let broken = false;
      let wrote = false;
      for (let i = 0; i < needBlocks.length && !broken && !dead; i += 4) {
        await Promise.all(
          needBlocks.slice(i, i + 4).map(async (b) => {
            if (pxMemory.has(b)) return;
            try {
              const bn = BigInt(b);
              const [ta, ts] = await Promise.all([
                client.readContract({ address: vault as `0x${string}`, abi: TREASURY_ABI, functionName: "totalAssets", blockNumber: bn } as any),
                client.readContract({ address: vault as `0x${string}`, abi: TREASURY_ABI, functionName: "totalShares", blockNumber: bn } as any),
              ]);
              pxMemory.set(b, { ta: ta as bigint, ts: ts as bigint });
              wrote = true;
            } catch {
              broken = true; // RPC cannot read old blocks
            }
          })
        );
      }
      if (wrote) savePx(vault);
      if (dead) return;
      if (broken && needBlocks.every((b) => !pxMemory.has(b))) {
        setPast([]);
        return;
      }
      let shares = 0n, dep = 0n, wd = 0n;
      const out: PnlPoint[] = [];
      for (const e of asc) {
        if (e.kind === "deposit") {
          shares += e.shares;
          dep += e.assets;
        } else if (e.kind === "withdraw") {
          shares -= e.shares;
          wd += e.assets;
        }
        const px = pxMemory.get(e.blockNumber.toString());
        if (!e.timestamp || !px || px.ts === 0n) continue;
        const value = shares > 0n ? (shares * px.ta) / px.ts : 0n;
        out.push({ t: e.timestamp, v: toNum(value + wd - dep), kind: e.kind });
      }
      if (!dead) setPast(out);
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, me, client, vault]);

  const points = useMemo(() => {
    const all = [...past, ...live].sort((a, b) => a.t - b.t);
    // drop a live point that sits on top of an event point at nearly the same time
    return all.filter((p, i) => !(i > 0 && !p.kind && all[i - 1].kind && p.t - all[i - 1].t < 30000 && Math.abs(p.v - all[i - 1].v) < 1e-6));
  }, [past, live]);

  return { points };
}