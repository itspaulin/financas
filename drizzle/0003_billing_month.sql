ALTER TABLE "accounts" ADD COLUMN "closing_day" smallint;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "billing_month" date;--> statement-breakpoint
UPDATE "expenses" SET "billing_month" = date_trunc('month', "spent_on")::date;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "billing_month" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "expenses_billing_month_idx" ON "expenses" USING btree ("billing_month");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_closing_day_range" CHECK ("accounts"."closing_day" between 1 and 31);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_billing_month_first_day" CHECK (extract(day from "expenses"."billing_month") = 1);
