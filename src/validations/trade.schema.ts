import { z } from 'zod';

/**
 * VALIDATION SCHEMAS
 * Zod schemas for request validation across all endpoints.
 */

// Solana wallet address: 44 characters, base58
const solanaWallet = z.string().min(32).max(44);

/**
 * Sync endpoint: POST /api/sync
 */
export const syncSchema = z.object({
  body: z.object({
    walletAddress: solanaWallet
  })
});

/**
 * Dashboard endpoint: GET /api/dashboard/:wallet
 */
export const dashboardSchema = z.object({
  params: z.object({
    wallet: solanaWallet
  })
});

/**
 * Trade history endpoint: GET /api/trades/:wallet
 */
export const tradesSchema = z.object({
  params: z.object({
    wallet: solanaWallet
  })
});

/**
 * Journal update endpoint: PATCH /api/journal/:positionId
 */
export const journalSchema = z.object({
  params: z.object({
    positionId: z.string().min(1)
  }),
  body: z.object({
    notes: z.string().min(1, "Notes cannot be empty").max(1000).optional(),
    emotion: z.enum(["Fearful", "Greedy", "Calm", "Anxious", "Neutral"]).optional(),
    rating: z.number().min(1).max(5).optional(),
    hypotheticalExitPrice: z.number().optional()
  }).refine(data => Object.values(data).some(v => v !== undefined), {
    message: "At least one field must be provided"
  })
});