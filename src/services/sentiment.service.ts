import 'dotenv/config';
import aiService from './ai.service';
import { CryptoPanicResponse, SentimentResult } from '../types/index';

export class SentimentService {
  private apiKey = process.env.CRYPTOPANIC_API_KEY;
  private baseUrl = 'https://cryptopanic.com/api/developer/v2/posts/';

  async getTopHeadlines(market: string): Promise<string[]> {
    if (!this.apiKey) return ["Market sentiment is mixed."];
    const currency = market.split('-')[0]?.toUpperCase();
    
    try {
      const endpoints = [
        `${this.baseUrl}?auth_token=${this.apiKey}&currencies=${currency}&filter=rising&public=true`,
        `${this.baseUrl}?auth_token=${this.apiKey}&filter=hot&public=true`
      ];

      const results = await Promise.all(
        endpoints.map(url => fetch(url).then(r => r.json()))
      ) as CryptoPanicResponse[]; 
      
      const allHeadlines = [
        ...(results[0]?.results || []),
        ...(results[1]?.results || [])
      ].map(post => post.title);

      // Increase limit to prevent starvation
      return Array.from(new Set(allHeadlines)).slice(0, 20);
    } catch (error) {
      console.error("News API Error:", error);
      return [];
    }
  }

  async analyzeMarketSentiment(headlines: string[]): Promise<SentimentResult> {
    if (headlines.length === 0) {
      return { headlines: [], sentiment: 'Neutral', macroContext: 'No recent news found.' };
    }

    const prompt = `
        Analyze these headlines for the provided crypto market. 
        
        SCORING ENGINE:
        - High Impact: SEC/Regulator news, Exchange hacks, Network downtime (-3 or +3).
        - Medium Impact: New listings, Partnership hype (+1).
        - If the news is > 6 hours old, degrade weight by 50%.

        Headlines: ${JSON.stringify(headlines)}
        
        Return ONLY a JSON object:
        {
            "sentiment": "Bullish" | "Bearish" | "Neutral",
            "summary": "1-sentence 'brutal' truth about the macro state",
            "confidence_score": 1-10
        }
    `;

    try {
      const aiResponse = await aiService.analyzeTradeJournal(prompt, { type: 'market_scan' });
      
      // Force the type to satisfy evaluateTradeTimingVsMacro
      const sentiment = (['Bullish', 'Bearish', 'Neutral'].includes(aiResponse.sentiment) 
        ? aiResponse.sentiment 
        : 'Neutral') as 'Bullish' | 'Bearish' | 'Neutral';

      return {
        headlines,
        sentiment,
        macroContext: aiResponse.summary || 'Mixed market conditions.'
      };
    } catch (err) {
      return { headlines, sentiment: 'Neutral', macroContext: 'AI analysis failed.' };
    }
  }

  evaluateTradeTimingVsMacro(sentiment: 'Bullish' | 'Bearish' | 'Neutral', side: string): string {
    const isLong = side === 'LONG';
    const isShort = side === 'SHORT';

    if (sentiment === 'Neutral') {
      return "CHOPPY WATER: The market lacks a clear macro direction. You are relying purely on technicals. Tighten your Stop Loss and reduce your Take Profit expectations.";
    }

    const isAgainstTide = (isLong && sentiment === 'Bearish') || (isShort && sentiment === 'Bullish');
    
    // Specific check for Short Squeeze risk
    if (isShort && sentiment === 'Bullish') {
        return "SHORT SQUEEZE WARNING: The macro tide is Bullish. Shorting here is picking up pennies in front of a steamroller. Watch the funding rates!";
    }

    if (isAgainstTide) {
      return isLong 
        ? "SWIMMING AGAINST THE TIDE: You are LONG while the macro sentiment is BEARISH. This is often a sign of Bottom Fishing or FOMO. Ensure you aren't fighting the trend."
        : "TREND REVERSAL RISK: You are SHORTING a BULLISH macro trend. High risk of being squeezed. Check if your logic is based on data or just a feeling that it is too high.";
    }

    return `MACRO ALIGNMENT: Your ${side} position matches the ${sentiment} tide. This increases the probability of success. Stay disciplined and manage the trade according to your plan.`;
  }
}

export default new SentimentService();