"use client";

import "./landing.css";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// ─── Social icons ──────────────────────────────────────────────
const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.39-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.452 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.356V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

// ─── Real asset logos ──────────────────────────────────────────
const USDCLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
    <circle cx="16" cy="16" r="16" fill="#2775CA" />
    <path d="M20.5 13.5c0-2-1.2-2.7-3.6-3-1.8-.2-2.1-.7-2.1-1.5s.6-1.4 1.8-1.4c1.1 0 1.7.4 2 1.3l.1.4h2.6c0-.3-.1-.6-.1-.8-.3-1.6-1.6-2.7-3.5-3V3h-1.7v2.5c-2.7.3-4.4 1.6-4.4 3.9 0 2.3 1.3 3 3.8 3.3 1.8.3 2.3.6 2.3 1.6 0 .9-.8 1.6-1.9 1.6-1.4 0-2-.6-2.3-1.6l-.1-.4h-2.6v.5c.3 1.9 1.6 3 3.7 3.3V21h1.7v-2.5c2.8-.3 4.5-1.7 4.5-4z" fill="#fff" />
  </svg>
);

const ETHLogo = () => (
  <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
    <circle cx="16" cy="16" r="16" fill="#627EEA" />
    <g fill="#fff">
      <path d="M16.498 4v8.87l7.497 3.35z" fillOpacity="0.6" />
      <path d="M16.498 4L9 16.22l7.498-3.35z" />
      <path d="M16.498 21.968v6.027L24 17.616z" fillOpacity="0.6" />
      <path d="M16.498 27.995v-6.028L9 17.616z" />
      <path d="M16.498 20.573l7.497-4.353-7.497-3.348z" fillOpacity="0.2" />
      <path d="M9 16.22l7.498 4.353v-7.701z" fillOpacity="0.6" />
    </g>
  </svg>
);

const WBTCLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
    <circle cx="16" cy="16" r="16" fill="#F7931A" />
    <path d="M22.5 14.1c.3-2.1-1.3-3.2-3.4-3.9l.7-2.8-1.7-.4-.7 2.7c-.4-.1-.9-.2-1.4-.3l.7-2.7-1.7-.4-.7 2.8c-.4-.1-.8-.2-1.1-.3l-2.3-.6-.5 1.8s1.3.3 1.2.3c.7.2.8.6.8 1l-.8 3.3c.1 0 .1 0 .2.1l-.2-.1-1.2 4.7c-.1.2-.3.6-.9.4.1 0-1.2-.3-1.2-.3l-.9 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.7.4.7-2.8c.5.1.9.2 1.4.3l-.7 2.8 1.7.4.7-2.8c2.9.5 5.1.3 6-2.3.7-2.1 0-3.3-1.5-4.1 1.1-.3 2-1 2.2-2.5zm-3.8 5.5c-.5 2.1-4.1 1-5.3.7l.9-3.7c1.2.3 5 1 4.4 3zm.5-5.5c-.5 1.9-3.4.9-4.4.7l.8-3.4c1 .2 4 .8 3.6 2.7z" fill="#fff" />
  </svg>
);

