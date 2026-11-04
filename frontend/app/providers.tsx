"use client";

import { WagmiProvider, createConfig, http, fallback } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// No connector imports on purpose. Wagmi discovers installed wallets itself
// (EIP-6963), so the missing '@metamask/connect-evm' error cannot happen.
//
// RPC: optional private endpoint from .env.local (NEXT_PUBLIC_BASE_SEPOLIA_RPC),
// otherwise a free public endpoint, with the official Base Sepolia RPC as backup.
const PRIMARY_RPC =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://base-sepolia-rpc.publicnode.com";

const config = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: fallback([
      http(PRIMARY_RPC, { timeout: 15_000, retryCount: 1 }),
      http("https://sepolia.base.org", { timeout: 15_000, retryCount: 1 }),
    ]),
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}