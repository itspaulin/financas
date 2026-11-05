CREATE TABLE "balance_resets" (
	"month" date PRIMARY KEY NOT NULL,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_resets_month_first_day" CHECK (extract(day from "balance_resets"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "balance_resets" ADD CONSTRAINT "balance_resets_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;