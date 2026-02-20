import { prisma } from '../config/db';
import { PnlService } from './pnl.service';

// --- Session Constants (UTC) ---
const SESSIONS = {
    ASIAN: { start: 0, end: 8, label: 'Asian' },
    LONDON: { start: 8, end: 16, label: 'London' },
    NEW_YORK: { start: 16, end: 24, label: 'New York' }
};

export interface AnalyticsFilters {
    market?: string;
    startDate?: Date;
    endDate?: Date;
}

export interface ComprehensiveAnalytics {
    totalPnl: {
        realized: number;
        unrealized: number;
        total: number;
    };
    winRate: number;
    tradeCount: {
        total: number;
        wins: number;
        losses: number;
        open: number;
    };
    avgTradeDuration: number; // in minutes
    longShortRatio: number;
    largestGain: {
        amount: number;
        positionId: string;
        market: string;
    } | null;
    largestLoss: {
        amount: number;
        positionId: string;
        market: string;
    } | null;
    avgWin: number;
    avgLoss: number;
    totalFees: number;
    totalVolume: number;
    feeComposition: {
        spot: number;
        perp: number;
        total: number;
    };
    sessionPerformance: {
        [key: string]: { pnl: number; count: number };
    };
    orderTypePerformance: {
        LIMIT?: { count: number; totalPnl: number; avgPnl: number };
        MARKET?: { count: number; totalPnl: number; avgPnl: number };
        IOC?: { count: number; totalPnl: number; avgPnl: number };
    };
    marketPerformance: {
        [market: string]: {
            pnl: number;
            winRate: number;
            tradeCount: number;
            volume: number;
        }
    };
    riskMetrics: {
        sharpeRatio: number;
        sortinoRatio: number;
        maxDrawdown: number;
        profitFactor: number;
        expectancy: number;
    };
}

export class AnalyticsService {
    private pnlService: PnlService;

    constructor() {
        this.pnlService = new PnlService();
    }

    /**
     * Get comprehensive analytics for a wallet
     */
    async getComprehensiveAnalytics(
        walletAddress: string,
        filters?: AnalyticsFilters
    ): Promise<ComprehensiveAnalytics> {
        // Build where clause
        const whereClause: any = {
            walletAddress
        };

        if (filters?.market) {
            whereClause.market = filters.market;
        }

        if (filters?.startDate || filters?.endDate) {
            whereClause.createdAt = {};
            if (filters.startDate) {
                whereClause.createdAt.gte = filters.startDate;
            }
            if (filters.endDate) {
                whereClause.createdAt.lte = filters.endDate;
            }
        }

        // Get all positions with all fills (don't filter fills by date for fee calculation)
        const positions = await prisma.position.findMany({
            where: whereClause,
            include: {
                fills: true  // Get all fills regardless of date filters for accurate fee calculation
            }
        });

        // Get open positions for unrealized PnL
        const openPositions = positions.filter(p => p.status === 'OPEN');
        let unrealizedPnl = 0;
        
        if (openPositions.length > 0) {
            const performance = await this.pnlService.getWalletPerformance(walletAddress);
            unrealizedPnl = performance.reduce((sum, p) => sum + (p.unrealized || 0), 0);
        }

        // Calculate realized PnL from closed positions
        const closedPositions = positions.filter(p => p.status === 'CLOSED' && p.realizedPnl !== null);
        const realizedPnl = closedPositions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0);

        // Calculate win rate
        const winningTrades = closedPositions.filter(p => (p.realizedPnl || 0) > 0).length;
        const losingTrades = closedPositions.filter(p => (p.realizedPnl || 0) < 0).length;
        const winRate = closedPositions.length > 0 
            ? (winningTrades / closedPositions.length) * 100 
            : 0;

        // Calculate trade counts
        const tradeCount = {
            total: positions.length,
            wins: winningTrades,
            losses: losingTrades,
            open: openPositions.length
        };

        // Calculate average trade duration
        const durations = closedPositions
            .filter(p => p.closedAt && p.createdAt && p.closedAt > p.createdAt)
            .map(p => {
                const ms = p.closedAt!.getTime() - p.createdAt.getTime();
                return Math.max(0, ms) / (1000 * 60); // Convert to minutes
            });
        const avgTradeDuration = durations.length > 0
            ? durations.reduce((sum, d) => sum + d, 0) / durations.length
            : 0;

