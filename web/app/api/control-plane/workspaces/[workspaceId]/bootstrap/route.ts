import { proxyWorkspaceBootstrapPost } from "../../route-helpers";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } },
) {
  const workspaceId = params.workspaceId.trim();
  if (!workspaceId) {
    return Response.json(
      {
        error: {
          code: "invalid_workspace_id",
          message: "workspaceId is required",
        },
      },
      { status: 400 },
    );
  }

  return proxyWorkspaceBootstrapPost(request, { workspaceId });
}
