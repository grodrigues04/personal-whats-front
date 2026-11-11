import "server-only";

import { MongoClient, type Db } from "mongodb";

const DEFAULT_DATABASE_NAME = "personal_whats";

// Reused across hot reloads in development and across invocations of a warm serverless instance
const globalForMongo = globalThis as typeof globalThis & {
  personalWhatsMongoClient?: Promise<MongoClient>;
};

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI must be configured");
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, appName: "personal-whats-front" });
  return client.connect().catch((error: unknown) => {
    globalForMongo.personalWhatsMongoClient = undefined;
    throw error;
  });
}

export async function getDatabase(): Promise<Db> {
  globalForMongo.personalWhatsMongoClient ??= connect();
  const client = await globalForMongo.personalWhatsMongoClient;
  return client.db(process.env.MONGODB_DATABASE || DEFAULT_DATABASE_NAME);
}
