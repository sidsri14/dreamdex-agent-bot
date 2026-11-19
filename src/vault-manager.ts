/**
 * DreamDEX Liquidity Vault & Staking Yield Manager.
 *
 * Implements ERC-4626 style vault accounting, fee redistribution accrual,
 * and automated margin-to-vault collateral rebalancing for perpetual trading agents.
 */

import {
  VaultState,
  StakerPosition,
  PerpetualPosition,
  VaultRebalanceDecision,
} from "./types.js";

export class DreamDEXVaultManager {
  private vaultState: VaultState;
  private positions: Map<string, StakerPosition> = new Map();

  constructor(
    vaultId: string = "somnia-dreamdex-usdc-vault",
    symbol: string = "dvUSDC",
    initialApy: number = 18.5
  ) {
    this.vaultState = {
      vaultId,
      symbol,
      totalAssetsUsd: 100_000,
      totalShares: 100_000,
      sharePriceUsd: 1.0,
      annualizedApyPercent: initialApy,
      feeDistributionPoolUsd: 0,
    };
  }

  public getVaultState(): Readonly<VaultState> {
    return { ...this.vaultState };
  }

  public getStakerPosition(userAddress: string): StakerPosition | undefined {
    return this.positions.get(userAddress.toLowerCase());
  }

  /**
   * Deposit collateral into the vault and mint LP shares.
   */
  public deposit(userAddress: string, amountUsd: number): StakerPosition {
    if (amountUsd <= 0) {
      throw new Error("Deposit amount must be strictly positive");
    }

    const currentSharePrice = this.vaultState.totalShares === 0
      ? 1.0
      : this.vaultState.totalAssetsUsd / this.vaultState.totalShares;

    const sharesToMint = amountUsd / currentSharePrice;

    this.vaultState.totalAssetsUsd += amountUsd;
    this.vaultState.totalShares += sharesToMint;
    this.vaultState.sharePriceUsd = this.vaultState.totalAssetsUsd / this.vaultState.totalShares;

    const key = userAddress.toLowerCase();
    const existing = this.positions.get(key);

    if (existing) {
      existing.shares += sharesToMint;
      existing.depositedUsd += amountUsd;
      existing.unrealizedYieldUsd = (existing.shares * this.vaultState.sharePriceUsd) - existing.depositedUsd;
      existing.lastAccrualTimestamp = Date.now();
      return { ...existing };
    } else {
      const newPos: StakerPosition = {
        userAddress: key,
        vaultId: this.vaultState.vaultId,
        shares: sharesToMint,
        depositedUsd: amountUsd,
        unrealizedYieldUsd: 0,
        lastAccrualTimestamp: Date.now(),
      };
      this.positions.set(key, newPos);
      return { ...newPos };
    }
  }

  /**
   * Withdraw collateral from the vault by burning LP shares.
   */
  public withdraw(userAddress: string, sharesToBurn: number): number {
    const key = userAddress.toLowerCase();
    const existing = this.positions.get(key);

    if (!existing || existing.shares < sharesToBurn) {
      throw new Error("Insufficient vault shares to redeem");
    }

    if (sharesToBurn <= 0) {
      throw new Error("Withdraw shares must be strictly positive");
    }

    const currentSharePrice = this.vaultState.totalAssetsUsd / this.vaultState.totalShares;
    const payoutUsd = sharesToBurn * currentSharePrice;

    this.vaultState.totalAssetsUsd -= payoutUsd;
    this.vaultState.totalShares -= sharesToBurn;
    this.vaultState.sharePriceUsd = this.vaultState.totalShares === 0
      ? 1.0
      : this.vaultState.totalAssetsUsd / this.vaultState.totalShares;

    existing.shares -= sharesToBurn;
    existing.depositedUsd = Math.max(0, existing.depositedUsd - payoutUsd);
    existing.unrealizedYieldUsd = Math.max(0, (existing.shares * this.vaultState.sharePriceUsd) - existing.depositedUsd);
    existing.lastAccrualTimestamp = Date.now();

    return payoutUsd;
  }

  /**
   * Distribute perpetual exchange protocol fees to vault stakers.
   * Standard DreamDEX model allocates 30% of taker fees to vault LP pool.
   */
  public accrueProtocolFees(takerFeeUsd: number): void {
    if (takerFeeUsd <= 0) return;
    const lpShareUsd = takerFeeUsd * 0.30;
    this.vaultState.totalAssetsUsd += lpShareUsd;
    this.vaultState.feeDistributionPoolUsd += lpShareUsd;
    if (this.vaultState.totalShares > 0) {
      this.vaultState.sharePriceUsd = this.vaultState.totalAssetsUsd / this.vaultState.totalShares;
    }
  }

  /**
   * Evaluates active perp position margin vs vault reserves and issues rebalancing recommendations.
   */
  public evaluateCollateralRebalance(
    position: PerpetualPosition,
    idleBalanceUsd: number,
    stakerPosition?: StakerPosition
  ): VaultRebalanceDecision {
    // 1. High risk: margin ratio <= 20% -> urgent withdrawal needed from vault to avoid liquidation
    if (position.marginRatioPercent <= 20.0) {
      const targetBuffer = 0.30; // Aim for 30% margin ratio
      const notionalUsd = position.size * position.markPrice;
      const requiredMarginUsd = notionalUsd * targetBuffer;
      const deficitUsd = Math.max(0, requiredMarginUsd - position.collateralUsd);

      if (deficitUsd > 0 && stakerPosition && stakerPosition.shares > 0) {
        const availableInVaultUsd = stakerPosition.shares * this.vaultState.sharePriceUsd;
        const withdrawAmount = Math.min(deficitUsd, availableInVaultUsd);

        return {
          action: "WITHDRAW_FROM_VAULT",
          amountUsd: Number(withdrawAmount.toFixed(2)),
          reason: `Margin ratio at ${position.marginRatioPercent.toFixed(1)}% <= 20% threshold. Emergency withdrawal needed to prevent liquidation.`,
          targetMarginRatioPercent: 30.0,
        };
      }
    }

    // 2. Ultra-safe: margin ratio >= 45% and idle cash available -> deposit to vault for yield
    if (position.marginRatioPercent >= 45.0 && idleBalanceUsd > 100) {
      // Allocate 50% of idle cash to vault
      const depositAmount = idleBalanceUsd * 0.50;

      return {
        action: "DEPOSIT_TO_VAULT",
        amountUsd: Number(depositAmount.toFixed(2)),
        reason: `Position is ultra-healthy (${position.marginRatioPercent.toFixed(1)}% margin). Deploying idle capital to earn protocol staking yield.`,
        targetMarginRatioPercent: position.marginRatioPercent,
      };
    }

    return {
      action: "MAINTAIN",
      amountUsd: 0,
      reason: "Collateral allocation is balanced. Margin ratio within optimal operating corridor [20%, 45%].",
      targetMarginRatioPercent: position.marginRatioPercent,
    };
  }
}
