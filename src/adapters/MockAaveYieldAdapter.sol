// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IYieldProtocol} from "../interfaces/IYieldProtocol.sol";

/// @title MockAaveYieldAdapter
/// @notice Testnet adapter for YieldKeep. Substitutes for the real
///         Aave V3 adapter on chains (like Base Sepolia) where the
///         Aave pool does not support USDC reserves.
///
///         Same external interface as AaveYieldAdapter:
///           - deposit(amount)    — pulls USDC from the treasury
///           - withdraw(amount)   — returns USDC to the treasury
///           - totalAssets()      — USDC held by this contract
///
///         Supports simulated yield accrual via accrueYield(), which
///         any address can call to transfer USDC into this contract,
///         simulating interest earned from Aave.
contract MockAaveYieldAdapter is IYieldProtocol, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public treasury;
    address public immutable deployer;

    uint256 public simulatedYield;

    event TreasurySet(address indexed treasury);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event YieldAccrued(address indexed from, uint256 amount);

    constructor(IERC20 _asset) {
        require(address(_asset) != address(0), "Asset zero");
        asset = _asset;
        deployer = msg.sender;
    }

    modifier onlyTreasury() {
        require(msg.sender == treasury, "Only treasury");
        _;
    }

    modifier onlyDeployer() {
        require(msg.sender == deployer, "Only deployer");
        _;
    }

    function setTreasury(address _treasury) external onlyDeployer {
        require(treasury == address(0), "Treasury already set");
        require(_treasury != address(0), "Zero treasury");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function pause() external onlyDeployer {
        _pause();
    }

    function unpause() external onlyDeployer {
        _unpause();
    }

    function deposit(uint256 amount) external override onlyTreasury whenNotPaused {
        require(amount > 0, "Zero deposit");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(amount);
    }

    function withdraw(uint256 amount) external override onlyTreasury whenNotPaused {
        require(amount > 0, "Zero withdraw");
        require(totalAssets() >= amount, "Insufficient deposit");
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(amount);
    }

    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /// @notice Simulate yield accrual. Anyone can call this to transfer
    ///         USDC into the adapter, increasing totalAssets(). Use this
    ///         in demos to show share price rising.
    function accrueYield(uint256 amount) external {
        require(amount > 0, "Zero yield");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        simulatedYield += amount;
        emit YieldAccrued(msg.sender, amount);
    }
}