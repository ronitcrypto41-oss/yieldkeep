// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IYieldProtocol} from "./interfaces/IYieldProtocol.sol";

/// @title DAOTreasuryYieldManagerV2
/// @notice Non-custodial USDC treasury vault that routes idle capital to a
///         yield protocol (Aave V3 via AaveYieldAdapter).
///
///  Design principles:
///   - Deposit is CHEAP. It only moves USDC into this contract and mints
///     shares. It does NOT call into Aave. This keeps deposit() well under
///     Base's 16.7M per-transaction gas cap.
///   - Yield routing happens in a SEPARATE transaction via harvest(),
///     callable by anyone (keeper, user, or automated bot).
///   - Withdraw is user-driven and only pulls from the protocol the exact
///     amount it needs to cover idleAssets.
///   - No performance fee is charged on-chain yet. The 10% fee is a
///     protocol-level policy, not a contract mechanic (see notes below).
contract DAOTreasuryYieldManagerV2 {
    using SafeERC20 for IERC20;

    // ============================================================
    // IMMUTABLES
    // ============================================================

    IERC20 public immutable asset;
    IYieldProtocol public immutable protocol;

    // ============================================================
    // STATE
    // ============================================================

    mapping(address => uint256) public shares;
    uint256 public totalShares;

    // ============================================================
    // EVENTS
    // ============================================================

    event Deposit(
        address indexed user,
        uint256 amount,
        uint256 sharesMinted
    );

    event Withdraw(
        address indexed user,
        uint256 sharesBurned,
        uint256 amountReturned
    );

    event Harvest(
        address indexed caller,
        uint256 amountDeployed
    );

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor(
        IERC20 _asset,
        IYieldProtocol _protocol
    ) {
        require(
            address(_asset) != address(0),
            "Asset is zero"
        );
        require(
            address(_protocol) != address(0),
            "Protocol is zero"
        );

        asset = _asset;
        protocol = _protocol;
    }

    // ============================================================
    // VIEWS
    // ============================================================

    /// @notice Total USDC under management = idle + deployed in Aave.
    function totalAssets() public view returns (uint256) {
        return
            asset.balanceOf(address(this)) +
            protocol.totalAssets();
    }

    /// @notice Idle USDC sitting in this contract (not yet routed to Aave).
    function idleAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /// @notice Current share price: USDC value of 1 share (scaled 1e6).
    ///         Returns 1e6 (1.000000 USDC) on an empty vault.
    function sharePrice() external view returns (uint256) {
        if (totalShares == 0) return 1e6;
        return (totalAssets() * 1e6) / totalShares;
    }

    /// @notice Convert an amount of shares to USDC.
    function convertToAssets(
        uint256 shareAmount
    ) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return
            (shareAmount * totalAssets()) /
            totalShares;
    }

    /// @notice Convert an amount of USDC to shares.
    function convertToShares(
        uint256 assetAmount
    ) external view returns (uint256) {
        uint256 assets = totalAssets();

        if (totalShares == 0 || assets == 0) {
            return assetAmount;
        }

        return
            (assetAmount * totalShares) /
            assets;
    }

    // ============================================================
    // DEPOSIT — CHEAP
    // ============================================================
    //
    // Only moves USDC from user → this contract and mints shares.
    // Does NOT call into Aave. Does NOT call into adapter.
    // Target cost: ~100k gas.
    //
    // Funds sit idle until someone calls harvest().
    //
    // ============================================================

    function deposit(uint256 amount) external {
        require(amount > 0, "Zero deposit");

        uint256 assetsBefore = totalAssets();

        // Pull USDC from user to this contract.
        asset.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        uint256 sharesToMint;

        if (totalShares == 0) {
            // First depositor: 1 share = 1 USDC (scaled by USDC decimals).
            sharesToMint = amount;
        } else {
            // Proportion of existing pool.
            sharesToMint =
                (amount * totalShares) /
                assetsBefore;
        }

        require(sharesToMint > 0, "Zero shares");

        shares[msg.sender] += sharesToMint;
        totalShares += sharesToMint;

        emit Deposit(msg.sender, amount, sharesToMint);

        // NOTE: no Aave call here on purpose.
    }

    // ============================================================
    // HARVEST — the expensive part, split into its own transaction
    // ============================================================
    //
    // Anyone can call this. It routes all idle USDC into the adapter,
    // which supplies it to Aave.
    //
    // Target cost: ~300k gas. Well under the 16.7M per-tx cap.
    //
    // ============================================================

    function harvest() external {
        uint256 idle = asset.balanceOf(address(this));

        require(idle > 0, "Nothing to harvest");

        asset.forceApprove(address(protocol), idle);
        protocol.deposit(idle);

        emit Harvest(msg.sender, idle);
    }

    // ============================================================
    // WITHDRAW — burns ALL of the caller's shares
    // ============================================================
    //
    // This vault does not support partial withdrawals yet. Users withdraw
    // their entire position in a single transaction. Partial withdrawals
    // are the #1 item on the v3 roadmap.
    //
    // ============================================================

    function withdraw() external {
        uint256 userShares = shares[msg.sender];

        require(userShares > 0, "No shares");

        uint256 assets = totalAssets();

        uint256 amount =
            (userShares * assets) /
            totalShares;

        require(amount > 0, "Nothing to withdraw");

        // CEI: update state BEFORE external calls.
        shares[msg.sender] = 0;
        totalShares -= userShares;

        uint256 idle = asset.balanceOf(address(this));

        if (idle >= amount) {
            // Treasury has enough idle USDC. Aave is not touched.
            asset.safeTransfer(msg.sender, amount);
        } else {
            // Pull the shortfall from the protocol first.
            uint256 protocolAmount = amount - idle;

            protocol.withdraw(protocolAmount);

            // Now we should have enough to pay the user.
            asset.safeTransfer(msg.sender, amount);
        }

        emit Withdraw(msg.sender, userShares, amount);
    }
}