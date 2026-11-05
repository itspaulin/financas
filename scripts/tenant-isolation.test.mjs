// Cross-household isolation test. Runs against a live server:
//   BASE_URL=http://localhost:8081 node --test scripts/tenant-isolation.test.mjs
// It registers throwaway accounts (@example.test) and deletes them at the end.
// Note: the API writes to whatever database that server is configured with.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const BASE = (process.env.BASE_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const RUN = Math.random().toString(36).slice(2, 8);
const PASSWORD = 'senha-de-teste-123';
const MONTH = new Date().toISOString().slice(0, 7);
const TODAY = `${MONTH}-15`;
const MARK = `iso-${RUN}`;

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, text };
}

async function signUp(label, extra = {}) {
  const email = `${MARK}-${label}@example.test`;
  const res = await api('POST', 'auth/register', {
    body: { name: `Teste ${label}`, email, password: PASSWORD, ...extra },
  });
  assert.equal(res.status, 201, `register ${label}: ${res.text}`);
  return { label, email, token: res.data.token, member: res.data.member };
}

const expenseBody = (a, extra = {}) => ({
  description: `${MARK} gasto`,
  amountCents: 12_345,
  spentOn: TODAY,
  categoryId: a.categoryId,
  paymentMethod: 'pix',
  accountId: null,
  memberId: a.member.id,
  paid: false,
  ...extra,
});

