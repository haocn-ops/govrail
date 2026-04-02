import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AgentStatusList } from "@/components/dashboard/agent-status-list";
import { RecentTasks } from "@/components/dashboard/recent-tasks";
import { RuntimeChart } from "@/components/dashboard/runtime-chart";
import { ServiceHealthCard } from "@/components/dashboard/service-health-card";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Govrail"
        description="A governed operations console for agent runtime health, execution monitoring, approvals, and operator workflows."
        badge={<Badge variant="strong">All systems nominal</Badge>}
      />

      <StatsCards />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <RuntimeChart />
        <ServiceHealthCard />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AgentStatusList />
        <ActivityFeed />
      </div>

      <RecentTasks />
    </div>
  );
}
