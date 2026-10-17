"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import {
  BASESCAN,
  TREASURY_ABI,
  TREASURY_ADDRESS,
} from "@/lib/contracts";
import { formatUSDC, shortAddress } from "@/lib/format";

type ActivityItem = {
  kind: "deposit" | "withdraw" | "harvest";
  assets: bigint;
  shares: bigint;
  txHash: `0x${string}`;
  blockNumber: bigint;
};

const CHUNK = 190n;       // under the 200-block RPC cap
const LOOKBACK = 5000n;   // last ~5000 blocks

export default function ActivityPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "deposit" | "withdraw" | "harvest">("all");

  useEffect(() => {
    if (!publicClient || !address) {
      setItems(null);
      return;
    }

    const client = publicClient;
    const user = address;
    let cancelled = false;

    (async () => {
      try {
        const latest = await client.getBlockNumber();
        const from = latest > LOOKBACK ? latest - LOOKBACK : 0n;

        console.log(`[activity] scanning blocks ${from} → ${latest} in chunks of ${CHUNK}`);

        const ranges: { from: bigint; to: bigint }[] = [];
        let cursor = from;
        while (cursor <= latest) {
          const to = cursor + CHUNK - 1n > latest ? latest : cursor + CHUNK - 1n;
          ranges.push({ from: cursor, to });
          cursor = to + 1n;
        }

        console.log(`[activity] ${ranges.length} ranges to scan`);

        const allDeposits: any[] = [];
        const allWithdraws: any[] = [];
        const allHarvests: any[] = [];

        for (let i = 0; i < ranges.length; i++) {
          const r = ranges[i];
          try {
            const [d, w, h] = await Promise.all([
              client.getContractEvents({
                address: TREASURY_ADDRESS,
                abi: TREASURY_ABI,
                eventName: "Deposit",
                args: { user },
                fromBlock: r.from,
                toBlock: r.to,
              }),
              client.getContractEvents({
                address: TREASURY_ADDRESS,
                abi: TREASURY_ABI,
                eventName: "Withdraw",
                args: { user },
                fromBlock: r.from,
                toBlock: r.to,
              }),
              client.getContractEvents({
                address: TREASURY_ADDRESS,
                abi: TREASURY_ABI,
                eventName: "Harvest",
                fromBlock: r.from,
                toBlock: r.to,
              }),
            ]);
            allDeposits.push(...d);
            allWithdraws.push(...w);
            allHarvests.push(...h);
          } catch (innerErr: any) {
            console.warn(`[activity] chunk ${r.from}-${r.to} failed:`, innerErr?.shortMessage || innerErr?.message);
          }
        }

        console.log(`[activity] found: deposits=${allDeposits.length} withdraws=${allWithdraws.length} harvests=${allHarvests.length}`);

        const merged: ActivityItem[] = [];

        for (const d of allDeposits) {
          const args = d.args as { amount?: bigint; sharesMinted?: bigint };
          if (args.amount === undefined || args.sharesMinted === undefined) continue;
          merged.push({
            kind: "deposit",
            assets: args.amount,
            shares: args.sharesMinted,
            txHash: d.transactionHash,
            blockNumber: d.blockNumber,
          });
        }
        for (const w of allWithdraws) {
          const args = w.args as { sharesBurned?: bigint; amountReturned?: bigint };
          if (args.amountReturned === undefined || args.sharesBurned === undefined) continue;
          merged.push({
            kind: "withdraw",
            assets: args.amountReturned,
            shares: args.sharesBurned,
            txHash: w.transactionHash,
            blockNumber: w.blockNumber,
          });
        }
        for (const h of allHarvests) {
          const args = h.args as { amountDeployed?: bigint };
          if (args.amountDeployed === undefined) continue;
          merged.push({
            kind: "harvest",
            assets: args.amountDeployed,
            shares: 0n,
            txHash: h.transactionHash,
            blockNumber: h.blockNumber,
          });
        }

        merged.sort((a, b) => Number(b.blockNumber - a.blockNumber));
        if (!cancelled) setItems(merged);
      } catch (err: any) {
        console.error("[activity] fatal:", err);
        if (!cancelled) {
          setError(err?.shortMessage || err?.message || "Failed to load activity");
          setItems([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

  const filtered =
    items?.filter((i) => filter === "all" || i.kind === filter) ?? null;

  const label = (k: ActivityItem["kind"]) =>
    k === "deposit" ? "Deposited" : k === "withdraw" ? "Withdrawn" : "Harvested";
  const icon = (k: ActivityItem["kind"]) =>
    k === "deposit" ? "↧" : k === "withdraw" ? "↥" : "✦";
  const color = (k: ActivityItem["kind"]) =>
    k === "deposit" ? "#22c55e" : k === "withdraw" ? "#f59e0b" : "#60a5fa";

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Activity</h1>
          <p className="dash-sub">
            Your on-chain history · last {LOOKBACK.toString()} blocks
          </p>
        </div>
      </div>

      {isConnected && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {(["all", "deposit", "withdraw", "harvest"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? "btn-primary" : "btn-ghost"}
              style={{ padding: "8px 16px", fontSize: 13 }}
              type="button"
            >
              {f === "all" ? "All" : f === "deposit" ? "Deposits" : f === "withdraw" ? "Withdrawals" : "Harvests"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="alert alert-red" style={{ marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {!isConnected ? (
        <div className="card">
          <p className="empty">Connect your wallet to see your activity.</p>
        </div>
      ) : items === null ? (
        <div className="card">
          <p className="empty">Loading…</p>
        </div>
      ) : filtered && filtered.length === 0 ? (
        <div className="card">
          <p className="empty">
            No activity in the last {LOOKBACK.toString()} blocks.
          </p>
          <p className="fee-note">
            If you deposited earlier, try increasing LOOKBACK in the file, or
            make a new deposit to confirm events are being emitted.
          </p>
          <Link href="/deposit" className="btn-primary">
            Go to Deposit →
          </Link>
        </div>
      ) : (
        <div className="card">
          {filtered!.map((item, i) => (
            <div
              key={`${item.txHash}-${i}`}
              className="row"
              style={{ padding: "14px 0" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    fontSize: 18,
                    color: color(item.kind),
                    width: 22,
                    textAlign: "center",
                  }}
                >
                  {icon(item.kind)}
                </span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>
                    {label(item.kind)} {formatUSDC(item.assets)} USDC
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}
                  >
                    {item.kind !== "harvest" && (
                      <>{formatUSDC(item.shares)} shares · </>
                    )}
                    block {item.blockNumber.toString()}
                  </div>
                </div>
              </div>
              <a
                href={BASESCAN.tx(item.txHash)}
                target="_blank"
                rel="noreferrer"
                className="contract-link"
              >
                {shortAddress(item.txHash)} ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}