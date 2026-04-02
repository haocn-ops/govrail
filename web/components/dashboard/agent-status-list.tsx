import { Play, RotateCcw, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { agentRows } from "@/lib/mock-data";

function statusVariant(status: string): "strong" | "subtle" | "default" {
  if (status === "Running") return "strong";
  if (status === "Degraded") return "subtle";
  return "default";
}

export function AgentStatusList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Lifecycle</CardTitle>
        <CardDescription>Inspect desired state, active workload, and control actions for every agent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {agentRows.map((agent) => (
          <div
            key={agent.name}
            className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-4 xl:flex-row xl:items-center xl:justify-between"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-foreground">{agent.name}</p>
                <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
                <Badge variant="default">{agent.region}</Badge>
              </div>
              <p className="text-sm text-muted">
                {agent.tasks} active tasks · desired state {agent.desiredState} · version {agent.version}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm">
                <Play className="mr-2 h-4 w-4" />
                Start
              </Button>
              <Button variant="secondary" size="sm">
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
              <Button variant="secondary" size="sm">
                <RotateCcw className="mr-2 h-4 w-4" />
                Restart
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
