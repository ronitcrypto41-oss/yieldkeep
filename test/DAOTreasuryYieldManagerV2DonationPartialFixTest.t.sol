// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";


// ================================================================
// TEST-ONLY VAULT
// ================================================================
//
// Same idea as our previous experiment:
//
//     1. Calculate user's full claim.
//     2. Use idle Treasury USDC FIRST.
//     3. Ask protocol only for the remainder.
//     4. Send the full claim to the user.
//
// NOT production code.
// ================================================================

contract DonationPartialFixVault {

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


        // Intentional deposits go into protocol.
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
        // Use Treasury-held assets FIRST
        // --------------------------------------------------------

        uint256 idleAssets =
            asset.balanceOf(
                address(this)
            );


        // --------------------------------------------------------
        // Only request the missing amount from protocol
        // --------------------------------------------------------

        if (idleAssets < amount) {

            uint256 needed =
                amount - idleAssets;

            protocol.withdraw(
                needed
            );
        }


        // --------------------------------------------------------
        // Send complete claim to user
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

contract DAOTreasuryYieldManagerV2DonationPartialFixTest
    is Test
{

    MockUSDC public usdc;

    MockYieldProtocol public protocol;

    DonationPartialFixVault public vault;


    address public alice;

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
            new DonationPartialFixVault(
                usdc,
                protocol
            );


        alice =
            makeAddr("alice");

        attacker =
            makeAddr("attacker");


        // Alice gets $100.
        usdc.mint(
            alice,
            100e6
        );


        // Attacker gets $50.
        usdc.mint(
            attacker,
            50e6
        );
    }


    function test_PartialDonationUsesIdleAssetsFirst()
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
        // Initial:
        //
        // Treasury = $0
        // Protocol = $100
        // Total    = $100
        // ========================================================

        assertEq(
            usdc.balanceOf(address(vault)),
            0
        );

        assertEq(
            protocol.totalAssets(),
            100e6
        );

        assertEq(
            vault.totalAssets(),
            100e6
        );


        // ========================================================
        // 2. Attacker donates $50
        // ========================================================

        vm.prank(attacker);

        usdc.transfer(
            address(vault),
            50e6
        );


        // ========================================================
        // Now:
        //
        // Treasury = $50
        // Protocol = $100
        // Total    = $150
        // ========================================================

        assertEq(
            usdc.balanceOf(address(vault)),
            50e6
        );

        assertEq(
            protocol.totalAssets(),
            100e6
        );

        assertEq(
            vault.totalAssets(),
            150e6
        );


        // ========================================================
        // 3. Alice withdraws
        // ========================================================
        //
        // Alice owns 100% of shares.
        //
        // Claim = $150.
        //
        // Fixed withdrawal:
        //
        //     $50 from Treasury
        //     $100 from protocol
        //     $150 to Alice
        // ========================================================

        uint256 aliceBalanceBefore =
            usdc.balanceOf(alice);


        vm.prank(alice);

        vault.withdraw();


        uint256 aliceBalanceAfter =
            usdc.balanceOf(alice);


        // ========================================================
        // 4. Alice receives full $150
        // ========================================================

        assertEq(
            aliceBalanceAfter - aliceBalanceBefore,
            150e6
        );


        // ========================================================
        // 5. Everything is empty
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
            vault.totalShares(),
            0
        );


        emit log(
            "================================"
        );

        emit log(
            "PARTIAL DONATION FIX: PASS"
        );

        emit log(
            "Treasury assets were used FIRST."
        );

        emit log(
            "Protocol supplied only the remainder."
        );

        emit log(
            "Alice received full donation value."
        );

        emit log(
            "================================"
        );
    }
}