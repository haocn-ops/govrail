import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AdminReadinessReturnBanner({
  focusLabel,
  clearHref,
  focusHint,
  followUpHref,
  followUpLabel,
}: {
  focusLabel: string;
  clearHref: string | null;
  focusHint?: string | null;
  followUpHref?: string | null;
  followUpLabel?: string | null;
}) {
  if (!focusLabel) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Returned from Week 8 readiness</span>
          <Badge variant="default">Focus restored</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted">
          We kept the "{focusLabel}" readiness focus so you can continue the governance review without losing the
          context. The follow-up list below still reflects the active focus.
        </p>
        {focusHint ? <p className="text-xs text-muted">{focusHint}</p> : null}
        <p className="text-xs text-muted">
          Use this banner after you come back from onboarding, verification, settings, usage, or the mock go-live
          drill. It restores the filtered admin view only; it does not imply that any follow-up was auto-resolved.
        </p>
        {clearHref || (followUpHref && followUpLabel) ? (
          <div className="flex flex-wrap gap-2">
            {followUpHref && followUpLabel ? (
              <Link
                href={followUpHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                {followUpLabel}
              </Link>
            ) : null}
            {clearHref ? (
              <Link
                href={clearHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                Clear readiness focus
              </Link>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
