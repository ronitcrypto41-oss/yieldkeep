"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { parseUnits, formatUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { TREASURY_ABI, TREASURY_ADDRESS, BASESCAN } from "@/lib/contracts";
import { formatUSDC } from "@/lib/format";
import { recordActivity } from "@/lib/activity-store";
import { useFeeInfo } from "@/lib/use-fee";
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";

// A partial amount this close to the whole position (0.00001 USDC) counts as "everything".
const EDGE = 10n;

export default function WithdrawPage() {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<"part" | "all">("part");
  const [amount, setAmount] = useState("");

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
  const { info } = useFeeInfo(address);

  const sh = typeof userShares === "bigint" ? userShares : undefined;
  const ta = typeof totalAssets === "bigint" ? totalAssets : undefined;
  const ts = typeof totalShares === "bigint" ? totalShares : undefined;

  const position: bigint | undefined =
    sh === 0n ? 0n : sh !== undefined && ta !== undefined && ts !== undefined && ts > 0n ? (sh * ta) / ts : undefined;
  const hasPosition = sh !== undefined && sh > 0n;

  // the 10% fee on the open profit is always taken first, then you receive the rest
  const feeDue = info?.feeDue ?? 0n;
  const value = info?.value ?? position ?? 0n;
  const youKeep = value > feeDue ? value - feeDue : 0n; // what you can take out in total
  const maxPartial = youKeep > EDGE ? youKeep - EDGE : 0n;

  let parsed = 0n;
  try {
    if (amount && amount !== ".") parsed = parseUnits(amount, 6);
  } catch {
    parsed = 0n;
  }
  const tooMuch = parsed > maxPartial;
  const remaining = youKeep > parsed ? youKeep - parsed : 0n;

  const { data: hash, writeContract, isPending, error: writeError, reset } = useWriteContract();
  const { data: receipt, isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  // remember what was withdrawn at click time, so Activity records it instantly
  const snap = useRef<{ shares: bigint; assets: bigint; full: boolean }>({ shares: 0n, assets: 0n, full: true });

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

  const onAmountChange = (raw: string) => {
    let v = raw.replace(/[^0-9.]/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1, firstDot + 7); // max 6 decimals (USDC)
    }
    reset();
    setAmount(v);
  };

  const onWithdrawAll = () => {
    snap.current = { shares: sh ?? 0n, assets: youKeep, full: true };
    writeContract({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "withdraw",
      args: [],
    } as any);
  };

  const onWithdrawPart = () => {
    if (parsed === 0n || tooMuch) return;
    const burned = position && position > 0n && sh ? (sh * parsed) / position : 0n;
    snap.current = { shares: burned, assets: parsed, full: false };
    writeContract({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "withdrawAmount",
      args: [parsed],
    } as any);
  };

  const busy = isPending || confirming;
  const waitLabel = isPending ? "Confirm in wallet…" : "Confirming on-chain…";

  const allLabel = !isConnected ? "Connect wallet" : !hasPosition ? "Nothing to withdraw" : busy ? waitLabel : "Withdraw full position";
  const partLabel = !isConnected
    ? "Connect wallet"
    : !hasPosition
    ? "Nothing to withdraw"
    : busy
    ? waitLabel
    : !amount || parsed === 0n
    ? "Enter an amount"
    : tooMuch
    ? "Amount too high"
    : "Withdraw this amount";

  const errText = writeError
    ? /rejected|denied/i.test(writeError.message)
      ? "Transaction was rejected in the wallet."
      : (writeError as any).shortMessage || "The withdrawal failed. Check the amount and try again."
    : null;

  if (confirmed && hash) {
    return (
      <div className="dashboard">
        <div className="card" style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
          <div className="connect-modal-icon" style={{ margin: "0 auto 20px" }}>✓</div>
          <h2 className="dash-title">{snap.current.full ? "Withdrawal confirmed" : "Partial withdrawal confirmed"}</h2>
          <p className="dash-sub">
            {formatUSDC(snap.current.assets)} USDC returned to {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "your wallet"}.
            {!snap.current.full && " The rest of your position stays invested."}
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
          <p className="dash-sub">Take out part of your treasury's position, or all of it, from the YieldKeep vault.</p>
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
              Position value
              {USES_MOCK_ADAPTER && <span className="simulated-tag">Simulated</span>}
            </span>
            <b className="num">{position !== undefined ? `${formatUSDC(position)} USDC` : "—"}</b>
          </div>
          <div className="row">
            <span>Performance fee taken now (10% of open profit)</span>
            <b className="num">{formatUSDC(feeDue)} USDC</b>
          </div>
          <div className="row">
            <span>You can take out in total</span>
            <b className="num">{hasPosition ? `${formatUSDC(youKeep)} USDC` : "—"}</b>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button
              type="button"
              className={mode === "part" ? "btn-primary" : "btn-ghost"}
              style={{ flex: 1, padding: "10px" }}
              onClick={() => { reset(); setMode("part"); }}
            >
              Withdraw part
            </button>
            <button
              type="button"
              className={mode === "all" ? "btn-primary" : "btn-ghost"}
              style={{ flex: 1, padding: "10px" }}
              onClick={() => { reset(); setMode("all"); }}
            >
              Withdraw all
            </button>
          </div>

          {mode === "part" ? (
            <>
              <div className="row" style={{ marginTop: 16 }}>
                <span>Amount</span>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { reset(); setAmount(formatUnits(maxPartial, 6)); }}
                  disabled={!isConnected || !hasPosition || maxPartial === 0n}
                  style={{ padding: "4px 10px", fontSize: 11 }}
                >
                  MAX
                </button>
              </div>
              <input
                className="amount-input num"
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                aria-label="Amount of USDC to withdraw"
              />

              <div className="position-rows" style={{ marginTop: 20 }}>
                <div className="row">
                  <span>You receive</span>
                  <b className="num">{parsed > 0n && !tooMuch ? `${formatUSDC(parsed)} USDC` : "—"}</b>
                </div>
                <div className="row">
                  <span>Stays invested after this</span>
                  <b className="num">{parsed > 0n && !tooMuch ? `${formatUSDC(remaining)} USDC` : "—"}</b>
                </div>
              </div>

              {tooMuch && parsed > 0n && (
                <div className="alert alert-warn" style={{ marginTop: 12 }}>
                  That is more than you can take out as a part. To take everything, press "Withdraw all".
                </div>
              )}
              {errText && (
                <div className="alert alert-red" style={{ marginTop: 12 }}>
                  {errText}
                </div>
              )}

              <button
                className="btn-primary btn-block"
                style={{ width: "100%", marginTop: 20, padding: "14px" }}
                disabled={!isConnected || !hasPosition || busy || parsed === 0n || tooMuch}
                onClick={onWithdrawPart}
              >
                {partLabel}
              </button>
            </>
          ) : (
            <>
              <div className="alert alert-warn" style={{ marginTop: 16 }}>
                This redeems your whole position in one transaction. The fee on your open profit is taken first.
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
                onClick={onWithdrawAll}
              >
                {allLabel}
              </button>
            </>
          )}

          <p className="fee-note" style={{ marginTop: 16 }}>
            Withdrawals depend on available Aave liquidity. The 10% performance fee is taken only from profit, and the fee
            on your whole open profit is settled the first time you withdraw, even a part. There is no withdrawal fee.
          </p>
        </div>

        <div className="deposit-side">
          <div className="card">
            <h2 className="card-title">For treasury signers</h2>
            <div className="row"><span>Redemption</span><b>Part or full position</b></div>
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
              <span>Position value</span>
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