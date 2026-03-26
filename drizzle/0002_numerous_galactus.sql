CREATE TABLE "site_settings" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"features" jsonb DEFAULT '{"web_vitals":true,"scroll_depth":true,"outbound_clicks":true,"js_errors":true,"custom_events":true,"click_tracking":false,"rage_clicks":false,"file_downloads":false,"form_abandonment":false,"session_replay":false}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;