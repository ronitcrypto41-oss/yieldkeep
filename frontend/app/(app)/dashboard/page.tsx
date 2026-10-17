"use client";

import Link from "next/link";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  ADAPTER_ABI,
  ADAPTER_ADDRESS,
  ADDRESSES,
  BASESCAN,
  TREASURY_ABI,
  TREASURY_ADDRESS,
} from "@/lib/contracts";
import { formatUSDC, formatSharePrice, shortAddress } from "@/lib/format";
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";

export default function DashboardPage() {
  const { data: totalAssets, isLoading: l1, refetch: refetchTotalAssets } =
    useReadContract({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "totalAssets",
    });
  const { data: totalShares, isLoading: l2 } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalShares",
  });
  const { data: idleAssets, refetch: refetchIdle } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "idleAssets",
  });
  const { data: adapterAssets, isLoading: l5 } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "totalAssets",
  });
  const { data: adapterPaused } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "paused",
  });

  const isLoading = l1 || l2 || l5;

  const {
    data: harvestHash,
    writeContract: writeHarvest,
    isPending: isHarvesting,
  } = useWriteContract();
  const { isLoading: harvestConfirming, isSuccess: harvestConfirmed } =
    useWaitForTransactionReceipt({ hash: harvestHash });

  if (harvestConfirmed) {
    refetchTotalAssets();
    refetchIdle();
  }

  const onHarvest = () => {
    writeHarvest({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "harvest",
      gas: 1500000n,
    });
  };

  const sharePrice = formatSharePrice(
    totalAssets as bigint | undefined,
    totalShares as bigint | undefined
  );

  const hasIdle = idleAssets !== undefined && idleAssets > 0n;
  const harvestLabel =
    isHarvesting || harvestConfirming ? "Harvesting…" : "Harvest now →";

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">YieldKeep USDC Prime</h1>
          <p className="dash-sub">
            Non-custodial USDC vault. Deposits route to Aave V3 on Base Sepolia.
          </p>
        </div>
      </div>

      {adapterPaused && (
        <div className="alert alert-red">
          ⚠ Adapter is paused. Deposits and withdrawals are halted on-chain.
        </div>
      )}

      {hasIdle && (
        <div className="card harvest-card" style={{ marginBottom: 24 }}>
          <div className="harvest-inner">
            <div>
              <div className="harvest-label">IDLE USDC IN VAULT</div>
              <div className="harvest-value">
                {formatUSDC(idleAssets as bigint | undefined)} USDC
              </div>
              <div className="harvest-note">
                Route these funds into Aave V3 to start earning yield.
              </div>
            </div>
            <button
              className="btn-primary"
              style={{ padding: "12px 24px" }}
              disabled={isHarvesting || harvestConfirming}
              onClick={onHarvest}
            >
              {harvestLabel}
            </button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Your position</div>
          <div className="stat-value">—</div>
          <div className="stat-sub">Connect to view</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Yield earned
            {USES_MOCK_ADAPTER && <span className="simulated-tag">Simulated</span>}
          </div>
          <div className="stat-value">—</div>
          <div className="stat-sub">Not yet computed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Share price
            {USES_MOCK_ADAPTER && <span className="simulated-tag">Simulated</span>}
          </div>
          <div className="stat-value">{isLoading ? "…" : sharePrice}</div>
          <div className="stat-sub">1 share = X USDC</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Protocol TVL</div>
          <div className="stat-value">
            {isLoading
              ? "…"
              : `${formatUSDC(totalAssets as bigint | undefined)} USDC`}
          </div>
          <div className="stat-sub">Total under management</div>
        </div>
      </div>

      <div className="dash-row">
        <div className="card">
          <h2 className="card-title">Your position</h2>
          <p className="empty">Connect your wallet to see your position.</p>
          <Link href="/deposit" className="btn-primary">
            Deposit
          </Link>
        </div>

        <div className="card">
          <h2 className="card-title">How fees work</h2>
          <div className="row">
            <span>Management fee</span>
            <b>0%</b>
          </div>
          <div className="row">
            <span>Performance fee</span>
            <b>10% of yield</b>
          </div>
          <p className="fee-note">You only pay when you earn.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Contracts</h2>
        <div className="row">
          <span>Vault</span>
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
        <p className="fee-note">
          Verify every address on BaseScan before depositing.
        </p>
      </div>
    </div>
  );
}