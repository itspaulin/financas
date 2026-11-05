import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { StatusError } from 'expo-server';

import {
  accounts,
  balanceResets,
  categories,
  categoryGoals,
  expenses,
  incomes,
  installmentPlans,
  members,
  recurringExpenses,
  recurringIncomes,
} from '@/db/schema';
import { billingMonth } from '@/shared/billing';
import { addMonths, dateInMonth, monthEnd, monthOf, monthStart, today } from '@/shared/dates';
import type {
  Breakdown,
  Dashboard,
  Expense,
  ExpenseInput,
  Income,
  IncomeInput,
  InstallmentPlan,
  Lookups,
  MonthEntries,
  PlanScheduleItem,
  PlanSummary,
  PlanUpdate,
  Recurring,
} from '@/shared/types';

import type { Me } from './auth';
import { getDb } from './db';
import { notFound } from './http';

// Neon's HTTP driver turns each query into one fetch, and EAS Hosting caps fetches per request,
// so read paths group their queries with db.batch (one round trip).
function goalsQuery(hid: string, month: string) {
  return getDb()
    .selectDistinctOn([categoryGoals.categoryId], { categoryId: categoryGoals.categoryId, amountCents: categoryGoals.amountCents })
    .from(categoryGoals)
    .where(and(eq(categoryGoals.householdId, hid), lte(categoryGoals.startsOn, monthStart(month))))
    .orderBy(categoryGoals.categoryId, desc(categoryGoals.startsOn));
}

function toGoalMap(rows: { categoryId: string; amountCents: number }[]) {
  return new Map(rows.map((r) => [r.categoryId, Number(r.amountCents)]));
}

export async function lookups(me: Me): Promise<Lookups> {
  const db = getDb();
  const [memberRows, categoryRows, accountRows, goalRows] = await db.batch([
    db
      .select({ id: members.id, name: members.name, email: members.email })
      .from(members)
      .where(eq(members.householdId, me.householdId))
      .orderBy(asc(members.name)),
    db.select().from(categories).where(eq(categories.householdId, me.householdId)).orderBy(asc(categories.name)),
    db.select().from(accounts).where(eq(accounts.householdId, me.householdId)).orderBy(asc(accounts.name)),
    goalsQuery(me.householdId, monthOf(today())),
  ]);
  const goals = toGoalMap(goalRows);
  return {
    me: { id: me.id, name: me.name, email: me.email },
    members: memberRows,
    categories: categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      archived: c.archivedAt !== null,
      goalCents: goals.get(c.id) ?? null,
    })),
    accounts: accountRows.map((a) => ({
      id: a.id,
      name: a.name,
      ownerMemberId: a.ownerMemberId,
      closingDay: a.closingDay,
      archived: a.archivedAt !== null,
    })),
  };
}

function activeIn<T extends typeof recurringExpenses | typeof recurringIncomes>(hid: string, table: T, month: string) {
  return and(
    eq(table.householdId, hid),
    eq(table.active, true),
    lte(table.startsOn, monthEnd(month)),
    or(isNull(table.endsOn), gte(table.endsOn, monthStart(month))),
  );
}

async function closingDayOf(hid: string, accountId: string | null): Promise<number | null> {
  if (!accountId) return null;
  const [row] = await getDb()
    .select({ closingDay: accounts.closingDay })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, hid)));
  return row?.closingDay ?? null;
}

export async function ensureRecurring(hid: string, month: string): Promise<void> {
  const db = getDb();
  const [expenseTemplates, incomeTemplates] = await db.batch([
    db.select().from(recurringExpenses).where(activeIn(hid, recurringExpenses, month)),
    db.select().from(recurringIncomes).where(activeIn(hid, recurringIncomes, month)),
  ]);
  // Recurring expenses count in their own month, whatever the card's closing day.
  const expenseValues = expenseTemplates.map((t) => ({
    householdId: hid,
    description: t.description,
    amountCents: t.amountCents,
    spentOn: dateInMonth(month, t.dayOfMonth),
    billingMonth: monthStart(month),
    categoryId: t.categoryId,
    paymentMethod: t.paymentMethod,
    accountId: t.accountId,
    memberId: t.memberId,
    source: 'recorrente' as const,
    recurringExpenseId: t.id,
    recurrenceMonth: monthStart(month),
  }));
  const expenseInsert = expenseValues.length ? db.insert(expenses).values(expenseValues).onConflictDoNothing() : null;
  const recurrenceMonth = monthStart(month);
  const incomeInsert = incomeTemplates.length
    ? db
        .insert(incomes)
        .values(
          incomeTemplates.map((t) => ({
            householdId: hid,
            description: t.description,
            amountCents: t.amountCents,
            receivedOn: dateInMonth(month, t.dayOfMonth),
            memberId: t.memberId,
            source: 'recorrente' as const,
            recurringIncomeId: t.id,
            recurrenceMonth,
          })),
        )
        .onConflictDoNothing()
    : null;
  if (expenseInsert && incomeInsert) await db.batch([expenseInsert, incomeInsert]);
  else if (expenseInsert) await expenseInsert;
  else if (incomeInsert) await incomeInsert;
}

