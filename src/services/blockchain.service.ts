import { rpc, deriverseEngine, programId } from '../config/deriverse';
import { TradeEvent } from '../types';

const PRICE_DEC = 1e9;
const ASSET_DEC = 1e9;
const QUOTE_DEC = 1e6; // USDC has 6 decimals

const INSTR_ID_TO_SYMBOL: Record<number, string> = {
    0: "SOL-USDC",
    1: "BTC-USDC",
};

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
                    const parsed = this.mapEventsToTrades(decoded, sigInfo.signature, sigInfo.blockTime);
                    
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

    private mapEventsToTrades(events: any[], signature: string, blockTime: any): TradeEvent[] {
    const trades: TradeEvent[] = [];
    const timestamp = blockTime ? new Date(Number(blockTime) * 1000) : new Date();
    
    const orderIdToInstrId = new Map<number, number>();
    for (const msg of events) {
        if (msg.orderId != null && msg.instrId != null) {
            orderIdToInstrId.set(Number(msg.orderId), Number(msg.instrId));
        }
    }

    let totalFees = 0;
    const feeEvents = events.filter((e: any) => e.tag === 15 || e.tag === 23 || e.rebates !== undefined);
    for (const feeEvent of feeEvents) {
        const feeVal = feeEvent.fees !== undefined ? feeEvent.fees : feeEvent.rebates;
        if (feeVal !== undefined) {
            // QUOTE_DEC should be 1e6 for USDC
            totalFees += Math.abs(Number(feeVal)) / QUOTE_DEC;
        }
    }

    // Filter for trade events (11 = Spot Trade, 19 = Perp Trade)
    const tradeEvents = events.filter((e: any) => 
        e.tag === 11 || e.tag === 19 || (e.price !== undefined && (e.qty || e.perps))
    );

    const feePerTrade = tradeEvents.length > 0 ? totalFees / tradeEvents.length : 0;

    for (const e of tradeEvents) {
        const instrId = e.instrId ?? e.marketId ?? orderIdToInstrId.get(Number(e.orderId)) ?? 0;
        
        // Use your MARKET_MAP or INSTR_ID_TO_SYMBOL
        const symbol = INSTR_ID_TO_SYMBOL[instrId] || `Unknown-${instrId}`;

        const rawPrice = Number(e.price);
        const price = rawPrice > 1e6 ? rawPrice / PRICE_DEC : rawPrice;

        const trade: TradeEvent = {
            signature,
            side: (e.side === 0 || e.side === 'buy') ? 'BUY' : 'SELL',
            price: price,
            size: Number(e.qty ?? e.perps ?? 0) / ASSET_DEC,
            marketId: instrId,
            symbol: symbol,
            timestamp,
            fee: feePerTrade,
            // Tag 19 or presence of 'perps' field indicates Perp market
            tradeType: (e.tag === 19 || e.perps !== undefined) ? 'PERP' : 'SPOT'
        };

        (trade as any).notional = trade.price * trade.size;

        /**
         * FIX: Robust OrderType detection
         * Prioritizes explicit orderType, then IOC flags, finally defaulting to LIMIT
         */
        if (e.orderType !== undefined) {
            trade.orderType = e.orderType === 0 ? 'LIMIT' : e.orderType === 1 ? 'MARKET' : 'IOC';
        } else if (e.ioc !== undefined) {
            trade.orderType = e.ioc === 1 ? 'IOC' : 'LIMIT';
        } else {
            // Defaulting to LIMIT ensures the field is not NULL in Prisma
            trade.orderType = 'LIMIT'; 
        }

        trades.push(trade);
    }
    return trades;
}
}