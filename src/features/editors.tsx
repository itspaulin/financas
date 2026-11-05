import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useConfirm } from '@/components/confirm';
import { ExpenseForm, type FormLayout, IncomeForm } from '@/components/entry-forms';
import { Button, Card, Chips, ErrorNote, Field, Note, PaidToggle, SectionTitle, Spinner, Tag, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppData, useRemote } from '@/lib/data';
import { formatDate, formatMoney, formatMonth } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import { monthOf, monthStart, today } from '@/shared/dates';
import { type Draft, type Expense, type Income, type InstallmentPlan, type Lookups, PAYMENT_METHODS, type PaymentMethod } from '@/shared/types';

type EditorProps = {
  layout: FormLayout;
  header?: ReactNode;
  onDone: () => void;
  onCancel?: () => void;
  onOpenPlan?: (planId: string) => void;
};

export function NewExpense({ draft, startInstallments, ...props }: EditorProps & { draft: Draft | null; startInstallments?: boolean }) {
  const { lookups, changed } = useAppData();
  if (!lookups) return <Spinner />;
  return (
    <ExpenseForm
      lookups={lookups}
      mode="create"
      highlightMissing={Boolean(draft)}
      layout={props.layout}
      header={props.header}
      onCancel={props.onCancel}
      initial={{
        description: draft?.description ?? '',
        amountCents: draft?.amountCents ?? null,
        spentOn: draft?.date ?? today(),
        categoryId: draft?.categoryId ?? null,
        paymentMethod: draft?.paymentMethod ?? null,
        accountId: draft?.accountId ?? null,
        memberId: draft?.memberId ?? lookups.me.id,
        paid: false,
        installments: draft?.installments ?? (startInstallments ? 2 : null),
        recurring: false,
      }}
      onSubmit={async (values) => {
        await api('/expenses', { method: 'POST', body: { ...values, rawText: draft?.rawText ?? null } });
        changed();
        props.onDone();
      }}
    />
  );
}

