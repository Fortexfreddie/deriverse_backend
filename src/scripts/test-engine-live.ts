import 'dotenv/config';
import { deriverseEngine } from '../config/deriverse';

async function testEngineLive() {
  const wallet = "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";
  
  console.log("🚀 Waking up the Deriverse Engine...");

  try {
    // 1. Set the wallet
    await (deriverseEngine as any).setSigner(wallet as any);
    
    // 2. IMPORTANT: This "initializes" the internal state and fetches the trading account
    console.log("📡 Initializing client data from blockchain...");
    await (deriverseEngine as any).initialize();
    
    // 3. Check if the account is now loaded
    const clientAccount = (deriverseEngine as any).clientPrimaryAccount;
    if (clientAccount) {
      console.log("✅ Client Account Loaded:", clientAccount.toString());
    } else {
      console.warn("⚠️ Client Account still NULL. This wallet might not have a Deriverse account initialized.");
    }

    // 4. Try to fetch Open Positions (Live Data)
    console.log("\n📊 Fetching Live Perp Positions...");
    const positions = await (deriverseEngine as any).getClientPerpOrders();
    
    if (positions && positions.length > 0) {
      console.log(`✅ Found ${positions.length} active positions/orders:`);
      console.dir(positions, { depth: null, colors: true });
    } else {
      console.log("ℹ️ No active perp positions found for this wallet.");
    }

    // 5. Test the logsDecode again now that we are initialized
    // (Using one of the Base64 strings from your previous successful log)
    const sampleLog = ["Program data: CwAAAAEAAACq/l4AAAAAAADKmjsAAAAA4GcX..."];
    console.log("\n🧪 Testing logsDecode with initialized engine...");
    const decoded = await (deriverseEngine as any).logsDecode(sampleLog);
    console.log("Decoded Result:", JSON.stringify(decoded, null, 2));

  } catch (err: any) {
    console.error("❌ Test Failed:", err.message);
    if (err.stack) console.error(err.stack.split('\n')[0]);
  }
}

testEngineLive();