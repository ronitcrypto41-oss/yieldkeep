'use client';

import React from 'react';
import { useTreasuryBalance } from '@/app/hooks/useTreasuryBalance';
import {
  TREASURY_ADDRESS,
  ADAPTER_ADDRESS,
  CHAIN_NAME,
} from '@/lib/contracts';
import s from './TreasuryCard.module.css';

function truncate(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      className={s.copy}
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy address"
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

export function TreasuryCard() {
  const { formattedBalance, isLoading, isError, error, refetch } =
    useTreasuryBalance();

  return (
    <div className={s.card}>
      <div className={s.eyebrow}>DAO TREASURY</div>

      <div className={s.balanceRow}>
        <div className={s.balance}>
          {isLoading ? '—' : formattedBalance}
          <span className={s.balanceUnit}> USDC</span>
        </div>
        <span className={s.liveBadge}>
          <span className={s.liveDot} /> LIVE
        </span>
      </div>

      <div className={s.divider} />

      <div className={s.row}>
        <span className={s.label}>Network</span>
        <span className={s.value}>
          <span className={s.networkDot} /> {CHAIN_NAME}
        </span>
      </div>

      <div className={s.row}>
        <span className={s.label}>Adapter</span>
        <span className={s.value}>
          {truncate(ADAPTER_ADDRESS)}
          <CopyButton value={ADAPTER_ADDRESS} />
        </span>
      </div>

      <div className={s.row}>
        <span className={s.label}>Treasury</span>
        <span className={s.value}>
          {truncate(TREASURY_ADDRESS)}
          <CopyButton value={TREASURY_ADDRESS} />
        </span>
      </div>

      <div className={s.actions}>
        <button className={s.btnPrimary} onClick={() => refetch()}>
          ↻ Refresh Balance
        </button>
        <a
          className={s.btnSecondary}
          href={`https://sepolia.basescan.org/address/${TREASURY_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          ↗ View on Basescan
        </a>
      </div>

      {isError && (
        <p className={s.error}>
          {error?.message?.slice(0, 120) ?? 'Unknown error'}
        </p>
      )}
    </div>
  );
}