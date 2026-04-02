import { PageHeader } from "@/components/page-header";
import { ToolProviderList } from "@/components/agents/tool-provider-list";
import { AgentStatusList } from "@/components/dashboard/agent-status-list";

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agents"
        title="Agent lifecycle management"
        description="Inspect agents, review regional placement, and trigger start / stop / restart actions from a single operator surface."
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <AgentStatusList />
        <ToolProviderList />
      </div>
    </div>
  );
}
