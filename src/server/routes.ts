import { StatusError } from 'expo-server';
import { z } from 'zod';

import { parseEntry } from './ai';
import { createInvite, deleteAccount, login, logout, register, requireMember } from './auth';
import * as finance from './finance';
import { body, route } from './http';
import { cents, closingDay, expenseCreate, expenseUpdate, goalCents, incomeCreate, incomeUpdate, month, planUpdate, uuid } from './validation';

type Handler = (request: Request, params: string[]) => Promise<Response>;
type Route = { method: string; pattern: RegExp; handler: Handler };

const ok = () => new Response(null, { status: 204 });
const json = (data: unknown, status = 200) => Response.json(data, { status });
const hidOf = async (request: Request) => (await requireMember(request)).householdId;
const monthParam = (request: Request) => month.parse(new URL(request.url).searchParams.get('month'));

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email('E-mail inválido')),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(200),
  householdName: z.string().trim().min(1).max(80).optional(),
  inviteCode: z.string().trim().min(4).max(32).optional(),
});
const deleteAccountSchema = z.object({ password: z.string().min(1).max(200) });
const loginSchema = z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) });
const parseSchema = z.object({ text: z.string().trim().min(2).max(500) });
const paidSchema = z.object({ ids: z.array(uuid).min(1).max(500), paid: z.boolean() });
const settleSchema = z.object({ lastNumber: z.number().int().min(1) });
const categoryCreate = z.object({ name: z.string().trim().min(1).max(60), goalCents });
const categoryUpdate = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  archived: z.boolean().optional(),
  goalCents: goalCents.optional(),
});
const accountCreate = z.object({
  name: z.string().trim().min(1).max(60),
  ownerMemberId: uuid.nullable(),
  closingDay: closingDay.default(null),
});
const accountUpdate = z.object({ closingDay });
const recurringKind = z.enum(['expense', 'income']);
const recurringUpdate = z.object({ amountCents: cents.optional(), startsOn: month.optional(), active: z.boolean().optional() });

const ID = '([^/]+)';

