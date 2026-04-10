import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function printUsage() {
  console.log(`render_access_ingress_plan.mjs

Render an access ingress governance bundle (checklist + helpers + evidence template).

Usage:
  node scripts/render_access_ingress_plan.mjs --plan-file <file> --output-dir <dir>

Or without a plan file:
  node scripts/render_access_ingress_plan.mjs \\
    --tenant-id <id> \\
    --deploy-env <staging|production> \\
    --worker-url <https://...> \\
    --output-dir <dir> [options]

Options:
  --tenant-header <name>              Default: X-Tenant-Id
  --trusted-subject-header <name>     Default: X-Authenticated-Subject
  --trusted-roles-header <name>       Default: X-Authenticated-Roles
  --verification-subject-id <id>      Default: post_deploy_verifier
  --verification-subject-roles <csv>  Default: platform_admin,legal_approver
  --northbound-auth-mode <mode>       Default: trusted_edge
  --strict                            Fail when required handoff/evidence metadata is missing
  --help                              Show this help message
`);
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function normalizeNonEmpty(rawValue, label) {
  if (typeof rawValue !== "string") {
    throw new Error(`Missing required argument: ${label}`);
  }
  const value = rawValue.trim();
  if (value === "") {
    throw new Error(`Missing required argument: ${label}`);
  }
  return value;
}

function normalizeDeployEnv(rawValue) {
  const value = (rawValue ?? "").trim().toLowerCase();
  if (value !== "staging" && value !== "production") {
    throw new Error(`deploy_env must be staging or production`);
  }
  return value;
}

function normalizeNorthboundAuthMode(rawValue) {
  const value = (rawValue ?? "").trim();
  if (value === "") {
    return "trusted_edge";
  }
  if (value !== "trusted_edge" && value !== "permissive") {
    throw new Error(`northbound_auth_mode must be trusted_edge or permissive (received: ${value})`);
  }
  return value;
}

function normalizeOptionalString(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const value = rawValue.trim();
  return value === "" ? null : value;
}

function normalizeHeaderName(rawValue, label) {
  const value = normalizeNonEmpty(rawValue, label);
  if (/[^\t\x20-\x7e]/.test(value)) {
    throw new Error(`${label} must be ASCII printable characters (received: ${value})`);
  }
  if (value.includes(":") || /\s/.test(value)) {
    throw new Error(`${label} must not contain ':' or whitespace (received: ${value})`);
  }
  return value;
}

function normalizeBaseUrl(rawValue, label) {
  const value = normalizeNonEmpty(rawValue, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL (received: ${value})`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${label} must start with https:// (received: ${value})`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not include username/password (received: ${value})`);
  }
  if (url.search || url.hash) {
    throw new Error(`${label} must not include query/hash (received: ${value})`);
  }
  if (url.pathname !== "" && url.pathname !== "/") {
    throw new Error(`${label} must be an origin/base URL without a path (received: ${value})`);
  }
  return url.origin;
}

function deriveReadonlyOutputPath(writeOutputPath) {
  if (!writeOutputPath) {
    return "/tmp/access-ingress-readonly-verify.json";
  }
  if (writeOutputPath.endsWith(".json")) {
    return writeOutputPath.replace(/\.json$/, "-readonly.json");
  }
  return `${writeOutputPath}-readonly`;
}

function buildPlanWarnings(plan) {
  const warnings = [];

  if (!plan.handoff_owner) {
    warnings.push(`handoff_owner is missing; generated artifacts will be harder to hand off cleanly`);
  }
  if (!plan.change_reference) {
    warnings.push(`change_reference is missing; verify evidence will be less traceable during audits and rollback`);
  }
  if (!plan.readonly_run_id_source) {
    warnings.push(`readonly_run_id_source is missing; operators may not know which production-safe RUN_ID to reuse`);
  }
  if (!plan.service_token_audience) {
    warnings.push(`service_token_audience is missing; token scope and ownership are not fully documented`);
  }
  if (plan.access_group_names.length === 0) {
    warnings.push(`access_group_names is empty; role/group mapping is not captured in the handoff bundle`);
  }
  if (plan.write_verify_output_path === plan.readonly_verify_output_path) {
    warnings.push(
      `write_verify_output_path and readonly_verify_output_path resolve to the same path; write and readonly evidence may overwrite each other`,
    );
  }
  if (plan.deploy_env === "production" && plan.northbound_auth_mode !== "trusted_edge") {
    warnings.push(`production ingress plan should use northbound_auth_mode=trusted_edge`);
  }

  return warnings;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildWriteVerifyCommand(plan) {
  const changeRef = plan.change_reference ? ` CHANGE_REF="${plan.change_reference}"` : "";
  return `BASE_URL="${plan.worker_url}" TENANT_ID="${plan.tenant_id}" SUBJECT_ID="${plan.verification_subject_id}" SUBJECT_ROLES="${plan.verification_subject_roles}" VERIFY_OUTPUT_PATH="${plan.write_verify_output_path}"${changeRef} npm --prefix "${plan.repo_root}" run post-deploy:verify`;
}

function buildReadonlyVerifyCommand(plan) {
  const changeRef = plan.change_reference ? ` CHANGE_REF="${plan.change_reference}"` : "";
  return `BASE_URL="${plan.worker_url}" TENANT_ID="${plan.tenant_id}" RUN_ID="<existing_run_id>" SUBJECT_ID="${plan.verification_subject_id}" SUBJECT_ROLES="${plan.verification_subject_roles}" VERIFY_OUTPUT_PATH="${plan.readonly_verify_output_path}"${changeRef} npm --prefix "${plan.repo_root}" run post-deploy:verify:readonly`;
}

function planFromTemplate(template) {
  const legacyVerifyOutputPath = normalizeOptionalString(template.verify_output_path);
  const writeVerifyOutputPath =
    normalizeOptionalString(template.write_verify_output_path) ??
    legacyVerifyOutputPath ??
    "/tmp/access-ingress-verify.json";
  const readonlyVerifyOutputPath =
    normalizeOptionalString(template.readonly_verify_output_path) ??
    deriveReadonlyOutputPath(legacyVerifyOutputPath ?? writeVerifyOutputPath);

  const tenantHeader = normalizeOptionalString(template.tenant_header) ?? "X-Tenant-Id";
  const verifierSubjectId = normalizeOptionalString(template.verification_subject_id) ?? "post_deploy_verifier";
  const verifierSubjectRoles =
    normalizeOptionalString(template.verification_subject_roles) ?? "platform_admin,legal_approver";

  return {
    tenant_id: normalizeNonEmpty(template.tenant_id, "tenant_id"),
    deploy_env: normalizeDeployEnv(template.deploy_env),
    worker_url: normalizeBaseUrl(template.worker_url, "worker_url"),
    northbound_auth_mode: normalizeNorthboundAuthMode(template.northbound_auth_mode),
    access_application_name: normalizeNonEmpty(
      template.access_application_name ?? `${template.tenant_id}-access`,
      "access_application_name",
    ),
    service_token_name: normalizeNonEmpty(
      template.service_token_name ?? `${template.tenant_id}-service-token`,
      "service_token_name",
    ),
    trusted_subject_header: normalizeNonEmpty(
      normalizeHeaderName(template.trusted_subject_header ?? "X-Authenticated-Subject", "trusted_subject_header"),
      "trusted_subject_header",
    ),
    trusted_roles_header: normalizeNonEmpty(
      normalizeHeaderName(template.trusted_roles_header ?? "X-Authenticated-Roles", "trusted_roles_header"),
      "trusted_roles_header",
    ),
    tenant_header: normalizeHeaderName(tenantHeader, "tenant_header"),
    verification_subject_id: verifierSubjectId,
    verification_subject_roles: verifierSubjectRoles,
    access_group_names: Array.isArray(template.access_group_names)
      ? [...new Set(template.access_group_names.map((value) => String(value).trim()).filter((value) => value !== ""))]
      : [],
    service_token_audience: normalizeOptionalString(template.service_token_audience),
    repo_root: normalizeNonEmpty(normalizeOptionalString(template.repo_root) ?? resolve("."), "repo_root"),
    write_verify_output_path: normalizeNonEmpty(writeVerifyOutputPath, "write_verify_output_path"),
    readonly_verify_output_path: normalizeNonEmpty(readonlyVerifyOutputPath, "readonly_verify_output_path"),
    handoff_owner: normalizeOptionalString(template.handoff_owner),
    change_reference: normalizeOptionalString(template.change_reference),
    readonly_run_id_source: normalizeOptionalString(template.readonly_run_id_source),
    notes: normalizeOptionalString(template.notes),
  };
}

function renderChecklist(plan, validation) {
  const writeVerifyCommand = buildWriteVerifyCommand(plan);
  const readonlyVerifyCommand = buildReadonlyVerifyCommand(plan);

  return [
    "# Access Ingress Checklist",
    "",
    `Tenant: \`${plan.tenant_id}\``,
    `Deploy env: \`${plan.deploy_env}\``,
    `Worker URL: \`${plan.worker_url}\``,
    `Northbound auth mode: \`${plan.northbound_auth_mode}\``,
    `Tenant header: \`${plan.tenant_header}\``,
    `Trusted subject header: \`${plan.trusted_subject_header}\``,
    `Trusted roles header: \`${plan.trusted_roles_header}\``,
    "",
    "## Access / Token Setup",
    "",
    `- [ ] Access application exists: \`${plan.access_application_name}\``,
    `- [ ] Service token exists: \`${plan.service_token_name}\``,
    "- [ ] Edge strips untrusted identity headers and injects trusted headers (do not pass client-controlled X-Authenticated-* through)",
    "- [ ] Access groups or token scopes are aligned with tenant access",
    `- [ ] Worker is configured with \`NORTHBOUND_AUTH_MODE=${plan.northbound_auth_mode}\``,
    "",
    "## Verification",
    "",
    "Verifier identity (used by post-deploy verification script):",
    "",
    `- subject_id: \`${plan.verification_subject_id}\``,
    `- subject_roles: \`${plan.verification_subject_roles}\``,
    "",
    "```bash",
    writeVerifyCommand,
    readonlyVerifyCommand,
    "```",
    "",
    "Generated helpers:",
    "",
    "```bash",
    "./access-ingress-verify.sh write",
    'RUN_ID="<existing_run_id>" ./access-ingress-verify.sh readonly',
    "./access-ingress-self-check.sh",
    "./access-ingress-fold-evidence.sh write <verify-summary.json> [verified_by]",
    "./access-ingress-fold-evidence.sh readonly <verify-summary.json> [verified_by]",
    "```",
    "",
    "## Evidence",
    "",
    "- Store the verification summary JSON and update `access-ingress-evidence-template.json`.",
    "- Attach `access-ingress-handoff-manifest.json` to the release or handoff record.",
    "- Record the Access application name, service token name, and the latest successful `trace_id`.",
    "- If this plan is for staging, use write-mode verification first.",
    "- If this plan is for production, prefer readonly verification after the controlled write verify has completed.",
    "",
    ...(validation.warnings.length > 0
      ? [
          "## Validation Warnings",
          "",
          ...validation.warnings.map((warning) => `- ${warning}`),
          "",
        ]
      : []),
    ...(plan.notes ? ["## Notes", "", plan.notes, ""] : []),
  ].join("\n");
}

function renderPlanJson(plan, validation) {
  return {
    ok: true,
    ...plan,
    validation,
    trusted_headers: {
      subject: plan.trusted_subject_header,
      roles: plan.trusted_roles_header,
    },
    generated_artifacts: {
      checklist: "access-ingress-checklist.md",
      verify_helper: "access-ingress-verify.sh",
      self_check_helper: "access-ingress-self-check.sh",
      fold_evidence_helper: "access-ingress-fold-evidence.sh",
      rotation_checklist: "access-ingress-rotation-checklist.md",
      evidence_template: "access-ingress-evidence-template.json",
      handoff_manifest: "access-ingress-handoff-manifest.json",
    },
    verification_commands: {
      write: buildWriteVerifyCommand(plan),
      readonly: buildReadonlyVerifyCommand(plan),
    },
  };
}

function renderVerifyHelper(plan) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `BASE_URL=${shellQuote(plan.worker_url)}`,
    `TENANT_ID=${shellQuote(plan.tenant_id)}`,
    `SUBJECT_ID=${shellQuote(plan.verification_subject_id)}`,
    `SUBJECT_ROLES=${shellQuote(plan.verification_subject_roles)}`,
    `CHANGE_REF=${shellQuote(plan.change_reference ?? "")}`,
    `DEFAULT_REPO_ROOT=${shellQuote(plan.repo_root)}`,
    `DEFAULT_WRITE_VERIFY_OUTPUT_PATH=${shellQuote(plan.write_verify_output_path)}`,
    `DEFAULT_READONLY_VERIFY_OUTPUT_PATH=${shellQuote(plan.readonly_verify_output_path)}`,
    "",
    'MODE="${1:-write}"',
    'ARTIFACT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
    'REPO_ROOT="${REPO_ROOT:-$DEFAULT_REPO_ROOT}"',
    'if [ ! -f "$REPO_ROOT/package.json" ]; then',
    '  echo "package.json not found under REPO_ROOT=$REPO_ROOT; override REPO_ROOT before running this helper" >&2',
    "  exit 1",
    "fi",
    "",
    'case "$MODE" in',
    "  write)",
    '    VERIFY_OUTPUT_PATH="${VERIFY_OUTPUT_PATH:-$DEFAULT_WRITE_VERIFY_OUTPUT_PATH}"',
    '    export BASE_URL TENANT_ID SUBJECT_ID SUBJECT_ROLES VERIFY_OUTPUT_PATH',
    '    if [ -n "${CHANGE_REF}" ]; then export CHANGE_REF; fi',
    '    npm --prefix "$REPO_ROOT" run post-deploy:verify',
    '    echo "Fold evidence: ${ARTIFACT_DIR}/access-ingress-fold-evidence.sh write ${VERIFY_OUTPUT_PATH}"',
    "    ;;",
    "  readonly)",
    '    RUN_ID="${RUN_ID:-}"',
    '    if [ -z "$RUN_ID" ]; then',
    '      echo "RUN_ID is required for readonly mode" >&2',
    "      exit 1",
    "    fi",
    '    VERIFY_OUTPUT_PATH="${VERIFY_OUTPUT_PATH:-$DEFAULT_READONLY_VERIFY_OUTPUT_PATH}"',
    '    export BASE_URL TENANT_ID RUN_ID SUBJECT_ID SUBJECT_ROLES VERIFY_OUTPUT_PATH',
    '    if [ -n "${CHANGE_REF}" ]; then export CHANGE_REF; fi',
    '    npm --prefix "$REPO_ROOT" run post-deploy:verify:readonly',
    '    echo "Fold evidence: ${ARTIFACT_DIR}/access-ingress-fold-evidence.sh readonly ${VERIFY_OUTPUT_PATH}"',
    "    ;;",
    "  *)",
    '    echo "Usage: ./access-ingress-verify.sh [write|readonly]" >&2',
    "    exit 1",
    "    ;;",
    "esac",
    "",
  ].join("\n");
}

