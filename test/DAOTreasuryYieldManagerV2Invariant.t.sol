// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldProtocol} from "../src/mocks/MockYieldProtocol.sol";
import {DAOTreasuryYieldManagerV2} from "../src/DAOTreasuryYieldManagerV2.sol";
import {DAOTreasuryYieldManagerV2Handler} from "./DAOTreasuryYieldManagerV2Handler.t.sol";

contract DAOTreasuryYieldManagerV2InvariantTest is Test {
    MockUSDC public usdc;
    MockYieldProtocol public protocol;
    DAOTreasuryYieldManagerV2 public treasury;
    DAOTreasuryYieldManagerV2Handler public handler;

    function setUp() public {
        usdc = new MockUSDC();

        protocol = new MockYieldProtocol(usdc);

        treasury = new DAOTreasuryYieldManagerV2(
            usdc,
            protocol
        );

        handler = new DAOTreasuryYieldManagerV2Handler(
            treasury,
            usdc,
            protocol
        );

        targetContract(address(handler));
    }

    function invariant_TotalSharesMatchGhost() public {
        assertEq(
            treasury.totalShares(),
            handler.ghost_totalShares()
        );
    }

    function invariant_UserSharesMatchGhost() public {
        assertEq(
            treasury.shares(handler.alice()),
            handler.ghost_aliceShares()
        );

        assertEq(
            treasury.shares(handler.bob()),
            handler.ghost_bobShares()
        );

        assertEq(
            treasury.shares(handler.charlie()),
            handler.ghost_charlieShares()
        );
    }

    function invariant_TotalAssetsMatchGhost() public {
        assertEq(
            treasury.totalAssets(),
            handler.ghost_totalAssets()
        );
    }
}