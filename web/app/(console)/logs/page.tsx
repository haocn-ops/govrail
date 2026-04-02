import { LogStream } from "@/components/logs/log-stream";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LogsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Logs"
        title="Realtime and historical logs"
        description="Tail workflow, approval, proxy, and dispatch logs with an operator-friendly terminal view."
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Live stream</CardTitle>
          <Badge variant="subtle">tailing</Badge>
        </CardHeader>
        <CardContent>
          <LogStream />
        </CardContent>
      </Card>
    </div>
  );
}
