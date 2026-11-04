"use client";

import React from "react";
import { useAccount } from "wagmi";

export default function TopBar() {
  const { address, isConnected } = useAccount();

  return (
    <div className="top-bar">
      <div className="top-bar-right">
        <span className="badge">
          <span className="badge-dot" />
          Base Sepolia
        </span>
        {isConnected && address ? (
          <span className="btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        ) : null}
      </div>
    </div>
  );
}