const expenseColumns = {
  id: expenses.id,
  description: expenses.description,
  amountCents: expenses.amountCents,
  spentOn: expenses.spentOn,
  billingMonth: expenses.billingMonth,
  categoryId: expenses.categoryId,
  paymentMethod: expenses.paymentMethod,
  accountId: expenses.accountId,
  memberId: expenses.memberId,
  paid: expenses.paid,
  source: expenses.source,
  recurringExpenseId: expenses.recurringExpenseId,
  installmentPlanId: expenses.installmentPlanId,
  installmentNumber: expenses.installmentNumber,
  installmentsCount: installmentPlans.installmentsCount,
  purchasedOn: installmentPlans.purchasedOn,
  recurrenceActive: recurringExpenses.active,
  recurrenceEndsOn: recurringExpenses.endsOn,
};

type ExpenseRow = Omit<Expense, 'recurrenceContinues'> & { recurrenceActive: boolean | null; recurrenceEndsOn: string | null };

// A recurring expense "continues" while its template is live past the month of this occurrence.
function toExpense({ recurrenceActive, recurrenceEndsOn, ...row }: ExpenseRow): Expense {
  const recurrenceContinues = Boolean(
    row.recurringExpenseId && recurrenceActive && (recurrenceEndsOn === null || recurrenceEndsOn > monthEnd(monthOf(row.spentOn))),
  );
  return { ...row, recurrenceContinues };
}

const incomeColumns = {
  id: incomes.id,
  description: incomes.description,
  amountCents: incomes.amountCents,
  receivedOn: incomes.receivedOn,
  memberId: incomes.memberId,
  recurringIncomeId: incomes.recurringIncomeId,
  recurrenceActive: recurringIncomes.active,
  recurrenceEndsOn: recurringIncomes.endsOn,
};

type IncomeRow = Omit<Income, 'recurrenceContinues'> & { recurrenceActive: boolean | null; recurrenceEndsOn: string | null };

function toIncome({ recurrenceActive, recurrenceEndsOn, ...row }: IncomeRow): Income {
  const recurrenceContinues = Boolean(
    row.recurringIncomeId && recurrenceActive && (recurrenceEndsOn === null || recurrenceEndsOn > monthEnd(monthOf(row.receivedOn))),
  );
  return { ...row, recurrenceContinues };
}

// Balance carried into `month`: incomes minus expenses (by billing month) from the month after the
// latest reset before it, up to the month before it.
function carryQueries(hid: string, month: string) {
  const db = getDb();
  const start = monthStart(month);
  const from = sql`coalesce((select (max(${balanceResets.month}) + interval '1 month')::date from ${balanceResets} where ${balanceResets.householdId} = ${hid} and ${balanceResets.month} < ${start}), '-infinity'::date)`;
  return [
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.householdId, hid), isNull(expenses.deletedAt), lt(expenses.billingMonth, start), gte(expenses.billingMonth, from))),
    db
      .select({ total: sql<string>`coalesce(sum(${incomes.amountCents}), 0)` })
      .from(incomes)
      .where(and(eq(incomes.householdId, hid), isNull(incomes.deletedAt), lt(incomes.receivedOn, start), gte(incomes.receivedOn, from))),
  ] as const;
}

export async function listMonth(hid: string, month: string): Promise<MonthEntries> {
  await ensureRecurring(hid, month);
  const db = getDb();
  const start = monthStart(month);
  const [expenseRows, incomeRows, expensesBefore, incomesBefore, resetRows] = await db.batch([
    db
      .select(expenseColumns)
      .from(expenses)
      .leftJoin(installmentPlans, eq(installmentPlans.id, expenses.installmentPlanId))
      .leftJoin(recurringExpenses, eq(recurringExpenses.id, expenses.recurringExpenseId))
      .where(and(eq(expenses.householdId, hid), isNull(expenses.deletedAt), eq(expenses.billingMonth, monthStart(month))))
      .orderBy(desc(expenses.spentOn), desc(expenses.createdAt)),
    db
      .select(incomeColumns)
      .from(incomes)
      .leftJoin(recurringIncomes, eq(recurringIncomes.id, incomes.recurringIncomeId))
      .where(
        and(
          eq(incomes.householdId, hid),
          isNull(incomes.deletedAt),
          gte(incomes.receivedOn, monthStart(month)),
          lte(incomes.receivedOn, monthEnd(month)),
        ),
      )
      .orderBy(desc(incomes.receivedOn)),
    ...carryQueries(hid, month),
    db
      .select({ month: balanceResets.month })
      .from(balanceResets)
      .where(and(eq(balanceResets.householdId, hid), eq(balanceResets.month, start))),
  ]);
  return {
    expenses: expenseRows.map(toExpense),
    incomes: incomeRows.map(toIncome),
    carryOverCents: Number(incomesBefore[0].total) - Number(expensesBefore[0].total),
    balanceReset: resetRows.length > 0,
  };
}

export async function getExpense(hid: string, id: string): Promise<Expense> {
  const [row] = await getDb()
    .select(expenseColumns)
    .from(expenses)
    .leftJoin(installmentPlans, eq(installmentPlans.id, expenses.installmentPlanId))
    .leftJoin(recurringExpenses, eq(recurringExpenses.id, expenses.recurringExpenseId))
    .where(and(eq(expenses.id, id), eq(expenses.householdId, hid), isNull(expenses.deletedAt)));
  return row ? toExpense(row) : notFound();
}

