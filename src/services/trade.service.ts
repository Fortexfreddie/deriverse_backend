import { prisma } from '../config/db';

export interface TradeHistoryQuery {
    market?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}

export class TradeService {
    /**
     * Get trade history with aggregated KPIs and pagination
     */
    async getTradeHistory(walletAddress: string, query: TradeHistoryQuery) {
        const { market, startDate, endDate, limit = 20, offset = 0 } = query;

        // 1. Build Where Clause for Fills
        const whereClause: any = {
            position: { walletAddress }
        };

        if (market) {
            whereClause.position = { ...whereClause.position, market };
        }

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = startDate;
        if (endDate) dateFilter.lte = endDate;
        if (startDate || endDate) whereClause.timestamp = dateFilter;

        // 2. Fetch Data (Paginated)
        const trades = await prisma.fill.findMany({
            where: whereClause,
            take: limit,
            skip: offset,
            orderBy: { timestamp: 'desc' },
            include: { position: true }
        });

        // 3. Fetch Aggregates (Global for the filter)
        const aggregations = await prisma.fill.aggregate({
            where: whereClause,
            _count: { id: true },
            _sum: { fee: true, size: true },
            _avg: { size: true }
        });

        const totalTrades = aggregations._count.id;
        const totalFees = aggregations._sum.fee || 0;
        const avgTradeSize = aggregations._avg.size || 0;

        // 4. Calculate Distribution (Spot vs Perp)
        const distributionGroup = await prisma.fill.groupBy({
            by: ['tradeType'],
            where: whereClause,
            _count: { id: true }
        });

        const spotCount = distributionGroup.find(g => g.tradeType === 'SPOT')?._count.id || 0;
        const perpCount = distributionGroup.find(g => g.tradeType === 'PERP')?._count.id || 0;
        const totalDistrib = spotCount + perpCount || 1;

        const distribution = {
            spot: Math.round((spotCount / totalDistrib) * 100),
            perp: Math.round((perpCount / totalDistrib) * 100)
        };

        // 5. Volume Metrics (24h) - Relative to NOW, but filtered by market if applicable
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const dayBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        const volumeWhere: any = {
            position: { walletAddress },
            timestamp: { gte: dayBefore }
        };
        if (market) {
            volumeWhere.position = { ...volumeWhere.position, market };
        }

        const recentFills = await prisma.fill.findMany({
            where: volumeWhere,
            select: { timestamp: true, size: true, price: true }
        });

        let volCurrent = 0;
        let volPrev = 0;

        for (const fill of recentFills) {
            const vol = fill.size * fill.price;
            if (fill.timestamp >= yesterday) {
                volCurrent += vol;
            } else {
                volPrev += vol;
            }
        }

        const netVolume24h = volCurrent;
        const volumeChange24h = volPrev === 0 
            ? (volCurrent > 0 ? 100 : 0) 
            : ((volCurrent - volPrev) / volPrev) * 100;

        // 6. Trade Frequency (Trades / Day)
        let daysSpan = 1;
        if (startDate && endDate) {
            const diff = endDate.getTime() - startDate.getTime();
            daysSpan = Math.max(1, diff / (1000 * 60 * 60 * 24));
        } else {
            // If no date filter, find range from first trade to now
            const firstTrade = await prisma.fill.findFirst({
                where: { position: { walletAddress } },
                orderBy: { timestamp: 'asc' }
            });
            if (firstTrade) {
                const start = firstTrade.timestamp;
                const end = new Date();
                const diff = end.getTime() - start.getTime();
                daysSpan = Math.max(1, diff / (1000 * 60 * 60 * 24));
            }
        }
        const tradeFrequency = parseFloat((totalTrades / daysSpan).toFixed(2));

        // 7. Profit Factor (Gross Profit / Gross Loss) based on closed positions in range
        // We find positions that have fills in this range OR are closed in this range?
        // Usually profit factor is about the PnL realized in the period.
        // Let's filter positions closed within the date range (if any), or all if no range.
        
        const pfWhere: any = {
            walletAddress,
            status: 'CLOSED',
            realizedPnl: { not: null }
        };
        if (market) pfWhere.market = market;
        if (startDate || endDate) {
            pfWhere.closedAt = {};
            if (startDate) pfWhere.closedAt.gte = startDate;
            if (endDate) pfWhere.closedAt.lte = endDate;
        }

        const closedPositions = await prisma.position.findMany({
            where: pfWhere,
            select: { realizedPnl: true }
        });

        let grossProfit = 0;
        let grossLoss = 0;

        for (const p of closedPositions) {
            const pnl = Number(p.realizedPnl);
            if (pnl > 0) grossProfit += pnl;
            else grossLoss += Math.abs(pnl);
        }

        const profitFactorHistory = grossLoss === 0 
            ? (grossProfit > 0 ? 100 : 0) // capped or 0
            : parseFloat((grossProfit / grossLoss).toFixed(2));


        // Return structured response
        return {
            success: true,
            summary: {
                totalTrades,
                totalFees,
                netVolume24h: Math.round(netVolume24h),
                volumeChange24h: parseFloat(volumeChange24h.toFixed(1)),
                avgTradeSize: parseFloat(avgTradeSize.toFixed(4)),
                distribution,
                gasVsProtocolRatio: 0, // Placeholder
                tradeFrequency,
                profitFactorHistory
            },
            data: trades,
            pagination: {
                total: totalTrades,
                hasMore: (offset + limit) < totalTrades
            }
        };
    }
}

export default new TradeService();
