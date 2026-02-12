import 'dotenv/config';
import { PnlService } from '../services/pnl.service';

async function main() {
  const pnl = new PnlService();
  const wallet = "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";
  
  console.log("💰 Calculating Live Portfolio Performance...");
  const stats = await pnl.getWalletPerformance(wallet);
  
  console.table(stats);
}

main();