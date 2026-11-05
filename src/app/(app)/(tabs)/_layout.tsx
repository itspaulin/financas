import Ionicons from '@expo/vector-icons/Ionicons';
import { Slot } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import type { IconName } from '@/components/ui';
import { DesktopShell } from '@/features/desktop/shell';
import { fonts, useColors, useIsDesktop } from '@/lib/theme';

function icon(name: IconName) {
  return function TabIcon({ color, focused }: { color: unknown; focused: boolean }) {
    return <TabPill name={name} color={String(color)} focused={focused} />;
  };
}

function TabPill({ name, color, focused }: { name: IconName; color: string; focused: boolean }) {
  const c = useColors();
  return (
    <View
      style={{
        width: 56,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? c.primaryBg : 'transparent',
      }}>
      <Ionicons name={name} color={color} size={22} />
    </View>
  );
}

export default function TabsLayout() {
  const c = useColors();
  const desktop = useIsDesktop();

  if (desktop) {
    return (
      <DesktopShell>
        <Slot />
      </DesktopShell>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primaryText,
        tabBarInactiveTintColor: c.text3,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarLabelStyle: { fontFamily: fonts[600], fontSize: 12 },
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, height: 68, paddingTop: 6 },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Lançamentos', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Painel', tabBarIcon: icon('pie-chart-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: icon('options-outline') }} />
      <Tabs.Screen name="installments" options={{ href: null }} />
      <Tabs.Screen name="recurring" options={{ href: null }} />
    </Tabs>
  );
}
