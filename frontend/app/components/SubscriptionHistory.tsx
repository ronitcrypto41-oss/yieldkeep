"use client";

// frontend/app/components/SubscriptionHistory.tsx
// Subscription history: every payment for the treasury, with date and time in the user's time zone,
// plan, period, amount, status (Active / Expired) and a link to the transaction on BaseScan.
// Only the owner wallet sees it. Payments are verified on-chain; the list is kept in this browser.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BASESCAN } from "@/lib/contracts";
import { shortAddress } from "@/lib/format";
import { fmtStamp, useZone } from "@/lib/timezone";
import { planOf } from "@/lib/plans";
import { readSubs, type Sub } from "@/lib/subscription";

const periodLabel = (months: number) => (months === 12 ? "Yearly" : months === 3 ? "3 months" : `${months} month${months > 1 ? "s" : ""}`);

export function SubscriptionHistory({ treasury, viewer }: { treasury?: string; viewer?: string }) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const { zone } = useZone();

  useEffect(() => {
    const load = () => setSubs(readSubs(treasury).sort((a, b) => b.paidAt - a.paidAt));
    load();
    window.addEventListener("yk-sub", load);
    window.addEventListener("yk-report", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("yk-sub", load);
      window.removeEventListener("yk-report", load);
      window.removeEventListener("storage", load);
    };
  }, [treasury]);

  if (!treasury) return null;
  if (viewer && viewer.toLowerCase() !== treasury.toLowerCase()) return null; // owner only

  const now = Date.now();
  const total = subs.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const activeUntil = subs.filter((s) => s.until > now).reduce((m, s) => Math.max(m, s.until), 0);

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Subscription history</h2>
        <Link href="/pricing" className="btn-ghost" style={{ display: "inline-block" }}>Plans and payment</Link>
      </div>

      {subs.length === 0 ? (
        <p className="empty" style={{ margin: "12px 0 0" }}>No subscription payment yet. You are on the Free plan.</p>
      ) : (
        <>
          <div className="act-summary" style={{ marginTop: 14 }}>
            <div><span>Payments</span><b>{subs.length}</b></div>
            <div><span>Total paid</span><b>{total.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC</b></div>
            <div><span>{activeUntil ? "Active until" : "Status"}</span><b>{activeUntil ? fmtStamp(activeUntil, zone).slice(0, 16) : "Expired"}</b></div>
          </div>

          {subs.map((s) => {
            const active = s.until > now;
            return (
              <div className="row" key={s.txHash}>
                <span>
                  <b>{planOf(s.plan ?? "pro").name}</b> · {periodLabel(s.months)} · <span className="yk-pill">{active ? "Active" : "Expired"}</span>
                  <br />
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Paid {fmtStamp(s.paidAt, zone)}</span>
                  <br />
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Valid until {fmtStamp(s.until, zone)}</span>
                  <br />
                  <a href={BASESCAN.tx(s.txHash)} target="_blank" rel="noreferrer" className="contract-link" style={{ fontSize: 12 }}>
                    {shortAddress(s.txHash)} ↗
                  </a>
                </span>
                <b className="num" style={{ textAlign: "right" }}>{s.amount} USDC</b>
              </div>
            );
          })}
        </>
      )}
      <p className="fee-note">Every payment is read from the blockchain, so the date and amount can be checked on BaseScan. Times follow your time zone.</p>
    </div>
  );
}