"use client";

import { useEffect, useState } from "react";
import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";

// ---------------------------------------------------------------------------
// Idle Funds Report
// A free, read-only page: paste any public address, see how much USDC is
// sitting idle, and what it could earn per year at Aave V3's current supply
// rate. No wallet connection. No transactions. Public data only.
// ---------------------------------------------------------------------------

const FEE_PERCENT = 10; // YieldKeep fee: 10% of profit only
const SECONDS_PER_YEAR = 31_536_000;

// Addresses from the official Aave address book (@bgd-labs/aave-address-book).
const CHAINS = {
  base: {
    label: "Base",
    rpcs: [
      "https://base-rpc.publicnode.com",
      "https://mainnet.base.org",
    ],
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    aUsdc: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB" as Address,
    explorer: "https://basescan.org/address/",
  },
  ethereum: {
    label: "Ethereum",
    rpcs: [
      "https://ethereum-rpc.publicnode.com",
      "https://eth.llamarpc.com",
    ],
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" as Address,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    aUsdc: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c" as Address,
    explorer: "https://etherscan.io/address/",
  },
} as const;

type ChainKey = keyof typeof CHAINS;

// Only the part of Aave's getReserveData that we need (same layout as Aave V3).
const poolAbi = [
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          {
            name: "configuration",
            type: "tuple",
            components: [{ name: "data", type: "uint256" }],
          },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
      },
    ],
  },
] as const;

type Report = {
  chainKey: ChainKey;
  address: Address;
  idleUsdc: number;
  earningUsdc: number;
  apr: number; // e.g. 0.042 = 4.2%
  apy: number;
  yearlyGross: number;
  yearlyFee: number;
  yearlyNet: number;
  readAt: Date;
};

// Pure math, kept separate so it is easy to check.
function computeYield(idleUsdc: number, liquidityRateRay: bigint) {
  const apr = Number(liquidityRateRay) / 1e27;
  const apy = Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1;
  const yearlyGross = idleUsdc * apy;
  const yearlyFee = (yearlyGross * FEE_PERCENT) / 100;
  const yearlyNet = yearlyGross - yearlyFee;
  return { apr, apy, yearlyGross, yearlyFee, yearlyNet };
}

// A plain read-only call (eth_call) to a public server. It tries each server in
// the list until one answers.
async function ethCall(urls: readonly string[], to: Address, data: Hex): Promise<Hex> {
  let lastError: unknown = new Error("No server answered");
  for (const url of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to, data }, "latest"],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { result?: string; error?: { message?: string } };
      if (typeof json.result !== "string") {
        throw new Error(json.error?.message ?? "Bad response");
      }
      return json.result as Hex;
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function usdcBalance(urls: readonly string[], token: Address, owner: Address): Promise<bigint> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  const ret = await ethCall(urls, token, data);
  return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: ret });
}

