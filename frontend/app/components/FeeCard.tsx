"use client";

// frontend/app/components/FeeCard.tsx
// Shows ONE treasury (the connected wallet) its own profit, the 10% performance fee and what it keeps:
//   - fees already deducted (from FeeSettled events), each with date and transaction link
//   - the fee still open on a current position (read live from the vault's feeInfo)
// On an old V2 vault (no feeInfo) it shows a clearly labelled estimate instead.

import { useAccount, useReadContract } from "wagmi";
import { BASESCAN, TREASURY_ADDRESS } from "@/lib/contracts";
import { formatUSDC, shortAddress } from "@/lib/format";
import { FEE_ABI, useFeeInfo, type FeeEvent } from "@/lib/use-fee";

const YEAR_S = 365 * 24 * 3600;
const fmtDay = (sec: number) =>
  sec ? new Date(sec * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
const fmtMs = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "date pending";

export function FeeCard({
  estimatePnl,
  fees,
  feesLoaded,
}: {
  estimatePnl?: bigint;
  fees: FeeEvent[];
  feesLoaded: boolean;
}) {
  const { address, isConnected } = useAccount();
  const { info, loading, legacy } = useFeeInfo(address);

  const recipient = useReadContract({ address: TREASURY_ADDRESS, abi: FEE_ABI, functionName: "feeRecipient" } as any);
  const totalFees = useReadContract({
    address: TREASURY_ADDRESS,
    abi: FEE_ABI,
    functionName: "totalFeesPaid",
    query: { retry: false },
  } as any);

  if (!isConnected) return null;

  /* ---- numbers ---- */
  const paidFee = fees.reduce((s, f) => s + f.fee, 0n);
  const paidProfit = fees.reduce((s, f) => s + f.profit, 0n);

  let profit = 0n; // all profit made: already charged + still open
  let fee = 0n; // all fee: already deducted + still open
  let openFee = 0n;
  let openValue = 0n;
  let next = 0;

  if (info) {
    openFee = info.feeDue;
    openValue = info.value;
    profit = paidProfit + info.profit;
    fee = paidFee + info.feeDue;
    next = info.nextSettleAt;
  } else if (estimatePnl !== undefined) {
    const p = estimatePnl > 0n ? estimatePnl : 0n;
    profit = p;
    fee = (p * 1000n) / 10000n;
  }
  const keep = profit - fee;
  const hasOpen = openValue > 0n;
  const start = hasOpen && next ? next - YEAR_S : 0;

  const feeWallet = typeof recipient.data === "string" ? (recipient.data as string) : undefined;
  const vaultFees = typeof totalFees.data === "bigint" ? (totalFees.data as bigint) : undefined;
  const wait = loading || (!feesLoaded && fees.length === 0);

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 className="card-title" style={{ margin: 0 }}>Performance fee · 10% of your profit</h2>
      <p className="yk-sub">
        Taken only from profit, never from your deposit. You pay nothing if you have no profit.
      </p>

      <div className="yk-sum">
        <div>
          <span>Total profit made</span>
          <b className={profit > 0n ? "yk-pos" : ""}>{wait ? "…" : `${formatUSDC(profit)} USDC`}</b>
        </div>
        <div>
          <span>Performance fee (10%)</span>
          <b>{wait ? "…" : `${formatUSDC(fee)} USDC`}</b>
        </div>
        <div>
          <span>Your profit after fee</span>
          <b className={keep > 0n ? "yk-pos" : ""}>{wait ? "…" : `${formatUSDC(keep)} USDC`}</b>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {info && (
          <>
            <div className="row">
              <span>Fee already deducted</span>
              <b className="num">{feesLoaded || fees.length > 0 ? `${formatUSDC(paidFee)} USDC` : "…"}</b>
            </div>
            {hasOpen && (
              <>
                <div className="row">
                  <span>Fee still open on your current position</span>
                  <b className="num">{formatUSDC(openFee)} USDC</b>
                </div>
                <div className="row"><span>Fee clock started</span><b>{fmtDay(start)}</b></div>
                <div className="row"><span>Next yearly fee date</span><b>{fmtDay(next)}</b></div>
              </>
            )}
          </>
        )}
        <div className="row">
          <span>Fee wallet</span>
          {feeWallet ? (
            <a href={BASESCAN.address(feeWallet as any)} target="_blank" rel="noreferrer" className="contract-link">
              {shortAddress(feeWallet)} ↗
            </a>
          ) : (
            <b>…</b>
          )}
        </div>
        {vaultFees !== undefined && (
          <div className="row"><span>Total fees collected by the vault</span><b className="num">{formatUSDC(vaultFees)} USDC</b></div>
        )}
      </div>

      {/* ---- every fee that was deducted ---- */}
      {info && (
        <div style={{ marginTop: 16 }}>
          <div className="yk-sub" style={{ marginBottom: 6 }}>Fee deductions</div>
          {fees.length === 0 ? (
            <p className="empty" style={{ margin: 0 }}>
              {feesLoaded ? "No fee has been deducted yet. It is taken when you withdraw, or on your yearly date." : "Reading fee history…"}
            </p>
          ) : (
            fees.slice(0, 6).map((f) => (
              <div className="row" key={`${f.txHash}-${f.logIndex}`}>
                <span>
                  {fmtMs(f.timestamp)} ·{" "}
                  <a href={BASESCAN.tx(f.txHash)} target="_blank" rel="noreferrer" className="contract-link">
                    {f.txHash.slice(0, 10)}… ↗
                  </a>
                </span>
                <b className="num">
                  profit {formatUSDC(f.profit)} → fee {formatUSDC(f.fee)} USDC
                </b>
              </div>
            ))
          )}
        </div>
      )}

      <p className="fee-note">
        {info
          ? "The fee is charged once a year on your own date (365 days after your first deposit), and always when you withdraw everything. A loss is never charged, and a gain that only recovers an earlier loss is not charged twice."
          : legacy
          ? "Estimate only: 10% of your current profit. The exact per-treasury fee starts on the new vault version."
          : ""}
      </p>
    </div>
  );
}