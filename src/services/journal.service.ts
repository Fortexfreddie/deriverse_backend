import { prisma } from '../config/db';
import aiService from './ai.service';
import sentimentService from './sentiment.service';
import traderProfileService from './trader-profile.service';

/**
 * JOURNAL SERVICE
 * Centralizes the logic for "AI Coaching" and journal updates.
 * Used by:
 * 1. TradeController (Manual user updates)
 * 2. SyncService (Automatic "End of Trade" analysis)
 */
export class JournalService {
    async analyzeAndJournal(positionId: string, updates: {
        notes?: string;
        emotion?: string;
        rating?: number;
        hypotheticalExitPrice?: number
    } = {}) {

        // 1. Fetch current position data to give AI the "Context"
        const position = await prisma.position.findUnique({
            where: { id: positionId },
            include: { fills: true }
        });

        if (!position) throw new Error('Position not found');

        // 2. Calculate What-If Alternate Reality (Hindsight Analysis)
        let opportunityCost: number | undefined = undefined;
        let opportunityCostNote: string | undefined = undefined;

        if (updates.hypotheticalExitPrice && position.avgExitPrice) {
            const direction = position.side === 'LONG' ? 1 : -1;
            opportunityCost = (updates.hypotheticalExitPrice - position.avgExitPrice) * position.totalSize * direction;
            if (opportunityCost > 0) {
                opportunityCostNote = `You left $${opportunityCost.toFixed(2)} on the table because you were scared. Your exit strategy is leakier than a basket.`;
            }
        }

        // 3. Get Contextual Market Sentiment
        const headlines = await sentimentService.getTopHeadlines(position.market);
        const sentimentResult = await sentimentService.analyzeMarketSentiment(headlines);
        const macroTiming = sentimentService.evaluateTradeTimingVsMacro(
            sentimentResult.sentiment,
            position.side
        );

        // 4. Get Trader Profile / Nudge
        const traderProfile = await traderProfileService.analyzeTraderProfile(position.walletAddress);
        const nudge = traderProfileService.generateNudge(traderProfile.profile);

        // 5. Run AI analysis (passing the actual trade data + macro context)
        let aiResult: any = null;
        try {
            const contextWithMacro = {
                ...position,
                newsHeadlines: headlines,
                marketSentiment: sentimentResult.sentiment,
                macroContext: sentimentResult.macroContext,
                opportunityCost,
                traderProfile: traderProfile.profile
            };
            // Use provided notes or empty string for auto-analysis
            aiResult = await aiService.analyzeTradeJournal(updates.notes || '', contextWithMacro);
        } catch (aiError) {
            console.error("AI Analysis skipped:", aiError);
        }

        // 6. Build update data object with only defined values
        const updateData: any = {
            newsHeadlines: headlines.join(' | '),
            marketSentiment: sentimentResult.sentiment,
            macroContext: sentimentResult.macroContext + ' ' + macroTiming,
            traderProfile: traderProfile.profile,
            tradeFrequency: Math.ceil(traderProfile.avgHoldTime),
            lastNudge: nudge
        };

        // Add optional fields only if provided
        if (updates.notes !== undefined) updateData.notes = updates.notes;
        if (updates.emotion !== undefined) updateData.emotion = updates.emotion;
        if (updates.rating !== undefined) updateData.rating = updates.rating;

        if (aiResult?.bias) updateData.aiBias = aiResult.bias;
        if (aiResult?.insight) updateData.aiInsight = aiResult.insight;
        if (aiResult?.advice) updateData.aiAdvice = aiResult.advice;
        if (aiResult?.score) updateData.aiScore = parseInt(String(aiResult.score));
        if (aiResult?.next_action) updateData.aiNextAction = aiResult.next_action;
        if (aiResult) updateData.aiReview = `${aiResult.insight}\n\nTip: ${aiResult.next_action || aiResult.advice}`;

        if (updates.hypotheticalExitPrice) updateData.hypotheticalExitPrice = updates.hypotheticalExitPrice;
        if (opportunityCost) updateData.opportunityCost = opportunityCost;
        if (opportunityCostNote) updateData.opportunityCostNote = opportunityCostNote;

        // 7. Update everything in one database call
        const updated = await prisma.position.update({
            where: { id: positionId },
            data: updateData
        });

        return {
            updated,
            analysis: {
                aiAnalysis: aiResult,
                traderProfile: traderProfile,
                macroContext: sentimentResult,
                whatIfAnalysis: {
                    opportunityCost,
                    opportunityCostNote
                }
            }
        };
    }
}

export default new JournalService();
