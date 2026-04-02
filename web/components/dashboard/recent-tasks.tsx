import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { recentTasks } from "@/lib/mock-data";

function statusVariant(status: string): "strong" | "subtle" | "default" {
  if (status === "Succeeded") return "strong";
  if (status === "Running") return "subtle";
  return "default";
}

export function RecentTasks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Tasks</CardTitle>
        <CardDescription>Execution tracking aligned to the control plane run lifecycle.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.2em] text-muted">
            <tr>
              <th className="pb-3 font-medium">Task</th>
              <th className="pb-3 font-medium">Agent</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Duration</th>
              <th className="pb-3 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recentTasks.map((task) => (
              <tr key={task.id}>
                <td className="py-4 font-medium text-foreground">{task.id}</td>
                <td className="py-4 text-muted">{task.agent}</td>
                <td className="py-4">
                  <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
                </td>
                <td className="py-4 text-muted">{task.duration}</td>
                <td className="py-4 text-muted">{task.startedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
