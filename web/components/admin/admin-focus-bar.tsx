import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FocusChip = {
  label: string;
  value?: string | null;
  clearHref?: string | null;
};

export function AdminFocusBar({
  surface,
  readiness,
  organization,
  workspace,
  queueReturned,
  readinessReturned,
  clearSurfaceHref,
  clearReadinessHref,
  clearOrganizationHref,
  clearWorkspaceHref,
  clearQueueReturnedHref,
  clearReadinessReturnedHref,
  clearAllHref,
}: {
  surface?: string | null;
  readiness?: string | null;
  organization?: string | null;
  workspace?: string | null;
  queueReturned?: boolean;
  readinessReturned?: boolean;
  clearSurfaceHref?: string | null;
  clearReadinessHref?: string | null;
  clearOrganizationHref?: string | null;
  clearWorkspaceHref?: string | null;
  clearQueueReturnedHref?: string | null;
  clearReadinessReturnedHref?: string | null;
  clearAllHref?: string | null;
}) {
  const chips: FocusChip[] = [];

  if (surface) {
    chips.push({
      label: "Surface",
      value: surface,
      clearHref: clearSurfaceHref ?? null,
    });
  }
  if (readiness) {
    chips.push({
      label: "Week 8",
      value: readiness,
      clearHref: clearReadinessHref ?? null,
    });
  }
  if (organization) {
    chips.push({
      label: "Organization",
      value: organization,
      clearHref: clearOrganizationHref ?? null,
    });
  }
  if (workspace) {
    chips.push({
      label: "Workspace",
      value: workspace,
      clearHref: clearWorkspaceHref ?? null,
    });
  }
  if (queueReturned) {
    chips.push({
      label: "Follow-up return",
      value: "Returned from follow-up",
      clearHref: clearQueueReturnedHref ?? null,
    });
  }
  if (readinessReturned) {
    chips.push({
      label: "Readiness return",
      value: "Returned from readiness",
      clearHref: clearReadinessReturnedHref ?? null,
    });
  }

  if (!chips.length) {
    return null;
  }

  return (
    <Card className="scroll-mt-36 rounded-2xl border border-border bg-background shadow-sm lg:scroll-mt-44">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Governance focus</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted">
        <p>
          These chips preserve the current admin review scope across readiness drill-down, workspace follow-up, and
          return navigation. Clear one dimension at a time when you want to widen the view again.
        </p>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <div
              key={`${chip.label}:${chip.value}`}
              className="flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1"
            >
              <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                {chip.label}
              </span>
              <span className="text-xs font-medium text-foreground">{chip.value}</span>
              {chip.clearHref ? (
                <Link
                  href={chip.clearHref}
                  className="scroll-mt-36 rounded-full border border-border p-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-muted hover:text-foreground lg:scroll-mt-44"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          ))}
        </div>
        {clearAllHref ? (
          <div>
            <Link
              href={clearAllHref}
              className="scroll-mt-36 text-[0.65rem] font-medium text-foreground underline underline-offset-4 lg:scroll-mt-44"
            >
              Clear all focus
            </Link>
          </div>
        ) : null}
        <p>
          Navigation only: changing or clearing focus restores the admin view state, but it does not automate any
          remediation or alter workspace data by itself.
        </p>
      </CardContent>
    </Card>
  );
}
