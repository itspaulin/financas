import { DesktopEntries, MobileEntries } from '@/features/entries';
import { useIsDesktop } from '@/lib/theme';

export default function EntriesScreen() {
  return useIsDesktop() ? <DesktopEntries /> : <MobileEntries />;
}
