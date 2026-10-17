// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IYieldProtocol} from "../interfaces/IYieldProtocol.sol";
import {IAavePool} from "../interfaces/IAavePool.sol";
import {IAToken} from "../interfaces/IAToken.sol";

/// @title AaveYieldAdapter
/// @notice Routes USDC from the treasury into Aave V3 and back.
///         Only the treasury address can call deposit() and withdraw().
contract AaveYieldAdapter is IYieldProtocol, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IAavePool public immutable pool;
    IAToken public immutable aToken;

    address public treasury;
    address public immutable deployer;

    event TreasurySet(address indexed treasury);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);

    constructor(
        IERC20 _asset,
        IAavePool _pool,
        IAToken _aToken
    ) {
        require(address(_asset) != address(0), "Asset zero");
        require(address(_pool) != address(0), "Pool zero");
        require(address(_aToken) != address(0), "aToken zero");

        asset = _asset;
        pool = _pool;
        aToken = _aToken;

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

    function setTreasury(
        address _treasury
    ) external onlyDeployer {
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

    function deposit(
        uint256 amount
    )
        external
        override
        onlyTreasury
        whenNotPaused
    {
        require(amount > 0, "Zero deposit");

        asset.safeTransferFrom(msg.sender, address(this), amount);
        asset.forceApprove(address(pool), amount);

        pool.supply(
            address(asset),
            amount,
            address(this),
            0
        );

        emit Deposited(amount);
    }

    function withdraw(
        uint256 amount
    )
        external
        override
        onlyTreasury
        whenNotPaused
    {
        require(amount > 0, "Zero withdraw");
        require(totalAssets() >= amount, "Insufficient deposit");

        uint256 withdrawn = pool.withdraw(
            address(asset),
            amount,
            address(this)
        );

        require(withdrawn == amount, "Incorrect withdrawal");

        asset.safeTransfer(msg.sender, amount);

        emit Withdrawn(amount);
    }

    function totalAssets()
        public
        view
        override
        returns (uint256)
    {
        return aToken.balanceOf(address(this));
    }
}