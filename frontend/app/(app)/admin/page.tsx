"use client";

// frontend/app/(app)/admin/page.tsx
// YieldKeep Owner Console: a separate full-screen dashboard, only for the owner.
//  v2: join-month filter, profit/loss + my fee per treasury, plans, income charts.
//  - Sign in: connect the ADMIN wallet, sign a free message, the server checks it.
//  - Controls (harvest, pause, settle, ownership) are real transactions: they work only
//    when the connected wallet is the vault's owner, and MetaMask asks you to confirm each one.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient, useReadContract, useSignMessage, useWriteContract } from "wagmi";
import { TREASURY_ADDRESS } from "@/lib/contracts";

/* ---------------- types ---------------- */
type Tier = "free" | "pro" | "business" | "enterprise";
type Treasury = {
  address: string;
  firstDeposit: number;
  lastActivity: number;
  deposited: string;
  withdrawn: string;
  value: string;
  profit: string;
  feeDue: string;
  feesPaid: string;
  nextSettleAt: number;
  txCount: number;
  active: boolean;
  pnl: string;
  realized: string;
  tier: Tier;
  subUntil: number;
  subPaid: string;
};
type Recent = { kind: string; user: string | null; assets: string; txHash: string; timestamp: number };
type Stats = {
  generatedAt: number;
  lastBlock: string;
  totals: {
    treasuries: number;
    active: number;
    deposits: number;
    withdrawals: number;
    harvests: number;
    deposited: string;
    withdrawn: string;
    tvl: string;
    openProfit: string;
    openFees: string;
    feesPaid: string;
    contractFeesPaid: string;
    pnl: string;
    subsRevenue: string;
    income: string;
    mrr: number;
    tiers: Record<Tier, number>;
  };
  paymentWalletSet: boolean;
  paymentsOk: boolean;
  months: { month: string; newTreasuries: number; fees: string; subs: string; profitCharged: string }[];
  subscribers: { address: string; tier: Tier; until: number; paid: string; payments: number; inVault: boolean }[];
  newPerDay: { day: string; count: number }[];
  treasuries: Treasury[];
  recent: Recent[];
};
type Auth = { message: string; signature: string };
type Section = "overview" | "treasuries" | "subs" | "controls" | "fees" | "security";

const AUTH_KEY = "yk_admin_auth_v1";
const SCAN = "https://sepolia.basescan.org";
const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TIERS: Tier[] = ["free", "pro", "business", "enterprise"];

