import { chmod, mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function normalizeOptionalString(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  return trimmed === "" ? null : trimmed;
}

function requireStringField(value, fieldPath) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required field: ${fieldPath}`);
  }
  return value.trim();
}

function normalizeProviderUpdate(candidate, index) {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`provider_updates[${index}] must be an object`);
  }

  const providerId = requireStringField(candidate.tool_provider_id, `provider_updates[${index}].tool_provider_id`);
  const providerType = requireStringField(candidate.provider_type, `provider_updates[${index}].provider_type`);
  const currentAuthRef = requireStringField(candidate.current_auth_ref, `provider_updates[${index}].current_auth_ref`);
  const nextAuthRef = requireStringField(candidate.next_auth_ref, `provider_updates[${index}].next_auth_ref`);
  const secretBindingName = requireStringField(candidate.secret_binding_name, `provider_updates[${index}].secret_binding_name`);
  const cutoverVerifyCommand = requireStringField(
    candidate.cutover_verify_command,
    `provider_updates[${index}].cutover_verify_command`,
  );

  return {
    tool_provider_id: providerId,
    provider_type: providerType,
    current_auth_ref: currentAuthRef,
    next_auth_ref: nextAuthRef,
    secret_binding_name: secretBindingName,
    cutover_verify_command: cutoverVerifyCommand,
  };
}

function normalizePlan(plan, sourcePath) {
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error(`Rotation plan ${sourcePath} must be a JSON object`);
  }

  const tenantId = requireStringField(plan.tenant_id, "tenant_id");
  const deployEnv = requireStringField(plan.deploy_env, "deploy_env");
  const owner = requireStringField(plan.owner, "owner");
  const rotationWindow = requireStringField(plan.rotation_window, "rotation_window");
  const notes = typeof plan.notes === "string" ? plan.notes.trim() : "";

  if (!Array.isArray(plan.provider_updates) || plan.provider_updates.length === 0) {
    throw new Error("rotation plan must include at least one provider update");
  }

  if (!Array.isArray(plan.secret_commands) || plan.secret_commands.length === 0) {
    throw new Error("rotation plan must include at least one secret command");
  }

  const providerUpdates = plan.provider_updates.map((candidate, index) => normalizeProviderUpdate(candidate, index));

  const rollback = plan.rollback;
  if (rollback === null || typeof rollback !== "object" || Array.isArray(rollback)) {
    throw new Error("rotation plan rollback must be an object");
  }

  if (!Array.isArray(rollback.revert_auth_refs) || rollback.revert_auth_refs.length === 0) {
    throw new Error("rotation plan rollback.revert_auth_refs must contain at least one auth_ref");
  }

  return {
    tenant_id: tenantId,
    deploy_env: deployEnv,
    rotation_window: rotationWindow,
    owner,
    notes,
    provider_updates: providerUpdates,
    secret_commands: plan.secret_commands.map((value, index) =>
      requireStringField(value, `secret_commands[${index}]`),
    ),
    rollback: {
      revert_auth_refs: rollback.revert_auth_refs.map((value, index) =>
        requireStringField(value, `rollback.revert_auth_refs[${index}]`),
      ),
      delete_new_secret_after_revert: rollback.delete_new_secret_after_revert === true,
    },
  };
}

function renderChecklist(plan) {
  const providerSections = plan.provider_updates
    .map((provider) => {
      const secretName = provider.secret_binding_name;
      const verifyCommand = provider.cutover_verify_command;
      return [
        `### ${provider.tool_provider_id}`,
        `- Provider type: \`${provider.provider_type}\``,
        `- Current auth_ref: \`${provider.current_auth_ref}\``,
        `- Next auth_ref: \`${provider.next_auth_ref}\``,
        `- New secret binding: \`${secretName}\``,
        "",
        "#### Step sequence",
        "1. Create the new Worker secret binding.",
        "2. Update the provider auth_ref to the next binding.",
        "3. Run verification immediately after cutover.",
        "4. Observe for the configured rotation window.",
        "5. Delete the old secret only after the window is stable.",
        "",
        "#### Commands",
        "```bash",
        `wrangler secret put ${secretName} --env ${plan.deploy_env}`,
        verifyCommand,
        "```",
      ].join("\n");
    })
    .join("\n\n");

  return `# Secret Rotation Checklist

Tenant: \`${plan.tenant_id}\`
Deploy env: \`${plan.deploy_env}\`
Owner: \`${plan.owner}\`
Rotation window: \`${plan.rotation_window}\`

## Notes

${plan.notes ? `- ${plan.notes}` : "- No extra notes provided."}

## Secret Commands

${plan.secret_commands.map((command) => `- \`${command}\``).join("\n")}

