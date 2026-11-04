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
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";

const RISKS: [string, string][] = [
  ["Smart contract risk", "Contracts are unaudited testnet code. An independent audit is required before any mainnet deployment."],
  ["Protocol risk", "On mainnet, funds would be supplied to Aave V3 and depend on its security and governance."],
  ["Liquidity risk", "Withdrawals depend on available liquidity in the underlying Aave market."],
  ["Rate risk", "The USDC supply rate is variable and can fall to near zero. Past rates do not predict future rates."],
  ["Stablecoin risk", "USDC can lose its peg or be subject to issuer actions."],
  ["Operational risk", "Harvest is a manual transaction; funds stay idle in the vault until it is executed."],
];

export default function StrategiesPage() {
  const { data: adapterAssets } = useReadContract({ address: ADAPTER_ADDRESS, abi: ADAPTER_ABI, functionName: "totalAssets" });
  const { data: adapterPaused } = useReadContract({ address: ADAPTER_ADDRESS, abi: ADAPTER_ABI, functionName: "paused" });
  const { data: simulatedYield } = useReadContract({ address: ADAPTER_ADDRESS, abi: ADAPTER_ABI, functionName: "simulatedYield" });
  const { data: treasuryAssets } = useReadContract({ address: TREASURY_ADDRESS, abi: TREASURY_ABI, functionName: "totalAssets" });
  const { data: idleAssets } = useReadContract({ address: TREASURY_ADDRESS, abi: TREASURY_ABI, functionName: "idleAssets" });

  const paused = adapterPaused === true;
  const ta = typeof treasuryAssets === "bigint" ? treasuryAssets : undefined;
  const aa = typeof adapterAssets === "bigint" ? adapterAssets : undefined;
  const idle = typeof idleAssets === "bigint" ? idleAssets : undefined;
  const deployedPct =
    ta !== undefined && aa !== undefined && ta > 0n ? `${(Number((aa * 10000n) / ta) / 100).toFixed(2)}%` : "—";

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Strategy</h1>
          <p className="dash-sub">How treasury USDC is deployed, what it is exposed to, and what it costs.</p>
        </div>
        <div className="dash-head-right">
          <span className={`badge ${paused ? "badge-red" : ""}`}>
            <span className="badge-dot" style={{ background: paused ? "#ef4444" : "#22c55e" }} />
            {paused ? "Adapter paused" : "Adapter active"}
          </span>
        </div>
      </div>

      {USES_MOCK_ADAPTER && (
        <div className="alert alert-warn" style={{ marginBottom: 24 }}>
          ⚠ Testnet demo. The adapter is a MockAaveYieldAdapter, so yield shown here is simulated. A mainnet version
          would use the real Aave V3 Pool and requires an independent audit first.
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Aave V3 · USDC supply</h2>
        <p className="fee-note" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 0 }}>
          A single, conservative strategy: USDC is supplied to Aave V3 through a yield adapter and nothing else. There
          is no leverage, no looping and no rehypothecation by the vault. Yield accrues in the vault share price. Every
          deposit, harvest and withdrawal is an on-chain event that can be reconciled against BaseScan.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Current allocation</h2>
        <div className="row"><span>Vault TVL</span><b className="num">{formatUSDC(ta)} USDC</b></div>
        <div className="row"><span>Deployed in adapter</span><b className="num">{formatUSDC(aa)} USDC</b></div>
        <div className="row"><span>Idle in vault (awaiting harvest)</span><b className="num">{formatUSDC(idle)} USDC</b></div>
        <div className="row"><span>Share of TVL deployed</span><b className="num">{deployedPct}</b></div>
        <div className="row">
          <span>
            Simulated yield
            {USES_MOCK_ADAPTER && <span className="simulated-tag">Simulated</span>}
          </span>
          <b className="num">{formatUSDC(typeof simulatedYield === "bigint" ? simulatedYield : undefined)} USDC</b>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Fees</h2>
        <div className="row"><span>Management fee</span><b>0%</b></div>
        <div className="row"><span>Performance fee</span><b>10% of recorded yield</b></div>
        <div className="row"><span>Deposit / withdrawal fee</span><b>None</b></div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Risk disclosure</h2>
        {RISKS.map(([k, v]) => (
          <div className="row" key={k} style={{ alignItems: "flex-start", gap: 16 }}>
            <span style={{ minWidth: 150 }}>{k}</span>
            <span style={{ fontWeight: 500, color: "var(--text-2)", textAlign: "right", fontSize: 13 }}>{v}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Contract addresses</h2>
        {(
          [
            ["Vault", ADDRESSES.treasury],
            ["Adapter", ADDRESSES.adapter],
            ["USDC", ADDRESSES.usdc],
          ] as const
        ).map(([label, addr]) => (
          <div className="row" key={label}>
            <span>{label}</span>
            <a href={BASESCAN.address(addr)} target="_blank" rel="noreferrer" className="contract-link">
              {shortAddress(addr)} ↗
            </a>
          </div>
        ))}
      </div>

      <Link href="/dashboard" prefetch className="btn-ghost">
        ← Back to overview
      </Link>
    </div>
  );
}