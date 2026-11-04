"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { parseUnits, formatUnits } from "viem";
import {
  TREASURY_ABI,
  TREASURY_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
  BASESCAN,
} from "@/lib/contracts";
import { formatUSDC } from "@/lib/format";
import { recordActivity } from "@/lib/activity-store";
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";

// Turn a wallet/RPC error into a short human message.
function friendlyError(e: unknown): string | null {
  if (!e) return null;
  const msg = String((e as any)?.shortMessage || (e as any)?.message || e);
  if (/user rejected|user denied|rejected the request|denied transaction/i.test(msg))
    return "You rejected the transaction in your wallet. Nothing was sent.";
  if (/insufficient funds/i.test(msg))
    return "Not enough Base Sepolia ETH to pay gas. Get test ETH from a faucet and try again.";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}

export default function DepositPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [amount, setAmount] = useState("");

  const wrongNetwork = isConnected && chainId !== baseSepolia.id;

  const { data: walletBalance, isLoading: balLoading, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  } as any);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, TREASURY_ADDRESS] : undefined,
    query: { enabled: !!address },
  } as any);

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

  const balance = typeof walletBalance === "bigint" ? walletBalance : undefined;
  const allowed = typeof allowance === "bigint" ? allowance : undefined;
  const ta = typeof totalAssets === "bigint" ? totalAssets : undefined;
  const ts = typeof totalShares === "bigint" ? totalShares : undefined;

  const parsedAmount = (() => {
    try {
      if (!amount || amount === ".") return 0n;
      return parseUnits(amount, 6);
    } catch {
      return 0n;
    }
  })();

  const insufficient = balance !== undefined && parsedAmount > balance;
  const needsApproval = allowed !== undefined && parsedAmount > 0n && allowed < parsedAmount;

  // Estimated shares: amount × totalShares ÷ totalAssets (1:1 when the vault is empty)
  const estShares =
    parsedAmount === 0n
      ? 0n
      : ts !== undefined && ta !== undefined && ts > 0n && ta > 0n
      ? (parsedAmount * ts) / ta
      : parsedAmount;

  const {
    data: approveHash,
    writeContract: writeApprove,
    isPending: isApproving,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    data: depositHash,
    writeContract: writeDeposit,
    isPending: isDepositing,
    error: depositError,
    reset: resetDeposit,
  } = useWriteContract();
  const { data: depositReceipt, isLoading: depositConfirming, isSuccess: depositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositHash });

  // remember what was sent, so Activity can record it the instant it confirms
  const lastDeposit = useRef<{ assets: bigint; shares: bigint } | null>(null);

  useEffect(() => {
    if (approveConfirmed) refetchAllowance();
  }, [approveConfirmed, refetchAllowance]);
  useEffect(() => {
    if (depositConfirmed) refetchBalance();
  }, [depositConfirmed, refetchBalance]);
  useEffect(() => {
    if (depositConfirmed && depositHash && address && depositReceipt && lastDeposit.current) {
      recordActivity(address, {
        kind: "deposit",
        assets: lastDeposit.current.assets.toString(),
        shares: lastDeposit.current.shares.toString(),
        txHash: depositHash,
        blockNumber: depositReceipt.blockNumber.toString(),
        timestamp: Date.now(),
      });
    }
  }, [depositConfirmed, depositHash, address, depositReceipt]);

  const busy = isApproving || approveConfirming || isDepositing || depositConfirming;

  const setMax = () => {
    if (balance !== undefined) setAmount(formatUnits(balance, 6));
  };

  const onAmountChange = (raw: string) => {
    let v = raw.replace(/[^0-9.]/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1, firstDot + 7); // max 6 decimals (USDC)
    }
    resetApprove();
    resetDeposit();
    setAmount(v);
  };

  const onApprove = () => {
    if (parsedAmount === 0n) return;
    resetDeposit();
    writeApprove({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [TREASURY_ADDRESS, parsedAmount],
      gas: 100000n,
    } as any);
  };

  const onDeposit = () => {
    if (parsedAmount === 0n) return;
    resetApprove();
    lastDeposit.current = { assets: parsedAmount, shares: estShares };
    writeDeposit({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "deposit",
      args: [parsedAmount],
    } as any);
  };

  const buttonLabel = (() => {
    if (!isConnected) return "Connect wallet on the home page";
    if (wrongNetwork) return isSwitching ? "Switching…" : "Switch to Base Sepolia";
    if (!amount || parsedAmount === 0n) return "Enter an amount";
    if (insufficient) return "Insufficient USDC balance";
    if (needsApproval) return isApproving ? "Confirm in wallet…" : approveConfirming ? "Approving…" : "Approve USDC";
    if (isDepositing) return "Confirm in wallet…";
    if (depositConfirming) return "Depositing…";
    return "Deposit";
  })();

  const disabled =
    (!isConnected) ||
    (!wrongNetwork && (parsedAmount === 0n || insufficient)) ||
    busy ||
    isSwitching;

  const onClick = () => {
    if (wrongNetwork) {
      switchChain({ chainId: baseSepolia.id });
      return;
    }
    if (needsApproval) onApprove();
    else onDeposit();
  };

  const ready = isConnected && !wrongNetwork && parsedAmount > 0n && !insufficient;
  const errText = friendlyError(approveError) || friendlyError(depositError);

  /* ---------- success ---------- */
  if (depositConfirmed && depositHash) {
    return (
      <div className="dashboard">
        <div className="card" style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
          <div className="connect-modal-icon" style={{ margin: "0 auto 20px" }}>✓</div>
          <h2 className="dash-title">Deposit confirmed</h2>
          <p className="dash-sub">Your USDC has been deposited into the vault.</p>
          <div style={{ marginTop: 20 }}>
            <a href={BASESCAN.tx(depositHash)} target="_blank" rel="noreferrer" className="contract-link">
              View on BaseScan ↗
            </a>
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: "center" }}>
            <Link href="/dashboard" prefetch className="btn-primary">Back to Dashboard</Link>
            <Link href="/activity" prefetch className="btn-ghost">View activity</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- form ---------- */
  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Deposit USDC</h1>
          <p className="dash-sub">Deposit USDC into the YieldKeep vault. Funds are routed to Aave V3 on Base Sepolia.</p>
        </div>
      </div>

      <div className="deposit-grid">
        <div className="card">
          <div className="row"><span>Asset</span><b>USDC</b></div>
          <div className="row">
            <span>Wallet balance</span>
            <b className="num">{!isConnected ? "—" : balLoading ? "…" : `${formatUSDC(balance)} USDC`}</b>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <span>Amount</span>
            <button
              type="button"
              className="btn-ghost"
              onClick={setMax}
              disabled={!isConnected || balance === undefined}
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
            aria-label="Amount of USDC to deposit"
          />

          <div className="position-rows" style={{ marginTop: 20 }}>
            <div className="row">
              <span>Estimated shares</span>
              <b className="num">≈ {formatUSDC(estShares)}</b>
            </div>
            <div className="row"><span>Fee on deposit</span><b>0%</b></div>
          </div>

          {ready && (
            <div className="step-label">
              {needsApproval ? "Step 1 of 2 — Approve USDC" : allowed !== undefined ? "Step 2 of 2 — Deposit" : ""}
            </div>
          )}

          {errText && (
            <div className="alert alert-red" style={{ marginTop: 12 }}>⚠ {errText}</div>
          )}
          {approveConfirmed && !needsApproval && !depositHash && (
            <div className="alert" style={{ marginTop: 12 }}>USDC approved. Now confirm the deposit.</div>
          )}

          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%", marginTop: 12, padding: 14 }}
            disabled={disabled}
            onClick={onClick}
          >
            {buttonLabel}
          </button>

          {(approveHash || depositHash) && (
            <p className="fee-note" style={{ marginTop: 12 }}>
              <a
                href={BASESCAN.tx((depositHash || approveHash) as `0x${string}`)}
                target="_blank"
                rel="noreferrer"
                className="contract-link"
              >
                View pending transaction ↗
              </a>
            </p>
          )}

          <p className="fee-note" style={{ marginTop: 16 }}>
            Deposits are non-custodial. Withdrawals depend on available liquidity. This is a testnet demo: unaudited, no real funds.
          </p>
        </div>

        <div className="deposit-side">
          <div className="card">
            <h2 className="card-title">How it works</h2>
            <div className="row"><span>1. Approve USDC for the vault</span><b>✓</b></div>
            <div className="row"><span>2. Deposit into the vault</span><b>✓</b></div>
            <div className="row"><span>3. Vault routes funds to Aave V3</span><b>✓</b></div>
            <p className="fee-note" style={{ marginTop: 16 }}>
              Only 10% of recorded yield is charged as a performance fee. There is no management fee.
              {USES_MOCK_ADAPTER && " On this testnet demo the yield is simulated."}
            </p>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 className="card-title">Vault stats</h2>
            <div className="row"><span>Vault TVL</span><b className="num">{ta === undefined ? "—" : `${formatUSDC(ta)} USDC`}</b></div>
            <div className="row"><span>Management fee</span><b>0%</b></div>
            <div className="row"><span>Performance fee</span><b>10% of yield</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}