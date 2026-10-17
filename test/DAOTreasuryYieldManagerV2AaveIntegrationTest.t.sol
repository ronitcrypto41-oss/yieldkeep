// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockAToken} from "../src/mocks/MockAToken.sol";
import {MockAavePool} from "../src/mocks/MockAavePool.sol";
import {AaveYieldAdapter} from "../src/adapters/AaveYieldAdapter.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";

contract DAOTreasuryYieldManagerV2AaveIntegrationTest is Test {
    MockUSDC public usdc;
    MockAToken public aToken;
    MockAavePool public pool;

    AaveYieldAdapter public adapter;
    DAOTreasuryYieldManagerV2 public treasury;

    address public alice;

    function setUp() public {
        usdc = new MockUSDC();

        aToken = new MockAToken();

        pool = new MockAavePool(
            usdc,
            aToken
        );

        adapter = new AaveYieldAdapter(
            usdc,
            pool,
            aToken
        );

        treasury = new DAOTreasuryYieldManagerV2(
            usdc,
            adapter
        );

        adapter.setTreasury(
            address(treasury)
        );

        alice = makeAddr("alice");

        usdc.mint(
            alice,
            1000
        );

        usdc.mint(
            address(pool),
            10000
        );
    }

    function test_DepositThroughRealTreasuryAndAaveAdapter() public {
        vm.startPrank(alice);

        usdc.approve(
            address(treasury),
            100
        );

        treasury.deposit(100);

        vm.stopPrank();

        assertEq(
            treasury.shares(alice),
            100
        );

        assertEq(
            treasury.totalShares(),
            100
        );

        assertEq(
            treasury.totalAssets(),
            100
        );

        assertEq(
            adapter.totalAssets(),
            100
        );

        assertEq(
            aToken.balanceOf(address(adapter)),
            100
        );

        assertEq(
            usdc.balanceOf(address(treasury)),
            0
        );
    }

    function test_YieldThroughAaveReachesTreasuryAccounting() public {
        vm.startPrank(alice);

        usdc.approve(
            address(treasury),
            100
        );

        treasury.deposit(100);

        vm.stopPrank();

        assertEq(
            treasury.totalAssets(),
            100
        );

        aToken.addYield(
            address(adapter),
            20
        );

        assertEq(
            adapter.totalAssets(),
            120
        );

        assertEq(
            treasury.totalAssets(),
            120
        );

        assertEq(
            treasury.shares(alice),
            100
        );

        assertEq(
            treasury.totalShares(),
            100
        );
    }

    function test_WithdrawThroughTreasuryAndAave() public {
        vm.startPrank(alice);

        usdc.approve(
            address(treasury),
            100
        );

        treasury.deposit(100);

        uint256 aliceBalanceBefore =
            usdc.balanceOf(alice);

        treasury.withdraw();

        vm.stopPrank();

        assertEq(
            usdc.balanceOf(alice),
            aliceBalanceBefore + 100
        );

        assertEq(
            treasury.shares(alice),
            0
        );

        assertEq(
            treasury.totalShares(),
            0
        );

        assertEq(
            treasury.totalAssets(),
            0
        );

        assertEq(
            adapter.totalAssets(),
            0
        );

        assertEq(
            aToken.balanceOf(address(adapter)),
            0
        );
    }
}