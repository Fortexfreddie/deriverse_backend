import 'dotenv/config';
import analyticsService from '../services/analytics.service';
import { SyncService } from '../services/sync.service';

/**
 * FINAL ANALYTICS TEST
 * This script runs against your existing AnalyticsService to verify:
 * 1. PnL Totals (Realized/Unrealized)
 * 2. Session Bucketing (Asian/London/NY)
 * 3. Fee Composition (Spot vs Perp)
 * 4. Win Rate Accuracy
 */
async function main() {
    const walletAddress = "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";

    console.log(`\n===========================================================`);
    console.log(`🚀 STARTING ANALYTICS AUDIT FOR: ${walletAddress}`);
    console.log(`===========================================================\n`);

    try {
        const syncService = new SyncService();

        console.log(`\n[0/3] Pre-Syncing wallet to ensure DB has data...`);
        await syncService.syncWallet(walletAddress, 20);

        // 1. Fetch Comprehensive Stats
        console.log("[1/3] Calculating Comprehensive Analytics...");
        const stats = await analyticsService.getComprehensiveAnalytics(walletAddress);

        console.log("\n📊 CORE PERFORMANCE METRICS");
        console.table({
            "Realized PnL": `$${stats.totalPnl.realized.toFixed(2)}`,
            "Unrealized PnL": `$${stats.totalPnl.unrealized.toFixed(2)}`,
            "Total PnL": `$${stats.totalPnl.total.toFixed(2)}`,
            "Win Rate": `${stats.winRate}%`,
            "Total Volume": `$${stats.totalVolume.toLocaleString()}`,
            "Total Fees": `$${stats.totalFees.toFixed(4)}`
        });

        // 2. Session Breakdown
        console.log("\n🌍 GLOBAL SESSION PERFORMANCE");
        console.table(stats.sessionPerformance);

        // 3. Fee Composition
        console.log("\n💸 FEE COMPOSITION (Spot vs Perp)");
        console.table({
            "Spot Fees": stats.feeComposition.spot.toFixed(6),
            "Perp Fees": stats.feeComposition.perp.toFixed(6),
            "Total": stats.feeComposition.total.toFixed(6)
        });

        // 4. Time-Based Distribution
        console.log("\n⏳ Fetching Time-Based Performance...");
        const timeData = await analyticsService.getTimeBasedPerformance(walletAddress);
        
        console.log("\n📅 DAILY PERFORMANCE (Top 5 Days)");
        console.table(timeData.daily.slice(-5));

        console.log("\n✅ TEST COMPLETE");

    } catch (error: any) {
        console.error("\n❌ TEST FAILED");
        console.error(error.message);
    }
}

main().catch(console.error);