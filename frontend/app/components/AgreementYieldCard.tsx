"use client";

// frontend/app/components/AgreementYieldCard.tsx
// One card with two parts:
//   1) Agreement: the rules the DAO accepts when it deposits (fee, date, withdraw, fee wallet)
//   2) Yield: this treasury's own numbers, read live from the vault (feeInfo)
// Needs no props. It uses the connected wallet.

import { useAccount, useReadContract } from "wagmi";
import { BASESCAN, TREASURY_ADDRESS } from "@/lib/contracts";
import { formatUSDC, shortAddress } from "@/lib/format";
import { FEE_ABI, useFeeInfo } from "@/lib/use-fee";

const PAUSED_ABI = [
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
] as const;

const YEAR_S = 365 * 24 * 3600;
const fmtDay = (sec: number) =>
  sec ? new Date(sec * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

export function AgreementYieldCard() {
  const { address, isConnected } = useAccount();
  const { info, loading, legacy } = useFeeInfo(address);

  const recipient = useReadContract({
    address: TREASURY_ADDRESS,
    abi: FEE_ABI,
    functionName: "feeRecipient",
    query: { retry: false },
  } as any);
  const paused = useReadContract({
    address: TREASURY_ADDRESS,
    abi: PAUSED_ABI,
    functionName: "paused",
    query: { retry: false, refetchInterval: 30000 },
  } as any);

  const feeWallet = typeof recipient.data === "string" ? (recipient.data as string) : undefined;
  const isPaused = paused.data === true;

  // raw feeInfo gives value, costBasis, profit, feeDue, youKeep, nextSettleAt.
  // useFeeInfo already keeps value, profit, feeDue and nextSettleAt. We read costBasis ourselves.
  const raw = useReadContract({
    address: TREASURY_ADDRESS,
    abi: FEE_ABI,
    functionName: "feeInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000, retry: false },
  } as any);
  const arr = Array.isArray(raw.data) ? (raw.data as readonly bigint[]) : undefined;
  const costBasis = arr ? arr[1] : 0n;

  const value = info?.value ?? 0n;
  const profit = info?.profit ?? 0n;
  const feeDue = info?.feeDue ?? 0n;
  const youKeep = value - feeDue; // what you would receive if you withdrew now
  const next = info?.nextSettleAt ?? 0;
  const hasPosition = value > 0n;
  const start = hasPosition && next ? next - YEAR_S : 0;
  const wait = loading && !info;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      {/* ───────── PART 1: AGREEMENT ───────── */}
      <h2 className="card-title" style={{ margin: 0 }}>Agreement · what your treasury accepts</h2>
      <p className="yk-sub">These rules are written in the vault contract. Nobody can change them for your treasury.</p>

      <div className="row"><span>Fee</span><b>10% of profit only, never of your deposit</b></div>
      <div className="row"><span>When it is charged</span><b>Once a year on your own date, and when you withdraw</b></div>
      <div className="row"><span>No profit</span><b>No fee. A loss never creates a fee.</b></div>
      <div className="row">
        <span>Withdraw</span>
        <b>{isPaused ? "Open. Deposits are paused, withdrawals still work." : "Always open, even if deposits are paused"}</b>
      </div>
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
      <div className="row">
        <span>Vault contract</span>
        <a href={BASESCAN.address(TREASURY_ADDRESS as any)} target="_blank" rel="noreferrer" className="contract-link">
          {shortAddress(TREASURY_ADDRESS as string)} ↗
        </a>
      </div>

      {/* ───────── PART 2: YIELD ───────── */}
      <h2 className="card-title" style={{ margin: "24px 0 0 0" }}>Yield · what your treasury earned</h2>

      {!isConnected ? (
        <p className="empty" style={{ margin: "8px 0 0 0" }}>Connect your treasury wallet to see your own numbers.</p>
      ) : legacy ? (
        <p className="empty" style={{ margin: "8px 0 0 0" }}>
          This vault version cannot show exact numbers yet. They appear on the new vault version.
        </p>
      ) : !hasPosition && !wait ? (
        <p className="empty" style={{ margin: "8px 0 0 0" }}>No deposit yet. Your numbers appear here after your first deposit.</p>
      ) : (
        <>
          <div className="yk-sum" style={{ marginTop: 10 }}>
            <div>
              <span>Current value</span>
              <b>{wait ? "…" : `${formatUSDC(value)} USDC`}</b>
            </div>
            <div>
              <span>Profit so far</span>
              <b className={profit > 0n ? "yk-pos" : ""}>{wait ? "…" : `${formatUSDC(profit)} USDC`}</b>
            </div>
            <div>
              <span>You keep after fee</span>
              <b className={youKeep > 0n ? "yk-pos" : ""}>{wait ? "…" : `${formatUSDC(youKeep)} USDC`}</b>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="row">
              <span>Your deposit (cost basis)</span>
              <b className="num">{wait ? "…" : `${formatUSDC(costBasis)} USDC`}</b>
            </div>
            <div className="row">
              <span>Fee due so far (10% of profit)</span>
              <b className="num">{wait ? "…" : `${formatUSDC(feeDue)} USDC`}</b>
            </div>
            <div className="row"><span>Your fee year started</span><b>{fmtDay(start)}</b></div>
            <div className="row"><span>Next fee date</span><b>{fmtDay(next)}</b></div>
          </div>
        </>
      )}

      <p className="fee-note">
        "You keep after fee" is your value minus the fee that would be taken if you withdrew now. It changes as the yield changes.
        Numbers are read live from the vault contract.
      </p>
    </div>
  );
}