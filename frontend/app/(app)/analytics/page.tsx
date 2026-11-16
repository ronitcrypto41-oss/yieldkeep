"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useSignMessage, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { TREASURY_ADDRESS } from "@/lib/contracts";

const AUTH_KEY = "yk_admin_auth_v1";
const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TIERS = ["free", "pro", "business", "enterprise"] as const;
type Tier = (typeof TIERS)[number];

const OWNER_ABI = [
  { type: "function", name: "harvest", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "user", type: "address" }], outputs: [] },
] as const;

type Row = {
  address: string; firstDeposit: number; lastActivity: number; deposited: string; withdrawn: string; value: string;
  pnl: string; profit: string; realized: string; feeDue: string; feesPaid: string; nextSettleAt: number;
  txCount: number; active: boolean; tier: Tier; subUntil: number; subPaid: string;
};
type Stats = {
  generatedAt: number; lastBlock: string; paymentWalletSet: boolean; paymentsOk: boolean;
  totals: Record<string, any> & { tiers: Record<Tier, number> };
  months: { month: string; newTreasuries: number; fees: string; subs: string; profitCharged: string }[];
  newPerDay: { day: string; count: number }[];
  treasuries: Row[];
  subscribers: { address: string; tier: Tier; until: number; paid: string; payments: number; inVault: boolean }[];
  recent: any[];
};