export function EditExpense({ id, ...props }: EditorProps & { id: string }) {
  const c = useColors();
  const ask = useConfirm();
  const { lookups, changed } = useAppData();
  const { data: expense, error } = useRemote<Expense>(`/expenses/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <View style={{ padding: space.lg }}><ErrorNote>{error}</ErrorNote></View>;
  if (!lookups || !expense) return <Spinner />;

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      changed();
      props.onDone();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro');
    }
  };

  const top = expense.installmentPlanId ? (
    <Pressable onPress={() => props.onOpenPlan?.(expense.installmentPlanId!)}>
      <Card tone="primary">
        <Txt size={14} weight={700} color={c.primaryText}>
          Parcela {expense.installmentNumber}/{expense.installmentsCount}
          {expense.purchasedOn ? ` · Compra em ${formatDate(expense.purchasedOn)}` : ''}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Txt size={14} weight={700} color={c.primaryText}>
            Ver parcelamento e quitar
          </Txt>
          <Ionicons name="chevron-forward" size={16} color={c.primaryText} />
        </View>
      </Card>
    </Pressable>
  ) : null;

  const bottom = (
    <View style={{ gap: 10 }}>
      <ErrorNote>{actionError}</ErrorNote>
      {expense.recurringExpenseId && (
        <Button
          title="Parar recorrência"
          variant="outline"
          icon="repeat"
          onPress={async () => {
            if (await ask({ title: 'Parar recorrência?', message: 'Este mês fica; os próximos deixam de ser gerados.', action: 'Parar' })) {
              await run(() => api(`/expenses/${expense.id}/stop-recurring`, { method: 'POST' }));
            }
          }}
        />
      )}
      <Button
        title="Apagar"
        variant="danger"
        icon="trash-outline"
        onPress={async () => {
          if (await ask({ title: 'Apagar gasto?', message: `"${expense.description}" será apagado.`, action: 'Apagar' })) {
            await run(() => api(`/expenses/${expense.id}`, { method: 'DELETE' }));
          }
        }}
      />
    </View>
  );

  return (
    <ExpenseForm
      key={expense.id}
      lookups={lookups}
      mode="edit"
      layout={props.layout}
      header={props.header}
      onCancel={props.onCancel}
      top={top}
      bottom={bottom}
      isRecurring={Boolean(expense.recurringExpenseId)}
      recurrenceContinues={expense.recurrenceContinues}
      canBeRecurring={!expense.recurringExpenseId && !expense.installmentPlanId}
      initial={{
        description: expense.description,
        amountCents: expense.amountCents,
        spentOn: expense.spentOn,
        categoryId: expense.categoryId,
        paymentMethod: expense.paymentMethod,
        accountId: expense.accountId,
        memberId: expense.memberId,
        paid: expense.paid,
        installments: null,
        recurring: false,
      }}
      onSubmit={async (values) => {
        await api(`/expenses/${expense.id}`, { method: 'PATCH', body: values });
        changed();
        props.onDone();
      }}
    />
  );
}

export function NewIncome({ draft, ...props }: EditorProps & { draft: Draft | null }) {
  const c = useColors();
  const { lookups, changed } = useAppData();
  if (!lookups) return <Spinner />;
  return (
    <IncomeForm
      lookups={lookups}
      mode="create"
      layout={props.layout}
      header={props.header}
      onCancel={props.onCancel}
      bottom={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Ionicons name="information-circle-outline" size={16} color={c.text3} />
          <Txt size={13} color={c.text3} style={{ flex: 1 }}>
            O valor se repete nos próximos meses e pode ser editado quando mudar.
          </Txt>
        </View>
      }
      initial={{
        description: draft?.description ?? '',
        amountCents: draft?.amountCents ?? null,
        receivedOn: draft?.date ?? today(),
        memberId: draft?.memberId ?? lookups.me.id,
        recurring: false,
      }}
      onSubmit={async (values) => {
        await api('/incomes', { method: 'POST', body: values });
        changed();
        props.onDone();
      }}
    />
  );
}

export function EditIncome({ id, ...props }: EditorProps & { id: string }) {
  const ask = useConfirm();
  const { lookups, changed } = useAppData();
  const { data: income, error } = useRemote<Income>(`/incomes/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <View style={{ padding: space.lg }}><ErrorNote>{error}</ErrorNote></View>;
  if (!lookups || !income) return <Spinner />;

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      changed();
      props.onDone();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro');
    }
  };

  return (
    <IncomeForm
      key={income.id}
      lookups={lookups}
      mode="edit"
      layout={props.layout}
      header={props.header}
      onCancel={props.onCancel}
      isRecurring={Boolean(income.recurringIncomeId)}
      recurrenceContinues={income.recurrenceContinues}
      canBeRecurring={!income.recurringIncomeId}
      initial={{
        description: income.description,
        amountCents: income.amountCents,
        receivedOn: income.receivedOn,
        memberId: income.memberId,
        recurring: false,
      }}
      bottom={
        <View style={{ gap: 10 }}>
          <ErrorNote>{actionError}</ErrorNote>
          {income.recurringIncomeId && (
            <Button
              title="Parar recorrência"
              variant="outline"
              icon="repeat"
              onPress={async () => {
                if (await ask({ title: 'Parar recorrência?', message: 'Este mês fica; os próximos deixam de ser gerados.', action: 'Parar' })) {
                  await run(() => api(`/incomes/${income.id}/stop-recurring`, { method: 'POST' }));
                }
              }}
            />
          )}
          <Button
            title="Apagar"
            variant="danger"
            icon="trash-outline"
            onPress={async () => {
              if (await ask({ title: 'Apagar entrada?', message: `"${income.description}" será apagada.`, action: 'Apagar' })) {
                await run(() => api(`/incomes/${income.id}`, { method: 'DELETE' }));
              }
            }}
          />
        </View>
      }
      onSubmit={async (values) => {
        await api(`/incomes/${income.id}`, { method: 'PATCH', body: values });
        changed();
        props.onDone();
      }}
    />
  );
}

