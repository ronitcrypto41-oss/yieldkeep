import * as React from "react";
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./app-ui.css";
import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "./providers";
import { ThemeProvider } from "@/app/providers/ThemeProvider"; // 🔥 IMPORT THIS

export const metadata: Metadata = {
  title: "YieldKeep — On-Chain Treasury",
  description: "Non-custodial USDC yield treasury dashboard",
};

const themeScript = `
  (function () {
    try {
      var t = localStorage.getItem('yk-theme');
      if (t !== 'light' && t !== 'dark') t = 'dark';
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {/* 🔥 WRAP PROVIDERS INSIDE THEME PROVIDER */}
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}