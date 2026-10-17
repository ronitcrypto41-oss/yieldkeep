// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";

contract MockYieldProtocolTest is Test {
    MockUSDC public usdc;
    MockYieldProtocol public protocol;

    address public alice;

    function setUp() public {
        usdc = new MockUSDC();

        protocol = new MockYieldProtocol(usdc);

        alice = makeAddr("alice");

        usdc.mint(
            alice,
            1000
        );
    }

    function test_Deposit() public {
        vm.startPrank(alice);

        usdc.approve(
            address(protocol),
            100
        );

        protocol.deposit(100);

        vm.stopPrank();

        assertEq(
            protocol.totalAssets(),
            100
        );

        assertEq(
            usdc.balanceOf(address(protocol)),
            100
        );

        assertEq(
            usdc.balanceOf(alice),
            900
        );
    }

    function test_Withdraw() public {
        vm.startPrank(alice);

        usdc.approve(
            address(protocol),
            100
        );

        protocol.deposit(100);

        protocol.withdraw(100);

        vm.stopPrank();

        assertEq(
            protocol.totalAssets(),
            0
        );

        assertEq(
            usdc.balanceOf(alice),
            1000
        );

        assertEq(
            usdc.balanceOf(address(protocol)),
            0
        );
    }

    function test_AddYield() public {
        vm.startPrank(alice);

        usdc.approve(
            address(protocol),
            100
        );

        protocol.deposit(100);

        vm.stopPrank();

        protocol.addYield(
            address(protocol),
            10
        );

        assertEq(
            protocol.totalAssets(),
            110
        );

        assertEq(
            usdc.balanceOf(address(protocol)),
            110
        );
    }
}