function PlanEditCard({ plan, lookups, onError }: { plan: InstallmentPlan; lookups: Lookups; onError: (message: string | null) => void }) {
  const c = useColors();
  const { changed } = useAppData();
  const [v, setV] = useState({
    description: plan.description,
    categoryId: plan.categoryId,
    paymentMethod: plan.paymentMethod,
    accountId: plan.accountId,
    memberId: plan.memberId,
  });
  const [saving, setSaving] = useState(false);
  const dirty = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== plan[k]) && v.description.trim().length > 0;
  const save = async () => {
    setSaving(true);
    onError(null);
    try {
      await api(`/installments/${plan.id}`, { method: 'PATCH', body: { ...v, description: v.description.trim() } });
      changed();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card style={{ gap: space.md }}>
      <Field label="Descrição" value={v.description} onChangeText={(description) => setV((s) => ({ ...s, description }))} />
      <Chips
        label="Categoria"
        options={lookups.categories.filter((x) => !x.archived || x.id === v.categoryId).map((x) => ({ value: x.id, label: x.name }))}
        value={v.categoryId}
        onChange={(categoryId) => categoryId && setV((s) => ({ ...s, categoryId }))}
      />
      <Chips
        label="Forma de pagamento"
        options={PAYMENT_METHODS}
        value={v.paymentMethod}
        onChange={(paymentMethod: PaymentMethod | null) => paymentMethod && setV((s) => ({ ...s, paymentMethod }))}
      />
      <Chips
        label="Cartão / conta"
        options={lookups.accounts.filter((x) => !x.archived || x.id === v.accountId).map((x) => ({ value: x.id, label: x.name }))}
        value={v.accountId}
        onChange={(accountId) => setV((s) => ({ ...s, accountId }))}
        allowNone="Nenhum"
      />
      <Chips
        label="Quem gastou"
        options={lookups.members.map((x) => ({ value: x.id, label: x.name }))}
        value={v.memberId}
        onChange={(memberId) => memberId && setV((s) => ({ ...s, memberId }))}
      />
      <Txt size={13} color={c.text3}>
        Vale para todas as parcelas. Os meses em que elas caem não mudam.
      </Txt>
      {dirty && <Button title="Salvar alterações" onPress={save} loading={saving} full />}
    </Card>
  );
}

