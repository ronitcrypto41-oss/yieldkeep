// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


// ================================================================
// MOCK TOKEN
// ================================================================

contract DonationTestToken {

    string public name = "Donation Test USDC";
    string public symbol = "TUSDC";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;

    mapping(address => mapping(address => uint256))
        public allowance;


    function mint(
        address to,
        uint256 amount
    )
        external
    {
        balanceOf[to] += amount;
    }


    function approve(
        address spender,
        uint256 amount
    )
        external
        returns (bool)
    {
        allowance[msg.sender][spender] =
            amount;

        return true;
    }


    function transfer(
        address to,
        uint256 amount
    )
        external
        returns (bool)
    {
        require(
            balanceOf[msg.sender] >= amount,
            "Insufficient balance"
        );

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        return true;
    }


    function transferFrom(
        address from,
        address to,
        uint256 amount
    )
        external
        returns (bool)
    {
        uint256 allowed =
            allowance[from][msg.sender];

        require(
            allowed >= amount,
            "Insufficient allowance"
        );

        require(
            balanceOf[from] >= amount,
            "Insufficient balance"
        );

        allowance[from][msg.sender] =
            allowed - amount;

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        return true;
    }
}


// ================================================================
// TEST-ONLY MITIGATION VAULT
// ================================================================
//
// IMPORTANT:
//
// This is NOT production code.
//
// It demonstrates one possible accounting approach:
// only "accountedAssets" affect share pricing.
//
// Direct donations increase the token balance,
// but do NOT increase accountedAssets.
//
// We are testing the idea before changing production code.
// ================================================================

contract DonationMitigationVault {

    using SafeERC20 for IERC20;

    IERC20 public immutable asset;


    mapping(address => uint256)
        public shares;


    uint256 public totalShares;


    // ------------------------------------------------------------
    // Assets intentionally recognized by the vault
    // ------------------------------------------------------------

    uint256 public accountedAssets;


    constructor(
        IERC20 _asset
    )
    {
        asset = _asset;
    }


    // ============================================================
    // SHARE PRICE
    // ============================================================

    function shareValue()
        public
        view
        returns (uint256)
    {
        if (totalShares == 0) {
            return 1e6;
        }

        return
            (accountedAssets * 1e6)
            / totalShares;
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


        uint256 sharesToMint;


        if (totalShares == 0) {

            sharesToMint =
                amount;

        } else {

            sharesToMint =
                (amount * totalShares)
                / accountedAssets;
        }


        require(
            sharesToMint > 0,
            "Zero shares"
        );


        asset.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );


        shares[msg.sender] +=
            sharesToMint;


        totalShares +=
            sharesToMint;


        // --------------------------------------------------------
        // ONLY INTENTIONAL DEPOSITS ARE ACCOUNTED
        // --------------------------------------------------------

        accountedAssets +=
            amount;
    }


    // ============================================================
    // ACTUAL TOKEN BALANCE
    // ============================================================

    function actualAssets()
        public
        view
        returns (uint256)
    {
        return
            asset.balanceOf(
                address(this)
            );
    }
}


// ================================================================
// TEST
// ================================================================

contract DonationMitigationTest is Test {

    DonationTestToken public token;

    DonationMitigationVault public vault;


    address public alice;

    address public attacker;


    // ============================================================
    // SETUP
    // ============================================================

    function setUp()
        public
    {
        token =
            new DonationTestToken();

        vault =
            new DonationMitigationVault(
                IERC20(address(token))
            );


        alice =
            makeAddr("alice");

        attacker =
            makeAddr("attacker");


        token.mint(
            alice,
            100e6
        );

        token.mint(
            attacker,
            100e6
        );
    }


    // ============================================================
    // TEST:
    //
    // DIRECT DONATION MUST NOT CHANGE SHARE PRICE
    // ============================================================

    function test_DonationDoesNotChangeSharePrice()
        public
    {
        // --------------------------------------------------------
        // 1. Alice deposits $100
        // --------------------------------------------------------

        vm.startPrank(alice);

        token.approve(
            address(vault),
            100e6
        );

        vault.deposit(
            100e6
        );

        vm.stopPrank();


        // --------------------------------------------------------
        // BEFORE DONATION
        // --------------------------------------------------------

        uint256 sharePriceBefore =
            vault.shareValue();


        console2.log(
            "Share price BEFORE donation:",
            sharePriceBefore
        );

        console2.log(
            "Accounted assets BEFORE:",
            vault.accountedAssets()
        );

        console2.log(
            "Actual assets BEFORE:",
            vault.actualAssets()
        );


        // --------------------------------------------------------
        // Expected:
        //
        // $1 per share
        // --------------------------------------------------------

        assertEq(
            sharePriceBefore,
            1e6
        );


        // --------------------------------------------------------
        // 2. Attacker directly donates $100
        // --------------------------------------------------------

        vm.prank(attacker);

        token.transfer(
            address(vault),
            100e6
        );


        // --------------------------------------------------------
        // AFTER DONATION
        // --------------------------------------------------------

        uint256 sharePriceAfter =
            vault.shareValue();


        console2.log(
            "Share price AFTER donation:",
            sharePriceAfter
        );

        console2.log(
            "Accounted assets AFTER:",
            vault.accountedAssets()
        );

        console2.log(
            "Actual assets AFTER:",
            vault.actualAssets()
        );


        // --------------------------------------------------------
        // CRITICAL RESULT
        // --------------------------------------------------------
        //
        // Actual token balance:
        //
        //     $200
        //
        // Accounted assets:
        //
        //     $100
        //
        // Therefore share price remains:
        //
        //     $1
        // --------------------------------------------------------

        assertEq(
            vault.actualAssets(),
            200e6
        );


        assertEq(
            vault.accountedAssets(),
            100e6
        );


        assertEq(
            sharePriceAfter,
            1e6
        );


        // --------------------------------------------------------
        // Alice still owns 100 shares
        // --------------------------------------------------------

        assertEq(
            vault.shares(alice),
            100e6
        );


        assertEq(
            vault.totalShares(),
            100e6
        );


        console2.log(
            "================================"
        );

        console2.log(
            "MITIGATION TEST: PASS"
        );

        console2.log(
            "Donation did NOT change share price."
        );

        console2.log(
            "================================"
        );
    }
}