        // Calculate long/short ratio
        const longPositions = positions.filter(p => p.side === 'LONG').length;
        const shortPositions = positions.filter(p => p.side === 'SHORT').length;
        const longShortRatio = shortPositions > 0 ? longPositions / shortPositions : longPositions;

        // Find largest gain and loss
        const sortedByPnl = [...closedPositions].sort((a, b) => 
            (b.realizedPnl || 0) - (a.realizedPnl || 0)
        );
        const largestGain = sortedByPnl.length > 0 && (sortedByPnl[0]?.realizedPnl ?? 0) > 0
            ? {
                amount: sortedByPnl[0]?.realizedPnl ?? 0,
                positionId: sortedByPnl[0]?.id ?? '',
                market: sortedByPnl[0]?.market ?? ''
            }
            : null;
        
        const largestLoss = sortedByPnl.length > 0 && (sortedByPnl[sortedByPnl.length - 1]?.realizedPnl ?? 0) < 0
            ? {
                amount: sortedByPnl[sortedByPnl.length - 1]?.realizedPnl ?? 0,
                positionId: sortedByPnl[sortedByPnl.length - 1]?.id ?? '',
                market: sortedByPnl[sortedByPnl.length - 1]?.market ?? ''
            }
            : null;

        // Calculate average win and loss
        const wins = closedPositions.filter(p => (p.realizedPnl || 0) > 0);
        const losses = closedPositions.filter(p => (p.realizedPnl || 0) < 0);
        const avgWin = wins.length > 0
            ? wins.reduce((sum, p) => sum + (p.realizedPnl || 0), 0) / wins.length
            : 0;
        const avgLoss = losses.length > 0
            ? losses.reduce((sum, p) => sum + (p.realizedPnl || 0), 0) / losses.length
            : 0;

        // Calculate total fees from all fills
        const allFills = positions.flatMap(p => p.fills || []);
        const totalFees = allFills.reduce((sum, f) => sum + (Number(f.fee) || 0), 0);

        // Calculate total volume
        const totalVolume = allFills.reduce((sum, f) => sum + (f.price * f.size), 0);

        // FIX: Accurate fee composition using explicit tradeType field
        const spotFills = allFills.filter(f => f.tradeType === 'SPOT');
        const perpFills = allFills.filter(f => f.tradeType === 'PERP');
        
        const feeComposition = {
            spot: spotFills.reduce((sum, f) => sum + (Number(f.fee) || 0), 0),
            perp: perpFills.reduce((sum, f) => sum + (Number(f.fee) || 0), 0),
            total: totalFees
        };

        // Session Performance Logic
        const sessionPerformance: { [key: string]: { pnl: number; count: number } } = {
            [SESSIONS.ASIAN.label]: { pnl: 0, count: 0 },
            [SESSIONS.LONDON.label]: { pnl: 0, count: 0 },
            [SESSIONS.NEW_YORK.label]: { pnl: 0, count: 0 }
        };

        closedPositions.forEach(p => {
            // Guard: skip positions with missing closedAt to prevent runtime crash
            if (!p.closedAt) return;

            const hour = p.closedAt.getUTCHours();
            let sessionLabel = SESSIONS.ASIAN.label;
            if (hour >= SESSIONS.LONDON.start && hour < SESSIONS.LONDON.end) sessionLabel = SESSIONS.LONDON.label;
            else if (hour >= SESSIONS.NEW_YORK.start && hour < SESSIONS.NEW_YORK.end) sessionLabel = SESSIONS.NEW_YORK.label;

            const sessionStats = sessionPerformance[sessionLabel];
            if (sessionStats) {
                sessionStats.pnl += (p.realizedPnl || 0);
                sessionStats.count += 1;
            }
        });

        // Calculate order type performance
        const orderTypePerformance: any = {};
        const orderTypes = ['LIMIT', 'MARKET', 'IOC'] as const;
        
