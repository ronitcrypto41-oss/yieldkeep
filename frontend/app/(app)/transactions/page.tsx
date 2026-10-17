"use client";

import { useAccount, usePublicClient } from "wagmi";
import { useEffect, useState } from "react";
import { parseAbiItem, formatUnits } from "viem";
import {
  CHAIN_ID,
  TREASURY_ADDRESS,
  USDC_ADDRESS,
  BASESCAN,
} from "@/lib/contracts";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

type TxRow = {
  hash: string;
  direction: "in" | "out";
  amount: string;
  counterparty: string;
  blockNumber: bigint;
};

export default function TransactionsPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!publicClient || !address) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);

        // Scan the last ~50,000 blocks (~27h on Base). Expand if needed.
        const current = await publicClient.getBlockNumber();
        const fromBlock = current > 50_000n ? current - 50_000n : 0n;

        const [inbound, outbound] = await Promise.all([
          publicClient.getLogs({
            address: USDC_ADDRESS,
            event: TRANSFER_EVENT,
            args: { to: TREASURY_ADDRESS },
            fromBlock,
            toBlock: current,
          }),
          publicClient.getLogs({
            address: USDC_ADDRESS,
            event: TRANSFER_EVENT,
            args: { from: TREASURY_ADDRESS },
            fromBlock,
            toBlock: current,
          }),
        ]);

        if (cancelled) return;

        const combined: TxRow[] = [
          ...inbound
            .filter((l) => l.args.from?.toLowerCase() === address.toLowerCase())
            .map((l) => ({
              hash: l.transactionHash,
              direction: "in" as const,
              amount: formatUnits(l.args.value ?? 0n, 6),
              counterparty: TREASURY_ADDRESS,
              blockNumber: l.blockNumber ?? 0n,
            })),
          ...outbound
            .filter((l) => l.args.to?.toLowerCase() === address.toLowerCase())
            .map((l) => ({
              hash: l.transactionHash,
              direction: "out" as const,
              amount: formatUnits(l.args.value ?? 0n, 6),
              counterparty: TREASURY_ADDRESS,
              blockNumber: l.blockNumber ?? 0n,
            })),
        ].sort((a, b) =>
          Number(b.blockNumber - a.blockNumber)
        );

        setRows(combined);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Transactions</h1>
          <p className="dash-sub">
            Your USDC deposits and withdrawals on Base Sepolia.
          </p>
        </div>
      </div>

      {!isConnected ? (
        <div className="card">
          <p className="empty">Connect your wallet to see transactions.</p>
        </div>
      ) : loading ? (
        <div className="card">
          <p className="empty">Loading transactions…</p>
        </div>
      ) : error ? (
        <div className="card">
          <p className="empty">Error: {error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <p className="empty">No transactions yet.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Recent USDC movements</h2>
            <span className="fee-note">Last ~27h on Base</span>
          </div>
          <table className="activity-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Block</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hash + r.direction}>
                  <td>{r.direction === "in" ? "Deposit" : "Withdraw"}</td>
                  <td>
                    {r.direction === "in" ? "+" : "-"}
                    {Number(r.amount).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    USDC
                  </td>
                  <td style={{ color: "var(--muted)" }}>
                    #{r.blockNumber.toString()}
                  </td>
                  <td>
                    <a
                      href={BASESCAN.tx(r.hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="contract-link"
                    >
                      {r.hash.slice(0, 8)}… ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}