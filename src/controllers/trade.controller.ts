import { Request, Response, NextFunction } from 'express';
import { SyncService } from '../services/sync.service';
import { PnlService } from '../services/pnl.service';
import analyticsService from '../services/analytics.service';
import journalService from '../services/journal.service';
import behavioralService from '../services/behavioral.service';
import tradeService from '../services/trade.service';
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

            const query: any = {
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined
            };

            if (market) query.market = market as string;
            if (startDate) query.startDate = new Date(startDate as string);
            if (endDate) query.endDate = new Date(endDate as string);

            const result = await tradeService.getTradeHistory(wallet, query);

            res.status(200).json(result);
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
    /**
     * GET /api/analytics/:wallet/equity-curve
     * Get equity curve for a wallet
     */
    async getEquityCurve(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;

            if (!wallet) {
                throw new AppError('Wallet address is required', 400);
            }

            const equityCurve = await analyticsService.getEquityCurve(wallet);

            res.status(200).json({
                success: true,
                data: equityCurve
            });
        } catch (error) {
            next(error);
        }
    }
    /**
     * GET /api/analytics/leaderboard
     * Get global leaderboard
     */
    async getGlobalLeaderboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const leaderboard = await analyticsService.getGlobalLeaderboard();

            res.status(200).json({
                success: true,
                data: leaderboard
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/:wallet/composition
     * Get portfolio composition
     */
    async getPortfolioComposition(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;

            if (!wallet) {
                throw new AppError('Wallet address is required', 400);
            }

            const composition = await analyticsService.getPortfolioComposition(wallet);

            res.status(200).json({
                success: true,
                data: composition
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/:wallet/behavior
     * Get behavioral metrics (Revenge trading, streaks, psychology)
     */
    async getBehavioralMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;
            if (!wallet) throw new AppError('Wallet address is required', 400);

            const metrics = await behavioralService.getBehavioralMetrics(wallet);
            res.json({ success: true, data: metrics });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/:wallet/heatmap
     * Get heatmap data (Daily PnL)
     */
    async getHeatmapData(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;
            const { year, month } = req.query;

            if (!wallet) throw new AppError('Wallet address is required', 400);

            // Default to current month/year if not provided
            const current = new Date();
            const queryYear = year ? parseInt(year as string) : current.getFullYear();
            const queryMonth = month ? parseInt(month as string) : current.getMonth() + 1;

            const heatmap = await analyticsService.getHeatmapData(wallet, queryYear, queryMonth);

            res.status(200).json({
                success: true,
                data: heatmap
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/drawdown/:wallet
     * Fetch equity curve and drawdown time-series
     */
    async getDrawdown(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;

            if (!wallet) {
                throw new AppError('Wallet address is required', 400);
            }

            const series = await analyticsService.getDrawdownSeries(wallet);

            res.status(200).json({
                success: true,
                data: series
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new TradeController();
