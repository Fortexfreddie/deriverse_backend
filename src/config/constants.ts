/**
 * PROTOCOL CONSTANTS
 * Mapping of On-chain Market IDs to human-readable asset pairs.
 * Deriverse Devnet uses 0-indexed IDs.
 */
// export const MARKET_MAP: Record<number, string> = {
//     0: "SOL-USDC",
//     99: "LETTERA-USDC",
//     100: "VELIT-USDC",
//     // 2: "ETH-USDC",
//     // 3: "PYTH-USDC", 
//     // 4: "JUP-USDC",
// };

export const MARKET_MAP: Record<number, string> = {
    0: 'SOL-USDC',
    2: 'LETTERA-USDC',
    4: 'VELIT-USDC',
    6: 'SUN-USDC',
    8: 'BRSH-USDC',
    10: 'MSHK-USDC',
    12: 'SOL-USDC-V2', // Native Mint 2022
    14: 'trs-USDC',
    16: 'sad-USDC',
    18: 'MDVD-USDC',
    20: '333-USDC',
    22: 'BRSH-USDC-V2',
    24: '1-USDC',
    26: 'TST-USDC',
    28: 'asd-USDC'
};

export const DECIMAL_MAP: Record<number, number> = {
    0: 9,  // SOL
    2: 5,  // LETTERA
    4: 6,  // VELIT
    6: 4,  // SUN
    8: 6,  // BRSH
    10: 4, // MSHK
    12: 6, // SOL (Log shows 6 for Asset 14)
    14: 6, // trs
    16: 6, // sad
    18: 9, // MDVD
    20: 9, // 333
    22: 4, // BRSH (Asset 24)
    24: 6, // 1
    26: 6, // TST
    28: 6  // asd
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