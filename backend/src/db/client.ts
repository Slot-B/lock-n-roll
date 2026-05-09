import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../config/env.js";
import * as schema from "./schema.js";

const queryClient = postgres(config.databaseUrl, {
  max: 10,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
export { schema };
