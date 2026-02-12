import { prisma } from '../config/db';
import { BlockchainService } from './blockchain.service';
import { getMarketName } from '../config/constants';
import { SyncResult, TradeEvent } from '../types';

/**
 * SYNC SERVICE
 * Orchestrates blockchain data fetching and database persistence.
 * Handles position aggregation and upsert logic with parent-child integrity.
 */
export class SyncService {
    private blockchainService: BlockchainService;

    constructor() {
        this.blockchainService = new BlockchainService();
    }

    async syncWallet(walletAddress: string, limit: number = 100): Promise<SyncResult> {
        try {
            // 1. Determine incremental sync anchor
            const lastFill = await prisma.fill.findFirst({
                where: { position: { walletAddress } },
                orderBy: { timestamp: 'desc' }
            });
            
            const since = lastFill ? lastFill.timestamp : undefined;
            const trades = await this.blockchainService.fetchDecodedTrades(walletAddress, limit, since);
            
            if (trades.length === 0) return { success: true, positionsUpdated: 0, fillsCreated: 0 };

            const positionGroups = this.groupTradesByPosition(trades);
            let fillsCreated = 0;

            for (const [posId, data] of positionGroups.entries()) {
                const marketName = getMarketName(data.marketId);
                const dbPositionId = `${posId}-${walletAddress}`;

                /**
                 * STEP 1: ENSURE PARENT EXISTS
                 * We upsert the Position first with empty/default metrics.
                 * This satisfies the Foreign Key constraint for the Fills.
                 */
                await prisma.position.upsert({
                    where: { id: dbPositionId },
                    update: {}, // Only create if missing, don't overwrite metrics yet
                    create: {
                        id: dbPositionId,
                        walletAddress,
                        market: marketName,
                        side: data.side === 'BUY' ? 'LONG' : 'SHORT',
                        totalSize: 0,
                        avgEntryPrice: 0,
                        totalFees: 0,
                        status: 'OPEN'
                    }
                });

                /**
                 * STEP 2: UPSERT FILLS
                 * Now that the Position (Parent) is guaranteed to exist, 
                 * we can safely link the Fills (Children).
                 */
                for (const trade of data.trades) {
                    // In a SHORT, the entry is a SELL. In a LONG, the entry is a BUY.
                    const isEntry = (data.side === 'SELL' && trade.side === 'SELL') || 
                                    (data.side === 'BUY' && trade.side === 'BUY');
                    await (prisma.fill.upsert as any)({
                        where: { signature: trade.signature },
                        update: { fee: trade.fee ?? 0 },
                        create: {
                            signature: trade.signature,
                            positionId: dbPositionId,
                            price: trade.price,
                            size: trade.size,
                            fee: trade.fee ?? 0,
                            timestamp: trade.timestamp,
                            isEntry: isEntry,
                            orderType: trade.orderType,
                            tradeType: trade.tradeType
                        }
                    });
                    fillsCreated++;
                }

                /**
                 * STEP 3: AGGREGATE & SYNC METRICS
                 * Fetch all fills (new + existing) to recalculate the Position state.
                 */
                const allFills = await prisma.fill.findMany({
                    where: { positionId: dbPositionId },
                    orderBy: { timestamp: 'asc' }
                });

                let netSize = 0;
                let entryValue = 0, entrySize = 0;
                let exitValue = 0, exitSize = 0;
                let totalFees = 0;

                for (const fill of allFills) {
                    totalFees += (fill.fee ?? 0);
                    if (fill.isEntry) {
                        netSize += fill.size;
                        entryValue += (fill.price * fill.size);
                        entrySize += fill.size;
                    } else {
                        netSize -= fill.size;
                        exitValue += (fill.price * fill.size);
                        exitSize += fill.size;
                    }
                }

                const isClosed = Math.abs(netSize) < 1e-9;
                const avgEntryPrice = entrySize > 0 ? entryValue / entrySize : 0;
                const avgExitPrice = exitSize > 0 ? exitValue / exitSize : null;
                
                const pnlMultiplier = data.side === 'BUY' ? 1 : -1;
                const realizedPnl = exitSize > 0 ? ( (exitValue / exitSize) - avgEntryPrice ) * exitSize * pnlMultiplier : 0;

                // Final Update to the Position with real calculated metrics
                await prisma.position.update({
                    where: { id: dbPositionId },
                    data: {
                        totalSize: Math.abs(netSize),
                        avgEntryPrice,
                        totalFees,
                        updatedAt: new Date(),
                        ...(isClosed ? {
                            status: 'CLOSED',
                            closedAt: new Date(),
                            realizedPnl,
                            avgExitPrice
                        } : {
                            status: 'OPEN',
                            realizedPnl: realizedPnl
                        })
                    }
                });
            }

            return { success: true, positionsUpdated: positionGroups.size, fillsCreated };
        } catch (error: any) {
            console.error("Sync Service Error:", error.message);
            throw error;
        }
    }

    private groupTradesByPosition(trades: TradeEvent[]) {
        const groups = new Map<string, any>();
        for (const trade of trades) {
            const key = `${trade.marketId}-${trade.side}`;
            if (!groups.has(key)) {
                groups.set(key, { marketId: trade.marketId, side: trade.side, trades: [] });
            }
            groups.get(key).trades.push(trade);
        }
        return groups;
    }
}