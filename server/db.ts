"use strict";

import pg from "pg";
import { Pool } from "pg"; 
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import "dotenv/config";

// Ensure TIMESTAMP without timezone (OID 1114) is parsed as UTC Date
pg.types.setTypeParser(1114, (stringValue: string) => {
  if (!stringValue) return null;
  const isoStr = stringValue.includes("T") ? stringValue : stringValue.replace(" ", "T");
  return new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z");
});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=UTC",
});

export const db = drizzle(pool, { schema });