function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const parts = Array.from({ length: count }, () => base);
  parts[0] += totalCents - base * count;
  return parts;
}

export async function createExpense(input: ExpenseInput, me: Me): Promise<{ id: string }> {
  const db = getDb();
  const common = {
    householdId: me.householdId,
    categoryId: input.categoryId,
    paymentMethod: input.paymentMethod,
    accountId: input.accountId,
    memberId: input.memberId,
  };
  const source = input.rawText ? ('ia' as const) : ('manual' as const);
  const closingDay = await closingDayOf(me.householdId, input.accountId);
  const billingOf = (spentOn: string) => billingMonth(spentOn, input.paymentMethod, closingDay);

  if (input.installments && input.installments > 1) {
    const planId = crypto.randomUUID();
    const purchaseMonth = monthOf(input.spentOn);
    const day = Number(input.spentOn.slice(8));
    const parts = splitInstallments(input.amountCents, input.installments);
    const firstId = crypto.randomUUID();
    await db.batch([
      db.insert(installmentPlans).values({
        id: planId,
        description: input.description,
        totalCents: input.amountCents,
        installmentsCount: input.installments,
        purchasedOn: input.spentOn,
        ...common,
      }),
      db.insert(expenses).values(
        parts.map((amountCents, i) => {
          const spentOn = dateInMonth(addMonths(purchaseMonth, i), day);
          return {
            id: i === 0 ? firstId : undefined,
            description: input.description,
            amountCents,
            spentOn,
            billingMonth: billingOf(spentOn),
            ...common,
            paid: i === 0 ? input.paid : false,
            source: 'parcela' as const,
            rawText: i === 0 ? input.rawText : null,
            installmentPlanId: planId,
            installmentNumber: i + 1,
            createdByMemberId: me.id,
          };
        }),
      ),
    ]);
    return { id: firstId };
  }

  if (input.recurring) {
    const recurringId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const month = monthOf(input.spentOn);
    await db.batch([
      db.insert(recurringExpenses).values({
        id: recurringId,
        description: input.description,
        amountCents: input.amountCents,
        dayOfMonth: Number(input.spentOn.slice(8)),
        startsOn: monthStart(month),
        ...common,
      }),
      db.insert(expenses).values({
        id,
        description: input.description,
        amountCents: input.amountCents,
        spentOn: input.spentOn,
        billingMonth: monthStart(month),
        ...common,
        paid: input.paid,
        source,
        rawText: input.rawText,
        recurringExpenseId: recurringId,
        recurrenceMonth: monthStart(month),
        createdByMemberId: me.id,
      }),
    ]);
    return { id };
  }

  const [row] = await db
    .insert(expenses)
    .values({
      description: input.description,
      amountCents: input.amountCents,
      spentOn: input.spentOn,
      billingMonth: billingOf(input.spentOn),
      ...common,
      paid: input.paid,
      source,
      rawText: input.rawText,
      createdByMemberId: me.id,
    })
    .returning({ id: expenses.id });
  return row;
}

export type ExpenseUpdate = Omit<ExpenseInput, 'installments' | 'rawText'> & {
  applyToFuture?: boolean;
};

