import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { useColors } from '@/lib/theme';

export function Logo({ size = 56 }: { size?: number }) {
  const c = useColors();
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: c.primary }]}>
      <Ionicons name="infinite" size={size * 0.55} color={c.onPrimary} />
    </View>
  );
}
