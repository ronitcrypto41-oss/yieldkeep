// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IYieldProtocol} from "./interfaces/IYieldProtocol.sol";

/// @title DAOTreasuryYieldManagerV4
/// @notice Non-custodial USDC treasury vault with a PER-TREASURY 10% performance fee.
///
/// WHAT IS NEW IN V4 (compared with V3)
///  1. Changing the fee wallet no longer charges the OLD fee wallet a fee on the fee shares it
///     already holds (setFeeRecipient marks them as already paid for).
///  2. If the yield protocol has lost everything (vault has 0 assets but shares still exist),
///     new deposits are blocked ("Vault has no assets"), so nobody is diluted by worthless shares.
///  3. withdrawAmount(amount): take out PART of a position. withdraw() still takes everything.
///     A partial withdrawal first settles the fee on the whole position (10% of the open profit),
///     then pays out the amount asked, and the remaining position keeps a proportional basis.
///
/// FEE RULES
///  - The fee is 10% of each treasury's PROFIT only. Principal is never charged.
///  - Profit is measured per treasury against its own "basis": what it deposited, plus gains
///    that were already charged. A loss never creates a fee, and a later recovery is not
///    charged twice (high-water mark).
///  - The fee is settled (a) on each treasury's own anniversary: 365 days after its first
///    deposit, then every 365 days, and (b) always when that treasury withdraws.
///  - The fee is paid in vault shares moved to `feeRecipient`, so no USDC has to leave the
///    yield protocol at settlement. `feeRecipient` can redeem them with withdraw() like anyone
///    else, and is itself never charged a fee.
///  - Deposits never create a fee, whenever they happen.
contract DAOTreasuryYieldManagerV4 is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IYieldProtocol public immutable protocol;

    mapping(address => uint256) public shares;
    uint256 public totalShares;

    // ─── Fee state ─────────────────────────────────────────────
    uint256 public constant FEE_BPS = 1000; // 10%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant FEE_PERIOD = 365 days;
    uint256 public constant DEAD_SHARES = 1000; // locked on first deposit (inflation-attack guard)
    address private constant DEAD = address(0xdEaD);

    address public feeRecipient;
    uint256 public depositCap; // max totalAssets after a deposit; 0 = no cap

    mapping(address => uint256) public basis; // USDC value already "paid for" (cost + charged gains)
    mapping(address => uint256) public nextFeeAt; // timestamp of the next yearly settlement
    uint256 public totalFeesPaid; // lifetime fees, in USDC value, for transparency

    event Deposit(address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdraw(address indexed user, uint256 sharesBurned, uint256 amountReturned);
    /// feePaid is always 0 here: fees are no longer taken at harvest (kept so the old event shape still works)
    event Harvest(address indexed caller, uint256 amountDeployed, uint256 feePaid);
    event FeeSettled(address indexed user, uint256 profit, uint256 feeAssets, uint256 feeShares, uint256 newBasis);
    event FeeRecipientUpdated(address indexed newRecipient);
    event DepositCapUpdated(uint256 newCap);

    constructor(
        IERC20 _asset,
        IYieldProtocol _protocol,
        address _feeRecipient,
        address _owner,
        uint256 _depositCap
    ) Ownable(_owner) {
        require(address(_asset) != address(0), "Asset is zero");
        require(address(_protocol) != address(0), "Protocol is zero");
        require(_feeRecipient != address(0), "Fee recipient zero");
        asset = _asset;
        protocol = _protocol;
        feeRecipient = _feeRecipient;
        depositCap = _depositCap;
    }

    // ═══ ADMIN (owner = your Safe multisig) ═══

    function setFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Zero address");
        address old = feeRecipient;
        if (old != _newRecipient && shares[old] > 0) {
            // the old fee wallet's shares are fees that were already charged: never charge them again
            basis[old] = positionValue(old);
            if (nextFeeAt[old] == 0) nextFeeAt[old] = block.timestamp + FEE_PERIOD;
        }
        feeRecipient = _newRecipient;
        emit FeeRecipientUpdated(_newRecipient);
    }

    function setDepositCap(uint256 _cap) external onlyOwner {
        depositCap = _cap;
        emit DepositCapUpdated(_cap);
    }

    /// @notice Pauses NEW deposits only. Withdrawals can never be paused here.
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ═══ VIEWS ═══

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this)) + protocol.totalAssets();
    }

    function idleAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function sharePrice() external view returns (uint256) {
        if (totalShares == 0) return 1e6;
        return (totalAssets() * 1e6) / totalShares;
    }

    function convertToAssets(uint256 shareAmount) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shareAmount * totalAssets()) / totalShares;
    }

    function convertToShares(uint256 assetAmount) external view returns (uint256) {
        uint256 assets = totalAssets();
        if (totalShares == 0 || assets == 0) return assetAmount;
        return (assetAmount * totalShares) / assets;
    }

    /// @notice Current USDC value of a treasury's position, before any unsettled fee.
    function positionValue(address user) public view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shares[user] * totalAssets()) / totalShares;
    }

    /// @notice Everything a dashboard needs about one treasury's fee.
    /// @return value      current position value (before the fee)
    /// @return costBasis  amount already paid for (deposits + charged gains)
    /// @return profit     profit not yet charged
    /// @return feeDue     10% of that profit, in USDC
    /// @return youKeep    value after the fee
    /// @return nextSettleAt next yearly settlement time (0 if no position)
    function feeInfo(address user)
        external
        view
        returns (uint256 value, uint256 costBasis, uint256 profit, uint256 feeDue, uint256 youKeep, uint256 nextSettleAt)
    {
        value = positionValue(user);
        costBasis = basis[user];
        if (user != feeRecipient && value > costBasis) {
            profit = value - costBasis;
            feeDue = (profit * FEE_BPS) / BPS_DENOMINATOR;
        }
        youKeep = value - feeDue;
        nextSettleAt = nextFeeAt[user];
    }

    // ═══ DEPOSIT ═══

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Zero deposit");

        uint256 assetsBefore = totalAssets();
        if (depositCap != 0) require(assetsBefore + amount <= depositCap, "Deposit cap");

        asset.safeTransferFrom(msg.sender, address(this), amount);

        uint256 sharesToMint;
        if (totalShares == 0) {
            require(amount > DEAD_SHARES, "First deposit too small");
            sharesToMint = amount - DEAD_SHARES;
            shares[DEAD] = DEAD_SHARES;
            totalShares = DEAD_SHARES;
        } else {
            // the yield protocol lost everything: old shares are worthless, so a new deposit would be diluted
            require(assetsBefore > 0, "Vault has no assets");
            sharesToMint = (amount * totalShares) / assetsBefore;
        }
        require(sharesToMint > 0, "Zero shares");

        if (shares[msg.sender] == 0) {
            nextFeeAt[msg.sender] = block.timestamp + FEE_PERIOD;
            basis[msg.sender] = 0;
        }
        shares[msg.sender] += sharesToMint;
        totalShares += sharesToMint;
        basis[msg.sender] += amount; // a deposit is cost, never profit

        emit Deposit(msg.sender, amount, sharesToMint);
    }

    // ═══ HARVEST: only routes idle USDC to the yield protocol. No fee is taken here. ═══

    function harvest() external nonReentrant {
        uint256 idle = asset.balanceOf(address(this));
        if (idle > 0) {
            asset.forceApprove(address(protocol), idle);
            protocol.deposit(idle);
        }
        emit Harvest(msg.sender, idle, 0);
    }

    // ═══ FEE SETTLEMENT ═══

    /// @notice Settles one treasury's fee once its yearly date has passed. Anyone may call this
    ///         (a keeper script, the fee wallet, or the treasury itself).
    function settle(address user) external nonReentrant {
        require(shares[user] > 0, "No position");
        require(block.timestamp >= nextFeeAt[user], "Not due yet");
        _settleFee(user);
        uint256 behind = (block.timestamp - nextFeeAt[user]) / FEE_PERIOD + 1;
        nextFeeAt[user] += behind * FEE_PERIOD;
    }

    function _settleFee(address user) internal {
        if (user == feeRecipient || shares[user] == 0) return;
        uint256 assets = totalAssets();
        if (assets == 0 || totalShares == 0) return;

        uint256 value = (shares[user] * assets) / totalShares;
        uint256 b = basis[user];
        if (value <= b) return; // loss or no gain: no fee, basis (high-water mark) stays

        uint256 profit = value - b;
        uint256 feeAssets = (profit * FEE_BPS) / BPS_DENOMINATOR;
        uint256 feeShares = (feeAssets * totalShares) / assets;
        if (feeShares == 0) return;
        if (feeShares > shares[user]) feeShares = shares[user];

        shares[user] -= feeShares;
        shares[feeRecipient] += feeShares; // totalShares unchanged: the shares just change hands
        basis[user] = value - feeAssets;
        totalFeesPaid += feeAssets;

        emit FeeSettled(user, profit, feeAssets, feeShares, value - feeAssets);
    }

    // ═══ WITHDRAW ═══

    /// @notice Burns ALL caller shares, after settling that treasury's fee.
    function withdraw() external nonReentrant {
        require(shares[msg.sender] > 0, "No shares");

        _settleFee(msg.sender);

        uint256 userShares = shares[msg.sender];
        uint256 amount = (userShares * totalAssets()) / totalShares;
        require(amount > 0, "Nothing to withdraw");

        _payOut(msg.sender, userShares, userShares, amount);
    }

    /// @notice Takes out PART of a position (amount in USDC). The fee on the whole open profit is settled
    ///         first, then `amount` is paid out and the rest stays invested with a proportional basis.
    function withdrawAmount(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(shares[msg.sender] > 0, "No shares");

        _settleFee(msg.sender);

        uint256 userShares = shares[msg.sender];
        uint256 assets = totalAssets();
        uint256 value = (userShares * assets) / totalShares;
        require(amount <= value, "Exceeds balance");

        // round the burned shares UP, so the vault is never short
        uint256 burn = (amount * totalShares + assets - 1) / assets;
        if (burn > userShares) burn = userShares;

        _payOut(msg.sender, userShares, burn, amount);
    }

    function _payOut(address user, uint256 userSharesBefore, uint256 burn, uint256 amount) internal {
        shares[user] -= burn;
        totalShares -= burn;
        if (shares[user] == 0) {
            basis[user] = 0;
            nextFeeAt[user] = 0;
        } else {
            basis[user] -= (basis[user] * burn) / userSharesBefore; // remaining position keeps its share of the basis
        }

        uint256 idle = asset.balanceOf(address(this));
        if (idle < amount) protocol.withdraw(amount - idle);
        asset.safeTransfer(user, amount);

        emit Withdraw(user, burn, amount);
    }
}