const n = (v: string | number | bigint) => Number(v) / 1e6;
const usd = (v: string | number | bigint, d = 2) =>
  (n(v) < 0 ? "-$" : "$") + Math.abs(n(v)).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const date = (ms: number) => (ms ? new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Bars({ data, color, money = true }: { data: { label: string; value: number }[]; color: string; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="bars">
      {data.map((d) => (
        <div key={d.label} className="bar" title={`${d.label}: ${money ? "$" + d.value.toFixed(2) : d.value}`}>
          <div className="barv">{d.value ? (money ? "$" + (d.value >= 100 ? d.value.toFixed(0) : d.value.toFixed(1)) : d.value) : ""}</div>
          <div className="barcol"><div style={{ height: `${(Math.abs(d.value) / max) * 100}%`, background: d.value < 0 ? "#ff6b6b" : color }} /></div>
          <div className="barl">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  const [auth, setAuth] = useState<{ message: string; signature: string } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"overview" | "treasuries" | "subs" | "tools">("overview");
  const [note, setNote] = useState("");

  const [q, setQ] = useState("");
  const [fMonth, setFMonth] = useState("all");
  const [fYear, setFYear] = useState("all");
  const [fPlan, setFPlan] = useState("all");
  const [fAge, setFAge] = useState("all");
  const [fState, setFState] = useState("all");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_KEY);
      if (raw) setAuth(JSON.parse(raw));
    } catch {}
  }, []);

  const load = useCallback(async (a: { message: string; signature: string }) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          try { sessionStorage.removeItem(AUTH_KEY); } catch {}
          setAuth(null);
        }
        throw new Error(j.error || "Request failed");
      }
      setStats(j);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    load(auth);
    const t = setInterval(() => load(auth), 30000);
    return () => clearInterval(t);
  }, [auth, load]);

  async function login() {
    if (!address) return;
    setErr("");
    try {
      const message = `YieldKeep admin login\nIssued: ${Date.now()}`;
      const signature = await signMessageAsync({ account: address, message });
      const a = { message, signature };
      try { sessionStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch {}
      setAuth(a);
    } catch (e: any) {
      setErr(String(e?.shortMessage || e?.message || e));
    }
  }

  const years = useMemo(() => {
    const s = new Set<number>();
    stats?.treasuries.forEach((t) => t.firstDeposit && s.add(new Date(t.firstDeposit).getUTCFullYear()));
    return [...s].sort();
  }, [stats]);

  const now = Date.now();
  const rows = useMemo(() => {
    if (!stats) return [];
    const needle = q.trim().toLowerCase();
    return stats.treasuries.filter((t) => {
      if (needle && !t.address.includes(needle)) return false;
      const d = t.firstDeposit ? new Date(t.firstDeposit) : null;
      if (fMonth !== "all" && (!d || d.getUTCMonth() !== Number(fMonth))) return false;
      if (fYear !== "all" && (!d || d.getUTCFullYear() !== Number(fYear))) return false;
      if (fPlan === "none" && t.tier !== "free") return false;
      if (fPlan === "any" && t.tier === "free") return false;
      if (TIERS.includes(fPlan as Tier) && fPlan !== "free" && t.tier !== fPlan) return false;
      const done = !!t.firstDeposit && t.firstDeposit + 365 * DAY <= now;
      if (fAge === "complete" && !done) return false;
      if (fAge === "running" && done) return false;
      if (fState === "active" && !t.active) return false;
      if (fState === "closed" && t.active) return false;
      return true;
    });
  }, [stats, q, fMonth, fYear, fPlan, fAge, fState, now]);

  const sum = useMemo(() => {
    let value = 0n, profit = 0n, realized = 0n, paid = 0n, due = 0n, pnl = 0n, subPaid = 0n;
    for (const t of rows) {
      value += BigInt(t.value); profit += BigInt(t.profit); realized += BigInt(t.realized);
      paid += BigInt(t.feesPaid); due += BigInt(t.feeDue); pnl += BigInt(t.pnl); subPaid += BigInt(t.subPaid);
    }
    return { value, profit, realized, paid, due, pnl, subPaid, subbed: rows.filter((t) => t.tier !== "free").length };
  }, [rows]);

  function csv() {
    const head = ["address", "joined", "value", "total_pnl", "open_profit", "realized_profit", "fee_paid", "fee_due", "year_complete", "plan", "plan_until", "sub_paid"];
    const lines = rows.map((t) =>
      [t.address, t.firstDeposit ? new Date(t.firstDeposit).toISOString().slice(0, 10) : "", n(t.value), n(t.pnl), n(t.profit), n(t.realized), n(t.feesPaid), n(t.feeDue),
        t.firstDeposit && t.firstDeposit + 365 * DAY <= now ? "yes" : "no", t.tier, t.subUntil ? new Date(t.subUntil).toISOString().slice(0, 10) : "", n(t.subPaid)].join(",")
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `yieldkeep-treasuries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  async function run(fn: "harvest" | "settle", user?: string) {
    setNote("Confirm in your wallet…");
    try {
      const hash = await writeContractAsync({
        address: TREASURY_ADDRESS as `0x${string}`, abi: OWNER_ABI, functionName: fn as any, args: (user ? [user] : []) as any,
      } as any);
      setNote(`Sent ${fn}: ${String(hash).slice(0, 12)}… (refresh in a few seconds)`);
    } catch (e: any) {
      setNote(String(e?.shortMessage || e?.message || e).slice(0, 160));
    }
  }

  const css = (
    <style>{`
    .yka{--bg:#070b14;--p:#0d1424;--p2:#111a2f;--b:#1c2845;--t:#e6ecfa;--m:#8d9bbd;--a:#5b8cff;--g:#37d39b;--r:#ff6b6b;--y:#f5b942;
      min-height:100vh;background:radial-gradient(1200px 500px at 70% -10%,#13204a55,transparent),var(--bg);color:var(--t);font-family:Inter,system-ui,sans-serif;display:flex}
    .yka *{box-sizing:border-box}
    .yka aside{width:230px;flex:0 0 230px;background:var(--p);border-right:1px solid var(--b);padding:22px 14px;position:sticky;top:0;height:100vh}
    .yka .brand{font-weight:800;font-size:18px;padding:0 10px 4px}.yka .brand span{color:var(--a)}
    .yka .tag{margin:0 10px 22px;font-size:11px;letter-spacing:1.5px;color:var(--y);font-weight:700}
    .yka nav button{display:block;width:100%;text-align:left;background:none;border:0;color:var(--m);padding:11px 12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:4px}
    .yka nav button.on{background:#16244a;color:var(--t)}
    .yka nav button:hover{color:var(--t)}
    .yka main{flex:1;min-width:0;padding:26px 30px 60px}
    .yka h1{font-size:22px;margin:0 0 4px}.yka .sub{color:var(--m);font-size:13px;margin-bottom:22px}
    .yka .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:18px}
    .yka .card{background:var(--p);border:1px solid var(--b);border-radius:14px;padding:16px 18px}
    .yka .k{color:var(--m);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px}
    .yka .v{font-size:25px;font-weight:800;margin-top:6px}.yka .hint{color:var(--m);font-size:12px;margin-top:4px}
    .yka .g{color:var(--g)}.yka .r{color:var(--r)}.yka .y{color:var(--y)}.yka .a{color:var(--a)}
    .yka .two{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));margin-bottom:18px}
    .yka h3{margin:0 0 12px;font-size:14px}
    .yka .bars{display:flex;gap:6px;align-items:flex-end;height:170px}
    .yka .bar{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;height:100%}
    .yka .barcol{flex:1;width:100%;display:flex;align-items:flex-end}.yka .barcol div{width:100%;border-radius:5px 5px 0 0;min-height:2px}
    .yka .barv{font-size:10px;color:var(--m);height:14px;white-space:nowrap}.yka .barl{font-size:10px;color:var(--m);margin-top:6px}
    .yka .filters{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;align-items:center}
    .yka select,.yka input{background:var(--p2);color:var(--t);border:1px solid var(--b);border-radius:10px;padding:9px 11px;font-size:13px}
    .yka input{min-width:220px}
    .yka .btn{background:var(--a);color:#fff;border:0;border-radius:10px;padding:9px 14px;font-weight:700;font-size:13px;cursor:pointer}
    .yka .btn.ghost{background:var(--p2);border:1px solid var(--b);color:var(--t)}
    .yka .btn:disabled{opacity:.5;cursor:default}
    .yka .tw{overflow-x:auto;border:1px solid var(--b);border-radius:14px;background:var(--p)}
    .yka table{width:100%;border-collapse:collapse;font-size:13px}
    .yka th{text-align:left;color:var(--m);font-size:11px;text-transform:uppercase;letter-spacing:.6px;padding:11px 12px;border-bottom:1px solid var(--b);white-space:nowrap}
    .yka td{padding:11px 12px;border-bottom:1px solid #162038;white-space:nowrap}
    .yka tr:last-child td{border-bottom:0}
    .yka tfoot td{font-weight:800;background:var(--p2)}
    .yka .pill{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid var(--b)}
    .yka .pill.pro{color:#7fb0ff;border-color:#2c4a86}.yka .pill.business{color:#c59bff;border-color:#55358a}
    .yka .pill.enterprise{color:var(--y);border-color:#7a5a1c}.yka .pill.free{color:var(--m)}
    .yka .pill.ok{color:var(--g);border-color:#1d6b50}.yka .pill.wait{color:var(--y);border-color:#7a5a1c}
    .yka .warn{background:#2a1d0a;border:1px solid #7a5a1c;color:#f5d28a;border-radius:12px;padding:12px 14px;font-size:13px;margin-bottom:16px}
    .yka .bad{background:#2a0f14;border:1px solid #7a2a33;color:#ffb3b8;border-radius:12px;padding:12px 14px;font-size:13px;margin-bottom:16px}
    .yka .login{margin:12vh auto;max-width:420px;text-align:center}
    .yka a.mono,.yka .mono{font-family:ui-monospace,Menlo,monospace}
    @media(max-width:800px){.yka{display:block}.yka aside{position:static;width:auto;height:auto}.yka nav{display:flex;gap:6px;flex-wrap:wrap}.yka nav button{width:auto}.yka main{padding:18px 14px 50px}}
    `}</style>
  );

  if (!auth || !stats) {
    return (
      <div className="yka">
        {css}
        <main>
          <div className="login card">
            <div className="brand" style={{ fontSize: 24 }}>Yield<span>Keep</span></div>
            <div className="tag" style={{ margin: "4px 0 18px" }}>OWNER CONSOLE</div>
            {err && <div className="bad">{err}</div>}
            {busy && auth ? (
              <p className="sub">Reading the chain…</p>
            ) : !isConnected ? (
              <button className="btn" onClick={() => connect({ connector: injected() })}>Connect owner wallet</button>
            ) : (
              <>
                <p className="sub">Wallet {short(address || "")}. Sign a free message to enter. Only the owner wallet is accepted (checked on the server).</p>
                <button className="btn" onClick={login}>Sign in</button>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  const T = stats.totals;
  const monthSeries = (k: "fees" | "subs" | "profitCharged") => stats.months.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: n(m[k]) }));
  const missing = stats.treasuries.filter((t) => t.firstDeposit && t.firstDeposit + 365 * DAY <= now).length;

  return (
    <div className="yka">
      {css}
      <aside>
        <div className="brand">Yield<span>Keep</span></div>
        <div className="tag">OWNER CONSOLE</div>
        <nav>
          {([["overview", "Overview"], ["treasuries", "Treasuries"], ["subs", "Subscriptions"], ["tools", "Owner tools"]] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <p className="hint" style={{ color: "var(--m)", fontSize: 12, padding: "18px 10px" }}>
          Block {stats.lastBlock}<br />Updated {new Date(stats.generatedAt).toLocaleTimeString()}<br />
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => load(auth)} disabled={busy}>{busy ? "Loading…" : "Refresh"}</button>
        </p>
      </aside>

      <main>
        {err && <div className="bad">{err}</div>}
        {!stats.paymentWalletSet && <div className="warn">Subscriptions can't be read yet: set NEXT_PUBLIC_PAYMENT_ADDRESS in .env.local (the wallet that receives plan payments) and restart.</div>}
        {stats.paymentWalletSet && !stats.paymentsOk && <div className="warn">Could not read subscription payments just now. Fees and treasuries below are fine. Refresh in a minute.</div>}

        {tab === "overview" && (
          <>
            <h1>Business overview</h1>
            <div className="sub">Your income, your treasuries and their results, live from the chain.</div>
            <div className="grid">
              <div className="card"><div className="k">Your income (fees + plans)</div><div className="v g">{usd(T.income)}</div><div className="hint">Fees {usd(T.feesPaid)} · Plans {usd(T.subsRevenue)}</div></div>
              <div className="card"><div className="k">Fees waiting (open)</div><div className="v y">{usd(T.openFees)}</div><div className="hint">Paid to you when each year completes</div></div>
              <div className="card"><div className="k">Plan income / month</div><div className="v a">{usd(T.mrr * 1e6, 0)}</div><div className="hint">From active plans now</div></div>
              <div className="card"><div className="k">Treasuries</div><div className="v">{T.treasuries}</div><div className="hint">{T.active} active · {missing} completed 1 year</div></div>
              <div className="card"><div className="k">Total value locked</div><div className="v">{usd(T.tvl)}</div><div className="hint">Deposited {usd(T.deposited)}</div></div>
              <div className="card"><div className="k">Treasuries' profit/loss</div><div className={`v ${n(T.pnl) < 0 ? "r" : "g"}`}>{usd(T.pnl)}</div><div className="hint">Open profit {usd(T.openProfit)}</div></div>
            </div>
            <div className="two">
              <div className="card"><h3>My fee income by month</h3><Bars data={monthSeries("fees")} color="#37d39b" /></div>
              <div className="card"><h3>Subscription income by month</h3><Bars data={monthSeries("subs")} color="#5b8cff" /></div>
              <div className="card"><h3>Treasury profit that fees were charged on</h3><Bars data={monthSeries("profitCharged")} color="#f5b942" /></div>
              <div className="card"><h3>New treasuries by month</h3><Bars money={false} data={stats.months.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: m.newTreasuries }))} color="#8d9bbd" /></div>
            </div>
            <div className="card"><h3>Plans in use</h3>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                {TIERS.map((t) => <div key={t}><span className={`pill ${t}`}>{cap(t)}</span> <b style={{ marginLeft: 8, fontSize: 20 }}>{T.tiers[t]}</b></div>)}
              </div>
            </div>
          </>
        )}

        {tab === "treasuries" && (
          <>
            <h1>Treasuries</h1>
            <div className="sub">Filter by the month they joined, plan, and whether their 1-year mark is complete.</div>
            <div className="filters">
              <input placeholder="Search wallet 0x…" value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
                <option value="all">Joined: any month</option>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={fYear} onChange={(e) => setFYear(e.target.value)}>
                <option value="all">Any year</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={fAge} onChange={(e) => setFAge(e.target.value)}>
                <option value="all">Year: all</option>
                <option value="complete">1 year complete</option>
                <option value="running">Still running</option>
              </select>
              <select value={fPlan} onChange={(e) => setFPlan(e.target.value)}>
                <option value="all">Plan: all</option>
                <option value="any">Has a plan</option>
                <option value="none">No plan (Free)</option>
                <option value="pro">Pro</option><option value="business">Business</option><option value="enterprise">Enterprise</option>
              </select>
              <select value={fState} onChange={(e) => setFState(e.target.value)}>
                <option value="all">Status: all</option><option value="active">Active</option><option value="closed">Withdrawn</option>
              </select>
              <button className="btn ghost" onClick={() => { setQ(""); setFMonth("all"); setFYear("all"); setFPlan("all"); setFAge("all"); setFState("all"); }}>Reset</button>
              <button className="btn" onClick={csv}>Download CSV</button>
            </div>
            <div className="grid">
              <div className="card"><div className="k">Showing</div><div className="v">{rows.length}</div><div className="hint">{sum.subbed} with a plan</div></div>
              <div className="card"><div className="k">Their profit / loss</div><div className={`v ${sum.pnl < 0n ? "r" : "g"}`}>{usd(sum.pnl)}</div><div className="hint">Value + withdrawn − deposited</div></div>
              <div className="card"><div className="k">My fee (paid + open)</div><div className="v y">{usd(sum.paid + sum.due)}</div><div className="hint">Paid {usd(sum.paid)} · Open {usd(sum.due)}</div></div>
              <div className="card"><div className="k">Plan payments</div><div className="v a">{usd(sum.subPaid)}</div></div>
            </div>
            <div className="tw"><table>
              <thead><tr><th>Treasury</th><th>Joined</th><th>Year</th><th>Value</th><th>Profit/loss</th><th>Open profit</th><th>Profit charged</th><th>My fee paid</th><th>My fee open</th><th>Plan</th><th>Plan until</th><th></th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={12} style={{ color: "var(--m)", padding: 26 }}>No treasuries match these filters.</td></tr>}
                {rows.map((t) => {
                  const end = t.firstDeposit ? t.firstDeposit + 365 * DAY : 0;
                  const done = !!end && end <= now;
                  const left = end ? Math.ceil((end - now) / DAY) : 0;
                  return (
                    <tr key={t.address}>
                      <td className="mono"><a className="mono" style={{ color: "var(--a)" }} href={`https://sepolia.basescan.org/address/${t.address}`} target="_blank" rel="noreferrer">{short(t.address)}</a></td>
                      <td>{date(t.firstDeposit)}</td>
                      <td>{done ? <span className="pill ok">Complete</span> : <span className="pill wait">{left}d left</span>}</td>
                      <td>{usd(t.value)}</td>
                      <td className={BigInt(t.pnl) < 0n ? "r" : "g"}>{usd(t.pnl)}</td>
                      <td>{usd(t.profit)}</td>
                      <td>{usd(t.realized)}</td>
                      <td className="g">{usd(t.feesPaid)}</td>
                      <td className="y">{usd(t.feeDue)}</td>
                      <td><span className={`pill ${t.tier}`}>{cap(t.tier)}</span></td>
                      <td>{t.tier === "free" ? "—" : date(t.subUntil)}</td>
                      <td>{done && t.active && <button className="btn ghost" onClick={() => run("settle", t.address)}>Settle</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td>Total ({rows.length})</td><td></td><td></td><td>{usd(sum.value)}</td><td>{usd(sum.pnl)}</td><td>{usd(sum.profit)}</td><td>{usd(sum.realized)}</td><td>{usd(sum.paid)}</td><td>{usd(sum.due)}</td><td>{sum.subbed} plans</td><td></td><td></td></tr></tfoot>
            </table></div>
            {note && <p className="hint" style={{ marginTop: 12 }}>{note}</p>}
          </>
        )}

        {tab === "subs" && (
          <>
            <h1>Subscriptions</h1>
            <div className="sub">Read from USDC payments to your payment wallet. The amount decides the plan and the months.</div>
            <div className="grid">
              <div className="card"><div className="k">Plan income, all time</div><div className="v a">{usd(T.subsRevenue)}</div></div>
              <div className="card"><div className="k">Active plans</div><div className="v">{T.tiers.pro + T.tiers.business + T.tiers.enterprise}</div><div className="hint">Treasuries in the vault</div></div>
              <div className="card"><div className="k">Income / month (active)</div><div className="v g">{usd(T.mrr * 1e6, 0)}</div></div>
            </div>
            <div className="tw"><table>
              <thead><tr><th>Wallet</th><th>Plan</th><th>Until</th><th>Paid</th><th>Payments</th><th>In vault</th></tr></thead>
              <tbody>
                {stats.subscribers.length === 0 && <tr><td colSpan={6} style={{ color: "var(--m)", padding: 26 }}>No plan payments found yet.</td></tr>}
                {stats.subscribers.map((s) => (
                  <tr key={s.address}>
                    <td className="mono">{short(s.address)}</td>
                    <td><span className={`pill ${s.tier}`}>{s.tier === "free" ? "Expired" : cap(s.tier)}</span></td>
                    <td>{s.until ? date(s.until) : "—"}</td><td>{usd(s.paid)}</td><td>{s.payments}</td><td>{s.inVault ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}

        {tab === "tools" && (
          <>
            <h1>Owner tools</h1>
            <div className="sub">Actions that send a real transaction from your wallet.</div>
            <div className="card" style={{ maxWidth: 520 }}>
              <h3>Put idle USDC to work</h3>
              <p className="hint">Runs harvest() on the vault. Anyone can call it; you pay the small gas.</p>
              <button className="btn" onClick={() => run("harvest")}>Harvest now</button>
              {note && <p className="hint" style={{ marginTop: 12 }}>{note}</p>}
            </div>
            <p className="hint" style={{ marginTop: 16 }}>To settle one treasury's yearly fee, use the Settle button in the Treasuries tab (it shows when that treasury's year is complete).</p>
          </>
        )}
      </main>
    </div>
  );
}