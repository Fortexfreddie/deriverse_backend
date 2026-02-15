import OpenAI from 'openai';
import 'dotenv/config';

type AIResponse = {
  insight?: string;
  advice?: string;
  bias?: string;
  score?: number | string;
  next_action?: string;
  [k: string]: any;
};

export class AIService {
  private deepseek: OpenAI;
  private gemini: OpenAI;

  constructor() {
    this.deepseek = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
    });

    this.gemini = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '',
      baseURL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  }

  async analyzeTradeJournal(note: string, tradeContext: any, retryProvider?: string): Promise<AIResponse> {
    const provider = (retryProvider || process.env.AI_PROVIDER || 'gemini').toLowerCase();
    const model = provider === 'gemini' ? (process.env.GEMINI_MODEL || 'gemini-1.5-flash') : (process.env.DEEPSEEK_MODEL || 'deepseek-chat');
    const client = provider === 'gemini' ? this.gemini : this.deepseek;

    const systemPrompt = `You are a Cold-Blooded Risk Manager and Trading Psychologist.
Audit the trader's note against execution data. 
Focus on: Entry chasing, FOMO keywords, and Denial (negative PnL vs overconfident notes).

RETURN ONLY VALID JSON. No markdown backticks, no prose.
{
  "bias": "Single word (FOMO/Greed/Fear/Discipline/Revenge)",
  "insight": "1-sentence brutal truth",
  "score": 1-10 (integer),
  "next_action": "1 physical/mental step"
}`;

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Note: "${note}"\nData: ${JSON.stringify(tradeContext)}` }
        ],
        // Note: Not all providers support json_object, so we rely on the prompt too
        response_format: { type: 'json_object' }, 
        temperature: 0.2 // Lowered for even more consistency
      });

      const rawContent = completion.choices[0]?.message?.content || '{}';
      
      // Robust JSON Extraction
      try {
        // Remove markdown code blocks if the AI accidentally includes them
        const cleaned = rawContent.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
      } catch (parseError) {
        console.warn("JSON Parse failed, attempting regex extraction...");
        const match = rawContent.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        return { insight: "AI provided malformed response.", bias: "Unknown" };
      }

    } catch (error: any) {
      console.error(`AI Error (${provider}):`, error.message);
      
      // Recursive Fallback to Gemini if DeepSeek fails
      if (provider === 'deepseek' && !retryProvider) {
        console.log("Switching to Gemini fallback...");
        return this.analyzeTradeJournal(note, tradeContext, 'gemini');
      }
      return { insight: "AI Service currently unavailable.", score: 0 };
    }
  }
}

export default new AIService();