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
    const statusCode = err?.statusCode || 500;
    const message = err?.message || 'Something went wrong on the server';

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err?.stack })
    });
};