export async function updateExpense(hid: string, id: string, input: ExpenseUpdate): Promise<void> {
  const db = getDb();
  const current = await getExpense(hid, id);
  const { applyToFuture, recurring, ...fields } = input;
  // Only re-bill when something that decides the invoice month changed, so imported rows keep theirs.
  const rebill =
    fields.spentOn !== current.spentOn ||
    fields.paymentMethod !== current.paymentMethod ||
    fields.accountId !== current.accountId;
  const makeRecurring = recurring && !current.recurringExpenseId && !current.installmentPlanId;
  // Recurring expenses count in their own month; others follow the card's invoice.
  const billing =
    current.recurringExpenseId || makeRecurring
      ? monthStart(monthOf(fields.spentOn))
      : rebill
        ? billingMonth(fields.spentOn, fields.paymentMethod, await closingDayOf(hid, fields.accountId))
        : current.billingMonth;
  if (makeRecurring) {
    // Turn this expense into the first occurrence of a new monthly template.
    const recurringId = crypto.randomUUID();
    const month = monthOf(fields.spentOn);
    await db.batch([
      db.insert(recurringExpenses).values({
        id: recurringId,
        householdId: hid,
        description: fields.description,
        amountCents: fields.amountCents,
        dayOfMonth: Number(fields.spentOn.slice(8)),
        categoryId: fields.categoryId,
        paymentMethod: fields.paymentMethod,
        accountId: fields.accountId,
        memberId: fields.memberId,
        startsOn: monthStart(month),
      }),
      db
        .update(expenses)
        .set({ ...fields, billingMonth: billing, recurringExpenseId: recurringId, recurrenceMonth: monthStart(month) })
        .where(eq(expenses.id, id)),
    ]);
    return;
  }
  await db.update(expenses).set({ ...fields, billingMonth: billing }).where(eq(expenses.id, id));

  // The toggle is the recurrence's state: on keeps (or restarts) it from this month, off ends it here.
  const templateId = current.recurringExpenseId;
  if (!templateId || applyToFuture === undefined) return;
  const month = monthStart(monthOf(current.spentOn));
  if (!applyToFuture) {
    if (current.recurrenceContinues) await endRecurrence(templateId, month);
    return;
  }
  const template = {
    description: fields.description,
    amountCents: fields.amountCents,
    dayOfMonth: Number(fields.spentOn.slice(8)),
    categoryId: fields.categoryId,
    paymentMethod: fields.paymentMethod,
    accountId: fields.accountId,
    memberId: fields.memberId,
  };
  await db.batch([
    db
      .update(recurringExpenses)
      .set({ ...template, ...(!current.recurrenceContinues && { active: true, endsOn: null }) })
      .where(eq(recurringExpenses.id, templateId)),
    // Occurrences dropped when the recurrence ended are removed for good so they can be generated again.
    db
      .delete(expenses)
      .where(
        and(eq(expenses.recurringExpenseId, templateId), gt(expenses.recurrenceMonth, month), sql`${expenses.deletedAt} is not null`),
      ),
    // Paid occurrences keep their amount, but get the new name, category, card and person.
    db
      .update(expenses)
      .set({
        description: fields.description,
        categoryId: fields.categoryId,
        paymentMethod: fields.paymentMethod,
        accountId: fields.accountId,
        memberId: fields.memberId,
      })
      .where(and(eq(expenses.recurringExpenseId, templateId), gt(expenses.recurrenceMonth, month), isNull(expenses.deletedAt))),
    db
      .update(expenses)
      .set({ amountCents: fields.amountCents })
      .where(
        and(
          eq(expenses.recurringExpenseId, templateId),
          gt(expenses.recurrenceMonth, month),
          eq(expenses.paid, false),
          isNull(expenses.deletedAt),
        ),
      ),
  ]);
}

// Ends the template at the end of `month` and removes the occurrences after it.
async function endRecurrence(templateId: string, month: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.update(recurringExpenses).set({ endsOn: monthEnd(monthOf(month)) }).where(eq(recurringExpenses.id, templateId)),
    db
      .update(expenses)
      .set({ deletedAt: new Date() })
      .where(and(eq(expenses.recurringExpenseId, templateId), gt(expenses.recurrenceMonth, month), isNull(expenses.deletedAt))),
  ]);
}

export async function deleteExpense(hid: string, id: string): Promise<void> {
  await getExpense(hid, id);
  await getDb().update(expenses).set({ deletedAt: new Date() }).where(and(eq(expenses.id, id), eq(expenses.householdId, hid)));
}

export async function stopRecurringExpense(hid: string, id: string): Promise<void> {
  const current = await getExpense(hid, id);
  if (!current.recurringExpenseId) throw new StatusError(400, 'Este gasto não é recorrente');
  await endRecurrence(current.recurringExpenseId, monthStart(monthOf(current.spentOn)));
}

export async function getIncome(hid: string, id: string): Promise<Income> {
  const [row] = await getDb()
    .select(incomeColumns)
    .from(incomes)
    .leftJoin(recurringIncomes, eq(recurringIncomes.id, incomes.recurringIncomeId))
    .where(and(eq(incomes.id, id), eq(incomes.householdId, hid), isNull(incomes.deletedAt)));
  return row ? toIncome(row) : notFound();
}

export async function createIncome(input: IncomeInput, me: Me): Promise<{ id: string }> {
  const db = getDb();
  const id = crypto.randomUUID();
  const month = monthOf(input.receivedOn);
  const fields = {
    id,
    householdId: me.householdId,
    description: input.description,
    amountCents: input.amountCents,
    receivedOn: input.receivedOn,
    memberId: input.memberId,
    createdByMemberId: me.id,
  };
  if (input.recurring) {
    const recurringId = crypto.randomUUID();
    await db.batch([
      db.insert(recurringIncomes).values({
        id: recurringId,
        householdId: me.householdId,
        description: input.description,
        amountCents: input.amountCents,
        dayOfMonth: Number(input.receivedOn.slice(8)),
        memberId: input.memberId,
        startsOn: monthStart(month),
      }),
      db.insert(incomes).values({
        ...fields,
        source: 'recorrente',
        recurringIncomeId: recurringId,
        recurrenceMonth: monthStart(month),
      }),
    ]);
  } else {
    await db.insert(incomes).values(fields);
  }
  return { id };
}

export type IncomeUpdate = IncomeInput & { applyToFuture?: boolean };

