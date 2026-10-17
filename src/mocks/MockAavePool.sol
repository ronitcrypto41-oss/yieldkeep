// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAavePool} from "../interfaces/IAavePool.sol";
import {IAToken} from "../interfaces/IAToken.sol";

contract MockAavePool is IAavePool {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IAToken public immutable aToken;

    uint256 public withdrawReturnAmount;

    constructor(
        IERC20 _asset,
        IAToken _aToken
    ) {
        asset = _asset;
        aToken = _aToken;
    }

    function setWithdrawReturnAmount(
        uint256 amount
    ) external {
        withdrawReturnAmount = amount;
    }

    function supply(
        address assetAddress,
        uint256 amount,
        address onBehalfOf,
        uint16
    ) external override {
        require(
            assetAddress == address(asset),
            "Wrong asset"
        );

        require(
            amount > 0,
            "Zero supply"
        );

        asset.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        MockAToken(address(aToken)).mint(
            onBehalfOf,
            amount
        );
    }

    function withdraw(
        address assetAddress,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        require(
            assetAddress == address(asset),
            "Wrong asset"
        );

        require(
            amount > 0,
            "Zero withdraw"
        );

        MockAToken(address(aToken)).burn(
            msg.sender,
            amount
        );

        uint256 actualAmount = amount;

        if (withdrawReturnAmount > 0) {
            actualAmount = withdrawReturnAmount;
        }

        asset.safeTransfer(
            to,
            actualAmount
        );

        return actualAmount;
    }
}

interface MockAToken is IAToken {
    function mint(
        address to,
        uint256 amount
    ) external;

    function burn(
        address from,
        uint256 amount
    ) external;
}