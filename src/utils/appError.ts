export class AppError extends Error {
    public isOperational: boolean;

    constructor(public message: string, public statusCode: number) {
        super(message);
        
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}