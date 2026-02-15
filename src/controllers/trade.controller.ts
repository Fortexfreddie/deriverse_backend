import { Request, Response, NextFunction } from 'express';
import { SyncService } from '../services/sync.service';
import { PnlService } from '../services/pnl.service';
import analyticsService from '../services/analytics.service';
import journalService from '../services/journal.service';
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

            const result = await journalService.analyzeAndJournal(positionId, {
                notes,
                emotion,
                rating,
                hypotheticalExitPrice
            });

            res.status(200).json({
                success: true,
                data: result.updated,
                analysis: result.analysis
            });
        } catch (error) {
            next(error);
        }
    }
}

  export default new TradeController();
