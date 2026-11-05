import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useConfirm } from '@/components/confirm';
import { Avatar, Button, Card, Chips, ErrorNote, Field, MoneyField, Screen, SectionTitle, Spinner, Tag, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAppData } from '@/lib/data';
import { formatMoney, formatMonth } from '@/lib/format';
import { radius, space, useColors, useIsDesktop } from '@/lib/theme';
import { monthOf, today } from '@/shared/dates';
import type { Account, Category, Lookups } from '@/shared/types';

import { type Column, Row, Table } from './desktop/controls';
import { DesktopPage } from './desktop/shell';

function useSettingsActions() {
  const { reloadLookups, changed } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await reloadLookups();
      changed();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      return false;
    }
  };
  return {
    error,
    updateCategory: (id: string, body: object) => run(() => api(`/categories/${id}`, { method: 'PATCH', body })),
    createCategory: (name: string, goalCents: number | null) => run(() => api('/categories', { method: 'POST', body: { name, goalCents } })),
    createAccount: (name: string, ownerMemberId: string | null, closingDay: number | null) =>
      run(() => api('/accounts', { method: 'POST', body: { name, ownerMemberId, closingDay } })),
    updateAccount: (id: string, closingDay: number | null) =>
      run(() => api(`/accounts/${id}`, { method: 'PATCH', body: { closingDay } })),
  };
}

type Actions = ReturnType<typeof useSettingsActions>;

function InviteCard() {
  const c = useColors();
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card style={{ gap: space.md }}>
      <Txt size={16} weight={700}>
        Convidar pessoa
      </Txt>
      <Txt size={13} color={c.text2}>
        Gere um código e passe para quem vai usar o app com você. Ele cria a conta já dentro desta casa e vale por 7 dias, uma vez só.
      </Txt>
      {invite && (
        <View style={{ alignItems: 'center', paddingVertical: space.sm }}>
          <Txt size={28} weight={800} style={{ letterSpacing: 4 }} selectable>
            {invite.code}
          </Txt>
        </View>
      )}
      <ErrorNote>{error}</ErrorNote>
      <Button
        title={invite ? 'Gerar outro código' : 'Gerar código de convite'}
        variant="secondary"
        icon="person-add-outline"
        loading={loading}
        full
        onPress={async () => {
          setLoading(true);
          setError(null);
          try {
            setInvite(await api<{ code: string; expiresAt: string }>('/invites', { method: 'POST' }));
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao gerar o convite');
          }
          setLoading(false);
        }}
      />
    </Card>
  );
}

// App Store and Play Store both require a way to delete the account from inside the app.
function DeleteAccountCard() {
  const c = useColors();
  const { deleteAccount } = useAuth();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button title="Excluir minha conta" variant="outline" icon="trash-outline" onPress={() => setOpen(true)} full />
    );
  }
  return (
    <Card style={{ gap: space.md }}>
      <Txt size={16} weight={700} color={c.err}>
        Excluir conta
      </Txt>
      <Txt size={13} color={c.text2}>
        Se você for a única pessoa da casa, todos os lançamentos, categorias e cartões serão apagados para sempre. Se houver outras pessoas, só os
        seus dados pessoais saem e a casa continua com elas.
      </Txt>
      <Field label="Confirme com a sua senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <ErrorNote>{error}</ErrorNote>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancelar" variant="outline" onPress={() => setOpen(false)} full />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Excluir"
            variant="danger"
            loading={loading}
            disabled={!password}
            full
            onPress={async () => {
              const ok = await confirm({
                title: 'Excluir a conta?',
                message: 'Isso não pode ser desfeito.',
                action: 'Excluir',
                danger: true,
              });
              if (!ok) return;
              setLoading(true);
              setError(null);
              try {
                await deleteAccount(password);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Erro ao excluir a conta');
                setLoading(false);
              }
            }}
          />
        </View>
      </View>
    </Card>
  );
}

