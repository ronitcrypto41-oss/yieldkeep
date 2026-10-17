"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import {
  ADAPTER_ABI,
  ADAPTER_ADDRESS,
  ADDRESSES,
  BASESCAN,
  TREASURY_ABI,
  TREASURY_ADDRESS,
} from "@/lib/contracts";
import { formatUSDC, shortAddress } from "@/lib/format";

export default function StrategiesPage() {
  const { data: adapterAssets } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "totalAssets",
  });

  const { data: adapterPaused } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "paused",
  });

  const { data: simulatedYield } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "simulatedYield",
  });

  const { data: treasuryAssets } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalAssets",
  });

  const paused = adapterPaused === true;

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Strategies</h1>
          <p className="dash-sub">Where your funds are deployed.</p>
        </div>
        <div className="dash-head-right">
          <span className={`badge ${paused ? "badge-red" : ""}`}>
            <span
              className="badge-dot"
              style={{ background: paused ? "#ef4444" : "#22c55e" }}
            />
            {paused ? "Paused" : "Active"}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Aave V3 USDC</h2>
        <p className="fee-note" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 0 }}>
          Deposited USDC is routed to the yield adapter, which supplies it to
          Aave V3 on Base Sepolia. Interest accrues on-chain and is reflected
          in the vault's share price.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Current allocation</h2>
        <div className="row">
          <span>Treasury TVL</span>
          <b>{formatUSDC(treasuryAssets as bigint | undefined)} USDC</b>
        </div>
        <div className="row">
          <span>Adapter total assets</span>
          <b>{formatUSDC(adapterAssets as bigint | undefined)} USDC</b>
        </div>
        <div className="row">
          <span>Simulated yield</span>
          <b>{formatUSDC(simulatedYield as bigint | undefined)} USDC</b>
        </div>
      </div>

      <div className="alert alert-yellow" style={{ marginBottom: 24 }}>
        ⚠ Adapter is a MockAaveYieldAdapter on Base Sepolia. Mainnet deployment
        will use the real Aave V3 Pool.
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Contract addresses</h2>
        <div className="row">
          <span>Treasury</span>
          <a
            href={BASESCAN.address(ADDRESSES.treasury)}
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            {shortAddress(ADDRESSES.treasury)} ↗
          </a>
        </div>
        <div className="row">
          <span>Adapter</span>
          <a
            href={BASESCAN.address(ADDRESSES.adapter)}
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            {shortAddress(ADDRESSES.adapter)} ↗
          </a>
        </div>
        <div className="row">
          <span>USDC</span>
          <a
            href={BASESCAN.address(ADDRESSES.usdc)}
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            {shortAddress(ADDRESSES.usdc)} ↗
          </a>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Risk notes</h2>
        <div className="row">
          <span>Smart contract risk</span>
          <b style={{ fontWeight: 500, color: "var(--text-2)" }}>
            Mitigated via audits & testing
          </b>
        </div>
        <div className="row">
          <span>Protocol risk</span>
          <b style={{ fontWeight: 500, color: "var(--text-2)" }}>
            Aave V3, battle-tested
          </b>
        </div>
        <div className="row">
          <span>Liquidity risk</span>
          <b style={{ fontWeight: 500, color: "var(--text-2)" }}>
            Depends on Aave available liquidity
          </b>
        </div>
        <div className="row">
          <span>Market risk</span>
          <b style={{ fontWeight: 500, color: "var(--text-2)" }}>
            Variable USDC supply rate
          </b>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard" className="btn-ghost">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}