"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/app/providers/ThemeProvider";
import TestnetBanner from "@/app/components/TestnetBanner";
const NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: "▦" },
  { href: "/deposit",    label: "Deposit",    icon: "↧" },
  { href: "/withdraw",   label: "Withdraw",   icon: "↥" },
  { href: "/activity",   label: "Activity",   icon: "≡" },
  { href: "/strategies", label: "Strategies", icon: "▥" },
  { href: "/help",       label: "Help",       icon: "?" },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const renderNav = (items: typeof NAV) =>
    items.map((item) => {
      const active = pathname === item.href;
      return (
        <Link
          key={item.href}
          href={item.href}
          prefetch={true}
          className={`sidebar-link${active ? " is-active" : ""}`}
        >
          <span className="sidebar-link-icon" aria-hidden>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </Link>
      );
    });

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Link href="/dashboard">
            <Image
              src={theme === "light" ? "/logo-light.png" : "/logo-dark.png"}
              alt="YieldKeep"
              width={180}
              height={60}
              className="sidebar-logo-img"
              priority
            />
          </Link>
        </div>

        <nav className="sidebar-nav">{renderNav(NAV)}</nav>

        <div className="sidebar-promo">
          <div className="sidebar-promo-title">Grow Your Treasury</div>
          <p className="sidebar-promo-text">
            Non-custodial infrastructure for DAOs.
          </p>
          <Link href="/strategies" className="sidebar-promo-link">
            Learn More →
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
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus="address"
            />
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}