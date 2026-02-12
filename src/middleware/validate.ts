import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodError } from 'zod';

/**
 * ZOD VALIDATION MIDDLEWARE
 * Validates request body, query, and params against a Zod schema.
 * Catches validation errors and returns structured error responses.
 */
export const validate = (schema: ZodType) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params
            });
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    success: false,
                    errors: error.issues.map((issue) => ({
                        path: issue.path.join('.'),
                        message: issue.message
                    }))
                });
            } else {
                next(error);
            }
        }
    };