// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";
import {MockAaveYieldAdapter} from "../src/adapters/MockAaveYieldAdapter.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

// This MUST be named FeePayoutTest
contract FeePayoutTest is Test { 
    DAOTreasuryYieldManagerV2 public treasury;
    MockAaveYieldAdapter public adapter;
    MockUSDC public usdc;

    address public user = address(0xA11CE);
    address public feeRecipient = address(0xFEE);

    function setUp() public {
        usdc = new MockUSDC();
        adapter = new MockAaveYieldAdapter(IERC20(address(usdc)));
        treasury = new DAOTreasuryYieldManagerV2(
            IERC20(address(usdc)),
            adapter,
            feeRecipient
        );
        adapter.setTreasury(address(treasury));

        // Fund user with 10,000 USDC
        usdc.mint(user, 10_000 * 1e6);
        
        // User approves treasury
        vm.prank(user);
        usdc.approve(address(treasury), type(uint256).max);
    }

    function test_FeeOnlyOnProfit() public {
        // 1. User deposits 1,000 USDC
        vm.prank(user);
        treasury.deposit(1_000 * 1e6);

        // 2. First harvest sets the baseline
        treasury.harvest();
        
        // Assert the feeRecipient got nothing yet (no profit)
        assertEq(usdc.balanceOf(feeRecipient), 0, "Should not take fee on deposit");

        // 3. Simulate 100 USDC yield in the adapter
        usdc.mint(address(adapter), 100 * 1e6);

        // 4. Second harvest collects the fee
        treasury.harvest();

        // 5. The feeRecipient should have exactly 10 USDC (10% of 100)
        assertEq(usdc.balanceOf(feeRecipient), 10 * 1e6, "Fee recipient should get 10 USDC");

        // 6. The vault should have 1,090 USDC left (1000 + 90)
        assertEq(treasury.totalAssets(), 1090 * 1e6, "Vault should have 1090 USDC");

        // 7. User withdraws and gets their principal + 90 USDC profit
        uint256 balanceBefore = usdc.balanceOf(user);
        vm.prank(user);
        treasury.withdraw();
        uint256 balanceAfter = usdc.balanceOf(user);

        assertEq(balanceAfter - balanceBefore, 1090 * 1e6, "User should receive their full principal + net yield");
    }
}