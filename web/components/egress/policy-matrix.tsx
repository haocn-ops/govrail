"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPolicies } from "@/services/control-plane";

function badgeVariant(decision: string): "strong" | "subtle" | "default" {
  if (decision === "allow") {
    return "strong";
  }
  if (decision === "approval_required") {
    return "subtle";
  }
  return "default";
}

function formatDecision(decision: string): string {
  if (decision === "approval_required") {
    return "approval required";
  }
  return decision;
}

export function PolicyMatrix() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["policies"],
    queryFn: fetchPolicies
  });

  const policies = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Destination policy matrix</CardTitle>
        <CardDescription>Rendered from `GET /api/v1/policies` when the Worker base URL is configured.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted">Loading policies...</p> : null}
        {isError ? <p className="text-sm text-muted">Falling back to preview policy catalog.</p> : null}
        {policies.map((policy) => (
          <div
            key={policy.policy_id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 xl:flex-row xl:items-center xl:justify-between"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {policy.scope.tool_provider_id ?? "global"} / {policy.scope.tool_name ?? "all-tools"}
              </p>
              <p className="mt-1 text-sm text-muted">
                channel {policy.channel} · priority {policy.priority} · status {policy.status}
              </p>
              <p className="mt-1 text-sm text-muted">
                {policy.conditions.target_classification ?? "unclassified"} · risk {policy.conditions.risk_level ?? "n/a"}
              </p>
            </div>
            <Badge variant={badgeVariant(policy.decision)}>{formatDecision(policy.decision)}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
