-- IF NOT EXISTS throughout so this file is idempotent and safe to apply by
-- hand with psql: the PM2 deploy path never runs docker-entrypoint.sh, so
-- these columns do not appear on their own.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "bot_reason" varchar(64);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "bot_score" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pageviews" ADD COLUMN IF NOT EXISTS "bot_reason" varchar(64);--> statement-breakpoint
ALTER TABLE "pageviews" ADD COLUMN IF NOT EXISTS "bot_score" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "bot_reason" varchar(64);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "bot_score" integer DEFAULT 0;--> statement-breakpoint
-- IF NOT EXISTS so these can optionally be pre-created with CREATE INDEX CONCURRENTLY
-- on a busy production table (CONCURRENTLY cannot run inside a migration transaction).
CREATE INDEX IF NOT EXISTS "idx_events_site_bot_created" ON "events" USING btree ("site_id","is_bot","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pageviews_site_bot_created" ON "pageviews" USING btree ("site_id","is_bot","created_at");