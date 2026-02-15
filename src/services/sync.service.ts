import { prisma } from '../config/db';
import { BlockchainService } from './blockchain.service';
import journalService from './journal.service';
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
            
            if (trades.length === 0) return { success: true, positionsUpdated: 0, fillsProcessed: 0 };

            const positionGroups = this.groupTradesByPosition(trades);
            let fillsProcessed = 0;

            for (const [posId, data] of positionGroups.entries()) {
                const marketName = getMarketName(data.marketId);
                const dbPositionId = `${posId}-${walletAddress}`;

                // --- Timestamp Integrity Fix (Part 2) ---
                // Find the earliest trade in this batch to serve as the TRUE creation time
                // This prevents "Negative Duration" when syncing historical data
                const firstTradeTimestamp = data.trades.length > 0
                    ? data.trades.reduce((min: Date, t: TradeEvent) => t.timestamp < min ? t.timestamp : min, data.trades[0].timestamp)
                    : new Date();

                /**
                 * STEP 1: ENSURE PARENT EXISTS
                 * We upsert the Position first with empty/default metrics.
                 * This satisfies the Foreign Key constraint for the Fills.
                 */
                const existingPos = await prisma.position.upsert({
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
                        status: 'OPEN',
                        createdAt: firstTradeTimestamp // Fix: Use earliest trade time, not server time
                    }
                });

                // Check prior status to determine if this is a "New Close" event
                const wasClosed = existingPos.status === 'CLOSED';

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
                    fillsProcessed++;
                }

                /**
                 * STEP 3: AGGREGATE & SYNC METRICS
                 * Fetch all fills (new + existing) to recalculate the Position state.
                 */
                const allFills = await prisma.fill.findMany({
                    where: { positionId: dbPositionId },
                    orderBy: { timestamp: 'asc' }
                });

                // --- Timestamp Integrity Fix ---
                // Use the timestamp of the LAST fill in the sequence for closure time
                const lastFill = allFills[allFills.length - 1];
                const lastFillTimestamp = lastFill ? lastFill.timestamp : new Date();

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
                        totalSize: isClosed ? 0 : Math.abs(netSize),
                        avgEntryPrice,
                        totalFees,
                        updatedAt: lastFillTimestamp, // Consistent with blockchain time
                        ...(isClosed ? {
                            status: 'CLOSED',
                            // Fix: Use blockchain time, not server time
                            closedAt: lastFillTimestamp,
                            realizedPnl,
                            avgExitPrice
                        } : {
                            status: 'OPEN',
                            realizedPnl: realizedPnl
                        })
                    }
                });

                // --- Auto-Coach Trigger ---
                // If position just closed, fire-and-forget AI analysis
                if (isClosed && !wasClosed) {
                    journalService.analyzeAndJournal(dbPositionId).catch(err => 
                        console.error(`[Auto-Coach] Failed for ${dbPositionId}:`, err)
                    );
                }
            }

            return { success: true, positionsUpdated: positionGroups.size, fillsProcessed };
        } catch (error: any) {
            console.error("Sync Service Error:", error.message);
            throw error;
        }
    }

    private groupTradesByPosition(trades: TradeEvent[]) {
        const groups = new Map<string, any>();
        for (const trade of trades) {
            // Use the positionId from the trade event if available to prevent collision
            // Fallback to daily bucket key to avoid merging trades across weeks
            const key = trade.marketId 
                ? `${trade.marketId}-${trade.side}-${Math.floor(trade.timestamp.getTime() / 86400000)}`
                : `${trade.symbol}-${trade.side}-${Math.floor(trade.timestamp.getTime() / 86400000)}`;
            
            if (!groups.has(key)) {
                groups.set(key, { marketId: trade.marketId, side: trade.side, trades: [] });
            }
            groups.get(key).trades.push(trade);
        }
        return groups;
    }
}