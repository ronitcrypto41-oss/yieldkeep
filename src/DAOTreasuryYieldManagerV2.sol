// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IYieldProtocol} from "./interfaces/IYieldProtocol.sol";

/// @title DAOTreasuryYieldManagerV2
/// @notice Non-custodial USDC treasury vault.
///
///  Flow:
///   - deposit()  : cheap. Moves USDC into this contract + mints shares.
///   - harvest()  : routes idle USDC to the adapter (which supplies to Aave).
///   - withdraw() : burns ALL caller shares, pulls from Aave if needed.
contract DAOTreasuryYieldManagerV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IYieldProtocol public immutable protocol;

    mapping(address => uint256) public shares;
    uint256 public totalShares;

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

    constructor(
        IERC20 _asset,
        IYieldProtocol _protocol
    ) {
        require(address(_asset) != address(0), "Asset is zero");
        require(address(_protocol) != address(0), "Protocol is zero");

        asset = _asset;
        protocol = _protocol;
    }

    // ═══════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════

    function totalAssets() public view returns (uint256) {
        return
            asset.balanceOf(address(this)) +
            protocol.totalAssets();
    }

    function idleAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function sharePrice() external view returns (uint256) {
        if (totalShares == 0) return 1e6;
        return (totalAssets() * 1e6) / totalShares;
    }

    function convertToAssets(
        uint256 shareAmount
    ) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shareAmount * totalAssets()) / totalShares;
    }

    function convertToShares(
        uint256 assetAmount
    ) external view returns (uint256) {
        uint256 assets = totalAssets();
        if (totalShares == 0 || assets == 0) {
            return assetAmount;
        }
        return (assetAmount * totalShares) / assets;
    }

    // ═══════════════════════════════════════════════════════════
    // DEPOSIT — cheap. Only moves USDC and mints shares.
    // Target: ~100k gas.
    // ═══════════════════════════════════════════════════════════

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero deposit");

        uint256 assetsBefore = totalAssets();

        asset.safeTransferFrom(msg.sender, address(this), amount);

        uint256 sharesToMint;

        if (totalShares == 0) {
            sharesToMint = amount;
        } else {
            sharesToMint = (amount * totalShares) / assetsBefore;
        }

        require(sharesToMint > 0, "Zero shares");

        shares[msg.sender] += sharesToMint;
        totalShares += sharesToMint;

        emit Deposit(msg.sender, amount, sharesToMint);
    }

    // ═══════════════════════════════════════════════════════════
    // HARVEST — routes idle USDC into the adapter (which supplies to Aave).
    //
    // Uses raw `approve` because USDC on Base Sepolia doesn't tolerate
    // the SafeERC20 fallback chain (approve → approve(0) → approve(v)).
    // Raw approve going from 0 → idle just works.
    // ═══════════════════════════════════════════════════════════

    function harvest() external nonReentrant {
        uint256 idle = asset.balanceOf(address(this));
        require(idle > 0, "Nothing to harvest");

        // Reset in case there's a residual allowance from a previous
        // harvest. USDC requires allowance == 0 before setting a new value.
        asset.approve(address(protocol), 0);

        // Set the exact amount we're about to deposit.
        asset.approve(address(protocol), idle);

        protocol.deposit(idle);

        emit Harvest(msg.sender, idle);
    }

    // ═══════════════════════════════════════════════════════════
    // WITHDRAW — burns ALL caller shares
    // ═══════════════════════════════════════════════════════════

    function withdraw() external nonReentrant {
        uint256 userShares = shares[msg.sender];
        require(userShares > 0, "No shares");

        uint256 assets = totalAssets();
        uint256 amount = (userShares * assets) / totalShares;
        require(amount > 0, "Nothing to withdraw");

        shares[msg.sender] = 0;
        totalShares -= userShares;

        uint256 idle = asset.balanceOf(address(this));

        if (idle >= amount) {
            asset.safeTransfer(msg.sender, amount);
        } else {
            uint256 protocolAmount = amount - idle;
            protocol.withdraw(protocolAmount);
            asset.safeTransfer(msg.sender, amount);
        }

        emit Withdraw(msg.sender, userShares, amount);
    }
}