import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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

function normalizeOptionalString(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const value = rawValue.trim();
  return value === "" ? null : value;
}

function planFromTemplate(template) {
  return {
    tenant_id: normalizeNonEmpty(template.tenant_id, "tenant_id"),
    deploy_env: normalizeDeployEnv(template.deploy_env),
    worker_url: normalizeNonEmpty(template.worker_url, "worker_url"),
    northbound_auth_mode: normalizeNonEmpty(template.northbound_auth_mode ?? "trusted_edge", "northbound_auth_mode"),
    access_application_name: normalizeNonEmpty(
      template.access_application_name ?? `${template.tenant_id}-access`,
      "access_application_name",
    ),
    service_token_name: normalizeNonEmpty(
      template.service_token_name ?? `${template.tenant_id}-service-token`,
      "service_token_name",
    ),
    trusted_subject_header: normalizeNonEmpty(
      template.trusted_subject_header ?? "X-Authenticated-Subject",
      "trusted_subject_header",
    ),
    trusted_roles_header: normalizeNonEmpty(
      template.trusted_roles_header ?? "X-Authenticated-Roles",
      "trusted_roles_header",
    ),
    access_group_names: Array.isArray(template.access_group_names)
      ? template.access_group_names.map((value) => String(value).trim()).filter((value) => value !== "")
      : [],
    service_token_audience: normalizeOptionalString(template.service_token_audience),
    verify_output_path: normalizeOptionalString(template.verify_output_path),
    notes: normalizeOptionalString(template.notes),
  };
}

function renderChecklist(plan) {
  const writeVerifyCommand = `BASE_URL="${plan.worker_url}" TENANT_ID="${plan.tenant_id}" VERIFY_OUTPUT_PATH="${plan.verify_output_path ?? "/tmp/access-ingress-verify.json"}" npm run post-deploy:verify`;
  const readonlyVerifyCommand = `BASE_URL="${plan.worker_url}" TENANT_ID="${plan.tenant_id}" RUN_ID="<existing_run_id>" VERIFY_OUTPUT_PATH="${plan.verify_output_path ?? "/tmp/access-ingress-readonly-verify.json"}" npm run post-deploy:verify:readonly`;

  return [
    "# Access Ingress Checklist",
    "",
    `Tenant: \`${plan.tenant_id}\``,
    `Deploy env: \`${plan.deploy_env}\``,
    `Worker URL: \`${plan.worker_url}\``,
    `Northbound auth mode: \`${plan.northbound_auth_mode}\``,
    "",
    "## Access / Token Setup",
    "",
    `- [ ] Access application exists: \`${plan.access_application_name}\``,
    `- [ ] Service token exists: \`${plan.service_token_name}\``,
    `- [ ] Trusted subject header is \`${plan.trusted_subject_header}\``,
    `- [ ] Trusted roles header is \`${plan.trusted_roles_header}\``,
    "- [ ] Access groups or token scopes are aligned with tenant access",
    `- [ ] Worker is configured with \`NORTHBOUND_AUTH_MODE=${plan.northbound_auth_mode}\``,
    "",
    "## Verification",
    "",
    "```bash",
    writeVerifyCommand,
    readonlyVerifyCommand,
    "```",
    "",
    "## Evidence",
    "",
    "- Store the verification summary JSON next to this checklist.",
    "- Record the Access application name, service token name, and the latest successful `trace_id`.",
    "- If this plan is for staging, use write-mode verification first.",
    "- If this plan is for production, prefer readonly verification after the controlled write verify has completed.",
    "",
    ...(plan.notes ? ["## Notes", "", plan.notes, ""] : []),
  ].join("\n");
}

function renderPlanJson(plan) {
  const verifyOutputPath = plan.verify_output_path ?? null;
  return {
    ok: true,
    ...plan,
    verification_commands: {
      write: `BASE_URL="${plan.worker_url}" TENANT_ID="${plan.tenant_id}" VERIFY_OUTPUT_PATH="${verifyOutputPath ?? "/tmp/access-ingress-verify.json"}" npm run post-deploy:verify`,
      readonly: `BASE_URL="${plan.worker_url}" TENANT_ID="${plan.tenant_id}" RUN_ID="<existing_run_id>" VERIFY_OUTPUT_PATH="${verifyOutputPath ?? "/tmp/access-ingress-readonly-verify.json"}" npm run post-deploy:verify:readonly`,
    },
  };
}

async function main() {
  const planFile = normalizeOptionalString(readArg("--plan-file"));
  const outputDir = resolve(normalizeOptionalString(readArg("--output-dir")) ?? ".access-ingress-plans");
  const tenantIdArg = normalizeOptionalString(readArg("--tenant-id"));
  const deployEnvArg = normalizeOptionalString(readArg("--deploy-env"));
  const workerUrlArg = normalizeOptionalString(readArg("--worker-url"));

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
        service_token_audience: normalizeOptionalString(readArg("--service-token-audience")),
        verify_output_path: normalizeOptionalString(readArg("--verify-output-path")),
        notes: normalizeOptionalString(readArg("--notes")),
      };

  const plan = planFromTemplate(template);
  await mkdir(outputDir, { recursive: true });

  const planJsonPath = join(outputDir, "access-ingress-plan.json");
  const checklistPath = join(outputDir, "access-ingress-checklist.md");
  const renderedPlan = renderPlanJson(plan);
  const renderedChecklist = renderChecklist(plan);

  await Promise.all([
    writeFile(planJsonPath, `${JSON.stringify(renderedPlan, null, 2)}\n`, "utf8"),
    writeFile(checklistPath, renderedChecklist, "utf8"),
  ]);

  process.stdout.write(`${JSON.stringify(renderedPlan, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
