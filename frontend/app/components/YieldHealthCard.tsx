"use client";

// frontend/app/components/YieldHealthCard.tsx
// Shows, in plain words, whether this treasury is earning, at break-even or losing,
// what the vault share price did since the first activity, an estimated yearly rate
// (before and after the 10% fee), and where the money sits.
// It makes no promises: the rate is only an estimate from past share-price change.

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { ADAPTER_ABI, ADAPTER_ADDRESS, TREASURY_ABI, TREASURY_ADDRESS } from "@/lib/contracts";
import { formatUSDC, formatSharePrice } from "@/lib/format";
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";

const TINY = 10_000n; // 0.01 USDC: smaller differences count as break-even (rounding)
const FEE = 0.1; // 10% of profit
const MIN_DAYS_FOR_RATE = 30;

type Ev = { kind: string; assets: bigint; shares: bigint; timestamp: number };

type Props = {
  events: Ev[]; // all vault events (deposits, withdrawals, harvests)
  netPnl?: bigint; // all-time result of THIS wallet (position + withdrawn - deposited)
  deposited: bigint; // total deposited by THIS wallet
  hasPosition: boolean;
  openFee?: bigint; // fee still open on the current position
};

const pct = (x?: number) => (x === undefined || !isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)}%`);
const signedUsdc = (v: bigint) => (v > -TINY && v < TINY ? formatUSDC(0n) : `${v > 0n ? "+" : "−"}${formatUSDC(v < 0n ? -v : v)}`);

export function YieldHealthCard({ events, netPnl, deposited, hasPosition, openFee }: Props) {
  const { data: totalAssets } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalAssets",
    query: { refetchInterval: 15000 },
  });
  const { data: totalShares } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalShares",
    query: { refetchInterval: 15000 },
  });
  const { data: idle } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "idleAssets",
    query: { refetchInterval: 15000 },
  });
  const { data: inAdapter } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "totalAssets",
    query: { refetchInterval: 15000 },
  });
  const { data: adapterPaused } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "paused",
    query: { refetchInterval: 15000 },
  });

  const ta = totalAssets as bigint | undefined;
  const ts = totalShares as bigint | undefined;

  // the first vault event that created or burned shares gives the reference share price
  const ref = useMemo(() => {
    let best: Ev | undefined;
    for (const e of events) {
      if (e.kind === "harvest" || e.shares <= 0n || e.assets <= 0n || !e.timestamp) continue;
      if (!best || e.timestamp < best.timestamp) best = e;
    }
    return best;
  }, [events]);

  const p0 = ref ? Number(ref.assets) / Number(ref.shares) : undefined;
  const pNow = ta !== undefined && ts !== undefined && ts > 0n ? Number(ta) / Number(ts) : undefined;
  const days = ref ? Math.max(0, (Date.now() - ref.timestamp) / 86_400_000) : 0;
  const change = p0 && pNow ? pNow / p0 - 1 : undefined;
  const annual = change !== undefined && days >= MIN_DAYS_FOR_RATE ? Math.pow(1 + change, 365 / days) - 1 : undefined;
  const annualNet = annual !== undefined ? (annual > 0 ? annual * (1 - FEE) : annual) : undefined;

  const daysText = days < 1 ? "less than a day" : `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"}`;

  // status of this treasury
  let label = "Reading…";
  let pill = "yk-pill";
  let note = "";
  if (deposited === 0n && !hasPosition) {
    label = "No position yet";
    note = "After your first deposit, this card shows whether your treasury is earning, at break-even or losing.";
  } else if (netPnl !== undefined) {
    if (netPnl >= TINY) {
      label = "Earning";
      pill = "yk-pill ok";
      note = "Your treasury is ahead of its deposits. The 10% fee applies to profit only, on your yearly date and when you withdraw.";
    } else if (netPnl <= -TINY) {
      label = "Loss";
      pill = "yk-pill bad";
      note =
        "Your position is worth less than your deposits. No fee is charged on a loss, and a recovery back to your earlier level is not charged either.";
    } else {
      label = "Break-even";
      note = "Within 0.01 USDC of your deposits. No fee is charged at break-even. Tiny differences come from rounding.";
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          Yield health
          {USES_MOCK_ADAPTER && <span className="simulated-tag">Simulated</span>}
        </h2>
        <span className={pill}>{label}</span>
      </div>
      {note && <p className="yk-sub">{note}</p>}

      <div style={{ marginTop: 12 }}>
        <div className="row">
          <span>Result so far (all time)</span>
          <b className="num">{netPnl === undefined ? "…" : `${signedUsdc(netPnl)} USDC`}</b>
        </div>
        <div className="row">
          <span>Fee open on your position now</span>
          <b className="num">{openFee && openFee > 0n ? `${formatUSDC(openFee)} USDC` : "None"}</b>
        </div>
        <div className="row">
          <span>Vault share price now</span>
          <b className="num">{formatSharePrice(ta, ts)}</b>
        </div>
        <div className="row">
          <span>Share price change since first activity ({daysText})</span>
          <b className="num">{pct(change)}</b>
        </div>
        <div className="row">
          <span>Estimated yearly rate, before fee</span>
          <b className="num">{annual !== undefined ? pct(annual) : `after ${MIN_DAYS_FOR_RATE} days of history`}</b>
        </div>
        <div className="row">
          <span>Estimated yearly rate, after the 10% fee</span>
          <b className="num">{annualNet !== undefined ? pct(annualNet) : `after ${MIN_DAYS_FOR_RATE} days of history`}</b>
        </div>
        <div className="row">
          <span>Idle in vault (not yet routed)</span>
          <b className="num">{idle !== undefined ? `${formatUSDC(idle as bigint)} USDC` : "…"}</b>
        </div>
        <div className="row">
          <span>Routed through the yield adapter</span>
          <b className="num">{inAdapter !== undefined ? `${formatUSDC(inAdapter as bigint)} USDC` : "…"}</b>
        </div>
        <div className="row">
          <span>Adapter status</span>
          <b>{adapterPaused === undefined ? "…" : adapterPaused ? "Paused" : "Active"}</b>
        </div>
      </div>

      <p className="fee-note">
        The yearly rate is only an estimate from how the share price moved in the past. It is not a promise and it changes with the lending market.
        {USES_MOCK_ADAPTER ? " On this testnet the yield is simulated by a mock adapter, so these numbers only demonstrate how the card works." : ""}
      </p>
    </div>
  );
}