/**
 * PROTOCOL CONSTANTS
 * Mapping of On-chain Market IDs to human-readable asset pairs.
 * Deriverse Devnet uses 0-indexed IDs.
 */
export const MARKET_MAP: Record<number, string> = {
    0: "SOL-USDC",
    99: "LETTERA-USDC",
    100: "VELIT-USDC",
    // 2: "ETH-USDC",
    // 3: "PYTH-USDC", 
    // 4: "JUP-USDC",
};
  
export const getMarketName = (id: number): string => MARKET_MAP[id] || `UNKNOWN-${id}`;

// Map the Market Name to CoinGecko IDs for the Price API
export const COINGECKO_ID_MAP: Record<string, string> = {
    "SOL-USDC": "solana",
    // "BTC-USDC": "bitcoin",
    // "ETH-USDC": "ethereum",
    // "PYTH-USDC": "pyth-network",
    // "JUP-USDC": "jupiter-exchange"
};