"use client";

import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { USDC_ADDRESS, USDC_DECIMALS } from "@/lib/contracts";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export function useUSDCBalance() {
  const { address, isConnected } = useAccount();

  const { data: rawBalance, isLoading, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 10_000,
    },
  });

  const formattedBalance =
    rawBalance !== undefined
      ? formatUnits(rawBalance as bigint, USDC_DECIMALS)
      : "0.00";

  return { rawBalance, formattedBalance, isLoading, refetch };
}