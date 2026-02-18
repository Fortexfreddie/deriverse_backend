import "dotenv/config";
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const isProduction = process.env.NODE_ENV === "production";

// In production, use the Pooler URL (6543). Locally, use your standard DATABASE_URL.
const connectionString = isProduction 
  ? process.env.POOLER_URL 
  : process.env.DATABASE_URL;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });