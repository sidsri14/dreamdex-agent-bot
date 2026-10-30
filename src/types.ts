/**
 * Core type definitions for Somnia DreamDEX Perpetual Trading Bot.
 */

export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

export interface OrderBookDepth {
  marketId: string;
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  timestamp: number;
}

export interface SessionKeyOperatorConfig {
  operatorAddress: string;
  ownerAddress: string;
  isAuthorized: boolean;
  maxNotionalUsd: number;
  allowedMarkets: string[];
  expiresAt: number;
}

export interface PerpetualOrderRequest {
  marketId: string;
  isBid: boolean;
  size: number;
  price?: number;
  orderType: OrderType;
  leverage: number;
  operatorAddress: string;
}

export interface PlacedOrderReceipt {
  orderId: string;
  marketId: string;
  isBid: boolean;
  executedSize: number;
  executedPrice: number;
  feeUsd: number;
  notionalUsd: number;
  status: "FILLED" | "PARTIALLY_FILLED" | "REJECTED";
  timestamp: number;
}

export interface PerpetualPosition {
  marketId: string;
  isLong: boolean;
  size: number;
  entryPrice: number;
  markPrice: number;
  collateralUsd: number;
  leverage: number;
  liquidationPrice: number;
  unrealizedPnlUsd: number;
  marginRatioPercent: number;
}

export interface RiskEvaluationResult {
  isSafe: boolean;
  marginRatioPercent: number;
  liquidationBufferPercent: number;
  actionRequired: "NONE" | "MARGIN_CALL" | "AUTO_DELEVERAGE" | "LIQUIDATE";
  reason?: string;
}

export interface AgentSignal {
  action: "OPEN_LONG" | "OPEN_SHORT" | "CLOSE_POSITION" | "HOLD";
  marketId: string;
  confidencePercent: number;
  targetSize: number;
  targetLeverage: number;
  triggerReason: string;
}