function renderSelfCheckHelper(plan) {
  const tenantHeader = plan.tenant_header;
  const subjectHeader = plan.trusted_subject_header;
  const rolesHeader = plan.trusted_roles_header;
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `BASE_URL=${shellQuote(plan.worker_url)}`,
    `TENANT_ID=${shellQuote(plan.tenant_id)}`,
    `TENANT_HEADER=${shellQuote(tenantHeader)}`,
    `SUBJECT_HEADER=${shellQuote(subjectHeader)}`,
    `ROLES_HEADER=${shellQuote(rolesHeader)}`,
    `SUBJECT_ID=${shellQuote(plan.verification_subject_id)}`,
    `SUBJECT_ROLES=${shellQuote(plan.verification_subject_roles)}`,
    "",
    'function expect_code() {',
    '  local expected="$1"; shift',
    '  local code',
    '  code="$(curl -sS -o /dev/null -w "%{http_code}" "$@")"',
    '  if [ "$code" != "$expected" ]; then',
    '    echo "Expected HTTP $expected, got $code for: curl $*" >&2',
    "    exit 1",
    "  fi",
    "}",
    "",
    'echo "Self-check: trusted_edge ingress contract (best-effort)..."',
    'echo "1) Missing identity headers should be 401"',
    'expect_code 401 "${BASE_URL}/api/v1/policies" -H "${TENANT_HEADER}: ${TENANT_ID}"',
    "",
    'echo "2) Direct X-Subject-* overrides should be 401 in trusted_edge mode"',
    'expect_code 401 "${BASE_URL}/api/v1/policies" -H "${TENANT_HEADER}: ${TENANT_ID}" -H "X-Subject-Id: attacker@example.com"',
    "",
    'echo "3) Missing tenant header should be 400 (identity present)"',
    'expect_code 400 "${BASE_URL}/api/v1/policies" -H "${SUBJECT_HEADER}: ${SUBJECT_ID}" -H "${ROLES_HEADER}: ${SUBJECT_ROLES}"',
    "",
    'echo "4) Identity+tenant should not be 401 (may be 200/403 depending on roles/policies)"',
    'code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/api/v1/policies" -H "${TENANT_HEADER}: ${TENANT_ID}" -H "${SUBJECT_HEADER}: ${SUBJECT_ID}" -H "${ROLES_HEADER}: ${SUBJECT_ROLES}")"',
    'if [ "$code" = "401" ]; then',
    '  echo "Expected non-401 with trusted headers, got 401. Check edge header injection / NORTHBOUND_AUTH_MODE." >&2',
    "  exit 1",
    "fi",
    'echo "Self-check passed (HTTP ${code})."',
    "",
  ].join("\n");
}

