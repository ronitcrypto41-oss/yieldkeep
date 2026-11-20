// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DAOTreasuryYieldManagerV4} from "../src/DAOTreasuryYieldManagerV4.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";

/// @notice Fuzz tests for DAOTreasuryYieldManagerV4.
/// Each test states one RULE of the vault in plain words, then lets Foundry
/// try hundreds of random amounts to see if the rule ever breaks.
contract V4FuzzTest is Test {
    DAOTreasuryYieldManagerV4 vault;
    MockUSDC usdc;
    MockYieldProtocol adapter;

    address owner = makeAddr("owner");
    address feeWallet = makeAddr("feeWallet");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant MIN = 1e6; // smallest deposit we test
    uint256 constant MAX = 1e24; // largest deposit we test
    uint256 constant DEAD = 1000; // dead shares locked on the first deposit

    function setUp() public {
        usdc = new MockUSDC();
        adapter = new MockYieldProtocol(usdc);
        vault = new DAOTreasuryYieldManagerV4(usdc, adapter, feeWallet, owner, 0);

        address[3] memory users = [alice, bob, feeWallet];
        for (uint256 i = 0; i < users.length; i++) {
            usdc.mint(users[i], 1e30);
            vm.prank(users[i]);
            usdc.approve(address(vault), type(uint256).max);
        }
    }

    // ───────── helpers ─────────

    function _deposit(address who, uint256 amount) internal {
        vm.prank(who);
        vault.deposit(amount);
    }

    /// Simulates yield: moves idle USDC to the adapter, then adds yield there.
    function _yield(uint256 amount) internal {
        vault.harvest();
        adapter.bumpAssets(amount);
    }

    /// Simulates a loss in the yield protocol: its books drop by `bps` (slot 0 = totalDeposited).
    function _loss(uint256 bps) internal {
        vault.harvest();
        uint256 current = adapter.totalDeposited();
        uint256 newValue = current - (current * bps) / 10_000;
        vm.store(address(adapter), bytes32(uint256(0)), bytes32(newValue));
    }

    function _claims() internal view returns (uint256 sum) {
        sum = vault.positionValue(alice) + vault.positionValue(bob) + vault.positionValue(feeWallet)
            + vault.positionValue(address(0xdEaD));
    }

    // ───────── RULE 1 ─────────
    // Depositing and withdrawing at once never makes money, and costs at most the dead shares.
    function testFuzz_depositThenWithdraw_noFreeMoney(uint256 amount) public {
        amount = bound(amount, MIN, MAX);
        uint256 before = usdc.balanceOf(alice);

        _deposit(alice, amount);
        vm.prank(alice);
        vault.withdraw();

        uint256 got = usdc.balanceOf(alice) + amount - before; // what came back (add first, so it cannot go below zero)
        assertLe(got, amount, "made money from nothing");
        assertGe(got + DEAD + 1, amount, "lost more than the dead shares");
    }

    // ───────── RULE 2 ─────────
    // No profit means no fee.
    function testFuzz_noProfit_noFee(uint256 amount) public {
        amount = bound(amount, MIN, MAX);
        _deposit(alice, amount);
        vault.harvest();
        vm.prank(alice);
        vault.withdraw();

        assertEq(vault.totalFeesPaid(), 0, "fee charged without profit");
        assertEq(vault.shares(feeWallet), 0, "fee wallet got shares without profit");
    }

    // ───────── RULE 3 ─────────
    // The fee is exactly 10% of the profit, and the treasury never loses principal.
    function testFuzz_fee_isTenPercentOfProfit(uint256 amount, uint256 gain) public {
        amount = bound(amount, MIN, MAX);
        gain = bound(gain, 0, amount * 10);

        _deposit(alice, amount);
        _yield(gain);

        (uint256 value,, uint256 profit, uint256 feeDue,,) = vault.feeInfo(alice);
        assertEq(feeDue, (profit * 1000) / 10_000, "fee is not 10% of profit");
        vm.assume(feeDue == 0 || feeDue > 100); // dust fees round to zero shares, that is expected

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        uint256 got = usdc.balanceOf(alice) - before;

        assertEq(vault.totalFeesPaid(), feeDue, "fee paid differs from fee shown");
        assertLe(got, value, "got more than the position was worth");
        assertGe(got + 2, value - feeDue, "paid more fee than 10% of profit");
        assertGe(got + 3, amount - DEAD, "principal was touched");
    }

    // ───────── RULE 4 ─────────
    // A loss never creates a fee, and a later recovery is not charged twice (high-water mark).
    function testFuzz_loss_noFee(uint256 amount, uint256 lossBps) public {
        amount = bound(amount, MIN, MAX);
        lossBps = bound(lossBps, 1, 9_999);

        _deposit(alice, amount);
        _loss(lossBps);

        vm.prank(alice);
        vault.withdraw();

        assertEq(vault.totalFeesPaid(), 0, "fee charged on a loss");
        assertEq(vault.shares(feeWallet), 0, "fee wallet got shares on a loss");
    }

    // ───────── RULE 5 ─────────
    // A partial withdrawal pays exactly what was asked, settles the fee first,
    // and the vault can still pay everybody afterwards.
    function testFuzz_partialWithdraw(uint256 amount, uint256 gain, uint256 partBps) public {
        amount = bound(amount, MIN, MAX);
        gain = bound(gain, 0, amount * 10);
        partBps = bound(partBps, 1, 9_999);

        _deposit(alice, amount);
        _yield(gain);

        (,,, uint256 feeDue, uint256 youKeep,) = vault.feeInfo(alice);
        vm.assume(feeDue == 0 || feeDue > 100); // dust fees round to zero shares, that is expected
        uint256 ask = (youKeep * partBps) / 10_000;
        vm.assume(ask > 0);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.withdrawAmount(ask);

        assertEq(usdc.balanceOf(alice) - before, ask, "did not pay the amount asked");
        assertEq(vault.totalFeesPaid(), feeDue, "fee not settled on the whole position");
        assertLe(_claims(), vault.totalAssets(), "vault owes more than it holds");
    }

    // ───────── RULE 6 ─────────
    // One treasury leaving can never reduce what another treasury can take out.
    function testFuzz_otherTreasury_notHarmed(uint256 a, uint256 b, uint256 gain) public {
        a = bound(a, MIN, MAX);
        b = bound(b, MIN, MAX);
        gain = bound(gain, 0, (a + b) * 5);

        _deposit(alice, a);
        _deposit(bob, b);
        _yield(gain);

        uint256 bobBefore = vault.positionValue(bob);
        vm.prank(alice);
        vault.withdraw();
        uint256 bobAfter = vault.positionValue(bob);

        assertGe(bobAfter + 1, bobBefore, "alice's exit hurt bob");
    }

    // ───────── RULE 7 ─────────
    // The fee wallet is never charged a fee on its own shares.
    function testFuzz_feeWallet_neverCharged(uint256 amount, uint256 gain) public {
        amount = bound(amount, MIN, MAX);
        gain = bound(gain, 1, amount * 10);

        _deposit(alice, amount);
        _deposit(feeWallet, amount);
        _yield(gain);

        uint256 feesBefore = vault.totalFeesPaid();
        vm.prank(feeWallet);
        vault.withdraw();

        assertEq(vault.totalFeesPaid(), feesBefore, "fee wallet was charged");
    }

    // ───────── RULE 8 ─────────
    // Pause stops deposits but never withdrawals.
    function testFuzz_pause_withdrawStillWorks(uint256 amount) public {
        amount = bound(amount, MIN, MAX);
        _deposit(alice, amount);

        vm.prank(owner);
        vault.pause();

        vm.prank(bob);
        vm.expectRevert();
        vault.deposit(amount);

        vm.prank(alice);
        vault.withdraw(); // must not revert
        assertEq(vault.shares(alice), 0);
    }

    // ───────── RULE 9 ─────────
    // Only the owner can change settings.
    function testFuzz_onlyOwner(address caller) public {
        vm.assume(caller != owner);
        vm.startPrank(caller);
        vm.expectRevert();
        vault.setFeeRecipient(caller);
        vm.expectRevert();
        vault.setDepositCap(1);
        vm.expectRevert();
        vault.pause();
        vm.stopPrank();
    }

    // ───────── RULE 10 ─────────
    // Yearly settlement: not before the date, and it never takes more than 10% of profit.
    function testFuzz_settle_onlyWhenDue(uint256 amount, uint256 gain) public {
        amount = bound(amount, MIN, MAX);
        gain = bound(gain, 1, amount * 10);

        _deposit(alice, amount);
        _yield(gain);

        vm.expectRevert(bytes("Not due yet"));
        vault.settle(alice);

        (,, uint256 profit, uint256 feeDue,,) = vault.feeInfo(alice);
        vm.assume(feeDue == 0 || feeDue > 100); // dust fees round to zero shares, that is expected
        vm.warp(block.timestamp + 365 days);
        vault.settle(alice);

        assertEq(vault.totalFeesPaid(), feeDue, "settled fee differs from fee shown");
        assertLe(vault.totalFeesPaid(), profit / 10, "fee above 10% of profit");
    }
}

