import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Chips, EmptyState, ErrorNote, ProgressBar, Screen, Skeleton, Tag, Txt } from '@/components/ui';
import { useAppData, useRemote } from '@/lib/data';
import { formatDate, formatMoney, formatMonth } from '@/lib/format';
import { fonts, radius, space, useColors } from '@/lib/theme';
import { addMonths, monthOf, today } from '@/shared/dates';
import type { PlanSummary } from '@/shared/types';

import { type Column, Row, SearchField, Segmented, Select, Table } from './desktop/controls';
import { DesktopPage, useDesktop } from './desktop/shell';
import { useEntryActions } from './navigation';

type Tab = 'active' | 'settled' | 'all';

const FORECAST_MONTHS = 6;

function isActive(p: PlanSummary) {
  return !p.settledOn && p.remainingCount > 0;
}

const paidCount = (p: PlanSummary) => p.schedule.filter((i) => i.paid).length;

function usePlans() {
  const { data, error } = useRemote<PlanSummary[]>('/installments');
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const all = (data ?? []).filter(
    (p) => (!account || p.accountId === account) && (!query || p.description.toLowerCase().includes(query)),
  );
  const active = all.filter(isActive);
  const settled = all.filter((p) => !isActive(p));
  const shown = tab === 'active' ? active : tab === 'settled' ? settled : all;
  const filtering = Boolean(account || query);
  return { data, error, tab, setTab, search, setSearch, account, setAccount, filtering, active, settled, all, shown };
}

function StatusTag({ plan }: { plan: PlanSummary }) {
  if (isActive(plan)) return <Tag tone="primary">ativo</Tag>;
  if (plan.settledOn) return <Tag tone="ok">{`quitado ${formatDate(plan.settledOn).slice(0, 5)}`}</Tag>;
  return <Tag tone="ok">concluído</Tag>;
}

const COLUMNS: Column[] = [
  { key: 'description', label: 'Descrição', flex: 1.6 },
  { key: 'account', label: 'Cartão', flex: 1.3 },
  { key: 'purchase', label: 'Compra', flex: 1 },
  { key: 'progress', label: 'Progresso', flex: 1.8 },
  { key: 'installment', label: 'Parcela', flex: 1, align: 'right' },
  { key: 'remaining', label: 'Falta', flex: 1, align: 'right' },
  { key: 'status', label: 'Status', flex: 1 },
];

