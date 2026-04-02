import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Workspace configuration"
        description="Tune tenancy, logging retention, approval defaults, and deployment preferences."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input defaultValue="govrail-production" />
            <Input defaultValue="govrail-control-plane" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Approval defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>Default approver role: legal_approver</p>
            <p>Default timeout: 24h</p>
            <p>Escalation path: platform_admin</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Observability and retention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>Structured audit events retain the original trace and request identifiers.</p>
          <p>Log retention target: 30 days for hot access, 180 days for archived audit review.</p>
          <p>Artifact retention is policy-controlled and should stay aligned with workspace compliance settings.</p>
        </CardContent>
      </Card>
    </div>
  );
}
