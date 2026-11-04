"use client";

// frontend/app/(app)/pricing/page.tsx   ->   opens at /pricing
// (pricing must be a FOLDER, and this file is page.tsx inside it)
// Three paid plans + Free. Pay in USDC from your wallet; the app checks the payment on-chain and
// switches the plan on. Works in every country: USDC needs no bank. Local-currency estimates are shown.

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseAbi, parseUnits } from "viem";
import { BASESCAN, USDC_ADDRESS } from "@/lib/contracts";
import { shortAddress } from "@/lib/format";
import { fmtScreen, useZone } from "@/lib/timezone";
import { CURRENCIES, useCurrency } from "@/lib/currency";
import { MAX_MONTHS, PLANS, planOf, type PlanDef, type Tier } from "@/lib/plans";
import { PAY_TO, activeTier, readSubs, verifyPayment, type Sub } from "@/lib/subscription";
import { USES_MOCK_ADAPTER } from "@/app/components/TestnetBanner";

const ERC20 = parseAbi(["function transfer(address to, uint256 value) returns (bool)"]);
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

const FAQ: [string, string][] = [
  ["Which countries can use YieldKeep?", "Every country. You pay in USDC from your own wallet, so no bank, card or local payment method is needed. USDC is a dollar stablecoin, so the price is the same everywhere."],
  ["What does a payment cover?", "The plan you choose for the period you choose. Paying again before the end date adds time on top. Upgrading to a higher plan starts the higher plan right away."],
  ["Which period is the best value?", "Monthly has no commitment. Paying for 3 months saves 10%. Paying for a year saves 2 months (about 17%). You can switch period any time you renew."],
  ["What happens when my plan ends?", "You go back to Free. Nothing is deleted: your history, reports and treasury stay yours. Team members you invited lose download access when the paid plan stops."],
  ["Do prices include tax?", "No. Prices are in USDC and do not include VAT, GST or other local taxes if they apply to you."],
  ["Can I get a refund?", "Contact us with your transaction hash within 7 days of paying and we will review it."],
  ["Is my treasury safe if I subscribe?", "Yes. A subscription only unlocks reports and team access. YieldKeep never holds your funds, and team members can never move them."],
];

