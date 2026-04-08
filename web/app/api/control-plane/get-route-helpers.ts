import { proxyControlPlane, requireMetadataWorkspaceContext } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer, type WorkspaceContext } from "@/lib/workspace-context";

export type MetadataGetArgs = {
  getPath: (workspaceContext: WorkspaceContext) => string;
  includeTenant?: boolean;
  message: string;
};

export async function proxyMetadataGet(
  args: MetadataGetArgs,
  options?: {
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: typeof proxyControlPlane;
    metadataGuard?: typeof requireMetadataWorkspaceContext;
  },
): Promise<Response> {
  const resolveWorkspaceContext =
    options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxy = options?.proxy ?? proxyControlPlane;
  const metadataGuard =
    options?.metadataGuard ?? requireMetadataWorkspaceContext;
  const workspaceContext = await resolveWorkspaceContext();
  const guardResponse = metadataGuard({
    workspaceContext,
    message: args.message,
  });
  if (guardResponse) {
    return guardResponse;
  }

  return proxy(args.getPath(workspaceContext), {
    includeTenant: args.includeTenant,
    workspaceContext,
  });
}
