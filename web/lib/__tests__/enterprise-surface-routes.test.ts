import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const ssoRoutePath = path.resolve(testDir, "../../app/api/control-plane/workspace/sso/route.ts");
const dedicatedRoutePath = path.resolve(
  testDir,
  "../../app/api/control-plane/workspace/dedicated-environment/route.ts",
);
const auditExportRoutePath = path.resolve(
  testDir,
  "../../app/api/control-plane/workspace/audit-events/export/route.ts",
);
const appPath = path.resolve(testDir, "../../../src/app.ts");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("workspace SSO route keeps shared helper GET and controlled POST live-write semantics", async () => {
  const source = await readSource(ssoRoutePath);
  assert.match(
    source,
    /import \{ proxyWorkspaceEnterpriseGet, proxyWorkspaceEnterprisePost \} from "\.\.\/route-helpers";/,
  );
  assert.match(source, /return proxyWorkspaceEnterpriseGet\("\/sso"\);/);
  assert.match(
    source,
    /return proxyWorkspaceEnterprisePost\({[\s\S]*suffix: "\/sso"/,
  );
  assert.match(
    source,
    /metadataMessage:\s*"Workspace SSO updates require metadata-backed SaaS context\. Preview and env fallback modes are disabled for this endpoint\."/,
  );
});

test("workspace dedicated environment route keeps shared helper GET and controlled POST semantics", async () => {
  const source = await readSource(dedicatedRoutePath);
  assert.match(
    source,
    /import \{ proxyWorkspaceEnterpriseGet, proxyWorkspaceEnterprisePost \} from "\.\.\/route-helpers";/,
  );
  assert.match(source, /return proxyWorkspaceEnterpriseGet\("\/dedicated-environment"\);/);
  assert.match(
    source,
    /return proxyWorkspaceEnterprisePost\({[\s\S]*suffix: "\/dedicated-environment"/,
  );
  assert.match(
    source,
    /metadataMessage:\s*"Dedicated environment updates require metadata-backed SaaS context\. Preview and env fallback modes are disabled for this endpoint\."/,
  );
});

test("workspace audit export route reuses shared enterprise GET helper with query and accept passthrough", async () => {
  const source = await readSource(auditExportRoutePath);
  assert.match(
    source,
    /import \{ auditExportAcceptHeader, proxyWorkspaceEnterpriseGet \} from "\.\.\/\.\.\/route-helpers";/,
  );
  assert.match(source, /export async function GET\(request: Request\)/);
  assert.match(
    source,
    /return proxyWorkspaceEnterpriseGet\("\/audit-events:export",\s*\{\s*request,\s*defaultAccept:\s*auditExportAcceptHeader,\s*\}\);/s,
  );
});

test("backend app keeps enterprise surface handlers on both GET and controlled POST methods", async () => {
  const source = await readSource(appPath);
  assert.match(source, /if \(request\.method === "GET" && saasWorkspaceSsoMatch\)/);
  assert.match(source, /if \(request\.method === "GET" && saasWorkspaceDedicatedEnvironmentMatch\)/);
  assert.match(source, /if \(request\.method === "POST" && saasWorkspaceSsoMatch\)/);
  assert.match(source, /if \(request\.method === "POST" && saasWorkspaceDedicatedEnvironmentMatch\)/);
});

test("backend SSO source keeps normalize/parse/readiness round-trip for enterprise config fields", async () => {
  const source = await readSource(appPath);

  assert.match(source, /normalizeSaasWorkspaceSsoConfigRequest\(/);
  assert.match(source, /body\.enabled === false/);
  assert.match(source, /connection_mode must be workspace for controlled workspace SSO live writes/);
  assert.match(source, /normalizeOptionalRequestHttpUrl\(body\.entrypoint_url,\s*"entrypoint_url"\)/);
  assert.match(source, /normalizeOptionalEmailDomainList\(body\.email_domains,\s*"email_domains"\)/);
  assert.match(
    source,
    /normalizeOptionalRequestString\(body\.signing_certificate,\s*"signing_certificate",\s*8000\)/,
  );
  assert.match(source, /entrypoint_url:\s*entrypointUrl/);
  assert.match(source, /email_domains:\s*emailDomains/);
  assert.match(source, /signing_certificate:\s*signingCertificate/);

  assert.match(source, /parseWorkspaceSsoFeatureConfig\(/);
  assert.match(source, /parsed\.entrypoint_url/);
  assert.match(source, /parseStoredEmailDomainList\(parsed\.email_domains\)/);
  assert.match(source, /parsed\.signing_certificate/);

  assert.match(source, /buildSaasWorkspaceSsoReadiness\(/);
  assert.match(source, /entrypoint_url:\s*parsedConfig\.entrypoint_url/);
  assert.match(source, /email_domains:\s*parsedConfig\.email_domains/);
  assert.match(source, /signing_certificate:\s*parsedConfig\.signing_certificate/);
});

test("backend dedicated-environment source keeps round-trip for requester/data/capacity/sla contract fields", async () => {
  const source = await readSource(appPath);

  assert.match(source, /normalizeSaasWorkspaceDedicatedEnvironmentConfigRequest\(/);
  assert.match(source, /body\.enabled === false/);
  assert.match(source, /target_region is required for controlled dedicated environment live writes/);
  assert.match(source, /requester_email is required for controlled dedicated environment live writes/);
  assert.match(source, /requester_email:\s*requesterEmail/);
  assert.match(
    source,
    /data_classification:\s*normalizeOptionalDedicatedEnvironmentDataClassification\(\s*body\.data_classification,\s*"data_classification"/,
  );
  assert.match(
    source,
    /requested_capacity:\s*normalizeOptionalRequestString\(body\.requested_capacity,\s*"requested_capacity",\s*500\)/,
  );
  assert.match(
    source,
    /requested_sla:\s*normalizeOptionalRequestString\(body\.requested_sla,\s*"requested_sla",\s*255\)/,
  );

  assert.match(source, /parseWorkspaceDedicatedEnvironmentFeatureConfig\(/);
  assert.match(source, /parsed\.requester_email/);
  assert.match(source, /parsed\.data_classification/);
  assert.match(source, /parsed\.requested_capacity/);
  assert.match(source, /parsed\.requested_sla/);

  assert.match(source, /buildSaasWorkspaceDedicatedEnvironmentReadiness\(/);
  assert.match(source, /requester_email:\s*parsedConfig\.requester_email/);
  assert.match(source, /data_classification:\s*parsedConfig\.data_classification/);
  assert.match(source, /requested_capacity:\s*parsedConfig\.requested_capacity/);
  assert.match(source, /requested_sla:\s*parsedConfig\.requested_sla/);
});

test("backend enterprise live-write paths keep admin access gate and idempotency guard", async () => {
  const source = await readSource(appPath);

  assert.match(
    source,
    /throw new ApiError\(403, "workspace_admin_required", actionLabel, \{\s*required_roles: \[\.\.\.WORKSPACE_MEMBER_MANAGER_ROLES\],\s*\}\);/,
  );
  assert.match(
    source,
    /requireSaasWorkspaceAdminAccess\([\s\S]*?"Only workspace owners or admins can configure workspace SSO"[\s\S]*?\);/,
  );
  assert.match(
    source,
    /requireSaasWorkspaceAdminAccess\([\s\S]*?"Only workspace owners or admins can configure dedicated environment delivery"[\s\S]*?\);/,
  );
  assert.match(source, /const routeKey = `POST:\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\/sso`;/);
  assert.match(source, /const routeKey = `POST:\/api\/v1\/saas\/workspaces\/\$\{workspaceId\}\/dedicated-environment`;/);
  assert.match(source, /const payloadHash = await hashPayload\(body\);/);
  assert.match(source, /const existingRecord = await getIdempotencyRecord\(env, workspaceId, routeKey, idempotencyKey\);/);
  assert.match(source, /if \(existingRecord\) \{/);
  assert.match(
    source,
    /throw new ApiError\(409, "idempotency_conflict", "Idempotency key was already used for another payload"\);/,
  );
});

test("backend enterprise live-write readiness updates return controlled status", async () => {
  const source = await readSource(appPath);

  assert.match(
    source,
    /return json\([\s\S]*?await buildSaasWorkspaceSsoReadiness\([\s\S]*?\),[\s\S]*?\{\s*status:\s*existingConfig \?\s*200\s*:\s*201\s*\}[\s\S]*?\);/,
  );
  assert.match(
    source,
    /return json\([\s\S]*?await buildSaasWorkspaceDedicatedEnvironmentReadiness\([\s\S]*?\),[\s\S]*?\{\s*status:\s*existingConfig \? 200 : 201\s*\}[\s\S]*?\);/,
  );
});
