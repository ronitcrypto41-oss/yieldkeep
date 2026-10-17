// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";


// ================================================================
// TEST-ONLY FIXED WITHDRAWAL VAULT
// ================================================================
//
// IMPORTANT:
// This is NOT production code.
//
// We are testing one idea:
//
//     Use idle Treasury assets FIRST.
//
//     Then use Aave/protocol only for the remainder.
//
// This allows direct donations to benefit existing shareholders
// without causing the withdrawal to ask the protocol for assets
// that are already sitting inside the Treasury.
// ================================================================

contract DonationFixVault {

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


        // Put intentional deposits into protocol.
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
    //
    // 1. Calculate user's share of total assets.
    //
    // 2. Check how much USDC is already idle in Treasury.
    //
    // 3. Use idle Treasury USDC first.
    //
    // 4. Ask protocol only for the remainder.
    //
    // 5. Send total amount to user.
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
        // Determine how much is already idle
        // --------------------------------------------------------

        uint256 idleAssets =
            asset.balanceOf(
                address(this)
            );


        // --------------------------------------------------------
        // If Treasury does not have enough,
        // withdraw only the missing amount from protocol.
        // --------------------------------------------------------

        if (idleAssets < amount) {

            uint256 needed =
                amount - idleAssets;

            protocol.withdraw(
                needed
            );
        }


        // --------------------------------------------------------
        // Treasury now has enough USDC.
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

contract DAOTreasuryYieldManagerV2DonationFixTest
    is Test
{

    MockUSDC public usdc;

    MockYieldProtocol public protocol;

    DonationFixVault public vault;


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
            new DonationFixVault(
                usdc,
                protocol
            );


        alice =
            makeAddr("alice");

        attacker =
            makeAddr("attacker");


        // Alice has $100.
        usdc.mint(
            alice,
            100e6
        );


        // Attacker has $100.
        usdc.mint(
            attacker,
            100e6
        );
    }


    function test_DonationNoLongerCausesWithdrawalRevert()
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
        // Initial state
        // ========================================================

        assertEq(
            vault.totalAssets(),
            100e6
        );

        assertEq(
            protocol.totalAssets(),
            100e6
        );


        // ========================================================
        // 2. Attacker donates $100 directly
        // ========================================================

        vm.prank(attacker);

        usdc.transfer(
            address(vault),
            100e6
        );


        // ========================================================
        // Now:
        //
        // Treasury = $100
        // Protocol = $100
        // Total    = $200
        // ========================================================

        assertEq(
            usdc.balanceOf(address(vault)),
            100e6
        );

        assertEq(
            protocol.totalAssets(),
            100e6
        );

        assertEq(
            vault.totalAssets(),
            200e6
        );


        // ========================================================
        // 3. Alice withdraws
        // ========================================================
        //
        // Alice owns 100% of shares.
        //
        // Her claim = $200.
        //
        // Fixed withdrawal should:
        //
        //     use $100 Treasury
        //     withdraw only $100 from protocol
        //     send $200 to Alice
        // ========================================================

        uint256 aliceBalanceBefore =
            usdc.balanceOf(alice);


        vm.prank(alice);

        vault.withdraw();


        uint256 aliceBalanceAfter =
            usdc.balanceOf(alice);


        // ========================================================
        // 4. Alice received the full $200
        // ========================================================

        assertEq(
            aliceBalanceAfter - aliceBalanceBefore,
            200e6
        );


        // ========================================================
        // 5. Everything is now empty
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
            "DONATION WITHDRAWAL FIX: PASS"
        );

        emit log(
            "Idle Treasury assets were used FIRST."
        );

        emit log(
            "Alice received the donation value."
        );

        emit log(
            "================================"
        );
    }
}