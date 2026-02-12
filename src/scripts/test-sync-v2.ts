import 'dotenv/config';
import { SyncService } from '../services/sync.service';
import { prisma } from '../config/db';

async function runEndToEndTest() {
  const wallet = "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";
  const syncService = new SyncService();

  console.log("🏁 STARTING END-TO-END SYNC TEST...");

  try {
    // 1. Check DB state before sync
    const initialCount = await prisma.fill.count({ where: { position: { walletAddress: wallet } } });
    console.log(`\n📊 Initial DB State: Found ${initialCount} trades in database.`);

    // 2. Run the Sync (This uses the new Incremental Logic)
    console.log("🔄 Triggering Incremental Sync...");
    const result = await syncService.syncWallet(wallet);

    // 3. Final Report
    console.log("\n✅ SYNC COMPLETED:");
    console.log(`   - Positions Updated: ${result.positionsUpdated}`);
    console.log(`   - New Fills Created: ${result.fillsCreated}`);

    const finalCount = await prisma.fill.count({ where: { position: { walletAddress: wallet } } });
    console.log(`\n📈 New DB Total: ${finalCount} trades.`);

    if (result.fillsCreated === 0 && finalCount > 0) {
      console.log("✨ SUCCESS: Incremental logic worked! (No new trades to fetch).");
    } else if (result.fillsCreated > 0) {
      console.log("🔥 SUCCESS: New trades captured and saved!");
    }

  } catch (err: any) {
    console.error("❌ TEST CRASHED:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runEndToEndTest();