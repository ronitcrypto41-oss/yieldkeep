import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { TREASURY_ADDRESS } from "@/lib/contracts";
import { getIndex } from "@/lib/server/indexer";
import { getPayments, paymentWalletSet, type Payment } from "@/lib/server/payments";
import { RANK, matchAmount, planOf, type Tier } from "@/lib/plans";

const RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
export const chain: any = createPublicClient({ chain: baseSepolia, transport: http(RPC, { timeout: 20000, retryCount: 2 }) });

const ABI = [
  {
    type: "function",
    name: "feeInfo",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "value", type: "uint256" },
      { name: "costBasis", type: "uint256" },
      { name: "profit", type: "uint256" },
      { name: "feeDue", type: "uint256" },
      { name: "youKeep", type: "uint256" },
      { name: "nextSettleAt", type: "uint256" },
    ],
  },
  { type: "function", name: "totalFeesPaid", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

type Sub = { tier: Tier; until: number; paid: bigint; count: number; unmatched: bigint };
type T = {
  address: string;
  firstDeposit: number;
  lastActivity: number;
  deposited: bigint;
  withdrawn: bigint;
  shares: bigint;
  txCount: number;
  feesPaid: bigint;
  realized: bigint;
  value: bigint;
  profit: bigint;
  feeDue: bigint;
  nextSettleAt: number;
};

const DAY = 86_400_000;

function buildSubs(payments: Payment[]): Map<string, Sub> {
  const out = new Map<string, Sub>();
  const byUser = new Map<string, Payment[]>();
  for (const p of payments) {
    const list = byUser.get(p.from) ?? [];
    list.push(p);
    byUser.set(p.from, list);
  }
  const now = Date.now();
  for (const [user, list] of byUser) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    const periods: { plan: Tier; until: number }[] = [];
    let paid = 0n;
    let unmatched = 0n;
    for (const p of list) {
      const units = BigInt(p.amount);
      paid += units;
      const hit = matchAmount(Number(units) / 1e6);
      if (!hit) {
        unmatched += units;
        continue;
      }
      const startFrom = Math.max(p.timestamp, ...periods.filter((x) => x.plan === hit.plan).map((x) => x.until), 0);
      periods.push({ plan: hit.plan, until: startFrom + hit.months * 30 * DAY });
    }
    let best: { tier: Tier; until: number } = { tier: "free", until: 0 };
    for (const x of periods) {
      if (x.until <= now) continue;
      if (RANK[x.plan] > RANK[best.tier] || (x.plan === best.tier && x.until > best.until)) best = { tier: x.plan, until: x.until };
    }
    out.set(user, { tier: best.tier, until: best.until, paid, count: list.length, unmatched });
  }
  return out;
}

const monthKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function getAdminStats() {
  const idx = await getIndex();

  let payments: Payment[] = [];
  let paymentsOk = true;
  try {
    payments = await getPayments();
  } catch (e) {
    paymentsOk = false;
    console.error("[admin] could not read subscription payments:", e);
  }
  const subs = buildSubs(payments);

  const map = new Map<string, T>();
  const get = (a: string): T => {
    let t = map.get(a);
    if (!t) {
      t = { address: a, firstDeposit: 0, lastActivity: 0, deposited: 0n, withdrawn: 0n, shares: 0n, txCount: 0, feesPaid: 0n, realized: 0n, value: 0n, profit: 0n, feeDue: 0n, nextSettleAt: 0 };
      map.set(a, t);
    }
    return t;
  };

  let deposits = 0;
  let withdrawals = 0;
  let harvests = 0;
  for (const e of idx.events) {
    if (e.kind === "harvest" || !e.user) {
      harvests++;
      continue;
    }
    const t = get(e.user);
    t.txCount++;
    if (e.timestamp > t.lastActivity) t.lastActivity = e.timestamp;
    if (e.kind === "deposit") {
      deposits++;
      t.deposited += BigInt(e.assets);
      t.shares += BigInt(e.shares);
      if (e.timestamp && (t.firstDeposit === 0 || e.timestamp < t.firstDeposit)) t.firstDeposit = e.timestamp;
    } else {
      withdrawals++;
      t.withdrawn += BigInt(e.assets);
      t.shares -= BigInt(e.shares);
    }
  }
  for (const f of idx.fees) {
    const t = map.get(f.user);
    if (t) {
      t.feesPaid += BigInt(f.fee);
      t.realized += BigInt(f.profit);
    }
  }

  const active = [...map.values()].filter((t) => t.shares > 0n);
  for (let i = 0; i < active.length; i += 200) {
    const batch = active.slice(i, i + 200);
    try {
      const res: any[] = await chain.multicall({
        contracts: batch.map((t) => ({ address: TREASURY_ADDRESS, abi: ABI, functionName: "feeInfo", args: [t.address] })),
        allowFailure: true,
      });
      res.forEach((r, k) => {
        if (r?.status === "success" && Array.isArray(r.result)) {
          const v = r.result as readonly bigint[];
          batch[k].value = v[0];
          batch[k].profit = v[2];
          batch[k].feeDue = v[3];
          batch[k].nextSettleAt = Number(v[5]);
        }
      });
    } catch (e) {
      console.error("[admin] live read failed:", e);
    }
  }

  let contractFees = "0";
  try {
    contractFees = String(await chain.readContract({ address: TREASURY_ADDRESS, abi: ABI, functionName: "totalFeesPaid" }));
  } catch {}

  const all = [...map.values()];
  const now = Date.now();
  let deposited = 0n;
  let withdrawn = 0n;
  let tvl = 0n;
  let openFees = 0n;
  let openProfit = 0n;
  let feesPaid = 0n;
  let pnl = 0n;
  const tiers: Record<Tier, number> = { free: 0, pro: 0, business: 0, enterprise: 0 };
  for (const t of all) {
    deposited += t.deposited;
    withdrawn += t.withdrawn;
    tvl += t.value;
    openFees += t.feeDue;
    openProfit += t.profit;
    feesPaid += t.feesPaid;
    pnl += t.value + t.withdrawn - t.deposited;
    const s = subs.get(t.address);
    tiers[s && s.until > now ? s.tier : "free"]++;
  }

  let subsRevenue = 0n;
  for (const p of payments) subsRevenue += BigInt(p.amount);
  let mrr = 0;
  for (const s of subs.values()) if (s.until > now && s.tier !== "free") mrr += planOf(s.tier).monthly;

  const months: { month: string; newTreasuries: number; fees: string; subs: string; profitCharged: string }[] = [];
  const nowD = new Date();
  const idxMap = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i, 1));
    const key = monthKey(d.getTime());
    idxMap.set(key, months.length);
    months.push({ month: key, newTreasuries: 0, fees: "0", subs: "0", profitCharged: "0" });
  }
  const mFees = months.map(() => 0n);
  const mSubs = months.map(() => 0n);
  const mProfit = months.map(() => 0n);
  for (const t of all) {
    if (!t.firstDeposit) continue;
    const k = idxMap.get(monthKey(t.firstDeposit));
    if (k !== undefined) months[k].newTreasuries++;
  }
  for (const f of idx.fees) {
    const k = idxMap.get(monthKey(f.timestamp));
    if (k === undefined) continue;
    mFees[k] += BigInt(f.fee);
    mProfit[k] += BigInt(f.profit);
  }
  for (const p of payments) {
    const k = idxMap.get(monthKey(p.timestamp));
    if (k !== undefined) mSubs[k] += BigInt(p.amount);
  }
  months.forEach((m, i) => {
    m.fees = mFees[i].toString();
    m.subs = mSubs[i].toString();
    m.profitCharged = mProfit[i].toString();
  });

  const today = Math.floor(now / DAY);
  const newPerDay: { day: string; count: number }[] = [];
  for (let d = 29; d >= 0; d--) {
    const dayNo = today - d;
    const count = all.filter((t) => t.firstDeposit && Math.floor(t.firstDeposit / DAY) === dayNo).length;
    newPerDay.push({ day: new Date(dayNo * DAY).toISOString().slice(0, 10), count });
  }

  const s = (v: bigint) => v.toString();
  const vaultUsers = new Set(all.map((t) => t.address));
  return {
    generatedAt: now,
    lastBlock: idx.lastBlock,
    paymentWalletSet,
    paymentsOk,
    totals: {
      treasuries: all.length,
      active: active.length,
      deposits,
      withdrawals,
      harvests,
      deposited: s(deposited),
      withdrawn: s(withdrawn),
      tvl: s(tvl),
      pnl: s(pnl),
      openProfit: s(openProfit),
      openFees: s(openFees),
      feesPaid: s(feesPaid),
      contractFeesPaid: contractFees,
      subsRevenue: s(subsRevenue),
      income: s(feesPaid + subsRevenue),
      mrr,
      tiers,
    },
    months,
    newPerDay,
    treasuries: all
      .sort((a, b) => (b.value === a.value ? b.lastActivity - a.lastActivity : b.value > a.value ? 1 : -1))
      .map((t) => {
        const sub = subs.get(t.address);
        const live = !!sub && sub.until > now;
        return {
          address: t.address,
          firstDeposit: t.firstDeposit,
          lastActivity: t.lastActivity,
          deposited: s(t.deposited),
          withdrawn: s(t.withdrawn),
          value: s(t.value),
          pnl: s(t.value + t.withdrawn - t.deposited),
          profit: s(t.profit),
          realized: s(t.realized),
          feeDue: s(t.feeDue),
          feesPaid: s(t.feesPaid),
          nextSettleAt: t.nextSettleAt,
          txCount: t.txCount,
          active: t.shares > 0n,
          tier: (live ? sub!.tier : "free") as Tier,
          subUntil: live ? sub!.until : 0,
          subPaid: s(sub ? sub.paid : 0n),
        };
      }),
    subscribers: [...subs.entries()]
      .map(([address, x]) => ({
        address,
        tier: (x.until > now ? x.tier : "free") as Tier,
        until: x.until,
        paid: s(x.paid),
        payments: x.count,
        inVault: vaultUsers.has(address),
      }))
      .sort((a, b) => b.until - a.until),
    recent: idx.events.slice(0, 15),
  };
}