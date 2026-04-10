#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function ensureManifest(manifest) {
  if (!manifest || manifest.kind !== "observability_integration_manifest") {
    throw new Error("observability manifest must have kind=observability_integration_manifest");
  }
}

function createTemplate(requiredFields, defaults) {
  const template = { ...defaults };
  for (const field of requiredFields) {
    if (!(field in template)) {
      template[field] = null;
    }
  }
  return template;
}

function renderEnvExample(runtime) {
  return [
    `BASE_URL=${runtime.baseUrl}`,
    `TENANT_ID=${runtime.tenantId}`,
    `RUN_ID=${runtime.runId ?? "<existing_run_id>"}`,
    `SUBJECT_ID=${runtime.subjectId}`,
    `SUBJECT_ROLES=${runtime.subjectRoles}`,
    `OBS_SYNTH_SUBJECT=${runtime.subjectId}`,
    `OBS_SYNTH_ROLES=${runtime.subjectRoles}`,
  ].join("\n");
}

function renderReadonlyVerifyScript(runtime) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `DEFAULT_BASE_URL="${runtime.baseUrl}"`,
    `DEFAULT_TENANT_ID="${runtime.tenantId}"`,
    `DEFAULT_RUN_ID="${runtime.runId ?? "<existing_run_id>"}"`,
    `DEFAULT_SUBJECT_ID="${runtime.subjectId}"`,
    `DEFAULT_SUBJECT_ROLES="${runtime.subjectRoles}"`,
    'BASE_URL="${BASE_URL:-${DEFAULT_BASE_URL}}"',
    'TENANT_ID="${TENANT_ID:-${DEFAULT_TENANT_ID}}"',
    'RUN_ID="${RUN_ID:-${DEFAULT_RUN_ID}}"',
    'SUBJECT_ID="${SUBJECT_ID:-${DEFAULT_SUBJECT_ID}}"',
    'SUBJECT_ROLES="${SUBJECT_ROLES:-${DEFAULT_SUBJECT_ROLES}}"',
    'VERIFY_OUTPUT_PATH="${VERIFY_OUTPUT_PATH:-${SCRIPT_DIR}/evidence/production-readonly-verify.json}"',
    "",
    'if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "<existing_run_id>" ]; then',
    '  echo "Set RUN_ID before running readonly verify." >&2',
    "  exit 1",
    "fi",
    "",
    'BASE_URL="$BASE_URL" TENANT_ID="$TENANT_ID" RUN_ID="$RUN_ID" SUBJECT_ID="$SUBJECT_ID" SUBJECT_ROLES="$SUBJECT_ROLES" VERIFY_OUTPUT_PATH="$VERIFY_OUTPUT_PATH" npm run post-deploy:verify:readonly',
    "",
  ].join("\n");
}

function renderBundleReadme({ runtime, checks, alertRules, routes, dashboardPanels }) {
  return `# Observability Bundle

Environment: \`${runtime.environment}\`
Base URL: \`${runtime.baseUrl}\`
Tenant ID: \`${runtime.tenantId}\`

## Runtime Inputs

- \`BASE_URL=${runtime.baseUrl}\`
- \`TENANT_ID=${runtime.tenantId}\`
- \`RUN_ID=${runtime.runId ?? "<existing_run_id>"}\`
- \`SUBJECT_ID=${runtime.subjectId}\`
- \`SUBJECT_ROLES=${runtime.subjectRoles}\`

## Synthetic Checks

${checks.map((check) => `- \`${check.id}\`: ${check.schedule} -> ${check.alert_rule_refs?.join(", ") ?? "no alert refs"}`).join("\n")}

## Alert Rules

${alertRules.map((rule) => `- \`${rule.id}\` -> route \`${rule.route_ref}\` (${rule.severity})`).join("\n")}

## Alert Routes

${routes.map((route) => `- \`${route.id}\`: ${route.destinations.join(", ")}`).join("\n")}

## Dashboard Panels

${dashboardPanels.map((panel) => `- \`${panel.panel_id}\`: synthetic=\`${panel.synthetic_check_ref ?? "-"}\`, alert=\`${panel.alert_rule_ref ?? "-"}\``).join("\n")}

## Generated Files