function renderFoldEvidenceHelper(_plan) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'MODE="${1:-}"',
    'SUMMARY_PATH="${2:-}"',
    'VERIFIED_BY="${3:-${USER:-}}"',
    'ARTIFACT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
    'EVIDENCE_PATH="${EVIDENCE_PATH:-${ARTIFACT_DIR}/access-ingress-evidence-template.json}"',
    "",
    'if [ -z "${MODE}" ] || [ -z "${SUMMARY_PATH}" ]; then',
    '  echo "Usage: ./access-ingress-fold-evidence.sh [write|readonly] <verify-summary.json> [verified_by]" >&2',
    "  exit 1",
    "fi",
    'if [ ! -f "${SUMMARY_PATH}" ]; then',
    '  echo "Summary file not found: ${SUMMARY_PATH}" >&2',
    "  exit 1",
    "fi",
    'if [ ! -f "${EVIDENCE_PATH}" ]; then',
    '  echo "Evidence template not found: ${EVIDENCE_PATH}" >&2',
    "  exit 1",
    "fi",
    "",
    'MODE="${MODE}" SUMMARY_PATH="${SUMMARY_PATH}" EVIDENCE_PATH="${EVIDENCE_PATH}" VERIFIED_BY="${VERIFIED_BY}" RUN_ID="${RUN_ID:-}" node <<\'EOF\'',
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "",
    "const mode = String(process.env.MODE || '').trim();",
    "const summaryPath = String(process.env.SUMMARY_PATH || '').trim();",
    "const evidencePath = String(process.env.EVIDENCE_PATH || '').trim();",
    "const verifiedBy = String(process.env.VERIFIED_BY || '').trim() || null;",
    "",
    "if (mode !== 'write' && mode !== 'readonly') {",
    "  throw new Error(`MODE must be write or readonly (got ${mode})`);",
    "}",
    "const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));",
    "const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));",
    "",
    "const completedAt = typeof summary.completed_at === 'string' ? summary.completed_at : new Date().toISOString();",
    "const traceId = typeof summary.trace_id === 'string' ? summary.trace_id : null;",
    "const runId = typeof summary.run_id === 'string' ? summary.run_id : (mode === 'readonly' ? (process.env.RUN_ID || null) : null);",
    "const durationMs = typeof summary.duration_ms === 'number' ? summary.duration_ms : null;",
    "const checkCount = typeof summary.check_count === 'number' ? summary.check_count : null;",
    "",
    "evidence.latest_verification_mode = mode;",
    "evidence.latest_verified_at = completedAt;",
    "evidence.latest_trace_id = traceId;",
    "evidence.latest_run_id = runId;",
    "",
    "if (!evidence.verification || !evidence.verification[mode]) {",
    "  evidence.verification = evidence.verification || {};",
    "  evidence.verification[mode] = evidence.verification[mode] || {};",
    "}",
    "evidence.verification[mode].summary_path = summaryPath;",
    "evidence.verification[mode].verified_at = completedAt;",
    "evidence.verification[mode].verified_by = verifiedBy;",
    "evidence.verification[mode].trace_id = traceId;",
    "evidence.verification[mode].run_id = runId;",
    "evidence.verification[mode].duration_ms = durationMs;",
    "evidence.verification[mode].check_count = checkCount;",
    "",
    "const writeOk = !!evidence.verification?.write?.verified_at;",
    "const readonlyOk = !!evidence.verification?.readonly?.verified_at;",
    "evidence.ok = evidence.deploy_env === 'production' ? (writeOk && readonlyOk) : writeOk;",
    "",
    "fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\\n');",
    "console.log(JSON.stringify({ ok: true, evidence_path: evidencePath }, null, 2));",
    "EOF",
    "",
  ].join("\n");
}

