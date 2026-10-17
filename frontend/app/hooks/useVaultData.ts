"use client";

import { useAccount, useReadContracts } from "wagmi";
import {
  ADAPTER_ABI,
  ADAPTER_ADDRESS,
  TREASURY_ABI,
  TREASURY_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
} from "@/lib/contracts";

export function useVaultData() {
  const { address, isConnected } = useAccount();

  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      {
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "totalAssets",
      },
      {
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "totalShares",
      },
      {
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "shares",
        args: address ? [address] : undefined,
      },
      {
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [TREASURY_ADDRESS],
      },
      {
        address: ADAPTER_ADDRESS,
        abi: ADAPTER_ABI,
        functionName: "totalAssets",
      },
      {
        address: ADAPTER_ADDRESS,
        abi: ADAPTER_ABI,
        functionName: "paused",
      },
    ],
    query: { enabled: true, refetchInterval: 15_000 },
  });

  const [
    totalAssetsRes,
    totalSharesRes,
    userSharesRes,
    walletBalanceRes,
    idleUSDCRes,
    adapterAssetsRes,
    adapterPausedRes,
  ] = data ?? [];

  return {
    isConnected,
    isLoading,
    isError,
    refetch,
    totalAssets: totalAssetsRes?.result as bigint | undefined,
    totalShares: totalSharesRes?.result as bigint | undefined,
    userShares: userSharesRes?.result as bigint | undefined,
    walletBalance: walletBalanceRes?.result as bigint | undefined,
    idleUSDC: idleUSDCRes?.result as bigint | undefined,
    adapterAssets: adapterAssetsRes?.result as bigint | undefined,
    adapterPaused: adapterPausedRes?.result as boolean | undefined,
  };
}