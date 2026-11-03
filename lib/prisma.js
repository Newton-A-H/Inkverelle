import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;
const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Set DATABASE_URL before connecting to the Inkverelle database.');
}

export const prisma = globalForPrisma.inkverellePrisma || new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.inkverellePrisma = prisma;
}