        for (const orderType of orderTypes) {
            const fillsOfType = allFills.filter(f => f.orderType === orderType);
            if (fillsOfType.length > 0) {
                // Get positions for these fills and calculate PnL
                const positionIds = [...new Set(fillsOfType.map(f => f.positionId))];
                const positionsOfType = positions.filter(p => positionIds.includes(p.id));
                const totalPnl = positionsOfType.reduce((sum, p) => {
                    if (p.status === 'CLOSED' && p.realizedPnl) {
                        return sum + p.realizedPnl;
                    }
                    return sum;
                }, 0);
                
                orderTypePerformance[orderType] = {
                    count: fillsOfType.length,
                    totalPnl: totalPnl,
                    avgPnl: positionsOfType.length > 0 ? totalPnl / positionsOfType.length : 0
                };
            }
        }

        // --- Market Performance Logic ---
        const marketPerformance: { [market: string]: any } = {};
        const marketGroups = new Map<string, typeof positions>();
        
        // Group positions by market
        positions.forEach(p => {
             const m = p.market;
             if (!marketGroups.has(m)) marketGroups.set(m, []);
             marketGroups.get(m)!.push(p);
        });

        for (const [market, mPositions] of marketGroups) {
            const mClosed = mPositions.filter(p => p.status === 'CLOSED' && p.realizedPnl !== null);
            const mWins = mClosed.filter(p => (p.realizedPnl || 0) > 0).length;
            const mPnl = mClosed.reduce((sum, p) => sum + (p.realizedPnl || 0), 0);
            
            // Calculate volume for this market
            const mFills = mPositions.flatMap(p => p.fills || []);
            const mVolume = mFills.reduce((sum, f) => sum + (f.price * f.size), 0);

            marketPerformance[market] = {
                pnl: Math.round(mPnl * 100) / 100,
                winRate: mClosed.length > 0 ? Math.round((mWins / mClosed.length) * 100) : 0,
                tradeCount: mPositions.length,
                volume: Math.round(mVolume * 100) / 100
            };
        }

        // --- Risk Metrics Logic ---
        // 1. Calculate Daily PnL for Sharpe/Sortino
        const dailyPnlMap = new Map<string, number>();
        closedPositions.forEach(p => {
            if (!p.closedAt || p.realizedPnl === null) return;
            const date = p.closedAt.toISOString().split('T')[0] ?? '';
            dailyPnlMap.set(date, (dailyPnlMap.get(date) || 0) + p.realizedPnl);
        });

        const dailyPnls = Array.from(dailyPnlMap.values());
        
        let sharpeRatio = 0;
        let sortinoRatio = 0;
        let maxDrawdown = 0;

        if (dailyPnls.length > 1) {
            const avgDailyPnl = dailyPnls.reduce((sum, v) => sum + v, 0) / dailyPnls.length;
            
            // Standard Deviation (Sample Variance N-1)
            const variance = dailyPnls.reduce((sum, v) => sum + Math.pow(v - avgDailyPnl, 2), 0) / (dailyPnls.length - 1);
            const stdDev = Math.sqrt(variance);
            
            // Downside Deviation (Sortino) — standard formula: sum of min(r,0)^2 over ALL days
            const downsideVariance = dailyPnls
                .reduce((sum, v) => sum + Math.pow(Math.min(v, 0), 2), 0) / dailyPnls.length;
            const downsideDev = Math.sqrt(downsideVariance);

            // Annualize (assume 365 trading days for crypto)
            if (stdDev !== 0) sharpeRatio = (avgDailyPnl / stdDev) * Math.sqrt(365);
            if (downsideDev !== 0) sortinoRatio = (avgDailyPnl / downsideDev) * Math.sqrt(365);
        }

        // --- Max Drawdown (Cumulative Equity Curve) ---
        let cumPnl = 0;
        let peak = 0;
        let maxDdAbs = 0;

        // Re-sort to ensure chronological equity tracking
        const sortedByDate = [...closedPositions].sort((a, b) => 
            (a.closedAt?.getTime() || 0) - (b.closedAt?.getTime() || 0)
        );

        for (const p of sortedByDate) {
            if (p.realizedPnl === null) continue;
            cumPnl += p.realizedPnl;
            if (cumPnl > peak) peak = cumPnl;
            const currentDd = peak - cumPnl;
            if (currentDd > maxDdAbs) maxDdAbs = currentDd;
        }
        // Use Peak to get percentage, but guard against Peak = 0
        maxDrawdown = peak > 0 ? (maxDdAbs / peak) * 100 : 0;

