import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DreamDEXVaultManager } from "../src/vault-manager.js";
import { PerpetualPosition } from "../src/types.js";

describe("DreamDEX Vault & Staking Suite", () => {
  it("deposits collateral and issues correct 1:1 LP shares initially", () => {
    const vm = new DreamDEXVaultManager();
    const pos = vm.deposit("0xUser1234", 10_000);

    assert.equal(pos.userAddress, "0xuser1234");
    assert.equal(pos.shares, 10_000);
    assert.equal(pos.depositedUsd, 10_000);

    const state = vm.getVaultState();
    assert.equal(state.totalAssetsUsd, 110_000);
    assert.equal(state.totalShares, 110_000);
    assert.equal(state.sharePriceUsd, 1.0);
  });

  it("accrues 30% protocol fee distribution and elevates share price", () => {
    const vm = new DreamDEXVaultManager();
    vm.deposit("0xUser1234", 10_000);

    // Simulate $1,000 taker fees generated on Somnia CLOB
    vm.accrueProtocolFees(1_000);

    const state = vm.getVaultState();
    // 30% of $1,000 = $300 added to vault
    assert.equal(state.feeDistributionPoolUsd, 300);
    assert.equal(state.totalAssetsUsd, 110_300);
    assert.ok(state.sharePriceUsd > 1.0);

    // Verify share price appreciation: 110,300 / 110,000 ≈ 1.002727
    const expectedSharePrice = 110_300 / 110_000;
    assert.ok(Math.abs(state.sharePriceUsd - expectedSharePrice) < 0.00001);
  });

  it("redeems shares and distributes proportional principal + yield payout", () => {
    const vm = new DreamDEXVaultManager();
    vm.deposit("0xTraderA", 20_000);
    vm.accrueProtocolFees(5_000); // $1,500 fee added

    const stateBefore = vm.getVaultState();
    const payout = vm.withdraw("0xTraderA", 10_000); // Withdraw half shares

    assert.ok(payout > 10_000); // Principal + accumulated yield
    const remainingPos = vm.getStakerPosition("0xTraderA");
    assert.ok(remainingPos);
    assert.equal(remainingPos.shares, 10_000);
  });

  it("rejects withdrawal if user attempts to redeem more shares than owned", () => {
    const vm = new DreamDEXVaultManager();
    vm.deposit("0xTraderB", 5_000);

    assert.throws(
      () => vm.withdraw("0xTraderB", 6_000),
      /Insufficient vault shares to redeem/
    );
  });

  it("recommends emergency WITHDRAW_FROM_VAULT when position margin ratio drops <= 20%", () => {
    const vm = new DreamDEXVaultManager();
    const stakerPos = vm.deposit("0xTraderRisk", 15_000);

    // Stressed 10x position with low margin ratio (12%)
    const stressedPosition: PerpetualPosition = {
      marketId: "SOMNIA-ETH-PERP",
      isLong: true,
      size: 5.0,
      entryPrice: 3000,
      markPrice: 2800,
      collateralUsd: 1680,
      leverage: 10,
      liquidationPrice: 2750,
      unrealizedPnlUsd: -1000,
      marginRatioPercent: 12.0, // Critical
    };

    const decision = vm.evaluateCollateralRebalance(stressedPosition, 50, stakerPos);
    assert.equal(decision.action, "WITHDRAW_FROM_VAULT");
    assert.ok(decision.amountUsd > 0);
    assert.match(decision.reason, /Emergency withdrawal needed/);
  });

  it("recommends DEPOSIT_TO_VAULT when position is ultra-safe >= 45% and idle cash is available", () => {
    const vm = new DreamDEXVaultManager();

    // Ultra-safe low leverage position
    const safePosition: PerpetualPosition = {
      marketId: "SOMNIA-BTC-PERP",
      isLong: true,
      size: 0.5,
      entryPrice: 90000,
      markPrice: 92000,
      collateralUsd: 25000,
      leverage: 2,
      liquidationPrice: 45000,
      unrealizedPnlUsd: 1000,
      marginRatioPercent: 54.3, // Ultra-safe
    };

    const decision = vm.evaluateCollateralRebalance(safePosition, 5000);
    assert.equal(decision.action, "DEPOSIT_TO_VAULT");
    assert.equal(decision.amountUsd, 2500); // 50% of 5000
    assert.match(decision.reason, /Deploying idle capital/);
  });

  it("recommends MAINTAIN when margin ratio is within balanced corridor [20%, 45%]", () => {
    const vm = new DreamDEXVaultManager();

    const balancedPosition: PerpetualPosition = {
      marketId: "SOMNIA-ETH-PERP",
      isLong: false,
      size: 2.0,
      entryPrice: 3000,
      markPrice: 2950,
      collateralUsd: 2000,
      leverage: 3,
      liquidationPrice: 3800,
      unrealizedPnlUsd: 100,
      marginRatioPercent: 33.9,
    };

    const decision = vm.evaluateCollateralRebalance(balancedPosition, 500);
    assert.equal(decision.action, "MAINTAIN");
    assert.equal(decision.amountUsd, 0);
  });
});
