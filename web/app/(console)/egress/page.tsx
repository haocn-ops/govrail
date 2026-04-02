import { PolicyMatrix } from "@/components/egress/policy-matrix";
import { PageHeader } from "@/components/page-header";

export default function EgressPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Egress"
        title="Outbound permission control"
        description="Review which destinations are allowed, denied, or routed through approval-required policy."
      />
      <PolicyMatrix />
    </div>
  );
}
