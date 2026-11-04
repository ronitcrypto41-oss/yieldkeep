"use client";

// frontend/app/components/LiveVaultProof.tsx
// Public "live proof" section for the landing page. Real on-chain data only.
//  - NOT connected: vault-level numbers (public proof). The treasury list is replaced
//    by a "connect your wallet" card.
//  - Connected: list of active treasuries (with avatars).
//  - Personal deposits, withdrawals, PnL and charts live on the dashboard only.

import React, { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { TREASURY_ABI, TREASURY_ADDRESS, BASESCAN } from "@/lib/contracts";
import { useMergedEvents } from "@/lib/use-merged-events";
import { AddressAvatar } from "@/app/components/charts";

/* Treasuries that gave you WRITTEN permission to be shown by name / logo.
   Key = wallet address in lower case. Leave EMPTY until a real treasury agrees.
   Example (only after they approve):
   "0xabc...": { name: "Example DAO", logo: "/treasuries/example.png" }            */
const LISTED: Record<string, { name: string; logo?: string }> = {};

type Palette = Record<string, string>;

const usd = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function LiveVaultProof({
  c,
  aaveIcon,
  onConnect,
}: {
  c: Palette;
  aaveIcon?: React.ReactNode;
  onConnect?: () => void;
}) {
  const { address, isConnected } = useAccount();
  const me = address?.toLowerCase();
  const { events, loaded } = useMergedEvents(address);

  const { data: tvl } = useReadContract({ address: TREASURY_ADDRESS, abi: TREASURY_ABI, functionName: "totalAssets", query: { refetchInterval: 10000 } });
  const view = useMemo(() => {
    const users = new Map<string, { shares: bigint; dep: bigint; wd: bigint; first: number }>();
    let deposited = 0n;
    let harvests = 0;
    for (const e of events) {
      if (e.kind === "harvest") { harvests++; continue; }
      if (!e.user) continue;
      const u = users.get(e.user) ?? { shares: 0n, dep: 0n, wd: 0n, first: 0 };
      if (e.kind === "deposit") {
        u.shares += e.shares;
        u.dep += e.assets;
        deposited += e.assets;
        if (e.timestamp) u.first = u.first ? Math.min(u.first, e.timestamp) : e.timestamp;
      } else {
        u.shares -= e.shares;
        u.wd += e.assets;
      }
      users.set(e.user, u);
    }
    const active = [...users.entries()]
      .filter(([, u]) => u.shares > 0n)
      .sort((a, b) => (a[1].first || 0) - (b[1].first || 0));
    return { users, total: users.size, active, deposited, harvests };
  }, [events]);

  const totalA = typeof tvl === "bigint" ? tvl : undefined;

  const stat = (label: string, value: string, sub: string) => (
    <div className={`rounded-xl border p-5 ${c.card}`}>
      <p className={`text-[11px] uppercase tracking-wider ${c.subtle}`}>{label}</p>
      <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
      <p className={`text-xs mt-1 ${c.subtle}`}>{sub}</p>
    </div>
  );

  return (
    <section id="live" className="max-w-[1400px] mx-auto scroll-mt-28">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className={`${c.accent} text-xs font-bold tracking-widest mb-2 uppercase`}>Live on-chain</p>
          <h2 className="text-2xl md:text-3xl font-bold">Verifiable by anyone, in real time.</h2>
          <p className={`mt-3 text-sm max-w-2xl ${c.muted}`}>
            Every figure below is read directly from the vault contract on Base Sepolia. Nothing is typed in by hand.
          </p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full ${c.warnChip}`}>Testnet · yield simulated</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {stat("Vault TVL", totalA !== undefined ? `${usd(totalA)} USDC` : "…", "Read from totalAssets()")}
        {stat("Treasuries active", loaded ? String(view.active.length) : "…", loaded ? `${view.total} have ever deposited` : "Reading chain")}
        {stat("Total deposited", loaded ? `${usd(view.deposited)} USDC` : "…", "Cumulative, all treasuries")}
        {stat("Harvests", loaded ? String(view.harvests) : "…", "Routing transactions")}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* active treasuries: different when connected vs not */}
        <div className={`lg:col-span-5 rounded-xl border p-6 ${c.card}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Active treasuries</h3>
            <span className={`text-xs ${c.subtle}`}>{loaded ? `${view.active.length} active` : "…"}</span>
          </div>

          {!isConnected ? (
            <div className={`rounded-lg p-5 text-sm ${c.inner} ${c.subtle}`}>
              {view.active.length > 0 && (
                <div className="yk-avatars mb-4">
                  {view.active.slice(0, 6).map(([a]) => (
                    <AddressAvatar key={a} address={a} size={34} logo={LISTED[a]?.logo} />
                  ))}
                </div>
              )}
              <p className="font-semibold">
                {loaded ? `${view.active.length} active treasur${view.active.length === 1 ? "y" : "ies"} on the vault.` : "Reading the chain…"}
              </p>
              <p className="mt-2">Connect a wallet to see the active treasury list. Your own position and PnL are on the dashboard.</p>
              {onConnect && (
                <button onClick={onConnect} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                  Connect wallet →
                </button>
              )}
            </div>
          ) : view.active.length === 0 ? (
            <div className={`rounded-lg p-5 text-sm ${c.inner} ${c.subtle}`}>
              <p>{loaded ? "No treasury is active yet." : "Reading deposits from the chain…"}</p>
              {loaded && <p className="mt-2">The first treasury to deposit will be listed here by address. Names and logos only with written permission.</p>}
            </div>
          ) : (
            <ul className="grid md:grid-cols-2 gap-2 max-h-72 overflow-auto pr-1">
              {view.active.map(([addr, u]) => {
                const l = LISTED[addr];
                const isMe = addr === me;
                return (
                  <li key={addr} className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${c.row}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <AddressAvatar address={addr} size={36} logo={l?.logo} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {l?.name ?? `Treasury ${short(addr)}`}
                          {isMe && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${c.chip}`}>You</span>}
                        </p>
                        <a href={BASESCAN.address(addr)} target="_blank" rel="noreferrer" className={`text-xs ${c.subtle} ${c.link}`}>
                          {l ? `${short(addr)} ↗` : "View on BaseScan ↗"}
                        </a>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-semibold ${c.green}`}>● Active</span>
                      {u.first > 0 && <p className={`text-[11px] ${c.subtle}`}>since {day(u.first)}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={`text-xs mt-3 ${c.subtle}`}>Addresses are public on-chain. Amounts and PnL are never shown here.</p>
        </div>
      </div>

      {/* built on */}
      <div className={`mt-10 border-y py-8 ${c.divider}`}>
        <p className={`text-[11px] uppercase tracking-widest text-center mb-6 ${c.subtle}`}>Built on</p>
        <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9">{aaveIcon}</div>
            <span className="text-lg font-bold tracking-tight">Aave</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#0052FF] flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 1280 1280" fill="none">
                <path d="M640 240c-220.914 0-400 179.086-400 400s179.086 400 400 400 400-179.086 400-400-179.086-400-400-400zm0 640c-132.548 0-240-107.452-240-240s107.452-240 240-240 240 107.452 240 240-107.452 240-240 240z" fill="#fff" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">Base</span>
          </div>
          <div className="flex items-center gap-3">
            <svg className="w-9 h-9" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="#2775CA" />
              <path d="M20.5 19.5C20.5 17.5 19.5 16.5 16.5 16C14.5 15.5 13.5 15 13.5 14C13.5 13 14 12.5 15 12.5C16.5 12.5 17 13 17 14H19C19 12 17.5 11 15.5 11V9H14.5V11C12.5 11 11 12 11 14C11 16 12 17 15 17.5C17 18 18 18.5 18 19.5C18 20.5 17.5 21.5 16 21.5C14 21.5 13.5 20.5 13.5 19.5H11.5C11.5 21.5 12.5 23 14.5 23V25H15.5V23C17.5 23 20.5 22 20.5 19.5Z" fill="white" />
            </svg>
            <span className="text-lg font-bold tracking-tight">USDC</span>
          </div>
        </div>
        <p className={`text-[11px] text-center mt-6 ${c.subtle}`}>
          Technologies the vault uses. Names and marks belong to their owners; their use here does not imply partnership
          or endorsement.
        </p>
      </div>
    </section>
  );
}