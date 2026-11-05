import { StyleSheet, View } from 'react-native';

import {
  barTone,
  Card,
  ErrorNote,
  MonthSwitcher,
  ProgressBar,
  Screen,
  SectionTitle,
  Skeleton,
  Stat,
  Tag,
  Txt,
} from '@/components/ui';
import { useAppData, useRemote } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import type { Breakdown, Dashboard } from '@/shared/types';

import { type Column, Row, Table } from './desktop/controls';
import { DesktopPage } from './desktop/shell';

function ratioOf(item: Breakdown) {
  return item.goalCents ? item.cents / item.goalCents : 0;
}

function sortCategories(items: Breakdown[]) {
  return [...items].sort((a, b) => b.cents - a.cents);
}

function StatusTag({ item }: { item: Breakdown }) {
  if (!item.goalCents) return null;
  const tone = barTone(ratioOf(item));
  if (tone === 'error') return <Tag tone="error">estourada</Tag>;
  if (tone === 'warn') return <Tag tone="warn">perto da meta</Tag>;
  return null;
}

function percent(item: Breakdown) {
  return `${Math.round(ratioOf(item) * 100).toLocaleString('pt-BR')}%`;
}

function StatsGrid({ data, columns }: { data: Dashboard; columns: 2 | 6 }) {
  const items = [
    <Stat key="in" label="Entradas" cents={data.incomesCents} tone="income" />,
    <Stat key="out" label="Gastos" cents={data.expensesCents} />,
    <Stat key="paid" label="Já pago" cents={data.paidCents} />,
    <Stat key="due" label="A pagar" cents={data.expensesCents - data.paidCents} tone="warn" />,
    <Stat key="bal" label="Saldo do mês" cents={data.balanceCents} tone="balance" />,
    <Stat key="acc" label="Saldo acumulado" cents={data.accumulatedCents} tone="balance" />,
  ];
  if (columns === 6) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>{items}</View>;
  return (
    <View style={{ gap: space.md }}>
      {[0, 2, 4].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.md }}>
          {items.slice(i, i + 2)}
        </View>
      ))}
    </View>
  );
}

function BreakdownCard({ title, items }: { title: string; items: Breakdown[] }) {
  const max = Math.max(...items.map((i) => i.cents), 1);
  if (!items.length) return null;
  return (
    <Card>
      <Txt size={18} weight={700}>
        {title}
      </Txt>
      {items.map((item) => (
        <View key={item.id ?? item.label} style={{ gap: 6 }}>
          <View style={styles.between}>
            <Txt size={14} weight={600}>
              {item.label}
            </Txt>
            <Txt size={14} weight={700} numeric>
              {formatMoney(item.cents)}
            </Txt>
          </View>
          <ProgressBar ratio={item.cents / max} tone="primary" thin />
        </View>
      ))}
    </Card>
  );
}

export function MobileDashboard() {
  const c = useColors();
  const { month, shiftMonth } = useAppData();
  const { data, error } = useRemote<Dashboard>(`/dashboard?month=${month}`);

  return (
    <Screen>
      <MonthSwitcher month={month} onShift={shiftMonth} />
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        <View style={{ gap: space.md }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Skeleton height={80} r={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Skeleton height={80} r={18} />
              </View>
            </View>
          ))}
          <Skeleton height={300} r={20} />
        </View>
      ) : (
        <>
          <StatsGrid data={data} columns={2} />
          <SectionTitle>Categorias × meta</SectionTitle>
          <Card>
            {sortCategories(data.byCategory).map((item) => {
              const ratio = ratioOf(item);
              const tone = barTone(ratio);
              const color = !item.goalCents ? c.text3 : tone === 'error' ? c.err : tone === 'warn' ? c.warn : c.text3;
              return (
                <View key={item.id ?? item.label} style={{ gap: 6 }}>
                  <View style={styles.between}>
                    <Txt size={15} weight={700}>
                      {item.label}
                    </Txt>
                    <Txt size={15} weight={700} numeric>
                      {formatMoney(item.cents)}
                    </Txt>
                  </View>
                  <ProgressBar ratio={item.goalCents ? ratio : 0} />
                  <View style={styles.between}>
                    <Txt size={13} weight={tone === 'ok' ? 500 : 600} color={color}>
                      {item.goalCents ? `Meta ${formatMoney(item.goalCents)} · ${percent(item)}` : 'Sem meta definida'}
                    </Txt>
                    <StatusTag item={item} />
                  </View>
                </View>
              );
            })}
          </Card>
          <BreakdownCard title="Por cartão / conta" items={data.byAccount} />
          <BreakdownCard title="Por forma de pagamento" items={data.byMethod} />
        </>
      )}
    </Screen>
  );
}

const CATEGORY_COLUMNS: Column[] = [
  { key: 'name', label: 'Categoria', flex: 2 },
  { key: 'spent', label: 'Gasto', flex: 1.1, align: 'right' },
  { key: 'goal', label: 'Meta', flex: 1.1, align: 'right' },
  { key: 'pct', label: '%', flex: 0.7, align: 'right' },
  { key: 'bar', label: 'Progresso', flex: 1.6 },
];

export function DesktopDashboard() {
  const c = useColors();
  const { month } = useAppData();
  const { data, error } = useRemote<Dashboard>(`/dashboard?month=${month}`);

  return (
    <DesktopPage title="Painel">
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        <>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={{ flex: 1 }}>
                <Skeleton height={80} r={18} />
              </View>
            ))}
          </View>
          <Skeleton height={480} r={20} />
        </>
      ) : (
        <>
          <StatsGrid data={data} columns={6} />
          <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' }}>
            <View style={{ flex: 1.7 }}>
              <Table
                title="Categorias × meta"
                right={
                  <Txt size={13} color={c.text3}>
                    ordenado pelo maior gasto
                  </Txt>
                }
                columns={CATEGORY_COLUMNS}>
                {sortCategories(data.byCategory).map((item) => {
                  const ratio = ratioOf(item);
                  const tone = item.goalCents ? barTone(ratio) : 'ok';
                  const over = tone === 'error';
                  return (
                    <Row
                      key={item.id ?? item.label}
                      columns={CATEGORY_COLUMNS}
                      tint={over ? c.errBg : undefined}
                      cells={{
                        name: (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Txt size={15} weight={600}>
                              {item.label}
                            </Txt>
                            <StatusTag item={item} />
                          </View>
                        ),
                        spent: (
                          <Txt size={15} weight={700} numeric>
                            {formatMoney(item.cents)}
                          </Txt>
                        ),
                        goal: (
                          <Txt size={14} color={c.text2} numeric>
                            {item.goalCents ? formatMoney(item.goalCents) : '—'}
                          </Txt>
                        ),
                        pct: (
                          <Txt size={14} weight={700} numeric color={over ? c.err : tone === 'warn' ? c.warn : c.text}>
                            {item.goalCents ? percent(item) : '—'}
                          </Txt>
                        ),
                        bar: (
                          <View style={{ width: '100%' }}>
                            <ProgressBar ratio={item.goalCents ? ratio : 0} />
                          </View>
                        ),
                      }}
                    />
                  );
                })}
              </Table>
            </View>
            <View style={{ flex: 1, gap: space.lg }}>
              <BreakdownCard title="Por cartão / conta" items={data.byAccount} />
                  <BreakdownCard title="Por forma de pagamento" items={data.byMethod} />
            </View>
          </View>
        </>
      )}
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
