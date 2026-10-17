"use client";

import { useReadContract } from "wagmi";
import {
  TREASURY_ABI,
  TREASURY_ADDRESS,
  ADAPTER_ABI,
  ADAPTER_ADDRESS,
} from "@/lib/contracts";
import { formatSharePrice, formatUSDC } from "@/lib/format";

export default function AnalyticsPage() {
  const { data: totalAssets } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalAssets",
  });
  const { data: totalShares } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalShares",
  });
  const { data: adapterAssets } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "totalAssets",
  });

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Analytics</h1>
          <p className="dash-sub">
            Current on-chain metrics. Historical charts require an indexer.
          </p>
        </div>
      </div>

      <div className="alert alert-yellow">
        Historical charts (TVL over time, share price chart, deposit volume)
        require an off-chain indexer that is not yet deployed for Base Sepolia.
        Numbers below are live, current values.
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Protocol TVL</div>
          <div className="stat-value">
            {formatUSDC(totalAssets as bigint | undefined)} USDC
          </div>
          <div className="stat-sub">Current total assets</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Share price</div>
          <div className="stat-value">
            {formatSharePrice(
              totalAssets as bigint | undefined,
              totalShares as bigint | undefined
            )}
          </div>
          <div className="stat-sub">USDC per share</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Deployed in Aave</div>
          <div className="stat-value">
            {formatUSDC(adapterAssets as bigint | undefined)} USDC
          </div>
          <div className="stat-sub">Adapter totalAssets()</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total shares</div>
          <div className="stat-value">
            {totalShares !== undefined
              ? Number(totalShares) / 1e6
              : "—"}
          </div>
          <div className="stat-sub">Vault share supply</div>
        </div>
      </div>
    </div>
  );
}