// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";

contract UnauthorizedYieldTest is Test {
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

        usdc.mint(alice, 100);
    }

    function test_AnyoneCanCallAddYieldOnMock() public {
        vm.startPrank(alice);

        usdc.approve(address(treasury), 100);
        treasury.deposit(100);

        vm.stopPrank();

        assertEq(treasury.totalAssets(), 100);

        // The attacker is NOT the Treasury.
        // But the mock protocol currently allows anyone
        // to call addYield().
        vm.prank(attacker);

        protocol.addYield(
            address(treasury),
            100
        );

        // The attacker has artificially increased
        // the Treasury's reported assets.
        assertEq(treasury.totalAssets(), 200);

        assertEq(
            treasury.totalShares(),
            100
        );
    }
}