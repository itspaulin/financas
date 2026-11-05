import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, usePathname } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Avatar, Button, IconButton, type IconName, MonthSwitcher, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAppData } from '@/lib/data';
import { space, useColors } from '@/lib/theme';
import type { Draft } from '@/shared/types';

import { EditExpense, EditIncome, NewExpense, NewIncome, PlanDetail } from '../editors';

export type DrawerSpec =
  | { kind: 'new-expense'; draft?: Draft | null; installments?: boolean }
  | { kind: 'expense'; id: string }
  | { kind: 'new-income'; draft?: Draft | null }
  | { kind: 'income'; id: string }
  | { kind: 'plan'; id: string; title: string };

type Desktop = { open: (spec: DrawerSpec) => void; close: () => void; selectedId: string | null };

const DesktopContext = createContext<Desktop | null>(null);

export function useDesktop(): Desktop | null {
  return useContext(DesktopContext);
}

const NAV: { href: Href; path: string; label: string; icon: IconName }[] = [
  { href: '/', path: '/', label: 'Lançamentos', icon: 'list-outline' },
  { href: '/dashboard', path: '/dashboard', label: 'Painel', icon: 'pie-chart-outline' },
  { href: '/installments', path: '/installments', label: 'Parcelamentos', icon: 'card-outline' },
  { href: '/recurring', path: '/recurring', label: 'Recorrentes', icon: 'repeat-outline' },
  { href: '/settings', path: '/settings', label: 'Ajustes', icon: 'options-outline' },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const c = useColors();
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { lookups } = useAppData();
  const me = lookups?.me;

  return (
    <View style={[styles.sidebar, { width: collapsed ? 80 : 240, backgroundColor: c.surface, borderRightColor: c.line }]}>
      <View style={[styles.brand, collapsed && { justifyContent: 'center' }]}>
        <Logo size={36} />
        {!collapsed && (
          <Txt size={19} weight={800}>
            Finanças
          </Txt>
        )}
      </View>
      <View style={{ gap: 4, marginTop: space.lg }}>
        {NAV.map((item) => {
          const active = pathname === item.path;
          return (
            <Pressable
              key={item.path}
              accessibilityRole="link"
              accessibilityLabel={item.label}
              onPress={() => router.navigate(item.href)}
              style={({ hovered }) => [
                styles.navItem,
                collapsed && { justifyContent: 'center', paddingHorizontal: 0 },
                { backgroundColor: active ? c.primaryBg : hovered ? c.surface2 : 'transparent' },
              ]}>
              <Ionicons name={item.icon} size={22} color={active ? c.primaryText : c.text2} />
              {!collapsed && (
                <Txt size={15} weight={active ? 700 : 600} color={active ? c.primaryText : c.text2}>
                  {item.label}
                </Txt>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={onToggle}
        style={({ hovered }) => [
          styles.navItem,
          collapsed && { justifyContent: 'center', paddingHorizontal: 0 },
          hovered && { backgroundColor: c.surface2 },
        ]}>
        <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-back'} size={20} color={c.text2} />
        {!collapsed && (
          <Txt size={15} weight={600} color={c.text2}>
            Recolher menu
          </Txt>
        )}
      </Pressable>
      <View style={[styles.user, { borderTopColor: c.line }]}>
        {me && (
          <View style={[styles.userRow, collapsed && { justifyContent: 'center' }]}>
            <Avatar name={me.name} />
            {!collapsed && (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={14} weight={700}>
                  {me.name}
                </Txt>
                <Txt size={12} color={c.text3} numberOfLines={1}>
                  {me.email}
                </Txt>
              </View>
            )}
          </View>
        )}
        {collapsed ? (
          <IconButton icon="log-out-outline" label="Sair" onPress={signOut} bordered size={44} />
        ) : (
          <Button title="Sair" variant="outline" size="sm" icon="log-out-outline" onPress={signOut} full />
        )}
      </View>
    </View>
  );
}

function drawerTitle(spec: DrawerSpec): string {
  switch (spec.kind) {
    case 'new-expense':
      return spec.installments ? 'Novo parcelamento' : 'Novo gasto';
    case 'expense':
      return 'Editar gasto';
    case 'new-income':
      return 'Nova entrada';
    case 'income':
      return 'Editar entrada';
    case 'plan':
      return spec.title;
  }
}

function DrawerBody({ spec, close, open }: { spec: DrawerSpec; close: () => void; open: (s: DrawerSpec) => void }) {
  switch (spec.kind) {
    case 'new-expense':
      return <NewExpense draft={spec.draft ?? null} startInstallments={spec.installments} layout="drawer" onDone={close} onCancel={close} />;
    case 'expense':
      return (
        <EditExpense
          id={spec.id}
          layout="drawer"
          onDone={close}
          onCancel={close}
          onOpenPlan={(id) => open({ kind: 'plan', id, title: 'Parcelamento' })}
        />
      );
    case 'new-income':
      return <NewIncome draft={spec.draft ?? null} layout="drawer" onDone={close} onCancel={close} />;
    case 'income':
      return <EditIncome id={spec.id} layout="drawer" onDone={close} onCancel={close} />;
    case 'plan':
      return <PlanDetail id={spec.id} layout="drawer" onDone={close} />;
  }
}

const DRAWER_WIDTH = 460;

function DrawerOverlay({
  closing,
  onClose,
  onClosed,
  children,
}: {
  closing: boolean;
  onClose: () => void;
  onClosed: () => void;
  children: ReactNode;
}) {
  const c = useColors();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: closing ? 0 : 1,
      duration: closing ? 180 : 240,
      easing: closing ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && closing) onClosed();
    });
  }, [closing, progress, onClosed]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay, opacity: progress }]}>
        <Pressable accessibilityLabel="Fechar painel" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: c.surface,
            borderLeftColor: c.line,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [DRAWER_WIDTH, 0] }) }],
          },
        ]}>
        {children}
      </Animated.View>
    </View>
  );
}

