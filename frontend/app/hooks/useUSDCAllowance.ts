// frontend/app/hooks/useUSDCAllowance.ts
'use client';

import { useAccount, useReadContract } from 'wagmi';
import { USDC_ADDRESS, TREASURY_ADDRESS } from '@/lib/contracts';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export function useUSDCAllowance() {
  const { address, isConnected } = useAccount();

  const { data: allowance, refetch, isLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, TREASURY_ADDRESS] : undefined,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 10_000,
    },
  });

  return { allowance: (allowance as bigint) ?? 0n, isLoading, refetch };
}