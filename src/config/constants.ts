/**
 * PROTOCOL CONSTANTS
 * Mapping of On-chain Market IDs to human-readable asset pairs.
 * Deriverse Devnet uses 0-indexed IDs.
 */

export const MARKET_MAP: Record<number, string> = {
    0: 'SOL-PERP', // Change 1 to 0
    1: 'BTC-PERP', // Change 2 to 1
    2: 'ETH-PERP', // Change 3 to 2
};
  
export const getMarketName = (id: number): string => MARKET_MAP[id] || `UNKNOWN-${id}`;