## Provider Updates

${providerSections}

## Rollback

1. Revert each \`auth_ref\` to its previous value.
2. Re-run the verification command for the affected provider(s).
3. Keep the new secret binding until the rollback is confirmed stable.
4. If \`delete_new_secret_after_revert\` is true, delete the new binding only after the rollback has settled.

### Revert auth_refs

${plan.rollback.revert_auth_refs.map((authRef) => `- \`${authRef}\``).join("\n")}

## Operator Checklist

- [ ] New secret binding created
- [ ] Provider auth_ref updated
- [ ] Verification passed
- [ ] Observation window complete
- [ ] Old secret removed or intentionally retained for the next round
`;
}

function renderShellScript(plan) {
  const providerBlocks = plan.provider_updates
    .map((provider, index) => {
      return [
        `    echo "Provider ${index + 1}/${plan.provider_updates.length}: ${provider.tool_provider_id}"`,
        `    echo "  Current auth_ref: ${provider.current_auth_ref}"`,
        `    echo "  Next auth_ref: ${provider.next_auth_ref}"`,
        `    echo "  New secret binding: ${provider.secret_binding_name}"`,
        `    echo "  Secret create command: wrangler secret put ${provider.secret_binding_name} --env ${plan.deploy_env}"`,
        `    printf '%s\\n' ${JSON.stringify(provider.cutover_verify_command)}`,
        "",
      ].join("\n");
    })
    .join("\n");

  return `#!/usr/bin/env bash
set -euo pipefail

MODE="\${1:-preview}"

case "$MODE" in
  preview)
    echo "Secret rotation preview"
    echo ""
    echo "Tenant: ${plan.tenant_id}"
    echo "Deploy env: ${plan.deploy_env}"
    echo "Owner: ${plan.owner}"
    echo "Rotation window: ${plan.rotation_window}"
    echo ""
    echo "Secret commands:"
    ${plan.secret_commands
      .map((command) => `printf '%s\\n' ${JSON.stringify(command)} | sed 's/^/  - /'`)
      .join("\n    ")}
    echo ""
    ${providerBlocks}
    echo "Rollback auth_refs:"
    ${plan.rollback.revert_auth_refs
      .map((authRef) => `printf '%s\\n' ${JSON.stringify(authRef)} | sed 's/^/  - /'`)
      .join("\n    ")}
    ;;
  *)
    echo "Usage: $0 [preview]" >&2
    exit 1
    ;;
esac
`;
}

async function main() {
  const planPath = resolve(readArg("--plan") ?? "docs/secret_rotation_plan.example.json");
  const outputDir = resolve(readArg("--output-dir") ?? ".secret-rotation");
  const requestedTenantId = normalizeOptionalString(readArg("--tenant-id"));

  const rawPlan = JSON.parse(await readFile(planPath, "utf8"));
  const plan = normalizePlan(rawPlan, planPath);
  if (requestedTenantId !== null && requestedTenantId !== plan.tenant_id) {
    throw new Error(`Rotation plan tenant_id (${plan.tenant_id}) does not match --tenant-id (${requestedTenantId})`);
  }

  const targetDir = resolve(outputDir, plan.tenant_id);
  await mkdir(targetDir, { recursive: true });

  const normalizedPlanPath = join(targetDir, "rotation-plan.json");
  const checklistPath = join(targetDir, "rotation-checklist.md");
  const scriptPath = join(targetDir, "rotate.sh");

  await Promise.all([
    writeFile(normalizedPlanPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8"),
    writeFile(checklistPath, `${renderChecklist(plan)}\n`, "utf8"),
    writeFile(scriptPath, renderShellScript(plan), "utf8"),
  ]);

  await chmod(scriptPath, 0o755);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        tenant_id: plan.tenant_id,
        deploy_env: plan.deploy_env,
        output_dir: targetDir,
        files: {
          rotation_plan: normalizedPlanPath,
          rotation_checklist: checklistPath,
          rotate_script: scriptPath,
        },
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
