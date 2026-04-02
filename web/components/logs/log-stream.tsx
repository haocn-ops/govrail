"use client";

import { logLines } from "@/lib/mock-data";

export function LogStream() {
  return (
    <div className="rounded-2xl border border-border bg-background p-4 font-mono text-xs leading-6 text-foreground">
      {logLines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
