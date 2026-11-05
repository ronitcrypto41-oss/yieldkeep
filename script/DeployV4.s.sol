// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DAOTreasuryYieldManagerV4.sol";
import "../src/adapters/MockAaveYieldAdapter.sol";

contract DeployV4 is Script {
    function run() external {
        address usdc = vm.envAddress("USDC");
        address feeWallet = vm.envAddress("FEE_WALLET"); // public address only
        address owner = vm.envAddress("OWNER");          // testnet: your wallet. mainnet: the Safe
        uint256 cap = vm.envUint("DEPOSIT_CAP");         // 50000e6 = 50,000 USDC

        vm.startBroadcast();
        MockAaveYieldAdapter adapter = new MockAaveYieldAdapter(IERC20(usdc));
        DAOTreasuryYieldManagerV4 vault = new DAOTreasuryYieldManagerV4(
            IERC20(usdc),
            IYieldProtocol(address(adapter)),
            feeWallet,
            owner,
            cap
        );
        adapter.setTreasury(address(vault));
        vm.stopBroadcast();

        console.log("Adapter:", address(adapter));
        console.log("Vault V4:", address(vault));
        console.log("Deploy block:", block.number);
    }
}