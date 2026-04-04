import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const metadataRoutes = [
  ["workspace sso", path.resolve(testDir, "../app/api/control-plane/workspace/sso/route.ts")],
  [
    "workspace dedicated environment",
    path.resolve(testDir, "../app/api/control-plane/workspace/dedicated-environment/route.ts"),
  ],
] as const;

const helperizedDetailMutationRoutes = [
  [
    "api key revoke",
    path.resolve(testDir, "../app/api/control-plane/api-keys/[apiKeyId]/revoke/route.ts"),
  ],
  [
    "api key rotate",
    path.resolve(testDir, "../app/api/control-plane/api-keys/[apiKeyId]/rotate/route.ts"),
  ],
  [
    "invitation revoke",
    path.resolve(testDir, "../app/api/control-plane/invitations/[invitationId]/revoke/route.ts"),
  ],
  [
    "service account disable",
    path.resolve(testDir, "../app/api/control-plane/service-accounts/[serviceAccountId]/disable/route.ts"),
  ],
  [
    "tool provider update",
    path.resolve(testDir, "../app/api/control-plane/tool-providers/[toolProviderId]/route.ts"),
  ],
  [
    "tool provider disable",
    path.resolve(testDir, "../app/api/control-plane/tool-providers/[toolProviderId]/disable/route.ts"),
  ],
] as const;

const helperizedWorkspaceScopedPostRoutes = [
  ["invitations create", path.resolve(testDir, "../app/api/control-plane/invitations/route.ts")],
  ["service accounts create", path.resolve(testDir, "../app/api/control-plane/service-accounts/route.ts")],
  ["api keys create", path.resolve(testDir, "../app/api/control-plane/api-keys/route.ts")],
  ["tool providers create", path.resolve(testDir, "../app/api/control-plane/tool-providers/route.ts")],
  ["runs create", path.resolve(testDir, "../app/api/control-plane/runs/route.ts")],
] as const;

const billingRouteHelperPath = path.resolve(
  testDir,
  "../app/api/control-plane/workspace/billing/route-helpers.ts",
);
const runRouteHelperPath = path.resolve(
  testDir,
  "../app/api/control-plane/runs/route-helpers.ts",
);
const helperizedRunDetailRoutes = [
  ["run detail", path.resolve(testDir, "../app/api/control-plane/runs/[runId]/route.ts")],
  ["run graph", path.resolve(testDir, "../app/api/control-plane/runs/[runId]/graph/route.ts")],
  ["run events", path.resolve(testDir, "../app/api/control-plane/runs/[runId]/events/route.ts")],
  ["run artifacts", path.resolve(testDir, "../app/api/control-plane/runs/[runId]/artifacts/route.ts")],
] as const;

async function readRouteSource(routePath: string): Promise<string> {
  return readFile(routePath, "utf8");
}

