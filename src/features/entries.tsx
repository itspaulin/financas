import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  Button,
  Card,
  Chips,
  EmptyState,
  ErrorNote,
  MonthSwitcher,
  Note,
  PaidToggle,
  Screen,
  SectionTitle,
  Skeleton,
  Stat,
  Tag,
  Txt,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAppData, useRemote } from '@/lib/data';
import { formatDate, formatDayHeader, formatMoney, formatMonth, formatShortDate } from '@/lib/format';
import { fonts, radius, shadow, space, useColors } from '@/lib/theme';
import { today } from '@/shared/dates';
import {
  type Draft,
  type Expense,
  type Income,
  type Lookups,
  type MonthEntries,
  PAYMENT_METHODS,
} from '@/shared/types';

import { useConfirm } from '@/components/confirm';

import { type Column, GroupRow, Row, SearchField, Segmented, Select, Table, ToggleChip } from './desktop/controls';
import { DesktopPage, useDesktop } from './desktop/shell';
import { useEntryActions } from './navigation';

const nameOf = (list: { id: string; name: string }[], id: string | null) =>
  id ? (list.find((x) => x.id === id)?.name ?? '') : '';
const methodLabel = (m: string | null) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? '';

function useQuickAdd() {
  const { changed } = useAppData();
  const actions = useEntryActions();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const missing = !draft
    ? []
    : draft.kind === 'income'
      ? (['valor'].filter(() => !draft.amountCents) as string[])
      : [
          !draft.amountCents && 'valor',
          !draft.categoryId && 'categoria',
          !draft.paymentMethod && 'forma de pagamento',
          !draft.memberId && 'quem gastou',
        ].filter((x): x is string => Boolean(x));

  return {
    text,
    setText,
    draft,
    error,
    busy,
    missing,
    async parse() {
      if (text.trim().length < 2 || busy) return;
      setBusy(true);
      setError(null);
      setDraft(null);
      try {
        setDraft(await api<Draft>('/parse', { method: 'POST', body: { text } }));
        setText('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro');
      } finally {
        setBusy(false);
      }
    },
    discard() {
      setDraft(null);
    },
    edit() {
      if (!draft) return;
      setDraft(null);
      if (draft.kind === 'income') actions.newIncome(draft);
      else actions.newExpense(draft);
    },
    async confirm() {
      if (!draft || missing.length) return;
      setBusy(true);
      setError(null);
      try {
        if (draft.kind === 'income') {
          await api('/incomes', {
            method: 'POST',
            body: { description: draft.description, amountCents: draft.amountCents, receivedOn: draft.date, memberId: draft.memberId },
          });
        } else {
          await api('/expenses', {
            method: 'POST',
            body: {
              description: draft.description,
              amountCents: draft.amountCents,
              spentOn: draft.date,
              categoryId: draft.categoryId,
              paymentMethod: draft.paymentMethod,
              accountId: draft.accountId,
              memberId: draft.memberId,
              paid: false,
              installments: draft.installments ?? undefined,
              rawText: draft.rawText,
            },
          });
        }
        setDraft(null);
        changed();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao salvar');
      } finally {
        setBusy(false);
      }
    },
  };
}

type QuickAdd = ReturnType<typeof useQuickAdd>;

function draftFields(draft: Draft, lookups: Lookups) {
  const date = `${formatDate(draft.date)}${draft.date === today() ? ' · hoje' : ''}`;
  const member = nameOf(lookups.members, draft.memberId) || (draft.kind === 'income' ? 'Casa' : '');
  if (draft.kind === 'income') {
    return [
      { label: 'Tipo', value: 'Entrada' },
      { label: 'Data', value: date },
      { label: 'Quem recebeu', value: member },
    ];
  }
  const parcel =
    draft.installments && draft.amountCents
      ? `${draft.installments}× de ${formatMoney(Math.floor(draft.amountCents / draft.installments))}`
      : 'À vista';
  return [
    { label: 'Categoria', value: nameOf(lookups.categories, draft.categoryId), missing: !draft.categoryId },
    { label: 'Pagamento', value: methodLabel(draft.paymentMethod), missing: !draft.paymentMethod },
    { label: 'Cartão', value: nameOf(lookups.accounts, draft.accountId) || '—' },
    { label: 'Data', value: date },
    { label: 'Quem gastou', value: member, missing: !draft.memberId },
    { label: 'Parcelas', value: parcel },
  ];
}

