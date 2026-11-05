export type PaymentMethod = 'pix' | 'debito' | 'credito' | 'dinheiro';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'dinheiro', label: 'Dinheiro' },
];

export type Member = { id: string; name: string; email: string };

export type Category = {
  id: string;
  name: string;
  archived: boolean;
  goalCents: number | null;
};

export type Account = {
  id: string;
  name: string;
  ownerMemberId: string | null;
  // Day the credit card invoice closes; null when the card has no closing day set.
  closingDay: number | null;
  archived: boolean;
};

export type Lookups = {
  me: Member;
  members: Member[];
  categories: Category[];
  accounts: Account[];
};

export type Expense = {
  id: string;
  description: string;
  amountCents: number;
  spentOn: string;
  // First day of the month it is paid in; differs from spentOn's month for credit invoices.
  billingMonth: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  accountId: string | null;
  memberId: string;
  paid: boolean;
  source: string;
  recurringExpenseId: string | null;
  // The recurrence is still live after this occurrence's month.
  recurrenceContinues: boolean;
  installmentPlanId: string | null;
  installmentNumber: number | null;
  installmentsCount: number | null;
  purchasedOn: string | null;
};

export type Income = {
  id: string;
  description: string;
  amountCents: number;
  receivedOn: string;
  memberId: string | null;
  recurringIncomeId: string | null;
  // The recurrence is still live after this occurrence's month.
  recurrenceContinues: boolean;
};

export type MonthEntries = {
  expenses: Expense[];
  incomes: Income[];
  // Incomes minus expenses of the months since the last reset, up to the month before this one.
  carryOverCents: number;
  // This month's leftover balance was cleared, so the next month carries nothing over.
  balanceReset: boolean;
};

export type InstallmentPlan = {
  id: string;
  description: string;
  totalCents: number;
  installmentsCount: number;
  purchasedOn: string;
  settledOn: string | null;
  categoryId: string;
  paymentMethod: PaymentMethod;
  accountId: string | null;
  memberId: string;
  installments: { id: string; number: number; amountCents: number; spentOn: string; billingMonth: string; paid: boolean }[];
};

export type PlanUpdate = {
  description: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  accountId: string | null;
  memberId: string;
};

export type ExpenseInput = {
  description: string;
  amountCents: number;
  spentOn: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  accountId: string | null;
  memberId: string;
  paid: boolean;
  installments?: number;
  recurring?: boolean;
  rawText?: string | null;
};

export type IncomeInput = {
  description: string;
  amountCents: number;
  receivedOn: string;
  memberId: string | null;
  recurring?: boolean;
};

export type Draft = {
  kind: 'expense' | 'income';
  description: string;
  amountCents: number | null;
  date: string;
  categoryId: string | null;
  paymentMethod: PaymentMethod | null;
  accountId: string | null;
  memberId: string | null;
  installments: number | null;
  rawText: string;
};

export type Breakdown = { id: string | null; label: string; cents: number; goalCents?: number | null };

export type Dashboard = {
  month: string;
  incomesCents: number;
  expensesCents: number;
  paidCents: number;
  balanceCents: number;
  accumulatedCents: number;
  byCategory: Breakdown[];
  byAccount: Breakdown[];
  byMethod: Breakdown[];
};

export type PlanScheduleItem = { number: number; billingMonth: string; amountCents: number; paid: boolean };

export type PlanSummary = {
  id: string;
  description: string;
  categoryId: string;
  accountId: string | null;
  memberId: string;
  paymentMethod: PaymentMethod;
  purchasedOn: string;
  installmentsCount: number;
  currentNumber: number;
  installmentCents: number;
  remainingCents: number;
  remainingCount: number;
  settledOn: string | null;
  // Every installment with the month it is billed in, for paid counts and the monthly forecast.
  schedule: PlanScheduleItem[];
};

export type Recurring = {
  id: string;
  kind: 'expense' | 'income';
  description: string;
  amountCents: number;
  dayOfMonth: number;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  memberId: string | null;
  // First day of the month the recurrence starts in.
  startsOn: string;
  active: boolean;
};
