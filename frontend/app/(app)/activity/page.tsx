"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { BASESCAN, TREASURY_ABI, TREASURY_ADDRESS } from "@/lib/contracts";
import { formatUSDC, shortAddress } from "@/lib/format";
import { readLocalActivity } from "@/lib/activity-store";
import { useFeeEvents } from "@/lib/use-fee";
import { downloadReportPdf } from "@/lib/report-pdf";
import { checkDownload, getAllowance, type Allowance } from "@/lib/report-usage";
import { ReportDownloads } from "@/app/components/ReportDownloads";
import { SubscriptionHistory } from "@/app/components/SubscriptionHistory";
import { ZonePicker } from "@/app/components/ZonePicker";
import { getViewAs, readMemberships, setViewAs, type Membership } from "@/lib/invite";
import { fmtScreen, fmtShort, fmtStamp, fmtTimeOnly, offsetLabel, partsIn, useZone } from "@/lib/timezone";
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";
import "./activity.css";

type Kind = "deposit" | "withdraw" | "harvest";
type Item = {
  kind: Kind;
  assets: bigint;
  shares: bigint;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
  timestamp: number; // ms, 0 = not fetched yet
};
type Cache = { lastBlock: bigint; items: Item[] };

// Optional: NEXT_PUBLIC_VAULT_DEPLOY_BLOCK in .env.local = exact first block of the vault.
const ENV_DEPLOY = process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK;
const MAX_LOOKBACK = 1_500_000n; // ~35 days on Base, used only when deploy block is unknown
const CHUNK = 10000n; // most public RPCs accept up to 10k blocks per getLogs
const MIN_CHUNK = 500n;
const LOG_WORKERS = 4;
const CALL_TIMEOUT = 15000;
const RANGE_ERR = /range|limit|too many|exceed|block.*(size|span)|10000|returned more|response size|timeout|timed out/i;
const BLOCK_WORKERS = 8;
const POLL_MS = 15000;
const PAGE_SIZE = 50;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const KIND_LABEL: Record<Kind, string> = { deposit: "Deposited", withdraw: "Withdrawn", harvest: "Harvested" };
const KIND_ICON: Record<Kind, string> = { deposit: "↧", withdraw: "↥", harvest: "✦" };

/* ---------- helpers ---------- */
const isBig = (v: unknown): v is bigint => typeof v === "bigint";
function pick(args: Record<string, unknown>, names: string[]): bigint | undefined {
  for (const n of names) if (isBig(args[n])) return args[n] as bigint;
  return undefined;
}
const mentions = (args: Record<string, unknown>, user: string) =>
  Object.values(args).some((v) => typeof v === "string" && v.toLowerCase() === user);

function parseLog(l: any, user: string): Item | null {
  const args: Record<string, unknown> = l.args ?? {};
  const nums = Object.values(args).filter(isBig) as bigint[];
  const base = {
    txHash: l.transactionHash as `0x${string}`,
    logIndex: Number(l.logIndex ?? 0),
    blockNumber: l.blockNumber as bigint,
    timestamp: 0,
  };
  const name = String(l.eventName);
  if (name === "Deposit" && mentions(args, user)) {
    return { kind: "deposit", assets: pick(args, ["amount", "assets"]) ?? nums[0] ?? 0n, shares: pick(args, ["sharesMinted", "shares"]) ?? nums[1] ?? 0n, ...base };
  }
  if (name === "Withdraw" && mentions(args, user)) {
    return { kind: "withdraw", assets: pick(args, ["amountReturned", "amount", "assets"]) ?? nums[1] ?? 0n, shares: pick(args, ["sharesBurned", "shares"]) ?? nums[0] ?? 0n, ...base };
  }
  if (name === "Harvest") {
    return { kind: "harvest", assets: pick(args, ["amountDeployed", "amount", "assets", "deployed"]) ?? nums[0] ?? 0n, shares: 0n, ...base };
  }
  return null;
}

