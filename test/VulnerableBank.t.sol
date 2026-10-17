// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VulnerableBank} from "../src/VulnerableBank.sol";

contract VulnerableBankTest is Test {
    VulnerableBank bank;

    function setUp() public {
        bank = new VulnerableBank();
    }

    // Allows the test contract to receive ETH
    receive() external payable {}

function testFuzz_WithdrawMoreThanBalanceReverts(
    uint256 withdrawAmount
) public {
    uint256 depositAmount = 10 ether;

    vm.deal(address(this), depositAmount);

    bank.deposit{value: depositAmount}();

    withdrawAmount = bound(
        withdrawAmount,
        depositAmount + 1,
        20 ether
    );

    vm.expectRevert("Insufficient balance");

    bank.withdraw(withdrawAmount);
} }