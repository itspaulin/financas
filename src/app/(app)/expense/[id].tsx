import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { EditExpense } from '@/features/editors';
import { useColors } from '@/lib/theme';

export default function EditExpenseScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <EditExpense
        id={id}
        layout="screen"
        header={<ScreenHeader title="Editar gasto" onBack={() => router.back()} />}
        onDone={() => router.back()}
        onOpenPlan={(planId) => router.push(`/installment/${planId}`)}
      />
    </SafeAreaView>
  );
}
