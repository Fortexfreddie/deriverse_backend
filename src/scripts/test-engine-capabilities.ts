import 'dotenv/config';
import { deriverseEngine, programId } from '../config/deriverse';

async function testCapabilities() {
  // Using the Base64 strings that worked in your previous fetch-trade logs
  const sampleBase64 = "CwAAAAEAAACq/l4AAAAAAADKmjsAAAAA4GcX..."; // A real 'Fill' log
  const wallet = "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";

  console.log("🧪 STARTING ENGINE CAPABILITY TEST (NO INITIALIZE)\n");

  // --- STAGE 1: PURE DECODING ---
  console.log("1️⃣ Testing: Individual Log Decoding...");
  try {
    const formatted = `Program ${programId} data: ${sampleBase64}`;
    const decoded = await (deriverseEngine as any).logsDecode([formatted]);
    if (decoded && decoded.length > 0) {
      console.log("✅ SUCCESS: Engine can decode logs without initialization!");
      console.log("   Result:", JSON.stringify(decoded[0], null, 2));
    }
  } catch (err: any) {
    console.log("❌ FAILED: Log decoding requires initialization or a valid account.");
    console.log(`   Error: ${err.message}`);
  }

  // --- STAGE 2: GLOBAL MARKET CONTEXT ---
  console.log("\n2️⃣ Testing: getPerpContext (Global Market Stats)...");
  try {
    // Market 1 is usually SOL-PERP
    const context = await (deriverseEngine as any).getPerpContext(1);
    if (context) {
      console.log("✅ SUCCESS: Engine can fetch global market data without user account!");
    }
  } catch (err: any) {
    console.log("❌ FAILED: Market context requires initialization.");
    console.log(`   Error: ${err.message}`);
  }

  // --- STAGE 3: PRIVATE USER DATA ---
  console.log("\n3️⃣ Testing: getClientPerpOrders (Private Data)...");
  try {
    await (deriverseEngine as any).setSigner(wallet as any);
    const orders = await (deriverseEngine as any).getClientPerpOrders();
    
    // ADD THIS LINE TO READ THE VALUE
    console.log("✅ SUCCESS: Found orders:", JSON.stringify(orders, null, 2));

  } catch (err: any) {
    console.log("❌ FAILED: Private data strictly requires a valid trading account.");
    console.log(`   Error: ${err.message}`);
  }
}

testCapabilities();