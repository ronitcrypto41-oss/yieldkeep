// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "./MockUSDC.sol";
import {IYieldProtocol} from "../interfaces/IYieldProtocol.sol";

contract MockYieldProtocol is IYieldProtocol {
    IERC20 public immutable asset;

    uint256 public totalDeposited;

    constructor(IERC20 _asset) {
        asset = _asset;
    }

    function totalAssets()
        external
        view
        override
        returns (uint256)
    {
        return totalDeposited;
    }

    function deposit(
        uint256 amount
    ) external override {
        require(
            amount > 0,
            "Zero deposit"
        );

        asset.transferFrom(
            msg.sender,
            address(this),
            amount
        );

        totalDeposited += amount;
    }

    function withdraw(
        uint256 amount
    ) external override {
        require(
            totalDeposited >= amount,
            "Insufficient deposit"
        );

        totalDeposited -= amount;

        asset.transfer(
            msg.sender,
            amount
        );
    }

    // ═══════════════════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════════════════

    /// @notice No-op in mock mode. The vault has no access control
    ///         here, so it can call deposit() directly.
    function setTreasury(address) external {
        // intentionally empty
    }

    /// @notice Simulate yield accrual. Mints new USDC into this
    ///         contract and bumps totalDeposited.
    function bumpAssets(uint256 amount) external {
        MockUSDC(address(asset)).mint(
            address(this),
            amount
        );

        totalDeposited += amount;
    }

    /// @notice Old helper name — kept so existing tests still compile.
    function addYield(
        address,
        uint256 amount
    ) external {
        MockUSDC(address(asset)).mint(
            address(this),
            amount
        );

        totalDeposited += amount;
    }
}