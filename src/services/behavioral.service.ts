import { prisma } from '../config/db';

/**
 * BEHAVIORAL SERVICE
 * Analyzes trade history for emotional/behavioral patterns.
 * Uses real position PnL data for accurate win/loss metrics.
 */
export class BehavioralService {
    async getBehavioralMetrics(walletAddress: string) {
        // Fetch both in parallel for performance
        const [trades, fills] = await Promise.all([
            prisma.position.findMany({
                where: { walletAddress, status: 'CLOSED' },
                orderBy: { closedAt: 'asc' },
                select: { id: true, realizedPnl: true, market: true }
            }),
            prisma.fill.findMany({
                where: { position: { walletAddress } },
                orderBy: { timestamp: 'asc' },
                include: { position: true }
            })
        ]);

        if (trades.length === 0) {
            return { 
                expectancy: 0, 
                winRate: 0, 
                profitFactor: 0, 
                riskRewardRatio: 0, 
                revengeTradeCount: 0, 
                streaks: { current: 0, maxWin: 0, maxLoss: 0 }, 
                insights: ["No trades found."] 
            };
        }

        // --- Quant Logic (Streaks & PnL) ---
        let currentStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
        let totalWins = 0, totalLosses = 0, winCount = 0;

        trades.forEach((trade) => {
            const pnl = Number(trade.realizedPnl || 0);
            if (pnl > 0) {
                winCount++;
                totalWins += pnl;
                currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
                maxWinStreak = Math.max(maxWinStreak, currentStreak);
            } else if (pnl < 0) {
                totalLosses += Math.abs(pnl);
                currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
                maxLossStreak = Math.max(maxLossStreak, Math.abs(currentStreak));
            } else {
                currentStreak = 0;
            }
        });

        const lossCount = trades.length - winCount;
        const winRate = (winCount / trades.length) * 100;
        const avgWin = winCount > 0 ? totalWins / winCount : 0;
        const avgLoss = lossCount > 0 ? totalLosses / lossCount : 0;
        const expectancy = ((winCount / trades.length) * avgWin) - ((lossCount / trades.length) * avgLoss);
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 100 : 0);

        // --- Revenge Trade Logic ---
        let revengeTradeCount = 0;
        for (let i = 1; i < fills.length; i++) {
            const prev = fills[i - 1];
            const curr = fills[i];
            if (prev && curr && !prev.isEntry && curr.isEntry) { // Fast re-entry after closing
                const timeDiffMin = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000 / 60;
                if (timeDiffMin < 15 && curr.position.market === prev.position.market) {
                    revengeTradeCount++;
                }
            }
        }

        // --- Insight Generation ---
        const insights: string[] = [];
        if (revengeTradeCount > 0) insights.push(`Stop! You've revenge-traded ${revengeTradeCount} times. Wait 30 mins after a loss.`);
        if (profitFactor < 1) insights.push("Your losses are currently larger than your wins. Tighten your stop losses.");
        if (winRate > 60) insights.push("Consistent execution detected. You have a solid win rate.");

        return {
            expectancy: Number(expectancy.toFixed(2)),
            winRate: Number(winRate.toFixed(1)),
            profitFactor: Number(profitFactor.toFixed(2)),
            riskRewardRatio: avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0,
            revengeTradeCount,
            streaks: { current: currentStreak, maxWin: maxWinStreak, maxLoss: maxLossStreak },
            insights
        };
    }
}

export default new BehavioralService();