"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchHealth } from "@/services/control-plane";

export function ServiceHealthCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["control-plane-health"],
    queryFn: fetchHealth,
    refetchInterval: 15_000
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service health</CardTitle>
        <CardDescription>Live status from the Worker API health endpoint.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4">
          <div>
            <p className="text-muted">Status</p>
            <p className="mt-1 font-medium text-foreground">
              {isLoading ? "Checking" : isError ? "Unavailable" : data?.ok ? "Healthy" : "Degraded"}
            </p>
          </div>
          <Badge variant={data?.ok ? "strong" : "default"}>{isError ? "error" : "health"}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Service</p>
            <p className="mt-1 font-medium text-foreground">{data?.service ?? "govrail-control-plane"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Version</p>
            <p className="mt-1 font-medium text-foreground">{data?.version ?? "unknown"}</p>
          </div>
        </div>
        <p className="text-xs text-muted">
          {isError
            ? "Health endpoint did not return successfully."
            : `Last update: ${data?.now ?? "waiting for first response"}`}
        </p>
      </CardContent>
    </Card>
  );
}
