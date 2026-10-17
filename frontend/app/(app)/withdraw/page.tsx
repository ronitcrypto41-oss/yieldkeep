"use client";

import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  TREASURY_ABI,
  TREASURY_ADDRESS,
  BASESCAN,
} from "@/lib/contracts";
import { formatUSDC } from "@/lib/format";

export default function WithdrawPage() {
  const { address, isConnected } = useAccount();

  const { data: userShares, refetch: refetchShares } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "shares",
    args: address ? [address] : undefined,
  });

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

  let position: bigint | null = null;
  if (userShares && totalAssets && totalShares && (totalShares as bigint) > 0n) {
    position =
      ((userShares as bigint) * (totalAssets as bigint)) /
      (totalShares as bigint);
  } else if (userShares === 0n) {
    position = 0n;
  }

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash });

  if (confirmed) {
    refetchShares();
  }

  const hasPosition = !!userShares && (userShares as bigint) > 0n;

  const onWithdraw = () => {
    writeContract({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "withdraw",
      args: [],
    });
  };

  const buttonLabel = (() => {
    if (!isConnected) return "Connect Wallet";
    if (!hasPosition) return "Nothing to withdraw";
    if (isPending || confirming) return "Withdrawing…";
    return "Withdraw All";
  })();

  if (confirmed && hash) {
    return (
      <div className="dashboard">
        <div className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
          <div className="connect-modal-icon" style={{ margin: "0 auto 20px" }}>
            ✓
          </div>
          <h2 className="dash-title" style={{ textAlign: "center" }}>
            Withdrawal confirmed
          </h2>
          <p className="dash-sub" style={{ textAlign: "center" }}>
            USDC returned to your wallet.
          </p>
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <a
              href={BASESCAN.tx(hash)}
              target="_blank"
              rel="noreferrer"
              className="contract-link"
            >
              View on BaseScan ↗
            </a>
          </div>
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <Link href="/dashboard" className="btn-primary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Withdraw</h1>
          <p className="dash-sub">
            Withdraw your full position from the YieldKeep vault.
          </p>
        </div>
      </div>

      <div className="deposit-grid">
        <div className="card">
          <div className="row">
            <span>Your shares</span>
            <b>{formatUSDC(userShares as bigint | undefined)}</b>
          </div>
          <div className="row">
            <span>Current value</span>
            <b>{position !== null ? `${formatUSDC(position)} USDC` : "—"}</b>
          </div>

          <div className="alert alert-yellow" style={{ marginTop: 20 }}>
            This vault withdraws your entire position in one transaction.
          </div>

          <button
            className="btn-primary"
            style={{ width: "100%", marginTop: 20, padding: "14px" }}
            disabled={!isConnected || !hasPosition || isPending || confirming}
            onClick={onWithdraw}
          >
            {buttonLabel}
          </button>

          <p className="fee-note" style={{ marginTop: 16 }}>
            Withdrawals depend on available Aave liquidity.
          </p>
        </div>

        <div className="deposit-side">
          <div className="card">
            <h2 className="card-title">How withdrawals work</h2>
            <div className="row">
              <span>Redemption</span>
              <b>Full position</b>
            </div>
            <div className="row">
              <span>Settlement</span>
              <b>Instant</b>
            </div>
            <div className="row">
              <span>Fee</span>
              <b>None</b>
            </div>
            <p className="fee-note" style={{ marginTop: 16 }}>
              Your ykUSDC shares are burned and the equivalent USDC is returned
              to your wallet. Withdrawals depend on available Aave liquidity.
            </p>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 className="card-title">Position summary</h2>
            <div className="row">
              <span>Your shares</span>
              <b>{formatUSDC(userShares as bigint | undefined)}</b>
            </div>
            <div className="row">
              <span>Current value</span>
              <b>{position !== null ? `${formatUSDC(position)} USDC` : "—"}</b>
            </div>
            <div className="row">
              <span>Vault TVL</span>
              <b>{formatUSDC(totalAssets as bigint | undefined)} USDC</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}