export default function LandingPage() {
  const [theme, setTheme] = useState<"black" | "white">("black");
  const [faq, setFaq] = useState<number | null>(null);
  const [showNavPrompt, setShowNavPrompt] = useState(false);
  const { isConnected } = useAccount();
  const router = useRouter();

  const dismissedRef = useRef(false);

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("yk-theme") : null;
    if (saved === "white" || saved === "black") setTheme(saved);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-black", "theme-gray", "theme-white");
    root.classList.add(`theme-${theme}`);
    root.style.colorScheme = theme === "white" ? "light" : "dark";
    localStorage.setItem("yk-theme", theme);
  }, [theme]);

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));

    const check = () => {
      const vh = window.innerHeight;
      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const inView = rect.top < vh * 0.9 && rect.bottom > vh * 0.1;
        if (inView) el.classList.add("visible");
        else el.classList.remove("visible");
      });
    };

    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  // Wallet connect → show prompt once per session. No auto-redirect.
  useEffect(() => {
    if (!isConnected) return;
    if (dismissedRef.current) return;
    setShowNavPrompt(true);
  }, [isConnected]);

  const handleStayHere = () => {
    dismissedRef.current = true;
    setShowNavPrompt(false);
  };

  const handleGoNow = () => {
    dismissedRef.current = true;
    router.push("/dashboard");
  };

  const faqs = [
    ["Is YieldKeep custodial?", "No. Non-custodial smart contracts. You always control your own funds."],
    ["Where does the yield come from?", "USDC supplied to a lending strategy. Actual yield varies by market conditions."],
    ["Can I withdraw anytime?", "Yes, subject to available liquidity in the underlying protocol."],
    ["What is the fee?", "10% of realized yield. No management fee. You only pay when you earn."],
    ["What assets are supported?", "USDC now. ETH and WBTC planned for future strategy support."],
    ["Who built YieldKeep?", "A Solidity engineer focused on DeFi security and treasury infrastructure."],
  ];

  const steps = [
    ["01", "Connect Your Wallet", "Connect the wallet you want to use as your treasury."],
    ["02", "Deposit USDC", "Deposit USDC into the YieldKeep vault."],
    ["03", "Earn Yield", "Your USDC is routed to a battle-tested yield strategy."],
    ["04", "Withdraw Anytime", "Withdraw your position whenever you need it."],
  ];

  const security = [
    ["256 fuzz & invariant runs", "Comprehensive contract testing"],
    ["128,000+ randomized calls", "Multi-actor testing"],
    ["Integration testing", "Real protocol integration"],
    ["Attack simulation", "Donation & inflation tests"],
    ["Withdrawal testing", "Edge case analysis"],
  ];

  const why = [
    ["01", "Proven Security", "Battle-tested with billions in TVL and multiple audits."],
    ["02", "Deep Liquidity", "Access to deep, efficient and liquid markets."],
    ["03", "Capital Efficiency", "Optimized risk-adjusted yields for treasuries."],
    ["04", "Institutional Grade", "Trusted by DAOs and institutions worldwide."],
  ];

  const risks = [
    ["#22c55e", "Smart Contract Risk", "Mitigated through audits, testing, and proven protocols."],
    ["#3b82f6", "Protocol Risk", "Battle-tested infrastructure with a strong track record."],
    ["#f59e0b", "Market Risk", "Managed through diversified assets and conservative LTVs."],
    ["#ef4444", "Liquidity Risk", "Monitored through real-time on-chain metrics."],
  ];

  return (
    <main className="site">
      {/* NAV */}
      <header className="nav reveal">
        <Link href="/" className="brand">
          <img src="/logo-dark.png" alt="YieldKeep" className="logo-img logo-dark" />
          <img src="/logo-light.png" alt="YieldKeep" className="logo-img logo-light" />
        </Link>
        <nav className="nav-links">
          <a href="#how">How It Works</a>
          <a href="#security">Security</a>
          <a href="#assets">Assets</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav-right">
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              if (!mounted) return <span className="wallet-slot" aria-hidden />;
              const connected = account && chain;
              if (!connected) {
                return (
                  <button onClick={openConnectModal} className="wallet-btn">
                    Connect Wallet
                  </button>
                );
              }
              if (chain.unsupported) {
                return (
                  <button onClick={openChainModal} className="wallet-btn">
                    Wrong Network
                  </button>
                );
              }
              return (
                <button onClick={openAccountModal} className="wallet-btn wallet-btn-connected">
                  {account.displayName}
                </button>
              );
            }}
          </ConnectButton.Custom>
          <Link href="/dashboard" className="nav-launch">Dashboard →</Link>
        </div>
      </header>

      {/* HERO */}
      <section className="hero section reveal">
        <div className="hero-copy">
          <div className="eyebrow">DAO TREASURY INFRASTRUCTURE</div>
          <h1>Your treasury<br />shouldn&apos;t sit<br />idle.</h1>
          <p>
            YieldKeep puts your DAO&apos;s stablecoins to work through
            battle-tested yield strategy integration. No active management
            required. Earn institutional-grade yield while maintaining full
            non-custodial control.
          </p>
          <div className="hero-actions">
            <Link href="/dashboard" className="primary">Open Dashboard →</Link>
            <a className="secondary" href="#security">View Security Report →</a>
          </div>
        </div>

        <div className="hero-panel reveal reveal-delay-1">
          <div className="hero-panel-eyebrow">BUILT ON AAVE V3</div>
          <div className="hero-panel-stats">
            <div className="hp-stat">
              <div className="hp-label">TOTAL VALUE LOCKED</div>
              <div className="hp-value">$0.00</div>
            </div>
            <div className="hp-stat">
              <div className="hp-label">CURRENT APY</div>
              <div className="hp-value">—</div>
            </div>
            <div className="hp-stat">
              <div className="hp-label">ACTIVE TREASURIES</div>
              <div className="hp-value">0</div>
            </div>
          </div>
          <div className="hero-panel-list">
            <div className="hp-item"><span className="hp-dot" style={{ background: "#22c55e" }} /><span>Non-custodial vault architecture</span></div>
            <div className="hp-item"><span className="hp-dot" style={{ background: "#3b82f6" }} /><span>Battle-tested yield integration</span></div>
            <div className="hp-item"><span className="hp-dot" style={{ background: "#998eff" }} /><span>10% performance fee · 0% management fee</span></div>
            <div className="hp-item"><span className="hp-dot" style={{ background: "#f59e0b" }} /><span>Real-time on-chain accounting</span></div>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="stats-wrap reveal">
        <div className="stats">
          <div><span className="stat-icon">$</span><div><small>SUPPORTED ASSET</small><strong>USDC</strong></div></div>
          <div><span className="stat-icon">%</span><div><small>MANAGEMENT FEE</small><strong>0%</strong></div></div>
          <div><span className="stat-icon">A</span><div><small>PERFORMANCE FEE</small><strong>10%</strong></div></div>
          <div><span className="stat-icon">▲</span><div><small>INITIAL STRATEGY</small><strong>Aave V3</strong></div></div>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="section reveal">
        <div className="section-head">
          <div>
            <div className="eyebrow">HOW YIELDKEEP WORKS</div>
            <h2>Start earning in 4 simple steps.</h2>
          </div>
          <p>A simple interface for treasury teams. Connect the wallet, select the strategy, deposit assets and monitor the position.</p>
        </div>
        <div className="steps">
          {steps.map(([num, title, text], i) => (
            <article className={`step reveal reveal-delay-${i + 1}`} key={num}>
              <div className="step-top"><span>{num}</span></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* SECURITY */}
      <section id="security" className="security section reveal">
        <div className="security-copy">
          <div className="eyebrow">SECURITY FIRST</div>
          <h2>Built for capital.<br />Tested for failure.</h2>
          <p>YieldKeep is engineered around security-focused development, rigorous testing, and real-protocol integration.</p>
        </div>
        <div className="security-list">
          {security.map(([a, b], i) => (
            <div className={`security-item reveal reveal-delay-${i + 1}`} key={a}>
              <div><b>{a}</b><small>{b}</small></div>
            </div>
          ))}
        </div>
      </section>

      {/* ASSETS */}
      <section id="assets" className="section reveal">
        <div className="section-head">
          <div>
            <div className="eyebrow">SUPPORTED ASSETS</div>
            <h2>Compatible assets.</h2>
          </div>
          <p>YieldKeep starts narrow and expands only as strategies and integrations are tested.</p>
        </div>
        <div className="asset-grid">
          <article className="asset-card reveal reveal-delay-1">
            <div className="token"><USDCLogo /></div>
            <div>
              <b>USDC</b>
              <small>Circle&apos;s USDC. Primary asset for treasury yield.</small>
            </div>
            <em className="available">Available</em>
          </article>
          <article className="asset-card reveal reveal-delay-2">
            <div className="token"><ETHLogo /></div>
            <div>
              <b>ETH</b>
              <small>Ethereum. Strategy support coming soon.</small>
            </div>
            <em>Coming Soon</em>
          </article>
          <article className="asset-card reveal reveal-delay-3">
            <div className="token"><WBTCLogo /></div>
            <div>
              <b>WBTC</b>
              <small>Wrapped Bitcoin. Strategy support coming soon.</small>
            </div>
            <em>Coming Soon</em>
          </article>
        </div>
      </section>

      {/* WHY AAVE V3 */}
      <section id="why" className="section reveal">
        <div className="section-head">
          <div>
            <div className="eyebrow">WHY AAVE V3</div>
            <h2>The most battle-tested liquidity protocol in DeFi.</h2>
          </div>
          <p>Aave V3 is the leading liquidity protocol with deep liquidity, rigorous security, and institutional adoption.</p>
        </div>
        <div className="why-grid">
          {why.map(([num, title, text], i) => (
            <article className={`why-card reveal reveal-delay-${i + 1}`} key={num}>
              <div className="why-num">{num}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* RISK FRAMEWORK */}
      <section id="risk" className="section reveal">
        <div className="section-head">
          <div>
            <div className="eyebrow">RISK FRAMEWORK</div>
            <h2>A balanced approach to risk.</h2>
          </div>
          <p>We take a conservative approach to risk management, prioritizing capital preservation while generating sustainable yield.</p>
        </div>
        <div className="risk-grid">
          {risks.map(([color, title, text], i) => (
            <div className={`risk-item reveal reveal-delay-${i + 1}`} key={title}>
              <span className="risk-dot" style={{ background: color }} />
              <div><b>{title}</b><small>{text}</small></div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section faq reveal">
        <div>
          <div className="eyebrow">FAQ</div>
          <h2>Everything you need to know.</h2>
        </div>
        <div className="faq-grid">
          {faqs.map(([q, a], i) => (
            <button
              className={`faq-item reveal reveal-delay-${(i % 4) + 1} ${faq === i ? "open" : ""}`}
              onClick={() => setFaq(faq === i ? null : i)}
              key={q}
            >
              <span>{q}</span>
              <b>{faq === i ? "−" : "+"}</b>
              {faq === i && <p>{a}</p>}
            </button>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="reveal">
        <div className="footer-brand">
          <img src="/logo-dark.png" alt="YieldKeep" className="logo-img logo-dark" />
          <img src="/logo-light.png" alt="YieldKeep" className="logo-img logo-light" />
          <small>© 2026 YieldKeep. All rights reserved.</small>
        </div>
        <div className="footer-links">
          <a href="#how">How It Works</a>
          <a href="#security">Security</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="footer-socials">
          <a href="https://github.com/ronitcrypto41-oss" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub"><GitHubIcon /></a>
          <a href="https://x.com/Web3Ronit" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" title="X"><XIcon /></a>
          <a href="https://www.linkedin.com/in/ronit-mishra-464837354/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn"><LinkedInIcon /></a>
        </div>
      </footer>

      {/* THEME SWITCHER */}
      <div className="theme-switcher" role="group" aria-label="Theme">
        <button
          className={theme === "black" ? "active" : ""}
          onClick={() => setTheme("black")}
          aria-label="Dark theme"
          title="Dark"
        >
          <MoonIcon />
        </button>
        <button
          className={theme === "white" ? "active" : ""}
          onClick={() => setTheme("white")}
          aria-label="Light theme"
          title="Light"
        >
          <SunIcon />
        </button>
      </div>

      {/* WALLET-CONNECTED PROMPT */}
      {showNavPrompt && (
        <div className="nav-prompt-backdrop">
          <div className="nav-prompt">
            <div className="nav-prompt-title">Wallet connected</div>
            <div className="nav-prompt-sub">
              Head to the dashboard to deposit and manage your position.
            </div>
            <div className="nav-prompt-actions">
              <button
                className="nav-prompt-stay"
                onClick={handleStayHere}
              >
                Stay on this page
              </button>
              <button
                className="nav-prompt-go"
                onClick={handleGoNow}
              >
                Go to Dashboard →
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}