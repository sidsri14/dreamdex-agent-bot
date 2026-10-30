import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DreamDexRiskManager,
  MAINTENANCE_MARGIN_PERCENT,
} from "../src/risk-manager.js";

describe("DreamDEX Risk Manager Suite", () => {
  test("computes correct liquidation price for 10x Long position", () => {
    // Entry: $2000, Leverage: 10x (IMR: 10%), MMR: 5%
    // Liq = 2000 * (1 - 0.10 + 0.05) = 2000 * 0.95 = $1900
    const liqPrice = DreamDexRiskManager.calculateLiquidationPrice(2000, 10, true, 5);
    assert.strictEqual(liqPrice, 1900);
  });

  test("computes correct liquidation price for 10x Short position", () => {
    // Entry: $2000, Leverage: 10x, MMR: 5%
    // Liq = 2000 * (1 + 0.10 - 0.05) = 2000 * 1.05 = $2100
    const liqPrice = DreamDexRiskManager.calculateLiquidationPrice(2000, 10, false, 5);
    assert.strictEqual(liqPrice, 2100);
  });

  test("evaluates safe position with positive PnL and high margin buffer", () => {
    // 1 ETH Long entered at $2500, mark at $2600. Collateral: $500, Leverage: 5x
    const pos = DreamDexRiskManager.evaluatePosition(
      "ETH-PERP",
      true,
      1.0,
      2500,
      2600,
      500,
      5
    );

    assert.strictEqual(pos.unrealizedPnlUsd, 100);
    // Equity: 500 + 100 = 600. Notional: 2600. Margin Ratio = (600 / 2600) * 100 = ~23.08%
    assert.ok(pos.marginRatioPercent > 20);

    const risk = DreamDexRiskManager.evaluateRisk(pos);
    assert.strictEqual(risk.isSafe, true);
    assert.strictEqual(risk.actionRequired, "NONE");
  });

  test("triggers MARGIN_CALL alert when margin ratio enters warning zone (<= 12%)", () => {
    // 1 ETH Long at $2500, price dropped to $2350 (-$150 PnL). Collateral: $400.
    // Equity: 250. Notional: 2350. Margin Ratio = (250 / 2350) * 100 = 10.64% (between 8% and 12%)
    const pos = DreamDexRiskManager.evaluatePosition(
      "ETH-PERP",
      true,
      1.0,
      2500,
      2350,
      400,
      5
    );

    const risk = DreamDexRiskManager.evaluateRisk(pos);
    assert.strictEqual(risk.isSafe, true);
    assert.strictEqual(risk.actionRequired, "MARGIN_CALL");
  });

  test("triggers AUTO_DELEVERAGE when margin ratio is critically low (<= 8%)", () => {
    // 1 ETH Long at $2500, price dropped to $2330 (-$170 PnL). Collateral: $320.
    // Equity: 150. Notional: 2330. Margin Ratio = (150 / 2330) * 100 = 6.44% (between 5% and 8%)
    const pos = DreamDexRiskManager.evaluatePosition(
      "ETH-PERP",
      true,
      1.0,
      2500,
      2330,
      320,
      5
    );

    const risk = DreamDexRiskManager.evaluateRisk(pos);
    assert.strictEqual(risk.isSafe, false);
    assert.strictEqual(risk.actionRequired, "AUTO_DELEVERAGE");
  });

  test("triggers LIQUIDATE when margin ratio breaches MMR (<= 5%)", () => {
    // Equity dropped to $100 on $2200 notional = 4.5% margin ratio <= 5% MMR
    const pos = DreamDexRiskManager.evaluatePosition(
      "ETH-PERP",
      true,
      1.0,
      2500,
      2200,
      200,
      10
    );

    const risk = DreamDexRiskManager.evaluateRisk(pos);
    assert.strictEqual(risk.isSafe, false);
    assert.strictEqual(risk.actionRequired, "LIQUIDATE");
  });
});
