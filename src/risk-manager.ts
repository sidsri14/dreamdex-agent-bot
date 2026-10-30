import {
  type PerpetualPosition,
  type RiskEvaluationResult,
} from "./types.js";

export const MAINTENANCE_MARGIN_PERCENT = 5.0; // 5% MMR for 20x max leverage
export const MARGIN_CALL_THRESHOLD_PERCENT = 12.0; // Alert warning threshold
export const AUTO_DELEVERAGE_THRESHOLD_PERCENT = 8.0; // Proactive safety deleverage

export class DreamDexRiskManager {
  /**
   * Computes position liquidation price given entry, leverage, and side.
   */
  public static calculateLiquidationPrice(
    entryPrice: number,
    leverage: number,
    isLong: boolean,
    mmrPercent: number = MAINTENANCE_MARGIN_PERCENT
  ): number {
    if (leverage <= 0) throw new Error("Leverage must be positive");
    const mmr = mmrPercent / 100;
    const initialMarginRate = 1 / leverage;

    const rawPrice = isLong
      ? entryPrice * (1 - initialMarginRate + mmr)
      : entryPrice * (1 + initialMarginRate - mmr);

    return Math.round(rawPrice * 10000) / 10000;
  }

  /**
   * Computes live position metrics given current mark price.
   */
  public static evaluatePosition(
    marketId: string,
    isLong: boolean,
    size: number,
    entryPrice: number,
    markPrice: number,
    collateralUsd: number,
    leverage: number
  ): PerpetualPosition {
    const unrealizedPnlUsd = isLong
      ? (markPrice - entryPrice) * size
      : (entryPrice - markPrice) * size;

    const notionalUsd = markPrice * size;
    const equityUsd = Math.max(0, collateralUsd + unrealizedPnlUsd);

    const marginRatioPercent = notionalUsd > 0
      ? (equityUsd / notionalUsd) * 100
      : 100;

    const liquidationPrice = this.calculateLiquidationPrice(
      entryPrice,
      leverage,
      isLong
    );

    return {
      marketId,
      isLong,
      size,
      entryPrice,
      markPrice,
      collateralUsd,
      leverage,
      liquidationPrice,
      unrealizedPnlUsd,
      marginRatioPercent: Math.round(marginRatioPercent * 100) / 100,
    };
  }

  /**
   * Evaluates position risk and determines if proactive protective action is required.
   */
  public static evaluateRisk(position: PerpetualPosition): RiskEvaluationResult {
    const currentPrice = position.markPrice;
    const distanceToLiquidation = Math.abs(currentPrice - position.liquidationPrice);
    const liquidationBufferPercent = (distanceToLiquidation / currentPrice) * 100;

    if (position.marginRatioPercent <= MAINTENANCE_MARGIN_PERCENT) {
      return {
        isSafe: false,
        marginRatioPercent: position.marginRatioPercent,
        liquidationBufferPercent: 0,
        actionRequired: "LIQUIDATE",
        reason: `Margin ratio (${position.marginRatioPercent}%) has breached Maintenance Margin Requirement (${MAINTENANCE_MARGIN_PERCENT}%)`,
      };
    }

    if (position.marginRatioPercent <= AUTO_DELEVERAGE_THRESHOLD_PERCENT) {
      return {
        isSafe: false,
        marginRatioPercent: position.marginRatioPercent,
        liquidationBufferPercent,
        actionRequired: "AUTO_DELEVERAGE",
        reason: `Margin ratio (${position.marginRatioPercent}%) dangerously close to liquidation threshold. Immediate 50% position reduction recommended.`,
      };
    }

    if (position.marginRatioPercent <= MARGIN_CALL_THRESHOLD_PERCENT) {
      return {
        isSafe: true,
        marginRatioPercent: position.marginRatioPercent,
        liquidationBufferPercent,
        actionRequired: "MARGIN_CALL",
        reason: `Warning: Position margin ratio (${position.marginRatioPercent}%) entering cautionary zone. Deposit collateral or reduce position size.`,
      };
    }

    return {
      isSafe: true,
      marginRatioPercent: position.marginRatioPercent,
      liquidationBufferPercent,
      actionRequired: "NONE",
    };
  }
}
