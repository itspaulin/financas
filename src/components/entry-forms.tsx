import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { formatMoney, formatMonth } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import { billingMonth } from '@/shared/billing';
import { type Lookups, PAYMENT_METHODS, type PaymentMethod } from '@/shared/types';

import { Button, Chips, DateField, ErrorNote, Field, MoneyField, Note, Screen, SwitchRow } from './ui';

export type FormLayout = 'screen' | 'drawer';

function FormShell({
  layout,
  header,
  children,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  layout: FormLayout;
  header?: ReactNode;
  children: ReactNode;
  submitLabel: string;
  saving: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const c = useColors();
  if (layout === 'screen') {
    return (
      <>
        {header}
        <Screen edges={['bottom']} footer={<Button title={submitLabel} onPress={onSubmit} loading={saving} full />}>
          {children}
        </Screen>
      </>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={[styles.drawerFooter, { borderTopColor: c.line }]}>
        <View style={{ flex: 1 }}>
          <Button title="Salvar" onPress={onSubmit} loading={saving} full />
        </View>
        {onCancel && <Button title="Cancelar" variant="outline" onPress={onCancel} />}
      </View>
    </View>
  );
}

export type ExpenseValues = {
  description: string;
  amountCents: number | null;
  spentOn: string;
  categoryId: string | null;
  paymentMethod: PaymentMethod | null;
  accountId: string | null;
  memberId: string | null;
  paid: boolean;
  installments: number | null;
  recurring: boolean;
};

export type ExpenseSubmit = {
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
  applyToFuture?: boolean;
};

export function ExpenseForm({
  lookups,
  initial,
  mode,
  layout,
  header,
  top,
  bottom,
  isRecurring,
  recurrenceContinues,
  canBeRecurring,
  highlightMissing,
  onSubmit,
  onCancel,
}: {
  lookups: Lookups;
  initial: ExpenseValues;
  mode: 'create' | 'edit';
  layout: FormLayout;
  header?: ReactNode;
  top?: ReactNode;
  bottom?: ReactNode;
  isRecurring?: boolean;
  recurrenceContinues?: boolean;
  canBeRecurring?: boolean;
  highlightMissing?: boolean;
  onSubmit: (values: ExpenseSubmit) => Promise<void>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [applyToFuture, setApplyToFuture] = useState(recurrenceContinues ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof ExpenseValues>(key: K, value: ExpenseValues[K]) => setV((s) => ({ ...s, [key]: value }));

  const categories = lookups.categories
    .filter((c) => !c.archived || c.id === v.categoryId)
    .map((c) => ({ value: c.id, label: c.name }));
  const accounts = lookups.accounts
    .filter((a) => !a.archived || a.id === v.accountId)
    .map((a) => ({ value: a.id, label: a.name }));
  const members = lookups.members.map((m) => ({ value: m.id, label: m.name }));

  const installments = v.installments ?? 1;
  const closingDay = lookups.accounts.find((a) => a.id === v.accountId)?.closingDay ?? null;
  const invoice = v.paymentMethod === 'credito' && closingDay && !v.recurring && !isRecurring ? billingMonth(v.spentOn, 'credito', closingDay).slice(0, 7) : null;
  const missing = {
    description: !v.description.trim(),
    amount: !v.amountCents,
    category: !v.categoryId,
    method: !v.paymentMethod,
    member: !v.memberId,
  };
  const show = (key: keyof typeof missing) => missing[key] && (tried || Boolean(highlightMissing));

  const submit = async () => {
    setTried(true);
    if (Object.values(missing).some(Boolean)) {
      setError('Preencha os campos destacados');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        description: v.description.trim(),
        amountCents: v.amountCents!,
        spentOn: v.spentOn,
        categoryId: v.categoryId!,
        paymentMethod: v.paymentMethod!,
        accountId: v.accountId,
        memberId: v.memberId!,
        paid: v.paid,
        ...(mode === 'create' && installments > 1 && { installments }),
        ...(mode === 'create' && installments <= 1 && v.recurring && { recurring: true }),
        ...(mode === 'edit' && isRecurring && { applyToFuture }),
        ...(mode === 'edit' && canBeRecurring && v.recurring && { recurring: true }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
      setSaving(false);
    }
  };

  return (
    <FormShell
      layout={layout}
      header={header}
      submitLabel="Salvar"
      saving={saving}
      onSubmit={submit}
      onCancel={onCancel}>
      {top}
      <Field
        label="Descrição"
        value={v.description}
        onChangeText={(t) => set('description', t)}
        placeholder="Ex.: Salgado"
        highlight={tried && missing.description}
        warn={tried && missing.description ? 'Informe uma descrição' : undefined}
      />
      <MoneyField
        label={mode === 'create' && installments > 1 ? 'Valor total' : 'Valor'}
        cents={v.amountCents}
        onChange={(cents) => set('amountCents', cents)}
        highlight={tried && missing.amount}
        warn={tried && missing.amount ? 'Informe o valor' : undefined}
      />
      <DateField label="Data da compra" value={v.spentOn} onChange={(iso) => set('spentOn', iso)} />
      <Chips
        label="Categoria"
        options={categories}
        value={v.categoryId}
        onChange={(id) => set('categoryId', id)}
        highlight={show('category')}
        warn="Escolha uma categoria"
      />
      <Chips
        label="Forma de pagamento"
        options={PAYMENT_METHODS}
        value={v.paymentMethod}
        onChange={(m) => set('paymentMethod', m)}
        highlight={show('method')}
        warn="Escolha a forma de pagamento"
      />
      <Chips label="Cartão / conta" options={accounts} value={v.accountId} onChange={(id) => set('accountId', id)} allowNone="Nenhum" />
      {invoice && (
        <Note icon="card-outline">
          {`Entra na fatura que fecha em ${formatMonth(invoice).toLowerCase()} (cartão fecha dia ${closingDay}).`}
        </Note>
      )}
      <Chips
        label="Quem gastou"
        options={members}
        value={v.memberId}
        onChange={(id) => set('memberId', id)}
        highlight={show('member')}
        warn="Escolha quem gastou"
      />
      <SwitchRow label="Já foi pago" value={v.paid} onChange={(p) => set('paid', p)} />

      {mode === 'create' && (
        <>
          <Field
            label="Parcelas"
            value={v.installments ? String(v.installments) : ''}
            placeholder="1 (à vista)"
            keyboardType="number-pad"
            inputMode="numeric"
            hint={
              installments > 1 && v.amountCents
                ? `${installments}x de ${formatMoney(Math.floor(v.amountCents / installments))} · uma parcela por mês`
                : undefined
            }
            onChangeText={(t) => {
              const n = Number(t.replace(/\D/g, '').slice(0, 3));
              set('installments', n > 0 ? Math.min(n, 120) : null);
            }}
          />
          {installments <= 1 && (
            <SwitchRow label="Recorrente" hint="Repete todo mês" value={v.recurring} onChange={(r) => set('recurring', r)} />
          )}
        </>
      )}
      {mode === 'edit' && isRecurring && (
        <SwitchRow
          label="Aplicar aos próximos meses"
          hint={applyToFuture ? 'Repete todo mês; as edições valem para os próximos' : 'Desligado: remove os próximos meses'}
          value={applyToFuture}
          onChange={setApplyToFuture}
        />
      )}
      {mode === 'edit' && canBeRecurring && (
        <SwitchRow label="Lançamento recorrente" hint="Repete todo mês e vai para Recorrentes" value={v.recurring} onChange={(r) => set('recurring', r)} />
      )}
      {bottom}
      <ErrorNote>{error}</ErrorNote>
    </FormShell>
  );
}

export type IncomeValues = {
  description: string;
  amountCents: number | null;
  receivedOn: string;
  memberId: string | null;
  recurring: boolean;
};

export type IncomeSubmit = {
  description: string;
  amountCents: number;
  receivedOn: string;
  memberId: string | null;
  recurring?: boolean;
  applyToFuture?: boolean;
};

export function IncomeForm({
  lookups,
  initial,
  mode,
  layout,
  header,
  top,
  bottom,
  isRecurring,
  recurrenceContinues,
  canBeRecurring,
  onSubmit,
  onCancel,
}: {
  lookups: Lookups;
  initial: IncomeValues;
  mode: 'create' | 'edit';
  layout: FormLayout;
  header?: ReactNode;
  top?: ReactNode;
  bottom?: ReactNode;
  isRecurring?: boolean;
  recurrenceContinues?: boolean;
  canBeRecurring?: boolean;
  onSubmit: (values: IncomeSubmit) => Promise<void>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [applyToFuture, setApplyToFuture] = useState(recurrenceContinues ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof IncomeValues>(key: K, value: IncomeValues[K]) => setV((s) => ({ ...s, [key]: value }));

  const submit = async () => {
    setTried(true);
    if (!v.description.trim() || !v.amountCents) {
      setError('Preencha descrição e valor');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        description: v.description.trim(),
        amountCents: v.amountCents,
        receivedOn: v.receivedOn,
        memberId: v.memberId,
        ...(mode === 'create' && v.recurring && { recurring: true }),
        ...(mode === 'edit' && isRecurring && { applyToFuture }),
        ...(mode === 'edit' && canBeRecurring && v.recurring && { recurring: true }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
      setSaving(false);
    }
  };

  return (
    <FormShell
      layout={layout}
      header={header}
      submitLabel={mode === 'create' ? 'Salvar entrada' : 'Salvar'}
      saving={saving}
      onSubmit={submit}
      onCancel={onCancel}>
      {top}
      <Field
        label="Descrição"
        value={v.description}
        onChangeText={(t) => set('description', t)}
        placeholder="Ex.: Salário"
        highlight={tried && !v.description.trim()}
        warn={tried && !v.description.trim() ? 'Informe uma descrição' : undefined}
      />
      <MoneyField
        label="Valor"
        cents={v.amountCents}
        onChange={(cents) => set('amountCents', cents)}
        highlight={tried && !v.amountCents}
        warn={tried && !v.amountCents ? 'Informe o valor' : undefined}
      />
      <DateField label="Data" value={v.receivedOn} onChange={(iso) => set('receivedOn', iso)} />
      <Chips
        label="Quem recebeu"
        options={lookups.members.map((m) => ({ value: m.id, label: m.name }))}
        value={v.memberId}
        onChange={(id) => set('memberId', id)}
        allowNone="Casa"
      />
      {mode === 'create' && (
        <SwitchRow label="Recorrente" hint="Repete todo mês" value={v.recurring} onChange={(r) => set('recurring', r)} />
      )}
      {mode === 'edit' && isRecurring && (
        <SwitchRow
          label="Aplicar aos próximos meses"
          hint={applyToFuture ? 'Repete todo mês; as edições valem para os próximos' : 'Desligado: remove os próximos meses'}
          value={applyToFuture}
          onChange={setApplyToFuture}
        />
      )}
      {mode === 'edit' && canBeRecurring && (
        <SwitchRow label="Entrada recorrente" hint="Repete todo mês" value={v.recurring} onChange={(r) => set('recurring', r)} />
      )}
      {bottom}
      <ErrorNote>{error}</ErrorNote>
    </FormShell>
  );
}

const styles = StyleSheet.create({
  drawerFooter: { flexDirection: 'row', gap: space.sm, padding: space.lg, paddingHorizontal: space.xl, borderTopWidth: 1 },
});
