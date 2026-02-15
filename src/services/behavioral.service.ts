import { prisma } from '../config/db';

/**
 * BEHAVIORAL SERVICE
 * Analyzes trade history for emotional/behavioral patterns.
 * Uses real position PnL data for accurate win/loss metrics.
 */
export class BehavioralService {
    async analyzeWallet(walletAddress: string) {
        const fills = await prisma.fill.findMany({
            where: { position: { walletAddress } },
            orderBy: { timestamp: 'asc' },
            include: { position: true }
        });

        const insights: string[] = [];
        let revengeTradeCount = 0;
        let totalProfit = 0;
        let totalLoss = 0;
        let wins = 0;
        let losses = 0;

        // 1. Guard clause: If no trades, return early
        if (fills.length < 2) {
            return {
                revengeTradeCount: 0,
                insights: ["Insufficient trade history for behavioral analysis."],
                tradeCount: fills.length,
                profitFactor: 0,
                winRate: 0
            };
        }

        // 2. Track which positions we've already counted to avoid
        //    duplicating PnL across multiple fills of the same position
        const countedPositions = new Set<string>();

        for (let i = 0; i < fills.length; i++) {
            const current = fills[i];
            if (!current) continue;

            // --- Profit Factor & Win Rate (per-position, deduplicated) ---
            // Count each closed position exactly once using its realized PnL
            if (!current.isEntry && current.position.status === 'CLOSED' && !countedPositions.has(current.positionId)) {
                countedPositions.add(current.positionId);
                const pnl = current.position.realizedPnl ?? 0;

                if (pnl > 0) {
                    wins++;
                    totalProfit += pnl;
                } else if (pnl < 0) {
                    losses++;
                    totalLoss += Math.abs(pnl);
                }
            }

            // --- Revenge Trade Detection ---
            if (i > 0) {
                const previous = fills[i - 1];
                if (previous && !previous.isEntry && current.isEntry) {
                    const timeDiff = (current.timestamp.getTime() - previous.timestamp.getTime()) / 1000 / 60;
                    // Only count as revenge if same market + fast re-entry
                    if (timeDiff < 15 && current.position.market === previous.position.market) {
                        revengeTradeCount++;
                    }
                }
            }
        }

        // 3. Generate behavioral insights
        if (revengeTradeCount > 1) {
            insights.push(`Detected ${revengeTradeCount} potential revenge trades. You are over-reacting to market movements.`);
        }

        const totalClosed = wins + losses;
        const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;
        const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? 100 : 0);

        if (winRate > 60) {
            insights.push(`Strong win rate of ${winRate.toFixed(1)}%. Maintain execution discipline.`);
        } else if (winRate < 40 && totalClosed > 3) {
            insights.push(`Low win rate (${winRate.toFixed(1)}%). Review your entry criteria and risk management.`);
        }

        if (profitFactor < 1 && totalClosed > 3) {
            insights.push(`Profit factor below 1 (${profitFactor.toFixed(2)}). Your losses outweigh your gains.`);
        }

        return {
            revengeTradeCount,
            insights,
            tradeCount: fills.length,
            winRate: Number(winRate.toFixed(2)),
            profitFactor: Number(profitFactor.toFixed(2))
        };
    }
}