describe('household isolation', () => {
  /** @type {any} */ let A;
  /** @type {any} */ let B;
  const users = [];
  let expenseId, incomeId, planId, categoryId, accountId;

  before(async () => {
    A = await signUp('a');
    B = await signUp('b');
    users.push(A, B);

    const lookupsA = await api('GET', 'lookups', { token: A.token });
    assert.equal(lookupsA.status, 200);
    A.categoryId = lookupsA.data.categories[0].id;

    const category = await api('POST', 'categories', { token: A.token, body: { name: `${MARK} cat`, goalCents: 50_000 } });
    assert.equal(category.status, 201, category.text);
    categoryId = category.data.id;

    const account = await api('POST', 'accounts', {
      token: A.token,
      body: { name: `${MARK} cartao`, ownerMemberId: A.member.id, closingDay: 10 },
    });
    assert.equal(account.status, 201, account.text);
    accountId = account.data.id;

    const expense = await api('POST', 'expenses', { token: A.token, body: expenseBody(A, { categoryId }) });
    assert.equal(expense.status, 201, expense.text);
    expenseId = expense.data.id;

    const income = await api('POST', 'incomes', {
      token: A.token,
      body: { description: `${MARK} renda`, amountCents: 500_000, receivedOn: TODAY, memberId: A.member.id },
    });
    assert.equal(income.status, 201, income.text);
    incomeId = income.data.id;

    const plan = await api('POST', 'expenses', {
      token: A.token,
      body: expenseBody(A, { categoryId, description: `${MARK} parcelado`, installments: 3 }),
    });
    assert.equal(plan.status, 201, plan.text);
    const plans = await api('GET', 'installments', { token: A.token });
    planId = plans.data.find((p) => p.description === `${MARK} parcelado`)?.id;
    assert.ok(planId, 'plan of A should be listed for A');
  });

  after(async () => {
    for (const user of users) {
      await api('POST', 'auth/delete-account', { token: user.token, body: { password: PASSWORD } });
    }
  });

  test('requests without a token are rejected', async () => {
    for (const path of ['lookups', `entries?month=${MONTH}`, 'installments', 'recurring']) {
      assert.equal((await api('GET', path)).status, 401, path);
    }
  });

  test('B does not see A data in any listing', async () => {
    const lookups = await api('GET', 'lookups', { token: B.token });
    const text = JSON.stringify(lookups.data);
    assert.ok(!text.includes(categoryId), 'category of A leaked into lookups');
    assert.ok(!text.includes(accountId), 'account of A leaked into lookups');
    assert.ok(!text.includes(A.member.id), 'member of A leaked into lookups');

    for (const path of [`entries?month=${MONTH}`, `dashboard?month=${MONTH}`, 'installments', 'recurring']) {
      const res = await api('GET', path, { token: B.token });
      assert.equal(res.status, 200, `${path}: ${res.text}`);
      assert.ok(!res.text.includes(MARK), `${path} leaked data of A`);
    }
  });

  test('A still sees its own data', async () => {
    const entries = await api('GET', `entries?month=${MONTH}`, { token: A.token });
    assert.ok(entries.text.includes(`${MARK} gasto`));
  });

  test('B cannot read, edit or delete the expense of A', async () => {
    const lookupsB = await api('GET', 'lookups', { token: B.token });
    const own = { categoryId: lookupsB.data.categories[0].id, memberId: B.member.id };

    assert.equal((await api('GET', `expenses/${expenseId}`, { token: B.token })).status, 404);
    const patch = await api('PATCH', `expenses/${expenseId}`, {
      token: B.token,
      body: expenseBody(A, { ...own, description: 'hacked' }),
    });
    assert.equal(patch.status, 404, patch.text);
    assert.equal((await api('DELETE', `expenses/${expenseId}`, { token: B.token })).status, 404);
    assert.equal((await api('POST', `expenses/${expenseId}/stop-recurring`, { token: B.token })).status, 404);

    const still = await api('GET', `expenses/${expenseId}`, { token: A.token });
    assert.equal(still.status, 200);
    assert.ok(!JSON.stringify(still.data).includes('hacked'));
  });

  test('B cannot mark the expense of A as paid', async () => {
    const res = await api('POST', 'expenses/paid', { token: B.token, body: { ids: [expenseId], paid: true } });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.data.updated, 0);
    const still = await api('GET', `expenses/${expenseId}`, { token: A.token });
    assert.equal(still.data.paid, false);
  });

  test('B cannot read, edit or delete the income of A', async () => {
    assert.equal((await api('GET', `incomes/${incomeId}`, { token: B.token })).status, 404);
    const patch = await api('PATCH', `incomes/${incomeId}`, {
      token: B.token,
      body: { description: 'hacked', amountCents: 1, receivedOn: TODAY, memberId: B.member.id },
    });
    assert.equal(patch.status, 404, patch.text);
    assert.equal((await api('DELETE', `incomes/${incomeId}`, { token: B.token })).status, 404);
    assert.equal((await api('GET', `incomes/${incomeId}`, { token: A.token })).status, 200);
  });

  test('B cannot read, edit, settle or delete the installment plan of A', async () => {
    const lookupsB = await api('GET', 'lookups', { token: B.token });
    assert.equal((await api('GET', `installments/${planId}`, { token: B.token })).status, 404);
    const patch = await api('PATCH', `installments/${planId}`, {
      token: B.token,
      body: {
        description: 'hacked',
        categoryId: lookupsB.data.categories[0].id,
        paymentMethod: 'pix',
        accountId: null,
        memberId: B.member.id,
      },
    });
    assert.equal(patch.status, 404, patch.text);
    assert.equal((await api('POST', `installments/${planId}/settle`, { token: B.token, body: { lastNumber: 1 } })).status, 404);
    assert.equal((await api('DELETE', `installments/${planId}`, { token: B.token })).status, 404);

    const plan = await api('GET', `installments/${planId}`, { token: A.token });
    assert.equal(plan.status, 200);
    assert.equal(plan.data.installments.length, 3, 'installments of A must be intact');
    assert.ok(!JSON.stringify(plan.data).includes('hacked'));
  });

  test('B cannot create entries that point at references of A', async () => {
    const lookupsB = await api('GET', 'lookups', { token: B.token });
    const ownCategory = lookupsB.data.categories[0].id;
    const cases = {
      'category of A': { categoryId },
      'account of A': { categoryId: ownCategory, accountId, paymentMethod: 'credito' },
      'member of A': { categoryId: ownCategory, memberId: A.member.id },
    };
    for (const [name, extra] of Object.entries(cases)) {
      const res = await api('POST', 'expenses', {
        token: B.token,
        body: expenseBody({ categoryId: ownCategory, member: B.member }, { ...extra, memberId: extra.memberId ?? B.member.id }),
      });
      assert.ok(res.status >= 400 && res.status < 500, `${name}: expected 4xx, got ${res.status} ${res.text}`);
    }
    const income = await api('POST', 'incomes', {
      token: B.token,
      body: { description: 'x', amountCents: 100, receivedOn: TODAY, memberId: A.member.id },
    });
    assert.ok(income.status >= 400 && income.status < 500, `income with member of A: ${income.status}`);
  });

  test('B cannot edit the category or account of A', async () => {
    const category = await api('PATCH', `categories/${categoryId}`, { token: B.token, body: { name: 'hacked', archived: true } });
    assert.ok(category.status >= 400 && category.status < 500, `category: ${category.status} ${category.text}`);
    const account = await api('PATCH', `accounts/${accountId}`, { token: B.token, body: { closingDay: 1 } });
    assert.ok(account.status >= 400 && account.status < 500, `account: ${account.status} ${account.text}`);

    const lookupsA = await api('GET', 'lookups', { token: A.token });
    const cat = lookupsA.data.categories.find((c) => c.id === categoryId);
    assert.equal(cat.name, `${MARK} cat`);
    assert.ok(!cat.archivedAt);
  });

  test('balance resets are per household', async () => {
    const set = await api('POST', `balance-resets/${MONTH}`, { token: A.token });
    assert.equal(set.status, 204, set.text);
    const entriesB = await api('GET', `entries?month=${MONTH}`, { token: B.token });
    assert.equal(entriesB.data.balanceReset, false, 'reset of A leaked into B');
    await api('DELETE', `balance-resets/${MONTH}`, { token: B.token });
    const entriesA = await api('GET', `entries?month=${MONTH}`, { token: A.token });
    assert.equal(entriesA.data.balanceReset, true, 'B must not clear the reset of A');
    await api('DELETE', `balance-resets/${MONTH}`, { token: A.token });
  });

  describe('invites', () => {
    let code;
    let C;

    test('invite joins the household of the inviter, once', async () => {
      const invite = await api('POST', 'invites', { token: A.token });
      assert.equal(invite.status, 201, invite.text);
      code = invite.data.code;
      assert.match(code, /^[A-Z2-9]{8}$/);

      C = await signUp('c', { inviteCode: code });
      users.push(C);

      const lookupsC = await api('GET', 'lookups', { token: C.token });
      assert.ok(lookupsC.data.members.some((m) => m.id === A.member.id), 'C should see A as a household member');
      assert.ok((await api('GET', `expenses/${expenseId}`, { token: C.token })).status === 200, 'C shares the data of A');

      const lookupsA = await api('GET', 'lookups', { token: A.token });
      assert.ok(lookupsA.data.members.some((m) => m.id === C.member.id));
      const lookupsB = await api('GET', 'lookups', { token: B.token });
      assert.ok(!lookupsB.data.members.some((m) => m.id === C.member.id), 'B must not see C');

      const reuse = await api('POST', 'auth/register', {
        body: { name: 'Teste d', email: `${MARK}-d@example.test`, password: PASSWORD, inviteCode: code },
      });
      assert.equal(reuse.status, 400, `reused code: ${reuse.text}`);
    });

    test('a wrong invite code is rejected', async () => {
      const res = await api('POST', 'auth/register', {
        body: { name: 'Teste e', email: `${MARK}-e@example.test`, password: PASSWORD, inviteCode: 'ZZZZZZZZ' },
      });
      assert.equal(res.status, 400, res.text);
    });

    test('duplicate e-mail is rejected', async () => {
      const res = await api('POST', 'auth/register', { body: { name: 'dup', email: A.email, password: PASSWORD } });
      assert.equal(res.status, 409, res.text);
    });
  });

  test('deleting an account keeps the household for the remaining member', async () => {
    const C = users.find((u) => u.label === 'c');
    assert.ok(C, 'depends on the invite test');
    const wrong = await api('POST', 'auth/delete-account', { token: C.token, body: { password: 'senha-errada' } });
    assert.equal(wrong.status, 403, wrong.text);

    const del = await api('POST', 'auth/delete-account', { token: C.token, body: { password: PASSWORD } });
    assert.equal(del.status, 204, del.text);
    users.splice(users.indexOf(C), 1);

    assert.equal((await api('GET', 'lookups', { token: C.token })).status, 401, 'session of C must be gone');
    assert.equal((await api('GET', `expenses/${expenseId}`, { token: A.token })).status, 200, 'household of A must survive');
  });
});
