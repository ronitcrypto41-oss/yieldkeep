// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BuggyBank} from "../src/BuggyBank.sol";
import {BuggyBankHandler} from "./BuggyBankHandler.t.sol";

contract BuggyBankInvariantTest is Test {
    BuggyBank public bank;
    BuggyBankHandler public handler;

    function setUp() public {
        bank = new BuggyBank();
        handler = new BuggyBankHandler(bank);

        targetContract(address(handler));

        bytes4[] memory selectors = new bytes4[](2);

        selectors[0] = handler.deposit.selector;
        selectors[1] = handler.withdraw.selector;

        targetSelector(
            FuzzSelector({
                addr: address(handler),
                selectors: selectors
            })
        );

        excludeContract(address(bank));
    }

    function invariant_BankAccounting() public view {
    uint256 expectedBalance =
        handler.expectedBalances(handler.users(0)) +
        handler.expectedBalances(handler.users(1)) +
        handler.expectedBalances(handler.users(2));

    assertEq(
        address(bank).balance,
        expectedBalance
    );
}

    function invariant_UserBalances() public view {
        address user1 = handler.users(0);
        address user2 = handler.users(1);
        address user3 = handler.users(2);

        assertEq(
            bank.balances(user1),
            handler.expectedBalances(user1)
        );

        assertEq(
            bank.balances(user2),
            handler.expectedBalances(user2)
        );

        assertEq(
            bank.balances(user3),
            handler.expectedBalances(user3)
        );
    }
}