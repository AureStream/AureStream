import { HomeDashboardPanel } from "@/components/dashboard/HomeDashboardPanel";

interface MobileDashboardProps {
  onOpenProviders?: () => void;
}

export function MobileDashboard({ onOpenProviders }: MobileDashboardProps) {
  return (
    <HomeDashboardPanel layout="mobile" onOpenProviders={onOpenProviders} />
  );
}
