// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";


contract DonationIdleOnlyVault {

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


    function deposit(uint256 amount)
        external
    {
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

        asset.transferFrom(
            msg.sender,
            address(this),
            amount
        );

        shares[msg.sender] += sharesToMint;
        totalShares += sharesToMint;

        asset.approve(
            address(protocol),
            amount
        );

        protocol.deposit(amount);
    }


    // ============================================================
    // IDLE-FIRST WITHDRAWAL
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

        uint256 amount =
            (userShares * totalAssets())
            / totalShares;


        // CEI
        shares[msg.sender] = 0;
        totalShares -= userShares;


        uint256 idleAssets =
            asset.balanceOf(address(this));


        // Only touch protocol if Treasury is insufficient.
        if (idleAssets < amount) {

            uint256 needed =
                amount - idleAssets;

            protocol.withdraw(needed);
        }


        asset.transfer(
            msg.sender,
            amount
        );
    }
}


contract DAOTreasuryYieldManagerV2DonationIdleOnlyTest
    is Test
{

    MockUSDC public usdc;
    MockYieldProtocol public protocol;
    DonationIdleOnlyVault public vault;

    address public alice;
    address public bob;


    function setUp()
        public
    {
        usdc = new MockUSDC();

        protocol = new MockYieldProtocol(usdc);

        vault =
            new DonationIdleOnlyVault(
                usdc,
                protocol
            );

        alice = makeAddr("alice");
        bob = makeAddr("bob");

        usdc.mint(alice, 100e6);
        usdc.mint(bob, 100e6);
    }


    function test_WithdrawalUsesTreasuryOnlyWhenEnoughIdleAssets()
        public
    {

        // ========================================================
        // Alice deposits $100
        // ========================================================

        vm.startPrank(alice);

        usdc.approve(
            address(vault),
            100e6
        );

        vault.deposit(100e6);

        vm.stopPrank();


        // ========================================================
        // Bob deposits $100
        // ========================================================

        vm.startPrank(bob);

        usdc.approve(
            address(vault),
            100e6
        );

        vault.deposit(100e6);

        vm.stopPrank();


        // ========================================================
        // Put $150 idle USDC directly into Treasury.
        //
        // We use Alice/Bob's remaining balances for this test.
        // ========================================================

        usdc.mint(
            address(vault),
            150e6
        );


        // ========================================================
        // State:
        //
        // Treasury = $150
        // Protocol = $200
        // Total    = $350
        //
        // Alice owns 50%.
        //
        // Alice claim = $175.
        //
        // OOPS:
        // Treasury has only $150.
        //
        // So this is NOT the idle-only case.
        // ========================================================

        // Remove $50 from protocol accounting by withdrawing it
        // directly so the final state becomes:
        //
        // Treasury = $150
        // Protocol = $100
        // Total    = $250

        protocol.withdraw(50e6);


        assertEq(
            usdc.balanceOf(address(vault)),
            150e6
        );

        assertEq(
            protocol.totalAssets(),
            150e6
        );

        // Move $50 from the protocol to the attacker/test sink.
        // The mock protocol already sent it to this test contract.
        // We now reduce protocol by another $50 using a direct
        // protocol withdrawal.
        protocol.withdraw(50e6);


        assertEq(
            protocol.totalAssets(),
            100e6
        );

        assertEq(
            vault.totalAssets(),
            250e6
        );


        // ========================================================
        // Alice owns 50%.
        //
        // Alice claim = $125.
        //
        // Treasury has $150.
        //
        // Therefore protocol should NOT be touched.
        // ========================================================

        uint256 protocolBefore =
            protocol.totalAssets();

        uint256 aliceBefore =
            usdc.balanceOf(alice);


        vm.prank(alice);

        vault.withdraw();


        uint256 aliceReceived =
            usdc.balanceOf(alice)
            - aliceBefore;


        // ========================================================
        // Alice receives $125.
        // ========================================================

        assertEq(
            aliceReceived,
            125e6
        );


        // ========================================================
        // Protocol remains exactly $100.
        // ========================================================

        assertEq(
            protocol.totalAssets(),
            protocolBefore
        );


        // ========================================================
        // Treasury now has:
        //
        // $150 - $125 = $25
        // ========================================================

        assertEq(
            usdc.balanceOf(address(vault)),
            25e6
        );


        assertEq(
            vault.totalAssets(),
            125e6
        );


        emit log(
            "================================"
        );

        emit log(
            "IDLE-ONLY WITHDRAWAL: PASS"
        );

        emit log(
            "Treasury had enough liquidity."
        );

        emit log(
            "Protocol was NOT touched."
        );

        emit log(
            "Alice received $125."
        );

        emit log(
            "================================"
        );
    }
}