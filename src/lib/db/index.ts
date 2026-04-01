import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as relations from "./relations";

// VULN-011 FIX: Use rejectUnauthorized=true in production for proper SSL verification.
// Set DB_SSL_REJECT_UNAUTHORIZED=false explicitly only for development/self-signed certs.
const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: sslRejectUnauthorized },
    })
  : new Pool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER || "app_user",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "analytics_db",
      ssl: false,
    });
export const db = drizzle(pool, { schema: { ...schema, ...relations } });
