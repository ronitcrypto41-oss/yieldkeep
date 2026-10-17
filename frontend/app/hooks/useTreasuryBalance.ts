'use client';

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { TREASURY_ADDRESS, TREASURY_ABI, USDC_DECIMALS } from '@/lib/contracts';

/**
 * Reads the total USDC balance held by the DAO Treasury via the
 * `totalAssets()` view function. This is a read-only call — no transaction,
 * no gas, and it works even if the wallet is not connected.
 *
 * Returns:
 *  - rawBalance: bigint | undefined   (in USDC's smallest unit, 6 decimals)
 *  - formattedBalance: string          (e.g. "1234.56")
 *  - isLoading: boolean
 *  - isError: boolean
 *  - error: Error | null
 *  - refetch: () => void               (manual refresh)
 */
export function useTreasuryBalance() {
  const {
    data: rawBalance,
    isLoading,
    isError,
    error,
    refetch,
  } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: 'totalAssets',
    query: {
      refetchInterval: 15_000,
    },
  });

  const formattedBalance =
    rawBalance !== undefined
      ? formatUnits(rawBalance as bigint, USDC_DECIMALS)
      : '0.00';

  return {
    rawBalance,
    formattedBalance,
    isLoading,
    isError,
    error,
    refetch,
  };
}