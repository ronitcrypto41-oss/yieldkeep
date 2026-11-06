# YieldKeep

**Non-custodial USDC treasury vault for DAOs, on Base.**
Idle treasury funds earn yield through Aave. YieldKeep charges a fair fee: **10% of profit only**, per treasury, never on the deposit.

> **Status: testnet demo (Base Sepolia). Unaudited. Do not use real funds.**

---

## What it does

A DAO or team treasury deposits USDC into the vault, and the vault routes it to a yield protocol (Aave V3 on mainnet). The treasury can withdraw at any time, part or all.

- **Non-custodial:** funds sit in the vault contract. Nobody can move a treasury's money except that treasury withdrawing it.
- **Per-treasury accounting:** every treasury has its own cost basis, profit and fee date.
- **Withdrawals are never paused:** pausing only blocks new deposits.

## The fee, in plain words

| Rule | How it works |
|---|---|
| Rate | 10% of **profit only**. The deposit (principal) is never charged. |
| When | Once a year on the treasury's own date (365 days after its first deposit), and **always when it withdraws**. |
| No profit | No fee. A loss never creates a fee, and a later recovery is not charged twice (high-water mark). |
| Partial withdraw | The fee on the **whole** open profit is settled first, then the amount is paid out. Splitting a withdrawal into small pieces does not avoid the fee. |
| Who can settle | Anyone can call `settle(treasury)` once the date has passed (a keeper script is included). |
| How it is paid | As vault shares moved to the fee wallet, so no USDC has to leave the yield protocol at settlement. The fee wallet is never charged. |

**Tested on Base Sepolia:** 30 USDC deposited, 3 USDC of simulated yield, first withdraw of 10 USDC. The vault took **0.30 USDC** (10% of the 3.00 profit) once, the treasury received the 10 USDC, and the final withdraw of the remaining 22.70 USDC charged no fee.

## Deployed on Base Sepolia (testnet)

| | Address |
|---|---|
| Vault (V4) | [`0xC064A4E028E77803fA86125b44a4491061c131c2`](https://sepolia.basescan.org/address/0xC064A4E028E77803fA86125b44a4491061c131c2) |
| Yield adapter (mock) | [`0xD1F5615162594EDe5Ab79d824fE7C57729E51542`](https://sepolia.basescan.org/address/0xD1F5615162594EDe5Ab79d824fE7C57729E51542) |
| USDC (Circle, Base Sepolia) | [`0x036CbD53842c5426634E7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634E7929541eC2318f3dCF7e) |
| Fee wallet (Safe) | [`0x08362158F8E4e2Df757B8818C2fa0e1410afB3fe`](https://sepolia.basescan.org/address/0x08362158F8E4e2Df757B8818C2fa0e1410afB3fe) |

Aave V3 on Base Sepolia has no USDC market, so the testnet uses a **mock adapter** and the yield is simulated (USDC is sent to the adapter). A real Aave adapter exists in `src/adapters/` for mainnet.

## Contract design (V4)

- `deposit`, `harvest` (routes idle USDC to the adapter), `withdraw` (all), `withdrawAmount` (part), `settle(user)`, `feeInfo(user)` for dashboards.
- `Ownable2Step` owner (planned: a 2-of-3 Safe), `ReentrancyGuard`, `Pausable` (deposits only), a shared deposit cap.
- 1000 dead shares are locked on the first deposit (inflation-attack protection). The first depositor loses 0.001 USDC because of it.
- Deposits are refused if the yield protocol has lost all assets while shares still exist, so nobody is diluted by worthless shares.
- Changing the fee wallet does not charge the old fee wallet for the fee shares it already holds.

## Tests

```bash
forge test
```

**94 tests across 24 suites, 0 failing.** This includes the fee tests for V3 (17) and V4 (28): independent treasuries, late joiners, losses and recoveries, missed years, the fee wallet change, total loss, and nine partial-withdraw cases. Older suites cover reentrancy, donation attacks and protocol failure on V2.

`legacy_tests/` holds early experiments (the first ETH bank and mainnet-fork tests). They are not run, and the fork tests will return for the mainnet step.

## Run it yourself

Needs [Foundry](https://book.getfoundry.sh/) and Node 20+.

```bash
# contracts
forge build
forge test

# frontend
cd frontend
npm install
# create frontend/.env.local with:  NEXT_PUBLIC_VAULT_DEPLOY_BLOCK=54777286
npm run dev
```

Keeper (lists treasuries whose fee date has passed; add `--send` to settle them, using a separate low-funds wallet):

```bash
cd frontend
node --env-file=../.env scripts/settle-keeper.mjs
```

Never commit `.env` files or private keys. They are git-ignored.

## Repository layout

| Folder | What is in it |
|---|---|
| `src/` | Vault contracts, adapters, mocks |
| `test/` | Foundry tests |
| `script/` | Deployment scripts |
| `frontend/` | Next.js app (dashboard, deposit, withdraw, activity, PDF reports) and the keeper |
| `legacy_tests/` | Early experiments, not run |
| `broadcast/` | Deployment logs |

## Known limits and next steps

- **Not audited.** Mainnet needs an independent audit first.
- Testnet yield is simulated through a mock adapter.
- Frontend history and some settings are stored in the browser only.
- Next: Base mainnet pilot with the real Aave adapter, a 2-of-3 Safe as owner, a small deposit cap, a scheduled keeper, and monitoring.

## Disclaimer

This is experimental software. Nothing here is financial advice. Smart contracts can lose funds.

Built by Ronit. Contracts are MIT licensed.