import 'dotenv/config';
import { BlockchainService } from '../services/blockchain.service';

async function fetchMyTrades() {
  const wallet = process.env.WALLET_ADDRESS || "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";
  
  console.log("🔍 Fetching trades for wallet:", wallet);
  
  try {
    const blockchainService = new BlockchainService();
    const trades = await blockchainService.fetchDecodedTrades(wallet, 100);
    
    console.log(`\n✅ Total trades found: ${trades.length}`);
    
    if (trades.length > 0) {
      console.log("\n💰 Trade Summary:");
      trades.forEach((trade: any, idx: number) => {
        console.log(`\n[${idx + 1}] ${trade.side} @ $${trade.price || 'N/A'}`);
        console.log(`    Size: ${trade.size || 'N/A'}`);
        console.log(`    Fee: ${trade.fee || 'N/A'}`);
        console.log(`    Signature: ${trade.signature.substring(0, 16)}...`);
        console.log(`    Order ID: ${trade.orderId || 'N/A'}`);
      });
    } else {
      console.log("\n💡 No trades found. This wallet may not have any trade transactions.");
    }
    
    return trades;
  } catch (err: any) {
    console.error("❌ Error fetching trades:", err.message);
    throw err;
  }
}

// Run if executed directly
if (require.main === module) {
  fetchMyTrades().catch(console.error);
}