function DraftCard({ q, lookups, wide }: { q: QuickAdd; lookups: Lookups; wide?: boolean }) {
  const c = useColors();
  const draft = q.draft!;
  const pending = q.missing.length > 0;
  const fields = draftFields(draft, lookups);
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name="sparkles-outline" size={15} color={c.primaryText} />
      <Txt size={13} weight={700} color={c.primaryText}>
        Confirme o lançamento
      </Txt>
    </View>
  );
  const title = (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md, justifyContent: wide ? 'flex-start' : 'space-between', flexShrink: 1 }}>
      <Txt size={20} weight={800} numberOfLines={1}>
        {draft.description}
      </Txt>
      <Txt size={20} weight={800} numeric color={draft.kind === 'income' ? c.ok : c.text}>
        {draft.amountCents ? `${draft.kind === 'income' ? '+' : ''}${formatMoney(draft.amountCents)}` : '—'}
      </Txt>
    </View>
  );
  const grid = (
    <View style={[styles.draftGrid, wide && { flexWrap: 'nowrap', columnGap: space.lg }]}>
      {fields.map((f) => (
        <View key={f.label} style={wide ? { flex: 1 } : { width: '50%', paddingRight: space.sm }}>
          <Txt size={12} color={c.text2}>
            {f.label}
          </Txt>
          <Txt size={15} weight={700} color={f.missing ? c.warn : c.text}>
            {f.missing ? 'Não definida' : f.value}
          </Txt>
        </View>
      ))}
    </View>
  );
  const buttons = (
    <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: wide ? 'flex-end' : 'space-between' }}>
      <View style={!wide && { flex: 1 }}>
        <Button title="Descartar" variant="outline" onPress={q.discard} size="sm" full={!wide} />
      </View>
      <View style={!wide && { flex: 1 }}>
        <Button title="Editar" variant="secondary" onPress={q.edit} size="sm" full={!wide} />
      </View>
      <View style={!wide && { flex: 1 }}>
        <Button title="Confirmar" onPress={q.confirm} disabled={pending} loading={q.busy} size="sm" full={!wide} />
      </View>
    </View>
  );
  return (
    <Card tone={pending ? 'pending' : 'ok'}>
      {wide ? (
        <View style={styles.between}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, flexShrink: 1 }}>
            {header}
            {title}
          </View>
          <Tag tone={pending ? 'warn' : 'ok'}>{pending ? 'Incompleto' : 'Tudo certo'}</Tag>
        </View>
      ) : (
        <>
          <View style={styles.between}>
            {header}
            <Tag tone={pending ? 'warn' : 'ok'}>{pending ? 'Incompleto' : 'Tudo certo'}</Tag>
          </View>
          {title}
        </>
      )}
      {grid}
      {pending && <Note tone="warn">Falta: {q.missing.join(', ')}. Toque em Editar</Note>}
      {buttons}
    </Card>
  );
}

function QuickAddInput({ q, wide }: { q: QuickAdd; wide?: boolean }) {
  const c = useColors();
  const input = (
    <TextInput
      value={q.text}
      onChangeText={q.setText}
      placeholder={wide ? 'Lançar com IA — ex.: gastei 10 reais hoje num salgado no nubank do Luiz' : 'Ex.: gastei 10 reais hoje num salgado no nubank do Luiz'}
      placeholderTextColor={c.text3}
      multiline={!wide}
      editable={!q.busy}
      onSubmitEditing={q.parse}
      submitBehavior="submit"
      returnKeyType="send"
      style={[
        styles.quickInput,
        { color: c.text, backgroundColor: c.surface, borderColor: q.error ? c.err : c.line },
        wide && { minHeight: 48 },
      ]}
    />
  );
  const send = wide ? (
    <Button title="Lançar" icon="sparkles-outline" onPress={q.parse} disabled={q.text.trim().length < 2} loading={q.busy} />
  ) : (
    <Pressable
      accessibilityLabel="Interpretar com IA"
      onPress={q.parse}
      disabled={q.busy || q.text.trim().length < 2}
      style={[styles.send, { backgroundColor: c.primary, opacity: q.busy || q.text.trim().length < 2 ? 0.5 : 1 }]}>
      {q.busy ? <ActivityIndicator color={c.onPrimary} /> : <Ionicons name="sparkles" size={22} color={c.onPrimary} />}
    </Pressable>
  );
  return (
    <Card style={{ gap: space.sm }}>
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Ionicons name="sparkles-outline" size={22} color={c.primaryText} />
          <View style={{ flex: 1 }}>{input}</View>
          {send}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles-outline" size={15} color={c.primaryText} />
            <Txt size={13} weight={700} color={c.primaryText}>
              Lançar com IA
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>{input}</View>
            {send}
          </View>
        </>
      )}
      {q.busy && !q.draft && (
        <View style={[styles.parsing, { backgroundColor: c.primaryBg }]}>
          <ActivityIndicator size="small" color={c.primaryText} />
          <Txt size={14} weight={600} color={c.primaryText}>
            Interpretando seu lançamento…
          </Txt>
        </View>
      )}
      <ErrorNote>{q.error}</ErrorNote>
    </Card>
  );
}

