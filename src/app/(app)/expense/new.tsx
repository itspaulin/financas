import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { NewExpense } from '@/features/editors';
import { draftStore } from '@/lib/data';
import { useColors } from '@/lib/theme';

export default function NewExpenseScreen() {
  const c = useColors();
  const [draft] = useState(() => draftStore.take());
  const { installments } = useLocalSearchParams<{ installments?: string }>();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <NewExpense
        draft={draft}
        startInstallments={installments === '1'}
        layout="screen"
        header={<ScreenHeader title={installments === '1' ? 'Novo parcelamento' : 'Novo gasto'} onBack={() => router.back()} />}
        onDone={() => router.back()}
      />
    </SafeAreaView>
  );
}
