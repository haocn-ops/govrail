"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReadinessTone = "ready" | "in_progress" | "blocked";

function toneVariant(tone: ReadinessTone): "strong" | "default" | "subtle" {
  if (tone === "ready") {
    return "strong";
  }
  if (tone === "in_progress") {
    return "default";
  }
  return "subtle";
}

function toneLabel(tone: ReadinessTone): string {
  if (tone === "ready") {
    return "Ready";
  }
  if (tone === "in_progress") {
    return "In progress";
  }
  return "Blocked";
}

export function ReadinessTile({
  title,
  detail,
  hint,
  meta,
  tone,
}: {
  title: string;
  detail: string;
  hint: string;
  meta?: string;
  tone: ReadinessTone;
}) {
  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant={toneVariant(tone)}>{toneLabel(tone)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-sm">
        <p className="font-medium text-foreground">{detail}</p>
        {meta ? (
          <p className="inline-flex w-fit items-center rounded-full border border-border bg-background px-2 py-1 text-[0.65rem] uppercase tracking-[0.12em] text-muted">
            {meta}
          </p>
        ) : null}
        <p className="text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}
