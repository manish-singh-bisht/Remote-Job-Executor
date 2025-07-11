import { PrismaClient } from '../../generated/prisma';

/**
 * @description This is a global variable to store the prisma client.
 */
declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * @description This is a function to get the prisma client.
 * @returns The prisma client.
 */
const prisma =
  global.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url:
          process.env.DATABASE_URL +
          '?connection_limit=20&pool_timeout=20&connect_timeout=60',
      },
    },
    log: ['warn', 'error'],
  });

global.prisma = prisma;

export default prisma;
