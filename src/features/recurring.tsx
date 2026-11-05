import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useConfirm } from '@/components/confirm';
import { Button, ErrorNote, MoneyField, MonthSwitcher, Screen, SectionTitle, Skeleton, Tag, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppData, useRemote } from '@/lib/data';
import { formatMoney, formatMonth } from '@/lib/format';
import { radius, space, useColors, useIsDesktop } from '@/lib/theme';
import { addMonths, monthOf, today } from '@/shared/dates';
import { type Lookups, PAYMENT_METHODS, type Recurring } from '@/shared/types';

import { type Column, Row, Table } from './desktop/controls';
import { DesktopPage } from './desktop/shell';

const COLUMNS: Column[] = [
  { key: 'description', label: 'Descrição', flex: 1.4 },
  { key: 'amount', label: 'Valor', flex: 1.2, align: 'right' },
  { key: 'day', label: 'Dia', width: 64 },
  { key: 'detail', label: 'Categoria · cartão', flex: 2 },
  { key: 'member', label: 'Quem', flex: 0.7 },
  { key: 'status', label: 'Status', flex: 0.8 },
  { key: 'actions', label: 'Ações', flex: 1.6, align: 'right' },
];

function detailOf(r: Recurring, lookups: Lookups) {
  if (r.kind === 'income') return 'Entrada';
  const category = lookups.categories.find((c) => c.id === r.categoryId)?.name;
  const account =
    lookups.accounts.find((a) => a.id === r.accountId)?.name ?? PAYMENT_METHODS.find((m) => m.value === r.paymentMethod)?.label;
  return [category, account].filter(Boolean).join(' · ');
}

function useRecurringActions(reload: () => void) {
  const { changed } = useAppData();
  const ask = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const patch = async (r: Recurring, body: object) => {
    setError(null);
    try {
      await api(`/recurring/${r.kind}/${r.id}`, { method: 'PATCH', body });
      changed();
      reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      return false;
    }
  };
  return {
    error,
    save: (r: Recurring, amountCents: number, startsOn: string) => patch(r, { amountCents, startsOn }),
    async toggle(r: Recurring) {
      if (r.active) {
        const ok = await ask({
          title: `Parar ${r.description}?`,
          message: 'Este mês fica; a partir do próximo mês deixa de ser lançado.',
          action: 'Parar',
        });
        if (!ok) return;
      }
      await patch(r, { active: !r.active });
    },
  };
}

function RecurringTable({
  title,
  items,
  lookups,
  editing,
  setEditing,
  actions,
}: {
  title: string;
  items: Recurring[];
  lookups: Lookups;
  editing: string | null;
  setEditing: (id: string | null) => void;
  actions: ReturnType<typeof useRecurringActions>;
}) {
  const c = useColors();
  const [value, setValue] = useState<number | null>(null);
  const [from, setFrom] = useState(() => monthOf(today()));
  const [saving, setSaving] = useState(false);
  const thisMonth = monthOf(today());
  // The recurrence can start any month from the beginning of the spreadsheet up to two years ahead.
  const firstStart = '2026-01';
  const lastStart = addMonths(thisMonth, 24);
  const shiftFrom = (delta: number) =>
    setFrom((m) => {
      const next = addMonths(m, delta);
      return next < firstStart || next > lastStart ? m : next;
    });
  const active = items.filter((i) => i.active).length;

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.between}>
        <Txt size={20} weight={700}>
          {title}
        </Txt>
        <Txt size={13} color={c.text2}>
          {active} {active === 1 ? 'ativo' : 'ativos'} · {items.length - active} {items.length - active === 1 ? 'parado' : 'parados'}
        </Txt>
      </View>
      <Table columns={COLUMNS}>
        {items.map((r) => {
          const isEditing = editing === r.id;
          return (
            <Row
              key={r.id}
              columns={COLUMNS}
              selected={isEditing}
              cells={{
                description: (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt size={15} weight={700}>
                      {r.description}
                    </Txt>
                    <Ionicons name="repeat" size={14} color={c.text3} />
                  </View>
                ),
                amount: isEditing ? (
                  <View style={{ width: 250, gap: 6, alignItems: 'flex-end' }}>
                    <View style={{ width: 170 }}>
                      <MoneyField cents={value} onChange={setValue} compact />
                    </View>
                    <Txt size={12} color={c.text3}>
                      vale a partir de
                    </Txt>
                    <MonthSwitcher month={from} onShift={shiftFrom} compact />
                  </View>
                ) : (
                  <Txt size={15} weight={700} numeric color={r.kind === 'income' ? c.ok : c.text}>
                    {r.kind === 'income' ? '+' : ''}
                    {formatMoney(r.amountCents)}
                  </Txt>
                ),
                day: (
                  <Txt size={14} color={c.text2}>
                    dia {r.dayOfMonth}
                  </Txt>
                ),
                detail: (
                  <Txt size={14} color={c.text2} numberOfLines={1}>
                    {detailOf(r, lookups)} · desde {formatMonth(r.startsOn.slice(0, 7)).toLowerCase()}
                  </Txt>
                ),
                member: (
                  <Txt size={14} color={c.text2}>
                    {lookups.members.find((m) => m.id === r.memberId)?.name ?? 'Casa'}
                  </Txt>
                ),
                status: r.active ? <Tag tone="ok">ativo</Tag> : <Tag>parado</Tag>,
                actions: isEditing ? (
                  <View style={styles.actions}>
                    <Button
                      title="Salvar"
                      size="sm"
                      loading={saving}
                      disabled={!value}
                      onPress={async () => {
                        if (!value) return;
                        setSaving(true);
                        if (await actions.save(r, value, from)) setEditing(null);
                        setSaving(false);
                      }}
                    />
                    <Button title="Cancelar" size="sm" variant="outline" onPress={() => setEditing(null)} />
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <Button
                      title="Editar valor"
                      size="sm"
                      variant="outline"
                      onPress={() => {
                        setValue(r.amountCents);
                        setFrom(r.startsOn.slice(0, 7));
                        setEditing(r.id);
                      }}
                    />
                    <Button title={r.active ? 'Parar' : 'Retomar'} size="sm" variant="outline" onPress={() => actions.toggle(r)} />
                  </View>
                ),
              }}
            />
          );
        })}
      </Table>
    </View>
  );
}

