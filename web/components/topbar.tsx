import { Bell, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex flex-col gap-4 border-b border-border bg-background px-6 py-4 md:flex-row md:items-center">
      <div className="flex flex-1 items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-10" placeholder="Search agents, tasks, logs..." />
        </div>
        <Badge variant="default">workspace: default</Badge>
      </div>
      <div className="flex items-center gap-3 self-end md:self-auto">
        <Button variant="secondary" size="sm">
          Audit stream
        </Button>
        <button
          type="button"
          className="rounded-xl border border-border bg-card p-2 text-muted transition hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
