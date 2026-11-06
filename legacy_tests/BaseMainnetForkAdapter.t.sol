// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAavePool} from "../src/interfaces/IAavePool.sol";
import {IAToken} from "../src/interfaces/IAToken.sol";
import {AaveYieldAdapter} from "../src/adapters/AaveYieldAdapter.sol";

interface IPoolDataProviderMin {
    function getReserveConfigurationData(address asset)
        external
        view
        returns (
            uint256 decimals,
            uint256 ltv,
            uint256 liquidationThreshold,
            uint256 liquidationBonus,
            uint256 reserveFactor,
            bool usageAsCollateralEnabled,
            bool borrowingEnabled,
            bool stableBorrowRateEnabled,
            bool isActive,
            bool isFrozen
        );
    function getReserveCaps(address asset)
        external
        view
        returns (uint256 borrowCap, uint256 supplyCap);
}

contract BaseMainnetForkAdapter is Test {
    // ---- Base mainnet addresses (verified on-chain earlier) ----
    IERC20  constant USDC   = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);
    IAToken constant AUSDC  = IAToken(0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB);
    IAavePool constant POOL = IAavePool(0xA238Dd80C259a72e81d7e4664a9801593F98d1c5);
    IPoolDataProviderMin constant DATA_PROVIDER =
        IPoolDataProviderMin(0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A);

    address constant ALICE   = address(0xA11CE);
    uint256 constant DEPOSIT = 1_000e6; // 1,000 USDC

    AaveYieldAdapter adapter;

    function setUp() public {
        // NOTE: vm.createSelectFork removed. 
        // The fork is created by the CLI: --fork-url ... --fork-block-number 30000000

        // Phase B item 2: assert reserve is active & not frozen on fork
        (
            uint256 decimals,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            bool isActive,
            bool isFrozen
        ) = DATA_PROVIDER.getReserveConfigurationData(address(USDC));

        assertEq(decimals, 6, "USDC decimals != 6 on Base");
        assertTrue(isActive, "USDC reserve not active on Base");
        assertFalse(isFrozen, "USDC reserve frozen on Base");

        (, uint256 supplyCap) = DATA_PROVIDER.getReserveCaps(address(USDC));
        console2.log("USDC supply cap (whole units):", supplyCap);

        // Deploy adapter against real Base Aave v3
        adapter = new AaveYieldAdapter(USDC, POOL, AUSDC);
        adapter.setTreasury(ALICE);
    }

    function test_AdapterSuppliesToAaveAndEarnsYield() public {
        // 1. Fund alice with play USDC (no real funds)
        deal(address(USDC), ALICE, DEPOSIT);
        assertEq(USDC.balanceOf(ALICE), DEPOSIT, "deal failed");

        // 2. Alice approves adapter and deposits
        vm.startPrank(ALICE);
        USDC.approve(address(adapter), DEPOSIT);
        adapter.deposit(DEPOSIT);
        vm.stopPrank();

        // 3. Adapter now holds ~DEPOSIT worth of aToken.
        // Aave rounds aToken shares down by at most 1 micro-USDC
        // (virtual balance / share math), so allow 1 unit of slack.
        uint256 supplied = adapter.totalAssets();
        assertGe(supplied, DEPOSIT - 1, "adapter received unexpectedly little");

        // 4. Warp 30 days forward so Aave interest accrues
        vm.warp(block.timestamp + 30 days);
        vm.roll(block.number + (30 days / 2)); // ~2s blocks on Base

        // 5. Yield must have accrued
        uint256 afterYield = adapter.totalAssets();
        console2.log("aToken balance immediately after deposit:", supplied);
        console2.log("aToken balance after 30 days:            ", afterYield);
        assertGt(afterYield, supplied, "no yield accrued after 30 days");

        // 6. Withdraw the original 1,000 USDC principal
        vm.prank(ALICE);
        adapter.withdraw(DEPOSIT);

        // 7. Alice received at least her deposit back (allow 1 unit slack)
        assertGe(USDC.balanceOf(ALICE), DEPOSIT - 1, "alice got less than she deposited");

        // 8. Adapter holds residual yield only; must be strictly less than principal
        uint256 residual = adapter.totalAssets();
        console2.log("adapter residual (yield) after withdraw:", residual);
        assertLt(residual, DEPOSIT, "adapter still holds >= principal");
    }
}