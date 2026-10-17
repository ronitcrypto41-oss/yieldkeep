"use client";

import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { config } from "@/lib/wagmi";
import { ThemeProvider, useTheme } from "./providers/ThemeProvider";

const queryClient = new QueryClient();

function RainbowWithTheme({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <RainbowKitProvider
      theme={theme === "dark" ? darkTheme() : lightTheme()}
      modalSize="compact"
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RainbowWithTheme>{children}</RainbowWithTheme>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}