type Filters = {
  category: string | null;
  account: string | null;
  member: string | null;
  method: string | null;
  unpaid: boolean;
  search: string;
};

const EMPTY_FILTERS: Filters = { category: null, account: null, member: null, method: null, unpaid: false, search: '' };

type Day<T> = [string, T[]];

function byDay<T>(items: T[], dateOf: (item: T) => string): Day<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))) {
    groups.set(dateOf(item), [...(groups.get(dateOf(item)) ?? []), item]);
  }
  return [...groups.entries()];
}

function useFilteredEntries(data: MonthEntries | null, f: Filters) {
  return useMemo(() => {
    const search = f.search.trim().toLowerCase();
    const expenseOnly = Boolean(f.category || f.account || f.method || f.unpaid);
    const expenses = (data?.expenses ?? []).filter(
      (e) =>
        (!f.category || e.categoryId === f.category) &&
        (!f.account || e.accountId === f.account) &&
        (!f.member || e.memberId === f.member) &&
        (!f.method || e.paymentMethod === f.method) &&
        (!f.unpaid || !e.paid) &&
        (!search || e.description.toLowerCase().includes(search)),
    );
    const incomes = (data?.incomes ?? []).filter(
      (i) => !expenseOnly && (!f.member || i.memberId === f.member) && (!search || i.description.toLowerCase().includes(search)),
    );
    const newestFirst = (list: Expense[]) => [...list].sort((a, b) => b.spentOn.localeCompare(a.spentOn));
    const sumOf = (list: Expense[]) => list.reduce((s, e) => s + e.amountCents, 0);
    const installments = expenses.filter((e) => e.installmentPlanId);
    const recurring = expenses.filter((e) => !e.installmentPlanId && e.recurringExpenseId);
    return {
      expenses,
      incomes,
      installments: newestFirst(installments),
      installmentCents: sumOf(installments),
      recurring: newestFirst(recurring),
      recurringCents: sumOf(recurring),
      expenseDays: byDay(
        expenses.filter((e) => !e.installmentPlanId && !e.recurringExpenseId),
        (e) => e.spentOn,
      ),
      incomeDays: byDay(incomes, (i) => i.receivedOn),
      expenseCents: expenses.reduce((s, e) => s + e.amountCents, 0),
      incomeCents: incomes.reduce((s, i) => s + i.amountCents, 0),
      paidCents: expenses.filter((e) => e.paid).reduce((s, e) => s + e.amountCents, 0),
    };
  }, [data, f]);
}

function usePaidActions() {
  const { changed } = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    busy,
    error,
    async setPaid(ids: string[], paid: boolean) {
      if (!ids.length) return;
      setBusy(true);
      setError(null);
      try {
        await api('/expenses/paid', { method: 'POST', body: { ids, paid } });
        changed();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao atualizar');
      } finally {
        setBusy(false);
      }
    },
  };
}

function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return {
    selected,
    has: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (ids: string[]) => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
  };
}

function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={[styles.checkbox, { borderColor: checked ? c.primary : c.off, backgroundColor: checked ? c.primary : c.surface }]}>
      {checked && <Ionicons name="checkmark" size={16} color={c.onPrimary} />}
    </Pressable>
  );
}

function BulkBar({
  count,
  cents,
  busy,
  onPaid,
  onUnpaid,
  onClear,
  floating,
}: {
  count: number;
  cents: number;
  busy: boolean;
  onPaid: () => void;
  onUnpaid: () => void;
  onClear: () => void;
  floating?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.bulk, { backgroundColor: c.primaryBg, borderColor: c.primary }, floating && shadow(c)]}>
      <Pressable accessibilityLabel="Limpar seleção" onPress={onClear} hitSlop={8}>
        <Ionicons name="close" size={20} color={c.primaryText} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Txt size={14} weight={700} color={c.primaryText}>
          {count} {count === 1 ? 'selecionado' : 'selecionados'}
        </Txt>
        <Txt size={12} color={c.primaryText} numeric>
          {formatMoney(cents)}
        </Txt>
      </View>
      <Button title="Pago" size="sm" icon="checkmark-done" onPress={onPaid} loading={busy} />
      <Button title="A pagar" size="sm" variant="outline" onPress={onUnpaid} disabled={busy} />
    </View>
  );
}

function ExpenseMarks({ expense: e }: { expense: Expense }) {
  const c = useColors();
  return (
    <>
      {e.installmentNumber ? <Tag tone="primary">{`${e.installmentNumber}/${e.installmentsCount}`}</Tag> : null}
      {e.purchasedOn && e.purchasedOn.slice(0, 7) !== e.billingMonth.slice(0, 7) ? <Tag>{`compra ${formatShortDate(e.purchasedOn)}`}</Tag> : null}
      {e.recurringExpenseId ? <Ionicons name="repeat" size={14} color={c.text3} /> : null}
    </>
  );
}

