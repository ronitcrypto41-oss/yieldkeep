// frontend/app/test-balance/page.tsx
'use client';

import { useEffect } from 'react';
import { getAddress, isAddress } from 'viem';
import { useTreasuryBalance } from '@/app/hooks/useTreasuryBalance';
import { TREASURY_ADDRESS, ADAPTER_ADDRESS, CHAIN_NAME } from '@/lib/contracts';

export default function TestBalancePage() {
  const { formattedBalance, isLoading, isError, error, refetch } = useTreasuryBalance();

  useEffect(() => {
    // Print the CORRECT checksummed versions to the console
    const rawTreasury = '0x16966da70eb44de0c26059faf935cbbdc44329d';
    const rawAdapter = '0x2d919505a49169cfe36d70108dce474f42b391f';

    console.log('=== RAW LOWERCASE ===');
    console.log('Treasury:', rawTreasury, '| valid:', isAddress(rawTreasury));
    console.log('Adapter: ', rawAdapter, '| valid:', isAddress(rawAdapter));

    // getAddress with the second arg `false` SKIPS checksum validation
    // and returns the correct checksummed string.
    try {
      const checksummedTreasury = getAddress(rawTreasury, false);
      const checksummedAdapter = getAddress(rawAdapter, false);
      console.log('=== VIEM-CHECKSUMMED (copy these) ===');
      console.log('Treasury:', checksummedTreasury);
      console.log('Adapter: ', checksummedAdapter);
    } catch (e) {
      console.error('getAddress failed:', e);
    }
  }, []);

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>YieldKeep — Treasury Balance Test</h1>
      <p>Network: {CHAIN_NAME}</p>
      <p>Treasury: {TREASURY_ADDRESS}</p>
      <p>Adapter: {ADAPTER_ADDRESS}</p>

      <hr />

      <p>👉 Open the browser DevTools console (F12) to see the correct checksummed addresses.</p>

      {isLoading && <p>⏳ Loading treasury balance…</p>}

      {isError && (
        <p style={{ color: 'red' }}>❌ Error: {error?.message ?? 'Unknown error'}</p>
      )}

      {!isLoading && !isError && (
        <div>
          <h2>💰 Treasury Balance</h2>
          <p style={{ fontSize: '2rem' }}>{formattedBalance} USDC</p>
          <button onClick={() => refetch()}>🔄 Refresh</button>
        </div>
      )}
    </main>
  );
}