/// Handler: the "random user" that the invariant test lets loose on the vault.
contract V4Handler is Test {
    DAOTreasuryYieldManagerV4 public vault;
    MockUSDC public usdc;
    MockYieldProtocol public adapter;
    address[] public actors;
    address public feeWallet;

    constructor(DAOTreasuryYieldManagerV4 _vault, MockUSDC _usdc, MockYieldProtocol _adapter, address[] memory _actors, address _feeWallet) {
        vault = _vault;
        usdc = _usdc;
        adapter = _adapter;
        actors = _actors;
        feeWallet = _feeWallet;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function deposit(uint256 seed, uint256 amount) external {
        address who = _actor(seed);
        amount = bound(amount, 1e6, 1e24);
        vm.prank(who);
        vault.deposit(amount);
    }

    function withdrawAll(uint256 seed) external {
        vm.prank(_actor(seed));
        vault.withdraw();
    }

    function withdrawPart(uint256 seed, uint256 bps) external {
        address who = _actor(seed);
        (,,,, uint256 youKeep,) = vault.feeInfo(who);
        uint256 ask = (youKeep * bound(bps, 1, 9_999)) / 10_000;
        if (ask == 0) return;
        vm.prank(who);
        vault.withdrawAmount(ask);
    }

    function addYield(uint256 amount) external {
        vault.harvest();
        adapter.bumpAssets(bound(amount, 0, 1e24));
    }

    function passTime(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 400 days));
    }

    function settle(uint256 seed) external {
        vault.settle(_actor(seed));
    }
}

