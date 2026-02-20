import 'dotenv/config';
import { app } from './app';
import { prisma } from './config/db';

/**
 * SERVER ENTRY POINT
 * Starts the Express server and handles graceful shutdown.
 */

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('Deriverse Trading Analytics Backend Server');
  console.log('='.repeat(70));
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
  console.log('');
  console.log('API Endpoints:');
  console.log('');
  console.log('  POST   /api/sync');
  console.log('         Body: { "walletAddress": "..." }');
  console.log('         Syncs trades from blockchain for a wallet');
  console.log('');
  console.log('  GET    /api/dashboard/:wallet');
  console.log('         Returns: Live PnL for all open positions');
  console.log('');
  console.log('  GET    /api/trades/:wallet');
  console.log('         Query: ?market=&startDate=&endDate=&limit=&offset=');
  console.log('         Returns: Trade history with filtering and pagination');
  console.log('');
  console.log('  GET    /api/analytics/:wallet');
  console.log('         Query: ?market=&startDate=&endDate=');
  console.log('         Returns: Comprehensive analytics (PnL, win rate, fees, etc.)');
  console.log('');
  console.log('  GET    /api/analytics/:wallet/historical-pnl');
  console.log('         Query: ?startDate=&endDate=');
  console.log('         Returns: Historical PnL data for charts with drawdown');
  console.log('');
  console.log('  GET    /api/analytics/:wallet/time-analysis');
  console.log('         Query: ?startDate=&endDate=');
  console.log('         Returns: Daily and hourly performance metrics');
  console.log('');
  console.log('  PATCH  /api/journal/:positionId');
  console.log('         Body: { "notes", "emotion", "rating", "hypotheticalExitPrice" }');
  console.log('         Updates journal entry with AI analysis and market sentiment');
  console.log('='.repeat(70));
});

/**
 * Graceful shutdown on SIGTERM signal
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('HTTP server closed, database connection closed');
    process.exit(0);
  });
});

/**
 * Graceful shutdown on SIGINT signal (Ctrl+C)
 */
process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('HTTP server closed, database connection closed');
    process.exit(0);
  });
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});