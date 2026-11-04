// frontend/lib/report-usage.ts
// Plans, team, download log and the monthly limit for reports (PDF and CSV).
//   FREE       : owner wallet only, 5 downloads per calendar month (PDF + CSV together)
//   PAID PLANS : unlimited downloads + team members (see lib/plans.ts for prices and member limits)
//
// IMPORTANT: this lives in the browser (localStorage). It is a real record for this browser, but it is
// not tamper-proof and it is not shared between computers. The payment proof is on-chain (lib/subscription.ts).
// A log shared across a team (so the owner sees what a team member downloaded) needs a small server.

import { TREASURY_ADDRESS } from "@/lib/contracts";
import { activeTier } from "@/lib/subscription";
import { FREE_DOWNLOADS, memberLimit, type MemberRole, type Tier } from "@/lib/plans";

export const FREE_REPORTS_PER_MONTH = FREE_DOWNLOADS;

// Testing: NEXT_PUBLIC_REPORT_LIMIT=off removes every limit (acts like Enterprise).
const LIMIT_OFF = process.env.NEXT_PUBLIC_REPORT_LIMIT === "off";
// Grant the Business plan by hand (wallet addresses, comma separated), e.g. for a pilot customer.
const GRANT_LIST = (process.env.NEXT_PUBLIC_PRO_TREASURIES ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
export const PRO_CONTACT = process.env.NEXT_PUBLIC_PRO_CONTACT ?? "";

export type Format = "PDF" | "CSV";
export type LogRole = "owner" | "member";

export type ReportLog = {
  id: string; // printed on the PDF / first line of the CSV
  at: number; // ms
  by: string; // wallet that downloaded
  treasury: string; // wallet the report is about
  title: string;
  period: string;
  format?: Format; // older entries have none = PDF
  what?: string; // e.g. "12 transactions"
  role?: LogRole;
};

// A team member. In the OWNER's browser: someone the owner invited (self = false).
// In the MEMBER's browser: the member's own access to a treasury (self = true).
export type Member = {
  address: string;
  name: string;
  role: MemberRole;
  addedAt: number;
  expiresAt: number;
  link?: string; // the invite link (owner side), so it can be copied again
  self?: boolean;
};

const v = () => String(TREASURY_ADDRESS).toLowerCase();
const logKey = (t: string) => `yk_report_log_v1_${v()}_${t.toLowerCase()}`;
const teamKey = (t: string) => `yk_team_v2_${v()}_${t.toLowerCase()}`;

/* ---------- plan ---------- */
export function getPlan(treasury?: string): Tier {
  if (LIMIT_OFF) return "enterprise";
  if (treasury && GRANT_LIST.includes(treasury.toLowerCase())) return "business";
  return activeTier(treasury).tier;
}
export const isPaid = (t: Tier) => t !== "free";

/* ---------- team ---------- */
export function readTeam(treasury?: string): Member[] {
  if (!treasury || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(teamKey(treasury));
    return raw ? (JSON.parse(raw) as Member[]) : [];
  } catch {
    return [];
  }
}
function writeTeam(treasury: string, list: Member[]) {
  try {
    window.localStorage.setItem(teamKey(treasury), JSON.stringify(list));
    window.dispatchEvent(new Event("yk-report"));
  } catch {}
}
export function saveMember(treasury: string, m: Member) {
  const list = readTeam(treasury).filter((x) => x.address.toLowerCase() !== m.address.toLowerCase());
  list.push(m);
  writeTeam(treasury, list);
}
export function removeMember(treasury: string, address: string) {
  writeTeam(treasury, readTeam(treasury).filter((m) => m.address.toLowerCase() !== address.toLowerCase()));
}
/** Can the owner invite one more person on the current plan? Returns an error text or null. */
export function canInvite(treasury: string, address: string): string | null {
  const plan = getPlan(treasury);
  if (!isPaid(plan)) return "Inviting team members needs a paid plan.";
  const invited = readTeam(treasury).filter((m) => !m.self && m.expiresAt > Date.now());
  const already = invited.some((m) => m.address.toLowerCase() === address.toLowerCase());
  if (!already && invited.length >= memberLimit(plan)) return `Your plan allows ${memberLimit(plan)} team members. Upgrade to invite more.`;
  return null;
}

/* ---------- log ---------- */
export function readReportLog(treasury?: string): ReportLog[] {
  if (!treasury || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(logKey(treasury));
    const arr = raw ? (JSON.parse(raw) as ReportLog[]) : [];
    return arr.filter((e) => e && typeof e.at === "number").sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export function recordReportDownload(treasury: string, entry: ReportLog) {
  if (typeof window === "undefined") return;
  try {
    const all = readReportLog(treasury);
    all.unshift(entry);
    window.localStorage.setItem(logKey(treasury), JSON.stringify(all.slice(0, 500)));
    window.dispatchEvent(new Event("yk-report"));
  } catch {
    /* storage blocked: the file is still created */
  }
}

export function newReportId() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let hex = "";
  try {
    const a = new Uint8Array(3);
    crypto.getRandomValues(a);
    hex = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
  }
  return `YK-${day}-${hex.toUpperCase()}`;
}

/* ---------- allowance ---------- */
export type Allowance = { used: number; limit: number; left: number; blocked: boolean; unlimited: boolean; plan: Tier };

export function getAllowance(treasury?: string): Allowance {
  const now = new Date();
  const used = readReportLog(treasury).filter((e) => {
    const d = new Date(e.at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const plan = getPlan(treasury);
  if (isPaid(plan)) return { used, limit: Infinity, left: Infinity, blocked: false, unlimited: true, plan };
  const left = Math.max(0, FREE_REPORTS_PER_MONTH - used);
  return { used, limit: FREE_REPORTS_PER_MONTH, left, blocked: left === 0, unlimited: false, plan };
}

export const limitMessage =
  `You have used all ${FREE_REPORTS_PER_MONTH} free downloads this month. ` +
  `Open the Pricing page to upgrade for unlimited downloads and team members.` +
  (PRO_CONTACT ? ` Contact: ${PRO_CONTACT}` : "");

/** Who is allowed to download? Returns an error text, or null when it is allowed. */
export function checkDownload(treasury: string, by: string): string | null {
  if (by.toLowerCase() === treasury.toLowerCase()) return getAllowance(treasury).blocked ? limitMessage : null;
  const m = readTeam(treasury).find((x) => x.self && x.address.toLowerCase() === by.toLowerCase());
  if (!m) return "This wallet is not the owner or a team member of this treasury.";
  if (m.expiresAt < Date.now()) return "Your team access has expired. Ask the owner for a new invite.";
  if (m.role !== "accountant") return "Your role is Viewer: you can view this treasury but not download reports.";
  if (!isPaid(getPlan(treasury))) return "The owner's plan is not active, so team downloads are paused.";
  return null;
}

export function roleOf(treasury: string, by: string): LogRole {
  return by.toLowerCase() === treasury.toLowerCase() ? "owner" : "member";
}