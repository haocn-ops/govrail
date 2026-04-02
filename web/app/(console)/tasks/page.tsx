import { PageHeader } from "@/components/page-header";
import { RecentTasks } from "@/components/dashboard/recent-tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TasksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tasks"
        title="Execution tracking"
        description="Follow run state, approval gates, outbound dispatch, and replay status from queued to completed."
      />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <RecentTasks />
        <Card>
          <CardHeader>
            <CardTitle>Task status model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>Queued → Running → Waiting approval → Dispatching → Completed / Failed / Cancelled</p>
            <p>Every transition is designed to map back to audit events and artifact evidence.</p>
            <p>Replay should preserve the originating policy envelope and operator audit context.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