        // Profit Factor
        const grossProfit = wins.reduce((sum, p) => sum + (p.realizedPnl || 0), 0);
        const grossLoss = Math.abs(losses.reduce((sum, p) => sum + (p.realizedPnl || 0), 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

        // Expectancy
        const winRateDecimal = (winningTrades / (closedPositions.length || 1));
        const lossRateDecimal = (losingTrades / (closedPositions.length || 1));
        const expectancy = (winRateDecimal * avgWin) + (lossRateDecimal * avgLoss);

        return {
            totalPnl: {
                realized: realizedPnl,
                unrealized: unrealizedPnl,
                total: realizedPnl + unrealizedPnl
            },
            winRate: Math.round(winRate * 100) / 100,
            tradeCount,
            avgTradeDuration: Math.round(avgTradeDuration * 10) / 10,
            longShortRatio: Math.round(longShortRatio * 100) / 100,
            largestGain,
            largestLoss,
            avgWin: Math.round(avgWin * 100) / 100,
            avgLoss: Math.round(avgLoss * 100) / 100,
            totalFees: Math.round(totalFees * 100) / 100,
            totalVolume: Math.round(totalVolume * 100) / 100,
            feeComposition: {
                spot: Math.round(feeComposition.spot * 100) / 100,
                perp: Math.round(feeComposition.perp * 100) / 100,
                total: Math.round(feeComposition.total * 100) / 100
            },
            sessionPerformance,
            orderTypePerformance,
            marketPerformance,
            riskMetrics: {
                sharpeRatio: Math.round(sharpeRatio * 100) / 100,
                sortinoRatio: Math.round(sortinoRatio * 100) / 100,
                maxDrawdown: Math.round(maxDrawdown * 100) / 100,
                profitFactor: Math.round(profitFactor * 100) / 100,
                expectancy: Math.round(expectancy * 100) / 100
            }
        };
    }

    /**
     * Get historical PnL data for charts
     */
    async getHistoricalPnL(
        walletAddress: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<Array<{ date: string; cumulativePnl: number; drawdown: number; realizedPnl: number }>> {
        const whereClause: any = {
            walletAddress,
            status: 'CLOSED',
            realizedPnl: { not: null }
        };

        if (startDate || endDate) {
            whereClause.closedAt = {};
            if (startDate) whereClause.closedAt.gte = startDate;
            if (endDate) whereClause.closedAt.lte = endDate;
        }

        const closedPositions = await prisma.position.findMany({
            where: whereClause,
            orderBy: { closedAt: 'asc' }
        });

        const historicalData: Array<{ date: string; cumulativePnl: number; drawdown: number; realizedPnl: number }> = [];
        let cumulativePnl = 0;
        let peakPnl = 0;

        for (const position of closedPositions) {
            if (!position.closedAt || position.realizedPnl === null) continue;

            cumulativePnl += position.realizedPnl;
            peakPnl = Math.max(peakPnl, cumulativePnl);
            const drawdown = peakPnl > 0 ? ((cumulativePnl - peakPnl) / peakPnl) * 100 : 0;

            historicalData.push({
                date: position.closedAt.toISOString().split('T')[0] ?? "",
                cumulativePnl: Math.round(cumulativePnl * 100) / 100,
                drawdown: Math.round(drawdown * 100) / 100,
                realizedPnl: Math.round(position.realizedPnl * 100) / 100
            });
        }

        return historicalData;
    }

    /**
     * Get time-based performance metrics (Daily & Hourly)
     */
    async getTimeBasedPerformance(
        walletAddress: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<{
        daily: Array<{ date: string; pnl: number; trades: number; volume: number }>;
        hourly: Array<{ hour: number; pnl: number; trades: number }>;
    }> {
        const whereClause: any = {
            position: { walletAddress }
        };

        if (startDate || endDate) {
            whereClause.timestamp = {};
            if (startDate) whereClause.timestamp.gte = startDate;
            if (endDate) whereClause.timestamp.lte = endDate;
        }

        const fills = await prisma.fill.findMany({
            where: whereClause,
            include: { position: true },
            orderBy: { timestamp: 'asc' }
        });

        const dailyMap = new Map<string, { pnl: number; trades: number; volume: number }>();
        const hourlyMap = new Map<number, { pnl: number; trades: number }>();

        // Pre-calculate exit counts to avoid O(N^2) filtering inside the loop
        const exitCounts = new Map<string, number>();
        fills.forEach(f => {
            if (!f.isEntry) {
                exitCounts.set(f.positionId, (exitCounts.get(f.positionId) || 0) + 1);
            }
        });

        for (const fill of fills) {
            const dateStr = fill.timestamp.toISOString().split('T')[0] ?? "";
            const hour = fill.timestamp.getUTCHours();

            // Daily Init
            if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, { pnl: 0, trades: 0, volume: 0 });
            const daily = dailyMap.get(dateStr)!;
            
            // Hourly Init
            if (!hourlyMap.has(hour)) hourlyMap.set(hour, { pnl: 0, trades: 0 });
            const hourly = hourlyMap.get(hour)!;

            daily.trades += 1;
            daily.volume += (fill.price * fill.size);
            hourly.trades += 1;
            
            // Logic: Distribute Realized PnL across exit fills
            if (!fill.isEntry && fill.position.status === 'CLOSED' && fill.position.realizedPnl) {
                const totalExits = exitCounts.get(fill.positionId) || 1;
                const pnlContribution = fill.position.realizedPnl / totalExits;
                
                daily.pnl += pnlContribution;
                hourly.pnl += pnlContribution; // FIXED: Added PnL to hourly map
            }
        }

        const daily = Array.from(dailyMap.entries()).map(([date, data]) => ({
            date,
            pnl: Math.round(data.pnl * 100) / 100,
            trades: data.trades,
            volume: Math.round(data.volume * 100) / 100
        }));

        const hourly = Array.from(hourlyMap.entries())
            .map(([hour, data]) => ({
                hour,
                pnl: Math.round(data.pnl * 100) / 100,
                trades: data.trades
            }))
            .sort((a, b) => a.hour - b.hour);

        return { daily, hourly };
    }
    /**
     * Get equity curve for a wallet
     */
    async getEquityCurve(walletAddress: string) {
        // 1. Fetch closed positions sorted by time
        const trades = await prisma.position.findMany({
            where: { walletAddress, status: 'CLOSED' },
            orderBy: { closedAt: 'asc' },
            select: {
                closedAt: true,
                realizedPnl: true,
                market: true
            }
        });

        let cumulativePnl = 0;
        const startingBalance = 10000; // Customizable base balance

        // 2. Map into a format ready for a Line Chart
        return trades.map(trade => {
            cumulativePnl += Number(trade.realizedPnl);
            return {
                timestamp: trade.closedAt,
                equity: startingBalance + cumulativePnl,
                change: trade.realizedPnl,
                market: trade.market
            };
        });
    }

    /**
     * Get global leaderboard (Top 5 profitable traders)
     */
    async getGlobalLeaderboard() {
        // 1. Get the heavy hitters by PnL
        const topTraders = await prisma.position.groupBy({
            by: ['walletAddress'],
            _sum: { realizedPnl: true },
            orderBy: { _sum: { realizedPnl: 'desc' } },
            take: 10
        });

        // 2. Enrich them with Win Rate and Avatars
        // We need to use Promise.all to handle async database calls inside the map
        const leaderboard = await Promise.all(topTraders.map(async (trader) => {
            const wallet = trader.walletAddress;
            
            // Count total closed vs winning closed
            const closedCount = await prisma.position.count({
                where: { walletAddress: wallet, status: 'CLOSED' }
            });
            const winningCount = await prisma.position.count({
                where: { walletAddress: wallet, status: 'CLOSED', realizedPnl: { gt: 0 } }
            });

            const winRate = closedCount > 0 ? (winningCount / closedCount) * 100 : 0;

            return {
                wallet: `${wallet.substring(0, 4)}...${wallet.substring(wallet.length - 4)}`,
                pnl: Number(trader._sum.realizedPnl || 0),
                winRate: Math.round(winRate * 100) / 100,
                // Pro Tip: Identicons make the UI look 10x better instantly
                avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${wallet}`
            };
        }));
        
        return leaderboard.sort((a, b) => b.pnl - a.pnl);
    }

    /**
     * Get portfolio composition (Pie Chart Data)
     */
    async getPortfolioComposition(walletAddress: string) {
        const positions = await prisma.position.findMany({
            where: { 
                walletAddress,
                status: 'OPEN' 
            },
            select: {
                market: true,
                totalSize: true,
                avgEntryPrice: true
            }
        });
      
        // 1. Group by Market to avoid duplicate slices in the chart
        const marketTotals = new Map<string, number>();
      
        positions.forEach(pos => {
            // Clean up the name: if it's "UNKNOWN--1", label it "OTHER"
            const marketName = pos.market.startsWith('UNKNOWN') ? 'OTHER' : pos.market;
            
            const value = Number(pos.totalSize) * Number(pos.avgEntryPrice || 0);
            
            const currentTotal = marketTotals.get(marketName) || 0;
            marketTotals.set(marketName, currentTotal + value);
        });
      
        // 2. Convert Map to Array for Calculation (Calculate total value inside the array)
        let totalValue = 0;
        const composition: Array<{ market: string; value: number }> = [];

        marketTotals.forEach((value, market) => {
            totalValue += value;
            composition.push({ market, value });
        });
      
        // 3. Return percentages for the frontend pie chart
        return composition.map(item => ({
            market: item.market,
            value: Math.round(item.value * 100) / 100, // Round to 2 decimals
            percentage: totalValue > 0 ? Number(((item.value / totalValue) * 100).toFixed(2)) : 0
        })).sort((a, b) => b.value - a.value); // Sort biggest to smallest
    }

    /**
     * Get heatmap data (Daily PnL for a month)
     */
    async getHeatmapData(walletAddress: string, year: number, month: number) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const positions = await prisma.position.findMany({
            where: {
                walletAddress,
                updatedAt: { gte: startDate, lte: endDate } 
            },
            include: {
                fills: { orderBy: { timestamp: 'asc' } } 
            },
            orderBy: { updatedAt: 'desc' }
        });

        const heatmap = positions.reduce((acc, pos) => {
            if (!pos.updatedAt) return acc;
            const dateKey = pos.updatedAt.toISOString().split('T')[0];
            
            if (!dateKey) return acc;

            if (!acc[dateKey]) {
                acc[dateKey] = { pnl: 0, count: 0, trades: [] };
            }

            acc[dateKey].trades.push(pos);
            acc[dateKey].count += 1;
            acc[dateKey].pnl += Number(pos.realizedPnl || 0);

            return acc;
        }, {} as Record<string, { pnl: number, count: number, trades: any[] }>);

        return heatmap;
    }

    /**
     * Get equity curve and drawdown time-series
     */
    async getDrawdownSeries(walletAddress: string) {
        // 1. Fetch positions with realized PnL (even if OPEN, e.g. partials/funding)
        const trades = await prisma.position.findMany({
            where: { 
                walletAddress, 
                realizedPnl: { not: null } 
            },
            orderBy: { updatedAt: 'asc' }, // Use updatedAt as a general time proxy
            select: {
                closedAt: true,
                updatedAt: true,
                realizedPnl: true
            }
        });

        let cumulativePnl = 0;
        let peak = 0;
        const series: Array<{ timestamp: string; pnl: number; drawdown: number; peak: number }> = [];

        // 2. Calculate running PnL, Peak, and Drawdown
        for (const trade of trades) {
            // Skip if no PnL (or 0 PnL if we want to reduce noise)
            const pnl = Number(trade.realizedPnl || 0);
            if (pnl === 0) continue;

            cumulativePnl += pnl;
            
            // Update Peak
            if (cumulativePnl > peak) {
                peak = cumulativePnl;
            }

            // Calculate Drawdown (Absolute from Peak)
            const drawdown = cumulativePnl - peak;
            
            // Determine timestamp: closedAt > updatedAt (usually) > fallback
            const timestamp = trade.closedAt || trade.updatedAt || new Date();

            series.push({
                timestamp: timestamp.toISOString(),
                pnl: Math.round(cumulativePnl * 100) / 100,
                drawdown: Math.round(drawdown * 100) / 100,
                peak: Math.round(peak * 100) / 100
            });
        }
        
        // Sort by timestamp just in case
        return series.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
}

export default new AnalyticsService();