function renderRotationChecklist(plan) {
  return [
    "# Access Ingress Token Rotation Checklist",
    "",
    `Tenant: \`${plan.tenant_id}\``,
    `Deploy env: \`${plan.deploy_env}\``,
    `Worker URL: \`${plan.worker_url}\``,
    "",
    "## Goal",
    "",
    "Rotate the service token (or equivalent non-human credential) used for automation without breaking trusted_edge semantics.",
    "",
    "## Preconditions",
    "",
    "- [ ] A controlled change window exists (or a staging rehearsal is complete).",
    "- [ ] You have a known-good readonly `RUN_ID` for post-rotation verification.",
    "- [ ] The edge layer strips untrusted identity headers and injects trusted headers.",
    "",
    "## Rotation Steps (platform-neutral)",
    "",
    `- [ ] Create a new credential for: \`${plan.service_token_name}\``,
    `- [ ] Update edge/gateway policy to accept the new credential for \`${plan.access_application_name}\``,
    "- [ ] Keep the old credential valid during the cutover window (overlap).",
    "- [ ] Run write-mode verification (staging or dedicated verify tenant).",
    "- [ ] Run readonly verification (production).",
    "- [ ] Revoke the old credential after verification passes and overlap window ends.",
    "",
    "## Evidence",
    "",
    "- [ ] Run `access-ingress-self-check.sh` and attach output/logs.",
    "- [ ] Save verify summary JSON and fold it into `access-ingress-evidence-template.json` via `access-ingress-fold-evidence.sh`.",
    "- [ ] Record who rotated, when, and the rollback plan trigger condition.",
    "",
    "## Rollback",
    "",
    "- [ ] If verification fails, revert edge/gateway to the previous credential and re-run readonly verification.",
    "",
  ].join("\n");
}

