// frontend/lib/invite.ts
// Team invites without a server.
//   1. The owner types the member's wallet, name and role, and SIGNS an invite with their wallet (free, no gas).
//   2. The signed invite becomes a link. The owner sends it by email, chat, anything.
//   3. The member opens the link, connects the invited wallet and presses Accept.
//   4. The app checks the owner's signature, that the link is for this wallet, that it has not expired and
//      that the owner's plan payments exist on-chain. Then the member can view (and, as Accountant, download).
//
// Honest limits: a link cannot be revoked before it expires (it lasts at most 30 days), and the member's
// downloads are logged in the member's browser. Revoking and a shared log need the small server (planned).
// Signature check works for normal wallets (EOA). Safe multisig owners are not supported by this check yet.

import { verifyMessage } from "viem";
import { TREASURY_ADDRESS } from "@/lib/contracts";
import { getPlan, isPaid, saveMember } from "@/lib/report-usage";
import { readSubs, verifyPayment } from "@/lib/subscription";
import type { MemberRole, Tier } from "@/lib/plans";

const DAY = 86_400_000;
export const INVITE_DAYS = 30;
const HEAD = "YieldKeep team invite\n";

export type InvitePayload = {
  v: 1;
  vault: string;
  treasury: string; // the owner wallet that signs
  invitee: string; // the wallet that may accept
  name: string;
  role: MemberRole;
  tier: Tier;
  iat: number;
  exp: number;
  subs: string[]; // owner's plan payment hashes, so the member's app can verify the plan on-chain
};
export type ParsedInvite = { payload: InvitePayload; message: string; signature: string };

const b64e = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64d = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export function buildInviteMessage(p: InvitePayload) {
  return HEAD + JSON.stringify(p);
}

export function makePayload(owner: string, invitee: string, name: string, role: MemberRole): InvitePayload {
  const now = Date.now();
  const subs = readSubs(owner).filter((s) => s.until > now).map((s) => s.txHash);
  return {
    v: 1,
    vault: String(TREASURY_ADDRESS),
    treasury: owner,
    invitee,
    name: name.trim() || "Team member",
    role,
    tier: getPlan(owner),
    iat: now,
    exp: now + INVITE_DAYS * DAY,
    subs,
  };
}

export function makeLink(message: string, signature: string) {
  return `${window.location.origin}/invite?d=${b64e(JSON.stringify({ m: message, s: signature }))}`;
}

export function parseInvite(d: string | null): ParsedInvite | null {
  try {
    if (!d) return null;
    const { m, s } = JSON.parse(b64d(d));
    if (typeof m !== "string" || typeof s !== "string" || !m.startsWith(HEAD)) return null;
    const payload = JSON.parse(m.slice(HEAD.length)) as InvitePayload;
    if (payload?.v !== 1 || !payload.treasury || !payload.invitee || !payload.exp) return null;
    return { payload, message: m, signature: s };
  } catch {
    return null;
  }
}

/** Checks everything that can be checked without the chain. Returns an error text or null. */
export async function checkInvite(inv: ParsedInvite, me?: string): Promise<string | null> {
  const p = inv.payload;
  if (p.vault.toLowerCase() !== String(TREASURY_ADDRESS).toLowerCase()) return "This invite is for a different YieldKeep vault.";
  if (p.exp < Date.now()) return "This invite has expired. Ask the owner for a new one.";
  let ok = false;
  try {
    ok = await verifyMessage({ address: p.treasury as `0x${string}`, message: inv.message, signature: inv.signature as `0x${string}` });
  } catch {}
  if (!ok) return "The owner's signature on this invite is not valid.";
  if (me && me.toLowerCase() !== p.invitee.toLowerCase()) return `This invite is for ${p.invitee.slice(0, 6)}…${p.invitee.slice(-4)}. Connect that wallet.`;
  return null;
}

/* ---------- which treasuries can this wallet view? ---------- */
export type Membership = { treasury: string; name: string; role: MemberRole; expiresAt: number };
const mKey = (me: string) => `yk_memberships_v1_${String(TREASURY_ADDRESS).toLowerCase()}_${me.toLowerCase()}`;
const vKey = (me: string) => `yk_viewas_v1_${String(TREASURY_ADDRESS).toLowerCase()}_${me.toLowerCase()}`;

export function readMemberships(me?: string): Membership[] {
  if (!me || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(mKey(me));
    return ((raw ? JSON.parse(raw) : []) as Membership[]).filter((m) => m.expiresAt > Date.now());
  } catch {
    return [];
  }
}
export function getViewAs(me?: string): string | null {
  if (!me || typeof window === "undefined") return null;
  try {
    const t = window.localStorage.getItem(vKey(me));
    return t && readMemberships(me).some((m) => m.treasury.toLowerCase() === t.toLowerCase()) ? t : null;
  } catch {
    return null;
  }
}
export function setViewAs(me: string, treasury: string | null) {
  try {
    if (treasury) window.localStorage.setItem(vKey(me), treasury);
    else window.localStorage.removeItem(vKey(me));
    window.dispatchEvent(new Event("yk-viewas"));
  } catch {}
}

/** The member presses Accept: verify, verify the owner's plan on-chain, save access. */
export async function acceptInvite(client: any, inv: ParsedInvite, me: string): Promise<{ ok: boolean; message: string }> {
  const err = await checkInvite(inv, me);
  if (err) return { ok: false, message: err };
  const p = inv.payload;
  for (const h of p.subs) await verifyPayment(client, p.treasury, h); // "already counted" is fine
  if (!isPaid(getPlan(p.treasury))) return { ok: false, message: "The owner's paid plan could not be verified on-chain. Ask the owner to check their plan." };

  saveMember(p.treasury, { address: me, name: p.name, role: p.role, addedAt: Date.now(), expiresAt: p.exp, self: true });
  try {
    const list = readMemberships(me).filter((m) => m.treasury.toLowerCase() !== p.treasury.toLowerCase());
    list.push({ treasury: p.treasury, name: p.name, role: p.role, expiresAt: p.exp });
    window.localStorage.setItem(mKey(me), JSON.stringify(list));
  } catch {}
  setViewAs(me, p.treasury);
  return { ok: true, message: "Access added." };
}