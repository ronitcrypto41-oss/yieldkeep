// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";


// ================================================================
// TEST-ONLY VAULT
// ================================================================

contract DonationLiquidityFailureVault {

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


    function totalAssets()
        public
        view
        returns (uint256)
    {
        return
            asset.balanceOf(address(this))
            + protocol.totalAssets();
    }


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

            sharesToMint = amount;

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
        // Ask protocol only for remainder
        // --------------------------------------------------------

        if (idleAssets < amount) {

            uint256 needed =
                amount - idleAssets;

            protocol.withdraw(
                needed
            );
        }


        // --------------------------------------------------------
        // Send complete claim
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

contract DAOTreasuryYieldManagerV2DonationLiquidityFailureTest
    is Test
{

    MockUSDC public usdc;

    MockYieldProtocol public protocol;

    DonationLiquidityFailureVault public vault;


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
            new DonationLiquidityFailureVault(
                usdc,
                protocol
            );


        alice =
            makeAddr("alice");

        bob =
            makeAddr("bob");

        attacker =
            makeAddr("attacker");


        usdc.mint(
            alice,
            100e6
        );

        usdc.mint(
            bob,
            100e6
        );

        usdc.mint(
            attacker,
            200e6
        );
    }


    function test_ProtocolLiquidityFailurePreservesShares()
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
        // Initial:
        //
        // Alice = 100 shares
        // Bob   = 100 shares
        //
        // Protocol accounting = $200
        // Treasury             = $0
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


        // ========================================================
        // 3. Attacker donates $200
        // ========================================================

        vm.prank(attacker);

        usdc.transfer(
            address(vault),
            200e6
        );


        // ========================================================
        // Now:
        //
        // Treasury = $200
        // Protocol = $200
        // Total    = $400
        //
        // Alice claim = $200
        // Bob claim   = $200
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
        //
        // Alice takes the entire $200 donation sitting in Treasury.
        //
        // Protocol remains at $200.
        // ========================================================

        vm.prank(alice);

        vault.withdraw();


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
            usdc.balanceOf(address(vault)),
            0
        );

        assertEq(
            protocol.totalAssets(),
            200e6
        );


        // ========================================================
        // 5. Simulate protocol liquidity failure
        // ========================================================
        //
        // IMPORTANT:
        //
        // We DO NOT reduce protocol.totalDeposited.
        //
        // Instead, we secretly remove $100 of the actual USDC
        // held by the protocol.
        //
        // Therefore:
        //
        // protocol.totalAssets() = $200
        //
        // but actual USDC balance = $100
        //
        // This simulates:
        //
        //     "Accounting says $200"
        //
        // while:
        //
        //     "Actual liquidity is only $100"
        // ========================================================

        vm.prank(address(protocol));

        usdc.transfer(
            attacker,
            100e6
        );


        // ========================================================
        // Verify our simulated failure
        // ========================================================

        assertEq(
            protocol.totalAssets(),
            200e6
        );

        assertEq(
            usdc.balanceOf(address(protocol)),
            100e6
        );


        // ========================================================
        // Bob still has 100 shares.
        //
        // Bob's claim is still $200 according to accounting.
        // ========================================================

        assertEq(
            vault.shares(bob),
            100e6
        );

        assertEq(
            vault.totalShares(),
            100e6
        );


        uint256 bobSharesBefore =
            vault.shares(bob);

        uint256 totalSharesBefore =
            vault.totalShares();

        uint256 bobBalanceBefore =
            usdc.balanceOf(bob);


        // ========================================================
        // 6. Bob tries to withdraw $200
        // ========================================================
        //
        // Treasury has $0.
        //
        // Protocol is asked for $200.
        //
        // Protocol only has $100 actual USDC.
        //
        // transfer() therefore reverts.
        //
        // Entire transaction must roll back.
        // ========================================================

        vm.prank(bob);

        vm.expectRevert();

        vault.withdraw();


        // ========================================================
        // 7. CRITICAL SAFETY CHECK
        // ========================================================
        //
        // Bob's shares MUST survive.
        // ========================================================

        assertEq(
            vault.shares(bob),
            bobSharesBefore
        );

        assertEq(
            vault.totalShares(),
            totalSharesBefore
        );

        assertEq(
            usdc.balanceOf(bob),
            bobBalanceBefore
        );


        // Protocol's actual liquidity remains $100.
        assertEq(
            usdc.balanceOf(address(protocol)),
            100e6
        );


        emit log(
            "================================"
        );

        emit log(
            "LIQUIDITY FAILURE TEST: PASS"
        );

        emit log(
            "Protocol could not provide full liquidity."
        );

        emit log(
            "Withdrawal reverted safely."
        );

        emit log(
            "Bob shares were preserved."
        );

        emit log(
            "Bob received no partial funds."
        );

        emit log(
            "================================"
        );
    }
}