function renderEvidenceTemplate(plan) {
  return {
    ok: false,
    tenant_id: plan.tenant_id,
    deploy_env: plan.deploy_env,
    worker_url: plan.worker_url,
    handoff_owner: plan.handoff_owner,
    change_reference: plan.change_reference,
    repo_root: plan.repo_root,
    latest_verification_mode: null,
    latest_verified_at: null,
    latest_trace_id: null,
    latest_run_id: null,
    access: {
      access_application_name: plan.access_application_name,
      service_token_name: plan.service_token_name,
      service_token_audience: plan.service_token_audience,
      access_group_names: plan.access_group_names,
      tenant_header: plan.tenant_header,
      trusted_subject_header: plan.trusted_subject_header,
      trusted_roles_header: plan.trusted_roles_header,
    },
    verifier: {
      subject_id: plan.verification_subject_id,
      subject_roles: plan.verification_subject_roles,
    },
    ingress_contract: {
      northbound_auth_mode: plan.northbound_auth_mode,
      edge_strips_untrusted_headers: true,
      untrusted_override_headers: ["X-Subject-Id", "X-Subject-Roles", "X-Roles"],
      trusted_subject_header_candidates: ["CF-Access-Authenticated-User-Email", plan.trusted_subject_header],
      trusted_roles_header_candidates: ["CF-Access-Authenticated-User-Groups", plan.trusted_roles_header],
      tenant_header: plan.tenant_header,
    },
    verification: {
      write: {
        summary_path: plan.write_verify_output_path,
        command: buildWriteVerifyCommand(plan),
        verified_at: null,
        verified_by: null,
        trace_id: null,
        run_id: null,
        duration_ms: null,
        check_count: null,
      },
      readonly: {
        summary_path: plan.readonly_verify_output_path,
        command: buildReadonlyVerifyCommand(plan),
        run_id_source: plan.readonly_run_id_source,
        verified_at: null,
        verified_by: null,
        trace_id: null,
        run_id: null,
        duration_ms: null,
        check_count: null,
      },
    },
    notes: plan.notes,
  };
}