export async function updateIncome(hid: string, id: string, input: IncomeUpdate): Promise<void> {
  const db = getDb();
  const current = await getIncome(hid, id);
  const { applyToFuture, recurring, ...fields } = input;

  if (recurring && !current.recurringIncomeId) {
    // Turn this income into the first occurrence of a new monthly template.
    const recurringId = crypto.randomUUID();
    const month = monthStart(monthOf(fields.receivedOn));
    await db.batch([
      db.insert(recurringIncomes).values({
        id: recurringId,
        householdId: hid,
        description: fields.description,
        amountCents: fields.amountCents,
        dayOfMonth: Number(fields.receivedOn.slice(8)),
        memberId: fields.memberId,
        startsOn: month,
      }),
      db.update(incomes).set({ ...fields, recurringIncomeId: recurringId, recurrenceMonth: month }).where(eq(incomes.id, id)),
    ]);
    return;
  }
  await db.update(incomes).set(fields).where(eq(incomes.id, id));

  // The toggle is the recurrence's state: on keeps (or restarts) it from this month, off ends it here.
  const templateId = current.recurringIncomeId;
  if (!templateId || applyToFuture === undefined) return;
  const month = monthStart(monthOf(current.receivedOn));
  if (!applyToFuture) {
    if (current.recurrenceContinues) await endIncomeRecurrence(templateId, month);
    return;
  }
  await db.batch([
    db
      .update(recurringIncomes)
      .set({
        description: fields.description,
        amountCents: fields.amountCents,
        dayOfMonth: Number(fields.receivedOn.slice(8)),
        memberId: fields.memberId,
        ...(!current.recurrenceContinues && { active: true, endsOn: null }),
      })
      .where(eq(recurringIncomes.id, templateId)),
    // Occurrences dropped when the recurrence ended are removed for good so they can be generated again.
    db
      .delete(incomes)
      .where(and(eq(incomes.recurringIncomeId, templateId), gt(incomes.recurrenceMonth, month), sql`${incomes.deletedAt} is not null`)),
    db
      .update(incomes)
      .set({ description: fields.description, amountCents: fields.amountCents, memberId: fields.memberId })
      .where(and(eq(incomes.recurringIncomeId, templateId), gt(incomes.recurrenceMonth, month), isNull(incomes.deletedAt))),
  ]);
}

// Ends the template at the end of `month` and removes the occurrences after it.
async function endIncomeRecurrence(templateId: string, month: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.update(recurringIncomes).set({ endsOn: monthEnd(monthOf(month)) }).where(eq(recurringIncomes.id, templateId)),
    db
      .update(incomes)
      .set({ deletedAt: new Date() })
      .where(and(eq(incomes.recurringIncomeId, templateId), gt(incomes.recurrenceMonth, month), isNull(incomes.deletedAt))),
  ]);
}

export async function deleteIncome(hid: string, id: string): Promise<void> {
  await getIncome(hid, id);
  await getDb().update(incomes).set({ deletedAt: new Date() }).where(and(eq(incomes.id, id), eq(incomes.householdId, hid)));
}

export async function stopRecurringIncome(hid: string, id: string): Promise<void> {
  const current = await getIncome(hid, id);
  if (!current.recurringIncomeId) throw new StatusError(400, 'Esta entrada não é recorrente');
  await endIncomeRecurrence(current.recurringIncomeId, monthStart(monthOf(current.receivedOn)));
}

export async function getPlan(hid: string, id: string): Promise<InstallmentPlan> {
  const db = getDb();
  const [plan] = await db
    .select()
    .from(installmentPlans)
    .where(and(eq(installmentPlans.id, id), eq(installmentPlans.householdId, hid)));
  if (!plan) notFound();
  const installments = await db
    .select({
      id: expenses.id,
      number: expenses.installmentNumber,
      amountCents: expenses.amountCents,
      spentOn: expenses.spentOn,
      billingMonth: expenses.billingMonth,
      paid: expenses.paid,
    })
    .from(expenses)
    .where(and(eq(expenses.installmentPlanId, id), isNull(expenses.deletedAt)))
    .orderBy(asc(expenses.installmentNumber));
  return {
    id: plan.id,
    description: plan.description,
    totalCents: plan.totalCents,
    installmentsCount: plan.installmentsCount,
    purchasedOn: plan.purchasedOn,
    settledOn: plan.settledOn,
    categoryId: plan.categoryId,
    paymentMethod: plan.paymentMethod,
    accountId: plan.accountId,
    memberId: plan.memberId,
    installments: installments.map((i) => ({ ...i, number: i.number ?? 0 })),
  };
}

export async function settlePlan(hid: string, id: string, lastNumber: number): Promise<void> {
  const plan = await getPlan(hid, id);
  if (plan.settledOn) throw new StatusError(400, 'Parcelamento já quitado');
  if (lastNumber < 1 || lastNumber > plan.installmentsCount) {
    throw new StatusError(400, 'Parcela inválida');
  }
  const kept = plan.installments.filter((i) => i.number <= lastNumber);
  const db = getDb();
  await db.batch([
    db.delete(expenses).where(and(eq(expenses.installmentPlanId, id), gt(expenses.installmentNumber, lastNumber))),
    db
      .update(installmentPlans)
      .set({ settledOn: today(), totalCents: kept.reduce((sum, i) => sum + i.amountCents, 0) || plan.totalCents })
      .where(eq(installmentPlans.id, id)),
  ]);
}

function sorted(items: Breakdown[]): Breakdown[] {
  return items.sort((a, b) => b.cents - a.cents);
}

const METHOD_LABELS: Record<string, string> = { pix: 'Pix', debito: 'Débito', credito: 'Crédito', dinheiro: 'Dinheiro' };

