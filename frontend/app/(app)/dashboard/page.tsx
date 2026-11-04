"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { recordActivity } from "@/lib/activity-store";
import { useMergedEvents } from "@/lib/use-merged-events";
import { usePnlHistory } from "@/lib/use-pnl-history";
import { ChartStyles, AddressAvatar, PnlLine, type Range } from "@/app/components/yk-pnl";
import { FeeCard } from "@/app/components/FeeCard";
import { useFeeEvents, useFeeInfo } from "@/lib/use-fee";
import { downloadReportPdf } from "@/lib/report-pdf";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  ADAPTER_ABI,
  ADAPTER_ADDRESS,
  ADDRESSES,
  BASESCAN,
  TREASURY_ABI,
  TREASURY_ADDRESS,
} from "@/lib/contracts";
import { formatUSDC, formatSharePrice, shortAddress } from "@/lib/format";
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";

// Name of the vault function that returns a user's share balance.
// Confirmed from lib/contracts.ts: the vault function is `shares(address)`.
const USER_SHARES_FN = "shares";

const fmtDate = (ms: number) =>
  ms
    ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

const signed = (v: bigint) => `${v > 0n ? "+" : v < 0n ? "−" : ""}${formatUSDC(v < 0n ? -v : v)}`;

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const me = address?.toLowerCase();

  const { data: totalAssets, isLoading: l1, refetch: refetchTotalAssets } =
    useReadContract({ address: TREASURY_ADDRESS, abi: TREASURY_ABI, functionName: "totalAssets", query: { refetchInterval: 10000 } });
  const { data: totalShares, isLoading: l2 } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "totalShares",
    query: { refetchInterval: 10000 },
  });
  const { data: idleAssets, refetch: refetchIdle } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "idleAssets",
  });
  const { isLoading: l5 } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "totalAssets",
  });
  const { data: adapterPaused } = useReadContract({
    address: ADAPTER_ADDRESS,
    abi: ADAPTER_ABI,
    functionName: "paused",
  });

  const { data: myShares, isLoading: l6 } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: USER_SHARES_FN as any,
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  } as any);

  const isLoading = l1 || l2 || l5;

  // chain events (cached, shared) + your own instant local records
  const { events, loaded, syncing, progress, warning, error, refresh } = useMergedEvents(address);

  // performance fees already deducted from THIS wallet, and the fee still open on its position
  const { fees, loaded: feesLoaded } = useFeeEvents(address);
  const { info: feeNow } = useFeeInfo(address);
  const { data: feeWalletAddr } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: [{ type: "function", name: "feeRecipient", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] }] as const,
    functionName: "feeRecipient",
    query: { retry: false },
  } as any);

  const {
    data: harvestHash,
    writeContract: writeHarvest,
    isPending: isHarvesting,
  } = useWriteContract();
  const { data: harvestReceipt, isLoading: harvestConfirming, isSuccess: harvestConfirmed } =
    useWaitForTransactionReceipt({ hash: harvestHash });

  const lastHarvestAmount = useRef<bigint>(0n);

  useEffect(() => {
    if (harvestConfirmed) {
      refetchTotalAssets();
      refetchIdle();
      refresh();
    }
  }, [harvestConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (harvestConfirmed && harvestHash && address && harvestReceipt) {
      recordActivity(address, {
        kind: "harvest",
        assets: lastHarvestAmount.current.toString(),
        shares: "0",
        txHash: harvestHash,
        blockNumber: harvestReceipt.blockNumber.toString(),
        timestamp: Date.now(),
      });
    }
  }, [harvestConfirmed, harvestHash, address, harvestReceipt]);

  const onHarvest = () => {
    lastHarvestAmount.current = typeof idleAssets === "bigint" ? idleAssets : 0n;
    writeHarvest({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "harvest",
      gas: 1500000n,
    } as any);
  };

  const ta = totalAssets as bigint | undefined;
  const ts = totalShares as bigint | undefined;
  const sharePrice = formatSharePrice(ta, ts);
  const valueOf = (sh: bigint) => (ts && ts > 0n && ta !== undefined ? (sh * ta) / ts : undefined);

  /* ---------- THIS wallet's own history, built from real events ---------- */
  const { mine, harvests } = useMemo(() => {
    let m: { deposited: bigint; withdrawn: bigint; shares: bigint; first: number; last: number; count: number } | undefined;
    const hv: typeof events = [];
    for (const e of events) {
      if (e.kind === "harvest") {
        hv.push(e);
        continue;
      }
      if (!me || e.user !== me) continue;
      m = m ?? { deposited: 0n, withdrawn: 0n, shares: 0n, first: 0, last: 0, count: 0 };
      if (e.kind === "deposit") {
        m.deposited += e.assets;
        m.shares += e.shares;
      } else {
        m.withdrawn += e.assets;
        m.shares -= e.shares;
      }
      if (e.timestamp) {
        m.first = m.first ? Math.min(m.first, e.timestamp) : e.timestamp;
        m.last = Math.max(m.last, e.timestamp);
      }
      m.count += 1;
    }
    return { mine: m, harvests: hv };
  }, [events, me]);

  const myEvents = useMemo(() => (me ? events.filter((e) => e.user === me) : []), [events, me]);

  // position: contract value if available, otherwise derived from events
  const shares =
    typeof myShares === "bigint" ? myShares : mine ? (mine.shares > 0n ? mine.shares : 0n) : loaded && isConnected ? 0n : undefined;
  const positionValue = shares === 0n ? 0n : shares !== undefined ? valueOf(shares) : undefined;
  const hasPosition = shares !== undefined && shares > 0n;

  const deposited = mine?.deposited ?? 0n;
  const withdrawn = mine?.withdrawn ?? 0n;
  const netPnl = positionValue !== undefined ? positionValue + withdrawn - deposited : undefined;
  const netPnlPct =
    netPnl !== undefined && deposited > 0n ? `${(Number((netPnl * 10000n) / deposited) / 100).toFixed(2)}%` : "—";
  const pnlClass = netPnl === undefined ? "" : netPnl >= 0n ? "yk-pos" : "yk-neg";

  const [range, setRange] = useState<Range>("ALL");
  const harvestRouted = harvests.reduce((s, h) => s + h.assets, 0n);
  const harvestFees = harvests.reduce((s, h) => s + h.fee, 0n);
  const pnlNum = netPnl !== undefined ? Number(formatUnits(netPnl, 6)) : undefined;

  // PnL line: rebuilt from the vault state at each harvest/deposit/withdrawal block, plus live readings
  const { points: pnlPoints } = usePnlHistory(TREASURY_ADDRESS, address, pnlNum, events, loaded && pnlNum !== undefined);

  const hasIdle = idleAssets !== undefined && (idleAssets as bigint) > 0n;
  const harvestLabel = isHarvesting || harvestConfirming ? "Harvesting…" : "Harvest now →";

  // ---------- PDF report: summary, fee deductions and every transaction of THIS wallet ----------
  const [pdfBusy, setPdfBusy] = useState(false);
  const exportReport = async () => {
    if (!address || pdfBusy) return;
    if (!feesLoaded) {
      window.alert("Fee history is still loading. Try again in a few seconds.");
      return;
    }
    setPdfBusy(true);
    try {
      const stamp = (ms: number) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "date pending");
      const asc = (v: bigint) => `${v > 0n ? "+" : v < 0n ? "-" : ""}${formatUSDC(v < 0n ? -v : v)}`;

      const paidFee: bigint = fees.reduce<bigint>((s, f) => s + f.fee, 0n);
      const openFee: bigint = feeNow?.feeDue ?? 0n;
      const net0: bigint = netPnl ?? 0n; // already after fees that were paid
      const gross: bigint = net0 + paidFee; // profit before any fee
      const netAfter: bigint = gross - paidFee - openFee; // after paid and still-open fee
      const pct = deposited > 0n ? `${(Number((netAfter * 10000n) / deposited) / 100).toFixed(2)}%` : "n/a";
      const tone = (v: bigint) => (v > 0n ? ("pos" as const) : v < 0n ? ("neg" as const) : undefined);

      const summary = [
        { label: "Total deposited", value: `${formatUSDC(deposited)} USDC` },
        { label: "Total withdrawn", value: `${formatUSDC(withdrawn)} USDC` },
        { label: "Current position value", value: `${formatUSDC(positionValue ?? 0n)} USDC` },
        { label: "Profit before fee", value: `${asc(gross)} USDC`, tone: tone(gross) },
        { label: "Performance fee paid (10% of profit)", value: `${paidFee > 0n ? "-" : ""}${formatUSDC(paidFee)} USDC`, tone: paidFee > 0n ? ("neg" as const) : undefined },
        ...(openFee > 0n ? [{ label: "Fee still open on current position (not yet charged)", value: `${formatUSDC(openFee)} USDC` }] : []),
        { label: `Net profit after fee (${pct} of deposited)`, value: `${asc(netAfter)} USDC`, tone: tone(netAfter) },
      ];

      await downloadReportPdf(
        {
          wallet: address,
          vault: TREASURY_ADDRESS,
          feeWallet: typeof feeWalletAddr === "string" ? feeWalletAddr : undefined,
          network: USES_MOCK_ADAPTER ? "Base Sepolia (testnet)" : "Base",
          generated: stamp(Date.now()),
          testnet: USES_MOCK_ADAPTER,
          summary,
          fees: fees
            .slice()
            .reverse()
            .map((f) => ({ date: stamp(f.timestamp), profit: formatUSDC(f.profit), fee: formatUSDC(f.fee), tx: f.txHash })),
          txs: myEvents
            .slice()
            .reverse()
            .map((e) => ({
              date: stamp(e.timestamp),
              type: e.kind.charAt(0).toUpperCase() + e.kind.slice(1),
              usdc: formatUSDC(e.assets),
              shares: formatUSDC(e.shares),
              tx: e.txHash,
            })),
          txUrl: (h) => BASESCAN.tx(h),
        },
        `yieldkeep-treasury-report-${address.slice(0, 8)}.pdf`
      );
    } catch (err) {
      console.error(err);
      window.alert("Could not create the PDF. In the frontend folder run: npm install jspdf jspdf-autotable --legacy-peer-deps");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="dashboard">
      <ChartStyles />
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Your treasury</h1>
          <p className="dash-sub">
            {address ? `${shortAddress(address)} · ` : ""}YieldKeep USDC Prime · non-custodial USDC vault.
          </p>
          <div className="yk-hero">
            <span className="yk-pill ok">● Base Sepolia</span>
            <span className={`yk-pill ${adapterPaused ? "bad" : "ok"}`}>{adapterPaused ? "Adapter paused" : "Adapter active"}</span>
            <span className="yk-pill">Aave V3 · USDC</span>
            {USES_MOCK_ADAPTER && <span className="yk-pill warn">Testnet · yield simulated</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/deposit" prefetch className="btn-primary" style={{ padding: "10px 18px" }}>
            Deposit
          </Link>
          <Link href="/withdraw" prefetch className="btn-ghost" style={{ padding: "10px 18px" }}>
            Withdraw
          </Link>
        </div>
      </div>

      {adapterPaused && (
        <div className="alert alert-red">⚠ Adapter is paused. Deposits and withdrawals are halted on-chain.</div>
      )}

      {hasIdle && (
        <div className="card harvest-card" style={{ marginBottom: 24 }}>
          <div className="harvest-inner">
            <div>
              <div className="harvest-label">IDLE USDC IN VAULT</div>
              <div className="harvest-value">{formatUSDC(idleAssets as bigint)} USDC</div>
              <div className="harvest-note">Route these funds into Aave V3 to put them to work.</div>
            </div>
            <button
              className="btn-primary"
              style={{ padding: "12px 24px" }}
              disabled={isHarvesting || harvestConfirming}
              onClick={onHarvest}
            >
              {harvestLabel}
            </button>
          </div>
        </div>
      )}

      {/* ---------- top numbers: yours first, then the vault ---------- */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Your position</div>
          <div className="stat-value num">
            {l6 || isLoading ? "…" : positionValue !== undefined ? `${formatUSDC(positionValue)} USDC` : "—"}
          </div>
          <div className="stat-sub">{hasPosition ? `${formatUSDC(shares!)} shares` : "No open position"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Net PnL
            {USES_MOCK_ADAPTER && <span className="simulated-tag">Simulated</span>}
          </div>
          <div className={`stat-value num ${pnlClass}`}>{netPnl === undefined ? "—" : `${signed(netPnl)} USDC`}</div>
          <div className="stat-sub">{netPnlPct} of deposited</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vault TVL</div>
          <div className="stat-value num">{isLoading ? "…" : `${formatUSDC(ta)} USDC`}</div>
          <div className="stat-sub">All treasuries combined</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Share price
            {USES_MOCK_ADAPTER && <span className="simulated-tag">Simulated</span>}
          </div>
          <div className="stat-value num">{isLoading ? "…" : sharePrice}</div>
          <div className="stat-sub">USDC per share, at last read</div>
        </div>
      </div>

      {/* ---------- range + sync ---------- */}
      <div className="yk-toolbar">
        <div className="yk-seg" role="group" aria-label="Range">
          {(["7D", "30D", "ALL"] as Range[]).map((r) => (
            <button key={r} className={range === r ? "is-on" : ""} onClick={() => setRange(r)}>{r === "ALL" ? "All" : r}</button>
          ))}
        </div>
        <span className="yk-sub" style={{ margin: 0 }}>
          {syncing ? `Reading chain… ${progress}%` : "Live from on-chain events · hover for details"}
        </span>
      </div>

      {/* ---------- ONE graph: your Net PnL line + gains/losses ring + harvests ---------- */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            Net PnL over time
            {USES_MOCK_ADAPTER && <span className="simulated-tag">Yield simulated</span>}
          </h2>
          {mine && (
            <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={exportReport} disabled={pdfBusy}>
              {pdfBusy ? "Preparing PDF…" : "Download report (PDF)"}
            </button>
          )}
        </div>
        <p className="yk-sub">
          Your profit or loss from yield. Deposits and withdrawals do not move this line, only harvests and yield do.
        </p>

        {!isConnected ? (
          <p className="empty">Connect your treasury wallet to see your position and PnL.</p>
        ) : !loaded && !mine && typeof myShares !== "bigint" ? (
          <p className="empty">Reading your history from the chain… {progress > 0 ? `${progress}%` : ""}</p>
        ) : !mine && !hasPosition ? (
          <>
            <p className="empty">This wallet has not deposited yet. After your first deposit, your position, PnL and graph appear here.</p>
            <Link href="/deposit" prefetch className="btn-primary">Make a deposit</Link>
          </>
        ) : (
          <>
            {error && <div className="alert alert-warn" style={{ marginTop: 12 }}>⚠ {error}</div>}
            {warning && !error && <div className="alert alert-warn" style={{ marginTop: 12 }}>{warning}</div>}

            <div className="yk-sum">
              <div>
                <span>Cost basis (net deposits)</span>
                <b>{formatUSDC(deposited > withdrawn ? deposited - withdrawn : 0n)} USDC</b>
              </div>
              <div>
                <span>Live position value</span>
                <b>{positionValue !== undefined ? `${formatUSDC(positionValue)} USDC` : "…"}</b>
              </div>
              <div>
                <span>Net PnL</span>
                <b className={pnlClass}>{netPnl === undefined ? "…" : `${signed(netPnl)} USDC · ${netPnlPct}`}</b>
              </div>
            </div>
            {pnlNum !== undefined ? (
              <PnlLine points={pnlPoints} range={range} live={pnlNum} />
            ) : (
              <div className="yk-empty">Reading your position…</div>
            )}
            <div className="yk-keys">
              <span><i style={{ background: "#22c55e" }} />Profit (above 0)</span>
              <span><i style={{ background: "#ef4444" }} />Loss (below 0)</span>
              <span><i style={{ background: "#22c55e", borderRadius: 2, transform: "rotate(45deg)" }} />Harvest</span>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="row"><span>Total deposited (cost basis)</span><b className="num">{formatUSDC(deposited)} USDC</b></div>
              <div className="row"><span>Total withdrawn</span><b className="num">{formatUSDC(withdrawn)} USDC</b></div>
              <div className="row"><span>First deposit</span><b>{fmtDate(mine?.first ?? 0)}</b></div>
              <div className="row"><span>Last activity</span><b>{fmtDate(mine?.last ?? 0)}</b></div>
              <div className="row"><span>Transactions</span><b className="num">{mine?.count ?? 0}</b></div>
            </div>

            {harvests.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="yk-sub" style={{ marginBottom: 6 }}>
                  Recent harvests (whole vault) · {harvests.length} total · routed {formatUSDC(harvestRouted)} USDC · fees {formatUSDC(harvestFees)} USDC
                </div>
                {harvests.slice(0, 5).map((h) => (
                  <div className="row" key={h.txHash}>
                    <span>
                      {fmtDate(h.timestamp)} ·{" "}
                      <a href={BASESCAN.tx(h.txHash)} target="_blank" rel="noreferrer" className="contract-link">
                        {h.txHash.slice(0, 10)}… ↗
                      </a>
                    </span>
                    <b className="num">{formatUSDC(h.assets)} USDC routed · fee {formatUSDC(h.fee)}</b>
                  </div>
                ))}
              </div>
            )}

            <p className="fee-note">
              Net PnL = current position value + withdrawals − deposits. A fee already deducted at withdrawal is included. A fee still open on a current position is shown in the fee card below.
              {USES_MOCK_ADAPTER ? " On this testnet the yield source is a mock adapter, so figures are simulated." : ""}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Link href="/deposit" prefetch className="btn-primary">Deposit more</Link>
              <Link href="/withdraw" prefetch className="btn-ghost">Withdraw</Link>
              <Link href="/activity" prefetch className="btn-ghost">Full history</Link>
              <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={refresh} disabled={syncing}>
                Refresh
              </button>
            </div>
          </>
        )}
      </div>

      {/* ---------- fee: profit, 10% fee, what you keep, every deduction ---------- */}
      <FeeCard estimatePnl={netPnl} fees={fees} feesLoaded={feesLoaded} />

      {/* ---------- your recent transactions ---------- */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Your recent transactions</h2>
          <Link href="/activity" prefetch className="contract-link">Full history →</Link>
        </div>
        {!loaded && myEvents.length === 0 ? (
          <p className="empty">Reading the chain…</p>
        ) : myEvents.length === 0 ? (
          <p className="empty">No transactions from this wallet yet.</p>
        ) : (
          <ul className="yk-feed">
            {myEvents.slice(0, 8).map((e) => (
              <li key={`${e.txHash}-${e.kind}`}>
                <AddressAvatar address={e.user!} size={32} />
                <div className="grow">
                  <div className="who">
                    <span className={`yk-kind ${e.kind}`}>{e.kind}</span>
                  </div>
                  <div className="when">
                    {e.timestamp ? new Date(e.timestamp).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "time pending"} ·{" "}
                    <a href={BASESCAN.tx(e.txHash)} target="_blank" rel="noreferrer" className="contract-link">{e.txHash.slice(0, 10)}… ↗</a>
                  </div>
                </div>
                <div className="amt">
                  {e.kind === "deposit" ? "+" : "−"}
                  {formatUSDC(e.assets)} USDC
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dash-row">
        <div className="card">
          <h2 className="card-title">Fees</h2>
          <div className="row"><span>Management fee</span><b>0%</b></div>
          <div className="row"><span>Performance fee</span><b>10% of profit</b></div>
          <p className="fee-note">Taken only from profit, per treasury, on your yearly date and when you withdraw. Never from your deposit.</p>
        </div>

        <div className="card">
          <h2 className="card-title">Contracts</h2>
          {(
            [
              ["Vault", ADDRESSES.treasury],
              ["Adapter", ADDRESSES.adapter],
              ["USDC", ADDRESSES.usdc],
            ] as const
          ).map(([label, addr]) => (
            <div className="row" key={label}>
              <span>{label}</span>
              <a href={BASESCAN.address(addr)} target="_blank" rel="noreferrer" className="contract-link">
                {shortAddress(addr)} ↗
              </a>
            </div>
          ))}
          <p className="fee-note">Verify every address on BaseScan before depositing. Testnet demo: unaudited, no real funds.</p>
        </div>
      </div>
    </div>
  );
}