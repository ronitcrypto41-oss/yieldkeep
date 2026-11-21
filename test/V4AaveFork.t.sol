// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DAOTreasuryYieldManagerV4} from "../src/DAOTreasuryYieldManagerV4.sol";
import {AaveYieldAdapter} from "../src/adapters/AaveYieldAdapter.sol";
import {IAavePool} from "../src/interfaces/IAavePool.sol";
import {IAToken} from "../src/interfaces/IAToken.sol";

/// @notice Mainnet-fork tests: the V4 vault + the REAL AaveYieldAdapter against the REAL Aave V3 on Base.
/// Nothing is deployed on mainnet. Foundry copies Base mainnet state into a local sandbox.
///
/// Addresses come from Aave's official address book (npm package: bgd-labs aave-address-book, file AaveV3Base).
/// Run:  forge test --match-path test/V4AaveFork.t.sol -vv
/// Optional: set BASE_RPC_URL in your terminal to use your own RPC. Default is the public Base RPC.
contract V4AaveForkTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // native USDC on Base (6 decimals)
    address constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5; // Aave V3 Pool on Base
    address constant A_USDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB; // aBasUSDC

    uint256 constant ONE = 1e6; // 1 USDC
    uint256 constant DEAD = 1000; // dead shares (0.001 USDC)

    DAOTreasuryYieldManagerV4 vault;
    AaveYieldAdapter adapter;
    IERC20 usdc = IERC20(USDC);

    address owner = makeAddr("owner");
    address feeWallet = makeAddr("feeWallet");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));

        // this test contract is the adapter "deployer", so it can call setTreasury once
        adapter = new AaveYieldAdapter(usdc, IAavePool(AAVE_POOL), IAToken(A_USDC));
        vault = new DAOTreasuryYieldManagerV4(usdc, adapter, feeWallet, owner, 0);
        adapter.setTreasury(address(vault));

        deal(USDC, alice, 100_000 * ONE);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _depositAndHarvest(uint256 amount) internal {
        vm.prank(alice);
        vault.deposit(amount);
        vault.harvest();
    }

    // ───────── 1: the money really goes into Aave ─────────
    function test_harvest_movesUsdcIntoAave() public {
        _depositAndHarvest(1000 * ONE);

        assertEq(usdc.balanceOf(address(vault)), 0, "vault still holds idle USDC");
        assertApproxEqAbs(adapter.totalAssets(), 1000 * ONE, 2, "adapter aToken balance is wrong");
        assertApproxEqAbs(vault.totalAssets(), 1000 * ONE, 2, "vault total assets is wrong");
    }

    // ───────── 2: no time passes, no profit, no fee ─────────
    function test_instantRoundtrip_noFee() public {
        _depositAndHarvest(1000 * ONE);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        uint256 got = usdc.balanceOf(alice) - before;

        assertEq(vault.totalFeesPaid(), 0, "fee charged without profit");
        assertLe(got, 1000 * ONE, "made money from nothing");
        assertGe(got + DEAD + 3, 1000 * ONE, "lost more than dead shares and rounding");
    }

    // ───────── 3: real Aave interest, real fee ─────────
    function test_realInterest_feeIsTenPercentOfProfit() public {
        _depositAndHarvest(1000 * ONE);
        uint256 assetsBefore = vault.totalAssets();

        vm.warp(block.timestamp + 90 days); // Aave interest is computed from the timestamp

        uint256 assetsAfter = vault.totalAssets();
        assertGt(assetsAfter, assetsBefore, "Aave paid no interest after 90 days");

        (uint256 value,, uint256 profit, uint256 feeDue,,) = vault.feeInfo(alice);
        assertGt(profit, 0, "no profit shown");
        assertEq(feeDue, profit / 10, "fee is not 10% of profit");

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        uint256 got = usdc.balanceOf(alice) - before;

        assertEq(vault.totalFeesPaid(), feeDue, "fee paid differs from fee shown");
        assertGt(vault.shares(feeWallet), 0, "fee wallet got no shares");
        assertGe(got + 3, value - feeDue, "treasury received less than value minus fee");
        assertGt(got, 1000 * ONE - DEAD - 3, "principal was touched");

        emit log_named_uint("profit (USDC micro-units)", profit);
        emit log_named_uint("fee    (USDC micro-units)", feeDue);
    }

    // ───────── 4: partial withdrawal from Aave ─────────
    function test_partialWithdraw_thenFull() public {
        _depositAndHarvest(1000 * ONE);
        vm.warp(block.timestamp + 30 days);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.withdrawAmount(300 * ONE);
        assertEq(usdc.balanceOf(alice) - before, 300 * ONE, "partial amount is wrong");
        assertGt(vault.shares(alice), 0, "alice should still have a position");

        vm.prank(alice);
        vault.withdraw();
        assertEq(vault.shares(alice), 0, "alice should be fully out");
    }

    // ───────── 5: the adapter only listens to the vault ─────────
    function test_adapter_onlyTreasury() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Only treasury"));
        adapter.deposit(1);

        vm.prank(alice);
        vm.expectRevert(bytes("Only treasury"));
        adapter.withdraw(1);
    }

    function test_adapter_treasuryCanBeSetOnlyOnce() public {
        vm.expectRevert(bytes("Treasury already set"));
        adapter.setTreasury(address(0x1234));
    }

    // ───────── 6: THE IMPORTANT ONE ─────────
    // The README says withdrawals can never be paused. But the adapter has its own pause().
    // If the adapter deployer pauses it, can treasuries still get their money out?
    // This test states the rule we WANT. It fails today and passes once adapter.withdraw()
    // no longer has `whenNotPaused`.
    function test_withdrawStillWorks_whenAdapterIsPaused() public {
        _depositAndHarvest(1000 * ONE);

        adapter.pause(); // this test contract is the adapter deployer

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();

        assertGt(usdc.balanceOf(alice) - before, 990 * ONE, "withdrawal blocked by adapter pause");
    }
}