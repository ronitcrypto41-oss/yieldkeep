// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RonitBank} from "../src/RonitBank.sol";
import {RonitBankHandler} from "./RonitBankHandler.t.sol";

contract RonitBankInvariantTest is Test {
    RonitBank public bank;
    RonitBankHandler public handler;

    function setUp() public {
        bank = new RonitBank();

        handler = new RonitBankHandler(bank);

        bytes4[] memory selectors = new bytes4[](2);

        selectors[0] = handler.deposit.selector;
        selectors[1] = handler.withdraw.selector;

        targetSelector(
            FuzzSelector({
                addr: address(handler),
                selectors: selectors
            })
        );
    }

    // ------------------------------------------------------------
    // TOTAL ACCOUNTING INVARIANT
    // ------------------------------------------------------------

    function invariant_BankAccounting() public view {
        uint256 expectedBalance =
            handler.totalDeposited()
            - handler.totalWithdrawn();

        assertEq(
            address(bank).balance,
            expectedBalance
        );
    }

    // ------------------------------------------------------------
    // PER-USER ACCOUNTING INVARIANT
    // ------------------------------------------------------------

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