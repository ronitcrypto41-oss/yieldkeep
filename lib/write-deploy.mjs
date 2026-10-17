import { writeFileSync } from 'fs';

const content = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";
import {AaveYieldAdapter} from "../src/adapters/AaveYieldAdapter.sol";
import {IAavePool} from "../src/interfaces/IAavePool.sol";
import {IAToken} from "../src/interfaces/IAToken.sol";

interface IAavePoolAddressesProvider {
    function getPool() external view returns (address);
}

interface IAaveProtocolDataProvider {
    function getReserveTokensAddresses(address asset)
        external
        view
        returns (
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress
        );
}

interface IAaveAToken {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}

contract DeployV2Aave is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    address internal constant USDC =
        address(bytes20(hex"ba50cd2a20f6fda9b13955798c5381bca8c1d05f"));
    address internal constant POOL =
        address(bytes20(hex"8bab6d1b75f19e9ed9fce8b9bd338844ff79ae27"));
    address internal constant USDC_ATOKEN =
        address(bytes20(hex"10f1f9ad11dcf50041f3f8cb7191cbe2f31750ac"));
    address internal constant POOL_ADDRESSES_PROVIDER =
        address(bytes20(hex"e4c23309117aa30342bfaee6c95c6478e0a4ad00"));
    address internal constant PROTOCOL_DATA_PROVIDER =
        address(bytes20(hex"bc9f5b7e248451cdd7ca54e717a2bfe1f32b566b"));

    function run()
        external
        returns (
            DAOTreasuryYieldManagerV2 treasury,
            AaveYieldAdapter adapter
        )
    {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "wrong network");

        address livePool =
            IAavePoolAddressesProvider(POOL_ADDRESSES_PROVIDER).getPool();
        require(livePool == POOL, "Pool mismatch");

        (address liveAToken, , ) = IAaveProtocolDataProvider(PROTOCOL_DATA_PROVIDER)
            .getReserveTokensAddresses(USDC);
        require(liveAToken == USDC_ATOKEN, "aToken mismatch");

        address liveUnderlying =
            IAaveAToken(USDC_ATOKEN).UNDERLYING_ASSET_ADDRESS();
        require(liveUnderlying == USDC, "Underlying asset mismatch");

        vm.startBroadcast();

        adapter = new AaveYieldAdapter(
            IERC20(USDC),
            IAavePool(POOL),
            IAToken(USDC_ATOKEN)
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
        require(address(adapter.pool()) == POOL, "Adapter pool mismatch");
        require(address(adapter.aToken()) == USDC_ATOKEN, "Adapter aToken mismatch");
        require(adapter.treasury() == address(treasury), "treasury link mismatch");

        console.log("");
        console.log("========================================");
        console.log("DEPLOYMENT SUCCESSFUL");
        console.log("========================================");
        console.log("Network:  Base Sepolia (84532)");
        console.log("Adapter: ", address(adapter));
        console.log("Treasury:", address(treasury));
        console.log("========================================");
    }
}
`;

writeFileSync('script/DeployV2Aave.s.sol', content, { encoding: 'utf8' });
console.log('DeployV2Aave.s.sol written successfully');