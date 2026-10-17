// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        // Security check:
        // A user cannot withdraw more than their balance.
        require(
            balances[msg.sender] >= amount,
            "Insufficient balance"
        );

        // Update the balance before sending ETH.
        balances[msg.sender] -= amount;

        // Send ETH to the user.
        (bool success, ) =
            payable(msg.sender).call{value: amount}("");

        require(success, "Transfer failed");
    }

    receive() external payable {}
}