export function DesktopShell({ children }: { children: ReactNode }) {
  const c = useColors();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState<{ spec: DrawerSpec; key: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const handleClosed = useCallback(() => {
    setDrawer(null);
    setClosing(false);
  }, []);

  useEffect(() => {
    if (!drawer || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setClosing(true);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const value = useMemo<Desktop>(
    () => ({
      open: (spec) => {
        setClosing(false);
        setDrawer((d) => ({ spec, key: (d?.key ?? 0) + 1 }));
      },
      close: () => setClosing(true),
      selectedId: drawer && 'id' in drawer.spec ? drawer.spec.id : null,
    }),
    [drawer],
  );

  return (
    <DesktopContext.Provider value={value}>
      <View style={[styles.shell, { backgroundColor: c.bg }]}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        {drawer && (
          <DrawerOverlay
            closing={closing}
            onClose={value.close}
            onClosed={handleClosed}>
            <View style={[styles.drawerHeader, { borderBottomColor: c.line }]}>
              <Txt size={20} weight={700} style={{ flex: 1 }}>
                {drawerTitle(drawer.spec)}
              </Txt>
              <IconButton icon="close" label="Fechar" onPress={value.close} size={40} />
            </View>
            <DrawerBody key={drawer.key} spec={drawer.spec} close={value.close} open={value.open} />
          </DrawerOverlay>
        )}
      </View>
    </DesktopContext.Provider>
  );
}

export function DesktopPage({
  title,
  showMonth = true,
  footer,
  children,
}: {
  title: string;
  showMonth?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const c = useColors();
  const { month, shiftMonth } = useAppData();
  const desktop = useDesktop();
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.topbar, { borderBottomColor: c.line }]}>
        <Txt size={26} weight={800}>
          {title}
        </Txt>
        {showMonth && <MonthSwitcher month={month} onShift={shiftMonth} compact />}
        <View style={{ flex: 1 }} />
        <Button title="Entrada" variant="secondary" icon="add" onPress={() => desktop?.open({ kind: 'new-income' })} />
        <Button title="Gasto" icon="add" onPress={() => desktop?.open({ kind: 'new-expense' })} />
      </View>
      <ScrollView contentContainerStyle={styles.pageContent}>{children}</ScrollView>
      {footer && <View style={[styles.pageFooter, { borderTopColor: c.line, backgroundColor: c.surface }]}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', minHeight: '100%' as unknown as number },
  sidebar: { borderRightWidth: 1, padding: space.md, paddingTop: space.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 46, paddingHorizontal: space.md, borderRadius: 12 },
  user: { borderTopWidth: 1, paddingTop: space.md, marginTop: space.sm, gap: space.md },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.xxl, paddingVertical: space.md, borderBottomWidth: 1, minHeight: 76 },
  pageContent: { padding: space.xxl, paddingTop: space.xl, gap: space.lg },
  pageFooter: { flexDirection: 'row', alignItems: 'center', gap: space.xl, paddingHorizontal: space.xxl, paddingVertical: space.md, borderTopWidth: 1 },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    borderLeftWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: -4, height: 0 },
  },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.md, borderBottomWidth: 1, minHeight: 76 },
});