export function PlanDetail({ id, layout, header, onDone }: { id: string; layout: FormLayout; header?: ReactNode; onDone?: () => void }) {
  const c = useColors();
  const ask = useConfirm();
  const { lookups, changed } = useAppData();
  const { data: plan, error } = useRemote<InstallmentPlan>(`/installments/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <View style={{ padding: space.lg }}><ErrorNote>{error}</ErrorNote></View>;
  if (!plan || !lookups) return <Spinner />;

  const thisMonth = monthStart(monthOf(today()));
  // The current installment is the latest one already billed (this month or before).
  const current = [...plan.installments].reverse().find((i) => i.billingMonth <= thisMonth) ?? plan.installments[0];
  const remaining = plan.installments.filter((i) => current && i.number > current.number);
  const remainingCents = remaining.reduce((s, i) => s + i.amountCents, 0);
  const paidCount = plan.installments.filter((i) => i.paid).length;
  const category = lookups.categories.find((x) => x.id === plan.categoryId)?.name;
  const account = lookups.accounts.find((x) => x.id === plan.accountId)?.name;
  const canSettle = !plan.settledOn && remaining.length > 0 && current;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      changed();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (!current) return;
    const first = current.number + 1;
    const ok = await ask({
      title: `Quitar na parcela ${current.number}?`,
      message: `As parcelas ${first}/${plan.installmentsCount} a ${plan.installmentsCount}/${plan.installmentsCount} (${formatMoney(remainingCents)}) serão apagadas. Essa ação não pode ser desfeita.`,
      action: `Quitar e apagar ${remaining.length} parcela${remaining.length > 1 ? 's' : ''}`,
    });
    if (!ok) return;
    await run(() => api(`/installments/${plan.id}/settle`, { method: 'POST', body: { lastNumber: current.number } }));
  };

  const remove = async () => {
    const ok = await ask({
      title: 'Apagar parcelamento?',
      message: `"${plan.description}" e as ${plan.installments.length} parcelas (inclusive as pagas) serão apagadas. Essa ação não pode ser desfeita.`,
      action: 'Apagar parcelamento',
      danger: true,
    });
    if (ok && (await run(() => api(`/installments/${plan.id}`, { method: 'DELETE' })))) onDone?.();
  };

  const lastKept = plan.installments.at(-1)?.number ?? 0;

  const body = (
    <>
      <Card style={{ gap: space.sm }}>
        <Txt size={28} weight={800}>
          {plan.description}
        </Txt>
        <Txt size={14} color={c.text2}>
          {plan.installments.length}x · total {formatMoney(plan.totalCents)} · compra em {formatDate(plan.purchasedOn)}
        </Txt>
        <Txt size={14} color={c.text2}>
          {paidCount} de {plan.installments.length} parcelas pagas
        </Txt>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {category && <Tag>{category}</Tag>}
          {account && <Tag>{account}</Tag>}
        </View>
        {plan.settledOn && <Note tone="ok">Quitado em {formatDate(plan.settledOn)}</Note>}
      </Card>

      <SectionTitle>Parcelas</SectionTitle>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>
        {plan.installments.map((i, index) => {
          const isCurrent = i.number === current?.number;
          return (
            <View
              key={i.id}
              style={[
                styles.row,
                index > 0 && { borderTopWidth: 1, borderTopColor: c.line },
                isCurrent && { backgroundColor: c.primaryBg },
              ]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={15} weight={700}>
                    Parcela {i.number}/{plan.installmentsCount}
                  </Txt>
                  {isCurrent && (
                    <Txt size={12} weight={700} color={c.primaryText}>
                      atual
                    </Txt>
                  )}
                </View>
                <Txt size={13} color={c.text3}>
                  {formatMonth(i.billingMonth.slice(0, 7))} · {formatDate(i.spentOn)}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Txt size={16} weight={700} numeric>
                  {formatMoney(i.amountCents)}
                </Txt>
                <PaidToggle
                  paid={i.paid}
                  disabled={busy}
                  onPress={() => run(() => api('/expenses/paid', { method: 'POST', body: { ids: [i.id], paid: !i.paid } }))}
                />
              </View>
            </View>
          );
        })}
      </View>

      {plan.settledOn && lastKept < plan.installmentsCount && (
        <Note tone="primary">
          As parcelas {lastKept + 1}/{plan.installmentsCount} a {plan.installmentsCount}/{plan.installmentsCount} foram removidas ao quitar.
        </Note>
      )}

      {canSettle && (
        <Card padded={false}>
          <View style={[styles.row, { minHeight: 52 }]}>
            <Txt size={15} color={c.text2} style={{ flex: 1 }}>
              Parcela atual
            </Txt>
            <Txt size={16} weight={700}>
              {current.number}/{plan.installmentsCount}
            </Txt>
          </View>
          <View style={[styles.row, { minHeight: 52, borderTopWidth: 1, borderTopColor: c.line }]}>
            <Txt size={15} color={c.text2} style={{ flex: 1 }}>
              Faltam {remaining.length}
            </Txt>
            <Txt size={16} weight={700} numeric>
              {formatMoney(remainingCents)}
            </Txt>
          </View>
        </Card>
      )}

      <SectionTitle>Editar parcelamento</SectionTitle>
      <PlanEditCard key={`${plan.description}-${plan.categoryId}-${plan.accountId}-${plan.memberId}-${plan.paymentMethod}`} plan={plan} lookups={lookups} onError={setActionError} />
      <ErrorNote>{actionError}</ErrorNote>
      <Button title="Apagar parcelamento" variant="danger" icon="trash-outline" onPress={remove} disabled={busy} full />
    </>
  );

  const action = canSettle ? <Button title={`Quitar na parcela ${current.number}`} onPress={settle} loading={busy} full /> : null;

  if (layout === 'drawer') {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>{body}</ScrollView>
        {action && <View style={[styles.footer, { borderTopColor: c.line }]}>{action}</View>}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 32 }}>
        {body}
        {action}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14 },
  footer: { padding: space.lg, paddingHorizontal: space.xl, borderTopWidth: 1 },
});
