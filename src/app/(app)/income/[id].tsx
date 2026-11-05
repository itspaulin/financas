import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { EditIncome } from '@/features/editors';
import { useColors } from '@/lib/theme';

export default function EditIncomeScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <EditIncome
        id={id}
        layout="screen"
        header={<ScreenHeader title="Editar entrada" onBack={() => router.back()} />}
        onDone={() => router.back()}
      />
    </SafeAreaView>
  );
}