const routes: Route[] = [
  {
    method: 'POST',
    pattern: /^auth\/login$/,
    handler: async (request) => {
      const { email, password } = await body(request, loginSchema);
      return json(await login(email, password));
    },
  },
  {
    method: 'POST',
    pattern: /^auth\/register$/,
    handler: async (request) => json(await register(await body(request, registerSchema)), 201),
  },
  { method: 'POST', pattern: /^auth\/logout$/, handler: async (request) => (await logout(request), ok()) },
  {
    method: 'POST',
    pattern: /^auth\/delete-account$/,
    handler: async (request) => {
      const me = await requireMember(request);
      await deleteAccount(me, (await body(request, deleteAccountSchema)).password);
      return ok();
    },
  },
  {
    method: 'POST',
    pattern: /^invites$/,
    handler: async (request) => json(await createInvite(await requireMember(request)), 201),
  },
  {
    method: 'GET',
    pattern: /^lookups$/,
    handler: async (request) => json(await finance.lookups(await requireMember(request))),
  },
  {
    method: 'GET',
    pattern: /^entries$/,
    handler: async (request) => json(await finance.listMonth(await hidOf(request), monthParam(request))),
  },
  {
    method: 'GET',
    pattern: /^dashboard$/,
    handler: async (request) => json(await finance.dashboard(await hidOf(request), monthParam(request))),
  },
  {
    method: 'POST',
    pattern: /^parse$/,
    handler: async (request) => {
      const me = await requireMember(request);
      const { text } = await body(request, parseSchema);
      return json(await parseEntry(text, await finance.lookups(me)));
    },
  },
  {
    method: 'POST',
    pattern: /^expenses$/,
    handler: async (request) => {
      const me = await requireMember(request);
      const input = await body(request, expenseCreate);
      await finance.assertReferences(me.householdId, input);
      return json(await finance.createExpense(input, me), 201);
    },
  },
  {
    method: 'POST',
    pattern: /^expenses\/paid$/,
    handler: async (request) => {
      const hid = await hidOf(request);
      const { ids, paid } = await body(request, paidSchema);
      return json({ updated: await finance.setPaid(hid, ids, paid) });
    },
  },
  {
    method: 'GET',
    pattern: new RegExp(`^expenses/${ID}$`),
    handler: async (request, [id]) => json(await finance.getExpense(await hidOf(request), uuid.parse(id))),
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^expenses/${ID}$`),
    handler: async (request, [id]) => {
      const hid = await hidOf(request);
      const input = await body(request, expenseUpdate);
      await finance.assertReferences(hid, input);
      await finance.updateExpense(hid, uuid.parse(id), input);
      return ok();
    },
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^expenses/${ID}$`),
    handler: async (request, [id]) => (await finance.deleteExpense(await hidOf(request), uuid.parse(id)), ok()),
  },
  {
    method: 'POST',
    pattern: new RegExp(`^expenses/${ID}/stop-recurring$`),
    handler: async (request, [id]) => (await finance.stopRecurringExpense(await hidOf(request), uuid.parse(id)), ok()),
  },
  {
    method: 'POST',
    pattern: /^incomes$/,
    handler: async (request) => {
      const me = await requireMember(request);
      const input = await body(request, incomeCreate);
      await finance.assertReferences(me.householdId, input);
      return json(await finance.createIncome(input, me), 201);
    },
  },
  {
    method: 'GET',
    pattern: new RegExp(`^incomes/${ID}$`),
    handler: async (request, [id]) => json(await finance.getIncome(await hidOf(request), uuid.parse(id))),
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^incomes/${ID}$`),
    handler: async (request, [id]) => {
      const hid = await hidOf(request);
      const input = await body(request, incomeUpdate);
      await finance.assertReferences(hid, input);
      await finance.updateIncome(hid, uuid.parse(id), input);
      return ok();
    },
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^incomes/${ID}$`),
    handler: async (request, [id]) => (await finance.deleteIncome(await hidOf(request), uuid.parse(id)), ok()),
  },
  {
    method: 'POST',
    pattern: new RegExp(`^incomes/${ID}/stop-recurring$`),
    handler: async (request, [id]) => (await finance.stopRecurringIncome(await hidOf(request), uuid.parse(id)), ok()),
  },
  {
    method: 'GET',
    pattern: /^installments$/,
    handler: async (request) => json(await finance.listPlans(await hidOf(request))),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^installments/${ID}$`),
    handler: async (request, [id]) => json(await finance.getPlan(await hidOf(request), uuid.parse(id))),
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^installments/${ID}$`),
    handler: async (request, [id]) => {
      const hid = await hidOf(request);
      const input = await body(request, planUpdate);
      await finance.assertReferences(hid, input);
      await finance.updatePlan(hid, uuid.parse(id), input);
      return ok();
    },
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^installments/${ID}$`),
    handler: async (request, [id]) => (await finance.deletePlan(await hidOf(request), uuid.parse(id)), ok()),
  },
  {
    method: 'POST',
    pattern: new RegExp(`^installments/${ID}/settle$`),
    handler: async (request, [id]) => {
      const hid = await hidOf(request);
      const { lastNumber } = await body(request, settleSchema);
      await finance.settlePlan(hid, uuid.parse(id), lastNumber);
      return ok();
    },
  },
  {
    method: 'GET',
    pattern: /^recurring$/,
    handler: async (request) => json(await finance.listRecurring(await hidOf(request))),
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^recurring/${ID}/${ID}$`),
    handler: async (request, [kind, id]) => {
      const hid = await hidOf(request);
      const k = recurringKind.parse(kind);
      const recurringId = uuid.parse(id);
      const { amountCents, startsOn, active } = await body(request, recurringUpdate);
      if (amountCents !== undefined || startsOn !== undefined) await finance.updateRecurring(hid, k, recurringId, { amountCents, startsOn });
      if (active !== undefined) await finance.setRecurringActive(hid, k, recurringId, active);
      return ok();
    },
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^recurring/${ID}/${ID}$`),
    handler: async (request, [kind, id]) => (
      await finance.deleteRecurring(await hidOf(request), recurringKind.parse(kind), uuid.parse(id)), ok()
    ),
  },
  {
    method: 'POST',
    pattern: /^categories$/,
    handler: async (request) => {
      const hid = await hidOf(request);
      const { name, goalCents: goal } = await body(request, categoryCreate);
      return json(await finance.createCategory(hid, name, goal), 201);
    },
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^categories/${ID}$`),
    handler: async (request, [id]) => {
      const hid = await hidOf(request);
      await finance.updateCategory(hid, uuid.parse(id), await body(request, categoryUpdate));
      return ok();
    },
  },
  {
    method: 'POST',
    pattern: new RegExp(`^balance-resets/${ID}$`),
    handler: async (request, [value]) => {
      const me = await requireMember(request);
      await finance.setBalanceReset(month.parse(value), true, me);
      return ok();
    },
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^balance-resets/${ID}$`),
    handler: async (request, [value]) => {
      const me = await requireMember(request);
      await finance.setBalanceReset(month.parse(value), false, me);
      return ok();
    },
  },
  {
    method: 'POST',
    pattern: /^accounts$/,
    handler: async (request) => {
      const hid = await hidOf(request);
      const { name, ownerMemberId, closingDay: closing } = await body(request, accountCreate);
      await finance.assertReferences(hid, { memberId: ownerMemberId });
      return json(await finance.createAccount(hid, name, ownerMemberId, closing), 201);
    },
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^accounts/${ID}$`),
    handler: async (request, [id]) => {
      const hid = await hidOf(request);
      await finance.updateAccount(hid, uuid.parse(id), await body(request, accountUpdate));
      return ok();
    },
  },
];

// All API endpoints share one route file so EAS Hosting loads a single bundle at startup.
export const dispatch = route<{ path?: string | string[] }>(async (request, params) => {
  const path = (Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')).replace(/^\/+|\/+$/g, '');
  const candidates = routes.filter((r) => r.pattern.test(path));
  if (!candidates.length) throw new StatusError(404, 'Rota não encontrada');
  const match = candidates.find((r) => r.method === request.method);
  if (!match) throw new StatusError(405, 'Método não permitido');
  const groups = path.match(match.pattern)!.slice(1).map(decodeURIComponent);
  return match.handler(request, groups);
});