- \`runtime-inputs.env.example\`
- \`observability-manifest.json\`
- \`synthetic-checks.json\`
- \`alert-rules.json\`
- \`alert-routes.json\`
- \`dashboard-panel-refs.json\`
- \`run-production-readonly-verify.sh\`
- \`evidence/*.json\`
`;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(`render_observability_bundle.mjs

Usage:
  node scripts/render_observability_bundle.mjs --output-dir <dir> [options]

Options:
  --manifest <file>      Default: docs/observability_integration_manifest.example.json
  --dashboard <file>     Default: docs/monitoring_dashboard_template.example.json
  --environment <name>   Default: production
  --base-url <url>       Default: https://api.govrail.net
  --tenant-id <id>       Default: tenant_verify_prod_20260401
  --run-id <id>          Optional readonly verify run id placeholder
  --subject-id <id>      Default: observability_executor
  --subject-roles <csv>  Default: platform_admin,ops_oncall
`);
    return;
  }

  const manifestPath = resolve(
    normalizeOptionalString(readArg("--manifest")) ?? "docs/observability_integration_manifest.example.json",
  );
  const dashboardPath = resolve(
    normalizeOptionalString(readArg("--dashboard")) ?? "docs/monitoring_dashboard_template.example.json",
  );
  const outputDir = resolve(normalizeOptionalString(readArg("--output-dir")) ?? ".observability-bundles/default");
  const environment = normalizeOptionalString(readArg("--environment")) ?? "production";
  const runtime = {
    environment,
    baseUrl: normalizeOptionalString(readArg("--base-url")) ?? "https://api.govrail.net",
    tenantId: normalizeOptionalString(readArg("--tenant-id")) ?? "tenant_verify_prod_20260401",
    runId: normalizeOptionalString(readArg("--run-id")),
    subjectId: normalizeOptionalString(readArg("--subject-id")) ?? "observability_executor",
    subjectRoles: normalizeOptionalString(readArg("--subject-roles")) ?? "platform_admin,ops_oncall",
  };

  const [manifest, dashboard] = await Promise.all([readJsonFile(manifestPath), readJsonFile(dashboardPath)]);
  ensureManifest(manifest);

  const checks = (manifest.synthetic_checks ?? []).filter((check) => {
    if (!check || typeof check !== "object") {
      return false;
    }
    return check.environment === environment || check.environment === "staging_or_production";
  });
  const alertRules = manifest.alert_rules ?? [];
  const routes = manifest.alert_routes ?? [];
  const dashboardPanels = (dashboard.sections ?? []).flatMap((section) => section.panels ?? []);

  const selectedManifest = {
    ...manifest,
    selected_environment: environment,
    resolved_runtime_inputs: {
      BASE_URL: runtime.baseUrl,
      TENANT_ID: runtime.tenantId,
      RUN_ID: runtime.runId,
      SUBJECT_ID: runtime.subjectId,
      SUBJECT_ROLES: runtime.subjectRoles,
    },
    synthetic_checks: checks,
  };

  const evidenceDir = join(outputDir, "evidence");
  await Promise.all([mkdir(outputDir, { recursive: true }), mkdir(evidenceDir, { recursive: true })]);

  await Promise.all([
    writeFile(join(outputDir, "runtime-inputs.env.example"), `${renderEnvExample(runtime)}\n`, "utf8"),
    writeFile(join(outputDir, "observability-manifest.json"), `${JSON.stringify(selectedManifest, null, 2)}\n`, "utf8"),
    writeFile(join(outputDir, "synthetic-checks.json"), `${JSON.stringify(checks, null, 2)}\n`, "utf8"),
    writeFile(join(outputDir, "alert-rules.json"), `${JSON.stringify(alertRules, null, 2)}\n`, "utf8"),
    writeFile(join(outputDir, "alert-routes.json"), `${JSON.stringify(routes, null, 2)}\n`, "utf8"),
    writeFile(join(outputDir, "dashboard-panel-refs.json"), `${JSON.stringify(dashboardPanels, null, 2)}\n`, "utf8"),
    writeFile(
      join(outputDir, "README.md"),
      `${renderBundleReadme({ runtime, checks, alertRules, routes, dashboardPanels })}\n`,
      "utf8",
    ),
    writeFile(join(outputDir, "run-production-readonly-verify.sh"), renderReadonlyVerifyScript(runtime), "utf8"),
    ...checks.map((check) =>
      writeFile(
        join(evidenceDir, `${check.id}.template.json`),
        `${JSON.stringify(
          createTemplate(check.evidence_summary?.required_fields ?? [], {
            service: manifest.service,
            environment,
            check_id: check.id,
            base_url: runtime.baseUrl,
            tenant_id: runtime.tenantId,
          }),
          null,
          2,
        )}\n`,
        "utf8",
      ),
    ),
    writeFile(
      join(evidenceDir, "incident-evidence.template.json"),
      `${JSON.stringify(
        createTemplate(manifest.evidence_contract?.incident_required_fields ?? [], {
          service: manifest.service,
          environment,
          base_url: runtime.baseUrl,
          tenant_id: runtime.tenantId,
        }),
        null,
        2,
      )}\n`,
      "utf8",
    ),
  ]);

  await chmod(join(outputDir, "run-production-readonly-verify.sh"), 0o755);

  console.log(
    JSON.stringify(
      {
        ok: true,
        output_dir: outputDir,
        environment,
        files: {
          manifest: join(outputDir, "observability-manifest.json"),
          synthetic_checks: join(outputDir, "synthetic-checks.json"),
          alert_rules: join(outputDir, "alert-rules.json"),
          alert_routes: join(outputDir, "alert-routes.json"),
          dashboard_panels: join(outputDir, "dashboard-panel-refs.json"),
          runtime_inputs: join(outputDir, "runtime-inputs.env.example"),
          readonly_verify_helper: join(outputDir, "run-production-readonly-verify.sh"),
          evidence_dir: evidenceDir,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
