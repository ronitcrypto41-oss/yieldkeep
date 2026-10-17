"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useVaultData } from "../../hooks/useVaultData";import {
  computePosition,
  formatShares,
  formatSharePrice,
  formatUSDC,
} from "@/lib/format";

export default function PortfolioPage() {
  const { isConnected } = useAccount();
  const {
    totalAssets,
    totalShares,
    userShares,
    walletBalance,
    idleUSDC,
    adapterAssets,
    isLoading,
  } = useVaultData();

  const position = computePosition(userShares, totalAssets, totalShares);
  const sharePrice = formatSharePrice(totalAssets, totalShares);
  const hasPosition = !!userShares && userShares > 0n;

  // Percentage of vault: userShares / totalShares
  let vaultPct = "—";
  if (userShares && totalShares && totalShares > 0n) {
    const pct = (Number(userShares) / Number(totalShares)) * 100;
    vaultPct = `${pct.toFixed(4)}%`;
  }

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Portfolio</h1>
          <p className="dash-sub">
            Your holdings and allocation inside the YieldKeep vault.
          </p>
        </div>
      </div>

      {!isConnected ? (
        <div className="card">
          <p className="empty">Connect your wallet to see your portfolio.</p>
        </div>
      ) : isLoading ? (
        <div className="card">
          <p className="empty">Loading…</p>
        </div>
      ) : !hasPosition ? (
        <div className="card">
          <p className="empty">No deposit yet.</p>
          <Link href="/deposit" className="btn-primary">
            Deposit
          </Link>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Position value</div>
              <div className="stat-value">
                {position !== null ? `${formatUSDC(position)} USDC` : "—"}
              </div>
              <div className="stat-sub">Current redeemable value</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Your shares</div>
              <div className="stat-value">{formatShares(userShares)}</div>
              <div className="stat-sub">Vault share tokens</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Share price</div>
              <div className="stat-value">{sharePrice}</div>
              <div className="stat-sub">USDC per share</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Share of vault</div>
              <div className="stat-value">{vaultPct}</div>
              <div className="stat-sub">% of total supply</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h2 className="card-title">Allocation</h2>
            <div className="position-rows">
              <Row label="Idle USDC in vault" value={`${formatUSDC(idleUSDC)} USDC`} />
              <Row label="USDC in Aave V3" value={`${formatUSDC(adapterAssets)} USDC`} />
              <Row
                label="Total assets under management"
                value={`${formatUSDC(totalAssets)} USDC`}
              />
            </div>
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h2 className="card-title">Wallet</h2>
            <div className="position-rows">
              <Row
                label="USDC in wallet"
                value={`${formatUSDC(walletBalance)} USDC`}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}