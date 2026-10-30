import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DreamDexStrategyAgent } from "../src/strategy-agent.js";
import { type OrderBookDepth, type PerpetualPosition } from "../src/types.js";

describe("DreamDEX Strategy Agent Suite", () => {
  const baseDepth: OrderBookDepth = {
    marketId: "ETH-PERP",
    symbol: "ETH/USD",
    bids: [
      { price: 2500, size: 5.0, total: 5.0 },
      { price: 2498, size: 10.0, total: 15.0 },
    ],
    asks: [
      { price: 2502, size: 2.0, total: 2.0 },
      { price: 2504, size: 4.0, total: 6.0 },
    ],
    bestBid: 2500,
    bestAsk: 2502,
    spread: 2,
    timestamp: Date.now(),
  };

  test("suppresses execution when bid-ask spread exceeds threshold", () => {
    const wideDepth: OrderBookDepth = {
      ...baseDepth,
      bestAsk: 2550, // 50 USD spread on $2500 = 2.0% spread
      spread: 50,
    };

    const agent = new DreamDexStrategyAgent(0.25); // 0.25% max
    const signal = agent.evaluateMarket(wideDepth);

    assert.strictEqual(signal.action, "HOLD");
    assert.strictEqual(signal.confidencePercent, 0);
    assert.ok(signal.triggerReason.includes("Spread too wide"));
  });

  test("generates OPEN_LONG when order book depth is heavily skewed towards buyers", () => {
    const bullishDepth: OrderBookDepth = {
      ...baseDepth,
      bids: [
        { price: 2500, size: 20.0, total: 20.0 }, // 20 ETH on bid
      ],
      asks: [
        { price: 2502, size: 2.0, total: 2.0 }, // 2 ETH on ask
      ],
      spread: 2,
    };

    const agent = new DreamDexStrategyAgent(0.25, 5, 2500);
    const signal = agent.evaluateMarket(bullishDepth);

    assert.strictEqual(signal.action, "OPEN_LONG");
    assert.ok(signal.confidencePercent >= 80);
    assert.strictEqual(signal.targetLeverage, 5);
    assert.ok(signal.targetSize > 0);
    assert.ok(signal.triggerReason.includes("bullish"));
  });

  test("generates OPEN_SHORT when order book depth is heavily skewed towards sellers", () => {
    const bearishDepth: OrderBookDepth = {
      ...baseDepth,
      bids: [
        { price: 2500, size: 2.0, total: 2.0 },
      ],
      asks: [
        { price: 2502, size: 25.0, total: 25.0 },
      ],
      spread: 2,
    };

    const agent = new DreamDexStrategyAgent(0.25, 5, 2500);
    const signal = agent.evaluateMarket(bearishDepth);

    assert.strictEqual(signal.action, "OPEN_SHORT");
    assert.ok(signal.confidencePercent >= 80);
    assert.ok(signal.triggerReason.includes("bearish"));
  });

  test("emits CLOSE_POSITION when existing position encounters severe liquidation risk", () => {
    const agent = new DreamDexStrategyAgent();

    const criticalPosition: PerpetualPosition = {
      marketId: "ETH-PERP",
      isLong: true,
      size: 1.0,
      entryPrice: 2500,
      markPrice: 2280,
      collateralUsd: 250,
      leverage: 10,
      liquidationPrice: 2375,
      unrealizedPnlUsd: -220,
      marginRatioPercent: 1.3, // Severe breach of 5% MMR
    };

    const signal = agent.evaluateMarket(baseDepth, criticalPosition);

    assert.strictEqual(signal.action, "CLOSE_POSITION");
    assert.strictEqual(signal.confidencePercent, 95);
    assert.ok(signal.triggerReason.includes("Proactive risk containment"));
  });
});