export async function dashboard(hid: string, month: string): Promise<Dashboard> {
  await ensureRecurring(hid, month);
  const db = getDb();
  const start = monthStart(month);
  const end = monthEnd(month);
  const inMonth = and(eq(expenses.householdId, hid), isNull(expenses.deletedAt), eq(expenses.billingMonth, start));
  const total = sql<string>`coalesce(sum(${expenses.amountCents}), 0)`;
  const [
    expenseTotals,
    incomeTotals,
    expensesBefore,
    incomesBefore,
    byCategory,
    byAccount,
    byMethod,
    goalRows,
    categoryRows,
    accountRows,
  ] = await db.batch([
    db
      .select({ total, paid: sql<string>`coalesce(sum(${expenses.amountCents}) filter (where ${expenses.paid}), 0)` })
      .from(expenses)
      .where(inMonth),
    db
      .select({ total: sql<string>`coalesce(sum(${incomes.amountCents}), 0)` })
      .from(incomes)
      .where(and(eq(incomes.householdId, hid), isNull(incomes.deletedAt), gte(incomes.receivedOn, start), lte(incomes.receivedOn, end))),
    ...carryQueries(hid, month),
    db.select({ key: expenses.categoryId, cents: total }).from(expenses).where(inMonth).groupBy(expenses.categoryId),
    db.select({ key: expenses.accountId, cents: total }).from(expenses).where(inMonth).groupBy(expenses.accountId),
    db.select({ key: expenses.paymentMethod, cents: total }).from(expenses).where(inMonth).groupBy(expenses.paymentMethod),
    goalsQuery(hid, month),
    db
      .select({ id: categories.id, name: categories.name, archivedAt: categories.archivedAt })
      .from(categories)
      .where(eq(categories.householdId, hid)),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.householdId, hid)),
  ]);

  const goals = toGoalMap(goalRows);
  const categoryNames = new Map(categoryRows.map((r) => [r.id, r.name]));
  const archived = new Set(categoryRows.filter((r) => r.archivedAt).map((r) => r.id));
  const accountNames = new Map(accountRows.map((r) => [r.id, r.name]));
  const incomesCents = Number(incomeTotals[0].total);
  const expensesCents = Number(expenseTotals[0].total);
  const spentByCategory = new Map(byCategory.map((r) => [r.key, Number(r.cents)]));
  const categoryIds = new Set([...spentByCategory.keys(), ...goals.keys()]);

  return {
    month,
    incomesCents,
    expensesCents,
    paidCents: Number(expenseTotals[0].paid),
    balanceCents: incomesCents - expensesCents,
    accumulatedCents: Number(incomesBefore[0].total) - Number(expensesBefore[0].total) + incomesCents - expensesCents,
    byCategory: sorted(
      [...categoryIds]
        .filter((id) => spentByCategory.has(id) || !archived.has(id))
        .map((id) => ({
          id,
          label: categoryNames.get(id) ?? '?',
          cents: spentByCategory.get(id) ?? 0,
          goalCents: goals.get(id) ?? null,
        })),
    ),
    byAccount: sorted(
      byAccount.map((r) => ({ id: r.key, label: r.key ? (accountNames.get(r.key) ?? '?') : 'Sem cartão', cents: Number(r.cents) })),
    ),
    byMethod: sorted(byMethod.map((r) => ({ id: r.key, label: METHOD_LABELS[r.key] ?? '?', cents: Number(r.cents) }))),
  };
}

export async function setBalanceReset(month: string, reset: boolean, me: Me): Promise<void> {
  const db = getDb();
  if (reset) {
    await db
      .insert(balanceResets)
      .values({ householdId: me.householdId, month: monthStart(month), createdByMemberId: me.id })
      .onConflictDoNothing();
  } else {
    await db.delete(balanceResets).where(and(eq(balanceResets.householdId, me.householdId), eq(balanceResets.month, monthStart(month))));
  }
}

export async function createCategory(hid: string, name: string, goalCents: number | null): Promise<{ id: string }> {
  const db = getDb();
  const id = crypto.randomUUID();
  try {
    if (goalCents === null) {
      await db.insert(categories).values({ id, householdId: hid, name: name.trim() });
    } else {
      await db.batch([
        db.insert(categories).values({ id, householdId: hid, name: name.trim() }),
        db.insert(categoryGoals).values({ householdId: hid, categoryId: id, startsOn: monthStart(monthOf(today())), amountCents: goalCents }),
      ]);
    }
  } catch (error) {
    if (String(error).includes('categories_name_unique')) throw new StatusError(409, 'Já existe essa categoria');
    throw error;
  }
  return { id };
}

export async function updateCategory(
  hid: string,
  id: string,
  changes: { name?: string; archived?: boolean; goalCents?: number | null },
): Promise<void> {
  const db = getDb();
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.householdId, hid)));
  if (!category) notFound();
  if (changes.name !== undefined || changes.archived !== undefined) {
    await db
      .update(categories)
      .set({
        ...(changes.name !== undefined && { name: changes.name.trim() }),
        ...(changes.archived !== undefined && { archivedAt: changes.archived ? new Date() : null }),
      })
      .where(eq(categories.id, id));
  }
  if (changes.goalCents !== undefined) {
    await db
      .insert(categoryGoals)
      .values({ householdId: hid, categoryId: id, startsOn: monthStart(monthOf(today())), amountCents: changes.goalCents ?? 0 })
      .onConflictDoUpdate({
        target: [categoryGoals.categoryId, categoryGoals.startsOn],
        set: { amountCents: changes.goalCents ?? 0 },
      });
  }
}

