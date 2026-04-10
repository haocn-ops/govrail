import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const metadataRoutes = [
  {
    name: "workspace sso",
    routePath: path.resolve(testDir, "../app/api/control-plane/workspace/sso/route.ts"),
    suffix: "/sso",
    metadataMessage:
      "Workspace SSO updates require metadata-backed SaaS context. Preview and env fallback modes are disabled for this endpoint.",
  },
  {
    name: "workspace dedicated environment",
    routePath: path.resolve(
      testDir,
      "../app/api/control-plane/workspace/dedicated-environment/route.ts",
    ),
    suffix: "/dedicated-environment",
    metadataMessage:
      "Dedicated environment updates require metadata-backed SaaS context. Preview and env fallback modes are disabled for this endpoint.",
  },
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
const collectionRouteHelperPath = path.resolve(
  testDir,
  "../app/api/control-plane/collection-route-helpers.ts",
);
const systemRouteHelperPath = path.resolve(
  testDir,
  "../app/api/control-plane/system-route-helpers.ts",
);
const toolProviderRouteHelperPath = path.resolve(
  testDir,
  "../app/api/control-plane/tool-providers/route-helpers.ts",
);
const runRouteHelperPath = path.resolve(
  testDir,
  "../app/api/control-plane/runs/route-helpers.ts",
);
const workspaceRouteHelperPath = path.resolve(
  testDir,
  "../app/api/control-plane/workspaces/route-helpers.ts",
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

function assertEnterpriseGetHelper(source: string, options: { suffix: string }): void {
  assert.match(
    source,
    /import \{ proxyWorkspaceEnterpriseGet, proxyWorkspaceEnterprisePost \} from "\.\.\/route-helpers";/,
  );
  assert.match(source, new RegExp(`return proxyWorkspaceEnterpriseGet\\("${options.suffix}"\\);`));
}

function assertEnterprisePostHelper(
  source: string,
  options: { suffix: string; metadataMessage: string },
): void {
  assert.match(
    source,
    /import \{ proxyWorkspaceEnterpriseGet, proxyWorkspaceEnterprisePost \} from "\.\.\/route-helpers";/,
  );
  assert.match(source, new RegExp(`return proxyWorkspaceEnterprisePost\\({[\\s\\S]*suffix: "${options.suffix}"`));
  assert.match(source, new RegExp(options.metadataMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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
    collectionGetSuffixPattern?: RegExp;
    collectionGetPathPattern?: RegExp;
    collectionPostSuffixPattern?: RegExp;
    collectionPostPathPattern?: RegExp;
  },
): void {
  if (options.collectionPostSuffixPattern || options.collectionPostPathPattern) {
    if (options.collectionPostSuffixPattern) {
      assert.match(
        source,
        /import \{[\s\S]*proxyWorkspaceScopedCollectionPost[\s\S]*\} from "\.\.\/collection-route-helpers";/s,
      );
      assert.match(source, /return proxyWorkspaceScopedCollectionPost\(\{/);
      assert.match(source, options.collectionPostSuffixPattern);
    }
    if (options.collectionPostPathPattern) {
      assert.match(
        source,
        /import \{[\s\S]*proxyWorkspaceContextCollectionPost[\s\S]*\} from "\.\.\/collection-route-helpers";/s,
      );
      assert.match(source, /return proxyWorkspaceContextCollectionPost\(\{/);
      assert.match(source, options.collectionPostPathPattern);
    }
    assert.match(source, options.contentTypePattern);
    assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(\);/);
    assert.doesNotMatch(source, /proxyWorkspaceScopedPostRequest\(\{/);
  } else {
    assert.match(
      source,
      /import \{\s*proxyWorkspaceScopedPostRequest\s*\} from "\.\.\/post-route-helpers";/s,
    );
    assert.match(source, /const workspaceContext = await resolveWorkspaceContextForServer\(\);/);
    assert.match(source, options.contentTypePattern);
    assert.match(source, options.pathPattern);
    assert.match(source, /workspace:\s*workspaceContext\.workspace,/s);
    assert.match(source, /return proxyWorkspaceScopedPostRequest\(\{/);
  }
  assert.doesNotMatch(source, /getControlPlaneBaseUrl\(\)/);
  assert.doesNotMatch(source, /controlPlaneBaseMissingResponse\(\)/);
  assert.doesNotMatch(source, /buildWorkspaceScopedPostHeaders\(\{/);
  assert.doesNotMatch(source, /const body = await request\.text\(\);/);
  assert.doesNotMatch(source, /function getBaseUrl\(\): string/);
  assert.doesNotMatch(source, /await fetch\(/);
  if (options.collectionGetSuffixPattern) {
    assert.match(
      source,
      /import \{[\s\S]*proxyWorkspaceScopedCollectionGet[\s\S]*\} from "\.\.\/collection-route-helpers";/s,
    );
    assert.match(source, /return proxyWorkspaceScopedCollectionGet\(\{/);
    assert.match(source, options.collectionGetSuffixPattern);
    assert.doesNotMatch(source, /proxyControlPlaneOrFallback\(/);
  }
  if (options.collectionGetPathPattern) {
    assert.match(
      source,
      /import \{[\s\S]*proxyPathCollectionGet[\s\S]*\} from "\.\.\/collection-route-helpers";/s,
    );
    assert.match(source, /return proxyPathCollectionGet\(\{/);
    assert.match(source, options.collectionGetPathPattern);
    assert.doesNotMatch(source, /proxyControlPlaneOrFallback\(/);
  }
}

function assertMetadataGuardedHelperizedPostRoute(
  source: string,
  options: { suffix: string; metadataMessage: string },
): void {
  assert.match(
    source,
    /import \{ proxyWorkspaceEnterpriseGet, proxyWorkspaceEnterprisePost \} from "\.\.\/route-helpers";/,
  );
  assert.match(source, /export async function POST\(request: Request\)/);
  assert.match(source, /return proxyWorkspaceEnterprisePost\({/);
  assert.match(source, new RegExp(`suffix: "${options.suffix}"`));
  assert.match(source, new RegExp(options.metadataMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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

test("metadata GET helper keeps shared resolver, guard, and proxy injection points", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/get-route-helpers.ts"),
  );

  assert.match(
    source,
    /import \{ proxyControlPlane, requireMetadataWorkspaceContext \} from "@\/lib\/control-plane-proxy";/,
  );
  assert.match(
    source,
    /import \{ resolveWorkspaceContextForServer, type WorkspaceContext \} from "@\/lib\/workspace-context";/,
  );
  assert.match(source, /export function proxyPathGet\(/);
  assert.match(source, /return proxy\(args\.path,\s*\{/);
  assert.match(source, /export function proxyRequestPathGet\(/);
  assert.match(source, /const search = new URL\(args\.request\.url\)\.search;/);
  assert.match(source, /return proxyPathGet\(\{/);
  assert.match(source, /export function proxyWorkspaceContextGet\(/);
  assert.match(source, /return proxy\(args\.getPath\(args\.workspaceContext\),\s*\{/);
  assert.match(source, /workspaceContext:\s*args\.workspaceContext/);
  assert.match(source, /export async function proxyWorkspaceScopedGet\(/);
  assert.match(source, /return proxyWorkspaceContextGet\(\{/);
  assert.match(source, /\.\.\.args,\s*workspaceContext,/s);
  assert.match(source, /export async function proxyMetadataGet\(/);
  assert.match(
    source,
    /const resolveWorkspaceContext =\s*options\?\.resolveWorkspaceContext \?\? resolveWorkspaceContextForServer;/,
  );
  assert.match(source, /const proxy = options\?\.proxy \?\? proxyControlPlane;/);
  assert.match(
    source,
    /const metadataGuard =\s*options\?\.metadataGuard \?\? requireMetadataWorkspaceContext;/,
  );
  assert.match(source, /const workspaceContext = await resolveWorkspaceContext\(\);/);
  assert.match(source, /const guardResponse = metadataGuard\(\{/);
  assert.match(source, /if \(guardResponse\) \{\s*return guardResponse;\s*\}/s);
  assert.match(source, /return proxyWorkspaceContextGet\(\{/);
  assert.match(source, /getPath:\s*args\.getPath/);
  assert.doesNotMatch(source, /await fetch\(/);
});

test("workspace enterprise routes reuse shared enterprise helpers", async () => {
  for (const route of metadataRoutes) {
    const source = await readRouteSource(route.routePath);

    assertEnterpriseGetHelper(source, { suffix: route.suffix });
    assertEnterprisePostHelper(source, {
      suffix: route.suffix,
      metadataMessage: route.metadataMessage,
    });
  }
});

test("workspace audit export route reuses shared enterprise GET helper for query and accept passthrough", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspace/audit-events/export/route.ts"),
  );

  assert.match(
    source,
    /import \{[^}]*proxyWorkspaceEnterpriseGet[^}]*\} from "\.\.\/\.\.\/route-helpers";/,
  );
  assert.match(source, /auditExportAcceptHeader/);
  assert.match(source, /return proxyWorkspaceEnterpriseGet\("\/audit-events:export",\s*\{/);
  assert.match(source, /request,/);
  assert.match(source, /defaultAccept:\s*auditExportAcceptHeader/);
  assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(/);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /new URL\(request\.url\)/);
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

test("tool provider detail helper delegates workspace-context POST wiring to the shared detail helper", async () => {
  const source = await readRouteSource(toolProviderRouteHelperPath);

  assert.match(
    source,
    /import \{[\s\S]*proxyWorkspaceScopedDetailPost[\s\S]*\} from "\.\.\/post-route-helpers";/s,
  );
  assert.match(source, /return proxyWorkspaceScopedDetailPost\(\{/);
  assert.match(source, /buildPath:\s*\(\)\s*=>\s*buildToolProviderPath\(toolProviderId,\s*action\)/);
  assert.match(source, /initBuilder:\s*\(\{\s*request\s*\}\)\s*=>\s*initBuilder\(request\)/);
  assert.doesNotMatch(source, /const workspaceContext = await resolveWorkspaceContext\(\);/);
});

test("workspace create route delegates proxy wiring to route helper", async () => {
  const source = await readRouteSource(path.resolve(testDir, "../app/api/control-plane/workspaces/route.ts"));

  assert.match(source, /import \{ proxyWorkspaceCreatePost \} from "\.\/route-helpers";/);
  assert.match(source, /return proxyWorkspaceCreatePost\(request\);/);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /buildWorkspaceCreateProxyInit\(/);
  assert.doesNotMatch(source, /await fetch\(/);
});

test("workspace bootstrap route keeps validation and delegates proxy wiring to route helper", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspaces/[workspaceId]/bootstrap/route.ts"),
  );

  assert.match(source, /import \{ proxyWorkspaceBootstrapPost \} from "\.\.\/\.\.\/route-helpers";/);
  assert.match(source, /if \(!workspaceId\) \{\s*return Response\.json\(/s);
  assert.match(source, /return proxyWorkspaceBootstrapPost\(request,\s*\{\s*workspaceId\s*\}\s*\);/s);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(/);
  assert.doesNotMatch(source, /buildWorkspaceBootstrapProxyInit\(/);
  assert.doesNotMatch(source, /await fetch\(/);
});

test("workspace route helper keeps includeTenant=false and bootstrap path wiring", async () => {
  const source = await readRouteSource(workspaceRouteHelperPath);

  assert.match(source, /import \{ proxyControlPlane \} from "@\/lib\/control-plane-proxy";/);
  assert.match(source, /import \{ resolveWorkspaceContextForServer \} from "@\/lib\/workspace-context";/);
  assert.match(source, /const WORKSPACES_BASE_PATH = "\/api\/v1\/saas\/workspaces";/);
  assert.match(source, /export function buildWorkspaceBootstrapPath\(workspaceId: string\): string/);
  assert.match(source, /return `\$\{WORKSPACES_BASE_PATH\}\/\$\{workspaceId\}\/bootstrap`;/);
  assert.match(source, /export async function proxyWorkspaceTenantlessPost\(args: \{/);
  assert.match(source, /const proxy = options\.proxy \?\? proxyControlPlane;/);
  assert.match(source, /return proxy\(args\.path,\s*\{/);
  assert.match(source, /includeTenant:\s*false/);
  assert.match(source, /init:\s*await options\.initBuilder\(args\.request\)/);
  assert.match(source, /export async function proxyWorkspaceCreatePost\(/);
  assert.match(source, /const initBuilder = options\?\.initBuilder \?\? buildWorkspaceCreateProxyInit;/);
  assert.match(source, /return proxyWorkspaceTenantlessPost\(\{/);
  assert.match(source, /path:\s*WORKSPACES_BASE_PATH/);
  assert.match(source, /proxy:\s*options\?\.proxy/);
  assert.match(source, /initBuilder,/);
  assert.match(source, /export async function proxyWorkspaceBootstrapPost\(/);
  assert.match(
    source,
    /const currentWorkspace = args\.currentWorkspace \?\? \(await resolveWorkspaceContext\(\)\)\.workspace;/,
  );
  assert.match(source, /const initBuilder = options\?\.initBuilder \?\? buildWorkspaceBootstrapProxyInit;/);
  assert.match(source, /return proxyWorkspaceTenantlessPost\(\{/);
  assert.match(source, /path:\s*buildWorkspaceBootstrapPath\(args\.workspaceId\)/);
  assert.match(
    source,
    /initBuilder:\s*\(request\)\s*=>\s*initBuilder\(request,\s*\{\s*workspaceId:\s*args\.workspaceId,\s*currentWorkspace,\s*\}\)/s,
  );
  assert.doesNotMatch(source, /await fetch\(/);
});

test("workspace enterprise route helper keeps shared resolver/proxy injection for GET and POST", async () => {
  const source = await readRouteSource(path.resolve(testDir, "../app/api/control-plane/workspace/route-helpers.ts"));

  assert.match(source, /import \{ proxyControlPlane, requireMetadataWorkspaceContext \} from "@\/lib\/control-plane-proxy";/);
  assert.match(source, /import \{ resolveWorkspaceContextForServer \} from "@\/lib\/workspace-context";/);
  assert.match(
    source,
    /import \{[\s\S]*buildProxyControlPlanePostInit[\s\S]*proxyWorkspaceScopedDetailPost[\s\S]*\} from "\.\.\/post-route-helpers";/s,
  );
  assert.match(source, /import \{ proxyWorkspaceScopedGet \} from "\.\.\/get-route-helpers";/);
  assert.match(source, /return proxyWorkspaceScopedGet\(/);
  assert.match(source, /getPath:\s*\(workspaceContext\)\s*=>\s*buildWorkspaceEnterpriseGetPath\(workspaceContext\.workspace\.workspace_id,\s*suffix,\s*options\?\.request\)/s);
  assert.match(source, /init:\s*buildWorkspaceEnterpriseGetInit\(options\)/);
  assert.match(source, /const initBuilder = options\?\.initBuilder \?\? buildWorkspaceEnterprisePostInit;/);
  assert.match(source, /return proxyWorkspaceScopedDetailPost\(\{/);
  assert.match(source, /buildPath:\s*\(workspaceId\)\s*=>\s*buildWorkspaceEnterprisePath\(workspaceId,\s*args\.suffix\)/);
  assert.match(source, /initBuilder:\s*\(\{\s*request\s*\}\)\s*=>\s*initBuilder\(request\)/);
  assert.match(source, /beforeProxy:\s*\(workspaceContext\)\s*=>\s*requireMetadataWorkspaceContext\(\{/s);
  assert.match(source, /message:\s*args\.metadataMessage/);
});

test("workspace collection route helper composes workspace path and fallback GET proxy", async () => {
  const source = await readRouteSource(collectionRouteHelperPath);

  assert.match(
    source,
    /import \{ proxyControlPlaneOrFallback \} from "@\/lib\/control-plane-proxy";/,
  );
  assert.match(
    source,
    /import \{ resolveWorkspaceContextForServer, type WorkspaceContext \} from "@\/lib\/workspace-context";/,
  );
  assert.match(
    source,
    /export function buildWorkspaceCollectionPath\(workspaceId: string,\s*suffix: string\): string/,
  );
  assert.match(source, /const normalizedSuffix = suffix\.startsWith\("\/"\) \? suffix : `\/\$\{suffix\}`;/);
  assert.match(source, /return `\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\$\{normalizedSuffix\}`;/);
  assert.match(source, /export function proxyWorkspaceContextCollectionGet<T>\(/);
  assert.match(
    source,
    /buildWorkspaceCollectionPath\(args\.workspaceContext\.workspace\.workspace_id,\s*args\.suffix\)/,
  );
  assert.match(source, /workspaceContext:\s*args\.workspaceContext/);
  assert.match(source, /export async function proxyWorkspaceScopedCollectionGet<T>\(args: \{/);
  assert.match(source, /const workspaceContext = await resolveContext\(\);/);
  assert.match(source, /return proxyWorkspaceContextCollectionGet\(\{/);
  assert.match(source, /workspaceContext,/);
  assert.match(source, /proxy:\s*args\.proxy/);
  assert.match(source, /export function proxyCollectionGet<T>\(/);
  assert.match(source, /const proxy = options\?\.proxy \?\? proxyControlPlaneOrFallback;/);
  assert.match(source, /return proxy\(/);
  assert.match(source, /args\.path,/);
  assert.match(source, /args\.fallback,/);
  assert.match(source, /workspaceContext:\s*args\.workspaceContext/);
  assert.match(source, /export function proxyPathCollectionGet<T>\(args: \{/);
  assert.match(source, /return proxyCollectionGet\(\{/);
  assert.match(source, /path:\s*args\.path,/);
  assert.match(source, /proxy:\s*args\.proxy/);
});

test("system collection GET routes reuse shared path fallback helper", async () => {
  const toolProvidersSource = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/tool-providers/route.ts"),
  );
  assert.match(
    toolProvidersSource,
    /import \{[\s\S]*proxyPathCollectionGet[\s\S]*\} from "\.\.\/collection-route-helpers";/s,
  );
  assert.match(toolProvidersSource, /return proxyPathCollectionGet\(\{/);
  assert.match(toolProvidersSource, /path:\s*"\/api\/v1\/tool-providers"/);
  assert.doesNotMatch(toolProvidersSource, /proxyControlPlaneOrFallback\(/);

  const policiesSource = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/policies/route.ts"),
  );
  assert.match(
    policiesSource,
    /import \{ proxyPathCollectionGet \} from "\.\.\/collection-route-helpers";/,
  );
  assert.match(policiesSource, /return proxyPathCollectionGet\(\{/);
  assert.match(policiesSource, /path:\s*"\/api\/v1\/policies"/);
  assert.doesNotMatch(policiesSource, /proxyControlPlaneOrFallback\(/);
});

test("health route reuses shared system GET helper", async () => {
  const healthSource = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/health/route.ts"),
  );
  const helperSource = await readRouteSource(systemRouteHelperPath);

  assert.match(healthSource, /import \{ proxyHealthGet \} from "\.\.\/system-route-helpers";/);
  assert.match(healthSource, /return proxyHealthGet\(\);/);
  assert.doesNotMatch(healthSource, /proxyControlPlane\(/);

  assert.match(helperSource, /import \{ proxyPathGet \} from "\.\/get-route-helpers";/);
  assert.match(helperSource, /const HEALTH_PATH = "\/api\/v1\/health";/);
  assert.match(helperSource, /export function buildHealthPath\(\): string/);
  assert.match(helperSource, /return HEALTH_PATH;/);
  assert.match(helperSource, /export async function proxyHealthGet\(args\?: \{/);
  assert.match(helperSource, /return proxyPathGet\(\{/);
  assert.match(helperSource, /path:\s*buildHealthPath\(\),/);
  assert.match(helperSource, /includeTenant:\s*false,/);
  assert.doesNotMatch(helperSource, /await fetch\(/);
});

test("workspace collection route helper delegates both workspace-scoped and path-based collection POST", async () => {
  const source = await readRouteSource(collectionRouteHelperPath);

  assert.match(
    source,
    /import \{ proxyWorkspaceScopedPostRequest \} from "\.\/post-route-helpers";/,
  );
  assert.match(source, /export function proxyWorkspaceCollectionPost\(args: \{/);
  assert.match(source, /workspace:\s*args\.workspaceContext\.workspace,/);
  assert.match(source, /export async function proxyWorkspaceScopedCollectionPost\(args: \{/);
  assert.match(source, /const workspaceContext = await resolveContext\(\);/);
  assert.match(source, /return proxyWorkspaceCollectionPost\(\{/);
  assert.match(source, /path:\s*buildWorkspaceCollectionPath\(workspaceContext\.workspace\.workspace_id,\s*args\.suffix\)/);
  assert.match(source, /export async function proxyWorkspaceContextCollectionPost\(args: \{/);
  assert.match(source, /workspaceContext\?: WorkspaceContext;/);
  assert.match(source, /args\.workspaceContext \?\?/);
  assert.match(source, /return proxyWorkspaceCollectionPost\(\{/);
  assert.match(source, /path:\s*args\.path,/);
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
      collectionGetSuffixPattern: isRunsRoute
        ? undefined
        : isToolProvidersRoute
          ? undefined
          : isInvitationsRoute
            ? /suffix:\s*"\/invitations"/
            : isServiceAccountsRoute
              ? /suffix:\s*"\/service-accounts"/
              : /suffix:\s*"\/api-keys"/,
      collectionGetPathPattern: isToolProvidersRoute ? /path:\s*"\/api\/v1\/tool-providers"/ : undefined,
      collectionPostSuffixPattern: isRunsRoute || isToolProvidersRoute
        ? undefined
        : isInvitationsRoute
          ? /suffix:\s*"\/invitations"/
          : isServiceAccountsRoute
            ? /suffix:\s*"\/service-accounts"/
            : /suffix:\s*"\/api-keys"/,
      collectionPostPathPattern: isRunsRoute
        ? /path:\s*"\/api\/v1\/runs"/
        : isToolProvidersRoute
          ? /path:\s*"\/api\/v1\/tool-providers"/
          : undefined,
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

test("metadata-guarded enterprise POST routes reuse shared enterprise helpers", async () => {
  const ssoSource = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspace/sso/route.ts"),
  );
  assertMetadataGuardedHelperizedPostRoute(ssoSource, {
    suffix: "/sso",
    metadataMessage:
      "Workspace SSO updates require metadata-backed SaaS context. Preview and env fallback modes are disabled for this endpoint.",
  });

  const dedicatedSource = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspace/dedicated-environment/route.ts"),
  );
  assertMetadataGuardedHelperizedPostRoute(dedicatedSource, {
    suffix: "/dedicated-environment",
    metadataMessage:
      "Dedicated environment updates require metadata-backed SaaS context. Preview and env fallback modes are disabled for this endpoint.",
  });
});

test("billing POST helper reuses shared POST init builder", async () => {
  const source = await readRouteSource(billingRouteHelperPath);
  assert.match(
    source,
    /import \{[\s\S]*buildProxyControlPlanePostInit[\s\S]*proxyWorkspaceScopedDetailPost[\s\S]*\} from "\.\.\/post-route-helpers";/s,
  );
  assert.match(source, /import \{ proxyControlPlane \} from "@\/lib\/control-plane-proxy";/);
  assert.match(source, /import \{ resolveWorkspaceContextForServer \} from "@\/lib\/workspace-context";/);
  assert.match(source, /import \{ proxyWorkspaceScopedGet \} from "\.\.\/\.\.\/get-route-helpers";/);
  assert.match(
    source,
    /return buildProxyControlPlanePostInit\(\{\s*request,\s*accept:\s*request\.headers\.get\("accept"\)\s*\?\?\s*undefined,\s*contentType:\s*request\.headers\.get\("content-type"\)\s*\?\?\s*undefined,\s*\}\)/s,
  );
  assert.match(source, /export function buildWorkspaceBillingPath\(workspaceId: string,\s*suffix: string\): string/);
  assert.match(source, /return `\$\{BILLING_BASE_PATH\}\/\$\{workspaceId\}\/billing\$\{suffix\}`;/);
  assert.match(source, /export async function proxyWorkspaceBillingGet\(/);
  assert.match(source, /export async function proxyWorkspaceBillingPost\(/);
  assert.match(source, /return proxyWorkspaceScopedGet\(/);
  assert.match(source, /getPath:\s*\(workspaceContext\)\s*=>\s*buildWorkspaceBillingPath\(workspaceContext\.workspace\.workspace_id,\s*suffix\)/s);
  assert.match(source, /init:\s*buildBillingGetProxyInit\(\)/);
  assert.match(source, /resolveWorkspaceContext:\s*options\?\.resolveWorkspaceContext \?\? resolveWorkspaceContextForServer/);
  assert.match(source, /proxy:\s*options\?\.proxy \?\? proxyControlPlane/);
  assert.match(source, /const initBuilder = options\?\.initBuilder \?\? buildBillingPostProxyInit;/);
  assert.match(source, /return proxyWorkspaceScopedDetailPost\(\{/);
  assert.match(source, /buildPath:\s*\(workspaceId\)\s*=>\s*buildWorkspaceBillingPath\(workspaceId,\s*suffix\)/);
  assert.match(source, /initBuilder:\s*\(\{\s*request\s*\}\)\s*=>\s*initBuilder\(request\)/);
});

test("billing route family reuses shared workspace billing proxy helpers", async () => {
  const routes = [
    path.resolve(testDir, "../app/api/control-plane/workspace/billing/checkout-sessions/route.ts"),
    path.resolve(testDir, "../app/api/control-plane/workspace/billing/checkout-sessions/[sessionId]/route.ts"),
    path.resolve(testDir, "../app/api/control-plane/workspace/billing/checkout-sessions/[sessionId]/complete/route.ts"),
    path.resolve(testDir, "../app/api/control-plane/workspace/billing/providers/route.ts"),
    path.resolve(testDir, "../app/api/control-plane/workspace/billing/portal-sessions/route.ts"),
    path.resolve(testDir, "../app/api/control-plane/workspace/billing/subscription/cancel/route.ts"),
    path.resolve(testDir, "../app/api/control-plane/workspace/billing/subscription/resume/route.ts"),
  ] as const;

  for (const routePath of routes) {
    const source = await readRouteSource(routePath);
    assert.doesNotMatch(source, /proxyControlPlane\(/);
    assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(/);
    if (routePath.endsWith("[sessionId]/route.ts") || routePath.endsWith("providers/route.ts")) {
      assert.match(source, /import \{ proxyWorkspaceBillingGet \} from "(?:\.\.\/)+route-helpers";/);
      assert.match(source, /proxyWorkspaceBillingGet\(/);
    } else {
      assert.match(source, /import \{ proxyWorkspaceBillingPost \} from "(?:\.\.\/)+route-helpers";/);
      assert.match(source, /proxyWorkspaceBillingPost\(request,/);
    }
  }
});

test("run detail GET routes reuse shared run-route helper", async () => {
  const helperSource = await readRouteSource(runRouteHelperPath);
  assert.match(
    helperSource,
    /import \{ proxyRequestPathGet \} from "\.\.\/get-route-helpers";/,
  );
  assert.match(helperSource, /export function buildRunPath\(runId: string,\s*suffix\?: string\): string/);
  assert.match(helperSource, /const base = `\/api\/v1\/runs\/\$\{runId\}`;/);
  assert.match(helperSource, /return suffix \? `\$\{base\}\$\{suffix\}` : base;/);
  assert.match(helperSource, /return proxyRequestPathGet\(\{/);
  assert.match(helperSource, /path:\s*buildRunPath\(args\.runId,\s*args\.suffix\),/);

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

  assert.match(
    source,
    /import \{\s*proxyWorkspaceDeliveryGet,\s*proxyWorkspaceDeliveryPost,\s*\} from "\.\/route-helpers";/s,
  );
  assert.match(source, /return proxyWorkspaceDeliveryGet\(\);/);
  assert.match(source, /return proxyWorkspaceDeliveryPost\(\{ request \}\);/);
  assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(/);
  assert.doesNotMatch(source, /proxyFallbackGet\(/);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /buildProxyControlPlanePostInit\(/);
  assert.doesNotMatch(source, /const body = await request\.text\(\);/);
  assert.doesNotMatch(source, /method:\s*"POST"/);
});

test("workspace delivery helper keeps fallback GET contract and POST passthrough semantics", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/workspace/delivery/route-helpers.ts"),
  );

  assert.match(source, /import type \{ ControlPlaneWorkspaceDeliveryTrack \} from "@\/lib\/control-plane-types";/);
  assert.match(
    source,
    /import \{ proxyWorkspaceScopedFallbackGet \} from "\.\.\/\.\.\/fallback-route-helpers";/,
  );
  assert.match(source, /import \{ proxyControlPlane \} from "@\/lib\/control-plane-proxy";/);
  assert.match(source, /import \{ resolveWorkspaceContextForServer \} from "@\/lib\/workspace-context";/);
  assert.match(
    source,
    /import \{[\s\S]*buildProxyControlPlanePostInit[\s\S]*proxyWorkspaceScopedDetailPost[\s\S]*\} from "\.\.\/post-route-helpers";/s,
  );
  assert.match(source, /const DELIVERY_SUFFIX = "\/delivery";/);
  assert.match(source, /export function buildDeliveryPath\(workspaceId: string\): string/);
  assert.match(source, /return `\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\$\{DELIVERY_SUFFIX\}`;/);
  assert.match(
    source,
    /export function buildDeliveryFallbackTrack\(\s*workspaceId: string,\s*upstreamStatus: number,\s*\): ControlPlaneWorkspaceDeliveryTrack/,
  );
  assert.match(source, /function buildFallbackMeta\(upstreamStatus: number\)/);
  assert.match(source, /request_id: "delivery-preview-unavailable"/);
  assert.match(source, /request_id: "delivery-preview-error"/);
  assert.match(source, /const proxy = args\?\.proxy \?\? proxyWorkspaceScopedFallbackGet;/);
  assert.match(source, /return proxy\(\{/);
  assert.match(
    source,
    /getPath:\s*\(workspaceContext\)\s*=>\s*buildDeliveryPath\(workspaceContext\.workspace\.workspace_id\)/,
  );
  assert.match(source, /includeTenant:\s*true/);
  assert.match(
    source,
    /buildFallback:\s*\(upstream,\s*workspaceContext\)\s*=>\s*\(\{\s*data:\s*buildDeliveryFallbackTrack\(workspaceContext\.workspace\.workspace_id,\s*upstream\.status\),/s,
  );
  assert.match(source, /meta:\s*buildFallbackMeta\(upstream\.status\)/);
  assert.match(source, /export async function proxyWorkspaceDeliveryGet\(args\?: \{/);
  assert.match(source, /resolveWorkspaceContext:\s*args\?\.(?:resolveWorkspaceContext|resolveWorkspaceContext) \?\? resolveWorkspaceContextForServer/);
  assert.match(source, /export async function buildWorkspaceDeliveryPostInit\(request: Request\): Promise<RequestInit>/);
  assert.match(
    source,
    /return buildProxyControlPlanePostInit\(\{\s*request,\s*contentType: "application\/json",\s*emptyBodyAsUndefined: true,\s*\}\)/s,
  );
  assert.match(source, /export async function proxyWorkspaceDeliveryPost\(/);
  assert.match(source, /resolveWorkspaceContext\?: typeof resolveWorkspaceContextForServer/);
  assert.match(source, /initBuilder\?: typeof buildWorkspaceDeliveryPostInit/);
  assert.match(source, /return proxyWorkspaceScopedDetailPost\(\{/);
  assert.match(source, /buildPath:\s*buildDeliveryPath/);
  assert.match(source, /includeTenant:\s*true/);
  assert.match(source, /initBuilder:\s*\(\{\s*request\s*\}\)\s*=>\s*initBuilder\(request\)/);
  assert.doesNotMatch(source, /const body = await request\.text\(\);/);
});

test("admin overview route keeps includeTenant=false fallback summary contract", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/admin/overview/route.ts"),
  );

  assert.match(source, /import \{ proxyAdminOverviewGet \} from "\.\.\/route-helpers";/);
  assert.match(source, /return proxyAdminOverviewGet\(\);/);
  assert.doesNotMatch(source, /proxyFallbackGet\(/);
  assert.doesNotMatch(source, /paid_subscriptions_total:\s*0/);
  assert.doesNotMatch(source, /next_action_surface:\s*"verification"/);
});

test("admin overview helper keeps includeTenant=false fallback summary contract", async () => {
  const source = await readRouteSource(
    path.resolve(testDir, "../app/api/control-plane/admin/route-helpers.ts"),
  );

  assert.match(source, /import \{ proxyPathFallbackGet \} from "\.\.\/fallback-route-helpers";/);
  assert.match(source, /import \{ buildAdminOverviewPreviewData \} from "@\/lib\/admin-overview-preview";/);
  assert.match(source, /export function buildAdminOverviewPath\(\): string/);
  assert.match(source, /return "\/api\/v1\/saas\/admin\/overview";/);
  assert.match(source, /export function buildAdminOverviewFallback\(\)/);
  assert.match(source, /const previewData = buildAdminOverviewPreviewData\(now\);/);
  assert.match(source, /\.\.\.previewData,/);
  assert.match(source, /code: "admin_overview_preview_fallback"/);
  assert.match(source, /path: buildAdminOverviewPath\(\)/);
  assert.match(source, /export async function proxyAdminOverviewGet\(args\?: \{/);
  assert.match(source, /const proxy = args\?\.proxy \?\? proxyPathFallbackGet;/);
  assert.match(source, /return proxy\(\{/);
  assert.match(source, /path: buildAdminOverviewPath\(\),/);
  assert.match(source, /includeTenant:\s*false/);
  assert.match(source, /buildFallback: \(\) => buildAdminOverviewFallback\(\),/);
});
