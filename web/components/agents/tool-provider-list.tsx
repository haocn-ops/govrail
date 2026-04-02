"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchToolProviders } from "@/services/control-plane";

function badgeVariant(status: string): "strong" | "default" {
  return status === "active" ? "strong" : "default";
}

export function ToolProviderList() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tool-providers"],
    queryFn: fetchToolProviders
  });

  const providers = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected providers</CardTitle>
        <CardDescription>Live inventory from `GET /api/v1/tool-providers` when base URL is configured.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted">Loading providers...</p> : null}
        {isError ? <p className="text-sm text-muted">Falling back to preview provider inventory.</p> : null}
        {providers.map((provider) => (
          <div key={provider.tool_provider_id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{provider.name}</p>
                <p className="mt-1 text-xs text-muted">{provider.tool_provider_id}</p>
              </div>
              <Badge variant={badgeVariant(provider.status)}>{provider.status}</Badge>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
              <p>Type: {provider.provider_type}</p>
              <p>Endpoint: {provider.endpoint_url}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
