import { rpc, deriverseEngine, programId } from '../config/deriverse';
import { TradeEvent } from '../types';
import { getMarketName, DECIMAL_MAP } from '../config/constants';

// const PRICE_DEC = 1e9;
// const ASSET_DEC = 1e9;
const QUOTE_DEC = 1e6; // USDC has 6 decimals

/**
 * BLOCKCHAIN SERVICE
 * Handles fetching transaction signatures from Solana and decoding trade events
 * from transaction logs using the Deriverse Engine IDL.
 */
export class BlockchainService {
    // Helper to wait between retries or rate limit events
    private wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * RETRY WRAPPER
     * Handles 429 (Too Many Requests) errors by waiting and retrying.
     * Essential for public RPCs and free-tier providers like Helius.
     */
    private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
        try {
            return await fn();
        } catch (err: any) {
            const isRateLimit = err.message?.includes('429') || err.context?.statusCode === 429;
            if (retries > 0 && isRateLimit) {
                console.log(`Rate limited. Retrying in ${delay}ms... (${retries} left)`);
                await this.wait(delay);
                return this.withRetry(fn, retries - 1, delay * 2);
            }
            throw err;
        }
    }

    /**
     * Fetches and decodes trades for a specific wallet address
     * @param walletAddress - Solana wallet address to fetch trades for
     * @param limit - Maximum number of transactions to fetch
     * @returns Array of decoded TradeEvent objects
     */
    async fetchDecodedTrades(walletAddress: string, limit: number = 50, since?: Date): Promise<TradeEvent[]> {
        const allTrades: TradeEvent[] = [];

        console.log(`Fetching signatures (Limit: ${limit})...`);
        
        // Wrap signature fetch in retry logic
        const sigsResponse: any = await this.withRetry(() => 
            (rpc as any).getSignaturesForAddress(walletAddress as any, { limit }).send()
        );
        
        const signatures = Array.isArray(sigsResponse) ? sigsResponse : (sigsResponse?.value || []);
        
        const validSigs = signatures.filter((s: any) => s.err === null)
            .filter((s: any) => {
                if (!since || !s.blockTime) return true;
                return Number(s.blockTime) * 1000 > since.getTime();
            });
        
        console.log(`Found ${validSigs.length} successful transactions`);

        for (const sigInfo of validSigs) {
            try {
                // Throttle requests slightly to avoid aggressive rate limiting
                await this.wait(100);

                // Wrap transaction fetch in retry logic
                const tx = await this.withRetry(() => 
                    (rpc as any).getTransaction(sigInfo.signature, { 
                        maxSupportedTransactionVersion: 0 
                    }).send()
                );
                
                // Cast to any to access metadata properties without TS errors
                const txData = tx as any;
                const logs = txData?.value?.meta?.logMessages || txData?.meta?.logMessages || [];

                if (logs.some((line: string) => line.startsWith("Program data: "))) {
                    const decoded = await this.decodeBinaryLogs(logs);
                    
                    // Accurate Fees & Timestamp
                    // Explicitly cast to Number before dividing
                    const rawFee = txData?.value?.meta?.fee || txData?.meta?.fee || 0;
                    const networkFee = Number(rawFee) / 1e9; 
                    const txBlockTime = txData?.blockTime || txData?.value?.blockTime || sigInfo.blockTime;

                    const parsed = this.mapEventsToTrades(decoded, sigInfo.signature, txBlockTime, networkFee);
                    
                    if (parsed.length > 0) {
                        allTrades.push(...parsed);
                        console.log(`Signature: ${sigInfo.signature.substring(0, 8)}... | Parsed ${parsed.length} trade(s)`);
                    }
                }
            } catch (err: any) {
                console.error(`Error processing signature ${sigInfo.signature.substring(0, 8)}:`, err.message);
            }
        }
        return allTrades;
    }

    private extractProgramData(logMessages: string[]): string[] {
        const data: string[] = [];
        for (const log of logMessages) {
            const match = log.match(/Program data:\s*([A-Za-z0-9+/=]+)/i);
            if (match?.[1]) data.push(match[1]);
        }
        return data;
    }

    private async decodeBinaryLogs(logs: string[]): Promise<any[]> {
        try {
            const decoded = await (deriverseEngine as any).logsDecode(logs);
            if (decoded && decoded.length > 0) return decoded;
        } catch (e) { }

        const decoded: any[] = [];
        const b64Entries = this.extractProgramData(logs);
        
        for (const b64 of b64Entries) {
            const formats = [
                `Program ${programId} data: ${b64}`,
                `Program data: ${b64}`,
                b64
            ];

            for (const formatted of formats) {
                try {
                    const result = await (deriverseEngine as any).logsDecode([formatted]);
                    if (result && result.length > 0) {
                        decoded.push(...result);
                        break;
                    }
                } catch { }
            }
        }
        return decoded;
    }

    private mapEventsToTrades(events: any[], signature: string, blockTime: any, networkFee: number = 0): TradeEvent[] {
        const trades: TradeEvent[] = [];
        const timestamp = blockTime ? new Date(Number(blockTime) * 1000) : new Date();
        
        // 1. Link Order IDs to Market IDs from all events in the tx
        const orderIdToInstrId = new Map<number, number>();
        events.forEach(msg => {
            const possibleId = msg.instrId ?? msg.marketId;
            if (msg.orderId != null && possibleId != null) {
                orderIdToInstrId.set(Number(msg.orderId), Number(possibleId));
            }
        });

        // 2. Aggregate Fees & Funding
        let totalFees = networkFee;
        let fundingValue = 0;
        events.forEach((e: any) => {
            if (e.tag === 15 || e.tag === 23 || e.fees !== undefined) {
                const feeVal = e.fees !== undefined ? e.fees : (e.rebates || 0);
                totalFees += Math.abs(Number(feeVal)) / QUOTE_DEC;
            }
            if (e.tag === 24 || e.funding !== undefined) {
                fundingValue += Number(e.funding || 0) / QUOTE_DEC;
            }
        });

        // 3. Filter for Fills
        const tradeEvents = events.filter((e: any) => 
            e.tag === 11 || e.tag === 19 || (e.price !== undefined && (e.qty || e.perps))
        );

        const feePerTrade = tradeEvents.length > 0 ? totalFees / tradeEvents.length : 0;

        for (const e of tradeEvents) {
            // 1. Resolve Instrument ID
            let instrId = e.instrId ?? e.marketId ?? orderIdToInstrId.get(Number(e.orderId)) ?? -1;
            
            const rawPrice = Number(e.price);
            const rawQty = Number(e.qty ?? e.perps ?? 0);

            if (instrId === -1) {
                if (rawPrice >= 10000) {
                    instrId = 2; // LETTERA/USDC (~$13.5k)
                } 
                else if (rawPrice >= 3000 && rawPrice <= 4000) {
                    instrId = 6; // SUN/USDC (~$3.2k)
                }
                else if (rawPrice >= 900 && rawPrice <= 1100) {
                    instrId = 14; // trs/USDC (~$1k)
                }
                else if (rawPrice >= 70 && rawPrice <= 150) {
                    instrId = 0; // SOL/USDC (~$85)
                }
                else if (rawPrice >= 0.8 && rawPrice <= 1.2) {
                    instrId = 4; // VELIT/USDC (~$1)
                }
                // If it doesn't match any of these, it stays -1 and symbol stays "UNKNOWN"
            }

            // 2. Resolve Decimals from our DECIMAL_MAP
            const decimals = DECIMAL_MAP[instrId] ?? 9; 
            const divisor = Math.pow(10, decimals);

            const trade: TradeEvent = {
                signature,
                side: (e.side === 0 || e.side === 'buy') ? 'BUY' : 'SELL',
                price: rawPrice,
                size: rawQty / divisor, // Scaled correctly based on Asset ID
                marketId: instrId,
                symbol: getMarketName(instrId),
                timestamp,
                fee: feePerTrade,
                tradeType: (e.tag === 19 || e.perps !== undefined) ? 'PERP' : 'SPOT'
            };

            // 4. Order Type Inference (Keep your robust logic)
            if (e.orderType !== undefined && e.orderType !== null) {
                trade.orderType = e.orderType === 0 ? 'LIMIT' : 'MARKET';
            } else if (e.clientId === 1 || e.clientId === 923 || e.tag === 11 || e.tag === 19) {
                trade.orderType = 'MARKET';
            } else {
                trade.orderType = 'LIMIT'; 
            }

            (trade as any).notional = trade.price * trade.size;
            (trade as any).fundingValue = fundingValue;
            trades.push(trade);
        }
        return trades;
    }
}