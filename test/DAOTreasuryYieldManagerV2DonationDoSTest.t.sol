// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";

contract DAOTreasuryYieldManagerV2DonationDoSTest is Test {
    MockUSDC public usdc;
    MockYieldProtocol public protocol;
    DAOTreasuryYieldManagerV2 public treasury;

    address public alice;
    address public attacker;

    function setUp() public {
        usdc = new MockUSDC();

        protocol = new MockYieldProtocol(usdc);

        treasury = new DAOTreasuryYieldManagerV2(
            usdc,
            protocol
        );

        alice = makeAddr("alice");
        attacker = makeAddr("attacker");

        usdc.mint(alice, 100e6);
        usdc.mint(attacker, 100e6);
    }

    // ============================================================
    // REGRESSION TEST
    // ============================================================
    //
    // Before the production patch:
    //
    //     Alice deposits $100
    //     Attacker donates $100
    //     Alice tries to withdraw $200
    //
    //     Production code asked protocol for $200.
    //     Protocol only had $100.
    //
    //     => withdrawal reverted
    //
    // After the production patch:
    //
    //     Treasury already has $100.
    //     Withdrawal asks protocol for only $200 - $100 = $100
    //     Then sends the complete $200 to Alice.
    //
    //     => withdrawal succeeds
    // ============================================================

    function test_DonationNoLongerCausesWithdrawalDoS()
        public
    {
        // 1. Alice deposits $100
        vm.startPrank(alice);

        usdc.approve(address(treasury), 100e6);

        treasury.deposit(100e6);

        vm.stopPrank();

        // deposit() only holds the USDC. harvest() sends it to the yield protocol.
        treasury.harvest();

        // Initial state
        assertEq(treasury.totalAssets(), 100e6);
        assertEq(treasury.shares(alice), 100e6);
        assertEq(protocol.totalAssets(), 100e6);

        // 2. Attacker directly donates $100
        vm.prank(attacker);

        usdc.transfer(address(treasury), 100e6);

        // Now: Treasury = $100, Protocol = $100, Total = $200
        assertEq(usdc.balanceOf(address(treasury)), 100e6);
        assertEq(protocol.totalAssets(), 100e6);
        assertEq(treasury.totalAssets(), 200e6);

        // 3. Alice withdraws
        uint256 aliceBalanceBefore = usdc.balanceOf(alice);

        vm.prank(alice);

        treasury.withdraw();

        uint256 aliceReceived = usdc.balanceOf(alice) - aliceBalanceBefore;

        // Alice receives the full $200.
        assertEq(aliceReceived, 200e6);

        // The donation was correctly included in Alice's value.
        assertEq(treasury.shares(alice), 0);
        assertEq(treasury.totalShares(), 0);

        // Everything has been withdrawn.
        assertEq(treasury.totalAssets(), 0);
        assertEq(protocol.totalAssets(), 0);
        assertEq(usdc.balanceOf(address(treasury)), 0);

        emit log("================================");
        emit log("DONATION DoS REGRESSION: PASS");
        emit log("Donation no longer breaks withdrawal.");
        emit log("Idle Treasury assets were used first.");
        emit log("Alice received the full $200.");
        emit log("================================");
    }
}