/* ---------------- vault functions used by the owner buttons ---------------- */
const ADMIN_ABI = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "pendingOwner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "depositCap", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "feeRecipient", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "totalFeesPaid", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "pause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "unpause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "harvest", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "user", type: "address" }], outputs: [] },
  { type: "function", name: "transferOwnership", stateMutability: "nonpayable", inputs: [{ name: "newOwner", type: "address" }], outputs: [] },
  { type: "function", name: "acceptOwnership", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

/* ---------------- helpers ---------------- */
const usd = (s: string | bigint | undefined) =>
  (Number(BigInt(s ?? "0")) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (ts: number) => (ts ? new Date(ts).toLocaleString() : "-");
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const num = (s: string | undefined) => Number(BigInt(s ?? "0")) / 1e6;
const money = (s: string | bigint | undefined) => {
  const v = Number(BigInt(s ?? "0")) / 1e6;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const day = (ts: number) => (ts ? new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");
const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim());

function useRead(functionName: string) {
  const q = useReadContract({
    address: TREASURY_ADDRESS,
    abi: ADMIN_ABI,
    functionName,
    query: { refetchInterval: 8000, retry: false },
  } as any);
  return { data: q.data as any, ok: !q.isError && q.data !== undefined, loading: q.isLoading };
}

type TxState = { status: "idle" | "wallet" | "mining" | "done" | "error"; label?: string; hash?: string; msg?: string };
function useTx() {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<TxState>({ status: "idle" });
  const run = async (label: string, args: { functionName: string; args?: any[] }) => {
    try {
      setState({ status: "wallet", label });
      const hash = await (writeContractAsync as any)({ address: TREASURY_ADDRESS, abi: ADMIN_ABI, ...args });
      setState({ status: "mining", label, hash });
      await publicClient?.waitForTransactionReceipt({ hash });
      setState({ status: "done", label, hash });
      window.dispatchEvent(new Event("yk-activity"));
      return true;
    } catch (e: any) {
      setState({ status: "error", label, msg: e?.shortMessage || e?.message || "Transaction failed" });
      return false;
    }
  };
  return { state, run, busy: state.status === "wallet" || state.status === "mining", clear: () => setState({ status: "idle" }) };
}

/* ---------------- styles (scoped to .yka) ---------------- */
const CSS = `
.yka{position:fixed;inset:0;z-index:9999;display:flex;background:#070A12;color:#E6EBF5;font-family:Inter,system-ui,sans-serif;font-size:14px}
.yka *{box-sizing:border-box}
.yka-side{width:248px;flex:none;background:#0A0F1C;border-right:1px solid #1B2540;display:flex;flex-direction:column;padding:18px 14px}
.yka-brand{display:flex;align-items:center;gap:10px;padding:4px 8px 18px;font-weight:800;font-size:18px;letter-spacing:-.4px}
.yka-brand img{height:30px;width:auto;display:block}
.yka-badge{margin-left:auto;font-size:10px;font-weight:700;letter-spacing:.8px;color:#5B8CFF;border:1px solid #2A3B66;border-radius:999px;padding:3px 8px}
.yka-nav{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:0;color:#8A96B3;font:inherit;font-weight:600;padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:2px}
.yka-nav:hover{background:#11182B;color:#E6EBF5}
.yka-nav.on{background:#14203F;color:#fff;box-shadow:inset 3px 0 0 #5B8CFF}
.yka-spacer{flex:1}
.yka-who{border-top:1px solid #1B2540;padding:14px 8px 4px;font-size:12px;color:#8A96B3}
.yka-who b{display:block;color:#E6EBF5;font-size:13px;margin-bottom:2px}
.yka-main{flex:1;min-width:0;overflow:auto}
.yka-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:16px 28px;background:rgba(7,10,18,.92);backdrop-filter:blur(8px);border-bottom:1px solid #1B2540}
.yka-top h1{margin:0;font-size:20px;font-weight:800;letter-spacing:-.4px}
.yka-top .sub{color:#8A96B3;font-size:12px}
.yka-body{padding:24px 28px 80px;max-width:1280px}
.yka-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.yka-card{background:#0E1424;border:1px solid #1B2540;border-radius:14px;padding:18px}
.yka-card h3{margin:0 0 4px;font-size:15px}
.yka-card p{margin:0 0 12px;color:#8A96B3;font-size:13px;line-height:1.5}
.yka-k{color:#8A96B3;font-size:12px;font-weight:600}
.yka-v{font-size:24px;font-weight:800;letter-spacing:-.5px;margin-top:6px}
.yka-s{color:#8A96B3;font-size:12px;margin-top:2px}
.yka-btn{background:#131C33;border:1px solid #2A3B66;color:#E6EBF5;font:inherit;font-weight:700;padding:9px 15px;border-radius:10px;cursor:pointer}
.yka-btn:hover:not(:disabled){background:#1A2646}
.yka-btn:disabled{opacity:.4;cursor:not-allowed}
.yka-btn.primary{background:#3D6BFF;border-color:#3D6BFF;color:#fff}
.yka-btn.primary:hover:not(:disabled){background:#5B84FF}
.yka-btn.danger{background:#2A1216;border-color:#6B2530;color:#FCA5A5}
.yka-btn.danger:hover:not(:disabled){background:#3A171D}
.yka-btn.sm{padding:5px 10px;font-size:12px;border-radius:8px}
.yka-in{background:#080C17;border:1px solid #243153;color:#E6EBF5;font:inherit;border-radius:10px;padding:9px 12px;min-width:240px}
.yka-in:focus{outline:2px solid #3D6BFF55;border-color:#3D6BFF}
.yka-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.yka-chip{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px;border:1px solid #2A3B66;color:#9DB4FF;background:#101A33}
.yka-chip.g{color:#6EE7B7;border-color:#1F5A45;background:#0C2A20}
.yka-chip.r{color:#FCA5A5;border-color:#6B2530;background:#2A1216}
.yka-chip.y{color:#FCD34D;border-color:#6B5418;background:#2B2209}
.yka-chip.on{background:#3D6BFF;border-color:#3D6BFF;color:#fff}
.yka-tw{overflow-x:auto}
.yka table{width:100%;border-collapse:collapse}
.yka th{text-align:left;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#8A96B3;padding:10px;white-space:nowrap;border-bottom:1px solid #1B2540}
.yka td{padding:11px 10px;border-bottom:1px solid #141C32;white-space:nowrap;font-size:13px}
.yka tr:hover td{background:#0C1222}
.yka a{color:#7BA0FF;text-decoration:none}
.yka a:hover{text-decoration:underline}
.yka-warn{background:#2B2209;border:1px solid #6B5418;color:#FCD34D;border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:13px}
.yka-err{color:#F87171}
.yka-login{margin:12vh auto 0;max-width:460px;text-align:center}
.yka-login img{height:56px;margin-bottom:14px}
.yka-toast{position:fixed;right:20px;bottom:20px;z-index:10;background:#0E1424;border:1px solid #2A3B66;border-radius:12px;padding:12px 16px;max-width:340px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.yka-kv{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #141C32}
.yka-kv:last-child{border-bottom:0}
.yka-kv span:first-child{color:#8A96B3}
.yka-pill{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px;border:1px solid #2A3B66;color:#8A96B3}
.yka-pill.pro{color:#7FB0FF;border-color:#2C4A86}.yka-pill.business{color:#C59BFF;border-color:#55358A}.yka-pill.enterprise{color:#FCD34D;border-color:#7A5A1C}
.yka-pill.ok{color:#6EE7B7;border-color:#1F5A45}.yka-pill.wait{color:#FCD34D;border-color:#6B5418}
.yka-sel{background:#080C17;border:1px solid #243153;color:#E6EBF5;font:inherit;border-radius:10px;padding:9px 11px}
.yka-bars{display:flex;gap:6px;align-items:flex-end;height:170px}
.yka-bar{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;height:100%}
.yka-barcol{flex:1;width:100%;display:flex;align-items:flex-end}.yka-barcol div{width:100%;border-radius:5px 5px 0 0;min-height:2px}
.yka-barv{font-size:10px;color:#8A96B3;height:14px;white-space:nowrap}.yka-barl{font-size:10px;color:#8A96B3;margin-top:6px}
.yka tfoot td{font-weight:800;background:#0C1222}
.yka-g{color:#6EE7B7}.yka-r{color:#F87171}.yka-y{color:#FCD34D}.yka-a{color:#7BA0FF}
.yka-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}
@media (max-width:820px){.yka{flex-direction:column}.yka-side{width:100%;flex-direction:row;overflow-x:auto;padding:8px;border-right:0;border-bottom:1px solid #1B2540}.yka-brand,.yka-who,.yka-spacer{display:none}.yka-nav{white-space:nowrap;width:auto}.yka-top,.yka-body{padding-left:16px;padding-right:16px}}
`;

function Bars({ data, color, isMoney = true }: { data: { label: string; value: number }[]; color: string; isMoney?: boolean }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="yka-bars">
      {data.map((d) => (
        <div key={d.label} className="yka-bar" title={`${d.label}: ${isMoney ? "$" + d.value.toFixed(2) : d.value}`}>
          <div className="yka-barv">{d.value ? (isMoney ? "$" + (d.value >= 100 ? d.value.toFixed(0) : d.value.toFixed(1)) : d.value) : ""}</div>
          <div className="yka-barcol"><div style={{ height: `${(Math.abs(d.value) / max) * 100}%`, background: d.value < 0 ? "#F87171" : color }} /></div>
          <div className="yka-barl">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function Kpi({ k, v, s }: { k: string; v: string; s?: string }) {
  return (
    <div className="yka-card">
      <div className="yka-k">{k}</div>
      <div className="yka-v">{v}</div>
      {s ? <div className="yka-s">{s}</div> : null}
    </div>
  );
}

/* ---------------- the page ---------------- */
export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const tx = useTx();

  const [auth, setAuth] = useState<Auth | null>(null);
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "closed" | "due">("all");
  const [fMonth, setFMonth] = useState("all");
  const [fYear, setFYear] = useState("all");
  const [fPlan, setFPlan] = useState("all");
  const [fAge, setFAge] = useState("all");
  const [settleTo, setSettleTo] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const owner = useRead("owner");
  const pendingOwner = useRead("pendingOwner");
  const paused = useRead("paused");
  const cap = useRead("depositCap");
  const feeWallet = useRead("feeRecipient");
  const feesOnChain = useRead("totalFeesPaid");
  const isOwner = same(address, owner.data);
  const hasPending = pendingOwner.ok && typeof pendingOwner.data === "string" && !/^0x0{40}$/i.test(pendingOwner.data);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_KEY);
      if (raw) setAuth(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (a: Auth) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || res.status === 400) {
          try {
            sessionStorage.removeItem(AUTH_KEY);
          } catch {
            /* ignore */
          }
          setAuth(null);
          setData(null);
        }
        setError(res.status === 403 ? "Not allowed. This wallet is not the admin wallet." : j?.error || `Server answered ${res.status}`);
        return;
      }
      setError(null);
      setData(j as Stats);
    } catch (e: any) {
      setError(e?.message || "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    load(auth);
    const id = setInterval(() => !document.hidden && load(auth), 30000);
    return () => clearInterval(id);
  }, [auth, load]);

  // refresh the numbers after a confirmed transaction
  useEffect(() => {
    if (tx.state.status === "done" && auth) load(auth);
  }, [tx.state.status, auth, load]);

  const signIn = async () => {
    if (!address) return;
    try {
      setError(null);
      const message = `YieldKeep admin login\nIssued: ${Date.now()}`;
      const signature = await signMessageAsync({ account: address, message });
      const a = { message, signature };
      try {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify(a));
      } catch {
        /* ignore */
      }
      setAuth(a);
    } catch (e: any) {
      setError(e?.shortMessage || "Signature cancelled");
    }
  };
  const signOut = () => {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    setAuth(null);
    setData(null);
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const isDue = (t: Treasury) => t.active && t.nextSettleAt > 0 && t.nextSettleAt <= nowSec;
  const dueCount = data ? data.treasuries.filter(isDue).length : 0;

  const years = useMemo(() => {
    const set = new Set<number>();
    data?.treasuries.forEach((t) => t.firstDeposit && set.add(new Date(t.firstDeposit).getUTCFullYear()));
    return [...set].sort();
  }, [data]);
  const yearDone = (t: Treasury) => !!t.firstDeposit && t.firstDeposit + 365 * DAY <= Date.now();

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.treasuries.filter((t) => {
      if (q && !t.address.includes(q)) return false;
      const d = t.firstDeposit ? new Date(t.firstDeposit) : null;
      if (fMonth !== "all" && (!d || d.getUTCMonth() !== Number(fMonth))) return false;
      if (fYear !== "all" && (!d || d.getUTCFullYear() !== Number(fYear))) return false;
      if (fPlan === "none" && t.tier !== "free") return false;
      if (fPlan === "any" && t.tier === "free") return false;
      if ((fPlan === "pro" || fPlan === "business" || fPlan === "enterprise") && t.tier !== fPlan) return false;
      if (fAge === "complete" && !yearDone(t)) return false;
      if (fAge === "running" && yearDone(t)) return false;
      if (filter === "active") return t.active;
      if (filter === "closed") return !t.active;
      if (filter === "due") return isDue(t);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, filter, fMonth, fYear, fPlan, fAge]);

  const sum = useMemo(() => {
    let value = 0n, profit = 0n, realized = 0n, paid = 0n, due = 0n, pnl = 0n, subPaid = 0n, subbed = 0;
    for (const t of rows) {
      value += BigInt(t.value); profit += BigInt(t.profit); realized += BigInt(t.realized);
      paid += BigInt(t.feesPaid); due += BigInt(t.feeDue); pnl += BigInt(t.pnl); subPaid += BigInt(t.subPaid);
      if (t.tier !== "free") subbed++;
    }
    return { value, profit, realized, paid, due, pnl, subPaid, subbed };
  }, [rows]);

  const downloadCsv = () => {
    if (!data) return;
    const head = ["address", "status", "joined", "year_complete", "deposited", "withdrawn", "value", "total_pnl", "open_profit", "profit_charged", "fee_paid", "fee_open", "plan", "plan_until", "plan_paid", "transactions"];
    const lines = rows.map((t) =>
      [t.address, t.active ? "active" : "closed", t.firstDeposit ? new Date(t.firstDeposit).toISOString().slice(0, 10) : "", yearDone(t) ? "yes" : "no", num(t.deposited), num(t.withdrawn), num(t.value), num(t.pnl), num(t.profit), num(t.realized), num(t.feesPaid), num(t.feeDue), t.tier, t.subUntil ? new Date(t.subUntil).toISOString().slice(0, 10) : "", num(t.subPaid), t.txCount].join(",")
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yieldkeep-treasuries.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const ask = (text: string) => window.confirm(text);
  const maxDay = data ? Math.max(1, ...data.newPerDay.map((d) => d.count)) : 1;
  const titles: Record<Section, string> = {
    overview: "Overview",
    treasuries: "Treasuries",
    subs: "Subscriptions",
    controls: "Controls",
    fees: "Fees",
    security: "Security",
  };
  const nav: { id: Section; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "▦" },
    { id: "treasuries", label: "Treasuries", icon: "☰" },
    { id: "subs", label: "Subscriptions", icon: "★" },
    { id: "controls", label: "Controls", icon: "⚙" },
    { id: "fees", label: "Fees", icon: "%" },
    { id: "security", label: "Security", icon: "◈" },
  ];

  /* ---------- login screen ---------- */
  if (!auth) {
    return (
      <div className="yka">
        <style>{CSS}</style>
        <div className="yka-main">
          <div className="yka-login yka-card" style={{ padding: 32 }}>
            <img src="/logo-dark.png" alt="YieldKeep" />
            <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Owner Console</h1>
            <p style={{ color: "#8A96B3", margin: "0 0 20px" }}>Restricted. Only the owner wallet can sign in.</p>
            {!isConnected ? (
              <div style={{ display: "grid", gap: 8 }}>
                {connectors
                  .filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i)
                  .map((c) => (
                    <button key={c.uid} className="yka-btn" onClick={() => connect({ connector: c })}>
                      Connect {c.name}
                    </button>
                  ))}
              </div>
            ) : (
              <>
                <p style={{ margin: "0 0 14px" }}>
                  Connected: <b>{address ? short(address) : ""}</b>
                </p>
                <div className="yka-row" style={{ justifyContent: "center" }}>
                  <button className="yka-btn primary" onClick={signIn}>
                    Sign in as owner
                  </button>
                  <button className="yka-btn" onClick={() => disconnect()}>
                    Switch wallet
                  </button>
                </div>
                <p className="yka-s" style={{ marginTop: 14 }}>
                  Signing is free and moves no money.
                </p>
              </>
            )}
            {error ? <p className="yka-err" style={{ marginTop: 14 }}>{error}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- console ---------- */
  return (
    <div className="yka">
      <style>{CSS}</style>

      <aside className="yka-side">
        <div className="yka-brand">
          <img src="/logo-dark.png" alt="YieldKeep" />
          <span className="yka-badge">OWNER</span>
        </div>
        {nav.map((n) => (
          <button key={n.id} className={`yka-nav${section === n.id ? " on" : ""}`} onClick={() => setSection(n.id)}>
            <span style={{ width: 16, textAlign: "center" }}>{n.icon}</span>
            {n.label}
            {n.id === "treasuries" && dueCount > 0 ? <span className="yka-chip y" style={{ marginLeft: "auto" }}>{dueCount} due</span> : null}
          </button>
        ))}
        <div className="yka-spacer" />
        <div className="yka-who">
          <b>{address ? short(address) : "Not connected"}</b>
          {isOwner ? "Contract owner" : owner.ok ? "Not the contract owner" : "Owner unknown"}
          <div className="yka-row" style={{ marginTop: 10 }}>
            <button className="yka-btn sm" onClick={signOut}>
              Sign out
            </button>
            <a className="yka-btn sm" href="/dashboard" style={{ textDecoration: "none", color: "#E6EBF5" }}>
              Exit
            </a>
          </div>
        </div>
      </aside>

      <main className="yka-main">
        <div className="yka-top">
          <div>
            <h1>{titles[section]}</h1>
            <div className="sub">{data ? `Updated ${when(data.generatedAt)} · block ${data.lastBlock}` : "Loading..."}</div>
          </div>
          <div className="yka-row" style={{ marginLeft: "auto" }}>
            <span className="yka-chip g">Base Sepolia</span>
            {paused.ok ? <span className={`yka-chip ${paused.data ? "r" : "g"}`}>{paused.data ? "Deposits paused" : "Deposits open"}</span> : null}
            <button className="yka-btn sm" onClick={() => auth && load(auth)} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="yka-body">
          {error ? <div className="yka-warn">{error}</div> : null}
          {data && !data.paymentWalletSet ? <div className="yka-warn">Plans cannot be read yet: set NEXT_PUBLIC_PAYMENT_ADDRESS in .env.local (the wallet that receives plan payments) and restart.</div> : null}
          {data && data.paymentWalletSet && !data.paymentsOk ? <div className="yka-warn">Could not read plan payments just now. Fees and treasuries are fine. Refresh in a minute.</div> : null}
          {!data ? (
            <p style={{ color: "#8A96B3" }}>Loading the numbers (the first time can take a minute)...</p>
          ) : (
            <>
              {/* ---------------- OVERVIEW ---------------- */}
              {section === "overview" && (
                <>
                  <div className="yka-grid">
                    <Kpi k="Your income (fees + plans)" v={money(data.totals.income)} s={`Fees ${money(data.totals.feesPaid)} · Plans ${money(data.totals.subsRevenue)}`} />
                    <Kpi k="Fees waiting (open)" v={money(data.totals.openFees)} s="Paid when each treasury's year completes" />
                    <Kpi k="Plan income / month" v={`$${data.totals.mrr.toLocaleString()}`} s="From active plans now" />
                    <Kpi k="Treasuries (ever joined)" v={String(data.totals.treasuries)} s={`${data.totals.active} active · ${data.treasuries.filter(yearDone).length} completed 1 year`} />
                    <Kpi k="Vault size (live value)" v={`${usd(data.totals.tvl)} USDC`} s={`Deposited ${usd(data.totals.deposited)}`} />
                    <Kpi k="Treasuries' profit / loss" v={money(data.totals.pnl)} s={`Open profit ${money(data.totals.openProfit)}`} />
                    <Kpi k="Total withdrawn" v={`${usd(data.totals.withdrawn)} USDC`} s={`${data.totals.withdrawals} withdrawals`} />
                    <Kpi k="Due for settlement" v={String(dueCount)} s={`${data.totals.harvests} harvests so far`} />
                  </div>

                  <div className="yka-cols" style={{ marginTop: 14 }}>
                    <div className="yka-card"><h3>My fee income by month</h3><p>Last 12 months</p><Bars color="#6EE7B7" data={data.months.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: num(m.fees) }))} /></div>
                    <div className="yka-card"><h3>Plan income by month</h3><p>Pro, Business, Enterprise payments</p><Bars color="#5B8CFF" data={data.months.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: num(m.subs) }))} /></div>
                    <div className="yka-card"><h3>Profit that fees were charged on</h3><p>Treasury profit settled each month</p><Bars color="#FCD34D" data={data.months.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: num(m.profitCharged) }))} /></div>
                    <div className="yka-card"><h3>New treasuries by month</h3><p>Who joined, per month</p><Bars isMoney={false} color="#8A96B3" data={data.months.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: m.newTreasuries }))} /></div>
                    <div className="yka-card"><h3>Plans in use</h3><p>Treasuries by active plan</p><div className="yka-row" style={{ gap: 22 }}>{TIERS.map((t) => <div key={t}><span className={`yka-pill ${t}`}>{cap1(t)}</span> <b style={{ marginLeft: 8, fontSize: 20 }}>{data.totals.tiers[t]}</b></div>)}</div></div>
                  </div>

                  <div className="yka-cols" style={{ marginTop: 14 }}>
                    <div className="yka-card">
                      <h3>New treasuries per day</h3>
                      <p>Last 30 days</p>
                      <svg viewBox="0 0 300 70" width="100%" height="110" role="img" aria-label="New treasuries per day">
                        {data.newPerDay.map((d, i) => {
                          const h = (d.count / maxDay) * 52;
                          return (
                            <g key={d.day}>
                              <title>{`${d.day}: ${d.count}`}</title>
                              <rect x={i * 10 + 1} y={60 - h} width={8} height={Math.max(h, 1.5)} rx={1.5} fill="#5B8CFF" opacity={d.count ? 1 : 0.25} />
                            </g>
                          );
                        })}
                      </svg>
                      <div className="yka-row" style={{ justifyContent: "space-between", fontSize: 11, color: "#8A96B3" }}>
                        <span>{data.newPerDay[0]?.day}</span>
                        <span>{data.newPerDay[data.newPerDay.length - 1]?.day}</span>
                      </div>
                    </div>

                    <div className="yka-card">
                      <h3>Latest activity</h3>
                      <p>Newest transactions in the vault</p>
                      <div className="yka-tw">
                        <table>
                          <tbody>
                            {data.recent.slice(0, 8).map((e) => (
                              <tr key={`${e.txHash}-${e.kind}`}>
                                <td style={{ textTransform: "capitalize" }}>
                                  <span className={`yka-chip ${e.kind === "deposit" ? "g" : e.kind === "withdraw" ? "y" : ""}`}>{e.kind}</span>
                                </td>
                                <td>{e.user ? short(e.user) : "vault"}</td>
                                <td>{usd(e.assets)}</td>
                                <td>
                                  <a href={`${SCAN}/tx/${e.txHash}`} target="_blank" rel="noreferrer">
                                    {short(e.txHash)}
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ---------------- TREASURIES ---------------- */}
              {section === "treasuries" && (
                <>
                  <div className="yka-card" style={{ marginBottom: 14 }}>
                    <div className="yka-row">
                      <input className="yka-in" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a wallet address" />
                      <select className="yka-sel" value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
                        <option value="all">Joined: any month</option>
                        {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                      </select>
                      <select className="yka-sel" value={fYear} onChange={(e) => setFYear(e.target.value)}>
                        <option value="all">Any year</option>
                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <select className="yka-sel" value={fAge} onChange={(e) => setFAge(e.target.value)}>
                        <option value="all">Year: all</option>
                        <option value="complete">1 year complete</option>
                        <option value="running">Still running</option>
                      </select>
                      <select className="yka-sel" value={fPlan} onChange={(e) => setFPlan(e.target.value)}>
                        <option value="all">Plan: all</option>
                        <option value="any">Has a plan</option>
                        <option value="none">No plan (Free)</option>
                        <option value="pro">Pro</option>
                        <option value="business">Business</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>
                    <div className="yka-row" style={{ marginTop: 12 }}>
                      {(["all", "active", "closed", "due"] as const).map((f) => (
                        <button key={f} className={`yka-chip${filter === f ? " on" : ""}`} style={{ cursor: "pointer" }} onClick={() => setFilter(f)}>
                          {f === "all" ? "All" : f === "active" ? "Active" : f === "closed" ? "Closed" : "Due to settle"}
                        </button>
                      ))}
                      <button className="yka-btn sm" onClick={() => { setQuery(""); setFMonth("all"); setFYear("all"); setFPlan("all"); setFAge("all"); setFilter("all"); }}>Reset filters</button>
                      <button className="yka-btn sm primary" style={{ marginLeft: "auto" }} onClick={downloadCsv}>Download CSV</button>
                    </div>
                  </div>

                  <div className="yka-grid" style={{ marginBottom: 14 }}>
                    <Kpi k="Showing" v={String(rows.length)} s={`${sum.subbed} with a plan`} />
                    <Kpi k="Their profit / loss" v={money(sum.pnl)} s="Value + withdrawn - deposited" />
                    <Kpi k="My fee (paid + open)" v={money(sum.paid + sum.due)} s={`Paid ${money(sum.paid)} · Open ${money(sum.due)}`} />
                    <Kpi k="Plan payments" v={money(sum.subPaid)} />
                  </div>

                  <div className="yka-card">
                    <div className="yka-tw">
                      <table>
                        <thead>
                          <tr>
                            {["Treasury", "Joined", "Year", "Value", "Profit / loss", "Open profit", "Profit charged", "My fee paid", "My fee open", "Plan", "Plan until", "Action"].map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td colSpan={12}>No treasuries match these filters.</td></tr>
                          ) : (
                            rows.map((t) => {
                              const end = t.firstDeposit ? t.firstDeposit + 365 * DAY : 0;
                              const left = end ? Math.ceil((end - Date.now()) / DAY) : 0;
                              return (
                                <tr key={t.address}>
                                  <td><a href={`${SCAN}/address/${t.address}`} target="_blank" rel="noreferrer">{short(t.address)}</a></td>
                                  <td>{day(t.firstDeposit)}</td>
                                  <td>{yearDone(t) ? <span className="yka-pill ok">Complete</span> : <span className="yka-pill wait">{left}d left</span>}</td>
                                  <td style={{ fontWeight: 700 }}>{money(t.value)}</td>
                                  <td className={BigInt(t.pnl) < 0n ? "yka-r" : "yka-g"}>{money(t.pnl)}</td>
                                  <td>{money(t.profit)}</td>
                                  <td>{money(t.realized)}</td>
                                  <td className="yka-g">{money(t.feesPaid)}</td>
                                  <td className="yka-y">{money(t.feeDue)}</td>
                                  <td><span className={`yka-pill ${t.tier}`}>{cap1(t.tier)}</span></td>
                                  <td>{t.tier === "free" ? "-" : day(t.subUntil)}</td>
                                  <td>
                                    <button
                                      className="yka-btn sm"
                                      disabled={!t.active || tx.busy}
                                      onClick={() => ask(`Settle the fee for ${short(t.address)} now?`) && tx.run("Settle fee", { functionName: "settle", args: [t.address] })}
                                    >
                                      Settle fee
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Total ({rows.length})</td><td></td><td></td>
                            <td>{money(sum.value)}</td><td>{money(sum.pnl)}</td><td>{money(sum.profit)}</td><td>{money(sum.realized)}</td>
                            <td>{money(sum.paid)}</td><td>{money(sum.due)}</td><td>{sum.subbed} plans</td><td></td><td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ---------------- SUBSCRIPTIONS ---------------- */}
              {section === "subs" && (
                <>
                  <div className="yka-grid" style={{ marginBottom: 14 }}>
                    <Kpi k="Plan income, all time" v={money(data.totals.subsRevenue)} />
                    <Kpi k="Active plans" v={String(data.totals.tiers.pro + data.totals.tiers.business + data.totals.tiers.enterprise)} s="Treasuries in the vault" />
                    <Kpi k="Income / month (active)" v={`$${data.totals.mrr.toLocaleString()}`} />
                  </div>
                  <div className="yka-card">
                    <p>Read from USDC payments to your payment wallet. The amount paid decides the plan and the months.</p>
                    <div className="yka-tw">
                      <table>
                        <thead><tr>{["Wallet", "Plan", "Until", "Paid", "Payments", "In vault"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>
                          {data.subscribers.length === 0 ? (
                            <tr><td colSpan={6}>No plan payments found yet.</td></tr>
                          ) : (
                            data.subscribers.map((x) => (
                              <tr key={x.address}>
                                <td><a href={`${SCAN}/address/${x.address}`} target="_blank" rel="noreferrer">{short(x.address)}</a></td>
                                <td><span className={`yka-pill ${x.tier}`}>{x.tier === "free" ? "Expired" : cap1(x.tier)}</span></td>
                                <td>{x.until ? day(x.until) : "-"}</td>
                                <td>{money(x.paid)}</td>
                                <td>{x.payments}</td>
                                <td>{x.inVault ? "Yes" : "No"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ---------------- CONTROLS ---------------- */}
              {section === "controls" && (
                <>
                  {!isOwner ? (
                    <div className="yka-warn">
                      The connected wallet is not the vault owner, so the buttons below are locked.
                      {owner.ok ? ` Owner: ${short(String(owner.data))}.` : ""} Switch MetaMask to the owner wallet.
                    </div>
                  ) : null}
                  <div className="yka-cols">
                    <div className="yka-card">
                      <h3>Harvest</h3>
                      <p>Sends idle USDC in the vault to the yield adapter so it starts earning.</p>
                      <button className="yka-btn primary" disabled={tx.busy} onClick={() => tx.run("Harvest", { functionName: "harvest" })}>
                        Harvest now
                      </button>
                    </div>

                    <div className="yka-card">
                      <h3>Deposits</h3>
                      <p>Pausing blocks new deposits only. Treasuries can always withdraw.</p>
                      <div className="yka-row">
                        <button
                          className="yka-btn danger"
                          disabled={!isOwner || tx.busy || paused.data === true}
                          onClick={() => ask("Pause new deposits? Withdrawals stay open.") && tx.run("Pause deposits", { functionName: "pause" })}
                        >
                          Pause deposits
                        </button>
                        <button className="yka-btn" disabled={!isOwner || tx.busy || paused.data === false} onClick={() => tx.run("Unpause deposits", { functionName: "unpause" })}>
                          Unpause
                        </button>
                      </div>
                      <p className="yka-s" style={{ marginTop: 10 }}>
                        Status: {paused.ok ? (paused.data ? "paused" : "open") : "unknown"}
                      </p>
                    </div>

                    <div className="yka-card">
                      <h3>Settle one treasury</h3>
                      <p>Charges the 10% fee on that treasury's profit now. Anyone may call it; only the profit is charged.</p>
                      <div className="yka-row">
                        <input className="yka-in" value={settleTo} onChange={(e) => setSettleTo(e.target.value)} placeholder="0x... treasury wallet" />
                        <button className="yka-btn" disabled={tx.busy || !isAddr(settleTo)} onClick={() => tx.run("Settle fee", { functionName: "settle", args: [settleTo.trim()] })}>
                          Settle
                        </button>
                      </div>
                    </div>

                    <div className="yka-card">
                      <h3>Deposit cap</h3>
                      <p>The most USDC the vault accepts in total.</p>
                      <div className="yka-v">{cap.ok ? `${usd(cap.data)} USDC` : "n/a"}</div>
                    </div>
                  </div>
                </>
              )}

              {/* ---------------- FEES ---------------- */}
              {section === "fees" && (
                <div className="yka-cols">
                  <div className="yka-card">
                    <h3>Fee summary</h3>
                    <p>10% of profit only, never of deposits.</p>
                    <div className="yka-kv"><span>Fees already paid (events)</span><b>{usd(data.totals.feesPaid)} USDC</b></div>
                    <div className="yka-kv"><span>Fees paid (contract counter)</span><b>{feesOnChain.ok ? `${usd(feesOnChain.data)} USDC` : usd(data.totals.contractFeesPaid) + " USDC"}</b></div>
                    <div className="yka-kv"><span>Open fees across treasuries</span><b>{usd(data.totals.openFees)} USDC</b></div>
                    <div className="yka-kv"><span>Open profit</span><b>{usd(data.totals.openProfit)} USDC</b></div>
                  </div>
                  <div className="yka-card">
                    <h3>Fee wallet</h3>
                    <p>Fees are paid as vault shares to this wallet. You redeem them from there.</p>
                    <div className="yka-kv"><span>Address</span><b>{feeWallet.ok ? <a href={`${SCAN}/address/${feeWallet.data}`} target="_blank" rel="noreferrer">{short(String(feeWallet.data))}</a> : "n/a"}</b></div>
                    <div className="yka-kv"><span>Vault contract</span><b><a href={`${SCAN}/address/${TREASURY_ADDRESS}`} target="_blank" rel="noreferrer">{short(String(TREASURY_ADDRESS))}</a></b></div>
                  </div>
                </div>
              )}

              {/* ---------------- SECURITY ---------------- */}
              {section === "security" && (
                <div className="yka-cols">
                  <div className="yka-card">
                    <h3>Ownership</h3>
                    <p>Two-step transfer: the new owner must accept, so a wrong address cannot take over by accident.</p>
                    <div className="yka-kv"><span>Owner</span><b>{owner.ok ? <a href={`${SCAN}/address/${owner.data}`} target="_blank" rel="noreferrer">{short(String(owner.data))}</a> : "n/a"}</b></div>
                    <div className="yka-kv"><span>Pending owner</span><b>{hasPending ? short(String(pendingOwner.data)) : "none"}</b></div>
                    <div className="yka-kv"><span>You are connected as</span><b>{address ? short(address) : "-"} {isOwner ? <span className="yka-chip g">owner</span> : null}</b></div>
                    {hasPending && same(address, pendingOwner.data) ? (
                      <button className="yka-btn primary" style={{ marginTop: 12 }} disabled={tx.busy} onClick={() => ask("Accept ownership of the vault?") && tx.run("Accept ownership", { functionName: "acceptOwnership" })}>
                        Accept ownership
                      </button>
                    ) : null}
                  </div>

                  <div className="yka-card">
                    <h3>Transfer ownership</h3>
                    <p>For example to a Safe multisig before mainnet. Double-check the address.</p>
                    <div className="yka-row">
                      <input className="yka-in" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x... new owner" />
                      <button
                        className="yka-btn danger"
                        disabled={!isOwner || tx.busy || !isAddr(newOwner)}
                        onClick={() => ask(`Start the ownership transfer to ${newOwner.trim()}? They must accept it.`) && tx.run("Transfer ownership", { functionName: "transferOwnership", args: [newOwner.trim()] })}
                      >
                        Start transfer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {tx.state.status !== "idle" ? (
        <div className="yka-toast">
          <b>{tx.state.label}</b>
          <div className="yka-s" style={{ marginTop: 4 }}>
            {tx.state.status === "wallet" && "Confirm in your wallet..."}
            {tx.state.status === "mining" && "Waiting for the network..."}
            {tx.state.status === "done" && "Done."}
            {tx.state.status === "error" && <span className="yka-err">{tx.state.msg}</span>}
          </div>
          <div className="yka-row" style={{ marginTop: 8 }}>
            {tx.state.hash ? (
              <a href={`${SCAN}/tx/${tx.state.hash}`} target="_blank" rel="noreferrer">
                View transaction
              </a>
            ) : null}
            {!tx.busy ? (
              <button className="yka-btn sm" onClick={tx.clear}>
                Close
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}