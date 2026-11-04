"use client";

// frontend/lib/use-merged-events.ts
// Chain events (cached, shared) + the wallet's own instant local records (activity-store).
// A transaction shows up the moment it confirms, and the chain version replaces it later.

import { useEffect, useMemo, useState } from "react";
import { useVaultEvents, eventKey, sortEvents, type VaultEvent } from "@/lib/use-vault-events";
import { readLocalActivity } from "@/lib/activity-store";

export function useMergedEvents(address?: string) {
  const chain = useVaultEvents();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("yk-activity", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("yk-activity", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const events = useMemo(() => {
    const map = new Map<string, VaultEvent>();
    for (const e of chain.events) map.set(eventKey(e), e);
    if (address) {
      for (const l of readLocalActivity(address)) {
        let assets = 0n;
        let shares = 0n;
        let block = 0n;
        try {
          assets = BigInt(l.assets || "0");
          shares = BigInt(l.shares || "0");
          block = BigInt(l.blockNumber || "0");
        } catch {}
        const ev: VaultEvent = {
          kind: l.kind,
          user: l.kind === "harvest" ? null : address.toLowerCase(),
          assets,
          shares,
          fee: 0n,
          txHash: l.txHash as `0x${string}`,
          logIndex: 0,
          blockNumber: block,
          timestamp: l.timestamp,
        };
        const k = eventKey(ev);
        if (!map.has(k)) map.set(k, ev); // the chain copy always wins
      }
    }
    return [...map.values()].sort(sortEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain.events, address, tick]);

  return { ...chain, events };
}