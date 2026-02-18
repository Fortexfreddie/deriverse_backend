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
                const firstTradeTimestamp = data.trades.length > 0
                    ? data.trades.reduce((min: Date, t: TradeEvent) => t.timestamp < min ? t.timestamp : min, data.trades[0].timestamp)
                    : new Date();

                /**
                 * STEP 1: ENSURE PARENT EXISTS
                 */
                const existingPos = await prisma.position.upsert({
                    where: { id: dbPositionId },
                    update: {}, 
                    create: {
                        id: dbPositionId,
                        walletAddress,
                        market: marketName,
                        side: data.side === 'BUY' ? 'LONG' : 'SHORT',
                        totalSize: 0,
                        avgEntryPrice: 0,
                        totalFees: 0,
                        status: 'OPEN',
                        createdAt: firstTradeTimestamp 
                    }
                });

                const wasClosed = existingPos.status === 'CLOSED';

                /**
                 * STEP 2: UPSERT FILLS
                 */
                for (const trade of data.trades) {
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
                            tradeType: trade.tradeType,
                            // Store the raw funding/socLoss for this specific fill
                            rawData: {
                                funding: (trade as any).funding || 0,
                                socLoss: (trade as any).socLoss || 0
                            }
                        }
                    });
                    fillsProcessed++;
                }

                /**
                 * STEP 3: AGGREGATE & SYNC METRICS
                 */
                const allFills = await prisma.fill.findMany({
                    where: { positionId: dbPositionId },
                    orderBy: { timestamp: 'asc' }
                });

                const lastFill = allFills[allFills.length - 1];
                const lastFillTimestamp = lastFill ? lastFill.timestamp : new Date();

                let netSize = 0;
                let entryValue = 0, entrySize = 0;
                let exitValue = 0, exitSize = 0;
                let totalFees = 0;
                let totalFunding = 0;
                let totalSocLoss = 0;

                for (const fill of allFills) {
                    totalFees += (fill.fee ?? 0);
                    
                    // Aggregate extra PnL components from fill metadata
                    const fillMeta = (fill as any).rawData || {};
                    totalFunding += fillMeta.funding ?? 0;
                    totalSocLoss += fillMeta.socLoss ?? 0;

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

                const isClosed = Math.abs(netSize) < 1e-6;
                const avgEntryPrice = entrySize > 0 ? entryValue / entrySize : 0;
                const avgExitPrice = exitSize > 0 ? exitValue / exitSize : null;
                
                const pnlMultiplier = data.side === 'BUY' ? 1 : -1;
                
                // THE TRUE PNL FORMULA: Price Action + Funding - Socialized Losses
                const pricePnl = exitSize > 0 ? ((exitValue / exitSize) - avgEntryPrice) * exitSize * pnlMultiplier : 0;
                const trueRealizedPnl = pricePnl + totalFunding - totalSocLoss;

                // Final Update to the Position
                await prisma.position.update({
                    where: { id: dbPositionId },
                    data: {
                        totalSize: isClosed ? 0 : Math.abs(netSize),
                        avgEntryPrice,
                        totalFees,
                        realizedPnl: trueRealizedPnl,
                        updatedAt: lastFillTimestamp, 
                        // Store detailed breakdown in JSON to protect user 'notes'
                        metadata: {
                            funding: totalFunding,
                            socLoss: totalSocLoss,
                            pricePnl: pricePnl,
                            calculatedAt: new Date().toISOString()
                        },
                        ...(isClosed ? {
                            status: 'CLOSED',
                            closedAt: lastFillTimestamp,
                            avgExitPrice
                        } : {
                            status: 'OPEN'
                        })
                    }
                });

                // --- Auto-Coach Trigger ---
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
            const marketKey = trade.marketId !== -1 ? trade.marketId : trade.symbol;
            const dateBucket = Math.floor(trade.timestamp.getTime() / 86400000);
            const key = `${marketKey}-${trade.side}-${dateBucket}`;
            
            if (!groups.has(key)) {
                groups.set(key, { marketId: trade.marketId, side: trade.side, trades: [] });
            }
            groups.get(key).trades.push(trade);
        }
        return groups;
    }
}