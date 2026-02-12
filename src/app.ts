import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'dotenv/config';
import tradeRoutes from './routes/trade.routes';
import { globalErrorHandler } from './middleware/error';
import { AppError } from './utils/appError';

/**
 * EXPRESS APP CONFIGURATION
 * Sets up middleware, routes, and error handling.
 */

export const app: Application = express();

/**
 * MIDDLEWARE CONFIGURATION
 */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * ROUTE CONFIGURATION
 */
app.use('/api', tradeRoutes);

/**
 * HEALTH CHECK ENDPOINT
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

/**
 * SWAGGER DOCUMENTATION
 */
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../docs/swagger.json';
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

/**
 * NOT FOUND HANDLER
 * Handles requests to non-existent routes
 */
app.use((req: Request, _res: Response, _next: NextFunction) => {
  throw new AppError(`Route ${req.originalUrl} not found`, 404);
});

/**
 * GLOBAL ERROR HANDLER MIDDLEWARE
 * Must be registered last in the middleware chain
 */
app.use(globalErrorHandler);

export default app;
