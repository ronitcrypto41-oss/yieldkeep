// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DAOTreasuryYieldManagerV3} from "../src/DAOTreasuryYieldManagerV3.sol";
import {IYieldProtocol} from "../src/interfaces/IYieldProtocol.sol";

/// Fake USDC with 6 decimals, anyone can mint (tests only).
contract TestUSDC is ERC20 {
    constructor() ERC20("Test USDC", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// Fake yield protocol (like Aave): holds the vault's USDC.
/// addYield() = the protocol earned interest. lose() = the protocol lost money.
/// It does NOT inherit IYieldProtocol on purpose, so it compiles whatever the real interface returns.
contract TestYield {
    TestUSDC public immutable usdc;
    constructor(TestUSDC _usdc) { usdc = _usdc; }

    function deposit(uint256 amount) external returns (uint256) {
        usdc.transferFrom(msg.sender, address(this), amount);
        return amount;
    }
    function withdraw(uint256 amount) external returns (uint256) {
        usdc.transfer(msg.sender, amount);
        return amount;
    }
    function totalAssets() external view returns (uint256) { return usdc.balanceOf(address(this)); }

    function addYield(uint256 amount) external { usdc.mint(address(this), amount); }
    function lose(uint256 amount) external { usdc.transfer(address(0xBAD), amount); }
}

contract V3Test is Test {
    uint256 constant USDC = 1e6;
    uint256 constant YEAR = 365 days;

    TestUSDC usdc;
    TestYield yieldp;
    DAOTreasuryYieldManagerV3 vault;

    address owner = makeAddr("owner");
    address feeSafe = makeAddr("feeSafe");
    address alice = makeAddr("alice"); // treasury A
    address bob = makeAddr("bob"); //     treasury B
    address carol = makeAddr("carol"); // treasury C

    function setUp() public {
        usdc = new TestUSDC();
        yieldp = new TestYield(usdc);
        vault = new DAOTreasuryYieldManagerV3(
            IERC20(address(usdc)),
            IYieldProtocol(address(yieldp)),
            feeSafe,
            owner,
            0
        );
        address[3] memory who = [alice, bob, carol];
        for (uint256 i = 0; i < 3; i++) {
            usdc.mint(who[i], 1_000_000 * USDC);
            vm.prank(who[i]);
            usdc.approve(address(vault), type(uint256).max);
        }
    }

    // ───────── helpers ─────────
    function _deposit(address who, uint256 amount) internal {
        vm.prank(who);
        vault.deposit(amount);
    }
    function _withdraw(address who) internal returns (uint256 received) {
        uint256 before = usdc.balanceOf(who);
        vm.prank(who);
        vault.withdraw();
        received = usdc.balanceOf(who) - before;
    }
    /// move idle USDC into the yield protocol, then the protocol earns `amount`
    function _earn(uint256 amount) internal {
        vault.harvest();
        yieldp.addYield(amount);
    }
    function _lose(uint256 amount) internal {
        vault.harvest();
        yieldp.lose(amount);
    }

    // ═════════ basics ═════════

    function test_FirstDepositLocksDeadSharesAndSetsDates() public {
        _deposit(alice, 1000 * USDC);
        assertEq(vault.shares(alice), 1000 * USDC - 1000);
        assertEq(vault.shares(address(0xdEaD)), 1000);
        assertEq(vault.totalShares(), 1000 * USDC);
        assertEq(vault.basis(alice), 1000 * USDC);
        assertEq(vault.nextFeeAt(alice), block.timestamp + YEAR);
    }

    function test_FirstDepositTooSmallReverts() public {
        vm.prank(alice);
        vm.expectRevert(bytes("First deposit too small"));
        vault.deposit(1000); // equals DEAD_SHARES, not above it
    }

    function test_DepositCapIsEnforced() public {
        vm.prank(owner);
        vault.setDepositCap(1500 * USDC);
        _deposit(alice, 1000 * USDC);
        vm.prank(bob);
        vm.expectRevert(bytes("Deposit cap"));
        vault.deposit(600 * USDC);
    }

    function test_PauseBlocksDepositsButNeverWithdrawals() public {
        _deposit(alice, 1000 * USDC);
        vm.prank(owner);
        vault.pause();
        vm.prank(bob);
        vm.expectRevert(); // paused
        vault.deposit(100 * USDC);
        uint256 got = _withdraw(alice); // still works
        assertApproxEqAbs(got, 1000 * USDC, 1000);
    }

    // ═════════ fee rules ═════════

    /// No profit = no fee. Alice gets her principal back (minus the tiny dead-share dust).
    function test_NoProfitNoFee() public {
        _deposit(alice, 1000 * USDC);
        vault.harvest();
        uint256 got = _withdraw(alice);
        assertApproxEqAbs(got, 1000 * USDC, 1000);
        assertEq(vault.totalFeesPaid(), 0);
        assertEq(vault.shares(feeSafe), 0);
    }

    /// 1000 in, +100 yield: fee is 10% of the 100 profit = 10. Alice keeps 1000 + 90 = 1090.
    function test_FeeIsTenPercentOfProfitOnly() public {
        _deposit(alice, 1000 * USDC);
        _earn(100 * USDC);
        uint256 got = _withdraw(alice);
        assertApproxEqAbs(got, 1090 * USDC, 5000);
        assertApproxEqAbs(vault.totalFeesPaid(), 10 * USDC, 5000);
        // the fee wallet holds the fee as shares worth ~10 USDC
        assertApproxEqAbs(vault.positionValue(feeSafe), 10 * USDC, 5000);
    }

    /// A treasury that joins AFTER profit was made must not pay fee on that older profit.
    function test_LateJoinerPaysNothingOnEarlierProfit() public {
        _deposit(alice, 1000 * USDC);
        _earn(100 * USDC); // vault now 1100, price is up 10%
        _deposit(bob, 1000 * USDC); // bob joins late
        uint256 bobGot = _withdraw(bob); // leaves immediately
        assertApproxEqAbs(bobGot, 1000 * USDC, 2);
        assertEq(vault.totalFeesPaid(), 0); // nobody paid yet
        assertEq(vault.shares(feeSafe), 0);

        // alice still pays 10% of HER profit only (about 10)
        uint256 aliceGot = _withdraw(alice);
        assertApproxEqAbs(aliceGot, 1090 * USDC, 5000);
        assertApproxEqAbs(vault.totalFeesPaid(), 10 * USDC, 5000);
    }

    /// A late joiner who stays pays only on profit made AFTER joining.
    function test_LateJoinerPaysOnlyOnLaterProfit() public {
        _deposit(alice, 1000 * USDC);
        _earn(100 * USDC);
        _deposit(bob, 1100 * USDC); // joins at price 1.10
        // vault is now 2200: alice owns 1100, bob owns 1100. Earn 200 more: each gains 100.
        _earn(200 * USDC);
        // bob: cost 1100, value 1200, profit 100 -> fee 10 -> gets 1190
        uint256 bobGot = _withdraw(bob);
        assertApproxEqAbs(bobGot, 1190 * USDC, 10_000);
        // alice: cost 1000, value 1200, profit 200 -> fee 20 -> gets 1180
        uint256 aliceGot = _withdraw(alice);
        assertApproxEqAbs(aliceGot, 1180 * USDC, 20_000);
        assertApproxEqAbs(vault.totalFeesPaid(), 30 * USDC, 30_000);
    }

    /// Loss = no fee, and she gets back what is left.
    function test_LossNeverCreatesFee() public {
        _deposit(alice, 1000 * USDC);
        _lose(200 * USDC);
        uint256 got = _withdraw(alice);
        assertApproxEqAbs(got, 800 * USDC, 1000);
        assertEq(vault.totalFeesPaid(), 0);
        assertEq(vault.shares(feeSafe), 0);
    }

    /// High-water mark: profit is charged, then a loss, then a recovery to the same level
    /// must NOT be charged a second time.
    function test_NoDoubleChargeAfterLossAndRecovery() public {
        _deposit(alice, 1000 * USDC);
        _earn(200 * USDC); // value ~1200
        vm.warp(block.timestamp + YEAR);
        vault.settle(alice); // charges ~10% of ~200 = ~20
        uint256 feesAfterFirst = vault.totalFeesPaid();
        assertApproxEqAbs(feesAfterFirst, 20 * USDC, 10_000);

        _lose(300 * USDC); // vault falls to ~900
        vm.warp(block.timestamp + YEAR);
        vault.settle(alice); // below the mark: nothing
        assertEq(vault.totalFeesPaid(), feesAfterFirst);

        yieldp.addYield(300 * USDC); // back to ~1200: same as when the fee was charged
        vm.warp(block.timestamp + YEAR);
        vault.settle(alice); // no NEW profit above the mark: no new fee
        assertApproxEqAbs(vault.totalFeesPaid(), feesAfterFirst, 10);
    }

    // ═════════ yearly date per treasury ═════════

    function test_SettleOnlyAfterTheTreasurysOwnAnniversary() public {
        _deposit(alice, 1000 * USDC);
        vm.warp(block.timestamp + 100 days);
        _deposit(bob, 1000 * USDC); // bob's year starts 100 days later
        _earn(200 * USDC);

        uint256 aliceDue = vault.nextFeeAt(alice);
        uint256 bobDue = vault.nextFeeAt(bob);
        assertEq(bobDue - aliceDue, 100 days);

        vm.warp(aliceDue - 1);
        vm.expectRevert(bytes("Not due yet"));
        vault.settle(alice);

        vm.warp(aliceDue);
        vault.settle(alice); // alice is due
        assertGt(vault.shares(feeSafe), 0);
        assertEq(vault.nextFeeAt(alice), aliceDue + YEAR);

        vm.expectRevert(bytes("Not due yet")); // bob is NOT due yet
        vault.settle(bob);
    }

    function test_SettleSkipsMissedYearsButChargesOnce() public {
        _deposit(alice, 1000 * USDC);
        _earn(100 * USDC);
        uint256 due = vault.nextFeeAt(alice);
        vm.warp(due + 2 * YEAR + 5 days); // nobody called settle for 2+ years
        vault.settle(alice);
        assertApproxEqAbs(vault.totalFeesPaid(), 10 * USDC, 5000); // one fee, not three
        // next date jumps to the first anniversary that is still in the future (due + 2 years)
assertEq(vault.nextFeeAt(alice), due + 3 * YEAR);    }

    // ═════════ several treasuries ═════════

    function test_TreasuriesAreChargedIndependently() public {
        _deposit(alice, 1000 * USDC);
        _deposit(bob, 1000 * USDC);
        _deposit(carol, 1000 * USDC);
        _earn(300 * USDC); // +10% on 3000

        uint256 a = _withdraw(alice); // alice pays fee, bob and carol have not paid yet
        assertApproxEqAbs(a, 1090 * USDC, 5000);
        assertEq(vault.basis(bob), 1000 * USDC); // bob untouched
        assertEq(vault.shares(feeSafe) > 0, true);

        uint256 b = _withdraw(bob);
        uint256 c = _withdraw(carol);
        assertApproxEqAbs(b, 1090 * USDC, 5000);
        assertApproxEqAbs(c, 1090 * USDC, 5000);
        // total fee ~ 10% of the 300 profit
        assertApproxEqAbs(vault.totalFeesPaid(), 30 * USDC, 20_000);
    }

    function test_DepositNeverCreatesFee() public {
        _deposit(alice, 1000 * USDC);
        _earn(100 * USDC);
        _deposit(alice, 500 * USDC); // top-up while in profit
        assertEq(vault.totalFeesPaid(), 0);
        assertEq(vault.shares(feeSafe), 0);
        assertEq(vault.basis(alice), 1500 * USDC);
        uint256 got = _withdraw(alice);
        // profit is still only ~100 -> fee ~10, NOT 10% of the 500 top-up
        assertApproxEqAbs(vault.totalFeesPaid(), 10 * USDC, 5000);
        assertApproxEqAbs(got, 1590 * USDC, 5000);
    }

    // ═════════ the fee wallet ═════════

    function test_FeeWalletIsNeverChargedAndCanWithdraw() public {
        _deposit(alice, 1000 * USDC);
        _earn(100 * USDC);
        _withdraw(alice);
        uint256 feesBefore = vault.totalFeesPaid();
        (, , , uint256 feeDue, , ) = vault.feeInfo(feeSafe);
        assertEq(feeDue, 0);

        uint256 got = _withdraw(feeSafe);
        assertApproxEqAbs(got, 10 * USDC, 5000); // gets its whole fee, nothing taken from it
        assertEq(vault.totalFeesPaid(), feesBefore);
    }

    /// FINDING (documents current behavior): after setFeeRecipient, the OLD wallet's accumulated fee
    /// shares have basis 0, so when the old wallet withdraws it is charged 10% (paid to the new wallet).
    /// Suggested fix is in the report: set basis[old] = positionValue(old) inside setFeeRecipient.
    function test_Finding_OldFeeWalletIsChargedAfterRecipientChange() public {
        _deposit(alice, 1000 * USDC);
        _earn(100 * USDC);
        _withdraw(alice); // ~10 USDC of fee shares now sit with feeSafe

        address newSafe = makeAddr("newFeeSafe");
        vm.prank(owner);
        vault.setFeeRecipient(newSafe);

        uint256 got = _withdraw(feeSafe); // old fee wallet cashes out
        assertLt(got, 9.5e6); // it lost ~10% of its own fee
        assertGt(vault.shares(newSafe), 0); // and that went to the new wallet
    }

    // ═════════ edge: protocol lost everything ═════════

    /// FINDING (documents current behavior): if the yield protocol loses ALL funds and someone deposits
    /// afterwards, the new deposit is diluted by the old (worthless) shares.
    function test_Finding_DepositAfterTotalLossIsDiluted() public {
        _deposit(alice, 1000 * USDC);
        _lose(1000 * USDC); // vault now has 0 assets, old shares still exist
        assertEq(vault.totalAssets(), 0);

        _deposit(bob, 1000 * USDC);
        uint256 value = vault.positionValue(bob);
        assertLt(value, 600 * USDC); // bob should own ~100%, but only owns about half
    }
}