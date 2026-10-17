// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RonitBank} from "../src/RonitBank.sol";

contract RonitBankHandler is Test {
    RonitBank public bank;

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    address[] public users;

    mapping(address => uint256) public expectedBalances;

    constructor(RonitBank _bank) {
        bank = _bank;

        users.push(address(0x1));
        users.push(address(0x2));
        users.push(address(0x3));
    }

    // ------------------------------------------------------------
    // DEPOSIT
    // ------------------------------------------------------------

    function deposit(
        uint256 userSeed,
        uint256 amount
    ) public {
        uint256 userIndex = bound(
            userSeed,
            0,
            users.length - 1
        );

        address user = users[userIndex];

        amount = bound(
            amount,
            1 ether,
            10 ether
        );

        vm.deal(user, amount);

        vm.prank(user);

        bank.deposit{value: amount}();

        totalDeposited += amount;

        expectedBalances[user] += amount;
    }

    // ------------------------------------------------------------
    // WITHDRAW
    // ------------------------------------------------------------

    function withdraw(
        uint256 userSeed,
        uint256 amount
    ) public {
        uint256 userIndex = bound(
            userSeed,
            0,
            users.length - 1
        );

        address user = users[userIndex];

        uint256 balance = bank.balances(user);

        if (balance == 0) {
            return;
        }

        amount = bound(
            amount,
            0,
            balance
        );

        vm.prank(user);

        bank.withdraw(amount);

        totalWithdrawn += amount;

        expectedBalances[user] -= amount;
    }

    // ------------------------------------------------------------
    // RECEIVE ETH
    // ------------------------------------------------------------

    receive() external payable {}
}