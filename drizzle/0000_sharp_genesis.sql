CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pageviews" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"url" text NOT NULL,
	"referrer" text,
	"title" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"country" text,
	"city" text,
	"browser" text,
	"os" text,
	"device" text,
	"ip_hash" text,
	"screen" text,
	"language" text,
	"timezone" text,
	"duration" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"api_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_domain_unique" UNIQUE("domain"),
	CONSTRAINT "sites_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pageviews" ADD CONSTRAINT "pageviews_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_events_site_id" ON "events" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_events_created_at" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_events_name" ON "events" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_pageviews_site_id" ON "pageviews" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_pageviews_created_at" ON "pageviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pageviews_visitor_id" ON "pageviews" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "idx_pageviews_session_url" ON "pageviews" USING btree ("session_id","url");