function loadCache(key: string): Cache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      lastBlock: BigInt(p.lastBlock),
      items: p.items.map((i: any) => ({ ...i, assets: BigInt(i.assets), shares: BigInt(i.shares), blockNumber: BigInt(i.blockNumber) })),
    };
  } catch {
    return null;
  }
}
function saveCache(key: string, c: Cache) {
  try {
    localStorage.setItem(key, JSON.stringify(c, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  } catch {}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("RPC timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function pool<T>(jobs: (() => Promise<T>)[], workers: number) {
  let next = 0;
  const run = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, run));
}

const sortItems = (a: Item, b: Item) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1;
const keyOf = (i: Item) => `${i.txHash.toLowerCase()}-${i.kind}`;

export default function ActivityPage() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();

  // Team members can view the treasury they were invited to. "subject" = the treasury whose data is shown.
  const [viewAs, setViewAsState] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  useEffect(() => {
    const load = () => {
      setMemberships(readMemberships(address));
      setViewAsState(getViewAs(address));
    };
    load();
    window.addEventListener("yk-viewas", load);
    return () => window.removeEventListener("yk-viewas", load);
  }, [address]);
  const subject = (viewAs ?? address) as `0x${string}` | undefined;
  const [items, setItems] = useState<Item[] | null>(null);
  const [local, setLocal] = useState<Item[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updated, setUpdated] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<"all" | Kind>("all");
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // switching treasury: start from a clean list
  useEffect(() => {
    setItems(null);
    setLocal([]);
  }, [subject]);

  const { zone } = useZone();
  const runRef = useRef(0);
  const syncingRef = useRef(false);

  // performance fees already deducted from this wallet (shown in the PDF), and the PDF state
  const { fees: allFees, loaded: feesLoaded } = useFeeEvents(subject);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [limitHit, setLimitHit] = useState<string | null>(null);
  const [allow, setAllow] = useState<Allowance | null>(null);
  useEffect(() => {
    const load = () => setAllow(getAllowance(subject));
    load();
    window.addEventListener("yk-report", load);
    return () => window.removeEventListener("yk-report", load);
  }, [subject]);

  /* ---------- instant local records (own transactions) ---------- */
  useEffect(() => {
    const load = () =>
      setLocal(
        readLocalActivity(subject).map((e) => ({
          kind: e.kind,
          assets: BigInt(e.assets),
          shares: BigInt(e.shares),
          txHash: e.txHash as `0x${string}`,
          logIndex: -1,
          blockNumber: BigInt(e.blockNumber),
          timestamp: e.timestamp,
        }))
      );
    load();
    window.addEventListener("yk-activity", load);
    return () => window.removeEventListener("yk-activity", load);
  }, [subject]);

  /* ---------- poll for new blocks ---------- */
  useEffect(() => {
    const id = setInterval(() => {
      if (!syncingRef.current && !document.hidden) setTick((t) => t + 1);
    }, POLL_MS);
    const onVisible = () => !document.hidden && !syncingRef.current && setTick((t) => t + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /* ---------- chain sync ---------- */
  useEffect(() => {
    if (!client || !subject) {
      setItems(null);
      return;
    }
    const cacheKey = `yk_activity_v4_${String(TREASURY_ADDRESS).toLowerCase()}_${subject.toLowerCase()}`;
    const cached = loadCache(cacheKey);
    if (cached) setItems((p) => p ?? cached.items);

    const myRun = ++runRef.current;
    const cancelled = () => runRef.current !== myRun;
    const all = new Map<string, Item>();
    for (const i of cached?.items ?? []) all.set(keyOf(i), i);

    (async () => {
      syncingRef.current = true;
      const firstScan = !cached;
      if (firstScan) setSyncing(true);
      try {
        setError(null);
        if (firstScan) setProgress(2);
        const latest = await withTimeout(client.getBlockNumber(), CALL_TIMEOUT);
        const user = subject.toLowerCase();
        let failed = false;
        let lastErr = "";

        // read logs for a range. Range/size errors halve the range; other errors retry, then give up.
        const scan = async (a: bigint, b: bigint, out: Item[], attempt = 0): Promise<void> => {
          try {
            const logs: any[] = await withTimeout(
              client.getContractEvents({
                address: TREASURY_ADDRESS,
                abi: TREASURY_ABI,
                fromBlock: a,
                toBlock: b,
              } as any),
              CALL_TIMEOUT
            );
            for (const l of logs) {
              const it = parseLog(l, user);
              if (it) out.push(it);
            }
          } catch (e: any) {
            const msg = String(e?.shortMessage || e?.message || e);
            lastErr = msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
            if (RANGE_ERR.test(msg) && b - a + 1n > MIN_CHUNK) {
              const mid = (a + b) / 2n;
              await scan(a, mid, out);
              await scan(mid + 1n, b, out);
            } else if (attempt < 2) {
              await sleep(700 * (attempt + 1));
              await scan(a, b, out, attempt + 1);
            } else {
              failed = true;
            }
          }
        };

        // timestamps + merge + show
        const absorb = async (fresh: Item[]) => {
          const need = [...new Set(fresh.filter((i) => !i.timestamp).map((i) => i.blockNumber))];
          const ts = new Map<string, number>();
          await pool(
            need.map((bn) => async () => {
              try {
                const blk = await client.getBlock({ blockNumber: bn });
                ts.set(bn.toString(), Number(blk.timestamp) * 1000);
              } catch {}
            }),
            BLOCK_WORKERS
          );
          for (const i of fresh) {
            if (!i.timestamp) i.timestamp = ts.get(i.blockNumber.toString()) ?? 0;
            all.set(keyOf(i), i);
          }
          if (!cancelled()) setItems([...all.values()].sort(sortItems));
        };

        if (cached) {
          // ---- quick mode: only blocks added since last visit ----
          const from = cached.lastBlock + 1n;
          if (from <= latest) {
            const ranges: [bigint, bigint][] = [];
            for (let c = from; c <= latest; c += CHUNK) ranges.push([c, c + CHUNK - 1n > latest ? latest : c + CHUNK - 1n]);
            const fresh: Item[] = [];
            await pool(ranges.map(([a, b]) => () => scan(a, b, fresh)), LOG_WORKERS);
            if (cancelled()) return;
            await absorb(fresh);
            if (!failed) saveCache(cacheKey, { lastBlock: latest, items: [...all.values()].sort(sortItems) });
          } else if (!cancelled()) {
            setItems([...all.values()].sort(sortItems));
          }
        } else {
          // ---- first load: newest blocks first, show results as they arrive ----
          const lowest = ENV_DEPLOY
            ? BigInt(ENV_DEPLOY)
            : latest > MAX_LOOKBACK
            ? latest - MAX_LOOKBACK
            : 0n;
          const span = latest - lowest + 1n;
          let hi = latest;
          let reachedStart = false;

          while (hi >= lowest && !cancelled()) {
            const ranges: [bigint, bigint][] = [];
            for (let k = 0; k < LOG_WORKERS && hi >= lowest; k++) {
              const lo = hi - CHUNK + 1n < lowest ? lowest : hi - CHUNK + 1n;
              ranges.push([lo, hi]);
              hi = lo - 1n;
            }
            const fresh: Item[] = [];
            await pool(ranges.map(([a, b]) => () => scan(a, b, fresh)), LOG_WORKERS);
            if (cancelled()) return;
            await absorb(fresh);
            setProgress(Math.min(99, Number(((latest - hi) * 100n) / span)));

            // stop once we are before the vault existed
            if (!ENV_DEPLOY) {
              try {
                const code = await client.getCode({ address: TREASURY_ADDRESS, blockNumber: ranges[ranges.length - 1][0] });
                if (!code || code === "0x") {
                  reachedStart = true;
                  break;
                }
              } catch {
                /* archive state unavailable: keep scanning to the lookback limit */
              }
            }
          }
          if (cancelled()) return;
          setItems([...all.values()].sort(sortItems));
          if (!failed) saveCache(cacheKey, { lastBlock: latest, items: [...all.values()].sort(sortItems) });
          if (failed) setWarning(`The RPC did not answer for some block ranges (${lastErr || "unknown error"}). Your newest transactions are shown; press Refresh to retry.`);
          else if (!ENV_DEPLOY && !reachedStart)
            setWarning("Showing roughly the last 35 days. Set NEXT_PUBLIC_VAULT_DEPLOY_BLOCK in .env.local to load the full history.");
          else setWarning(null);
        }
        if (!cancelled()) setUpdated(Date.now());
      } catch (e: any) {
        if (!cancelled()) {
          setError(e?.shortMessage || e?.message || "Failed to load activity");
          setItems((p) => p ?? []);
        }
      } finally {
        if (!cancelled()) {
          syncingRef.current = false;
          setSyncing(false);
          setProgress(100);
        }
      }
    })();

    return () => {
      runRef.current++; // cancels this run
      syncingRef.current = false;
    };
  }, [client, subject, tick]);

  /* ---------- merge chain items + instant local records ---------- */
  const merged = useMemo(() => {
    const map = new Map<string, Item>();
    for (const i of local) map.set(keyOf(i), i);
    for (const i of items ?? []) map.set(keyOf(i), i); // chain data wins
    return [...map.values()].sort((a, b) => b.timestamp - a.timestamp || sortItems(a, b));
  }, [items, local]);

  /* ---------- calendar data ---------- */
  const withTime = useMemo(() => merged.filter((i) => i.timestamp > 0), [merged]);
  const years = useMemo(() => [...new Set(withTime.map((i) => partsIn(i.timestamp, zone).y))].sort((a, b) => b - a), [withTime, zone]);
  const monthCounts = useMemo(() => {
    const m = new Array(12).fill(0);
    if (year === null) return m;
    for (const i of withTime) {
      const d = partsIn(i.timestamp, zone);
      if (d.y === year) m[d.m]++;
    }
    return m;
  }, [withTime, year, zone]);
  const dayCounts = useMemo(() => {
    const m = new Map<number, number>();
    if (year === null || month === null) return m;
    for (const i of withTime) {
      const d = partsIn(i.timestamp, zone);
      if (d.y === year && d.m === month) m.set(d.d, (m.get(d.d) ?? 0) + 1);
    }
    return m;
  }, [withTime, year, month, zone]);

  const reset = () => setVisible(PAGE_SIZE);
  const pickYear = (y: number) => { setYear(year === y ? null : y); setMonth(null); setDay(null); reset(); };
  const pickMonth = (m: number) => { setMonth(month === m ? null : m); setDay(null); reset(); };
  const pickDay = (d: number) => { setDay(day === d ? null : d); reset(); };
  const clearDates = () => { setYear(null); setMonth(null); setDay(null); reset(); };

  /* ---------- filtering ---------- */
  const filtered = useMemo(
    () =>
      merged.filter((i) => {
        if (kind !== "all" && i.kind !== kind) return false;
        if (year === null) return true;
        if (!i.timestamp) return false;
        const d = partsIn(i.timestamp, zone);
        if (d.y !== year) return false;
        if (month !== null && d.m !== month) return false;
        if (day !== null && d.d !== day) return false;
        return true;
      }),
    [merged, kind, year, month, day, zone]
  );

  const totals = useMemo(() => {
    let dep = 0n;
    let wd = 0n;
    for (const i of filtered) {
      if (i.kind === "deposit") dep += i.assets;
      if (i.kind === "withdraw") wd += i.assets;
    }
    return { dep, wd };
  }, [filtered]);

  const rangeLabel =
    year === null ? "All time" : month === null ? `${year}` : day === null ? `${MONTHS[month]} ${year}` : `${day} ${MONTHS[month]} ${year}`;

  // ---------- PDF report for the selected period ----------
  const exportPdf = async () => {
    if (!address || pdfBusy) return;
    const blockedMsg = checkDownload(subject as string, address as string);
    if (blockedMsg) {
      setLimitHit(blockedMsg);
      return;
    }
    if (!feesLoaded) {
      window.alert("Fee history is still loading. Try again in a few seconds.");
      return;
    }
    setLimitHit(null);
    setPdfBusy(true);
    try {
      const inRange = (ts: number) => {
        if (year === null) return true;
        if (!ts) return false;
        const d = partsIn(ts, zone);
        if (d.y !== year) return false;
        if (month !== null && d.m !== month) return false;
        if (day !== null && d.d !== day) return false;
        return true;
      };
      const stamp = (ms: number) => fmtShort(ms, zone);
      const feesInRange = allFees.filter((f) => inRange(f.timestamp));
      const feePaid = feesInRange.reduce((s, f) => s + f.fee, 0n);
      const deposits = merged.filter((i) => i.kind === "deposit" && i.timestamp > 0);
      const firstDeposit = deposits.length ? Math.min(...deposits.map((i) => i.timestamp)) : 0;
      const kindWord = kind === "deposit" ? "deposits only" : kind === "withdraw" ? "withdrawals only" : "harvests only";
      const period = kind === "all" ? rangeLabel : `${rangeLabel} - ${kindWord}`;

      await downloadReportPdf(
        {
          wallet: subject as string,
          vault: TREASURY_ADDRESS,
          network: USES_MOCK_ADAPTER ? "Base Sepolia (testnet)" : "Base",
          generated: fmtStamp(Date.now(), zone),
          tzNote: offsetLabel(Date.now(), zone),
          testnet: USES_MOCK_ADAPTER,
          title: "Treasury activity report",
          period,
          downloadedBy: address,
          summary: [
            { label: "Period", value: period },
            { label: "Deposited in this period", value: `${formatUSDC(totals.dep)} USDC` },
            { label: "Withdrawn in this period", value: `${formatUSDC(totals.wd)} USDC` },
            { label: "Performance fee deducted in this period (10% of profit)", value: `${feePaid > 0n ? "-" : ""}${formatUSDC(feePaid)} USDC`, tone: feePaid > 0n ? "neg" : undefined },
            { label: "Transactions in this period", value: String(filtered.length) },
            { label: "First deposit (all time)", value: fmtStamp(firstDeposit, zone) },
          ],
          fees: feesInRange
            .slice()
            .reverse()
            .map((f) => ({ date: stamp(f.timestamp), profit: formatUSDC(f.profit), fee: formatUSDC(f.fee), tx: f.txHash })),
          txs: filtered
            .slice()
            .reverse()
            .map((i) => ({
              date: stamp(i.timestamp),
              type: i.kind === "harvest" ? "Harvest (vault)" : i.kind.charAt(0).toUpperCase() + i.kind.slice(1),
              usdc: formatUSDC(i.assets),
              shares: i.kind === "harvest" ? "-" : formatUSDC(i.shares),
              tx: i.txHash,
            })),
          txUrl: (h) => BASESCAN.tx(h),
        },
        `yieldkeep-activity-${rangeLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`
      );
    } catch (err) {
      console.error(err);
      window.alert("Could not create the PDF. In the frontend folder run: npm install jspdf jspdf-autotable --legacy-peer-deps");
    } finally {
      setPdfBusy(false);
    }
  };

  const fmtDate = (ts: number) => fmtScreen(ts, zone);

  const grid = useMemo(() => {
    if (year === null || month === null) return [];
    const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
    const n = new Date(year, month + 1, 0).getDate();
    return [...Array(lead).fill(0), ...Array.from({ length: n }, (_, i) => i + 1)] as number[];
  }, [year, month]);

  const hasAny = merged.length > 0;
  const loadingFirst = items === null && !hasAny;

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Activity</h1>
          <p className="dash-sub">Every deposit, withdrawal and harvest for your wallet, from the first transaction to now.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {memberships.length > 0 && address && (
            <select
              value={viewAs ?? ""}
              onChange={(e) => setViewAs(address, e.target.value || null)}
              className="btn-ghost act-export"
              aria-label="Treasury to view"
            >
              <option value="">My wallet</option>
              {memberships.map((m) => (
                <option key={m.treasury} value={m.treasury}>
                  {m.name} · {shortAddress(m.treasury)} ({m.role})
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn-ghost act-export" onClick={() => !syncingRef.current && setTick((t) => t + 1)}>
            Refresh
          </button>
          {hasAny && (
            <button type="button" className="btn-ghost act-export" onClick={exportPdf} disabled={pdfBusy}>
              {pdfBusy ? "Preparing PDF…" : "Download PDF report"}
            </button>
          )}
        </div>
      </div>

      {viewAs && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          You are viewing the treasury {shortAddress(viewAs)} as {memberships.find((m) => m.treasury.toLowerCase() === viewAs.toLowerCase())?.role ?? "member"}. You can never move funds from here.
        </div>
      )}
      {limitHit && <div className="alert alert-warn" style={{ marginBottom: 16 }}>{limitHit}</div>}
      {hasAny && allow && !allow.unlimited && !limitHit && (
        <p className="act-muted" style={{ margin: "0 0 12px" }}>
          {allow.left} of {allow.limit} free PDF downloads left this month.
        </p>
      )}
      {error && <div className="alert alert-red" style={{ marginBottom: 16 }}>⚠ {error}</div>}
      {warning && <div className="alert alert-warn" style={{ marginBottom: 16 }}>{warning}</div>}

      {!isConnected ? (
        <div className="card"><p className="empty">Connect your wallet to see your activity.</p></div>
      ) : (
        <div className="act-layout">
          <div className="act-main">
            <div className="act-toolbar">
              <div className="act-chips" role="group" aria-label="Type">
                {(["all", "deposit", "withdraw", "harvest"] as const).map((k) => (
                  <button key={k} type="button" className={`act-chip${kind === k ? " is-on" : ""}`} onClick={() => { setKind(k); reset(); }}>
                    {k === "all" ? "All" : k === "deposit" ? "Deposits" : k === "withdraw" ? "Withdrawals" : "Harvests"}
                  </button>
                ))}
              </div>
              <div className="act-sync">
                {syncing ? (
                  <>Scanning older blocks… {progress}%</>
                ) : updated ? (
                  <><span className="act-live" /> Live · updated {fmtTimeOnly(updated, zone)}</>
                ) : null}
              </div>
            </div>
            {syncing && <div className="act-bar"><div style={{ width: `${progress}%` }} /></div>}

            <div className="act-summary">
              <div><span>Deposited</span><b>{formatUSDC(totals.dep)} USDC</b></div>
              <div><span>Withdrawn</span><b>{formatUSDC(totals.wd)} USDC</b></div>
              <div><span>Transactions · {rangeLabel}</span><b>{filtered.length}</b></div>
            </div>

            {loadingFirst ? (
              <div className="card">{[0, 1, 2, 3].map((i) => <div key={i} className="act-skel" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="card">
                <p className="empty">{syncing ? "Scanning the chain for your transactions…" : "No transactions for this selection."}</p>
                {!syncing && !hasAny && <Link href="/deposit" prefetch className="btn-primary">Go to Deposit →</Link>}
              </div>
            ) : (
              <div className="card act-list">
                {filtered.slice(0, visible).map((i) => (
                  <div key={keyOf(i)} className="act-row">
                    <span className={`act-icon k-${i.kind}`} aria-hidden>{KIND_ICON[i.kind]}</span>
                    <div className="act-body">
                      <div className="act-title">{KIND_LABEL[i.kind]} {formatUSDC(i.assets)} USDC</div>
                      <div className="act-meta">
                        {fmtDate(i.timestamp)}
                        {i.kind !== "harvest" && <> · {formatUSDC(i.shares)} shares</>} · block {i.blockNumber.toString()}
                      </div>
                    </div>
                    <a href={BASESCAN.tx(i.txHash)} target="_blank" rel="noreferrer" className="contract-link">
                      {shortAddress(i.txHash)} ↗
                    </a>
                  </div>
                ))}
                {filtered.length > visible && (
                  <button type="button" className="btn-ghost act-more" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                    Show more ({filtered.length - visible} left)
                  </button>
                )}
              </div>
            )}
          </div>

          <aside className="act-cal card" aria-label="Filter by date">
            <div className="act-cal-head">
              <h2 className="card-title" style={{ margin: 0 }}>Date</h2>
              {year !== null && <button type="button" className="act-link" onClick={clearDates}>Clear</button>}
            </div>

            <div className="act-cal-label">Year</div>
            <div className="act-years">
              {years.length === 0 && <span className="act-muted">No dated transactions yet</span>}
              {years.map((y) => (
                <button key={y} type="button" className={`act-chip${year === y ? " is-on" : ""}`} onClick={() => pickYear(y)}>{y}</button>
              ))}
            </div>

            {year !== null && (
              <>
                <div className="act-cal-label">Month</div>
                <div className="act-months">
                  {MONTHS.map((m, idx) => (
                    <button
                      key={m}
                      type="button"
                      disabled={monthCounts[idx] === 0}
                      className={`act-cell${month === idx ? " is-on" : ""}${monthCounts[idx] ? " has" : ""}`}
                      onClick={() => pickMonth(idx)}
                    >
                      {m}
                      {monthCounts[idx] > 0 && <i>{monthCounts[idx]}</i>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {year !== null && month !== null && (
              <>
                <div className="act-cal-label">Day</div>
                <div className="act-dow">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
                <div className="act-days">
                  {grid.map((d, idx) =>
                    d === 0 ? (
                      <span key={`e${idx}`} />
                    ) : (
                      <button
                        key={d}
                        type="button"
                        disabled={!dayCounts.get(d)}
                        className={`act-day${day === d ? " is-on" : ""}${dayCounts.get(d) ? " has" : ""}`}
                        onClick={() => pickDay(d)}
                        title={dayCounts.get(d) ? `${dayCounts.get(d)} transaction(s)` : undefined}
                      >
                        {d}
                      </button>
                    )
                  )}
                </div>
              </>
            )}
            <ZonePicker />
          </aside>
        </div>
      )}

      {isConnected && <ReportDownloads treasury={subject} viewer={address} />}
      {isConnected && <SubscriptionHistory treasury={subject} viewer={address} />}
    </div>
  );
}