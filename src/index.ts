export * from "./types.js";
export * from "./order-engine.js";
export * from "./risk-manager.js";
export * from "./strategy-agent.js";
export * from "./vault-manager.js";

import { DreamDexOrderEngine } from "./order-engine.js";
import { DreamDexRiskManager } from "./risk-manager.js";
import { DreamDexStrategyAgent } from "./strategy-agent.js";
import { DreamDEXVaultManager } from "./vault-manager.js";
import { type OrderBookDepth, type SessionKeyOperatorConfig } from "./types.js";

// CLI execution simulation
if (process.argv[1]?.includes("index")) {
  console.log("=== Somnia DreamDEX Autonomous Perpetual Trading Agent ===");
  console.log("Network: Somnia Tokyo Testnet • Contract Standard: placeOrder (v2 CLOB)\n");

  const engine = new DreamDexOrderEngine();
  const strategy = new DreamDexStrategyAgent(0.20, 5, 2000); // 0.20% max spread, 5x leverage, $2k max position

  // 1. Session Key Operator Authorization
  const operatorConfig: SessionKeyOperatorConfig = {
    operatorAddress: "0xAgentSessionKey456789abcdef1234567890ab",
    ownerAddress: "0xTraderOwner1111222233334444555566667777",
    isAuthorized: true,
    maxNotionalUsd: 10000,
    allowedMarkets: ["ETH-PERP", "BTC-PERP", "SOMNIA-PERP"],
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000, // 7 days validity
  };

  engine.registerOperator(operatorConfig);
  console.log("[1. Session Key Registered]:", {
    operator: operatorConfig.operatorAddress,
    maxNotionalLimit: `$${operatorConfig.maxNotionalUsd.toLocaleString()} USD`,
    allowedMarkets: operatorConfig.allowedMarkets.join(", "),
    canWithdraw: false, // Session keys strictly lack withdrawal capability
  });

  // 2. Synthesize Live Order Book Depth (ETH-PERP on Somnia)
  const depth: OrderBookDepth = {
    marketId: "ETH-PERP",
    symbol: "ETH/USD",
    bids: [
      { price: 2650.0, size: 4.5, total: 4.5 },
      { price: 2649.5, size: 8.0, total: 12.5 },
      { price: 2649.0, size: 12.0, total: 24.5 },
    ],
    asks: [
      { price: 2651.0, size: 2.0, total: 2.0 },
      { price: 2651.5, size: 3.5, total: 5.5 },
      { price: 2652.0, size: 6.0, total: 11.5 },
    ],
    bestBid: 2650.0,
    bestAsk: 2651.0,
    spread: 1.0,
    timestamp: Date.now(),
  };

  console.log("\n[2. Live Somnia CLOB Order Book Depth]:", {
    market: depth.marketId,
    bestBid: `$${depth.bestBid.toFixed(2)}`,
    bestAsk: `$${depth.bestAsk.toFixed(2)}`,
    spreadUsd: `$${depth.spread.toFixed(2)}`,
    spreadBps: `${((depth.spread / depth.bestBid) * 10000).toFixed(1)} bps`,
  });

  // 3. Strategy Agent Market Evaluation
  const signal = strategy.evaluateMarket(depth);
  console.log("\n[3. Strategy Agent Signal Evaluation]:", {
    action: signal.action,
    confidence: `${signal.confidencePercent}%`,
    targetSize: `${signal.targetSize} ETH`,
    targetLeverage: `${signal.targetLeverage}x`,
    reason: signal.triggerReason,
  });

  // 4. Order Execution through Session Key
  if (signal.action === "OPEN_LONG" || signal.action === "OPEN_SHORT") {
    const isBid = signal.action === "OPEN_LONG";
    const receipt = engine.executeOrder(
      {
        marketId: depth.marketId,
        isBid,
        size: signal.targetSize,
        orderType: "MARKET",
        leverage: signal.targetLeverage,
        operatorAddress: operatorConfig.operatorAddress,
      },
      depth
    );

    console.log("\n[4. Order Execution Receipt]:", {
      orderId: receipt.orderId,
      status: receipt.status,
      executedSize: `${receipt.executedSize} ETH`,
      avgFillPrice: `$${receipt.executedPrice.toFixed(2)}`,
      notionalUsd: `$${receipt.notionalUsd.toFixed(2)}`,
      protocolFeeUsd: `$${receipt.feeUsd.toFixed(4)} (0.05%)`,
      remainingOperatorAllowance: `$${engine.getRemainingNotional(operatorConfig.operatorAddress).toFixed(2)}`,
    });

    // 5. Real-Time Risk & Margin Tracking
    const position = DreamDexRiskManager.evaluatePosition(
      depth.marketId,
      isBid,
      receipt.executedSize,
      receipt.executedPrice,
      2655.0, // Mark price moved in our favor
      400.0, // $400 collateral deposited
      signal.targetLeverage
    );

    const risk = DreamDexRiskManager.evaluateRisk(position);

    console.log("\n[5. Active Perpetual Position & Risk State]:", {
      market: position.marketId,
      side: position.isLong ? "LONG" : "SHORT",
      entryPrice: `$${position.entryPrice.toFixed(2)}`,
      currentMarkPrice: `$${position.markPrice.toFixed(2)}`,
      unrealizedPnl: `${position.unrealizedPnlUsd >= 0 ? "+" : ""}$${position.unrealizedPnlUsd.toFixed(2)}`,
      liquidationPrice: `$${position.liquidationPrice.toFixed(2)}`,
      liquidationBuffer: `${risk.liquidationBufferPercent.toFixed(2)}%`,
      marginRatio: `${position.marginRatioPercent}%`,
      riskAction: risk.actionRequired,
    });

    // 6. Staking & Vault Fee Redistribution
    const vault = new DreamDEXVaultManager("somnia-dreamdex-usdc-vault", "dvUSDC", 18.5);
    const stakerDeposit = vault.deposit(operatorConfig.ownerAddress, 5000); // Deposit $5,000 into liquidity vault
    vault.accrueProtocolFees(receipt.feeUsd); // Distribute 30% cut of trade fee
    const rebalanceCheck = vault.evaluateCollateralRebalance(position, 1200, stakerDeposit);

    console.log("\n[6. Liquidity Vault & Staking Yield State]:", {
      vault: vault.getVaultState().vaultId,
      sharesMinted: `${stakerDeposit.shares.toFixed(2)} ${vault.getVaultState().symbol}`,
      vaultSharePrice: `$${vault.getVaultState().sharePriceUsd.toFixed(6)}`,
      protocolFeeAccrued: `$${vault.getVaultState().feeDistributionPoolUsd.toFixed(6)} (30% share)`,
      annualizedApy: `${vault.getVaultState().annualizedApyPercent}%`,
      marginRebalanceAction: rebalanceCheck.action,
      recommendedTransferUsd: `$${rebalanceCheck.amountUsd.toFixed(2)}`,
      rebalanceReason: rebalanceCheck.reason,
    });
  }
}
