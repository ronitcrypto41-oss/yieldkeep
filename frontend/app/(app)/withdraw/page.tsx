"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { TREASURY_ABI, TREASURY_ADDRESS, BASESCAN } from "@/lib/contracts";
import { formatUSDC } from "@/lib/format";
import { recordActivity } from "@/lib/activity-store";
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";

export default function WithdrawPage() {
  const { address, isConnected } = useAccount();

  const { data: userShares, refetch: refetchShares } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "shares",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: totalAssets, refetch: refetchAssets } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalAssets",
  });
  const { data: totalShares } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalShares",
  });

  const sh = typeof userShares === "bigint" ? userShares : undefined;
  const ta = typeof totalAssets === "bigint" ? totalAssets : undefined;
  const ts = typeof totalShares === "bigint" ? totalShares : undefined;

  const position: bigint | undefined =
    sh === 0n ? 0n : sh !== undefined && ta !== undefined && ts !== undefined && ts > 0n ? (sh * ta) / ts : undefined;
  const hasPosition = sh !== undefined && sh > 0n;

  const { data: hash, writeContract, isPending, error: writeError, reset } = useWriteContract();
  const { data: receipt, isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  // remember what was withdrawn at click time, so Activity records it instantly
  const snap = useRef<{ shares: bigint; assets: bigint }>({ shares: 0n, assets: 0n });

  useEffect(() => {
    if (confirmed) {
      refetchShares();
      refetchAssets();
    }
  }, [confirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (confirmed && hash && address && receipt) {
      recordActivity(address, {
        kind: "withdraw",
        assets: snap.current.assets.toString(),
        shares: snap.current.shares.toString(),
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        timestamp: Date.now(),
      });
    }
  }, [confirmed, hash, address, receipt]);

  const onWithdraw = () => {
    snap.current = { shares: sh ?? 0n, assets: position ?? 0n };
    writeContract({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "withdraw",
      args: [],
    } as any);
  };

  const busy = isPending || confirming;
  const buttonLabel = !isConnected
    ? "Connect wallet"
    : !hasPosition
    ? "Nothing to withdraw"
    : isPending
    ? "Confirm in wallet…"
    : confirming
    ? "Confirming on-chain…"
    : "Withdraw full position";

  const errText = writeError
    ? /rejected|denied/i.test(writeError.message)
      ? "Transaction was rejected in the wallet."
      : (writeError as any).shortMessage || "The withdrawal failed. Check available liquidity and try again."
    : null;

  if (confirmed && hash) {
    return (
      <div className="dashboard">
        <div className="card" style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
          <div className="connect-modal-icon" style={{ margin: "0 auto 20px" }}>✓</div>
          <h2 className="dash-title">Withdrawal confirmed</h2>
          <p className="dash-sub">
            {formatUSDC(snap.current.assets)} USDC returned to {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "your wallet"}.
          </p>
          <div style={{ marginTop: 20 }}>
            <a href={BASESCAN.tx(hash)} target="_blank" rel="noreferrer" className="contract-link">
              View on BaseScan ↗
            </a>
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: "center" }}>
            <Link href="/dashboard" prefetch className="btn-primary" onClick={() => reset()}>
              Treasury report
            </Link>
            <Link href="/activity" prefetch className="btn-ghost">
              View activity
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
          <p className="dash-sub">Redeem your treasury's full position from the YieldKeep vault in one transaction.</p>
        </div>
      </div>

      <div className="deposit-grid">
        <div className="card">
          <div className="row">
            <span>Shares held</span>
            <b className="num">{formatUSDC(sh)}</b>
          </div>
          <div className="row">
            <span>
              Redeemable value
              {USES_MOCK_ADAPTER && <span className="simulated-tag">Simulated</span>}
            </span>
            <b className="num">{position !== undefined ? `${formatUSDC(position)} USDC` : "—"}</b>
          </div>

          <div className="alert alert-warn" style={{ marginTop: 20 }}>
            This vault redeems the entire position in one transaction. Partial withdrawals are not supported.
          </div>

          {errText && (
            <div className="alert alert-red" style={{ marginTop: 12 }}>
              {errText}
            </div>
          )}

          <button
            className="btn-primary btn-block"
            style={{ width: "100%", marginTop: 20, padding: "14px" }}
            disabled={!isConnected || !hasPosition || busy}
            onClick={onWithdraw}
          >
            {buttonLabel}
          </button>

          <p className="fee-note" style={{ marginTop: 16 }}>
            Withdrawals depend on available Aave liquidity. The 10% performance fee applies only to recorded yield; there
            is no withdrawal fee.
          </p>
        </div>

        <div className="deposit-side">
          <div className="card">
            <h2 className="card-title">For treasury signers</h2>
            <div className="row"><span>Redemption</span><b>Full position</b></div>
            <div className="row"><span>Settlement</span><b>Single transaction</b></div>
            <div className="row"><span>Withdrawal fee</span><b>None</b></div>
            <div className="row"><span>Recipient</span><b>The depositing wallet</b></div>
            <p className="fee-note" style={{ marginTop: 16 }}>
              Funds return to the same address that deposited. Multisig treasuries should execute this call from the
              multisig that holds the position. Your vault shares are burned and the equivalent USDC is returned.
            </p>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 className="card-title">Position summary</h2>
            <div className="row"><span>Shares held</span><b className="num">{formatUSDC(sh)}</b></div>
            <div className="row">
              <span>Redeemable value</span>
              <b className="num">{position !== undefined ? `${formatUSDC(position)} USDC` : "—"}</b>
            </div>
            <div className="row"><span>Vault TVL</span><b className="num">{formatUSDC(ta)} USDC</b></div>
            <Link href="/dashboard" prefetch className="contract-link" style={{ display: "inline-block", marginTop: 8 }}>
              View PnL report →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}