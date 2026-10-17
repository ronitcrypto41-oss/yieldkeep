import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./app-ui.css";
import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "YieldKeep — On-Chain Treasury",
  description: "Non-custodial USDC yield treasury dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var t = localStorage.getItem('yk-theme');
                  if (t !== 'light' && t !== 'dark') t = 'dark';
                  document.documentElement.setAttribute('data-theme', t);
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Script
          src="https://cdn.jsdelivr.net/npm/@rainbow-me/rainbowkit@latest/dist/rainbowkit.min.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}