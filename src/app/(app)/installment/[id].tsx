import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { PlanDetail } from '@/features/editors';
import { useColors } from '@/lib/theme';

export default function InstallmentScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <PlanDetail id={id} layout="screen" onDone={() => router.back()} header={<ScreenHeader title="Parcelamento" icon="chevron-back" onBack={() => router.back()} />} />
    </SafeAreaView>
  );
}