function renderHandoffManifest(plan, validation) {
  return {
    ok: true,
    tenant_id: plan.tenant_id,
    deploy_env: plan.deploy_env,
    worker_url: plan.worker_url,
    northbound_auth_mode: plan.northbound_auth_mode,
    handoff_owner: plan.handoff_owner,
    change_reference: plan.change_reference,
    repo_root: plan.repo_root,
    access: {
      access_application_name: plan.access_application_name,
      service_token_name: plan.service_token_name,
      service_token_audience: plan.service_token_audience,
      access_group_names: plan.access_group_names,
    },
    trusted_headers: {
      subject: plan.trusted_subject_header,
      roles: plan.trusted_roles_header,
    },
    artifacts: {
      plan: "access-ingress-plan.json",
      checklist: "access-ingress-checklist.md",
      verify_helper: "access-ingress-verify.sh",
      self_check_helper: "access-ingress-self-check.sh",
      fold_evidence_helper: "access-ingress-fold-evidence.sh",
      rotation_checklist: "access-ingress-rotation-checklist.md",
      evidence_template: "access-ingress-evidence-template.json",
    },
    verification: {
      write_summary_path: plan.write_verify_output_path,
      readonly_summary_path: plan.readonly_verify_output_path,
      readonly_run_id_source: plan.readonly_run_id_source,
      commands: {
        write: buildWriteVerifyCommand(plan),
        readonly: buildReadonlyVerifyCommand(plan),
      },
    },
    validation,
    required_handoff_fields: [
      "access_application_name",
      "service_token_name",
      "tenant_header",
      "trusted_subject_header",
      "trusted_roles_header",
      "verification_subject_id",
      "verification_subject_roles",
      "latest_trace_id",
      "latest_run_id",
      "verification_summary_path",
      "repo_root",
    ],
    notes: plan.notes,
  };
}

