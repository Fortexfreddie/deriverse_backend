import { prisma } from '../config/db';
import { WalletPerformance } from '../types/index';

/**
 * PNL SERVICE
 * Calculates performance metrics for open positions using live market data.
 */
export class PnlService {
    /**
     * Maps market identifiers to CoinGecko IDs and ensures consistency with Blockchain IDs.
     * Deriverse IDs: 0 = SOL, 1 = BTC
     */
    private async getMultiplePrices(marketIds: number[]): Promise<Record<number, number>> {
        // Updated to match your BlockchainService: 0: SOL, 1: BTC
        const idMap: Record<number, string> = { 0: 'solana', 1: 'bitcoin' };
        const uniqueIds = [...new Set(marketIds)].map(id => idMap[id]).filter(Boolean);
        
        if (uniqueIds.length === 0) return {};

        try {
            const idsQuery = uniqueIds.join(',');
            const res = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${idsQuery}&vs_currencies=usd`
            );
            const json: any = await res.json();

            const prices: Record<number, number> = {};
            // Reverse map the prices back to our 0 and 1 IDs
            if (json.solana) prices[0] = Number(json.solana.usd);
            if (json.bitcoin) prices[1] = Number(json.bitcoin.usd);
            
            return prices;
        } catch (err) {
            console.error("Price API Error, using fallbacks:", err);
            // Defensive fallbacks matching the ID logic
            return { 0: 98.45, 1: 96000.0 };
        }
    }

    async getWalletPerformance(walletAddress: string): Promise<WalletPerformance[]> {
        const fills = await prisma.fill.findMany({
            where: { position: { walletAddress } },
            include: { position: true },
            orderBy: { timestamp: 'asc' }
        });

        if (fills.length === 0) return [];

        const groups: Record<string, { fills: any[]; position: any }> = {};
        const marketIds: number[] = [];

        // 1. Grouping and Initial Market Identification
        for (const f of fills) {
            const pid = f.positionId;
            if (!groups[pid]) {
                groups[pid] = { fills: [], position: f.position };
                
                // Robust identification for batch price fetching
                const marketStr = (f.position.market || '').toUpperCase();
                let mId: number;
                if (marketStr.includes('SOL')) {
                    mId = 0;
                } else if (marketStr.includes('BTC')) {
                    mId = 1;
                } else {
                    mId = 0; // Default fallback
                }
                marketIds.push(mId);
            }
            groups[pid].fills.push(f);
        }

        const livePrices = await this.getMultiplePrices(marketIds);
        const performance: WalletPerformance[] = [];

        // 2. Metric Calculation Loop
        for (const [pid, data] of Object.entries(groups)) {
            let netSize = 0;
            let totalEntryValue = 0;
            let totalEntrySize = 0;
            let realized = 0;

            for (const f of data.fills) {
                const price = Number(f.price);
                const size = Number(f.size);

                if (f.isEntry) {
                    netSize += size;
                    totalEntryValue += price * size;
                    totalEntrySize += size;
                } else {
                    netSize -= size;
                    const avgEntry = totalEntrySize > 0 ? (totalEntryValue / totalEntrySize) : (data.position.avgEntryPrice || 0);
                    const pnlFactor = data.position.side === 'LONG' ? 1 : -1;
                    realized += (price - avgEntry) * size * pnlFactor;
                }
            }

            // Skip closed positions
            if (Math.abs(netSize) < 1e-9) continue;

            const avgEntryPrice = totalEntrySize > 0 ? (totalEntryValue / totalEntrySize) : Number(data.position.avgEntryPrice || 0);
            
            // 3. SECURE IDENTIFICATION: Prevents SOL using BTC prices
            const marketName = (data.position.market || '').toUpperCase();
            let finalMarketId: number;
            
            if (marketName.includes('SOL')) {
                finalMarketId = 0;
            } else if (marketName.includes('BTC')) {
                finalMarketId = 1;
            } else {
                // Defensive: If we can't identify, skip to avoid huge PnL errors
                console.warn(`Could not identify market for position ${pid}: ${marketName}`);
                continue;
            }

            // Get live price or use specific fallback based on ID
            const currentPrice = livePrices[finalMarketId] ?? (finalMarketId === 0 ? 98.45 : 96000.0);

            const pnlFactor = data.position.side === 'LONG' ? 1 : -1;
            const unrealized = (currentPrice - avgEntryPrice) * netSize * pnlFactor;

            performance.push({
                positionId: pid,
                market: data.position.market,
                side: data.position.side as 'LONG' | 'SHORT',
                entry: Number(avgEntryPrice.toFixed(4)),
                current: Number(currentPrice.toFixed(4)),
                size: Number(netSize.toFixed(4)),
                unrealized: Number(unrealized.toFixed(2)),
                realized: Number(realized.toFixed(2))
            });
        }

        return performance;
    }
}