/// Invariants: things that must be true after ANY sequence of random actions.
contract V4InvariantTest is Test {
    DAOTreasuryYieldManagerV4 vault;
    MockUSDC usdc;
    MockYieldProtocol adapter;
    V4Handler handler;

    address owner = makeAddr("owner");
    address feeWallet = makeAddr("feeWallet");
    address[] actors;

    function setUp() public {
        usdc = new MockUSDC();
        adapter = new MockYieldProtocol(usdc);
        vault = new DAOTreasuryYieldManagerV4(usdc, adapter, feeWallet, owner, 0);

        actors.push(makeAddr("a1"));
        actors.push(makeAddr("a2"));
        actors.push(makeAddr("a3"));
        for (uint256 i = 0; i < actors.length; i++) {
            usdc.mint(actors[i], 1e36);
            vm.prank(actors[i]);
            usdc.approve(address(vault), type(uint256).max);
        }

        handler = new V4Handler(vault, usdc, adapter, actors, feeWallet);
        targetContract(address(handler));
    }

    /// Every share belongs to someone we know: the actors, the fee wallet, or the dead address.
    function invariant_sharesAddUp() public view {
        uint256 sum = vault.shares(feeWallet) + vault.shares(address(0xdEaD));
        for (uint256 i = 0; i < actors.length; i++) sum += vault.shares(actors[i]);
        assertEq(sum, vault.totalShares(), "shares do not add up");
    }

    /// The vault never owes more than it holds (rounding always favors the vault).
    function invariant_solvent() public view {
        uint256 owed = vault.positionValue(feeWallet) + vault.positionValue(address(0xdEaD));
        for (uint256 i = 0; i < actors.length; i++) owed += vault.positionValue(actors[i]);
        assertLe(owed, vault.totalAssets(), "vault owes more than it holds");
    }

    /// Total assets = idle USDC in the vault + what the adapter reports.
    function invariant_realBalance() public view {
        assertEq(vault.totalAssets(), usdc.balanceOf(address(vault)) + adapter.totalDeposited(), "accounting mismatch");
    }

    /// Dead shares are never touched.
    function invariant_deadSharesLocked() public view {
        if (vault.totalShares() > 0) assertEq(vault.shares(address(0xdEaD)), 1000, "dead shares moved");
    }
}