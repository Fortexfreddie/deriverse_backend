import { rpc, deriverseEngine, programId } from '../config/deriverse';
import { TradeEvent } from '../types';
import { getMarketName } from '../config/constants';

// const PRICE_DEC = 1e9;
// const ASSET_DEC = 1e9;
const QUOTE_DEC = 1e6; // USDC has 6 decimals

/**
 * BLOCKCHAIN SERVICE
 * Handles fetching transaction signatures from Solana and decoding trade events
 * from transaction logs using the Deriverse Engine IDL.
 */
export class BlockchainService {
    /**
     * Fetches and decodes trades for a specific wallet address
     * @param walletAddress - Solana wallet address to fetch trades for
     * @param limit - Maximum number of transactions to fetch
     * @returns Array of decoded TradeEvent objects
     */
    async fetchDecodedTrades(walletAddress: string, limit: number = 50, since?: Date): Promise<TradeEvent[]> {
        const allTrades: TradeEvent[] = [];

        console.log(`Fetching signatures (Limit: ${limit})...`);
        const sigsResponse: any = await (rpc as any).getSignaturesForAddress(walletAddress as any, { limit }).send();
        const signatures = Array.isArray(sigsResponse) ? sigsResponse : (sigsResponse?.value || []);
        
        const validSigs = signatures.filter((s: any) => s.err === null)
            .filter((s: any) => {
                if (!since || !s.blockTime) return true;
                return Number(s.blockTime) * 1000 > since.getTime();
            });
        
        console.log(`Found ${validSigs.length} successful transactions`);

        for (const sigInfo of validSigs) {
            try {
                const tx = await (rpc as any).getTransaction(sigInfo.signature, { 
                    maxSupportedTransactionVersion: 0 
                }).send();
                
                const logs = tx?.value?.meta?.logMessages || tx?.meta?.logMessages || [];

                if (logs.some((line: string) => line.startsWith("Program data: "))) {
                    const decoded = await this.decodeBinaryLogs(logs);
                    
                    // Accurate Fees & Timestamp
                    // Explicitly cast to Number before dividing
                    const rawFee = tx?.value?.meta?.fee || tx?.meta?.fee || 0;
                    const networkFee = Number(rawFee) / 1e9; 
                    const txBlockTime = tx?.blockTime || tx?.value?.blockTime || sigInfo.blockTime;

                    const parsed = this.mapEventsToTrades(decoded, sigInfo.signature, txBlockTime, networkFee);
                    
                    if (parsed.length > 0) {
                        allTrades.push(...parsed);
                        console.log(`Signature: ${sigInfo.signature.substring(0, 8)}... | Parsed ${parsed.length} trade(s)`);
                    }
                }
            } catch (err) {
                console.error(`Error processing signature ${sigInfo.signature.substring(0, 8)}:`, err);
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
        
        // 1. Pre-process ALL events to link Order IDs and Market IDs (From your older logic)
        const orderIdToInstrId = new Map<number, number>();
        events.forEach(msg => {
            const possibleId = msg.instrId ?? msg.marketId ?? msg.assetId ?? msg.instrumentIndex;
            if (msg.orderId != null && possibleId != null) {
                orderIdToInstrId.set(Number(msg.orderId), Number(possibleId));
            }
        });

        let totalFees = networkFee;
        let fundingValue = 0;

        // 2. Aggregate Fees & Funding (Tag 15/23/24)
        events.forEach((e: any) => {
            if (e.tag === 15 || e.tag === 23 || e.fees !== undefined) {
                const feeVal = e.fees !== undefined ? e.fees : (e.rebates || 0);
                totalFees += Math.abs(Number(feeVal)) / QUOTE_DEC;
            }
            if (e.tag === 24 || e.funding !== undefined) {
                fundingValue += Number(e.funding || 0) / QUOTE_DEC;
            }
        });

        // 3. Filter for Fills (Tag 11 = Spot, Tag 19 = Perp)
        const tradeEvents = events.filter((e: any) => 
            e.tag === 11 || e.tag === 19 || (e.price !== undefined && (e.qty || e.perps))
        );

        const feePerTrade = tradeEvents.length > 0 ? totalFees / tradeEvents.length : 0;

        for (const e of tradeEvents) {
            const rawPrice = Number(e.price);
            const rawQty = Number(e.qty ?? e.perps ?? 0);

            // 4. PRICE-BASED SCALING & ID ASSIGNMENT (Merging your new requirements)
            let instrId: number;
            let assetDecimals: number;

            if (rawPrice > 10000) {
                instrId = 99; // LETTERA
                assetDecimals = 1e7; 
            } else if (rawPrice > 10 && rawPrice < 500) {
                instrId = 0; // SOL
                assetDecimals = 1e9;
            } else if (rawPrice > 0.9 && rawPrice < 1.1) {
                instrId = 100; // VELIT
                assetDecimals = 1e6;
            } else {
                const foundId = e.instrId ?? e.marketId ?? orderIdToInstrId.get(Number(e.orderId));
                instrId = foundId !== undefined ? Number(foundId) : -1;
                assetDecimals = 1e9;
            }

            const symbol = getMarketName(instrId);

            // 5. CONSTRUCT TRADE OBJECT
            const trade: TradeEvent = {
                signature,
                side: (e.side === 0 || e.side === 'buy' || e.side === 'bid') ? 'BUY' : 'SELL',
                price: rawPrice,
                size: rawQty / assetDecimals, 
                marketId: instrId,
                symbol: symbol,
                timestamp,
                fee: feePerTrade,
                tradeType: (e.tag === 19 || e.perps !== undefined) ? 'PERP' : 'SPOT'
            };

            // 6. RESTORED ROBUST ORDER TYPE INFERENCE (From your older code)
            if (e.orderType !== undefined && e.orderType !== null) {
                trade.orderType = e.orderType === 0 ? 'LIMIT' : e.orderType === 1 ? 'MARKET' : 'IOC';
            } else if (e.ioc === 1 || e.clientId === 1 || e.clientId === 2 || e.clientId === 923) {
                // Includes your specific Client IDs found in recent logs
                trade.orderType = 'MARKET';
            } else if (e.tag === 11 || e.tag === 19) {
                // Fills without metadata are almost always from Market orders in the UI
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