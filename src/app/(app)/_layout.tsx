import { Stack } from 'expo-router';

import { AppDataProvider } from '@/lib/data';
import { useColors } from '@/lib/theme';

export default function AppLayout() {
  const c = useColors();
  return (
    <AppDataProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="expense/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="income/new" options={{ presentation: 'modal' }} />
      </Stack>
    </AppDataProvider>
  );
}
