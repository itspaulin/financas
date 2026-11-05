import { router } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { NewIncome } from '@/features/editors';
import { draftStore } from '@/lib/data';
import { useColors } from '@/lib/theme';

export default function NewIncomeScreen() {
  const c = useColors();
  const [draft] = useState(() => draftStore.take());
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <NewIncome
        draft={draft}
        layout="screen"
        header={<ScreenHeader title="Nova entrada" onBack={() => router.back()} />}
        onDone={() => router.back()}
      />
    </SafeAreaView>
  );
}
