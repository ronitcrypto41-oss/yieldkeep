// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";


// ================================================================
// TEST-ONLY VAULT
// ================================================================
//
// Withdrawal rule:
//
//     1. Calculate user's claim.
//     2. Use idle Treasury assets FIRST.
//     3. Ask protocol only for the remainder.
//     4. Send the complete claim to the user.
//
// NOT production code.
// ================================================================

contract DonationTwoUsersVault {

    MockUSDC public immutable asset;
    MockYieldProtocol public immutable protocol;

    mapping(address => uint256) public shares;

    uint256 public totalShares;


    constructor(
        MockUSDC _asset,
        MockYieldProtocol _protocol
    ) {
        asset = _asset;
        protocol = _protocol;
    }


    // ============================================================
    // TOTAL ASSETS
    // ============================================================

    function totalAssets()
        public
        view
        returns (uint256)
    {
        return
            asset.balanceOf(address(this))
            + protocol.totalAssets();
    }


    // ============================================================
    // DEPOSIT
    // ============================================================

    function deposit(
        uint256 amount
    )
        external
    {
        require(
            amount > 0,
            "Zero deposit"
        );

        uint256 assetsBefore =
            totalAssets();

        uint256 sharesToMint;

        if (totalShares == 0) {

            sharesToMint =
                amount;

        } else {

            sharesToMint =
                (amount * totalShares)
                / assetsBefore;
        }

        require(
            sharesToMint > 0,
            "Zero shares"
        );


        asset.transferFrom(
            msg.sender,
            address(this),
            amount
        );


        shares[msg.sender] +=
            sharesToMint;

        totalShares +=
            sharesToMint;


        asset.approve(
            address(protocol),
            amount
        );

        protocol.deposit(
            amount
        );
    }


    // ============================================================
    // FIXED WITHDRAWAL
    // ============================================================

    function withdraw()
        external
    {
        uint256 userShares =
            shares[msg.sender];

        require(
            userShares > 0,
            "No shares"
        );


        uint256 assets =
            totalAssets();

        uint256 amount =
            (userShares * assets)
            / totalShares;


        // --------------------------------------------------------
        // CEI
        // --------------------------------------------------------

        shares[msg.sender] = 0;

        totalShares -=
            userShares;


        // --------------------------------------------------------
        // Use idle Treasury assets FIRST
        // --------------------------------------------------------

        uint256 idleAssets =
            asset.balanceOf(
                address(this)
            );


        // --------------------------------------------------------
        // Ask protocol only for the missing amount
        // --------------------------------------------------------

        if (idleAssets < amount) {

            uint256 needed =
                amount - idleAssets;

            protocol.withdraw(
                needed
            );
        }


        // --------------------------------------------------------
        // Send user's complete claim
        // --------------------------------------------------------

        asset.transfer(
            msg.sender,
            amount
        );
    }
}


// ================================================================
// TEST
// ================================================================

contract DAOTreasuryYieldManagerV2DonationTwoUsersTest
    is Test
{

    MockUSDC public usdc;

    MockYieldProtocol public protocol;

    DonationTwoUsersVault public vault;


    address public alice;

    address public bob;

    address public attacker;


    function setUp()
        public
    {
        usdc =
            new MockUSDC();

        protocol =
            new MockYieldProtocol(
                usdc
            );

        vault =
            new DonationTwoUsersVault(
                usdc,
                protocol
            );


        alice =
            makeAddr("alice");

        bob =
            makeAddr("bob");

        attacker =
            makeAddr("attacker");


        // Alice gets $100.
        usdc.mint(
            alice,
            100e6
        );


        // Bob gets $100.
        usdc.mint(
            bob,
            100e6
        );


        // Attacker gets $200.
        usdc.mint(
            attacker,
            200e6
        );
    }


    function test_TwoUsersShareDonationAndWithdrawCorrectly()
        public
    {

        // ========================================================
        // 1. Alice deposits $100
        // ========================================================

        vm.startPrank(alice);

        usdc.approve(
            address(vault),
            100e6
        );

        vault.deposit(
            100e6
        );

        vm.stopPrank();


        // ========================================================
        // 2. Bob deposits $100
        // ========================================================

        vm.startPrank(bob);

        usdc.approve(
            address(vault),
            100e6
        );

        vault.deposit(
            100e6
        );

        vm.stopPrank();


        // ========================================================
        // Initial state
        //
        // Alice = 100 shares
        // Bob   = 100 shares
        // Total = 200 shares
        //
        // Protocol = $200
        // Treasury = $0
        // ========================================================

        assertEq(
            vault.shares(alice),
            100e6
        );

        assertEq(
            vault.shares(bob),
            100e6
        );

        assertEq(
            vault.totalShares(),
            200e6
        );

        assertEq(
            protocol.totalAssets(),
            200e6
        );

        assertEq(
            vault.totalAssets(),
            200e6
        );


        // ========================================================
        // 3. Attacker donates $200
        // ========================================================

        vm.prank(attacker);

        usdc.transfer(
            address(vault),
            200e6
        );


        // ========================================================
        // After donation:
        //
        // Treasury = $200
        // Protocol = $200
        // Total    = $400
        //
        // Alice = 50% = $200
        // Bob   = 50% = $200
        // ========================================================

        assertEq(
            usdc.balanceOf(address(vault)),
            200e6
        );

        assertEq(
            protocol.totalAssets(),
            200e6
        );

        assertEq(
            vault.totalAssets(),
            400e6
        );


        // ========================================================
        // 4. Alice withdraws
        // ========================================================

        uint256 aliceBefore =
            usdc.balanceOf(alice);


        vm.prank(alice);

        vault.withdraw();


        uint256 aliceReceived =
            usdc.balanceOf(alice)
            - aliceBefore;


        // Alice should receive exactly $200.
        assertEq(
            aliceReceived,
            200e6
        );


        // ========================================================
        // After Alice:
        //
        // Treasury = $0
        // Protocol = $200
        // Bob still has 100 shares
        // ========================================================

        assertEq(
            usdc.balanceOf(address(vault)),
            0
        );

        assertEq(
            protocol.totalAssets(),
            200e6
        );

        assertEq(
            vault.shares(alice),
            0
        );

        assertEq(
            vault.shares(bob),
            100e6
        );

        assertEq(
            vault.totalShares(),
            100e6
        );

        assertEq(
            vault.totalAssets(),
            200e6
        );


        // ========================================================
        // 5. Bob withdraws
        // ========================================================

        uint256 bobBefore =
            usdc.balanceOf(bob);


        vm.prank(bob);

        vault.withdraw();


        uint256 bobReceived =
            usdc.balanceOf(bob)
            - bobBefore;


        // Bob should also receive exactly $200.
        assertEq(
            bobReceived,
            200e6
        );


        // ========================================================
        // Final state
        // ========================================================

        assertEq(
            usdc.balanceOf(address(vault)),
            0
        );

        assertEq(
            protocol.totalAssets(),
            0
        );

        assertEq(
            vault.totalAssets(),
            0
        );

        assertEq(
            vault.shares(alice),
            0
        );

        assertEq(
            vault.shares(bob),
            0
        );

        assertEq(
            vault.totalShares(),
            0
        );


        emit log(
            "================================"
        );

        emit log(
            "TWO USER DONATION FIX: PASS"
        );

        emit log(
            "Alice received $200."
        );

        emit log(
            "Bob received $200."
        );

        emit log(
            "Donation value was shared correctly."
        );

        emit log(
            "================================"
        );
    }
}