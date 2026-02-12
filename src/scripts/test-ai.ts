import 'dotenv/config';
import aiService from '../services/ai.service';

async function testAI() {
  console.log("🤖 TESTING AI JOURNALING SERVICE...");

  const mockTrade = {
    symbol: "SOL-PERP",
    side: "LONG",
    entryPrice: 95.50,
    currentPrice: 92.10,
    pnl: -3.40,
    size: 10
  };

  const mockNote = "I entered because I saw a big green candle on the 1-minute chart. I didn't set a stop loss because I was sure it would moon. Now I'm sweating.";

  try {
    console.log("📡 Sending to AI...");
    const analysis = await aiService.analyzeTradeJournal(mockNote, mockTrade);
    
    console.log("\n--- [ AI PSYCHOLOGY REPORT ] ---");
    console.log(`🧠 Bias Detected: ${analysis.bias}`);
    console.log(`📝 Insight: ${analysis.insight}`);
    console.log(`💡 Advice: ${analysis.advice}`);
    console.log("-------------------------------\n");

  } catch (err: any) {
    console.error("❌ AI Test Failed:", err.message);
  }
}

testAI();