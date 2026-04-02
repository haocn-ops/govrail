import { PlaygroundPanel } from "@/components/playground/playground-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PlaygroundPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Playground"
        title="Prompt, invoke, inspect"
        description="Use a Monaco-backed request editor to invoke the control plane and inspect structured output."
      />
      <PlaygroundPanel />
      <Card>
        <CardHeader>
          <CardTitle>Supported endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-xs text-muted">
          <p>POST /invoke</p>
          <p>GET /status/:thread_id</p>
          <p>GET /result/:thread_id</p>
        </CardContent>
      </Card>
    </div>
  );
}
