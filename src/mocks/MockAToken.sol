// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAToken} from "../interfaces/IAToken.sol";

contract MockAToken is IAToken {
    string public name = "Mock Aave USDC";
    string public symbol = "maUSDC";
    uint8 public decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;

    mapping(address => mapping(address => uint256))
        public allowance;

    function transfer(
        address to,
        uint256 amount
    ) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        return true;
    }

    function approve(
        address spender,
        uint256 amount
    ) external returns (bool) {
        allowance[msg.sender][spender] = amount;

        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];

        require(
            allowed >= amount,
            "Insufficient allowance"
        );

        allowance[from][msg.sender] =
            allowed - amount;

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        return true;
    }

    function mint(
        address to,
        uint256 amount
    ) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burn(
        address from,
        uint256 amount
    ) external {
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function addYield(
        address user,
        uint256 amount
    ) external {
        balanceOf[user] += amount;
        totalSupply += amount;
    }
}