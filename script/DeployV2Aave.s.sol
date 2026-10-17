// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";
import {MockAaveYieldAdapter} from "../src/adapters/MockAaveYieldAdapter.sol";

contract DeployV2Aave is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    // Circle's USDC on Base Sepolia.
    // This is the token users actually hold — our vault treats it as the
    // asset. NOTE: Aave V3 on Base Sepolia does not support USDC reserves,
    // so we deploy a mock adapter that simulates the Aave integration.
    address internal constant USDC =
        address(bytes20(hex"036CbD53842c5426634e7929541eC2318f3dCF7e"));

    function run()
        external
        returns (
            DAOTreasuryYieldManagerV2 treasury,
            MockAaveYieldAdapter adapter
        )
    {
        require(
            block.chainid == BASE_SEPOLIA_CHAIN_ID,
            "wrong network"
        );

        vm.startBroadcast();

        adapter = new MockAaveYieldAdapter(
            IERC20(USDC)
        );

        treasury = new DAOTreasuryYieldManagerV2(
            IERC20(USDC),
            adapter
        );

        adapter.setTreasury(address(treasury));

        vm.stopBroadcast();

        require(address(treasury).code.length > 0, "Treasury has no code");
        require(address(adapter).code.length > 0, "Adapter has no code");
        require(address(adapter.asset()) == USDC, "Adapter asset mismatch");
        require(adapter.treasury() == address(treasury), "treasury link mismatch");

        console.log("");
        console.log("========================================");
        console.log("DEPLOYMENT SUCCESSFUL");
        console.log("========================================");
        console.log("Network:  Base Sepolia (84532)");
        console.log("USDC:     ", USDC);
        console.log("Adapter:  ", address(adapter));
        console.log("Treasury: ", address(treasury));
        console.log("========================================");
    }
}