export async function createAccount(
  hid: string,
  name: string,
  ownerMemberId: string | null,
  closingDay: number | null,
): Promise<{ id: string }> {
  try {
    const [row] = await getDb()
      .insert(accounts)
      .values({ householdId: hid, name: name.trim(), ownerMemberId, closingDay })
      .returning({ id: accounts.id });
    return row;
  } catch (error) {
    if (String(error).includes('accounts_name_unique')) throw new StatusError(409, 'Já existe esse cartão');
    throw error;
  }
}

// A new closing day applies to expenses entered or edited from now on; past ones keep their month.
export async function updateAccount(hid: string, id: string, changes: { closingDay: number | null }): Promise<void> {
  const rows = await getDb()
    .update(accounts)
    .set(changes)
    .where(and(eq(accounts.id, id), eq(accounts.householdId, hid)))
    .returning({ id: accounts.id });
  if (!rows.length) notFound();
}

export async function assertReferences(
  hid: string,
  input: { categoryId?: string; accountId?: string | null; memberId?: string | null },
) {
  const [row] = await getDb()
    .select({
      category: input.categoryId
        ? sql<number>`(select count(*) from ${categories} where ${categories.id} = ${input.categoryId} and ${categories.householdId} = ${hid})`
        : sql<number>`1`,
      account: input.accountId
        ? sql<number>`(select count(*) from ${accounts} where ${accounts.id} = ${input.accountId} and ${accounts.householdId} = ${hid})`
        : sql<number>`1`,
      member: input.memberId
        ? sql<number>`(select count(*) from ${members} where ${members.id} = ${input.memberId} and ${members.householdId} = ${hid})`
        : sql<number>`1`,
    })
    .from(sql`(select 1) as one`);
  if (!row || [row.category, row.account, row.member].some((n) => Number(n) === 0)) {
    throw new StatusError(400, 'Categoria, cartão ou pessoa inválida');
  }
}

export async function listPlans(hid: string): Promise<PlanSummary[]> {
  const db = getDb();
  const [plans, installments] = await db.batch([
    db.select().from(installmentPlans).where(eq(installmentPlans.householdId, hid)).orderBy(desc(installmentPlans.purchasedOn)),
    db
      .select({
        planId: expenses.installmentPlanId,
        number: expenses.installmentNumber,
        amountCents: expenses.amountCents,
        billingMonth: expenses.billingMonth,
        paid: expenses.paid,
      })
      .from(expenses)
      .where(and(eq(expenses.householdId, hid), sql`${expenses.installmentPlanId} is not null`, isNull(expenses.deletedAt))),
  ]);
  const thisMonth = monthStart(monthOf(today()));
  const byPlan = new Map<string, PlanScheduleItem[]>();
  for (const i of installments) {
    if (!i.planId || i.number === null) continue;
    byPlan.set(i.planId, [...(byPlan.get(i.planId) ?? []), { ...i, number: i.number }]);
  }
  return plans.map((plan) => {
    const items = (byPlan.get(plan.id) ?? []).sort((a, b) => a.number - b.number);
    // The current installment is the latest one already billed (this month or before).
    const currentNumber = items.filter((i) => i.billingMonth <= thisMonth).reduce((max, i) => Math.max(max, i.number), 0);
    const remaining = items.filter((i) => i.number > currentNumber);
    const current = items.find((i) => i.number === currentNumber) ?? items[0];
    return {
      id: plan.id,
      description: plan.description,
      categoryId: plan.categoryId,
      accountId: plan.accountId,
      memberId: plan.memberId,
      paymentMethod: plan.paymentMethod,
      purchasedOn: plan.purchasedOn,
      installmentsCount: plan.installmentsCount,
      currentNumber,
      installmentCents: current?.amountCents ?? 0,
      remainingCents: remaining.reduce((sum, i) => sum + i.amountCents, 0),
      remainingCount: remaining.length,
      settledOn: plan.settledOn,
      schedule: items,
    };
  });
}

// Changes the plan's details and every installment's; the months they are billed in stay as they are.
export async function updatePlan(hid: string, id: string, input: PlanUpdate): Promise<void> {
  const db = getDb();
  const rows = await db
    .update(installmentPlans)
    .set(input)
    .where(and(eq(installmentPlans.id, id), eq(installmentPlans.householdId, hid)))
    .returning({ id: installmentPlans.id });
  if (!rows.length) notFound();
  await db.update(expenses).set(input).where(and(eq(expenses.installmentPlanId, id), isNull(expenses.deletedAt)));
}

// Removes the plan with all its installments (paid ones too); the foreign key cascades.
export async function deletePlan(hid: string, id: string): Promise<void> {
  const rows = await getDb()
    .delete(installmentPlans)
    .where(and(eq(installmentPlans.id, id), eq(installmentPlans.householdId, hid)))
    .returning({ id: installmentPlans.id });
  if (!rows.length) notFound();
}

