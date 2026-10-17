// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BuggyBank {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(
            balances[msg.sender] >= amount,
            "Insufficient balance"
        );

        // INTENTIONAL BUG:
        // Only half of the withdrawal is deducted
       balances[msg.sender] -= amount;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
    }

    receive() external payable {}
}