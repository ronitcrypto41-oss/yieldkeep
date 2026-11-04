"use client";

// frontend/app/(app)/invite/page.tsx   ->   opens at /invite?d=...
// A team member opens the invite link, connects the invited wallet and presses Accept.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { shortAddress } from "@/lib/format";
import { fmtScreen, useZone } from "@/lib/timezone";
import { planOf } from "@/lib/plans";
import { acceptInvite, checkInvite, parseInvite, type ParsedInvite } from "@/lib/invite";

export default function InvitePage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const { zone } = useZone();

  const [inv, setInv] = useState<ParsedInvite | null | undefined>(undefined); // undefined = loading
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setInv(parseInvite(new URLSearchParams(window.location.search).get("d")));
  }, []);

  useEffect(() => {
    if (!inv) return;
    let live = true;
    checkInvite(inv, address).then((e) => live && setProblem(e));
    return () => {
      live = false;
    };
  }, [inv, address]);

  const accept = async () => {
    if (!inv || !address || !client) return;
    setBusy(true);
    setMsg(null);
    const r = await acceptInvite(client, inv, address);
    setBusy(false);
    if (r.ok) setDone(true);
    else setMsg(r.message);
  };

  const p = inv?.payload;

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Team invite</h1>
          <p className="dash-sub">You were invited to a DAO treasury on YieldKeep.</p>
        </div>
      </div>

      <div className="card">
        {inv === undefined ? (
          <p className="empty">Reading invite…</p>
        ) : inv === null ? (
          <p className="empty">This invite link is not valid. Ask the owner to send it again.</p>
        ) : (
          <>
            <div className="row"><span>Treasury owner</span><b className="num">{shortAddress(p!.treasury)}</b></div>
            <div className="row"><span>Invited wallet</span><b className="num">{shortAddress(p!.invitee)}</b></div>
            <div className="row"><span>Your name there</span><b>{p!.name}</b></div>
            <div className="row">
              <span>Role</span>
              <b>{p!.role === "accountant" ? "Accountant (view and download reports)" : "Viewer (view only)"}</b>
            </div>
            <div className="row"><span>Owner's plan</span><b>{planOf(p!.tier).name}</b></div>
            <div className="row"><span>Link valid until</span><b>{fmtScreen(p!.exp, zone)}</b></div>

            {!isConnected ? (
              <p className="empty" style={{ marginTop: 14 }}>Connect the invited wallet to continue.</p>
            ) : problem ? (
              <div className="alert alert-red" style={{ marginTop: 14 }}>{problem}</div>
            ) : done ? (
              <div style={{ marginTop: 14 }}>
                <div className="alert" style={{ border: "1px solid #22c55e", marginBottom: 12 }}>Access added. You can now open this treasury.</div>
                <button type="button" className="btn-primary" onClick={() => router.push("/activity")}>Open the treasury →</button>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <button type="button" className="btn-primary" onClick={accept} disabled={busy}>{busy ? "Checking on-chain…" : "Accept invite"}</button>
                {msg && <div className="alert alert-red" style={{ marginTop: 12 }}>{msg}</div>}
              </div>
            )}
            <p className="fee-note">
              Accepting only gives you access to this one treasury's activity. It never gives access to any funds. Only the owner's wallet can deposit or withdraw.
            </p>
          </>
        )}
      </div>
    </div>
  );
}