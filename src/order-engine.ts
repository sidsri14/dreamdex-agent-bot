import {
  type OrderBookDepth,
  type PerpetualOrderRequest,
  type PlacedOrderReceipt,
  type SessionKeyOperatorConfig,
} from "./types.js";

export const DREAMDEX_TAKER_FEE_RATE = 0.0005; // 0.05%

export class DreamDexOrderEngine {
  private operators: Map<string, SessionKeyOperatorConfig> = new Map();
  private cumulativeNotional: Map<string, number> = new Map();

  /**
   * Registers a session key with bounded permissions (grantOperator pattern).
   */
  public registerOperator(config: SessionKeyOperatorConfig): void {
    this.operators.set(config.operatorAddress.toLowerCase(), config);
    this.cumulativeNotional.set(config.operatorAddress.toLowerCase(), 0);
  }

  /**
   * Verifies that the operator is authorized to place an order under strict limits.
   */
  public validateOperatorPermissions(
    operatorAddress: string,
    marketId: string,
    notionalUsd: number
  ): { valid: boolean; error?: string } {
    const op = this.operators.get(operatorAddress.toLowerCase());
    if (!op || !op.isAuthorized) {
      return { valid: false, error: "Operator session key not authorized" };
    }

    if (Date.now() > op.expiresAt) {
      return { valid: false, error: "Operator session key has expired" };
    }

    if (!op.allowedMarkets.includes(marketId)) {
      return {
        valid: false,
        error: `Market '${marketId}' not in operator's permitted markets whitelist`,
      };
    }

    const currentSpent = this.cumulativeNotional.get(operatorAddress.toLowerCase()) ?? 0;
    if (currentSpent + notionalUsd > op.maxNotionalUsd) {
      return {
        valid: false,
        error: `Order notional $${notionalUsd.toFixed(2)} exceeds remaining operator allowance ($${(op.maxNotionalUsd - currentSpent).toFixed(2)})`,
      };
    }

    return { valid: true };
  }

  /**
   * Executes a perpetual order against the live CLOB depth with slippage calculation.
   */
  public executeOrder(
    request: PerpetualOrderRequest,
    depth: OrderBookDepth
  ): PlacedOrderReceipt {
    if (depth.marketId !== request.marketId) {
      throw new Error(`Depth market mismatch: expected ${request.marketId}, got ${depth.marketId}`);
    }

    if (request.size <= 0) {
      throw new Error("Order size must be greater than zero");
    }

    if (request.leverage < 1 || request.leverage > 20) {
      throw new Error("Leverage must be between 1x and 20x");
    }

    // Determine target execution price based on order book depth
    const levels = request.isBid ? depth.asks : depth.bids;
    if (levels.length === 0) {
      throw new Error("Order book depth is empty on execution side");
    }

    let remainingSize = request.size;
    let totalCost = 0;
    let executedSize = 0;

    for (const level of levels) {
      const takeSize = Math.min(remainingSize, level.size);
      totalCost += takeSize * level.price;
      executedSize += takeSize;
      remainingSize -= takeSize;
      if (remainingSize <= 0) break;
    }

    if (executedSize === 0) {
      throw new Error("Unable to execute order against available order book liquidity");
    }

    const executedPrice = totalCost / executedSize;
    const notionalUsd = totalCost;

    // Validate operator limits before finalizing
    const validation = this.validateOperatorPermissions(
      request.operatorAddress,
      request.marketId,
      notionalUsd
    );

    if (!validation.valid) {
      throw new Error(`Operator permission violation: ${validation.error}`);
    }

    // Update cumulative notional
    const currentSpent = this.cumulativeNotional.get(request.operatorAddress.toLowerCase()) ?? 0;
    this.cumulativeNotional.set(request.operatorAddress.toLowerCase(), currentSpent + notionalUsd);

    const feeUsd = notionalUsd * DREAMDEX_TAKER_FEE_RATE;

    const orderId = `dd_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      orderId,
      marketId: request.marketId,
      isBid: request.isBid,
      executedSize,
      executedPrice,
      feeUsd,
      notionalUsd,
      status: remainingSize === 0 ? "FILLED" : "PARTIALLY_FILLED",
      timestamp: Date.now(),
    };
  }

  /**
   * Returns remaining notional quota for an operator.
   */
  public getRemainingNotional(operatorAddress: string): number {
    const op = this.operators.get(operatorAddress.toLowerCase());
    if (!op) return 0;
    const spent = this.cumulativeNotional.get(operatorAddress.toLowerCase()) ?? 0;
    return Math.max(0, op.maxNotionalUsd - spent);
  }
}