async function main() {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const planFile = normalizeOptionalString(readArg("--plan-file"));
  const outputDir = resolve(normalizeOptionalString(readArg("--output-dir")) ?? ".access-ingress-plans");
  const tenantIdArg = normalizeOptionalString(readArg("--tenant-id"));
  const deployEnvArg = normalizeOptionalString(readArg("--deploy-env"));
  const workerUrlArg = normalizeOptionalString(readArg("--worker-url"));
  const strict = hasFlag("--strict");

  const template = planFile
    ? JSON.parse(await readFile(resolve(planFile), "utf8"))
    : {
        tenant_id: tenantIdArg,
        deploy_env: deployEnvArg,
        worker_url: workerUrlArg,
        northbound_auth_mode: normalizeOptionalString(readArg("--northbound-auth-mode")) ?? "trusted_edge",
        access_application_name: normalizeOptionalString(readArg("--access-application-name")),
        service_token_name: normalizeOptionalString(readArg("--service-token-name")),
        trusted_subject_header: normalizeOptionalString(readArg("--trusted-subject-header")),
        trusted_roles_header: normalizeOptionalString(readArg("--trusted-roles-header")),
        tenant_header: normalizeOptionalString(readArg("--tenant-header")),
        verification_subject_id: normalizeOptionalString(readArg("--verification-subject-id")),
        verification_subject_roles: normalizeOptionalString(readArg("--verification-subject-roles")),
        service_token_audience: normalizeOptionalString(readArg("--service-token-audience")),
        repo_root: normalizeOptionalString(readArg("--repo-root")),
        write_verify_output_path: normalizeOptionalString(readArg("--write-verify-output-path")),
        readonly_verify_output_path: normalizeOptionalString(readArg("--readonly-verify-output-path")),
        verify_output_path: normalizeOptionalString(readArg("--verify-output-path")),
        handoff_owner: normalizeOptionalString(readArg("--handoff-owner")),
        change_reference: normalizeOptionalString(readArg("--change-reference")),
        readonly_run_id_source: normalizeOptionalString(readArg("--readonly-run-id-source")),
        notes: normalizeOptionalString(readArg("--notes")),
      };

  const plan = planFromTemplate(template);
  const warnings = buildPlanWarnings(plan);
  const validation = {
    strict,
    warning_count: warnings.length,
    warnings,
  };
  if (strict && warnings.length > 0) {
    throw new Error(`Access ingress plan validation warnings in --strict mode:\n- ${warnings.join("\n- ")}`);
  }

  await mkdir(outputDir, { recursive: true });

  const planJsonPath = join(outputDir, "access-ingress-plan.json");
  const checklistPath = join(outputDir, "access-ingress-checklist.md");
  const verifyHelperPath = join(outputDir, "access-ingress-verify.sh");
  const selfCheckHelperPath = join(outputDir, "access-ingress-self-check.sh");
  const foldEvidenceHelperPath = join(outputDir, "access-ingress-fold-evidence.sh");
  const rotationChecklistPath = join(outputDir, "access-ingress-rotation-checklist.md");
  const evidenceTemplatePath = join(outputDir, "access-ingress-evidence-template.json");
  const handoffManifestPath = join(outputDir, "access-ingress-handoff-manifest.json");
  const renderedPlan = renderPlanJson(plan, validation);
  const renderedChecklist = renderChecklist(plan, validation);
  const renderedVerifyHelper = renderVerifyHelper(plan);
  const renderedSelfCheckHelper = renderSelfCheckHelper(plan);
  const renderedFoldEvidenceHelper = renderFoldEvidenceHelper(plan);
  const renderedRotationChecklist = renderRotationChecklist(plan);
  const renderedEvidenceTemplate = renderEvidenceTemplate(plan);
  const renderedHandoffManifest = renderHandoffManifest(plan, validation);

  await Promise.all([
    writeFile(planJsonPath, `${JSON.stringify(renderedPlan, null, 2)}\n`, "utf8"),
    writeFile(checklistPath, renderedChecklist, "utf8"),
    writeFile(verifyHelperPath, renderedVerifyHelper, "utf8"),
    writeFile(selfCheckHelperPath, renderedSelfCheckHelper, "utf8"),
    writeFile(foldEvidenceHelperPath, renderedFoldEvidenceHelper, "utf8"),
    writeFile(rotationChecklistPath, renderedRotationChecklist, "utf8"),
    writeFile(evidenceTemplatePath, `${JSON.stringify(renderedEvidenceTemplate, null, 2)}\n`, "utf8"),
    writeFile(handoffManifestPath, `${JSON.stringify(renderedHandoffManifest, null, 2)}\n`, "utf8"),
  ]);
  await chmod(verifyHelperPath, 0o755);
  await chmod(selfCheckHelperPath, 0o755);
  await chmod(foldEvidenceHelperPath, 0o755);

  process.stdout.write(`${JSON.stringify(renderedPlan, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
