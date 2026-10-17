// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC public usdc;

    address public alice;

    function setUp() public {
        usdc = new MockUSDC();

        alice = makeAddr("alice");
    }

    function test_Mint() public {
        usdc.mint(alice, 1000);

        assertEq(usdc.balanceOf(alice), 1000);
    }
}