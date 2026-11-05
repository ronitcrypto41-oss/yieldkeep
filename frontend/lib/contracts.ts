// ═══════════════════════════════════════════════════════════════
//  YieldKeep — contracts.ts
//  Base Sepolia (chainId 84532)
// ═══════════════════════════════════════════════════════════════

export const CHAIN_ID = 84532;
export const CHAIN_NAME = "Base Sepolia";

// ─── Addresses (LATEST DEPLOYMENT: V4, deployed at block 54777286) ─
// V4 = 10% performance fee per treasury + partial withdraw. Fee wallet = Fees Safe.
// Previous V3 vault (old, do not use): 0x81f1d2d4B5F038FC3282c0F9BaC070cAd548094E
export const TREASURY_ADDRESS =
  "0xC064A4E028E77803fA86125b44a4491061c131c2" as const;
export const ADAPTER_ADDRESS =
  "0xD1F5615162594EDe5Ab79d824fE7C57729E51542" as const;
export const USDC_ADDRESS =
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as const;

export const USDC_DECIMALS = 6;

export const ADDRESSES = {
  treasury: TREASURY_ADDRESS,
  adapter: ADAPTER_ADDRESS,
  usdc: USDC_ADDRESS,
} as const;

// ─── BaseScan links ────────────────────────────────────────────
export const BASESCAN = {
  address: (a: string) => `https://sepolia.basescan.org/address/${a}`,
  tx: (h: string) => `https://sepolia.basescan.org/tx/${h}`,
};

// ─── USDC ABI ──────────────────────────────────────────────────
export const USDC_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "o", type: "address" },
      { name: "s", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "s", type: "address" },
      { name: "v", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

// ─── Treasury ABI (DAOTreasuryYieldManagerV4, same names as V3 + withdrawAmount) ─
export const TREASURY_ABI = [
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "protocol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "shares",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalShares",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "idleAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sharePrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shareAmount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToShares",
    stateMutability: "view",
    inputs: [{ name: "assetAmount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "harvest",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  // V4: take out PART of a position (amount in USDC, 6 decimals)
  {
    type: "function",
    name: "withdrawAmount",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  // V4: anyone can settle a treasury's yearly fee once its date has passed
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  // ─── Events ────────────────────────────────────────────────
  {
    type: "event",
    name: "Deposit",
    anonymous: false,
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "sharesMinted", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    anonymous: false,
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "sharesBurned", type: "uint256", indexed: false },
      { name: "amountReturned", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Harvest",
    anonymous: false,
    inputs: [
      { name: "caller", type: "address", indexed: true },
      { name: "amountDeployed", type: "uint256", indexed: false },
      { name: "feePaid", type: "uint256", indexed: false },
    ],
  },
] as const;

// ─── Adapter ABI (MockAaveYieldAdapter) ────────────────────────
export const ADAPTER_ABI = [
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "simulatedYield",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "aToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "pool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "accrueYield",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;