function UserCard({ lookups, row }: { lookups: Lookups; row?: boolean }) {
  const c = useColors();
  const { signOut } = useAuth();
  const info = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
      <Avatar name={lookups.me.name} />
      <View>
        <Txt size={16} weight={700}>
          {lookups.me.name}
        </Txt>
        <Txt size={13} color={c.text3}>
          {lookups.me.email}
        </Txt>
      </View>
    </View>
  );
  return (
    <Card style={row ? { flexDirection: 'row', alignItems: 'center' } : undefined}>
      {info}
      <Button title="Sair" variant="outline" size="sm" icon="log-out-outline" onPress={signOut} full={!row} />
    </Card>
  );
}

// undefined means the text is not a valid day; null means no closing day.
function parseClosingDay(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const day = Number(trimmed);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
}

const CLOSING_HINT = 'Compras no crédito a partir desse dia entram na fatura do mês seguinte. Vazio = sem fechamento.';

function ClosingDayEditor({ account, actions, inline }: { account: Account; actions: Actions; inline?: boolean }) {
  const [text, setText] = useState(account.closingDay?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const parsed = parseClosingDay(text);
  const dirty = parsed !== undefined && parsed !== account.closingDay;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
      <View style={{ width: inline ? 96 : 140 }}>
        <Field
          label={inline ? undefined : 'Fecha no dia'}
          value={text}
          onChangeText={setText}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="—"
          accessibilityLabel={`Dia de fechamento de ${account.name}`}
          warn={parsed === undefined ? 'Dia de 1 a 31' : undefined}
        />
      </View>
      {dirty && (
        <Button
          title="Salvar"
          size="sm"
          loading={saving}
          onPress={async () => {
            setSaving(true);
            await actions.updateAccount(account.id, parsed ?? null);
            setSaving(false);
          }}
        />
      )}
    </View>
  );
}

function MobileAccountRow({ account, lookups, first, actions }: { account: Account; lookups: Lookups; first: boolean; actions: Actions }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={!first && { borderTopWidth: 1, borderTopColor: c.line }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.catRow}>
        <Ionicons name="card-outline" size={18} color={c.text3} />
        <Txt size={15} weight={600} style={{ flex: 1 }}>
          {account.name}
        </Txt>
        <Txt size={13} color={c.text3}>
          {account.closingDay ? `Fecha dia ${account.closingDay}` : 'Sem fechamento'}
        </Txt>
        <Tag>{lookups.members.find((m) => m.id === account.ownerMemberId)?.name ?? '—'}</Tag>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.text3} />
      </Pressable>
      {open && (
        <View style={{ padding: 14, paddingTop: 0, gap: space.sm }}>
          <ClosingDayEditor account={account} actions={actions} />
          <Txt size={13} color={c.text3}>
            {CLOSING_HINT}
          </Txt>
        </View>
      )}
    </View>
  );
}

function NewAccount({ lookups, actions }: { lookups: Lookups; actions: Actions }) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState<string | null>(lookups.me.id);
  const [closing, setClosing] = useState('');
  const closingDay = parseClosingDay(closing);
  return (
    <Card style={{ gap: space.md }}>
      <Field label="Novo cartão ou conta" value={name} onChangeText={setName} placeholder="Ex.: C6 Luiz" />
      <Chips label="Dono" options={lookups.members.map((m) => ({ value: m.id, label: m.name }))} value={owner} onChange={setOwner} />
      <Field
        label="Dia de fechamento (opcional)"
        value={closing}
        onChangeText={setClosing}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="Ex.: 10"
        hint={CLOSING_HINT}
        warn={closingDay === undefined ? 'Dia de 1 a 31' : undefined}
      />
      <Button
        title="Adicionar cartão"
        variant="secondary"
        icon="add"
        disabled={!name.trim() || closingDay === undefined}
        onPress={async () => {
          if (await actions.createAccount(name, owner, closingDay ?? null)) {
            setName('');
            setClosing('');
          }
        }}
        full
      />
    </Card>
  );
}

