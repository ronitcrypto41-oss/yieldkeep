export function formatUSDC(
  value: bigint | undefined | null,
  decimals = 2
): string {
  if (value === undefined || value === null) return "0.00";
  const n = Number(value) / 1e6;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSharePrice(
  totalAssets: bigint | undefined,
  totalShares: bigint | undefined
): string {
  if (!totalAssets || !totalShares || totalShares === 0n) {
    return "1.0000 USDC";
  }
  const price = Number(totalAssets) / Number(totalShares);
  return `${price.toFixed(4)} USDC`;
}

export function shortAddress(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}