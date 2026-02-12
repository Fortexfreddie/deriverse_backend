import 'dotenv/config';
import { BlockchainService } from '../services/blockchain.service';
import { getMarketName } from '../config/constants';

/**
 * BLOCKCHAIN SERVICE VERIFICATION
 * Tests the raw fetching and decoding logic in isolation.
 */
async function verifyBlockchain() {
    const wallet = "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";
    const service = new BlockchainService();

    console.log(`📡 Initializing Blockchain Service Test...`);
    console.log(`🔎 Target Wallet: ${wallet}`);

    try {
        const trades = await service.fetchDecodedTrades(wallet, 20);

        if (trades.length === 0) {
        console.log("⚠️  No trades found. Ensure the wallet has recent Devnet activity.");
        return;
        }

        console.log(`\n✅ Successfully retrieved and decoded ${trades.length} trades:`);
        console.table(trades.map(t => ({
        Signature: `${t.signature.substring(0, 10)}...`,
        Market: getMarketName(t.marketId),
        Side: t.side,
        Price: t.price,
        Size: t.size,
        Time: t.timestamp.toLocaleTimeString()
        })));

    } catch (error: any) {
        console.error("❌ Blockchain Verification Failed!");
        console.error(`Error: ${error.message}`);
    }
}

verifyBlockchain();