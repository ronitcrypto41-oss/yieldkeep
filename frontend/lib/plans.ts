// frontend/lib/plans.ts
// The plans, in ONE place. Change a price or a feature here and every page updates.
// Prices are in USDC (1 USDC = about 1 US dollar).
// Monthly = full price. 3 months prepaid = 10% off. Yearly = 12 months for the price of 10 (2 months free).
// "soon: true" = shown with a "Coming soon" label. Do not sell a feature as ready until you build it.

export type Tier = "free" | "pro" | "business" | "enterprise";
export type MemberRole = "viewer" | "accountant";
export type Feature = { text: string; soon?: boolean };
export type PlanDef = {
  id: Tier;
  name: string;
  tagline: string;
  monthly: number;
  quarterly: number; // 3 months prepaid (10% off)
  yearly: number;
  members: number; // how many team members the owner can invite
  support: string;
  popular?: boolean;
  features: Feature[];
};

export const FREE_DOWNLOADS = 5; // free plan: downloads per month (PDF reports)
export const MAX_MONTHS = 6; // monthly payments: 1 to 6 months at once (longer = yearly)

export const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For trying YieldKeep",
    monthly: 0,
    quarterly: 0,
    yearly: 0,
    members: 0,
    support: "Community",
    features: [
      { text: `${FREE_DOWNLOADS} PDF downloads per month` },
      { text: "Owner wallet only" },
      { text: "Full activity history and fee details" },
      { text: "Download log with wallet and time" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For small DAOs and treasurers",
    monthly: 50,
    quarterly: 135,
    yearly: 500,
    members: 3,
    support: "Email, 3 working days",
    features: [
      { text: "Unlimited PDF report downloads" },
      { text: "Invite up to 3 team members" },
      { text: "Roles: Viewer and Accountant" },
      { text: "Every download shows who, when and what" },
      { text: "Reports with your time zone" },
    ],
  },
  {
    id: "business",
    name: "Business",
    tagline: "For active DAOs with a finance team",
    monthly: 299,
    quarterly: 807,
    yearly: 2990,
    members: 10,
    support: "Priority, reply within 24 hours",
    popular: true,
    features: [
      { text: "Everything in Pro" },
      { text: "Invite up to 10 team members" },
      { text: "30-minute onboarding call" },
      { text: "Priority support, reply within 24 hours" },
      { text: "Your DAO name on the report cover", soon: true },
      { text: "Scheduled monthly report by email", soon: true },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For foundations and large treasuries",
    monthly: 599,
    quarterly: 1617,
    yearly: 5990,
    members: 25,
    support: "Dedicated chat channel",
    features: [
      { text: "Everything in Business" },
      { text: "Invite up to 25 team members" },
      { text: "Dedicated support chat (Telegram, Discord or Slack)" },
      { text: "Quarterly treasury review call" },
      { text: "Early access and feature requests" },
      { text: "White-label reports with your own logo", soon: true },
      { text: "Several treasuries in one view", soon: true },
    ],
  },
];

export const RANK: Record<Tier, number> = { free: 0, pro: 1, business: 2, enterprise: 3 };
export const planOf = (t: Tier) => PLANS.find((p) => p.id === t)!;
export const PAID_PLANS = PLANS.filter((p) => p.id !== "free");
export const memberLimit = (t: Tier) => planOf(t).members;

/** Which plan and period does a USDC amount pay for? Exact match only (so nobody pays the wrong tier by accident). */
export function matchAmount(usdc: number): { plan: Tier; months: number } | null {
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.0001;
  for (const p of PAID_PLANS) {
    if (eq(usdc, p.yearly)) return { plan: p.id, months: 12 };
    if (eq(usdc, p.quarterly)) return { plan: p.id, months: 3 };
    for (let m = 1; m <= MAX_MONTHS; m++) if (eq(usdc, p.monthly * m)) return { plan: p.id, months: m };
  }
  return null;
}