async function buildReport(chainKey: ChainKey, address: Address): Promise<Report> {
  const cfg = CHAINS[chainKey];

  const [idleRaw, earningRaw, reserveRet] = await Promise.all([
    usdcBalance(cfg.rpcs, cfg.usdc, address),
    usdcBalance(cfg.rpcs, cfg.aUsdc, address),
    ethCall(
      cfg.rpcs,
      cfg.pool,
      encodeFunctionData({ abi: poolAbi, functionName: "getReserveData", args: [cfg.usdc] }),
    ),
  ]);
  const reserve = decodeFunctionResult({
    abi: poolAbi,
    functionName: "getReserveData",
    data: reserveRet,
  });

  const idleUsdc = Number(formatUnits(idleRaw, 6));
  const earningUsdc = Number(formatUnits(earningRaw, 6));
  const math = computeYield(idleUsdc, reserve.currentLiquidityRate);

  return {
    chainKey,
    address,
    idleUsdc,
    earningUsdc,
    ...math,
    readAt: new Date(),
  };
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

function shareText(r: Report) {
  const chain = CHAINS[r.chainKey].label;
  return (
    `${short(r.address)} holds about ${usd.format(r.idleUsdc)} of idle USDC on ${chain}. ` +
    `At Aave V3's current supply rate (about ${pct(r.apy)} a year, variable) that could earn ` +
    `roughly ${usd.format(r.yearlyGross)} a year. This is an estimate from public data, not advice.`
  );
}

const css = `
.ifr{--bg:#fafafa;--card:#fff;--ink:#14181f;--mute:#5b6570;--line:#dde2e8;--accent:#1d4ed8;--warn:#92400e;--warnbg:#fef3c7;
  background:var(--bg);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:32px 16px 64px}
@media (prefers-color-scheme:dark){.ifr{--bg:#0b0e13;--card:#12161d;--ink:#e8ecf2;--mute:#9aa4b2;--line:#252c37;--accent:#6ea0ff;--warn:#fcd9a0;--warnbg:#2a2113}}
.ifr *{box-sizing:border-box}
.ifr-wrap{max-width:720px;margin:0 auto}
.ifr h1{font-size:28px;line-height:1.2;margin:0 0 8px}
.ifr-sub{color:var(--mute);margin:0 0 24px;line-height:1.5}
.ifr-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
.ifr-tabs{display:flex;gap:8px;margin-bottom:12px}
.ifr-tab{border:1px solid var(--line);background:transparent;color:var(--ink);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:14px}
.ifr-tab[aria-pressed=true]{border-color:var(--accent);color:var(--accent);font-weight:600}
.ifr-row{display:flex;gap:8px;flex-wrap:wrap}
.ifr-in{flex:1;min-width:220px;padding:12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.ifr-btn{padding:12px 18px;border-radius:8px;border:0;background:var(--accent);color:#fff;font-weight:600;cursor:pointer;font-size:14px}
.ifr-btn[disabled]{opacity:.6;cursor:default}
.ifr-btn2{padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;font-size:13px}
.ifr-err{color:#b91c1c;margin-top:12px;font-size:14px}
.ifr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:12px 0}
.ifr-stat{border:1px solid var(--line);border-radius:10px;padding:14px}
.ifr-stat b{display:block;font-size:22px;margin-top:4px}
.ifr-lab{color:var(--mute);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.ifr-note{color:var(--mute);font-size:13px;line-height:1.5;margin:8px 0 0}
.ifr-warn{background:var(--warnbg);color:var(--warn);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.5;margin-top:12px}
.ifr-share{font-size:14px;line-height:1.5;border:1px dashed var(--line);border-radius:8px;padding:12px;margin:8px 0}
.ifr a{color:var(--accent)}
`;

export default function IdleFundsReportPage() {
  const [chainKey, setChainKey] = useState<ChainKey>("base");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(ck: ChainKey, raw: string) {
    setError("");
    setReport(null);
    setCopied(false);
    const text = raw.trim();
    if (!isAddress(text, { strict: false })) {
      setError("That is not a valid address. It should start with 0x and have 42 characters.");
      return;
    }
    const address = getAddress(text.toLowerCase());
    setLoading(true);
    try {
      const r = await buildReport(ck, address);
      setReport(r);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("chain", ck);
        url.searchParams.set("address", address);
        window.history.replaceState(null, "", url.toString());
      } catch {
        /* ignore */
      }
    } catch {
      setError("Could not read the chain right now. Please try again in a minute.");
    } finally {
      setLoading(false);
    }
  }

  // Open a shared link like /report?chain=base&address=0x...
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const c = p.get("chain");
      const a = p.get("address");
      const ck: ChainKey = c === "ethereum" ? "ethereum" : "base";
      setChainKey(ck);
      if (a) {
        setInput(a);
        void run(ck, a);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(shareText(report));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="ifr">
      <style>{css}</style>
      <div className="ifr-wrap">
        <h1>Idle Funds Report</h1>
        <p className="ifr-sub">
          Paste any public wallet or Safe address. See how much USDC sits idle and what it could earn
          per year at Aave V3&apos;s current supply rate. Free, read-only, no wallet connection.
        </p>

        <div className="ifr-card">
          <div className="ifr-tabs">
            {(Object.keys(CHAINS) as ChainKey[]).map((k) => (
              <button
                key={k}
                type="button"
                className="ifr-tab"
                aria-pressed={chainKey === k}
                onClick={() => setChainKey(k)}
              >
                {CHAINS[k].label}
              </button>
            ))}
          </div>
          <form
            className="ifr-row"
            onSubmit={(e) => {
              e.preventDefault();
              void run(chainKey, input);
            }}
          >
            <input
              className="ifr-in"
              placeholder="0x... address"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button className="ifr-btn" type="submit" disabled={loading}>
              {loading ? "Reading..." : "Check"}
            </button>
          </form>
          {error ? <div className="ifr-err">{error}</div> : null}
        </div>

        {report ? (
          <div className="ifr-card">
            <div className="ifr-lab">
              {CHAINS[report.chainKey].label} ·{" "}
              <a
                href={CHAINS[report.chainKey].explorer + report.address}
                target="_blank"
                rel="noreferrer"
                style={{ textTransform: "none" }}
              >
                {short(report.address)}
              </a>
            </div>

            {report.idleUsdc <= 0 ? (
              <p className="ifr-note">
                This address holds no idle USDC on {CHAINS[report.chainKey].label}.
                {report.earningUsdc > 0
                  ? ` It already has ${usd.format(report.earningUsdc)} earning in Aave (aUSDC).`
                  : " Try the other network, because the same address can hold funds on both."}
              </p>
            ) : (
              <>
                <div className="ifr-grid">
                  <div className="ifr-stat">
                    <span className="ifr-lab">Idle USDC</span>
                    <b>{usd.format(report.idleUsdc)}</b>
                  </div>
                  <div className="ifr-stat">
                    <span className="ifr-lab">Aave V3 supply rate (APY)</span>
                    <b>{pct(report.apy)}</b>
                  </div>
                  <div className="ifr-stat">
                    <span className="ifr-lab">Could earn per year</span>
                    <b>{usd.format(report.yearlyGross)}</b>
                  </div>
                </div>
                <p className="ifr-note">
                  With a {FEE_PERCENT}% fee on profit only (the YieldKeep model), the estimate is{" "}
                  <b>{usd.format(report.yearlyNet)}</b> for the owner and {usd.format(report.yearlyFee)} for the
                  fee. The deposit itself is never charged.
                </p>
                {report.earningUsdc > 0 ? (
                  <p className="ifr-note">
                    Already earning in Aave (aUSDC): {usd.format(report.earningUsdc)}.
                  </p>
                ) : null}

                <div className="ifr-lab" style={{ marginTop: 16 }}>Text you can share</div>
                <div className="ifr-share">{shareText(report)}</div>
                <button type="button" className="ifr-btn2" onClick={copy}>
                  {copied ? "Copied" : "Copy text"}
                </button>
              </>
            )}

            <div className="ifr-warn">
              Estimate only. The Aave rate changes all the time, and the yearly number assumes today&apos;s rate
              stays the same. Funds counted here are only USDC held directly by this address on{" "}
              {CHAINS[report.chainKey].label}; other tokens and other networks are not included. Read{" "}
              {report.readAt.toLocaleString()}. This is not financial advice.
            </div>
          </div>
        ) : null}

        <div className="ifr-card">
          <b>About YieldKeep</b>
          <p className="ifr-note">
            YieldKeep is a non-custodial USDC treasury vault for DAOs on Base. It is a testnet demo and it is
            unaudited, so do not use real funds. This report only reads public blockchain data.{" "}
            <a href="https://github.com/ronitcrypto41-oss/yieldkeep" target="_blank" rel="noreferrer">
              See the code
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}