function MobileCategoryRow({ category, first, actions }: { category: Category; first: boolean; actions: Actions }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [goal, setGoal] = useState<number | null>(category.goalCents);
  const [saving, setSaving] = useState(false);
  const month = formatMonth(monthOf(today())).toLowerCase();

  return (
    <View style={!first && { borderTopWidth: 1, borderTopColor: c.line }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.catRow}>
        <Txt size={15} weight={700} color={category.archived ? c.text3 : c.text} style={{ flex: 1 }}>
          {category.name}
          {category.archived ? ' (arquivada)' : ''}
        </Txt>
        <Txt size={13} color={c.text3}>
          {category.goalCents ? `Meta ${formatMoney(category.goalCents)}` : 'Sem meta'}
        </Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.text3} />
      </Pressable>
      {open && (
        <View style={{ padding: 14, paddingTop: 0, gap: space.md }}>
          <Field label="Nome" value={name} onChangeText={setName} />
          <View>
            <MoneyField label="Meta mensal" cents={goal} onChange={setGoal} compact />
            <Txt size={13} color={c.text3} style={{ marginTop: 6 }}>
              Vale a partir deste mês ({month}).
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                title={category.archived ? 'Reativar' : 'Arquivar'}
                variant="outline"
                size="sm"
                icon="archive-outline"
                onPress={() => actions.updateCategory(category.id, { archived: !category.archived })}
                full
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Salvar"
                size="sm"
                loading={saving}
                onPress={async () => {
                  setSaving(true);
                  if (await actions.updateCategory(category.id, { ...(name.trim() !== category.name && { name }), goalCents: goal ?? 0 })) setOpen(false);
                  setSaving(false);
                }}
                full
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function NewCategory({ actions, inline }: { actions: Actions; inline?: boolean }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<number | null>(null);
  const button = (
    <Button
      title="Adicionar"
      variant="secondary"
      icon="add"
      disabled={!name.trim()}
      onPress={async () => {
        if (await actions.createCategory(name, goal)) {
          setName('');
          setGoal(null);
        }
      }}
      full={!inline}
    />
  );
  return (
    <Card style={inline ? { flexDirection: 'row', alignItems: 'flex-end', gap: space.md } : undefined}>
      <View style={inline && { flex: 1 }}>
        <Field label="Nova categoria" value={name} onChangeText={setName} placeholder="Ex.: Viagens" />
      </View>
      <View style={inline && { flex: 1 }}>
        <MoneyField label="Meta mensal (opcional)" cents={goal} onChange={setGoal} compact />
      </View>
      {button}
    </Card>
  );
}

function MobileSettings({ lookups, actions }: { lookups: Lookups; actions: Actions }) {
  const c = useColors();
  return (
    <Screen>
      <Txt size={24} weight={800}>
        Ajustes
      </Txt>
      <UserCard lookups={lookups} />
      <SectionTitle>Categorias e metas</SectionTitle>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>
        {lookups.categories.map((cat, i) => (
          <MobileCategoryRow key={`${cat.id}-${cat.goalCents}-${cat.archived}`} category={cat} first={i === 0} actions={actions} />
        ))}
      </View>
      <NewCategory actions={actions} />
      <SectionTitle>Cartões e contas</SectionTitle>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>
        {lookups.accounts.map((a, i) => (
          <MobileAccountRow key={`${a.id}-${a.closingDay}`} account={a} lookups={lookups} first={i === 0} actions={actions} />
        ))}
      </View>
      <NewAccount lookups={lookups} actions={actions} />
      <ErrorNote>{actions.error}</ErrorNote>
      <SectionTitle>Casa</SectionTitle>
      <InviteCard />
      <DeleteAccountCard />
    </Screen>
  );
}

const CATEGORY_COLUMNS: Column[] = [
  { key: 'name', label: 'Nome', flex: 1.3 },
  { key: 'goal', label: 'Meta mensal', flex: 1.3 },
  { key: 'action', label: 'Ação', flex: 0.9, align: 'right' },
];

const ACCOUNT_COLUMNS: Column[] = [
  { key: 'name', label: 'Nome', flex: 2 },
  { key: 'owner', label: 'Dono', flex: 0.7 },
  { key: 'closing', label: 'Fecha dia', flex: 1.3 },
];

function DesktopCategoryRow({ category, actions }: { category: Category; actions: Actions }) {
  const c = useColors();
  const [goal, setGoal] = useState<number | null>(category.goalCents);
  const [saving, setSaving] = useState(false);
  const dirty = (goal ?? 0) !== (category.goalCents ?? 0);
  return (
    <Row
      columns={CATEGORY_COLUMNS}
      selected={dirty}
      cells={{
        name: (
          <Txt size={15} weight={600} color={category.archived ? c.text3 : c.text}>
            {category.name}
            {category.archived ? ' (arquivada)' : ''}
          </Txt>
        ),
        goal: (
          <View style={{ width: '100%', maxWidth: 200 }}>
            <MoneyField cents={goal} onChange={setGoal} compact />
          </View>
        ),
        action: dirty ? (
          <Button
            title="Salvar"
            size="sm"
            loading={saving}
            onPress={async () => {
              setSaving(true);
              await actions.updateCategory(category.id, { goalCents: goal ?? 0 });
              setSaving(false);
            }}
          />
        ) : (
          <Button
            title={category.archived ? 'Reativar' : 'Arquivar'}
            size="sm"
            variant="outline"
            icon="archive-outline"
            onPress={() => actions.updateCategory(category.id, { archived: !category.archived })}
          />
        ),
      }}
    />
  );
}

function DesktopSettings({ lookups, actions }: { lookups: Lookups; actions: Actions }) {
  const c = useColors();
  const month = formatMonth(monthOf(today())).toLowerCase();
  return (
    <DesktopPage title="Ajustes" showMonth={false}>
      <UserCard lookups={lookups} row />
      <ErrorNote>{actions.error}</ErrorNote>
      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' }}>
        <View style={{ flex: 1.4, gap: space.md }}>
          <View style={styles.between}>
            <Txt size={20} weight={700}>
              Categorias e metas
            </Txt>
            <Txt size={13} color={c.text2}>
              metas valem a partir de {month}
            </Txt>
          </View>
          <Table columns={CATEGORY_COLUMNS}>
            {lookups.categories.map((cat) => (
              <DesktopCategoryRow key={`${cat.id}-${cat.goalCents}-${cat.archived}`} category={cat} actions={actions} />
            ))}
          </Table>
          <NewCategory actions={actions} inline />
        </View>
        <View style={{ flex: 1, gap: space.md }}>
          <Txt size={20} weight={700}>
            Cartões e contas
          </Txt>
          <Table columns={ACCOUNT_COLUMNS}>
            {lookups.accounts.map((a) => (
              <Row
                key={`${a.id}-${a.closingDay}`}
                columns={ACCOUNT_COLUMNS}
                cells={{
                  name: (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <Ionicons name="card-outline" size={16} color={c.text3} />
                      <Txt size={15} weight={600}>
                        {a.name}
                      </Txt>
                    </View>
                  ),
                  owner: <Tag>{lookups.members.find((m) => m.id === a.ownerMemberId)?.name ?? '—'}</Tag>,
                  closing: <ClosingDayEditor account={a} actions={actions} inline />,
                }}
              />
            ))}
          </Table>
          <Txt size={13} color={c.text2}>
            {CLOSING_HINT}
          </Txt>
          <NewAccount lookups={lookups} actions={actions} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <InviteCard />
        </View>
        <View style={{ flex: 1 }}>
          <DeleteAccountCard />
        </View>
      </View>
    </DesktopPage>
  );
}

export function SettingsPage() {
  const desktop = useIsDesktop();
  const { lookups } = useAppData();
  const actions = useSettingsActions();
  if (!lookups) return <Spinner />;
  return desktop ? <DesktopSettings lookups={lookups} actions={actions} /> : <MobileSettings lookups={lookups} actions={actions} />;
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  group: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingHorizontal: 14 },
});
