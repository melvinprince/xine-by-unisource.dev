CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"threshold" jsonb NOT NULL,
	"channel" varchar(50) DEFAULT 'email' NOT NULL,
	"channel_target" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"text" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"category" varchar(50) DEFAULT 'note',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banned_logins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"user_agent" text NOT NULL,
	"reason" text DEFAULT 'Too many failed login attempts' NOT NULL,
	"banned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"schedule" varchar(50) DEFAULT 'weekly' NOT NULL,
	"recipients" jsonb NOT NULL,
	"last_sent" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"steps" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_goal_session" UNIQUE("goal_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"condition" varchar(50) NOT NULL,
	"target" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"user_agent" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_ip_ua" UNIQUE("ip","user_agent")
);
--> statement-breakpoint
CREATE TABLE "replay_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"url" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"events" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uptime_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"response_time" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pageviews" ALTER COLUMN "device" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "pageviews" ALTER COLUMN "connection_type" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_bot" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "pageviews" ADD COLUMN "continent" varchar(50);--> statement-breakpoint
ALTER TABLE "pageviews" ADD COLUMN "is_bot" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "is_public" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "api_access_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "server_api_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_reports" ADD CONSTRAINT "email_reports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnels" ADD CONSTRAINT "funnels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_conversions" ADD CONSTRAINT "goal_conversions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_conversions" ADD CONSTRAINT "goal_conversions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_conversions" ADD CONSTRAINT "goal_conversions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_events" ADD CONSTRAINT "replay_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_checks" ADD CONSTRAINT "uptime_checks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_banned_logins_ip" ON "banned_logins" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "idx_banned_logins_ua" ON "banned_logins" USING btree ("user_agent");--> statement-breakpoint
CREATE INDEX "idx_conversions_site_id" ON "goal_conversions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_conversions_goal_id" ON "goal_conversions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "idx_conversions_created_at" ON "goal_conversions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip" ON "login_attempts" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "idx_events_site_name_idx" ON "events" USING btree ("site_id","name");--> statement-breakpoint
CREATE INDEX "idx_pageviews_connection_type" ON "pageviews" USING btree ("connection_type");--> statement-breakpoint
CREATE INDEX "idx_sessions_site_started_idx" ON "sessions" USING btree ("site_id","started_at");--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_server_api_key_unique" UNIQUE("server_api_key");