import { Request, Response, NextFunction } from 'express';
import { SyncService } from '../services/sync.service';
import { PnlService } from '../services/pnl.service';
import analyticsService from '../services/analytics.service';
import aiService from '../services/ai.service';
import sentimentService from '../services/sentiment.service';
import traderProfileService from '../services/trader-profile.service';
import { prisma } from '../config/db';
import { AppError } from '../utils/appError';

/**
 * TRADE CONTROLLER
 * Handles HTTP request routing and response orchestration
 * Delegates business logic to service layer
 */

export class TradeController {
    private syncService: SyncService;
    private pnlService: PnlService;

    constructor() {
        this.syncService = new SyncService();
        this.pnlService = new PnlService();
    }

    /**
     * POST /api/sync
     * Triggers a fresh blockchain scan and sync for a wallet
     */
    async syncWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { walletAddress } = req.body;

            if (!walletAddress) {
                throw new AppError('Wallet address is required', 400);
            }

            console.log(`Syncing wallet: ${walletAddress}`);
            const result = await this.syncService.syncWallet(walletAddress);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/dashboard/:wallet
     * Fetches live PnL and ROI for all open positions
     */
    async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;

            if (!wallet) {
                throw new AppError('Wallet address is required', 400);
            }

            const performance = await this.pnlService.getWalletPerformance(wallet);

            res.status(200).json({
                success: true,
                data: performance
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/trades/:wallet
     * Fetches all individual fills (trades) for a wallet from database
     * Supports filtering by market, date range, and pagination
     */
    async getTradeHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;
            const { market, startDate, endDate, limit, offset } = req.query;

            if (!wallet) {
                throw new AppError('Wallet address is required', 400);
            }

            // Build where clause
            const whereClause: any = {
                position: { walletAddress: wallet }
            };

            if (market) {
                whereClause.position = {
                    ...whereClause.position,
                    market: market as string
                };
            }

            if (startDate || endDate) {
                whereClause.timestamp = {};
                if (startDate) {
                    whereClause.timestamp.gte = new Date(startDate as string);
                }
                if (endDate) {
                    whereClause.timestamp.lte = new Date(endDate as string);
                }
            }

            // Get total count for pagination
            const totalCount = await prisma.fill.count({ where: whereClause });

            // Apply pagination - only include if defined
            const take = limit ? parseInt(limit as string) : undefined;
            const skip = offset ? parseInt(offset as string) : undefined;

            const queryOptions: any = {
                where: whereClause,
                orderBy: { timestamp: 'desc' },
                include: { position: true }
            };

            if (take !== undefined) {
                queryOptions.take = take;
            }
            if (skip !== undefined) {
                queryOptions.skip = skip;
            }

            const trades = await prisma.fill.findMany(queryOptions as any);

            res.status(200).json({
                success: true,
                data: trades,
                count: trades.length,
                total: totalCount,
                pagination: {
                    limit: take,
                    offset: skip,
                    hasMore: skip !== undefined && take !== undefined ? (skip + take) < totalCount : false
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/:wallet
     * Get comprehensive analytics for a wallet
     */
    async getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;
            const { market, startDate, endDate } = req.query;

            if (!wallet) {
                throw new AppError('Wallet address is required', 400);
            }

            // Build filters object conditionally - only include defined values
            const filters: Partial<{ market: string; startDate: Date; endDate: Date }> = {};
            if (market) {
                filters.market = market as string;
            }
            if (startDate) {
                filters.startDate = new Date(startDate as string);
            }
            if (endDate) {
                filters.endDate = new Date(endDate as string);
            }

            const analytics = await analyticsService.getComprehensiveAnalytics(
                wallet,
                Object.keys(filters).length > 0 ? (filters as any) : undefined
            );

            res.status(200).json({
                success: true,
                data: analytics
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/:wallet/historical-pnl
     * Get historical PnL data for charts
     */
    async getHistoricalPnL(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;
            const { startDate, endDate } = req.query;

            if (!wallet) {
                throw new AppError('Wallet address is required', 400);
            }

            const historicalData = await analyticsService.getHistoricalPnL(
                wallet,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.status(200).json({
                success: true,
                data: historicalData
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/:wallet/time-analysis
     * Get time-based performance metrics
     */
    async getTimeBasedPerformance(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;
            const { startDate, endDate } = req.query;

            if (!wallet) {
                throw new AppError('Wallet address is required', 400);
            }

            const timeAnalysis = await analyticsService.getTimeBasedPerformance(
                wallet,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.status(200).json({
                success: true,
                data: timeAnalysis
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/journal/:positionId
     * Updates journal notes, emotion, or rating for a position
     * + AI analysis + What-If Hindsight + Market Sentiment + Trader Profile Nudge
     */
    async updateJournal(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const positionId = Array.isArray(req.params.positionId) ? req.params.positionId[0] : req.params.positionId;
            const { notes, emotion, rating, hypotheticalExitPrice } = req.body;

            if (!positionId) throw new AppError('Position ID is required', 400);

            // 1. Fetch current position data to give AI the "Context"
            const position = await prisma.position.findUnique({
                where: { id: positionId },
                include: { fills: true }
            });

            if (!position) throw new AppError('Position not found', 404);

            // 2. Calculate What-If Alternate Reality (Hindsight Analysis)
            let opportunityCost: number | undefined = undefined;
            let opportunityCostNote: string | undefined = undefined;
            if (hypotheticalExitPrice && position.avgExitPrice) {
                opportunityCost = (hypotheticalExitPrice - position.avgExitPrice) * position.totalSize;
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
                aiResult = await aiService.analyzeTradeJournal(notes || '', contextWithMacro);
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
            if (notes !== undefined) updateData.notes = notes;
            if (emotion !== undefined) updateData.emotion = emotion;
            if (rating !== undefined) updateData.rating = rating;
            if (aiResult?.bias) updateData.aiBias = aiResult.bias;
            if (aiResult?.insight) updateData.aiInsight = aiResult.insight;
            if (aiResult?.advice) updateData.aiAdvice = aiResult.advice;
            if (aiResult?.score) updateData.aiScore = parseInt(String(aiResult.score));
            if (aiResult?.next_action) updateData.aiNextAction = aiResult.next_action;
            if (aiResult) updateData.aiReview = `${aiResult.insight}\n\nTip: ${aiResult.next_action || aiResult.advice}`;
            if (hypotheticalExitPrice) updateData.hypotheticalExitPrice = hypotheticalExitPrice;
            if (opportunityCost) updateData.opportunityCost = opportunityCost;
            if (opportunityCostNote) updateData.opportunityCostNote = opportunityCostNote;

            // 7. Update everything in one database call
            const updated = await prisma.position.update({
                where: { id: positionId },
                data: updateData
            });

            res.status(200).json({
                success: true,
                data: updated,
                analysis: {
                    aiAnalysis: aiResult,
                    traderProfile: traderProfile,
                    macroContext: sentimentResult,
                    whatIfAnalysis: {
                        opportunityCost,
                        opportunityCostNote
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    }
}

  export default new TradeController();
