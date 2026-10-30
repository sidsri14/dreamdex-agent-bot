import {
  type OrderBookDepth,
  type AgentSignal,
  type PerpetualPosition,
} from "./types.js";
import { DreamDexRiskManager } from "./risk-manager.js";

export class DreamDexStrategyAgent {
  private maxSpreadPercent: number;
  private defaultLeverage: number;
  private maxPositionUsd: number;

  constructor(
    maxSpreadPercent: number = 0.25,
    defaultLeverage: number = 5,
    maxPositionUsd: number = 2500
  ) {
    this.maxSpreadPercent = maxSpreadPercent;
    this.defaultLeverage = defaultLeverage;
    this.maxPositionUsd = maxPositionUsd;
  }

  /**
   * Evaluates order book order flow dynamics to generate directional perpetual signals.
   */
  public evaluateMarket(
    depth: OrderBookDepth,
    currentPosition?: PerpetualPosition
  ): AgentSignal {
    // 1. Check existing position risk first
    if (currentPosition && currentPosition.size > 0) {
      const risk = DreamDexRiskManager.evaluateRisk(currentPosition);
      if (risk.actionRequired === "LIQUIDATE" || risk.actionRequired === "AUTO_DELEVERAGE") {
        return {
          action: "CLOSE_POSITION",
          marketId: depth.marketId,
          confidencePercent: 95,
          targetSize: currentPosition.size,
          targetLeverage: currentPosition.leverage,
          triggerReason: `Proactive risk containment: ${risk.reason}`,
        };
      }
    }

    // 2. Evaluate Bid-Ask Spread Quality
    const midPrice = (depth.bestBid + depth.bestAsk) / 2;
    const spreadPercent = (depth.spread / midPrice) * 100;

    if (spreadPercent > this.maxSpreadPercent) {
      return {
        action: "HOLD",
        marketId: depth.marketId,
        confidencePercent: 0,
        targetSize: 0,
        targetLeverage: this.defaultLeverage,
        triggerReason: `Spread too wide (${spreadPercent.toFixed(3)}% > ${this.maxSpreadPercent}% max). Execution suppressed to avoid adverse selection.`,
      };
    }

    // 3. Compute Order Book Depth Imbalance
    const bidVolume = depth.bids.reduce((sum, b) => sum + b.size, 0);
    const askVolume = depth.asks.reduce((sum, a) => sum + a.size, 0);
    const totalVolume = bidVolume + askVolume;

    if (totalVolume === 0) {
      return {
        action: "HOLD",
        marketId: depth.marketId,
        confidencePercent: 0,
        targetSize: 0,
        targetLeverage: this.defaultLeverage,
        triggerReason: "Insufficient order book depth",
      };
    }

    const orderBookImbalance = (bidVolume - askVolume) / totalVolume; // Between -1.0 and +1.0

    // Size calculation: maxPositionUsd / midPrice
    const targetSize = Math.round((this.maxPositionUsd / midPrice) * 100) / 100;

    // Strong bid demand (buy pressure)
    if (orderBookImbalance >= 0.20 && (!currentPosition || !currentPosition.isLong)) {
      const confidence = Math.min(95, Math.round(50 + orderBookImbalance * 50));
      return {
        action: "OPEN_LONG",
        marketId: depth.marketId,
        confidencePercent: confidence,
        targetSize,
        targetLeverage: this.defaultLeverage,
        triggerReason: `Order book skewed bullish (imbalance: +${(orderBookImbalance * 100).toFixed(1)}%). Tight spread (${spreadPercent.toFixed(3)}%).`,
      };
    }

    // Strong ask supply (sell pressure)
    if (orderBookImbalance <= -0.20 && (!currentPosition || currentPosition.isLong)) {
      const confidence = Math.min(95, Math.round(50 + Math.abs(orderBookImbalance) * 50));
      return {
        action: "OPEN_SHORT",
        marketId: depth.marketId,
        confidencePercent: confidence,
        targetSize,
        targetLeverage: this.defaultLeverage,
        triggerReason: `Order book skewed bearish (imbalance: ${(orderBookImbalance * 100).toFixed(1)}%). Tight spread (${spreadPercent.toFixed(3)}%).`,
      };
    }

    return {
      action: "HOLD",
      marketId: depth.marketId,
      confidencePercent: 25,
      targetSize: 0,
      targetLeverage: this.defaultLeverage,
      triggerReason: `Order book balanced (imbalance: ${(orderBookImbalance * 100).toFixed(1)}%). No clear directional edge.`,
    };
  }
}