function MobileRecurringList({ items, lookups, actions }: { items: Recurring[]; lookups: Lookups; actions: ReturnType<typeof useRecurringActions> }) {
  const c = useColors();
  return (
    <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>
      {items.map((r, i) => (
        <View key={r.id} style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
          <View style={{ flex: 1 }}>
            <Txt size={15} weight={700}>
              {r.description}
            </Txt>
            <Txt size={13} color={c.text3}>
              dia {r.dayOfMonth} · {detailOf(r, lookups)}
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Txt size={15} weight={700} numeric color={r.kind === 'income' ? c.ok : c.text}>
              {formatMoney(r.amountCents)}
            </Txt>
            <Button title={r.active ? 'Parar' : 'Retomar'} size="sm" variant="outline" onPress={() => actions.toggle(r)} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function RecurringPage() {
  const desktop = useIsDesktop();
  const { lookups } = useAppData();
  const { data, error, reload } = useRemote<Recurring[]>('/recurring');
  const actions = useRecurringActions(reload);
  const [editing, setEditing] = useState<string | null>(null);
  const expenses = (data ?? []).filter((r) => r.kind === 'expense');
  const incomes = (data ?? []).filter((r) => r.kind === 'income');

  const content =
    !data || !lookups ? (
      <Skeleton height={320} r={18} />
    ) : desktop ? (
      <>
        <RecurringTable title="Gastos recorrentes" items={expenses} lookups={lookups} editing={editing} setEditing={setEditing} actions={actions} />
        <RecurringTable title="Entradas recorrentes" items={incomes} lookups={lookups} editing={editing} setEditing={setEditing} actions={actions} />
      </>
    ) : (
      <>
        <SectionTitle>Gastos recorrentes</SectionTitle>
        <MobileRecurringList items={expenses} lookups={lookups} actions={actions} />
        <SectionTitle>Entradas recorrentes</SectionTitle>
        <MobileRecurringList items={incomes} lookups={lookups} actions={actions} />
      </>
    );

  const errors = (
    <>
      <ErrorNote>{error}</ErrorNote>
      <ErrorNote>{actions.error}</ErrorNote>
    </>
  );

  if (desktop) {
    return (
      <DesktopPage title="Recorrentes" showMonth={false}>
        {errors}
        {content}
      </DesktopPage>
    );
  }
  return (
    <Screen>
      <Txt size={24} weight={800}>
        Recorrentes
      </Txt>
      {errors}
      {content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  group: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 14 },
});
