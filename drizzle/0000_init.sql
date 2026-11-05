CREATE TYPE "public"."expense_source" AS ENUM('manual', 'ia', 'importado', 'recorrente', 'parcela');--> statement-breakpoint
CREATE TYPE "public"."income_source" AS ENUM('manual', 'importado', 'recorrente');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'debito', 'credito', 'dinheiro');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_member_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_goals_amount_non_negative" CHECK ("category_goals"."amount_cents" >= 0),
	CONSTRAINT "category_goals_starts_on_first_day" CHECK (extract(day from "category_goals"."starts_on") = 1)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"spent_on" date NOT NULL,
	"category_id" uuid NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"account_id" uuid,
	"member_id" uuid NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"source" "expense_source" DEFAULT 'manual' NOT NULL,
	"raw_text" text,
	"recurring_expense_id" uuid,
	"recurrence_month" date,
	"installment_plan_id" uuid,
	"installment_number" smallint,
	"deleted_at" timestamp with time zone,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount_cents" > 0),
	CONSTRAINT "expenses_recurrence_pair" CHECK (("expenses"."recurring_expense_id" is null) = ("expenses"."recurrence_month" is null)),
	CONSTRAINT "expenses_installment_pair" CHECK (("expenses"."installment_plan_id" is null) = ("expenses"."installment_number" is null))
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"received_on" date NOT NULL,
	"member_id" uuid,
	"source" "income_source" DEFAULT 'manual' NOT NULL,
	"recurring_income_id" uuid,
	"recurrence_month" date,
	"deleted_at" timestamp with time zone,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incomes_amount_positive" CHECK ("incomes"."amount_cents" > 0),
	CONSTRAINT "incomes_recurrence_pair" CHECK (("incomes"."recurring_income_id" is null) = ("incomes"."recurrence_month" is null))
);
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"total_cents" integer NOT NULL,
	"installments_count" smallint NOT NULL,
	"purchased_on" date NOT NULL,
	"category_id" uuid NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"account_id" uuid,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installment_plans_total_positive" CHECK ("installment_plans"."total_cents" > 0),
	CONSTRAINT "installment_plans_count_range" CHECK ("installment_plans"."installments_count" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"auth_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_email_unique" UNIQUE("email"),
	CONSTRAINT "members_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"day_of_month" smallint NOT NULL,
	"category_id" uuid NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"account_id" uuid,
	"member_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_expenses_amount_positive" CHECK ("recurring_expenses"."amount_cents" > 0),
	CONSTRAINT "recurring_expenses_day_range" CHECK ("recurring_expenses"."day_of_month" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "recurring_incomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"day_of_month" smallint NOT NULL,
	"member_id" uuid,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_incomes_amount_positive" CHECK ("recurring_incomes"."amount_cents" > 0),
	CONSTRAINT "recurring_incomes_day_range" CHECK ("recurring_incomes"."day_of_month" between 1 and 31)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_member_id_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_goals" ADD CONSTRAINT "category_goals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurring_expense_id_recurring_expenses_id_fk" FOREIGN KEY ("recurring_expense_id") REFERENCES "public"."recurring_expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_installment_plan_id_installment_plans_id_fk" FOREIGN KEY ("installment_plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_recurring_income_id_recurring_incomes_id_fk" FOREIGN KEY ("recurring_income_id") REFERENCES "public"."recurring_incomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_incomes" ADD CONSTRAINT "recurring_incomes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_name_unique" ON "accounts" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "category_goals_category_month_unique" ON "category_goals" USING btree ("category_id","starts_on");--> statement-breakpoint
CREATE INDEX "expenses_spent_on_idx" ON "expenses" USING btree ("spent_on");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_recurrence_month_unique" ON "expenses" USING btree ("recurring_expense_id","recurrence_month");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_installment_unique" ON "expenses" USING btree ("installment_plan_id","installment_number");--> statement-breakpoint
CREATE INDEX "incomes_received_on_idx" ON "incomes" USING btree ("received_on");--> statement-breakpoint
CREATE UNIQUE INDEX "incomes_recurrence_month_unique" ON "incomes" USING btree ("recurring_income_id","recurrence_month");