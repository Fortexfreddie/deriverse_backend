/**
 * SHARED TYPE DEFINITIONS
 */

export interface TradeEvent {
    signature: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    marketId: number;
    symbol: string;
    timestamp: Date;
    fee?: number;
    feeCurrency?: string; // e.g. 'USDC'
    notional?: number; // price * size
    orderType?: 'LIMIT' | 'MARKET' | 'IOC';
    tradeType?: 'SPOT' | 'PERP'; // Determined from log tag (11 = SPOT, 19 = PERP)
}
  
export interface SyncResult {
    success: boolean;
    positionsUpdated: number;
    fillsCreated: number;
}

export interface WalletPerformance {
    positionId: string;
    market: string;
    side: 'LONG' | 'SHORT';
    entry: number;
    current: number;
    size: number;
    unrealized: number;
    realized: number;
}

export type SentimentResult = {
  headlines: string[];
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  macroContext: string;
};

export interface CryptoPanicResponse {
  results?: Array<{
    title: string;
    [key: string]: any;
  }>;
}