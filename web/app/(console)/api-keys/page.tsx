import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiKeyRows } from "@/lib/mock-data";

export default function ApiKeysPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="API Keys"
        title="Credential lifecycle"
        description="Manage API keys, ownership metadata, scopes, and rotation windows for the control plane."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Key name" />
            <Input placeholder="Scope (for example: invoke, logs:read)" />
            <Button>Create key</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Existing keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {apiKeyRows.map((key) => (
              <div key={key.name} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{key.name}</p>
                  <Badge variant="default">{key.owner}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">{key.scope}</p>
                <p className="mt-3 text-xs text-muted">Rotated: {key.rotatedAt}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
