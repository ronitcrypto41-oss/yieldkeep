'use client';

import React from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { parseUnits, maxUint256, formatUnits } from 'viem';
import { useUSDCBalance } from '@/app/hooks/useUSDCBalance';
import { useUSDCAllowance } from '@/app/hooks/useUSDCAllowance';
import {
  TREASURY_ADDRESS,
  TREASURY_ABI,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from '@/lib/contracts';
import s from './DepositCard.module.css';

const ERC20_APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

type Tab = 'deposit' | 'withdraw';
type Step =
  | 'idle'
  | 'approving'
  | 'approved'
  | 'depositing'
  | 'deposited'
  | 'withdrawing'
  | 'withdrawn';

export function DepositCard() {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [tab, setTab] = React.useState<Tab>('deposit');
  const [amount, setAmount] = React.useState('');
  const [step, setStep] = React.useState<Step>('idle');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const { formattedBalance, rawBalance, refetch: refetchBalance } = useUSDCBalance();
  const { allowance, refetch: refetchAllowance } = useUSDCAllowance();

  const parsedAmount: bigint = React.useMemo(() => {
    if (!amount || isNaN(Number(amount))) return 0n;
    try {
      return parseUnits(amount, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount]);

  const needsApproval = parsedAmount > 0n && allowance < parsedAmount;

  const { writeContract: writeApprove, data: approveHash, isPending: approvePending, error: approveError } =
    useWriteContract();
  const { isSuccess: approveConfirmed, isLoading: approveReceiptLoading } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: writeDeposit, data: depositHash, isPending: depositPending, error: depositError } =
    useWriteContract();
  const { isSuccess: depositConfirmed, isLoading: depositReceiptLoading } =
    useWaitForTransactionReceipt({ hash: depositHash });

  const { writeContract: writeWithdraw, data: withdrawHash, isPending: withdrawPending, error: withdrawError } =
    useWriteContract();
  const { isSuccess: withdrawConfirmed, isLoading: withdrawReceiptLoading } =
    useWaitForTransactionReceipt({ hash: withdrawHash });

  React.useEffect(() => {
    if (approveConfirmed) {
      refetchAllowance();
      setStep('approved');
    }
  }, [approveConfirmed, refetchAllowance]);

  React.useEffect(() => {
    if (depositConfirmed) {
      refetchBalance();
      refetchAllowance();
      setStep('deposited');
      setAmount('');
    }
  }, [depositConfirmed, refetchBalance, refetchAllowance]);

  React.useEffect(() => {
    if (withdrawConfirmed) {
      refetchBalance();
      refetchAllowance();
      setStep('withdrawn');
    }
  }, [withdrawConfirmed, refetchBalance, refetchAllowance]);

  React.useEffect(() => {
    const err = approveError || depositError || withdrawError;
    setErrorMsg(err ? err.message.slice(0, 120) + '…' : null);
  }, [approveError, depositError, withdrawError]);

  const handleApprove = () => {
    setErrorMsg(null);
    setStep('approving');
    writeApprove({
      address: USDC_ADDRESS,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [TREASURY_ADDRESS, maxUint256],
    });
  };

  const handleDeposit = () => {
    setErrorMsg(null);
    setStep('depositing');
    writeDeposit({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: 'deposit',
      args: [parsedAmount],
    });
  };

  const handleWithdraw = () => {
    setErrorMsg(null);
    setStep('withdrawing');
    writeWithdraw({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: 'withdraw',
      args: [],
    });
  };

  const handleMax = () => {
    if (rawBalance !== undefined) {
      setAmount(formatUnits(rawBalance as bigint, USDC_DECIMALS));
    }
  };

  const renderDepositButton = () => {
    if (!isConnected) {
      return (
        <button className={s.btn} onClick={openConnectModal}>
          Connect Wallet
        </button>
      );
    }
    if (parsedAmount === 0n) {
      return (
        <button className={`${s.btn} ${s.btnDisabled}`} disabled>
          Enter an amount
        </button>
      );
    }
    if (approvePending || (step === 'approving' && !approveConfirmed)) {
      return (
        <button className={`${s.btn} ${s.btnDisabled}`} disabled>
          {approvePending ? 'Confirm in wallet…' : 'Approving USDC…'}
        </button>
      );
    }
    if (approveReceiptLoading) {
      return (
        <button className={`${s.btn} ${s.btnDisabled}`} disabled>
          Waiting for approval…
        </button>
      );
    }
    if (needsApproval && step !== 'approved') {
      return (
        <button className={`${s.btn} ${s.btnApprove}`} onClick={handleApprove}>
          Approve USDC
        </button>
      );
    }
    if (depositPending || (step === 'depositing' && !depositConfirmed)) {
      return (
        <button className={`${s.btn} ${s.btnDisabled}`} disabled>
          {depositPending ? 'Confirm in wallet…' : 'Depositing…'}
        </button>
      );
    }
    if (depositReceiptLoading) {
      return (
        <button className={`${s.btn} ${s.btnDisabled}`} disabled>
          Confirming deposit…
        </button>
      );
    }
    if (step === 'deposited') {
      return (
        <button className={s.btn} onClick={() => setStep('idle')}>
          ✅ Deposited — Deposit Again
        </button>
      );
    }
    return (
      <button className={`${s.btn} ${s.btnDeposit}`} onClick={handleDeposit}>
        Deposit
      </button>
    );
  };

  const renderWithdrawButton = () => {
    if (!isConnected) {
      return (
        <button className={s.btn} onClick={openConnectModal}>
          Connect Wallet
        </button>
      );
    }
    if (withdrawPending || (step === 'withdrawing' && !withdrawConfirmed)) {
      return (
        <button className={`${s.btn} ${s.btnDisabled}`} disabled>
          {withdrawPending ? 'Confirm in wallet…' : 'Withdrawing…'}
        </button>
      );
    }
    if (withdrawReceiptLoading) {
      return (
        <button className={`${s.btn} ${s.btnDisabled}`} disabled>
          Confirming withdrawal…
        </button>
      );
    }
    if (step === 'withdrawn') {
      return (
        <button className={s.btn} onClick={() => setStep('idle')}>
          ✅ Withdrawn — Withdraw Again
        </button>
      );
    }
    return (
      <button className={`${s.btn} ${s.btnWithdraw}`} onClick={handleWithdraw}>
        Withdraw All
      </button>
    );
  };

  return (
    <div className={s.card}>
      <div className={s.tabs}>
        <button
          className={tab === 'deposit' ? s.tabActive : ''}
          onClick={() => {
            setTab('deposit');
            setStep('idle');
            setErrorMsg(null);
          }}
        >
          Deposit
        </button>
        <button
          className={tab === 'withdraw' ? s.tabActive : ''}
          onClick={() => {
            setTab('withdraw');
            setStep('idle');
            setErrorMsg(null);
          }}
        >
          Withdraw
        </button>
      </div>

      {tab === 'deposit' && (
        <>
          <div className={s.rowLabel}>
            <span>Asset</span>
            <span>Balance {isConnected ? formattedBalance : '—'}</span>
          </div>
          <div className={s.select}>
            <span className={s.tokenIcon}>$</span> USDC
            <span className={s.caret}>⌄</span>
          </div>

          <div className={s.rowLabel}>
            <span>Amount</span>
            <button
              onClick={handleMax}
              disabled={!isConnected}
              className={s.maxBtn}
            >
              Max
            </button>
          </div>
          <div className={s.amount}>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              disabled={!isConnected}
            />
            <span>USDC</span>
          </div>

          <div className={s.rows}>
            <p><span>Strategy</span><b>Aave V3 USDC</b></p>
            <p><span>Current APY</span><b>—</b></p>
            <p><span>Share Value</span><b>—</b></p>
            <p><span>Protocol Fee</span><b>10% of yield</b></p>
          </div>

          {renderDepositButton()}
        </>
      )}

      {tab === 'withdraw' && (
        <>
          <div className={s.rowLabel}>
            <span>Your Shares</span>
            <span>—</span>
          </div>
          <div className={s.select}>
            <span className={s.tokenIcon}>$</span> ykUSDC
            <span className={s.caret}>⌄</span>
          </div>

          <div className={s.rows}>
            <p><span>Redeemable</span><b>—</b></p>
            <p><span>Share Price</span><b>1.0000</b></p>
            <p><span>Protocol Fee</span><b>10% of yield</b></p>
          </div>

          {renderWithdrawButton()}
        </>
      )}

      {errorMsg && <p className={s.error}>{errorMsg}</p>}
    </div>
  );
}