function assertMetadataGuard(source: string, upstreamPattern: RegExp): void {
  assert.match(
    source,
    /import \{[^\}]*requireMetadataWorkspaceContext[^\}]*\} from "@\/lib\/control-plane-proxy";/,
  );
  assert.match(source, /const metadataGuard = requireMetadataWorkspaceContext\(\{/);
  assert.match(source, /workspaceContext,/);
  assert.match(source, /if \(metadataGuard\) \{\s*return metadataGuard;\s*\}/s);
  assert.match(source, upstreamPattern);
  assert.match(source, /proxyControlPlane\(/);
}

function assertProxyWrapperWithoutDirectFetch(source: string): void {
  assert.match(source, /import \{[^\}]*proxyControlPlane[^\}]*\} from "@\/lib\/control-plane-proxy"/);
  assert.match(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /function getBaseUrl\(/);
  assert.doesNotMatch(source, /await fetch\(/);
}

function assertHelperizedWorkspaceDetailMutationRoute(
  source: string,
  options: {
    helperImportPattern: RegExp;
    pathPattern: RegExp;
  },
): void {
  assert.match(source, options.helperImportPattern);
  assert.match(source, /return proxyWorkspaceScopedDetailPost\(\{/);
  assert.match(source, /request,/);
  assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(/);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /buildProxyControlPlanePostInit\(/);
  assert.doesNotMatch(source, /await fetch\(/);
  assert.match(source, options.pathPattern);
}

function assertHelperizedToolProviderDetailRoute(
  source: string,
  options: {
    helperImportPattern: RegExp;
    invocationPattern: RegExp;
  },
): void {
  assert.match(source, options.helperImportPattern);
  assert.match(source, /return proxyToolProviderPost\(/);
  assert.match(source, options.invocationPattern);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /buildProxyControlPlanePostInit\(/);
  assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(/);
  assert.doesNotMatch(source, /await fetch\(/);
}

function assertHelperizedWorkspaceScopedPostRoute(
  source: string,
  options: {
    pathPattern: RegExp;
    contentTypePattern: RegExp;
    fallbackGetPattern?: RegExp;
  },
): void {
  assert.match(
    source,
    /import \{\s*proxyWorkspaceScopedPostRequest\s*\} from "\.\.\/post-route-helpers";/s,
  );
  assert.match(source, /const workspaceContext = await resolveWorkspaceContextForServer\(\);/);
  assert.match(source, options.contentTypePattern);
  assert.match(source, options.pathPattern);
  assert.match(source, /workspace:\s*workspaceContext\.workspace,/s);
  assert.match(source, /return proxyWorkspaceScopedPostRequest\(\{/);
  assert.doesNotMatch(source, /getControlPlaneBaseUrl\(\)/);
  assert.doesNotMatch(source, /controlPlaneBaseMissingResponse\(\)/);
  assert.doesNotMatch(source, /buildWorkspaceScopedPostHeaders\(\{/);
  assert.doesNotMatch(source, /const body = await request\.text\(\);/);
  assert.doesNotMatch(source, /function getBaseUrl\(\): string/);
  assert.doesNotMatch(source, /await fetch\(/);
  if (options.fallbackGetPattern) {
    assert.match(source, /return proxyControlPlaneOrFallback\(/);
    assert.match(source, options.fallbackGetPattern);
  }
}

function assertMetadataGuardedHelperizedPostRoute(
  source: string,
  options: {
    pathPattern: RegExp;
    helperImportPattern: RegExp;
  },
): void {
  assert.match(source, /import \{[^\}]*proxyControlPlane[^\}]*requireMetadataWorkspaceContext[^\}]*\} from "@\/lib\/control-plane-proxy";/);
  assert.match(source, options.helperImportPattern);
  assert.match(source, /const workspaceContext = await resolveWorkspaceContextForServer\(\);/);
  assert.match(source, /const metadataGuard = requireMetadataWorkspaceContext\(\{/);
  assert.match(source, /if \(metadataGuard\) \{\s*return metadataGuard;\s*\}/s);
  assert.match(source, options.pathPattern);
  assert.match(
    source,
    /init:\s*await buildProxyControlPlanePostInit\(\{\s*request,\s*accept:\s*request\.headers\.get\("accept"\)\s*\?\?\s*null,\s*contentType:\s*request\.headers\.get\("content-type"\)\s*\?\?\s*null,\s*emptyBodyAsUndefined:\s*true,\s*\}\)/s,
  );
  assert.doesNotMatch(source, /const body = await request\.text\(\);/);
  assert.doesNotMatch(source, /method:\s*"POST"/);
  assert.doesNotMatch(source, /const helperInit = await buildProxyControlPlanePostInit\(/);
}

function assertHelperizedRunDetailRoute(
  source: string,
  options: {
    helperImportPattern: RegExp;
    invocationPattern: RegExp;
  },
): void {
  assert.match(source, options.helperImportPattern);
  assert.match(source, /return proxyRunDetailRequest\(\{/);
  assert.match(source, options.invocationPattern);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /new URL\(request\.url\)\.search/);
}

const metadataGetRoutes = [
  ["workspace", path.resolve(testDir, "../app/api/control-plane/workspace/route.ts")],
  ["me", path.resolve(testDir, "../app/api/control-plane/me/route.ts")],
  ["members", path.resolve(testDir, "../app/api/control-plane/members/route.ts")],
] as const;

function assertMetadataGetHelper(source: string, options: { isMe: boolean }): void {
  assert.match(source, /import \{ proxyMetadataGet \} from "\.\.\/get-route-helpers";/);
  assert.match(source, /return proxyMetadataGet\(\{/);
  assert.match(source, /message:\s*"[^"]+"/);
  if (options.isMe) {
    assert.match(source, /getPath:\s*\(\)\s*=>\s*"\/api\/v1\/saas\/me"/);
    assert.match(source, /includeTenant:\s*false/);
  } else {
    assert.match(
      source,
      /getPath:\s*\(workspaceContext\)\s*=>\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}(?:\/members)?`/s,
    );
  }
}

test("metadata-only GET routes reuse shared metadata helper", async () => {
  for (const [name, routePath] of metadataGetRoutes) {
    const source = await readRouteSource(routePath);
    assertMetadataGetHelper(source, { isMe: name === "me" });
  }
});

test("detail mutation routes reuse shared post-init helper without direct fetch boilerplate", async () => {
  for (const [, routePath] of helperizedDetailMutationRoutes) {
    const source = await readRouteSource(routePath);
    const isApiKeyRoute = routePath.includes("/api-keys/[apiKeyId]/");
    const isInvitationRoute = routePath.includes("/invitations/[invitationId]/");
    const isServiceAccountRoute = routePath.includes("/service-accounts/[serviceAccountId]/");
    const isToolProviderDisableRoute = routePath.endsWith("/tool-providers/[toolProviderId]/disable/route.ts");
    const isToolProviderUpdateRoute = routePath.endsWith("/tool-providers/[toolProviderId]/route.ts");

    if (isToolProviderDisableRoute || isToolProviderUpdateRoute) {
      assertHelperizedToolProviderDetailRoute(source, {
        helperImportPattern: isToolProviderDisableRoute
          ? /import \{ proxyToolProviderPost \} from "\.\.\/\.\.\/route-helpers";/
          : /import \{ proxyToolProviderPost \} from "\.\.\/route-helpers";/,
        invocationPattern: isToolProviderDisableRoute
          ? /proxyToolProviderPost\(request,\s*params\.toolProviderId,\s*"disable"\)/
          : /proxyToolProviderPost\(request,\s*params\.toolProviderId\)/,
      });
      continue;
    }

    assertHelperizedWorkspaceDetailMutationRoute(source, {
      helperImportPattern: /import \{ proxyWorkspaceScopedDetailPost \} from "\.\.\/\.\.\/\.\.\/post-route-helpers";/,
      pathPattern: isApiKeyRoute
        ? routePath.endsWith("/revoke/route.ts")
          ? /buildPath:\s*\(workspaceId\)\s*=>\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\/api-keys\/\$\{params\.apiKeyId\}:revoke`/s
          : /buildPath:\s*\(workspaceId\)\s*=>\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\/api-keys\/\$\{params\.apiKeyId\}:rotate`/s
        : isInvitationRoute
          ? /buildPath:\s*\(workspaceId\)\s*=>\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\/invitations\/\$\{params\.invitationId\}:revoke`/s
          : /buildPath:\s*\(workspaceId\)\s*=>\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\/service-accounts\/\$\{params\.serviceAccountId\}:disable`/s,
    });
  }
});

test("workspace create route keeps proxy helper POST passthrough semantics without tenant forwarding", async () => {
  const source = await readRouteSource(path.resolve(testDir, "../app/api/control-plane/workspaces/route.ts"));

  assertProxyWrapperWithoutDirectFetch(source);
  assert.match(source, /import \{ buildWorkspaceCreateProxyInit \} from "\.\/route-helpers";/);
  assert.match(source, /proxyControlPlane\("\/api\/v1\/saas\/workspaces",\s*\{/);
  assert.match(source, /includeTenant:\s*false/);
  assert.match(source, /init:\s*await buildWorkspaceCreateProxyInit\(request\)/);
});

test("workspace bootstrap route keeps proxy helper auth and workspace forwarding semantics", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspaces/[workspaceId]/bootstrap/route.ts"),
  );

  assertProxyWrapperWithoutDirectFetch(source);
  assert.match(source, /import \{ buildWorkspaceBootstrapProxyInit \} from "\.\.\/\.\.\/route-helpers";/);
  assert.match(source, /if \(!workspaceId\) \{\s*return Response\.json\(/s);
  assert.match(source, /includeTenant:\s*false/);
  assert.match(source, /const workspaceContext = await resolveWorkspaceContextForServer\(\);/);
  assert.match(
    source,
    /init:\s*await buildWorkspaceBootstrapProxyInit\(request,\s*\{\s*workspaceId,\s*currentWorkspace:\s*workspaceContext\.workspace,\s*\}\)/s,
  );
  assert.match(source, /proxyControlPlane\(`\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\/bootstrap`,\s*\{/);
});

test("helperized workspace-scoped POST routes keep shared post-route helper contract", async () => {
  for (const [, routePath] of helperizedWorkspaceScopedPostRoutes) {
    const source = await readRouteSource(routePath);
    const isRunsRoute = routePath.endsWith("/runs/route.ts");
    const isToolProvidersRoute = routePath.endsWith("/tool-providers/route.ts");
    const isInvitationsRoute = routePath.endsWith("/invitations/route.ts");
    const isServiceAccountsRoute = routePath.endsWith("/service-accounts/route.ts");
    const isApiKeysRoute = routePath.endsWith("/api-keys/route.ts");

    assertHelperizedWorkspaceScopedPostRoute(source, {
      pathPattern: isRunsRoute
        ? /path:\s*"\/api\/v1\/runs"/
        : isToolProvidersRoute
          ? /path:\s*"\/api\/v1\/tool-providers"/
          : isInvitationsRoute
            ? /path:\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}\/invitations`/
            : isServiceAccountsRoute
              ? /path:\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}\/service-accounts`/
              : /path:\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}\/api-keys`/,
      contentTypePattern: isRunsRoute
        ? /contentType:\s*request\.headers\.get\("content-type"\) \?\? "application\/json"/
        : /request,/,
      fallbackGetPattern: isRunsRoute
        ? undefined
        : isToolProvidersRoute
          ? /return proxyControlPlaneOrFallback\(\s*"\/api\/v1\/tool-providers"/s
          : isInvitationsRoute
            ? /return proxyControlPlaneOrFallback\(\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}\/invitations`/s
            : isServiceAccountsRoute
              ? /return proxyControlPlaneOrFallback\(\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}\/service-accounts`/s
              : /return proxyControlPlaneOrFallback\(\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}\/api-keys`/s,
    });
  }
});

const runDetailRoutes = [
  ["", path.resolve(testDir, "../app/api/control-plane/runs/[runId]/route.ts")],
  ["/graph", path.resolve(testDir, "../app/api/control-plane/runs/[runId]/graph/route.ts")],
  ["/events", path.resolve(testDir, "../app/api/control-plane/runs/[runId]/events/route.ts")],
  ["/artifacts", path.resolve(testDir, "../app/api/control-plane/runs/[runId]/artifacts/route.ts")],
] as const;

function assertRunDetailHelper(source: string, suffix: string): void {
  assert.match(
    source,
    /import \{ proxyRunDetailRequest \} from "\.\.\/(?:\.\.\/)?route-helpers";/,
  );
  assert.match(source, /return proxyRunDetailRequest\(/);
  assert.match(source, /runId\s*:\s*params\.runId/);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /new URL\(request\.url\)/);
  if (suffix) {
    assert.match(source, new RegExp(`suffix\\s*:\\s*"${suffix.replace("/", "\\/")}"`));
  } else {
    assert.doesNotMatch(source, /suffix\s*:/);
  }
}

test("run detail routes reuse shared helper for path/query passthrough", async () => {
  for (const [suffix, routePath] of runDetailRoutes) {
    const source = await readRouteSource(routePath);
    assertRunDetailHelper(source, suffix);
  }
});

test("invitation accept route requires trusted auth headers and reuses shared post-route helper semantics", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/invitations/accept/route.ts"),
  );

  assert.match(source, /import \{ headers \} from "next\/headers";/);
  assert.match(
    source,
    /import \{ controlPlaneErrorResponse \} from "@\/lib\/control-plane-proxy";/,
  );
  assert.match(
    source,
    /import \{ resolveTrustedInvitationAcceptAuth \} from "\.\/auth";/,
  );
  assert.match(
    source,
    /import \{\s*proxyAuthenticatedPostRequest\s*\} from "\.\.\/\.\.\/post-route-helpers";/s,
  );
  assert.match(source, /const requestHeaders = await headers\(\);/);
  assert.match(source, /const auth = resolveTrustedInvitationAcceptAuth\(requestHeaders\);/);
  assert.match(
    source,
    /if \(!auth\) \{\s*return controlPlaneErrorResponse\(\{\s*status:\s*401,\s*code:\s*"unauthorized",\s*message:\s*"Invitation acceptance requires an authenticated subject",\s*\}\);\s*\}/s,
  );
  assert.match(
    source,
    /return proxyAuthenticatedPostRequest\(\{\s*request,\s*path:\s*"\/api\/v1\/saas\/invitations:accept",\s*subjectId:\s*auth\.subjectId,\s*subjectRoles:\s*auth\.subjectRoles,\s*contentType:\s*"application\/json",\s*\}\)/s,
  );
  assert.doesNotMatch(source, /getControlPlaneBaseUrl\(\)/);
  assert.doesNotMatch(source, /controlPlaneBaseMissingResponse\(\)/);
  assert.doesNotMatch(source, /buildAuthenticatedPostHeaders\(\{/);
  assert.doesNotMatch(source, /const body = await request\.text\(\);/);
  assert.doesNotMatch(source, /function getBaseUrl\(\): string/);
  assert.doesNotMatch(source, /function getFallbackSubjectId\(\): string/);
  assert.doesNotMatch(source, /function getFallbackSubjectRoles\(\): string/);
  assert.doesNotMatch(source, /await fetch\(/);
});

test("metadata-guarded enterprise POST routes reuse shared post-init helper", async () => {
  const ssoSource = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspace/sso/route.ts"),
  );
  assertMetadataGuardedHelperizedPostRoute(ssoSource, {
    helperImportPattern:
      /import \{ buildProxyControlPlanePostInit \} from "\.\.\/post-route-helpers";/,
    pathPattern:
      /proxyControlPlane\(`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}\/sso`,\s*\{/s,
  });
  assert.match(
    ssoSource,
    /buildProxyControlPlanePostInit\(\{\s*request,\s*accept:\s*request\.headers\.get\("accept"\)\s*\?\?\s*null,\s*contentType:\s*request\.headers\.get\("content-type"\)\s*\?\?\s*null,\s*emptyBodyAsUndefined:\s*true,\s*\}\)/s,
  );

  const dedicatedSource = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspace/dedicated-environment/route.ts"),
  );
  assertMetadataGuardedHelperizedPostRoute(dedicatedSource, {
    helperImportPattern:
      /import \{ buildProxyControlPlanePostInit \} from "\.\.\/post-route-helpers";/,
    pathPattern:
      /proxyControlPlane\(\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceContext\.workspace\.workspace_id\}\/dedicated-environment`,\s*\{/s,
  });
  assert.match(
    dedicatedSource,
    /buildProxyControlPlanePostInit\(\{\s*request,\s*accept:\s*request\.headers\.get\("accept"\)\s*\?\?\s*null,\s*contentType:\s*request\.headers\.get\("content-type"\)\s*\?\?\s*null,\s*emptyBodyAsUndefined:\s*true,\s*\}\)/s,
  );
});

test("billing POST helper reuses shared POST init builder", async () => {
  const source = await readRouteSource(billingRouteHelperPath);
  assert.match(source, /import \{ buildProxyControlPlanePostInit \} from "\.\.\/post-route-helpers";/);
  assert.match(
    source,
    /return buildProxyControlPlanePostInit\(\{\s*request,\s*accept:\s*request\.headers\.get\("accept"\)\s*\?\?\s*undefined,\s*contentType:\s*request\.headers\.get\("content-type"\)\s*\?\?\s*undefined,\s*\}\)/s,
  );
});

test("run detail GET routes reuse shared run-route helper", async () => {
  const helperSource = await readRouteSource(runRouteHelperPath);
  assert.match(
    helperSource,
    /import \{ proxyControlPlane \} from "(?:@\/lib|(?:\.\.\/)+lib)\/control-plane-proxy";/,
  );
  assert.match(helperSource, /export function buildRunPath\(runId: string,\s*suffix\?: string\): string/);
  assert.match(helperSource, /const base = `\/api\/v1\/runs\/\$\{runId\}`;/);
  assert.match(helperSource, /return suffix \? `\$\{base\}\$\{suffix\}` : base;/);
  assert.match(helperSource, /const search = new URL\(request\.url\)\.search;/);
  assert.match(helperSource, /return proxy\(path\);/);

  for (const [, routePath] of helperizedRunDetailRoutes) {
    const source = await readRouteSource(routePath);
    const isGraphRoute = routePath.endsWith("/graph/route.ts");
    const isEventsRoute = routePath.endsWith("/events/route.ts");
    const isArtifactsRoute = routePath.endsWith("/artifacts/route.ts");
    const expectsSuffix = isGraphRoute
      ? "/graph"
      : isEventsRoute
        ? "/events"
        : isArtifactsRoute
          ? "/artifacts"
          : "";
    assert.match(
      source,
      new RegExp(
        `import \\{ proxyRunDetailRequest \\} from "\\.\\./(?:\\.\\./)?route-helpers";`,
      ),
    );
    assert.match(
      source,
      new RegExp(
        `proxyRunDetailRequest\\(\\{\\s*(?:request:\\s*_request|request),\\s*runId:\\s*params\\.runId${
          expectsSuffix ? `,\\s*suffix:\\s*"${expectsSuffix}"` : ""
        }\\s*\\}\\);`,
      ),
    );
    assert.doesNotMatch(source, /proxyControlPlane\(|new URL\(request\.url\)/);
  }
});

test("workspace delivery route keeps fallback GET contract and POST passthrough semantics", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspace/delivery/route.ts"),
  );

  assert.match(source, /import type \{ ControlPlaneWorkspaceDeliveryTrack \} from "@\/lib\/control-plane-types";/);
  assert.match(source, /import \{ proxyFallbackGet \} from "\.\.\/\.\.\/fallback-route-helpers";/);
  assert.match(source, /import \{ proxyControlPlane \} from "@\/lib\/control-plane-proxy";/);
  assert.match(
    source,
    /function buildFallbackTrack\(workspaceId: string,\s*upstreamStatus: number\): ControlPlaneWorkspaceDeliveryTrack/,
  );
  assert.match(source, /return proxyFallbackGet\(\{/);
  assert.match(source, /path:\s*`\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\/delivery`/);
  assert.match(source, /includeTenant:\s*true/);
  assert.match(
    source,
    /buildFallback:\s*\(upstream\)\s*=>\s*\(\{\s*data:\s*buildFallbackTrack\(workspaceId,\s*upstream\.status\),/s,
  );
  assert.match(
    source,
    /import \{ buildProxyControlPlanePostInit \} from "\.\.\/post-route-helpers";/,
  );
  assert.match(
    source,
    /init:\s*await buildProxyControlPlanePostInit\(\{\s*request,\s*contentType:\s*"application\/json",\s*emptyBodyAsUndefined:\s*true,\s*\}\)/s,
  );
  assert.doesNotMatch(source, /const body = await request\.text\(\);/);
  assert.doesNotMatch(source, /method:\s*"POST"/);
});

test("admin overview route keeps includeTenant=false fallback summary contract", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/admin/overview/route.ts"),
  );

  assert.match(source, /import \{ proxyFallbackGet \} from "\.\.\/\.\.\/fallback-route-helpers";/);
  assert.match(source, /return proxyFallbackGet\(\{/);
  assert.match(source, /path:\s*"\/api\/v1\/saas\/admin\/overview"/);
  assert.match(source, /includeTenant:\s*false/);
  assert.match(source, /paid_subscriptions_total:\s*0/);
  assert.match(source, /past_due_subscriptions_total:\s*0/);
  assert.match(source, /next_action_surface:\s*"verification"/);
  assert.match(source, /next_action_surface:\s*"onboarding"/);
});
