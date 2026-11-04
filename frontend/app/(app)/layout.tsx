"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { useTheme } from "@/app/providers/ThemeProvider";
import TestnetBanner from "@/app/components/TestnetBanner";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/deposit", label: "Deposit", icon: "↧" },
  { href: "/withdraw", label: "Withdraw", icon: "↥" },
  { href: "/activity", label: "Activity", icon: "≡" },
  { href: "/strategies", label: "Strategies", icon: "▥" },
  { href: "/help", label: "Help", icon: "?" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { disconnect } = useDisconnect();
  const { address, status } = useAccount();

  // Optimistic highlight: the clicked item turns active immediately,
  // before the new route has finished rendering.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  // Warm every route once the shell is mounted so each click is instant.
  useEffect(() => {
    NAV.forEach((n) => router.prefetch(n.href));
  }, [router]);

  const current = pendingHref ?? pathname;
  const isActive = (href: string) =>
    current === href || current.startsWith(href + "/");

  const nav = NAV.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      prefetch
      onClick={() => setPendingHref(item.href)}
      className={`sidebar-link${isActive(item.href) ? " is-active" : ""}`}
      aria-current={isActive(item.href) ? "page" : undefined}
    >
      <span className="sidebar-link-icon" aria-hidden>
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  ));

  const logoSrc = theme === "light" ? "/logo-light.png" : "/logo-dark.png";
  const reconnecting = status === "connecting" || status === "reconnecting";

  // Not connected (and not still restoring the previous session).
  if (!reconnecting && !address) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: "var(--bg)",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          style={{
            position: "relative",
            textAlign: "center",
            padding: 40,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            maxWidth: 400,
            width: "100%",
          }}
        >
          <button
            onClick={() => router.push("/")}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "transparent",
              border: "none",
              color: "var(--text-3)",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, color: "var(--text)" }}>
            Connect your wallet
          </h1>
          <p style={{ color: "var(--text-2)", marginBottom: 24, fontSize: 14 }}>
            Choose a wallet on the home page to open your treasury dashboard.
          </p>
          <Link href="/" className="btn-primary" style={{ display: "block", padding: 12, fontSize: 15 }}>
            Choose a wallet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Link href="/dashboard" prefetch>
            <Image src={logoSrc} alt="YieldKeep" width={160} height={36} className="sidebar-logo-img" style={{ width: "auto", height: 36 }} priority unoptimized />
          </Link>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          {nav}
        </nav>
        <div className="sidebar-promo">
          <div className="sidebar-promo-title">Treasury infrastructure</div>
          <p className="sidebar-promo-text">Non-custodial USDC vault for DAOs. Testnet demo.</p>
          <Link href="/strategies" prefetch className="sidebar-promo-link">
            View strategy →
          </Link>
        </div>
        <div className="sidebar-footer">
          <div className="theme-toggle" role="group" aria-label="Theme">
            <button
              type="button"
              className={`theme-btn${theme === "light" ? " is-active" : ""}`}
              onClick={() => theme !== "light" && toggle()}
              aria-label="Light theme"
              title="Light"
            >
              ☀
            </button>
            <button
              type="button"
              className={`theme-btn${theme === "dark" ? " is-active" : ""}`}
              onClick={() => theme !== "dark" && toggle()}
              aria-label="Dark theme"
              title="Dark"
            >
              ☾
            </button>
          </div>
        </div>
      </aside>

      <main className="app-content">
        <TestnetBanner />
        <div className="top-bar">
          <div className="top-bar-right">
            <span className="badge">
              <span className="badge-dot" />
              Base Sepolia
            </span>
            <button
              onClick={() => {
                disconnect();
                router.push("/");
              }}
              className="btn-ghost"
              style={{ padding: "6px 12px", fontSize: 13 }}
              title="Disconnect"
            >
              {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connecting…"}
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}