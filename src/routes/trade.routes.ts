import { Router, type Router as ExpressRouter } from 'express';
import TradeController from '../controllers/trade.controller';
import { validate } from '../middleware/validate';
import { syncSchema, journalSchema } from '../validations/trade.schema';

/**
 * TRADE ROUTES
 * Defines all endpoints for the Trade API.
 */

const router: ExpressRouter = Router();
const controller = TradeController;

/**
 * POST /api/sync
 * Sync trades from blockchain for a wallet
 */
router.post('/sync', validate(syncSchema), (req, res, next) =>
  controller.syncWallet(req, res, next)
);

/**
 * GET /api/dashboard/:wallet
 * Fetch live PnL dashboard
 */
router.get('/dashboard/:wallet', (req, res, next) =>
  controller.getDashboard(req, res, next)
);

/**
 * GET /api/trades/:wallet
 * Fetch trade history (supports filtering: ?market=&startDate=&endDate=&limit=&offset=)
 */
router.get('/trades/:wallet', (req, res, next) =>
  controller.getTradeHistory(req, res, next)
);

/**
 * GET /api/analytics/:wallet
 * Get comprehensive analytics (supports filtering: ?market=&startDate=&endDate=)
 */
router.get('/analytics/:wallet', (req, res, next) =>
  controller.getAnalytics(req, res, next)
);

/**
 * GET /api/analytics/:wallet/historical-pnl
 * Get historical PnL data for charts (supports filtering: ?startDate=&endDate=)
 */
router.get('/analytics/:wallet/historical-pnl', (req, res, next) =>
  controller.getHistoricalPnL(req, res, next)
);

/**
 * GET /api/analytics/:wallet/time-analysis
 * Get time-based performance metrics (supports filtering: ?startDate=&endDate=)
 */
router.get('/analytics/:wallet/time-analysis', (req, res, next) =>
  controller.getTimeBasedPerformance(req, res, next)
);

/**
 * PATCH /api/journal/:positionId
 * Update journal entry for a position
 */
router.patch('/journal/:positionId', validate(journalSchema), (req, res, next) =>
  controller.updateJournal(req, res, next)
);

export default router;
