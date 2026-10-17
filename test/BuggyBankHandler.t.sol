// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BuggyBank} from "../src/BuggyBank.sol";

contract BuggyBankHandler is Test {
    BuggyBank public bank;

    mapping(address => uint256) public expectedBalances;

    address[] public users;
    address internal currentActor;

    modifier useActor(uint256 actorSeed) {
        currentActor = users[bound(actorSeed, 0, users.length - 1)];

        vm.startPrank(currentActor);
        _;
        vm.stopPrank();
    }

    constructor(BuggyBank _bank) {
        bank = _bank;

        users.push(address(0x1001));
        users.push(address(0x1002));
        users.push(address(0x1003));
    }

    function deposit(
        uint256 amount,
        uint256 actorSeed
    ) public useActor(actorSeed) {
        amount = bound(amount, 1 ether, 10 ether);

       vm.deal(currentActor, currentActor.balance + amount);

        bank.deposit{value: amount}();

        expectedBalances[currentActor] += amount;
    }

    function withdraw(
        uint256 amount,
        uint256 extra,
        uint256 actorSeed
    ) public useActor(actorSeed) {
        uint256 balance = bank.balances(currentActor);

        vm.assume(balance > 0);

        if (extra % 2 == 0) {
            amount = bound(amount, 0, balance);

            bank.withdraw(amount);

            expectedBalances[currentActor] -= amount;

            return;
        }

        amount = bound(
            amount,
            balance + 1,
            type(uint256).max
        );

        vm.expectRevert("Insufficient balance");

        bank.withdraw(amount);
    }

    receive() external payable {}
}