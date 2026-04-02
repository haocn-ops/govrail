import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auditSignals } from "@/lib/mock-data";

export function ActivityFeed() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent signals</CardTitle>
        <CardDescription>Operational notes that need an operator eye before the next change window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {auditSignals.map((signal) => (
          <div key={signal.title} className="rounded-2xl border border-border bg-background p-4">
            <p className="text-sm font-medium text-foreground">{signal.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{signal.detail}</p>
            <p className="mt-3 text-xs text-muted">{signal.timestamp}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
