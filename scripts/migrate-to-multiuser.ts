import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import { hashSync } from "bcryptjs";
import { randomUUID } from "crypto";

async function run() {
  console.log("Starting multi-user migration...");

  try {
    // 1. Create new tables directly
    console.log("Creating new tables...");
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" text NOT NULL UNIQUE,
        "password_hash" text NOT NULL,
        "name" text NOT NULL,
        "role" varchar(20) DEFAULT 'user',
        "is_active" boolean DEFAULT true,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "user_sites" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE cascade,
        "role" varchar(20) DEFAULT 'viewer',
        "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "uniq_user_site" UNIQUE("user_id", "site_id")
      );
      CREATE INDEX IF NOT EXISTS "idx_user_sites_user_id" ON "user_sites" ("user_id");
      CREATE INDEX IF NOT EXISTS "idx_user_sites_site_id" ON "user_sites" ("site_id");
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "password_reset_otps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "otp_hash" text NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "used" boolean DEFAULT false,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_otp_user_id" ON "password_reset_otps" ("user_id");
    `);

    // 2. Modify existing tables
    console.log("Modifying existing tables...");
    
    await db.execute(sql`
      ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "users"("id") ON DELETE cascade;
    `);

    await db.execute(sql`
      ALTER TABLE "login_attempts" ADD COLUMN IF NOT EXISTS "email" text;
      
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_ip_ua') THEN
          ALTER TABLE "login_attempts" DROP CONSTRAINT "uniq_ip_ua";
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_ip_ua_email') THEN
          ALTER TABLE "login_attempts" ADD CONSTRAINT "uniq_ip_ua_email" UNIQUE ("ip", "user_agent", "email");
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS "idx_login_attempts_email" ON "login_attempts" ("email");
    `);

    // 3. Seed data
    console.log("Seeding data...");
    
    const adminEmail = "hello@melvinprince.io";
    const passwordHash = hashSync("123", 12);

    // Create admin user
    let adminUser = await db.execute(sql`
      SELECT id FROM "users" WHERE email = ${adminEmail} LIMIT 1;
    `);

    let adminId: string;
    if (adminUser.rows.length === 0) {
      adminId = randomUUID();
      await db.execute(sql`
        INSERT INTO "users" (id, email, password_hash, name, role)
        VALUES (${adminId}, ${adminEmail}, ${passwordHash}, 'Melvin Prince', 'admin');
      `);
      console.log("Created admin user.");
    } else {
      adminId = adminUser.rows[0].id as string;
      // Update password hash just in case
      await db.execute(sql`
        UPDATE "users" SET password_hash = ${passwordHash} WHERE id = ${adminId};
      `);
      console.log("Admin user already exists, updated password.");
    }

    // 4. Assign existing sites to admin
    console.log("Migrating existing sites to admin...");
    
    const sitesResult = await db.execute(sql`SELECT id, owner_id FROM "sites"`);
    let migratedCount = 0;
    
    for (const site of sitesResult.rows) {
      if (!site.owner_id) {
        // Set owner_id
        await db.execute(sql`
          UPDATE "sites" SET owner_id = ${adminId} WHERE id = ${site.id};
        `);
        // Grant access
        await db.execute(sql`
          INSERT INTO "user_sites" (user_id, site_id, role)
          VALUES (${adminId}, ${site.id}, 'owner')
          ON CONFLICT ("user_id", "site_id") DO NOTHING;
        `);
        migratedCount++;
      }
    }
    
    console.log(`Migrated ${migratedCount} sites to admin user.`);
    console.log("Migration complete!");
    
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

run();
