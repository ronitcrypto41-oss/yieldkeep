"use client";

import { useState } from "react";
import Link from "next/link";
import { ADDRESSES, BASESCAN } from "@/lib/contracts";
import { shortAddress } from "@/lib/format";

const FAQS: [string, string][] = [
  ["Is YieldKeep custodial?", "No. The vault is a set of smart contracts. YieldKeep has no ability to move your funds to another address; you deposit and withdraw directly from your own wallet."],
  ["Can a multisig (Safe) use it?", "Yes. Deposits and withdrawals are ordinary contract calls, so a Safe or other multisig can execute them. Approve USDC, then deposit, as separate signed transactions."],
  ["Where does the yield come from?", "From supplying USDC to Aave V3. On this testnet the adapter is a mock, so yield is simulated and not real income."],
  ["How do I report PnL for accounting?", "The Overview page shows deposited, withdrawn, current value and net PnL for your wallet. The Activity page lists every transaction with date and hash and exports to CSV, so each line can be matched to BaseScan."],
  ["Can we withdraw part of the position?", "No. This version redeems the full position in one transaction, subject to available Aave liquidity."],
  ["What is the fee?", "0% management fee and 10% of recorded yield as a performance fee. No deposit or withdrawal fee."],
  ["Why does my treasury address appear in the Treasuries list?", "That list is read from on-chain Deposit events. Any address that deposits is visible, because blockchains are public. Names or logos are only shown if a treasury asks to be listed."],
  ["Is it audited?", "No. This is an unaudited testnet demo with no real funds. An independent audit is a prerequisite for any mainnet release."],
  ["Which assets are supported?", "USDC only."],
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="dashboard">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Help</h1>
          <p className="dash-sub">Answers for treasury managers, signers and finance teams.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Frequently asked questions</h2>
        {FAQS.map(([q, a], i) => (
          <button key={q} onClick={() => setOpen(open === i ? null : i)} className="faq-row" type="button">
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
        {(
          [
            ["Vault", ADDRESSES.treasury],
            ["Adapter", ADDRESSES.adapter],
            ["USDC", ADDRESSES.usdc],
          ] as const
        ).map(([label, addr]) => (
          <div className="row" key={label}>
            <span>{label}</span>
            <a href={BASESCAN.address(addr)} target="_blank" rel="noreferrer" className="contract-link">
              {shortAddress(addr)} ↗
            </a>
          </div>
        ))}
        <p className="fee-note">Always verify addresses on BaseScan before signing.</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Risk disclosure</h2>
        <p className="fee-note" style={{ fontSize: 13, lineHeight: 1.7 }}>
          YieldKeep is non-custodial software. You interact directly with on-chain smart contracts. There is no
          insurance, no recovery and no custodian. Risks include smart-contract bugs, Aave V3 protocol risk, USDC depeg
          risk and liquidity risk. This is unaudited, experimental software running on the Base Sepolia testnet with no
          real funds. Nothing here is financial, legal or tax advice, and YieldKeep is not offered to persons in
          jurisdictions where it would be restricted, including US persons.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Contact the builder</h2>
        <div className="row">
          <span>GitHub</span>
          <a href="https://github.com/ronitcrypto41-oss" target="_blank" rel="noreferrer" className="contract-link">
            ronitcrypto41-oss ↗
          </a>
        </div>
        <div className="row">
          <span>X (Twitter)</span>
          <a href="https://x.com/Web3Ronit" target="_blank" rel="noreferrer" className="contract-link">
            @Web3Ronit ↗
          </a>
        </div>
        <div className="row">
          <span>LinkedIn</span>
          <a href="https://www.linkedin.com/in/ronit-mishra-464837354/" target="_blank" rel="noreferrer" className="contract-link">
            Ronit Mishra ↗
          </a>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard" prefetch className="btn-ghost">
          ← Back to overview
        </Link>
      </div>
    </div>
  );
}