import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { artifactRows } from "@/lib/mock-data";

export default function ArtifactsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Artifacts"
        title="Generated output and evidence"
        description="Review persisted bundles, workflow outputs, and audit payloads for traceable agent execution."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {artifactRows.map((artifact) => (
          <Card key={artifact.name}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{artifact.name}</CardTitle>
                <Badge variant="subtle">{artifact.type}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted">
              <p>Run: {artifact.runId}</p>
              <p>Size: {artifact.size}</p>
              <p>Updated: {artifact.updatedAt}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
