ALTER TABLE "recurring_expenses" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurring_incomes" ADD COLUMN "deleted_at" timestamp with time zone;