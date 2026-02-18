import { Request, Response, NextFunction } from 'express';

/**
 * GLOBAL ERROR HANDLER MIDDLEWARE
 * Catches all errors thrown by controllers/services and returns standardized JSON.
 * Must be the last middleware registered in app.ts
 */
export const globalErrorHandler = (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    // always log the error to the console so we can debug it
    console.error(`[${new Date().toISOString()}] ERROR:`, err);

    const statusCode = err?.statusCode || 500;
    const message = err?.message || 'Something went wrong on the server';

    const isProduction = process.env.NODE_ENV === 'production';
    
    // In production, trust only our custom AppErrors (operational)
    // For unknown errors (bugs, crashes), show "Internal Server Error"
    const safeMessage = (isProduction && !err.isOperational) 
        ? 'Internal Server Error' 
        : message;

    res.status(statusCode).json({
        success: false,
        error: safeMessage,
        // Only show stack trace if NOT in production
        ...(!isProduction && { stack: err?.stack })
    });
};