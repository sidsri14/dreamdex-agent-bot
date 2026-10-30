import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DreamDexOrderEngine, DREAMDEX_TAKER_FEE_RATE } from "../src/order-engine.js";
import { type OrderBookDepth, type SessionKeyOperatorConfig } from "../src/types.js";

describe("DreamDEX Order Engine & Session Key Suite", () => {
  let engine: DreamDexOrderEngine;
  let operator: SessionKeyOperatorConfig;
  let mockDepth: OrderBookDepth;

  beforeEach(() => {
    engine = new DreamDexOrderEngine();
    operator = {
      operatorAddress: "0xOperator123",
      ownerAddress: "0xOwner456",
      isAuthorized: true,
      maxNotionalUsd: 5000,
      allowedMarkets: ["ETH-PERP", "BTC-PERP"],
      expiresAt: Date.now() + 86400000,
    };
    engine.registerOperator(operator);

    mockDepth = {
      marketId: "ETH-PERP",
      symbol: "ETH/USD",
      bids: [
        { price: 2500, size: 2.0, total: 2.0 },
        { price: 2490, size: 5.0, total: 7.0 },
      ],
      asks: [
        { price: 2510, size: 2.0, total: 2.0 },
        { price: 2520, size: 4.0, total: 6.0 },
      ],
      bestBid: 2500,
      bestAsk: 2510,
      spread: 10,
      timestamp: Date.now(),
    };
  });

  test("validates operator permissions correctly", () => {
    const validCheck = engine.validateOperatorPermissions("0xOperator123", "ETH-PERP", 1000);
    assert.strictEqual(validCheck.valid, true);

    const wrongMarket = engine.validateOperatorPermissions("0xOperator123", "DOGE-PERP", 1000);
    assert.strictEqual(wrongMarket.valid, false);
    assert.ok(wrongMarket.error?.includes("whitelist"));

    const overLimit = engine.validateOperatorPermissions("0xOperator123", "ETH-PERP", 6000);
    assert.strictEqual(overLimit.valid, false);
    assert.ok(overLimit.error?.includes("exceeds"));
  });

  test("rejects expired session keys", () => {
    const expiredEngine = new DreamDexOrderEngine();
    expiredEngine.registerOperator({
      ...operator,
      operatorAddress: "0xExpiredOp",
      expiresAt: Date.now() - 1000,
    });

    const check = expiredEngine.validateOperatorPermissions("0xExpiredOp", "ETH-PERP", 500);
    assert.strictEqual(check.valid, false);
    assert.ok(check.error?.includes("expired"));
  });

  test("executes order against depth and deducts 0.05% taker fee", () => {
    const receipt = engine.executeOrder(
      {
        marketId: "ETH-PERP",
        isBid: true,
        size: 1.0,
        orderType: "MARKET",
        leverage: 5,
        operatorAddress: "0xOperator123",
      },
      mockDepth
    );

    assert.strictEqual(receipt.status, "FILLED");
    assert.strictEqual(receipt.executedSize, 1.0);
    assert.strictEqual(receipt.executedPrice, 2510);
    assert.strictEqual(receipt.notionalUsd, 2510);
    assert.strictEqual(receipt.feeUsd, 2510 * DREAMDEX_TAKER_FEE_RATE);

    const remaining = engine.getRemainingNotional("0xOperator123");
    assert.strictEqual(remaining, 5000 - 2510);
  });

  test("enforces cumulative allowance tracking across consecutive orders", () => {
    engine.executeOrder(
      {
        marketId: "ETH-PERP",
        isBid: true,
        size: 1.0, // 2510 USD
        orderType: "MARKET",
        leverage: 5,
        operatorAddress: "0xOperator123",
      },
      mockDepth
    );

    // Second order of 1.0 ETH will cost 2510 USD. Total = 5020 USD > 5000 USD limit
    assert.throws(() => {
      engine.executeOrder(
        {
          marketId: "ETH-PERP",
          isBid: true,
          size: 1.0,
          orderType: "MARKET",
          leverage: 5,
          operatorAddress: "0xOperator123",
        },
        mockDepth
      );
    }, /exceeds remaining operator allowance/);
  });
});
