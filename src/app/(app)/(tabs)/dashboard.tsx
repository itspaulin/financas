import { DesktopDashboard, MobileDashboard } from '@/features/dashboard';
import { useIsDesktop } from '@/lib/theme';

export default function DashboardScreen() {
  return useIsDesktop() ? <DesktopDashboard /> : <MobileDashboard />;
}
