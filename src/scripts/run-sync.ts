import 'dotenv/config';
import { SyncService } from '../services/sync.service';

async function main() {
    const wallet = "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";
    const sync = new SyncService();
    
    console.log("🔄 Starting full database synchronization...");
    const result = await sync.syncWallet(wallet);
    console.log(`✅ Success! Updated ${result.positionsUpdated} positions and ${result.fillsCreated} trades in DB.`);
}

main();