export default function PricingPage() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { zone } = useZone();
  const cur = useCurrency();

  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [months, setMonths] = useState(1);
  const [choice, setChoice] = useState<Tier>("business");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hash, setHash] = useState("");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [active, setActive] = useState<{ tier: Tier; until: number }>({ tier: "free", until: 0 });

  useEffect(() => {
    const load = () => {
      setSubs(readSubs(address).sort((a, b) => b.paidAt - a.paidAt));
      setActive(activeTier(address));
    };
    load();
    window.addEventListener("yk-sub", load);
    return () => window.removeEventListener("yk-sub", load);
  }, [address]);

  const plan = planOf(choice);
  const price = period === "year" ? plan.yearly : period === "quarter" ? plan.quarterly : plan.monthly * months;
  const open = !!PAY_TO;
  const est = (usd: number) => cur.format(usd);

  const pay = async () => {
    if (!address || !client || !open || choice === "free") return;
    setBusy(true);
    setMsg(null);
    try {
      const tx = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20,
        functionName: "transfer",
                args: [PAY_TO as `0x${string}`, parseUnits(String(price), 6)],
        gas: 120000n,
      } as any);
      setMsg({ ok: true, text: "Payment sent. Waiting for confirmation…" });
      await client.waitForTransactionReceipt({ hash: tx });
      const r = await verifyPayment(client, address, tx);
      setMsg({ ok: r.ok, text: r.message });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.shortMessage || e?.message || "Payment was cancelled or failed." });
    } finally {
      setBusy(false);
    }
  };

  const checkHash = async () => {
    if (!address || !client) return;
    setBusy(true);
    setMsg(null);
    const r = await verifyPayment(client, address, hash.trim());
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) setHash("");
    setBusy(false);
  };

  const priceLine = (p: PlanDef) => {
    const usd = period === "year" ? p.yearly : period === "quarter" ? p.quarterly : p.monthly;
    return (
      <>
        <p style={{ fontSize: 30, fontWeight: 700, margin: "6px 0 0" }}>
          {money(usd)}
          <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.7 }}>{usd === 0 ? "" : period === "year" ? " / year" : period === "quarter" ? " / 3 months" : " / month"}</span>
        </p>
        <p className="fee-note" style={{ margin: "2px 0 10px", minHeight: 18 }}>
          {usd > 0 ? (est(usd) ? `about ${est(usd)} · paid in USDC` : "paid in USDC") : "no payment needed"}
          {period === "year" && usd > 0 ? ` · 2 months free` : ""}
          {period === "quarter" && usd > 0 ? ` · 10% off` : ""}
        </p>
      </>
    );
  };

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Plans and payment</h1>
          <p className="dash-sub">One simple price in USDC, the same in every country. Start free and upgrade when your team grows.</p>
        </div>
      </div>

      {USES_MOCK_ADAPTER && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          Testnet: payments here use test USDC with no real value. It is a safe way to try the whole flow.
        </div>
      )}

      {isConnected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 className="card-title" style={{ margin: 0 }}>Your plan</h2>
            <span className="yk-pill">{planOf(active.tier).name}</span>
          </div>
          <p className="yk-sub">
            {active.until ? `Active until ${fmtScreen(active.until, zone)} (${zone.replace(/_/g, " ")}).` : "You are on the Free plan."}
          </p>
        </div>
      )}

      {/* controls: period + currency */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className={`act-chip${period === "month" ? " is-on" : ""}`} onClick={() => setPeriod("month")}>Monthly</button>
          <button type="button" className={`act-chip${period === "quarter" ? " is-on" : ""}`} onClick={() => setPeriod("quarter")}>3 months · 10% off</button>
          <button type="button" className={`act-chip${period === "year" ? " is-on" : ""}`} onClick={() => setPeriod("year")}>Yearly · 2 months free</button>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          Show prices in
          <select
            value={cur.currency}
            onChange={(e) => cur.setCurrency(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(148,163,184,.4)", background: "transparent", color: "inherit" }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} style={{ color: "#000000", background: "#ffffff" }}>{c.code} · {c.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* the four plans */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
        {PLANS.map((p) => {
          const selected = choice === p.id;
          const current = active.tier === p.id;
          return (
            <div key={p.id} className="card" style={{ minWidth: 0, borderColor: selected && p.id !== "free" ? "#3b82f6" : undefined, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <h2 className="card-title" style={{ margin: 0 }}>{p.name}</h2>
                {current ? <span className="yk-pill">Current</span> : p.popular ? <span className="yk-pill">Most popular</span> : null}
              </div>
              <p className="yk-sub" style={{ margin: "4px 0 0" }}>{p.tagline}</p>
              {priceLine(p)}
              <div style={{ flex: 1 }}>
                {p.features.map((f) => (
                  <div className="row" key={f.text} style={{ opacity: f.soon ? 0.75 : 1 }}>
                    <span>✓ {f.text}{f.soon && <span className="yk-pill" style={{ marginLeft: 8 }}>Soon</span>}</span>
                  </div>
                ))}
              </div>
              {p.id !== "free" && (
                <button type="button" className={selected ? "btn-primary" : "btn-ghost"} style={{ marginTop: 14 }} onClick={() => { setChoice(p.id); document.getElementById("pay-box")?.scrollIntoView({ behavior: "smooth" }); }}>
                  {selected ? "Selected" : `Choose ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* quick comparison */}
      <div className="card" style={{ marginTop: 16, overflowX: "auto" }}>
        <h2 className="card-title">Compare plans</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}></th>
              {PLANS.map((p) => <th key={p.id} style={{ padding: "8px 6px" }}>{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ["Downloads (PDF + CSV)", ...PLANS.map((p) => (p.id === "free" ? "5 / month" : "Unlimited"))],
              ["Team members", ...PLANS.map((p) => (p.members ? String(p.members) : "Owner only"))],
              ["Roles (Viewer, Accountant)", ...PLANS.map((p) => (p.members ? "Yes" : "No"))],
              ["Download log", ...PLANS.map(() => "Yes")],
              ["Support", ...PLANS.map((p) => p.support)],
            ].map((row) => (
              <tr key={row[0]} style={{ borderTop: "1px solid rgba(148,163,184,.25)" }}>
                {row.map((c, i) => <td key={i} style={{ padding: "8px 6px", fontWeight: i === 0 ? 600 : 400 }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* payment session */}
      <div className="card" id="pay-box" style={{ marginTop: 16 }}>
        <h2 className="card-title">Pay in USDC</h2>
        {!isConnected ? (
          <p className="empty">Connect your treasury wallet to pay.</p>
        ) : !open ? (
          <p className="empty">Payments are not open yet. Check back soon.</p>
        ) : choice === "free" ? (
          <p className="empty">Choose Pro, Business or Enterprise above.</p>
        ) : (
          <>
            <div className="row">
              <span><b>1. Plan</b></span>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PLANS.filter((p) => p.id !== "free").map((p) => (
                  <button key={p.id} type="button" className={`act-chip${choice === p.id ? " is-on" : ""}`} onClick={() => setChoice(p.id)}>{p.name}</button>
                ))}
              </span>
            </div>
            <div className="row">
              <span><b>2. Period</b></span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className={`act-chip${period === "month" ? " is-on" : ""}`} onClick={() => setPeriod("month")}>Monthly</button>
                <button type="button" className={`act-chip${period === "quarter" ? " is-on" : ""}`} onClick={() => setPeriod("quarter")}>3 months</button>
                <button type="button" className={`act-chip${period === "year" ? " is-on" : ""}`} onClick={() => setPeriod("year")}>Yearly</button>
                {period === "month" && (
                  <>
                    <button type="button" className="act-chip" onClick={() => setMonths((m) => Math.max(1, m - 1))}>−</button>
                    <b>{months} month{months > 1 ? "s" : ""}</b>
                    <button type="button" className="act-chip" onClick={() => setMonths((m) => Math.min(MAX_MONTHS, m + 1))}>+</button>
                  </>
                )}
              </span>
            </div>
            <div className="row">
              <span>
                <b>3. Pay</b>
                <br />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {plan.name} · {period === "year" ? "12 months" : period === "quarter" ? "3 months" : `${months} month${months > 1 ? "s" : ""}`} · to {shortAddress(PAY_TO)} (YieldKeep payment wallet)
                </span>
              </span>
              <b className="num" style={{ textAlign: "right" }}>
                {price.toLocaleString("en-US")} USDC
                {est(price) && (<><br /><span style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>about {est(price)}</span></>)}
              </b>
            </div>
            <div style={{ margin: "12px 0" }}>
              <button type="button" className="btn-primary" onClick={pay} disabled={busy}>
                {busy ? "Working…" : `Pay ${price.toLocaleString("en-US")} USDC`}
              </button>
            </div>
            <p className="fee-note" style={{ marginTop: 0 }}>
              The app reads your payment from the blockchain, checks sender, receiver and amount, and turns the plan on. Send the exact amount shown: the amount decides the plan.
            </p>

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer" }}>I already paid: enter the transaction hash</summary>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x… transaction hash" style={{ flex: "1 1 280px", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,.4)", background: "transparent", color: "inherit", fontFamily: "monospace" }} />
                <button type="button" className="btn-ghost" onClick={checkHash} disabled={busy || !hash}>Check payment</button>
              </div>
            </details>
          </>
        )}
        {msg && <div className={`alert ${msg.ok ? "" : "alert-red"}`} style={{ marginTop: 12, ...(msg.ok ? { border: "1px solid #22c55e", color: "#16a34a" } : {}) }}>{msg.text}</div>}
        <p className="fee-note">Prices are in USDC and exclude local taxes. Amounts in your currency are estimates from live exchange rates.</p>
      </div>

      {/* payment history */}
      {isConnected && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="card-title">Payment history</h2>
          {subs.length === 0 ? (
            <p className="empty" style={{ margin: 0 }}>No payment yet.</p>
          ) : (
            subs.map((s) => (
              <div className="row" key={s.txHash}>
                <span>
                  <b>{planOf(s.plan ?? "pro").name}</b> · {fmtScreen(s.paidAt, zone)} · {s.months} month{s.months > 1 ? "s" : ""}
                  <br />
                  <a href={BASESCAN.tx(s.txHash)} target="_blank" rel="noreferrer" className="contract-link" style={{ fontSize: 12 }}>
                    {shortAddress(s.txHash)} ↗
                  </a>
                </span>
                <b className="num" style={{ textAlign: "right" }}>
                  {s.amount} USDC
                  <br />
                  <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>until {fmtScreen(s.until, zone)}</span>
                </b>
              </div>
            ))
          )}
        </div>
      )}

      {/* FAQ */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Questions</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} style={{ padding: "8px 0", borderTop: "1px solid rgba(148,163,184,.2)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{q}</summary>
            <p className="yk-sub" style={{ marginTop: 6 }}>{a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}