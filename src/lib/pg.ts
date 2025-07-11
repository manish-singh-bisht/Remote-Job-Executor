import { Client } from 'pg';

/**
 * @description This is a singleton client for the pg library.
 * @description It is used to connect to the database and use for notifications.
 */
let pgClient: Client | null = null;

/**
 * @description This is a function to get the pg client.
 * @returns The pg client.
 */
export const getPgClient = async (): Promise<Client> => {
  if (!pgClient) {
    pgClient = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await pgClient.connect();
  }
  return pgClient;
};

/**
 * @description This is a function to close the pg client.
 */
export const closePgClient = async (): Promise<void> => {
  if (pgClient) {
    await pgClient.end();
    pgClient = null;
  }
};
