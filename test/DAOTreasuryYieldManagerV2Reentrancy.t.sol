// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";

contract MaliciousToken is IERC20 {
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;

    DAOTreasuryYieldManagerV2 public treasury;

    uint256 public reentryAttempts;

    function setTreasury(
        DAOTreasuryYieldManagerV2 _treasury
    ) external {
        treasury = _treasury;
    }

    function mint(address to, uint256 amount) external {
        balances[to] += amount;
    }

    function totalSupply() external pure returns (uint256) {
        return 0;
    }

    function balanceOf(
        address account
    ) external view returns (uint256) {
        return balances[account];
    }

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256) {
        return allowances[owner][spender];
    }

    function approve(
        address spender,
        uint256 amount
    ) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        return true;
    }

    function transfer(
        address to,
        uint256 amount
    ) external returns (bool) {
        balances[msg.sender] -= amount;
        balances[to] += amount;

        if (address(treasury) != address(0)) {
            reentryAttempts++;

            try treasury.withdraw() {
            } catch {
            }
        }

        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(
            allowances[from][msg.sender] >= amount,
            "Not approved"
        );

        allowances[from][msg.sender] -= amount;

        balances[from] -= amount;
        balances[to] += amount;

        return true;
    }
}

contract DAOTreasuryYieldManagerV2ReentrancyTest is Test {
    MaliciousToken public token;
    DAOTreasuryYieldManagerV2 public treasury;

    function setUp() public {
        token = new MaliciousToken();

        MockYieldProtocol dummyProtocol =
            new MockYieldProtocol(token);

        treasury = new DAOTreasuryYieldManagerV2(
            token,
            dummyProtocol
        );

        token.setTreasury(treasury);

        token.mint(address(this), 100);
    }

    function test_ReentrancyFails() public {
        token.approve(address(treasury), 100);

        treasury.deposit(100);

        // deposit() only holds the USDC. harvest() sends it to the yield protocol,
        // so withdraw() has to pull it back out (two token transfers = two re-entry tries).
        treasury.harvest();

        assertEq(
            treasury.shares(address(this)),
            100
        );

        treasury.withdraw();

        assertEq(
            token.reentryAttempts(),
            2
        );

        assertEq(
            treasury.shares(address(this)),
            0
        );

        assertEq(
            treasury.totalShares(),
            0
        );

        assertEq(
            token.balanceOf(address(this)),
            100
        );
    }
}