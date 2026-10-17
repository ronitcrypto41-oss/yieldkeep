"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ADDRESSES,
  BASESCAN,
} from "@/lib/contracts";
import { shortAddress } from "@/lib/format";

const FAQS: [string, string][] = [
  ["Is YieldKeep custodial?", "No. Non-custodial smart contracts. You always control your own funds."],
  ["Where does the yield come from?", "USDC supplied to Aave V3 lending on Base Sepolia. Actual yield varies by market conditions."],
  ["Can I withdraw anytime?", "Yes, subject to available liquidity in the underlying Aave V3 market."],
  ["What is the fee?", "10% of realized yield. No management fee. You only pay when you earn."],
  ["What assets are supported?", "USDC now. ETH and WBTC planned for future strategy support."],
  ["Who built YieldKeep?", "A Solidity engineer focused on DeFi security and treasury infrastructure."],
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Help</h1>
          <p className="dash-sub">Everything you need to know about the vault.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Frequently asked questions</h2>
        {FAQS.map(([q, a], i) => (
          <button
            key={q}
            onClick={() => setOpen(open === i ? null : i)}
            className="faq-row"
            type="button"
          >
            <div className="faq-row-head">
              <span className="faq-q">{q}</span>
              <span className="faq-toggle">{open === i ? "−" : "+"}</span>
            </div>
            {open === i && <p className="faq-a">{a}</p>}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Contract addresses</h2>
        <div className="row">
          <span>Vault (Treasury)</span>
          <a
            href={BASESCAN.address(ADDRESSES.treasury)}
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            {shortAddress(ADDRESSES.treasury)} ↗
          </a>
        </div>
        <div className="row">
          <span>Adapter</span>
          <a
            href={BASESCAN.address(ADDRESSES.adapter)}
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            {shortAddress(ADDRESSES.adapter)} ↗
          </a>
        </div>
        <div className="row">
          <span>USDC</span>
          <a
            href={BASESCAN.address(ADDRESSES.usdc)}
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            {shortAddress(ADDRESSES.usdc)} ↗
          </a>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Risk disclosure</h2>
        <p className="fee-note" style={{ fontSize: 13, lineHeight: 1.7 }}>
          YieldKeep is non-custodial software. You interact directly with
          on-chain smart contracts. There is no insurance, no recovery, and no
          custodian. Risks include smart-contract bugs, Aave V3 protocol risk,
          USDC depeg risk, and liquidity risk. Never deposit more than you can
          afford to lose. This is experimental software running on Base
          Sepolia testnet.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Contact</h2>
        <div className="row">
          <span>GitHub</span>
          <a
            href="https://github.com/ronitcrypto41-oss"
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            ronitcrypto41-oss ↗
          </a>
        </div>
        <div className="row">
          <span>X (Twitter)</span>
          <a
            href="https://x.com/Web3Ronit"
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            @Web3Ronit ↗
          </a>
        </div>
        <div className="row">
          <span>LinkedIn</span>
          <a
            href="https://www.linkedin.com/in/ronit-mishra-464837354/"
            target="_blank"
            rel="noreferrer"
            className="contract-link"
          >
            Ronit Mishra ↗
          </a>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard" className="btn-ghost">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}