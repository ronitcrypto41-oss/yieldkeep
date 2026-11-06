// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";

contract DAOTreasuryYieldManagerV2ProtocolFailureTest is Test {
    MockUSDC public usdc;
    MockYieldProtocol public protocol;
    DAOTreasuryYieldManagerV2 public treasury;

    address public alice;

    function setUp() public {
        usdc = new MockUSDC();

        protocol = new MockYieldProtocol(usdc);

        treasury = new DAOTreasuryYieldManagerV2(
            usdc,
            protocol
        );

        alice = makeAddr("alice");

        usdc.mint(
            alice,
            100
        );
    }

    function test_ProtocolFailureRevertsWithdrawal()
        public
    {
        vm.startPrank(alice);

        usdc.approve(
            address(treasury),
            100
        );

        treasury.deposit(100);

        vm.stopPrank();

        // deposit() only holds the USDC. harvest() sends it to the yield protocol.
        treasury.harvest();

        assertEq(
            treasury.shares(alice),
            100
        );

        assertEq(
            treasury.totalShares(),
            100
        );

        assertEq(
            protocol.totalAssets(),
            100
        );

        // Simulate the protocol losing its underlying liquidity.
        vm.prank(address(protocol));

        usdc.transfer(
            address(this),
            100
        );

        assertEq(
            usdc.balanceOf(address(protocol)),
            0
        );

        // The protocol still reports the position,
        // but it no longer has enough USDC to fulfill it.
        assertEq(
            protocol.totalAssets(),
            100
        );

        vm.prank(alice);

        vm.expectRevert();

        treasury.withdraw();

        // The failed withdrawal must roll back
        // the Treasury's state.
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
            protocol.totalAssets(),
            100
        );
    }
}