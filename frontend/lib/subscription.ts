// frontend/lib/subscription.ts
// Pro plan paid in USDC on Base. The payment is a normal USDC transfer from the treasury wallet to YOUR
// payment wallet (NEXT_PUBLIC_PAYMENT_ADDRESS, ideally your Safe). The app reads that transfer from the
// chain, checks sender, receiver and amount, and only then switches Pro on.
//   The amount decides the plan and the period (exact match, see lib/plans.ts):
//   Pro $50/month  Business $299/month  Enterprise $599/month  (1-6 months), or the yearly price (12 months for the price of 10)
//
// The proof is on-chain, so it cannot be faked without paying. The "Pro until" date is kept in this
// browser; if it is lost, the owner pastes the payment tx hash again. Automatic server-side billing
// (shared across devices) comes later.

import { decodeEventLog, parseAbi } from "viem";
import { TREASURY_ADDRESS, USDC_ADDRESS } from "@/lib/contracts";
import { PAID_PLANS, RANK, matchAmount, type Tier } from "@/lib/plans";

export const PAY_TO = (process.env.NEXT_PUBLIC_PAYMENT_ADDRESS ?? "").trim();
const DAY = 86_400_000;

export type Sub = { txHash: string; from: string; amount: string; months: number; paidAt: number; until: number; plan?: Tier };

const key = (t: string) => `yk_sub_v1_${String(TREASURY_ADDRESS).toLowerCase()}_${t.toLowerCase()}`;

export function readSubs(treasury?: string): Sub[] {
  if (!treasury || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(treasury));
    return raw ? (JSON.parse(raw) as Sub[]) : [];
  } catch {
    return [];
  }
}
function writeSubs(treasury: string, subs: Sub[]) {
  try {
    window.localStorage.setItem(key(treasury), JSON.stringify(subs));
    window.dispatchEvent(new Event("yk-report"));
    window.dispatchEvent(new Event("yk-sub"));
  } catch {}
}

/** The highest plan that is active right now, and until when ("free" if none). */
export function activeTier(treasury?: string): { tier: Tier; until: number } {
  const now = Date.now();
  let best: { tier: Tier; until: number } = { tier: "free", until: 0 };
  for (const s of readSubs(treasury)) {
    if (s.until <= now) continue;
    const t = s.plan ?? "pro"; // older payments had no plan = Pro
    if (RANK[t] > RANK[best.tier] || (t === best.tier && s.until > best.until)) best = { tier: t, until: s.until };
  }
  return best;
}
/** ms timestamp until which a paid plan is active (0 = none). */
export function proUntil(treasury?: string): number {
  return activeTier(treasury).until;
}

const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/** Reads the payment from the chain and, if it is valid, activates (or extends) Pro. */
export async function verifyPayment(
  client: any,
  treasury: string,
  txHash: string
): Promise<{ ok: boolean; message: string }> {
  if (!PAY_TO) return { ok: false, message: "Payments are not open yet (no payment wallet is set)." };
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return { ok: false, message: "That is not a valid transaction hash." };

  const subs = readSubs(treasury);
  if (subs.some((s) => s.txHash.toLowerCase() === txHash.toLowerCase()))
    return { ok: false, message: "This payment is already counted." };

  let receipt: any;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch {
    return { ok: false, message: "Transaction not found yet. Wait a few seconds and try again." };
  }
  if (receipt.status !== "success") return { ok: false, message: "That transaction failed on-chain." };

  let paid = 0n;
  for (const l of receipt.logs ?? []) {
    if (String(l.address).toLowerCase() !== String(USDC_ADDRESS).toLowerCase()) continue;
    try {
      const ev: any = decodeEventLog({ abi: TRANSFER, data: l.data, topics: l.topics });
      if (
        String(ev.args.from).toLowerCase() === treasury.toLowerCase() &&
        String(ev.args.to).toLowerCase() === PAY_TO.toLowerCase()
      )
        paid += ev.args.value as bigint;
    } catch {}
  }
  if (paid === 0n)
    return { ok: false, message: "No USDC payment from your wallet to the YieldKeep payment wallet was found in this transaction." };

  const usdc = Number(paid) / 1e6;
  const hit = matchAmount(usdc);
  if (!hit) {
    const list = PAID_PLANS.map((p) => `${p.name} $${p.monthly}/month or $${p.yearly}/year`).join(", ");
    return { ok: false, message: `Payment of ${usdc} USDC does not match a plan. Valid: ${list}. Contact support with your transaction hash.` };
  }
  const { plan, months } = hit;

  const blk = await client.getBlock({ blockNumber: receipt.blockNumber });
  const paidAt = Number(blk.timestamp) * 1000;
  // extends the same plan if it is still running; a higher plan starts now
  const startFrom = Math.max(paidAt, ...subs.filter((s) => (s.plan ?? "pro") === plan).map((s) => s.until), 0);
  const until = startFrom + months * 30 * DAY;

  writeSubs(treasury, [...subs, { txHash, from: treasury, amount: usdc.toString(), months, paidAt, until, plan }]);
  return { ok: true, message: `${plan.charAt(0).toUpperCase() + plan.slice(1)} is active for ${months} month${months > 1 ? "s" : ""}.` };
}