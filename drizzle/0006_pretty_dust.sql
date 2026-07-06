CREATE TABLE "site_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "site_invites_token_unique" UNIQUE("token"),
	CONSTRAINT "uniq_site_invite" UNIQUE("site_id","email")
);
--> statement-breakpoint
ALTER TABLE "site_invites" ADD CONSTRAINT "site_invites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_invites" ADD CONSTRAINT "site_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_site_invites_email" ON "site_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_site_invites_site_id" ON "site_invites" USING btree ("site_id");