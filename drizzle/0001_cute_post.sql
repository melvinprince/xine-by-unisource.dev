CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"entry_page" text NOT NULL,
	"exit_page" text NOT NULL,
	"page_count" integer DEFAULT 1 NOT NULL,
	"total_duration" integer DEFAULT 0 NOT NULL,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"country" text,
	"city" text,
	"browser" text,
	"os" text,
	"device" text,
	"screen" text,
	"language" text,
	"timezone" text,
	"connection_type" text,
	"is_bounce" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pageviews" ADD COLUMN "connection_type" text;--> statement-breakpoint
ALTER TABLE "pageviews" ADD COLUMN "ttfb" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sessions_site_id" ON "sessions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_started_at" ON "sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_visitor_id" ON "sessions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_is_bounce" ON "sessions" USING btree ("is_bounce");--> statement-breakpoint
CREATE INDEX "idx_sessions_entry_page" ON "sessions" USING btree ("entry_page");