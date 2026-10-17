// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";

contract DAOTreasuryYieldManagerV2WithdrawRoundingTest is Test {
    MockUSDC public usdc;
    MockYieldProtocol public protocol;
    DAOTreasuryYieldManagerV2 public treasury;

    address public alice;
    address public bob;

    function setUp() public {
        usdc = new MockUSDC();

        protocol = new MockYieldProtocol(usdc);

        treasury = new DAOTreasuryYieldManagerV2(
            usdc,
            protocol
        );

        alice = makeAddr("alice");
        bob = makeAddr("bob");

        usdc.mint(alice, 1000);
        usdc.mint(bob, 1000);
    }

    function test_WithdrawRoundingDoesNotCreateExtraAssets() public {
        vm.startPrank(alice);

        usdc.approve(address(treasury), 1000);
        treasury.deposit(1000);

        vm.stopPrank();

        // Add 1 USDC of yield.
        protocol.addYield(address(treasury), 1);

        assertEq(treasury.totalAssets(), 1001);
        assertEq(treasury.totalShares(), 1000);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        treasury.withdraw();

        uint256 aliceReceived =
            usdc.balanceOf(alice) - aliceBefore;

        // 1000 * 1001 / 1000 = 1001
        assertEq(aliceReceived, 1001);

        assertEq(treasury.totalShares(), 0);
        assertEq(treasury.totalAssets(), 0);
    }

    function test_ShareCalculationRoundsDown() public {
        vm.startPrank(alice);

        usdc.approve(address(treasury), 1000);
        treasury.deposit(1000);

        vm.stopPrank();

        protocol.addYield(address(treasury), 1);

        vm.startPrank(bob);

        usdc.approve(address(treasury), 500);
        treasury.deposit(500);

        vm.stopPrank();

        // 500 * 1000 / 1001 = 499 shares
        assertEq(treasury.shares(bob), 499);

        assertEq(treasury.totalShares(), 1499);
    }
}