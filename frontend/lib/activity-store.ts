// frontend/lib/activity-store.ts
// Instant local record of the user's own transactions.
// The Activity page merges these with what it reads from the chain,
// so a deposit / withdraw / harvest shows up the moment it confirms.
// Records are kept PER VAULT, so switching to a new vault never mixes in old transactions.

import { TREASURY_ADDRESS } from "@/lib/contracts";

export type StoredActivity = {
  kind: "deposit" | "withdraw" | "harvest";
  assets: string; // bigint as string
  shares: string; // bigint as string
  txHash: string;
  blockNumber: string; // bigint as string
  timestamp: number; // ms
};

const keyFor = (address: string) =>
  `yk_local_activity_v2_${String(TREASURY_ADDRESS).toLowerCase()}_${address.toLowerCase()}`;

export function readLocalActivity(address?: string): StoredActivity[] {
  if (!address || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(address));
    return raw ? (JSON.parse(raw) as StoredActivity[]) : [];
  } catch {
    return [];
  }
}

export function recordActivity(address: string, entry: StoredActivity) {
  if (typeof window === "undefined") return;
  try {
    const all = readLocalActivity(address).filter(
      (e) => !(e.txHash.toLowerCase() === entry.txHash.toLowerCase() && e.kind === entry.kind)
    );
    all.push(entry);
    window.localStorage.setItem(keyFor(address), JSON.stringify(all));
    window.dispatchEvent(new Event("yk-activity"));
  } catch {
    /* storage unavailable: the chain scan will still find it */
  }
}