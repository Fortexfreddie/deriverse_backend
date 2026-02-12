import 'dotenv/config';
import sentimentService from '../services/sentiment.service';

async function testLiveSentiment() {
  console.log("🌊 STARTING LIVE MACRO-SENTIMENT TEST...");

  try {
    // 1. Fetch Real Headlines
    const market = "SOL-PERP";
    console.log(`📡 Fetching live news for ${market}...`);
    const headlines = await sentimentService.getTopHeadlines(market);

    if (headlines.length === 0) {
      console.log("⚠️ No headlines found. Check your API key or internet connection.");
      return;
    }

    console.log(`✅ Found ${headlines.length} headlines.`);
    headlines.forEach((h, i) => console.log(`   ${i + 1}. ${h}`));

    // 2. AI Sentiment Analysis
    console.log("\n🧠 Analyzing sentiment with Gemini...");
    const analysis = await sentimentService.analyzeMarketSentiment(headlines);
    
    console.log("\n--- [ LIVE MARKET MOOD ] ---");
    console.log(`📊 Sentiment: ${analysis.sentiment}`);
    console.log(`🌍 Macro Context: ${analysis.macroContext}`);

    // 3. Trade Evaluation
    const mockSide = "LONG";
    console.log(`\n⚖️ Evaluating a ${mockSide} trade vs. current tide...`);
    const verdict = sentimentService.evaluateTradeTimingVsMacro(analysis.sentiment, mockSide);
    console.log(`📝 Verdict: ${verdict}`);

  } catch (err: any) {
    console.error("❌ Test Failed:", err.message);
  }
}

testLiveSentiment();