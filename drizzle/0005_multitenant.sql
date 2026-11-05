CREATE TABLE "household_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_by_member_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_invites_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Everything that exists today belongs to one household (the original couple).
INSERT INTO "households" ("name") SELECT 'Casa' WHERE EXISTS (SELECT 1 FROM "members");
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "balance_resets" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "category_goals" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "incomes" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "recurring_incomes" ADD COLUMN "household_id" uuid;
--> statement-breakpoint
UPDATE "accounts" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "balance_resets" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "categories" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "category_goals" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "expenses" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "incomes" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "installment_plans" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "members" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "recurring_expenses" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
UPDATE "recurring_incomes" SET "household_id" = (SELECT "id" FROM "households" ORDER BY "created_at" LIMIT 1);
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "balance_resets" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_goals" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "incomes" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "installment_plans" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_incomes" ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "balance_resets" DROP CONSTRAINT "balance_resets_pkey";
--> statement-breakpoint
ALTER TABLE "balance_resets" ADD CONSTRAINT "balance_resets_household_id_month_pk" PRIMARY KEY("household_id","month");
--> statement-breakpoint
DROP INDEX "accounts_name_unique";
--> statement-breakpoint
DROP INDEX "categories_name_unique";
--> statement-breakpoint
DROP INDEX "expenses_spent_on_idx";
--> statement-breakpoint
DROP INDEX "expenses_billing_month_idx";
--> statement-breakpoint
DROP INDEX "incomes_received_on_idx";
--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "balance_resets" ADD CONSTRAINT "balance_resets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "category_goals" ADD CONSTRAINT "category_goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recurring_incomes" ADD CONSTRAINT "recurring_incomes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "household_invites_household_idx" ON "household_invites" USING btree ("household_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_name_unique" ON "accounts" USING btree ("household_id",lower("name"));
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree ("household_id",lower("name"));
--> statement-breakpoint
CREATE INDEX "expenses_spent_on_idx" ON "expenses" USING btree ("household_id","spent_on");
--> statement-breakpoint
CREATE INDEX "expenses_billing_month_idx" ON "expenses" USING btree ("household_id","billing_month");
--> statement-breakpoint
CREATE INDEX "incomes_received_on_idx" ON "incomes" USING btree ("household_id","received_on");
