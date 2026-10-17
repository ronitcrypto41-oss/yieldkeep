"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits } from "viem";
import {
  TREASURY_ABI,
  TREASURY_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
  BASESCAN,
} from "@/lib/contracts";
import { formatUSDC } from "@/lib/format";

export default function DepositPage() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("");

  const { data: walletBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, TREASURY_ADDRESS] : undefined,
  });

  const parsedAmount = (() => {
    try {
      if (!amount || isNaN(Number(amount))) return 0n;
      return parseUnits(amount, 6);
    } catch {
      return 0n;
    }
  })();

  const needsApproval =
    allowance !== undefined &&
    parsedAmount > 0n &&
    (allowance as bigint) < parsedAmount;

  const {
    data: approveHash,
    writeContract: writeApprove,
    isPending: isApproving,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    data: depositHash,
    writeContract: writeDeposit,
    isPending: isDepositing,
  } = useWriteContract();
  const { isLoading: depositConfirming, isSuccess: depositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositHash });

  if (approveConfirmed) {
    refetchAllowance();
  }

  const setMax = () => {
    if (walletBalance) {
      setAmount((Number(walletBalance as bigint) / 1e6).toString());
    }
  };

  const onApprove = () => {
    if (parsedAmount === 0n) return;
    writeApprove({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [TREASURY_ADDRESS, parsedAmount],
      gas: 100000n,
    });
  };

  const onDeposit = () => {
    if (parsedAmount === 0n) return;
    writeDeposit({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "deposit",
      args: [parsedAmount],
    });
  };

  const buttonLabel = (() => {
    if (!isConnected) return "Connect Wallet";
    if (!amount || parsedAmount === 0n) return "Enter an amount";
    if (needsApproval) {
      if (isApproving || approveConfirming) return "Approving…";
      return "Approve USDC";
    }
    if (isDepositing || depositConfirming) return "Depositing…";
    return "Deposit";
  })();

  const disabled =
    !isConnected ||
    !amount ||
    parsedAmount === 0n ||
    isApproving ||
    approveConfirming ||
    isDepositing ||
    depositConfirming;

  const onClick = () => {
    if (needsApproval) onApprove();
    else onDeposit();
  };

  const showStep = isConnected && amount && parsedAmount > 0n;

  if (depositConfirmed && depositHash) {
    return (
      <div className="dashboard">
        <div className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
          <div className="connect-modal-icon" style={{ margin: "0 auto 20px" }}>
            ✓
          </div>
          <h2 className="dash-title" style={{ textAlign: "center" }}>
            Deposit confirmed
          </h2>
          <p className="dash-sub" style={{ textAlign: "center" }}>
            Your USDC has been deposited into the vault.
          </p>
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <a
              href={BASESCAN.tx(depositHash)}
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
          <h1 className="dash-title">Deposit USDC</h1>
          <p className="dash-sub">
            Deposit USDC into the YieldKeep vault. Funds route to Aave V3.
          </p>
        </div>
      </div>

      <div className="deposit-grid">
        <div className="card">
          <div className="row">
            <span>Asset</span>
            <b>USDC</b>
          </div>
          <div className="row">
            <span>Wallet balance</span>
            <b>{formatUSDC(walletBalance as bigint | undefined)} USDC</b>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <span>Amount</span>
            <button
              className="btn-ghost"
              onClick={setMax}
              style={{ padding: "4px 10px", fontSize: 11 }}
            >
              MAX
            </button>
          </div>

          <input
            className="amount-input"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) =>
              setAmount(e.target.value.replace(/[^0-9.]/g, ""))
            }
          />

          <div className="position-rows" style={{ marginTop: 20 }}>
            <div className="row">
              <span>You will receive</span>
              <b>≈ {amount ? amount : "0.00"} shares</b>
            </div>
            <div className="row">
              <span>Fee on deposit</span>
              <b>0%</b>
            </div>
          </div>

          {showStep && needsApproval && (
            <div className="step-label">Step 1 of 2 — Approve USDC</div>
          )}
          {showStep && !needsApproval && (
            <div className="step-label">Step 2 of 2 — Deposit</div>
          )}

          <button
            className="btn-primary"
            style={{ width: "100%", marginTop: 8, padding: "14px" }}
            disabled={disabled}
            onClick={onClick}
          >
            {buttonLabel}
          </button>

          <p className="fee-note" style={{ marginTop: 16 }}>
            Deposits are non-custodial. You can withdraw anytime subject to
            available liquidity.
          </p>
        </div>

        <div className="deposit-side">
          <div className="card">
            <h2 className="card-title">Why YieldKeep</h2>
            <div className="row">
              <span>Non-custodial vault architecture</span>
              <b style={{ color: "#22c55e" }}>✓</b>
            </div>
            <div className="row">
              <span>Battle-tested Aave V3 integration</span>
              <b style={{ color: "#22c55e" }}>✓</b>
            </div>
            <div className="row">
              <span>Real-time on-chain accounting</span>
              <b style={{ color: "#22c55e" }}>✓</b>
            </div>
            <p className="fee-note" style={{ marginTop: 16 }}>
              Your USDC earns yield on Aave V3. You only pay 10% of the yield
              earned — no management fee.
            </p>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 className="card-title">Vault stats</h2>
            <div className="row">
              <span>Current APY</span>
              <b>—</b>
            </div>
            <div className="row">
              <span>Protocol TVL</span>
              <b>—</b>
            </div>
            <div className="row">
              <span>Management fee</span>
              <b>0%</b>
            </div>
            <div className="row">
              <span>Performance fee</span>
              <b>10% of yield</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}