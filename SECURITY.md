# Security Policy

YieldKeep is a **testnet demo (Base Sepolia). It is unaudited. Do not use real funds.**

## Reporting a bug

Please report security problems privately. Do not open a public issue.

- On GitHub: open the **Security** tab of this repository and click **Report a vulnerability**.
- Or send a direct message on X: @Web3Ronit

Please include: what you found, the contract and function, steps to reproduce, and what you think the impact is. I will reply as soon as I can. This is a solo project, so there is no bug bounty yet.

## What is in scope

- `src/DAOTreasuryYieldManagerV4.sol` (the vault)
- `src/adapters/AaveYieldAdapter.sol` (the Aave V3 adapter)

Older versions (V2, V3), the mocks in `src/mocks/`, and the practice contracts (`BuggyBank`, `VulnerableBank`, `RonitBank`) are not in scope. Some of them are vulnerable on purpose.

## Security work done so far

- 112 tests, 0 failing: unit tests, fuzz tests, invariant tests (128,000 random calls), and tests against real Aave V3 on a Base mainnet fork.
- One of the fork tests found a real bug in the adapter (a pause could block withdrawals). It was fixed, and a test now checks that withdrawals can never be paused.
- Slither (static analysis) was run on the whole project. It reported 50 results. Each one was reviewed. None was a real bug in the V4 vault or the Aave adapter. They were test mocks, old versions, practice contracts, or style notes.

Slither and tests are not an audit. Mainnet needs an independent audit first.

## Known risks

- **Not audited.** No professional audit has been done.
- **Yield on testnet is simulated** by a mock adapter.
- **The adapter cannot be replaced** after deployment.
- **Withdrawals depend on Aave liquidity.** If Aave cannot return enough USDC, a withdrawal can fail until liquidity returns.
- **Aave governance or its emergency admin** can pause or freeze a reserve, which would delay withdrawals.
- **USDC is issued by Circle**, which can blacklist addresses or pause USDC.
- **The owner is a normal wallet on testnet.** On mainnet the plan is a 2-of-3 Safe. The owner can pause deposits, set the deposit cap, and set the fee recipient. The owner cannot move user funds, pause withdrawals, change the adapter, or change the fee rate.

## Supported versions

Only the latest `master` branch.