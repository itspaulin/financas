import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => integer(name).notNull();
const day = (name: string) => date(name, { mode: 'string' });

export const paymentMethod = pgEnum('payment_method', ['pix', 'debito', 'credito', 'dinheiro']);
export const expenseSource = pgEnum('expense_source', [
  'manual',
  'ia',
  'importado',
  'recorrente',
  'parcela',
]);
export const incomeSource = pgEnum('income_source', ['manual', 'importado', 'recorrente']);

// A household is the tenant: every row of financial data belongs to exactly one.
export const households = pgTable('households', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

const householdId = () =>
  uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });

export const members = pgTable('members', {
  id: id(),
  householdId: householdId(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  authUserId: text('auth_user_id').unique(),
  passwordHash: text('password_hash'),
  createdAt: createdAt(),
});

export const householdInvites = pgTable(
  'household_invites',
  {
    id: id(),
    householdId: householdId(),
    codeHash: text('code_hash').notNull().unique(),
    createdByMemberId: uuid('created_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('household_invites_household_idx').on(t.householdId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_member_idx').on(t.memberId)],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('categories_name_unique').on(t.householdId, sql`lower(${t.name})`)],
);

// The goal in force for a month is the row with the latest starts_on <= that month,
// so changing a goal never rewrites past months.
export const categoryGoals = pgTable(
  'category_goals',
  {
    id: id(),
    householdId: householdId(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    startsOn: day('starts_on').notNull(),
    amountCents: money('amount_cents'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('category_goals_category_month_unique').on(t.categoryId, t.startsOn),
    check('category_goals_amount_non_negative', sql`${t.amountCents} >= 0`),
    check('category_goals_starts_on_first_day', sql`extract(day from ${t.startsOn}) = 1`),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    ownerMemberId: uuid('owner_member_id').references(() => members.id),
    // Day the credit card invoice closes; null means purchases count in the month they were made.
    closingDay: smallint('closing_day'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('accounts_name_unique').on(t.householdId, sql`lower(${t.name})`),
    check('accounts_closing_day_range', sql`${t.closingDay} between 1 and 31`),
  ],
);

export const recurringExpenses = pgTable(
  'recurring_expenses',
  {
    id: id(),
    householdId: householdId(),
    description: text('description').notNull(),
    amountCents: money('amount_cents'),
    dayOfMonth: smallint('day_of_month').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    paymentMethod: paymentMethod('payment_method').notNull(),
    accountId: uuid('account_id').references(() => accounts.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    startsOn: day('starts_on').notNull(),
    endsOn: day('ends_on'),
    active: boolean('active').notNull().default(true),
    // Soft delete: the template leaves the list and is never generated again, history stays.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('recurring_expenses_amount_positive', sql`${t.amountCents} > 0`),
    check('recurring_expenses_day_range', sql`${t.dayOfMonth} between 1 and 31`),
  ],
);

export const installmentPlans = pgTable(
  'installment_plans',
  {
    id: id(),
    householdId: householdId(),
    description: text('description').notNull(),
    totalCents: money('total_cents'),
    installmentsCount: smallint('installments_count').notNull(),
    purchasedOn: day('purchased_on').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    paymentMethod: paymentMethod('payment_method').notNull(),
    accountId: uuid('account_id').references(() => accounts.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    // Paid off early: installments after the settling one are removed.
    settledOn: day('settled_on'),
    createdAt: createdAt(),
  },
  (t) => [
    check('installment_plans_total_positive', sql`${t.totalCents} > 0`),
    check('installment_plans_count_range', sql`${t.installmentsCount} between 1 and 120`),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    householdId: householdId(),
    description: text('description').notNull(),
    amountCents: money('amount_cents'),
    spentOn: day('spent_on').notNull(),
    // First day of the month this expense is paid in: the purchase month, or for credit
    // purchases the month the invoice closes. Stored so a later closing-day change keeps history.
    billingMonth: day('billing_month').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    paymentMethod: paymentMethod('payment_method').notNull(),
    accountId: uuid('account_id').references(() => accounts.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    paid: boolean('paid').notNull().default(false),
    source: expenseSource('source').notNull().default('manual'),
    rawText: text('raw_text'),
    recurringExpenseId: uuid('recurring_expense_id').references(() => recurringExpenses.id),
    // First day of the month this occurrence belongs to; one per recurrence per month.
    recurrenceMonth: day('recurrence_month'),
    installmentPlanId: uuid('installment_plan_id').references(() => installmentPlans.id, {
      onDelete: 'cascade',
    }),
    installmentNumber: smallint('installment_number'),
    // Soft delete keeps the row, so a deleted recurring occurrence is not generated again.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdByMemberId: uuid('created_by_member_id').references(() => members.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('expenses_spent_on_idx').on(t.householdId, t.spentOn),
    index('expenses_billing_month_idx').on(t.householdId, t.billingMonth),
    check('expenses_billing_month_first_day', sql`extract(day from ${t.billingMonth}) = 1`),
    uniqueIndex('expenses_recurrence_month_unique').on(t.recurringExpenseId, t.recurrenceMonth),
    uniqueIndex('expenses_installment_unique').on(t.installmentPlanId, t.installmentNumber),
    check('expenses_amount_positive', sql`${t.amountCents} > 0`),
    check(
      'expenses_recurrence_pair',
      sql`(${t.recurringExpenseId} is null) = (${t.recurrenceMonth} is null)`,
    ),
    check(
      'expenses_installment_pair',
      sql`(${t.installmentPlanId} is null) = (${t.installmentNumber} is null)`,
    ),
  ],
);

// A reset month has its leftover balance cleared: the next month starts with nothing carried over.
export const balanceResets = pgTable(
  'balance_resets',
  {
    householdId: householdId(),
    month: day('month').notNull(),
    createdByMemberId: uuid('created_by_member_id').references(() => members.id),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.month] }),
    check('balance_resets_month_first_day', sql`extract(day from ${t.month}) = 1`),
  ],
);

export const recurringIncomes = pgTable(
  'recurring_incomes',
  {
    id: id(),
    householdId: householdId(),
    description: text('description').notNull(),
    amountCents: money('amount_cents'),
    dayOfMonth: smallint('day_of_month').notNull(),
    memberId: uuid('member_id').references(() => members.id),
    startsOn: day('starts_on').notNull(),
    endsOn: day('ends_on'),
    active: boolean('active').notNull().default(true),
    // Soft delete: the template leaves the list and is never generated again, history stays.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('recurring_incomes_amount_positive', sql`${t.amountCents} > 0`),
    check('recurring_incomes_day_range', sql`${t.dayOfMonth} between 1 and 31`),
  ],
);

export const incomes = pgTable(
  'incomes',
  {
    id: id(),
    householdId: householdId(),
    description: text('description').notNull(),
    amountCents: money('amount_cents'),
    receivedOn: day('received_on').notNull(),
    memberId: uuid('member_id').references(() => members.id),
    source: incomeSource('source').notNull().default('manual'),
    recurringIncomeId: uuid('recurring_income_id').references(() => recurringIncomes.id),
    recurrenceMonth: day('recurrence_month'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdByMemberId: uuid('created_by_member_id').references(() => members.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('incomes_received_on_idx').on(t.householdId, t.receivedOn),
    uniqueIndex('incomes_recurrence_month_unique').on(t.recurringIncomeId, t.recurrenceMonth),
    check('incomes_amount_positive', sql`${t.amountCents} > 0`),
    check(
      'incomes_recurrence_pair',
      sql`(${t.recurringIncomeId} is null) = (${t.recurrenceMonth} is null)`,
    ),
  ],
);
