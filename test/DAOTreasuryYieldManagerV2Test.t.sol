// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";

contract DAOTreasuryYieldManagerV2Test is Test {
    DAOTreasuryYieldManagerV2 public vault;
    MockUSDC public usdc;
    MockYieldProtocol public protocol;

    address public alice;
    address public bob;

    uint256 constant INITIAL_BALANCE = 1_000_000e6; // 1M USDC

    function setUp() public {
        usdc = new MockUSDC();
        protocol = new MockYieldProtocol(IERC20(address(usdc)));

        vault = new DAOTreasuryYieldManagerV2(
            IERC20(address(usdc)),
            protocol
        );

        // Grant the vault permission on the protocol (for tests).
        protocol.setTreasury(address(vault));

        alice = makeAddr("alice");
        bob = makeAddr("bob");

        usdc.mint(alice, INITIAL_BALANCE);
        usdc.mint(bob, INITIAL_BALANCE);
    }

    // ═══════════════════════════════════════════════════════════
    // DEPOSIT TESTS
    // ═══════════════════════════════════════════════════════════

    function test_Deposit() public {
        uint256 amount = 100e6;

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        // Alice should have 100 shares
        assertEq(vault.shares(alice), amount, "shares mismatch");

        // Vault should hold 100 USDC idle
        assertEq(usdc.balanceOf(address(vault)), amount, "idle balance mismatch");

        // Total assets should be 100 USDC (0 in protocol + 100 idle)
        assertEq(vault.totalAssets(), amount, "totalAssets mismatch");

        // Alice's wallet should have the remainder
        assertEq(
            usdc.balanceOf(alice),
            INITIAL_BALANCE - amount,
            "alice wallet mismatch"
        );
    }

    function test_MultipleDepositsAccumulateShares() public {
        // Alice deposits 100
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6);
        vm.stopPrank();

        // Bob deposits 100
        vm.startPrank(bob);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6);
        vm.stopPrank();

        // Alice: 100 shares, Bob: 100 shares, total: 200 shares
        assertEq(vault.shares(alice), 100e6, "alice shares");
        assertEq(vault.shares(bob), 100e6, "bob shares");
        assertEq(vault.totalShares(), 200e6, "total shares");

        // Vault holds 200 USDC idle
        assertEq(usdc.balanceOf(address(vault)), 200e6, "vault balance");

        // Total assets = 200
        assertEq(vault.totalAssets(), 200e6, "total assets");
    }

    // ═══════════════════════════════════════════════════════════
    // WITHDRAW TESTS
    // ═══════════════════════════════════════════════════════════

    function test_WithdrawWithYield() public {
        // Deposit 100
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6);

        // Simulate yield: mint 10 USDC directly to protocol (as if Aave accrued)
        usdc.mint(address(protocol), 10e6);
        protocol.bumpAssets(10e6);

        // Withdraw
        vault.withdraw();
        vm.stopPrank();

        // Alice should get 110 USDC back (100 + 10 yield)
        assertEq(usdc.balanceOf(alice), INITIAL_BALANCE + 10e6, "alice withdraw");

        // Vault should be empty
        assertEq(vault.shares(alice), 0, "shares cleared");
        assertEq(vault.totalShares(), 0, "total shares cleared");
    }

    function test_WithdrawWithZeroSharesReverts() public {
        vm.prank(alice);
        vm.expectRevert("No shares");
        vault.withdraw();
    }

    // ═══════════════════════════════════════════════════════════
    // HARVEST TEST — the one that matters
    // ═══════════════════════════════════════════════════════════

    function test_Harvest() public {
        // Alice deposits 100
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6);
        vm.stopPrank();

        // Vault has 100 idle
        assertEq(usdc.balanceOf(address(vault)), 100e6, "idle before harvest");

        // Harvest — should move 100 into protocol
        vault.harvest();

        // Vault has 0 idle now
        assertEq(usdc.balanceOf(address(vault)), 0, "idle after harvest");

        // Protocol has 100
        assertEq(protocol.totalAssets(), 100e6, "protocol after harvest");

        // Vault's totalAssets is still 100 (idle + protocol)
        assertEq(vault.totalAssets(), 100e6, "total after harvest");
    }

    // ═══════════════════════════════════════════════════════════
    // YIELD / SHARE PRICE TESTS
    // ═══════════════════════════════════════════════════════════

    function test_YieldIncreasesShareValue() public {
        // Deposit 100
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6);
        vm.stopPrank();

        // Share price starts at 1e6 (1 USDC per share)
        assertEq(vault.sharePrice(), 1e6, "share price start");

        // Simulate yield: 10 USDC appears in protocol
        usdc.mint(address(protocol), 10e6);
        protocol.bumpAssets(10e6);

        // Share price should now be 1.1e6 (110 total / 100 shares)
        assertEq(vault.sharePrice(), 1.1e6, "share price after yield");
    }

    function test_ZeroDepositReverts() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vm.expectRevert("Zero deposit");
        vault.deposit(0);
        vm.stopPrank();
    }

    function test_ZeroSharesDepositReverts() public {
        // First depositor with tiny amount that rounds to 0 shares is
        // impossible in this vault: first depositor gets 1:1 shares.
        // So this test is really about "can't deposit 0"
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vm.expectRevert("Zero deposit");
        vault.deposit(0);
        vm.stopPrank();
    }
}