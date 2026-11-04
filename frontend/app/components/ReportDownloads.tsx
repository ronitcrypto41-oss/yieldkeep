"use client";

// frontend/app/components/ReportDownloads.tsx
// Activity page: plan + usage, TEAM (invite by signed link), and the download log
// (who downloaded, which format, what, when, report ID). The log is kept in this browser.
// treasury = the wallet whose data is shown, viewer = the connected wallet.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSignMessage } from "wagmi";
import { shortAddress } from "@/lib/format";
import { fmtScreen, useZone } from "@/lib/timezone";
import { activeTier } from "@/lib/subscription";
import { memberLimit, planOf } from "@/lib/plans";
import { buildInviteMessage, makeLink, makePayload, INVITE_DAYS } from "@/lib/invite";
import {
  FREE_REPORTS_PER_MONTH,
  PRO_CONTACT,
  canInvite,
  getAllowance,
  isPaid,
  readReportLog,
  readTeam,
  removeMember,
  saveMember,
  type Allowance,
  type Member,
  type ReportLog,
} from "@/lib/report-usage";

const input: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,.4)",
  background: "transparent",
  color: "inherit",
};

export function ReportDownloads({ treasury, viewer }: { treasury?: string; viewer?: string }) {
  const [log, setLog] = useState<ReportLog[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [allow, setAllow] = useState<Allowance | null>(null);
  const [addr, setAddr] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"viewer" | "accountant">("accountant");
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ link: string; name: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { zone } = useZone();
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    const load = () => {
      setLog(readReportLog(treasury));
      setTeam(readTeam(treasury));
      setAllow(getAllowance(treasury));
    };
    load();
    window.addEventListener("yk-report", load);
    window.addEventListener("storage", load);
    window.addEventListener("yk-sub", load);
    return () => {
      window.removeEventListener("yk-report", load);
      window.removeEventListener("storage", load);
      window.removeEventListener("yk-sub", load);
    };
  }, [treasury]);

  if (!treasury) return null;

  const isOwner = !viewer || viewer.toLowerCase() === treasury.toLowerCase();
  const plan = allow?.plan ?? "free";
  const paid = isPaid(plan);
  const until = activeTier(treasury).until;
  const limit = memberLimit(plan);
  const invited = team.filter((m) => !m.self);
  const pct = allow && !allow.unlimited ? Math.min(100, (allow.used / allow.limit) * 100) : 0;
  const nameOf = (a: string) => team.find((m) => m.address.toLowerCase() === a.toLowerCase())?.name;

  const copy = async (link: string, key: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  };

  const invite = async () => {
    setErr(null);
    setFresh(null);
    const a = addr.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return setErr("Enter the member's wallet address (0x…, 42 characters).");
    if (a.toLowerCase() === treasury.toLowerCase()) return setErr("That is your own wallet.");
    const why = canInvite(treasury, a);
    if (why) return setErr(why);
    setBusy(true);
    try {
      const payload = makePayload(treasury, a, name, role);
      const message = buildInviteMessage(payload);
      const signature = await signMessageAsync({ account: (viewer ?? treasury) as `0x${string}`, message } as any);
      const link = makeLink(message, signature);
      saveMember(treasury, { address: a, name: payload.name, role, addedAt: payload.iat, expiresAt: payload.exp, link });
      setFresh({ link, name: payload.name });
      setAddr("");
      setName("");
    } catch (e: any) {
      setErr(e?.shortMessage || "Signing was cancelled.");
    } finally {
      setBusy(false);
    }
  };

  const mailto = (link: string, who: string) =>
    `mailto:?subject=${encodeURIComponent("You are invited to a YieldKeep treasury")}&body=${encodeURIComponent(
      `Hi ${who},\n\nYou have been invited to view a DAO treasury on YieldKeep.\n\n1. Open this link: ${link}\n2. Connect the wallet I invited.\n3. Press Accept.\n\nThe link works for ${INVITE_DAYS} days.`
    )}`;

  return (
    <div className="card" style={{ marginTop: 24 }}>
      {/* plan */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Reports and access</h2>
        <span className="yk-pill">{planOf(plan).name} plan</span>
      </div>
      {until > 0 && <p className="yk-sub" style={{ margin: "6px 0 0" }}>Active until {fmtScreen(until, zone)}.</p>}
      {isOwner && (
        <p style={{ margin: "8px 0 0" }}>
          <Link href="/pricing" className="btn-ghost" style={{ display: "inline-block" }}>{plan === "enterprise" ? "Manage plan" : paid ? "Change or extend plan" : "Upgrade"}</Link>
        </p>
      )}

      {!paid && allow && (
        <div style={{ margin: "12px 0 6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span>{allow.used} of {FREE_REPORTS_PER_MONTH} free downloads used this month (PDF + CSV)</span>
            <b style={{ color: allow.blocked ? "#ef4444" : undefined }}>{allow.blocked ? "Limit reached" : `${allow.left} left`}</b>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "rgba(148,163,184,.25)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: allow.blocked ? "#ef4444" : "#3b82f6", borderRadius: 999 }} />
          </div>
        </div>
      )}

      {/* team: only the owner manages it */}
      {isOwner && (
        <>
          <h3 style={{ margin: "20px 0 6px", fontSize: 15 }}>
            Team {paid && <span style={{ fontWeight: 500, opacity: 0.7 }}>· {invited.filter((m) => m.expiresAt > Date.now()).length} of {limit} invited</span>}
          </h3>
          {!paid ? (
            <p className="empty" style={{ margin: 0 }}>
              Team members are part of the paid plans (Pro: 3, Business: 10, Enterprise: 25). On the Free plan only the owner wallet can view and download.
            </p>
          ) : (
            <>
              <p className="yk-sub" style={{ marginTop: 0 }}>
                Invite a person by wallet address. You sign the invite with your wallet (free, no gas) and send them the link. <b>Viewer</b> can view this treasury. <b>Accountant</b> can also download reports.
              </p>

              <div className="row">
                <span><b>You (owner)</b><br /><span style={{ fontSize: 12, opacity: 0.7, fontFamily: "monospace" }}>{shortAddress(treasury)}</span></span>
                <span className="yk-pill">Owner</span>
              </div>
              {invited.map((m) => {
                const expired = m.expiresAt < Date.now();
                return (
                  <div className="row" key={m.address}>
                    <span>
                      <b>{m.name}</b> · {m.role === "accountant" ? "Accountant" : "Viewer"}
                      <br />
                      <span style={{ fontSize: 12, opacity: 0.7, fontFamily: "monospace" }}>{shortAddress(m.address)}</span>
                      <br />
                      <span style={{ fontSize: 12, opacity: 0.7 }}>{expired ? "Invite expired" : `Invite sent · valid until ${fmtScreen(m.expiresAt, zone)}`}</span>
                    </span>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {m.link && !expired && <button type="button" className="act-link" onClick={() => copy(m.link!, m.address)}>{copied === m.address ? "Copied" : "Copy link"}</button>}
                      <button type="button" className="act-link" onClick={() => removeMember(treasury, m.address)}>Remove</button>
                    </span>
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Treasurer)" style={{ ...input, flex: "1 1 140px" }} />
                <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Member wallet 0x…" style={{ ...input, flex: "2 1 260px", fontFamily: "monospace" }} />
                <select value={role} onChange={(e) => setRole(e.target.value as any)} style={{ ...input, flex: "1 1 130px" }} aria-label="Role">
                  <option value="accountant">Accountant</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="button" className="btn-primary" onClick={invite} disabled={busy}>{busy ? "Waiting for wallet…" : "Create invite"}</button>
              </div>
              {err && <p className="fee-note" style={{ color: "#ef4444" }}>{err}</p>}

              {fresh && (
                <div className="alert" style={{ marginTop: 12, border: "1px solid #22c55e" }}>
                  <b>Invite ready for {fresh.name}.</b> Send them this link. It works for {INVITE_DAYS} days and only for the wallet you entered.
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button type="button" className="btn-ghost" onClick={() => copy(fresh.link, "fresh")}>{copied === "fresh" ? "Copied" : "Copy link"}</button>
                    <a className="btn-ghost" href={mailto(fresh.link, fresh.name)}>Send by email</a>
                  </div>
                </div>
              )}
              <p className="fee-note">
                A link cannot be cancelled before it expires. "Remove" clears it from your list. Instant removal for all devices arrives with the server update.
              </p>
            </>
          )}
        </>
      )}

      {/* log */}
      <h3 style={{ margin: "22px 0 6px", fontSize: 15 }}>Download log</h3>
      {log.length === 0 ? (
        <p className="empty" style={{ margin: 0 }}>No report has been downloaded yet.</p>
      ) : (
        log.slice(0, 15).map((r) => {
          const owner = r.by.toLowerCase() === r.treasury.toLowerCase();
          const who = owner ? "Owner" : nameOf(r.by) ?? "Team member";
          return (
            <div className="row" key={r.id}>
              <span>
                <b>{r.format ?? "PDF"}</b> · {r.title} · {r.period}
                <br />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {fmtScreen(r.at, zone)}
                  {r.what ? ` · ${r.what}` : ""}
                </span>
                <br />
                <span style={{ fontSize: 12, opacity: 0.7, fontFamily: "monospace" }}>{r.id}</span>
              </span>
              <b className="num" style={{ textAlign: "right" }}>
                {shortAddress(r.by)}
                <br />
                <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>{who}</span>
              </b>
            </div>
          );
        })
      )}
      <p className="fee-note">
        This log is kept in this browser. A shared log, where the owner sees every team download from any device, comes with the server update.
        {PRO_CONTACT ? ` Questions: ${PRO_CONTACT}` : ""}
      </p>
    </div>
  );
}