function expenseSubtitle(e: Expense, lookups: Lookups) {
  return [
    nameOf(lookups.categories, e.categoryId),
    nameOf(lookups.accounts, e.accountId) || methodLabel(e.paymentMethod),
    nameOf(lookups.members, e.memberId),
  ]
    .filter(Boolean)
    .join(' · ');
}

function DayList<T extends { id: string }>({
  days,
  render,
}: {
  days: Day<T>[];
  render: (item: T, first: boolean) => ReactNode;
}) {
  const c = useColors();
  return (
    <>
      {days.map(([day, items]) => (
        <View key={day} style={{ gap: space.sm }}>
          <Txt size={13} weight={700} color={c.text2} style={{ paddingHorizontal: 4 }}>
            {formatDayHeader(day)}
          </Txt>
          <View style={[styles.grp, { backgroundColor: c.surface, borderColor: c.line }]}>
            {items.map((item, i) => (
              <View key={item.id}>{render(item, i === 0)}</View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function MonthStats({
  totals,
  data,
}: {
  totals: { incomeCents: number; expenseCents: number; paidCents: number };
  data: MonthEntries | null;
}) {
  const { month, changed } = useAppData();
  const ask = useConfirm();
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const forecast = totals.incomeCents - totals.expenseCents;
  const toggleReset = async () => {
    const undo = Boolean(data?.balanceReset);
    const monthName = formatMonth(month).toLowerCase();
    const confirmed = await ask(
      undo
        ? { title: 'Desfazer zerar saldo?', message: `O saldo de ${monthName} volta a ser somado nos meses seguintes.`, action: 'Desfazer' }
        : { title: 'Zerar saldo do mês?', message: `O que sobrou em ${monthName} sai da conta: o mês seguinte começa com saldo anterior zero.`, action: 'Zerar' },
    );
    if (!confirmed) return;
    setResetting(true);
    setResetError(null);
    try {
      await api(`/balance-resets/${month}`, { method: undo ? 'DELETE' : 'POST' });
      changed();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Erro ao zerar o saldo');
    } finally {
      setResetting(false);
    }
  };
  return (
    <>
      <Stat label="Entradas" cents={totals.incomeCents} tone="income" />
      <Stat label="Gastos do mês" cents={totals.expenseCents} />
      <Stat label="Já pago" cents={totals.paidCents} />
      <Stat label="A pagar" cents={totals.expenseCents - totals.paidCents} tone="warn" />
      <Stat label="Saldo previsto" cents={forecast} tone="balance" />
      <Stat
        label="Saldo com mês anterior"
        cents={forecast + (data?.carryOverCents ?? 0)}
        tone="balance"
        footer={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            {data?.balanceReset && <Tag tone="ok">Saldo zerado</Tag>}
            <Button
              title={data?.balanceReset ? 'Desfazer' : 'Zerar saldo'}
              size="sm"
              variant="outline"
              loading={resetting}
              onPress={toggleReset}
            />
          </View>
        }
      />
      <ErrorNote>{resetError}</ErrorNote>
    </>
  );
}

export function MobileEntries() {
  const c = useColors();
  const { lookups, lookupsError, month, shiftMonth } = useAppData();
  const { data, error } = useRemote<MonthEntries>(`/entries?month=${month}`);
  const q = useQuickAdd();
  const actions = useEntryActions();
  const paid = usePaidActions();
  const selection = useSelection();
  const [tab, setTab] = useState<'expenses' | 'incomes'>('expenses');
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const active = [filters.category, filters.account, filters.member].filter(Boolean).length;
  const view = useFilteredEntries(data, filters);
  const totals = useFilteredEntries(data, EMPTY_FILTERS);
  const selecting = selection.selected.size > 0;
  const selectedCents = view.expenses.filter((e) => selection.has(e.id)).reduce((s, e) => s + e.amountCents, 0);
  const groups = [
    { key: 'installments', title: 'Parcelamentos do mês', items: view.installments, cents: view.installmentCents, accent: true },
    { key: 'recurring', title: 'Recorrentes', items: view.recurring, cents: view.recurringCents, accent: false },
  ].filter((g) => g.items.length > 0);

  if (!lookups) {
    return <Screen>{lookupsError ? <ErrorNote>{lookupsError}</ErrorNote> : <Skeleton height={200} r={20} />}</Screen>;
  }

  const expenseRow = (e: Expense, first: boolean, withDate = false) => {
    const checked = selection.has(e.id);
    return (
      <Pressable
        onPress={() => (selecting ? selection.toggle(e.id) : actions.editExpense(e.id))}
        onLongPress={() => selection.toggle(e.id)}
        style={({ pressed }) => [
          styles.li,
          !first && { borderTopWidth: 1, borderTopColor: c.line },
          (pressed || checked) && { backgroundColor: checked ? c.primaryBg : c.surface2 },
        ]}>
        {selecting && <Checkbox checked={checked} onPress={() => selection.toggle(e.id)} label={`Selecionar ${e.description}`} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Txt size={15} weight={700}>
              {e.description}
            </Txt>
            <ExpenseMarks expense={e} />
          </View>
          <Txt size={13} color={c.text3} numberOfLines={1}>
            {withDate ? `${formatShortDate(e.spentOn)} · ${expenseSubtitle(e, lookups)}` : expenseSubtitle(e, lookups)}
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Txt size={16} weight={700} numeric>
            {formatMoney(e.amountCents)}
          </Txt>
          <PaidToggle paid={e.paid} disabled={paid.busy} onPress={() => paid.setPaid([e.id], !e.paid)} />
        </View>
      </Pressable>
    );
  };

  const incomeRow = (i: Income, first: boolean) => (
    <Pressable
      onPress={() => actions.editIncome(i.id)}
      style={({ pressed }) => [styles.li, !first && { borderTopWidth: 1, borderTopColor: c.line }, pressed && { backgroundColor: c.surface2 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt size={15} weight={700}>
            {i.description}
          </Txt>
          {i.recurringIncomeId ? <Ionicons name="repeat" size={14} color={c.text3} /> : null}
        </View>
        <Txt size={13} color={c.text3}>
          {['Entrada', nameOf(lookups.members, i.memberId) || 'Casa'].join(' · ')}
        </Txt>
      </View>
      <Txt size={16} weight={700} numeric color={c.ok}>
        +{formatMoney(i.amountCents)}
      </Txt>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <MonthSwitcher month={month} onShift={shiftMonth} />
        <QuickAddInput q={q} />
        {q.draft && <DraftCard q={q} lookups={lookups} />}

        {!data ? (
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Skeleton height={76} r={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Skeleton height={76} r={18} />
              </View>
            </View>
            <Skeleton height={140} r={18} />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              <MonthStats totals={totals} data={data} />
            </View>

            <Card padded={false}>
              <Pressable onPress={() => setOpen((o) => !o)} style={styles.filterHead}>
                <Ionicons name="filter" size={20} color={c.text} />
                <Txt size={15} weight={700}>
                  Filtros
                </Txt>
                {active > 0 && <Tag tone="primary">{`${active} ativo${active > 1 ? 's' : ''}`}</Tag>}
                <View style={{ flex: 1 }} />
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.text2} />
              </Pressable>
              {open && (
                <View style={{ padding: space.lg, paddingTop: 0, gap: space.lg }}>
                  <Chips
                    label="CATEGORIA"
                    options={lookups.categories.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.name }))}
                    value={filters.category}
                    onChange={(category) => setFilters((f) => ({ ...f, category }))}
                    allowNone="Todas"
                  />
                  <Chips
                    label="CARTÃO / CONTA"
                    options={lookups.accounts.map((x) => ({ value: x.id, label: x.name }))}
                    value={filters.account}
                    onChange={(account) => setFilters((f) => ({ ...f, account }))}
                    allowNone="Todos"
                  />
                  <Chips
                    label="PESSOA"
                    options={lookups.members.map((x) => ({ value: x.id, label: x.name }))}
                    value={filters.member}
                    onChange={(member) => setFilters((f) => ({ ...f, member }))}
                    allowNone="Todos"
                  />
                  <SwitchFilter value={filters.unpaid} onChange={(unpaid) => setFilters((f) => ({ ...f, unpaid }))} />
                  {(active > 0 || filters.unpaid) && (
                    <Button title="Limpar filtros" variant="outline" size="sm" onPress={() => setFilters(EMPTY_FILTERS)} />
                  )}
                </View>
              )}
            </Card>

            <Segmented
              value={tab}
              onChange={(t) => {
                setTab(t);
                selection.clear();
              }}
              options={[
                { value: 'expenses', label: `Saídas (${view.expenses.length})` },
                { value: 'incomes', label: `Entradas (${view.incomes.length})` },
              ]}
            />
            {tab === 'expenses' && view.expenses.length > 0 && !selecting && (
              <Txt size={13} color={c.text3}>
                {'Toque em "a pagar" para marcar como pago. Segure um lançamento para selecionar vários.'}
              </Txt>
            )}

            <ErrorNote>{error}</ErrorNote>
            <ErrorNote>{paid.error}</ErrorNote>
            {tab === 'expenses' ? (
              view.expenses.length === 0 ? (
                <EmptyState title="Nenhuma saída neste mês" text='Use o campo acima ou toque em "Gasto" para começar.' />
              ) : (
                <>
                  {groups.map((g) => (
                    <View key={g.key} style={{ gap: space.sm }}>
                      <SectionTitle
                        right={
                          <Txt size={13} weight={700} color={c.text2} numeric>
                            {formatMoney(g.cents)}
                          </Txt>
                        }>
                        {g.title}
                      </SectionTitle>
                      <View style={[styles.grp, { backgroundColor: c.surface, borderColor: g.accent ? c.primary : c.line }]}>
                        {g.items.map((e, i) => (
                          <View key={e.id}>{expenseRow(e, i === 0, true)}</View>
                        ))}
                      </View>
                    </View>
                  ))}
                  {groups.length > 0 && view.expenseDays.length > 0 && (
                    <View style={{ paddingTop: space.xs }}>
                      <SectionTitle>Lançamentos avulsos</SectionTitle>
                    </View>
                  )}
                  <DayList days={view.expenseDays} render={expenseRow} />
                </>
              )
            ) : view.incomeDays.length === 0 ? (
              <EmptyState icon="arrow-down" title="Nenhuma entrada neste mês" text='Toque em "Entrada" para lançar.' />
            ) : (
              <DayList days={view.incomeDays} render={incomeRow} />
            )}
          </>
        )}
      </Screen>
      {selecting ? (
        <View style={styles.bulkFloat}>
          <BulkBar
            floating
            count={selection.selected.size}
            cents={selectedCents}
            busy={paid.busy}
            onClear={selection.clear}
            onPaid={async () => {
              await paid.setPaid([...selection.selected], true);
              selection.clear();
            }}
            onUnpaid={async () => {
              await paid.setPaid([...selection.selected], false);
              selection.clear();
            }}
          />
        </View>
      ) : (
        <View style={styles.fabs}>
          <Pressable onPress={() => actions.newIncome()} style={[styles.fab, { backgroundColor: c.surface, borderColor: c.line }, shadow(c)]}>
            <Ionicons name="arrow-down" size={18} color={c.text} />
            <Txt size={15} weight={700}>
              Entrada
            </Txt>
          </Pressable>
          <Pressable onPress={() => actions.newExpense()} style={[styles.fab, { backgroundColor: c.primary, borderColor: c.primary }, shadow(c)]}>
            <Ionicons name="add" size={20} color={c.onPrimary} />
            <Txt size={15} weight={700} color={c.onPrimary}>
              Gasto
            </Txt>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SwitchFilter({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Chips
      label="STATUS"
      options={[{ value: 'unpaid', label: 'Só a pagar' }]}
      value={value ? 'unpaid' : null}
      onChange={(v) => onChange(v === 'unpaid')}
      allowNone="Todos"
    />
  );
}

const EXPENSE_COLUMNS: Column[] = [
  { key: 'select', label: '', width: 28 },
  { key: 'date', label: 'Data', width: 52 },
  { key: 'description', label: 'Descrição', flex: 3 },
  { key: 'status', label: 'Status', width: 96 },
  { key: 'amount', label: 'Valor', flex: 1, align: 'right' },
];

const INCOME_COLUMNS: Column[] = [
  { key: 'date', label: 'Data', width: 52 },
  { key: 'description', label: 'Descrição', flex: 2 },
  { key: 'amount', label: 'Valor', flex: 1, align: 'right' },
];

function ColumnHeader({ title, count, cents, tone }: { title: string; count: number; cents: number; tone?: 'income' }) {
  const c = useColors();
  return (
    <View style={styles.between}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <Txt size={20} weight={700}>
          {title}
        </Txt>
        <Txt size={13} color={c.text3}>
          {count} {count === 1 ? 'lançamento' : 'lançamentos'}
        </Txt>
      </View>
      <Txt size={18} weight={800} numeric color={tone === 'income' ? c.ok : c.text}>
        {tone === 'income' ? '+' : ''}
        {formatMoney(cents)}
      </Txt>
    </View>
  );
}

function SkeletonRows({ columns }: { columns: Column[] }) {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <Row
          key={i}
          columns={columns}
          cells={Object.fromEntries(columns.map((col) => [col.key, col.key === 'select' ? null : <Skeleton key={col.key} height={12} width="70%" />]))}
        />
      ))}
    </>
  );
}

export function DesktopEntries() {
  const c = useColors();
  const { lookups, month } = useAppData();
  const desktop = useDesktop();
  const actions = useEntryActions();
  const { data, error } = useRemote<MonthEntries>(`/entries?month=${month}`);
  const q = useQuickAdd();
  const paid = usePaidActions();
  const selection = useSelection();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const view = useFilteredEntries(data, filters);
  const totals = useFilteredEntries(data, EMPTY_FILTERS);
  const filtering = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const loading = !data && !error;
  const visibleIds = view.expenses.map((e) => e.id);
  const selectedIds = visibleIds.filter((id) => selection.has(id));
  const allSelected = visibleIds.length > 0 && selectedIds.length === visibleIds.length;
  const selectedCents = view.expenses.filter((e) => selection.has(e.id)).reduce((s, e) => s + e.amountCents, 0);

  const bulk = async (value: boolean) => {
    await paid.setPaid(selectedIds, value);
    selection.clear();
  };

  const footer = (
    <>
      <Txt size={13} weight={600} color={c.text2}>
        Total filtrado · {filtering ? 'com filtros' : 'sem filtros'}
      </Txt>
      <Txt size={14} weight={600}>
        Entradas <Txt size={14} weight={700} color={c.ok}>{`+${formatMoney(view.incomeCents)}`}</Txt>
      </Txt>
      <Txt size={14} weight={600}>
        Gastos <Txt size={14} weight={700}>{formatMoney(view.expenseCents)}</Txt>
      </Txt>
      <Txt size={14} weight={600}>
        Saldo{' '}
        <Txt size={14} weight={700} color={view.incomeCents - view.expenseCents < 0 ? c.err : c.ok}>
          {formatMoney(view.incomeCents - view.expenseCents)}
        </Txt>
      </Txt>
    </>
  );

  const groups = [
    { key: 'installments', title: 'Parcelamentos do mês', items: view.installments, cents: view.installmentCents, accent: true, one: 'parcela', many: 'parcelas' },
    { key: 'recurring', title: 'Recorrentes', items: view.recurring, cents: view.recurringCents, accent: false, one: 'lançamento', many: 'lançamentos' },
  ].filter((g) => g.items.length > 0);

  const expenseRow = (e: Expense, known: Lookups) => (
    <Row
      key={e.id}
      columns={EXPENSE_COLUMNS}
      selected={desktop?.selectedId === e.id || selection.has(e.id)}
      onPress={() => actions.editExpense(e.id)}
      cells={{
        select: <Checkbox checked={selection.has(e.id)} onPress={() => selection.toggle(e.id)} label={`Selecionar ${e.description}`} />,
        date: (
          <Txt size={14} color={c.text2}>
            {formatShortDate(e.spentOn)}
          </Txt>
        ),
        description: (
          <View style={{ gap: 2, width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Txt size={14} weight={700} numberOfLines={1}>
                {e.description}
              </Txt>
              <ExpenseMarks expense={e} />
            </View>
            <Txt size={12} color={c.text3} numberOfLines={1}>
              {expenseSubtitle(e, known)}
            </Txt>
          </View>
        ),
        status: <PaidToggle paid={e.paid} disabled={paid.busy} onPress={() => paid.setPaid([e.id], !e.paid)} />,
        amount: (
          <Txt size={15} weight={700} numeric>
            {formatMoney(e.amountCents)}
          </Txt>
        ),
      }}
    />
  );

  const selectAllRow =
    visibleIds.length > 0 && lookups ? (
      <View style={[styles.selectAll, { borderTopColor: c.line }]}>
        <Checkbox
          checked={allSelected}
          onPress={() => (allSelected ? selection.clear() : selection.setAll(visibleIds))}
          label="Selecionar todas as saídas"
        />
        <Txt size={13} color={c.text2}>
          {allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
        </Txt>
      </View>
    ) : null;

  return (
    <DesktopPage title="Lançamentos" footer={footer}>
      <QuickAddInput q={q} wide />
      {q.draft && lookups && <DraftCard q={q} lookups={lookups} wide />}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {loading ? (
          [0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ flex: 1, minWidth: 150 }}>
              <Skeleton height={80} r={18} />
            </View>
          ))
        ) : (
          <>
            <MonthStats totals={totals} data={data} />
          </>
        )}
      </View>

      {lookups && (
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center', zIndex: 10 }}>
          <Select
            label="Categoria"
            allLabel="Todas"
            value={filters.category}
            onChange={(v) => set('category', v)}
            options={lookups.categories.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.name }))}
          />
          <Select label="Cartão" allLabel="Todos" value={filters.account} onChange={(v) => set('account', v)} options={lookups.accounts.map((x) => ({ value: x.id, label: x.name }))} />
          <Select label="Pessoa" allLabel="Todas" value={filters.member} onChange={(v) => set('member', v)} options={lookups.members.map((x) => ({ value: x.id, label: x.name }))} />
          <Select label="Forma" allLabel="Todas" value={filters.method} onChange={(v) => set('method', v)} options={PAYMENT_METHODS} />
          <ToggleChip label="Só a pagar" value={filters.unpaid} onChange={(v) => set('unpaid', v)} />
          <SearchField value={filters.search} onChange={(v) => set('search', v)} />
          {filtering && <Button title="Limpar filtros" variant="outline" size="sm" onPress={() => setFilters(EMPTY_FILTERS)} />}
        </View>
      )}

      <ErrorNote>{error}</ErrorNote>
      <ErrorNote>{paid.error}</ErrorNote>

      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' }}>
        <View style={{ flex: 1.8, minWidth: 0, gap: space.md }}>
          <ColumnHeader title="Saídas" count={view.expenses.length} cents={view.expenseCents} />
          {selectedIds.length > 0 && (
            <BulkBar
              count={selectedIds.length}
              cents={selectedCents}
              busy={paid.busy}
              onClear={selection.clear}
              onPaid={() => bulk(true)}
              onUnpaid={() => bulk(false)}
            />
          )}
          {lookups &&
            groups.map((g, i) => (
              <View key={g.key} style={{ gap: space.md }}>
                <View style={styles.between}>
                  <Txt size={17} weight={700}>
                    {g.title}
                  </Txt>
                  <Txt size={13} weight={700} color={c.text2} numeric>
                    {`${g.items.length} ${g.items.length === 1 ? g.one : g.many} · ${formatMoney(g.cents)}`}
                  </Txt>
                </View>
                <Table columns={EXPENSE_COLUMNS} accent={g.accent}>
                  {i === 0 && selectAllRow}
                  {g.items.map((e) => expenseRow(e, lookups))}
                </Table>
              </View>
            ))}
          {lookups && groups.length > 0 && view.expenseDays.length > 0 && (
            <Txt size={17} weight={700} style={{ marginTop: space.xs }}>
              Lançamentos avulsos
            </Txt>
          )}
          {(loading || !lookups || groups.length === 0 || view.expenseDays.length > 0) && (
            <Table columns={EXPENSE_COLUMNS}>
              {groups.length === 0 && selectAllRow}
              {loading || !lookups ? (
                <SkeletonRows columns={EXPENSE_COLUMNS} />
              ) : view.expenses.length === 0 ? (
                <EmptyState title="Nenhuma saída" text={filtering ? 'Nenhum resultado para esses filtros.' : 'Use o campo de IA ou o botão "Gasto".'} />
              ) : (
                view.expenseDays.map(([day, items]) => (
                  <View key={day}>
                    <GroupRow>{formatDayHeader(day)}</GroupRow>
                    {items.map((e) => expenseRow(e, lookups))}
                  </View>
                ))
              )}
            </Table>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: space.md }}>
          <ColumnHeader title="Entradas" count={view.incomes.length} cents={view.incomeCents} tone="income" />
          <Table columns={INCOME_COLUMNS}>
            {loading || !lookups ? (
              <SkeletonRows columns={INCOME_COLUMNS} />
            ) : view.incomeDays.length === 0 ? (
              <EmptyState icon="arrow-down" title="Nenhuma entrada" text={filtering ? 'Filtros de gasto escondem as entradas.' : 'Use o botão "Entrada".'} />
            ) : (
              view.incomeDays.map(([day, items]) => (
                <View key={day}>
                  <GroupRow>{formatDayHeader(day)}</GroupRow>
                  {items.map((i) => (
                    <Row
                      key={i.id}
                      columns={INCOME_COLUMNS}
                      selected={desktop?.selectedId === i.id}
                      onPress={() => actions.editIncome(i.id)}
                      cells={{
                        date: (
                          <Txt size={14} color={c.text2}>
                            {formatShortDate(i.receivedOn)}
                          </Txt>
                        ),
                        description: (
                          <View style={{ gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Txt size={14} weight={700} numberOfLines={1}>
                                {i.description}
                              </Txt>
                              {i.recurringIncomeId ? <Ionicons name="repeat" size={14} color={c.text3} /> : null}
                            </View>
                            <Txt size={12} color={c.text3}>
                              {nameOf(lookups.members, i.memberId) || 'Casa'}
                            </Txt>
                          </View>
                        ),
                        amount: (
                          <Txt size={15} weight={700} numeric color={c.ok}>
                            +{formatMoney(i.amountCents)}
                          </Txt>
                        ),
                      }}
                    />
                  ))}
                </View>
              ))
            )}
          </Table>
        </View>
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  quickInput: {
    minHeight: 64,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: fonts[500],
  },
  send: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  parsing: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  draftGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  filterHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingHorizontal: space.lg },
  grp: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  li: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14 },
  fabs: { position: 'absolute', right: space.lg, bottom: space.lg, flexDirection: 'row', gap: 10 },
  fab: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 52, borderRadius: 26, paddingHorizontal: 20, borderWidth: 1.5 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  bulk: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingLeft: space.lg, borderRadius: radius.lg, borderWidth: 1.5 },
  bulkFloat: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10, borderTopWidth: 0 },
});
