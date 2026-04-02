import { ArrowUpRight, ShieldCheck, TimerReset, Workflow } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardStats } from "@/lib/mock-data";

const icons = [Workflow, TimerReset, ShieldCheck, ArrowUpRight];

export function StatsCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {dashboardStats.map((stat, index) => {
        const Icon = icons[index] ?? Workflow;
        return (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted">{stat.label}</p>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </div>
              <div className="rounded-2xl border border-border bg-background p-3 text-foreground">
                <Icon className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">{stat.detail}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