export async function listRecurring(hid: string): Promise<Recurring[]> {
  const db = getDb();
  const [expenseRows, incomeRows] = await db.batch([
    db.select().from(recurringExpenses).where(eq(recurringExpenses.householdId, hid)).orderBy(asc(recurringExpenses.dayOfMonth)),
    db.select().from(recurringIncomes).where(eq(recurringIncomes.householdId, hid)).orderBy(asc(recurringIncomes.dayOfMonth)),
  ]);
  return [
    ...expenseRows.map((r) => ({
      id: r.id,
      kind: 'expense' as const,
      description: r.description,
      amountCents: r.amountCents,
      dayOfMonth: r.dayOfMonth,
      categoryId: r.categoryId,
      accountId: r.accountId,
      paymentMethod: r.paymentMethod,
      memberId: r.memberId,
      startsOn: r.startsOn,
      active: r.active && r.endsOn === null,
    })),
    ...incomeRows.map((r) => ({
      id: r.id,
      kind: 'income' as const,
      description: r.description,
      amountCents: r.amountCents,
      dayOfMonth: r.dayOfMonth,
      categoryId: null,
      accountId: null,
      paymentMethod: null,
      memberId: r.memberId,
      startsOn: r.startsOn,
      active: r.active && r.endsOn === null,
    })),
  ];
}

// A new amount applies from next month on, to unpaid occurrences (this month's keeps its value).
// A new start month removes the generated, unpaid occurrences before it; moving it earlier makes
// the missing months appear when they are opened.
export async function updateRecurring(
  hid: string,
  kind: 'expense' | 'income',
  id: string,
  changes: { amountCents?: number; startsOn?: string },
): Promise<void> {
  const db = getDb();
  const after = monthStart(monthOf(today()));
  const startsOn = changes.startsOn ? monthStart(changes.startsOn) : undefined;
  const set = { ...(changes.amountCents !== undefined && { amountCents: changes.amountCents }), ...(startsOn && { startsOn }) };
  if (!Object.keys(set).length) return;
  if (kind === 'expense') {
    const [row] = await db.update(recurringExpenses).set(set).where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.householdId, hid))).returning({ id: recurringExpenses.id });
    if (!row) notFound();
    if (startsOn) {
      await db
        .delete(expenses)
        .where(
          and(
            eq(expenses.recurringExpenseId, id),
            lt(expenses.recurrenceMonth, startsOn),
            eq(expenses.source, 'recorrente'),
            eq(expenses.paid, false),
          ),
        );
    }
    if (changes.amountCents !== undefined) {
      await db
        .update(expenses)
        .set({ amountCents: changes.amountCents })
        .where(and(eq(expenses.recurringExpenseId, id), gt(expenses.recurrenceMonth, after), eq(expenses.paid, false), isNull(expenses.deletedAt)));
    }
  } else {
    const [row] = await db.update(recurringIncomes).set(set).where(and(eq(recurringIncomes.id, id), eq(recurringIncomes.householdId, hid))).returning({ id: recurringIncomes.id });
    if (!row) notFound();
    if (startsOn) {
      await db
        .delete(incomes)
        .where(and(eq(incomes.recurringIncomeId, id), lt(incomes.recurrenceMonth, startsOn), eq(incomes.source, 'recorrente')));
    }
    if (changes.amountCents !== undefined) {
      await db
        .update(incomes)
        .set({ amountCents: changes.amountCents })
        .where(and(eq(incomes.recurringIncomeId, id), gt(incomes.recurrenceMonth, after), isNull(incomes.deletedAt)));
    }
  }
}

export async function setRecurringActive(hid: string, kind: 'expense' | 'income', id: string, active: boolean): Promise<void> {
  const db = getDb();
  const month = monthOf(today());
  const endsOn = active ? null : monthEnd(month);
  if (kind === 'expense') {
    const [row] = await db
      .update(recurringExpenses)
      .set({ active: true, endsOn })
      .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.householdId, hid)))
      .returning({ id: recurringExpenses.id });
    if (!row) notFound();
    if (!active) {
      await db
        .update(expenses)
        .set({ deletedAt: new Date() })
        .where(and(eq(expenses.recurringExpenseId, id), gt(expenses.recurrenceMonth, monthStart(month)), isNull(expenses.deletedAt)));
    }
  } else {
    const [row] = await db
      .update(recurringIncomes)
      .set({ active: true, endsOn })
      .where(and(eq(recurringIncomes.id, id), eq(recurringIncomes.householdId, hid)))
      .returning({ id: recurringIncomes.id });
    if (!row) notFound();
    if (!active) {
      await db
        .update(incomes)
        .set({ deletedAt: new Date() })
        .where(and(eq(incomes.recurringIncomeId, id), gt(incomes.recurrenceMonth, monthStart(month)), isNull(incomes.deletedAt)));
    }
  }
}

export async function setPaid(hid: string, ids: string[], paid: boolean): Promise<number> {
  const rows = await getDb()
    .update(expenses)
    .set({ paid })
    .where(and(inArray(expenses.id, ids), eq(expenses.householdId, hid), isNull(expenses.deletedAt)))
    .returning({ id: expenses.id });
  return rows.length;
}
