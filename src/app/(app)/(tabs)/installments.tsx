import { DesktopPlans, MobilePlans } from '@/features/plans';
import { useIsDesktop } from '@/lib/theme';

export default function InstallmentsScreen() {
  return useIsDesktop() ? <DesktopPlans /> : <MobilePlans />;
}
