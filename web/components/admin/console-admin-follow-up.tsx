import {
  AdminFollowUpNotice,
  type AdminFollowUpSurface,
} from "@/components/admin/admin-follow-up-notice";
import {
  buildConsoleAdminFollowUpPayload,
  type ConsoleAdminFollowUpPayload,
  type ConsoleHandoffState,
} from "@/lib/console-handoff";

type ConsoleAdminFollowUpProps = {
  handoff: ConsoleHandoffState;
  surface: AdminFollowUpSurface;
  workspaceSlug: string;
  payload?: ConsoleAdminFollowUpPayload | null;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
};

export function ConsoleAdminFollowUp({
  handoff,
  surface,
  workspaceSlug,
  payload: payloadOverride,
  ownerDisplayName = handoff.recentOwnerDisplayName ?? handoff.recentOwnerLabel,
  ownerEmail = handoff.recentOwnerEmail,
}: ConsoleAdminFollowUpProps) {
  const defaultPayload = buildConsoleAdminFollowUpPayload({
    handoff,
    ownerDisplayName,
    ownerEmail,
  });
  const payload = payloadOverride
    ? {
        ...(defaultPayload ?? {}),
        ...payloadOverride,
        ownerDisplayName: payloadOverride.ownerDisplayName ?? defaultPayload?.ownerDisplayName ?? null,
        ownerEmail: payloadOverride.ownerEmail ?? defaultPayload?.ownerEmail ?? null,
      }
    : defaultPayload;
  if (!payload) {
    return null;
  }

  return (
    <AdminFollowUpNotice
      surface={surface}
      workspaceSlug={workspaceSlug}
      sourceWorkspaceSlug={handoff.attentionWorkspace}
      runId={handoff.runId}
      auditReceiptFilename={handoff.auditReceiptFilename}
      auditReceiptExportedAt={handoff.auditReceiptExportedAt}
      auditReceiptFromDate={handoff.auditReceiptFromDate}
      auditReceiptToDate={handoff.auditReceiptToDate}
      auditReceiptSha256={handoff.auditReceiptSha256}
      {...payload}
    />
  );
}
