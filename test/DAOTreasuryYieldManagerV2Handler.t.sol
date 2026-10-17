// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";

contract DAOTreasuryYieldManagerV2Handler is Test {
    DAOTreasuryYieldManagerV2 public treasury;
    MockUSDC public usdc;
    MockYieldProtocol public protocol;

    address public alice;
    address public bob;
    address public charlie;

    uint256 public ghost_totalShares;
    uint256 public ghost_totalAssets;

    uint256 public ghost_aliceShares;
    uint256 public ghost_bobShares;
    uint256 public ghost_charlieShares;

    constructor(
        DAOTreasuryYieldManagerV2 _treasury,
        MockUSDC _usdc,
        MockYieldProtocol _protocol
    ) {
        treasury = _treasury;
        usdc = _usdc;
        protocol = _protocol;

        alice = makeAddr("alice");
        bob = makeAddr("bob");
        charlie = makeAddr("charlie");

        usdc.mint(alice, 1000);
        usdc.mint(bob, 1000);
        usdc.mint(charlie, 1000);
    }

    function deposit(
        uint256 actorSeed,
        uint256 amount
    ) public {
        address actor;

        if (actorSeed % 3 == 0) {
            actor = alice;
        } else if (actorSeed % 3 == 1) {
            actor = bob;
        } else {
            actor = charlie;
        }

        uint256 availableBalance = usdc.balanceOf(actor);

        if (availableBalance == 0) {
            return;
        }

        amount = bound(amount, 1, availableBalance);

        uint256 assetsBefore = treasury.totalAssets();
        uint256 totalSharesBefore = treasury.totalShares();

        uint256 expectedShares;

        if (totalSharesBefore == 0) {
            expectedShares = amount;
        } else {
            expectedShares =
                (amount * totalSharesBefore) /
                assetsBefore;
        }

        if (expectedShares == 0) {
            return;
        }

        vm.startPrank(actor);

        usdc.approve(address(treasury), amount);
        treasury.deposit(amount);

        vm.stopPrank();

        ghost_totalShares += expectedShares;
        ghost_totalAssets += amount;

        if (actor == alice) {
            ghost_aliceShares += expectedShares;
        } else if (actor == bob) {
            ghost_bobShares += expectedShares;
        } else {
            ghost_charlieShares += expectedShares;
        }
    }

    function withdraw(uint256 actorSeed) public {
        address actor;

        if (actorSeed % 3 == 0) {
            actor = alice;
        } else if (actorSeed % 3 == 1) {
            actor = bob;
        } else {
            actor = charlie;
        }

        uint256 userShares = treasury.shares(actor);

        if (userShares == 0) {
            return;
        }

        uint256 assetsBefore = treasury.totalAssets();
        uint256 totalSharesBefore = treasury.totalShares();

        uint256 expectedAmount =
            (userShares * assetsBefore) /
            totalSharesBefore;

        vm.prank(actor);

        treasury.withdraw();

        ghost_totalShares -= userShares;
        ghost_totalAssets -= expectedAmount;

        if (actor == alice) {
            ghost_aliceShares = 0;
        } else if (actor == bob) {
            ghost_bobShares = 0;
        } else {
            ghost_charlieShares = 0;
        }
    }

    function addYield(uint256 amount) public {
        uint256 totalAssets = treasury.totalAssets();

        if (totalAssets == 0) {
            return;
        }

        amount = bound(amount, 1, 1000);

        protocol.addYield(
            address(treasury),
            amount
        );

        ghost_totalAssets += amount;
    }
}