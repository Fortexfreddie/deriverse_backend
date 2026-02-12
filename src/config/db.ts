import "dotenv/config";
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client'; // or from your generated path

// 1. Setup the standard Postgres connection pool
const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });

// 2. Setup the Driver Adapter (This is the new Prisma 7 requirement)
const adapter = new PrismaPg(pool);

// 3. Instantiate the client with the adapter
export const prisma = new PrismaClient({ adapter });