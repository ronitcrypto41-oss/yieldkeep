// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockAavePool} from "../src/mocks/MockAavePool.sol";
import {MockAToken} from "../src/mocks/MockAToken.sol";
import {AaveYieldAdapter} from "../src/adapters/AaveYieldAdapter.sol";

contract MockTreasury {
    IERC20 public immutable asset;
    AaveYieldAdapter public immutable adapter;

    constructor(
        IERC20 _asset,
        AaveYieldAdapter _adapter
    ) {
        asset = _asset;
        adapter = _adapter;
    }

    function deposit(
        uint256 amount
    ) external {
        asset.approve(
            address(adapter),
            amount
        );

        adapter.deposit(amount);
    }

    function withdraw(
        uint256 amount
    ) external {
        adapter.withdraw(amount);
    }
}

contract AaveYieldAdapterTest is Test {
    MockUSDC public usdc;
    MockAToken public aToken;
    MockAavePool public pool;
    AaveYieldAdapter public adapter;
    MockTreasury public treasury;

    address public alice;
    address public attacker;

    function setUp() public {
        usdc = new MockUSDC();

        aToken = new MockAToken();

        pool = new MockAavePool(
            usdc,
            aToken
        );

        adapter = new AaveYieldAdapter(
            usdc,
            pool,
            aToken
        );

        treasury = new MockTreasury(
            usdc,
            adapter
        );

        adapter.setTreasury(
            address(treasury)
        );

        alice = makeAddr("alice");
        attacker = makeAddr("attacker");

        usdc.mint(
            address(treasury),
            1000
        );

        usdc.mint(
            alice,
            1000
        );

        usdc.mint(
            attacker,
            1000
        );

        usdc.mint(
            address(pool),
            10000
        );
    }

    function test_Deposit() public {
        treasury.deposit(100);

        assertEq(
            aToken.balanceOf(address(adapter)),
            100
        );

        assertEq(
            adapter.totalAssets(),
            100
        );

        assertEq(
            usdc.balanceOf(address(adapter)),
            0
        );

        assertEq(
            usdc.balanceOf(address(treasury)),
            900
        );
    }

    function test_Withdraw() public {
        treasury.deposit(100);

        uint256 beforeBalance =
            usdc.balanceOf(address(treasury));

        treasury.withdraw(100);

        assertEq(
            aToken.balanceOf(address(adapter)),
            0
        );

        assertEq(
            adapter.totalAssets(),
            0
        );

        assertEq(
            usdc.balanceOf(address(treasury)),
            beforeBalance + 100
        );

        assertEq(
            usdc.balanceOf(address(adapter)),
            0
        );
    }

    function test_AdapterPositionBelongsToTreasurySystem()
        public
    {
        treasury.deposit(300);

        assertEq(
            adapter.totalAssets(),
            300
        );

        assertEq(
            aToken.balanceOf(address(adapter)),
            300
        );

        assertEq(
            adapter.totalAssets(),
            300
        );
    }

    function test_OnlyTreasuryCanDeposit() public {
        vm.startPrank(alice);

        usdc.approve(
            address(adapter),
            100
        );

        vm.expectRevert("Only treasury");

        adapter.deposit(100);

        vm.stopPrank();
    }

    function test_OnlyTreasuryCanWithdraw() public {
        treasury.deposit(100);

        vm.prank(attacker);

        vm.expectRevert("Only treasury");

        adapter.withdraw(100);

        assertEq(
            adapter.totalAssets(),
            100
        );
    }

    function test_WithdrawTooMuchReverts() public {
        treasury.deposit(100);

        vm.expectRevert("Insufficient deposit");

        treasury.withdraw(101);
    }

    function test_ZeroDepositReverts() public {
        vm.expectRevert("Zero deposit");

        treasury.deposit(0);
    }

    function test_TreasuryCanOnlyBeSetOnce() public {
        address anotherTreasury =
            makeAddr("anotherTreasury");

        vm.expectRevert("Treasury already set");

        adapter.setTreasury(
            anotherTreasury
        );
    }

    function test_YieldIncreasesAdapterPosition()
        public
    {
        treasury.deposit(100);

        assertEq(
            adapter.totalAssets(),
            100
        );

        aToken.addYield(
            address(adapter),
            5
        );

        assertEq(
            adapter.totalAssets(),
            105
        );

        assertEq(
            aToken.balanceOf(address(adapter)),
            105
        );
    }

    function test_WithdrawRevertsIfProtocolReturnsLess()
        public
    {
        treasury.deposit(100);

        uint256 treasuryBalanceBefore =
            usdc.balanceOf(address(treasury));

        uint256 adapterAssetsBefore =
            adapter.totalAssets();

        pool.setWithdrawReturnAmount(99);

        vm.expectRevert(
            "Incorrect withdrawal"
        );

        treasury.withdraw(100);

        assertEq(
            usdc.balanceOf(address(treasury)),
            treasuryBalanceBefore
        );

        assertEq(
            adapter.totalAssets(),
            adapterAssetsBefore
        );

        assertEq(
            aToken.balanceOf(address(adapter)),
            100
        );
    }

    // =========================
    // PAUSE SECURITY TESTS
    // =========================

    function test_DeployerCanPause() public {
        adapter.pause();

        assertTrue(
            adapter.paused()
        );
    }

    function test_DepositRevertsWhenPaused() public {
        adapter.pause();

        vm.expectRevert(
            abi.encodeWithSignature("EnforcedPause()")
        );

        treasury.deposit(100);
    }

    function test_WithdrawRevertsWhenPaused() public {
        treasury.deposit(100);

        adapter.pause();

        vm.expectRevert(
            abi.encodeWithSignature("EnforcedPause()")
        );

        treasury.withdraw(100);
    }

    function test_NonDeployerCannotPause() public {
        vm.prank(alice);

        vm.expectRevert("Only deployer");

        adapter.pause();
    }

    function test_NonDeployerCannotUnpause() public {
        adapter.pause();

        vm.prank(alice);

        vm.expectRevert("Only deployer");

        adapter.unpause();

        assertTrue(
            adapter.paused()
        );
    }
}