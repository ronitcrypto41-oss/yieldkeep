// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";

contract DAOTreasuryYieldManagerV2DonationTest is Test {
    MockUSDC public usdc;
    MockYieldProtocol public protocol;
    DAOTreasuryYieldManagerV2 public treasury;

    address public alice;
    address public bob;
    address public attacker;

    function setUp() public {
        usdc = new MockUSDC();

        protocol = new MockYieldProtocol(usdc);

        treasury = new DAOTreasuryYieldManagerV2(
            usdc,
            protocol
        );

        alice = makeAddr("alice");
        bob = makeAddr("bob");
        attacker = makeAddr("attacker");

        usdc.mint(alice, 100);
        usdc.mint(bob, 100);
        usdc.mint(attacker, 100);
    }

    function test_DirectDonationChangesSharePrice() public {
        // Alice deposits 100 USDC.
        vm.startPrank(alice);

        usdc.approve(address(treasury), 100);
        treasury.deposit(100);

        vm.stopPrank();

        assertEq(treasury.totalAssets(), 100);
        assertEq(treasury.totalShares(), 100);
        assertEq(treasury.shares(alice), 100);

        // Attacker sends 100 USDC directly to the Treasury.
        // No shares are created for the attacker.
        vm.prank(attacker);

        usdc.transfer(address(treasury), 100);

        assertEq(treasury.totalAssets(), 200);
        assertEq(treasury.totalShares(), 100);
        assertEq(treasury.shares(attacker), 0);

        // Bob now deposits 100 USDC.
        vm.startPrank(bob);

        usdc.approve(address(treasury), 100);
        treasury.deposit(100);

        vm.stopPrank();

        // Because totalAssets was increased by the donation,
        // Bob receives only 50 shares.
        assertEq(treasury.shares(bob), 50);

        assertEq(treasury.totalShares(), 150);
        assertEq(treasury.totalAssets(), 300);
    }
}