function Progress({ plan }: { plan: PlanSummary }) {
  const c = useColors();
  return (
    <View style={{ gap: 2, width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <ProgressBar ratio={plan.currentNumber / plan.installmentsCount} tone="ok" thin />
        </View>
        <Txt size={14} weight={700} numeric>
          {`${plan.currentNumber}/${plan.installmentsCount}`}
        </Txt>
      </View>
      <Txt size={12} color={c.text3}>
        {paidCount(plan)} {paidCount(plan) === 1 ? 'paga' : 'pagas'}
      </Txt>
    </View>
  );
}

// What the active plans bill in each of the next months, and how much of it is still unpaid.
function Forecast({ plans }: { plans: PlanSummary[] }) {
  const c = useColors();
  const first = monthOf(today());
  const months = Array.from({ length: FORECAST_MONTHS }, (_, i) => addMonths(first, i));
  const items = plans.flatMap((p) => p.schedule);
  return (
    <View style={{ gap: space.sm }}>
      <Txt size={13} weight={700} color={c.text2} style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
        Previsão por mês
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
        {months.map((month) => {
          const billed = items.filter((i) => i.billingMonth.slice(0, 7) === month);
          const total = billed.reduce((s, i) => s + i.amountCents, 0);
          const open = billed.filter((i) => !i.paid).reduce((s, i) => s + i.amountCents, 0);
          return (
            <View key={month} style={[styles.forecast, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Txt size={13} color={c.text2}>
                {formatMonth(month)}
              </Txt>
              <Txt size={19} weight={800} numeric>
                {formatMoney(total)}
              </Txt>
              <Txt size={12} color={open ? c.warn : c.text3}>
                {total === 0 ? 'sem parcelas' : open ? `a pagar ${formatMoney(open)}` : 'tudo pago'}
              </Txt>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function DesktopPlans() {
  const c = useColors();
  const { lookups } = useAppData();
  const desktop = useDesktop();
  const actions = useEntryActions();
  const p = usePlans();
  const due = p.active.reduce((s, x) => s + x.remainingCents, 0);

  return (
    <DesktopPage title="Parcelamentos">
      <View style={styles.between}>
        <Segmented
          value={p.tab}
          onChange={p.setTab}
          options={[
            { value: 'active', label: `Ativos (${p.active.length})` },
            { value: 'settled', label: `Quitados (${p.settled.length})` },
            { value: 'all', label: `Todos (${p.all.length})` },
          ]}
        />
        <Button title="Novo parcelamento" icon="add" variant="secondary" onPress={() => actions.newInstallment()} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center', zIndex: 10 }}>
        {lookups && (
          <Select
            label="Cartão"
            allLabel="Todos"
            value={p.account}
            onChange={p.setAccount}
            options={lookups.accounts.map((x) => ({ value: x.id, label: x.name }))}
          />
        )}
        <SearchField value={p.search} onChange={p.setSearch} />
        {p.filtering && (
          <Button
            title="Limpar filtros"
            variant="outline"
            size="sm"
            onPress={() => {
              p.setSearch('');
              p.setAccount(null);
            }}
          />
        )}
        <View style={{ flex: 1 }} />
        <Txt size={14} color={c.text2}>
          {p.active.length} parcelamentos ativos · {formatMoney(due)} a pagar nas próximas parcelas
        </Txt>
      </View>
      {p.data && <Forecast plans={p.active} />}
      <ErrorNote>{p.error}</ErrorNote>
      <Table columns={COLUMNS}>
        {!p.data || !lookups ? (
          [0, 1, 2].map((i) => <Row key={i} columns={COLUMNS} cells={{ description: <Skeleton height={12} width="70%" /> }} />)
        ) : p.shown.length === 0 ? (
          <EmptyState
            icon="card-outline"
            title="Nenhum parcelamento aqui"
            text={p.filtering ? 'Nenhum resultado para esses filtros.' : undefined}
          />
        ) : (
          p.shown.map((plan) => (
            <Row
              key={plan.id}
              columns={COLUMNS}
              selected={desktop?.selectedId === plan.id}
              onPress={() => actions.openPlan(plan.id, plan.description)}
              cells={{
                description: (
                  <Txt size={15} weight={700}>
                    {plan.description}
                  </Txt>
                ),
                account: (
                  <Txt size={14} color={c.text2}>
                    {lookups.accounts.find((a) => a.id === plan.accountId)?.name ?? '—'}
                  </Txt>
                ),
                purchase: (
                  <Txt size={14} color={c.text2}>
                    {formatDate(plan.purchasedOn)}
                  </Txt>
                ),
                progress: <Progress plan={plan} />,
                installment: (
                  <Txt size={15} weight={700} numeric>
                    {formatMoney(plan.installmentCents)}
                  </Txt>
                ),
                remaining: (
                  <Txt size={14} numeric>
                    {plan.remainingCents ? formatMoney(plan.remainingCents) : '—'}
                  </Txt>
                ),
                status: <StatusTag plan={plan} />,
              }}
            />
          ))
        )}
      </Table>
    </DesktopPage>
  );
}

export function MobilePlans() {
  const c = useColors();
  const { lookups } = useAppData();
  const actions = useEntryActions();
  const p = usePlans();
  return (
    <Screen>
      <View style={styles.between}>
        <Txt size={24} weight={800}>
          Parcelamentos
        </Txt>
        <Button title="Novo" icon="add" size="sm" onPress={() => actions.newInstallment()} />
      </View>
      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.line }]}>
        <TextInput
          value={p.search}
          onChangeText={p.setSearch}
          placeholder="Buscar parcelamento"
          placeholderTextColor={c.text3}
          style={{ flex: 1, fontFamily: fonts[500], fontSize: 15, color: c.text }}
        />
      </View>
      {lookups && lookups.accounts.length > 0 && (
        <Chips
          options={lookups.accounts.map((x) => ({ value: x.id, label: x.name }))}
          value={p.account}
          onChange={p.setAccount}
          allowNone="Todos os cartões"
          small
        />
      )}
      <Segmented
        value={p.tab}
        onChange={p.setTab}
        options={[
          { value: 'active', label: `Ativos (${p.active.length})` },
          { value: 'settled', label: `Quitados (${p.settled.length})` },
          { value: 'all', label: 'Todos' },
        ]}
      />
      <ErrorNote>{p.error}</ErrorNote>
      {!p.data || !lookups ? (
        <Skeleton height={200} r={18} />
      ) : (
        <>
          <Forecast plans={p.active} />
          {p.shown.length === 0 ? (
            <EmptyState
              icon="card-outline"
              title="Nenhum parcelamento aqui"
              text={p.filtering ? 'Nenhum resultado para esses filtros.' : undefined}
            />
          ) : (
            <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>
              {p.shown.map((plan, i) => (
                <Pressable
                  key={plan.id}
                  onPress={() => actions.openPlan(plan.id)}
                  style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
                  <View style={styles.between}>
                    <Txt size={15} weight={700}>
                      {plan.description}
                    </Txt>
                    <StatusTag plan={plan} />
                  </View>
                  <Progress plan={plan} />
                  <Txt size={13} color={c.text3}>
                    {formatMoney(plan.installmentCents)} por mês · falta {formatMoney(plan.remainingCents)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  group: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  item: { padding: 14, gap: 8 },
  forecast: { minWidth: 160, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  search: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5 },
});
