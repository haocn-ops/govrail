import { access, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

function printUsage() {
  console.log(`validate_secret_rotation_bundle.mjs

Validate a generated secret rotation bundle manifest, artifacts, and evidence templates.

Usage:
  node scripts/validate_secret_rotation_bundle.mjs --manifest <file> [--artifact-dir <dir>]
`);
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

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function expectObject(container, key, errors, label = key) {
  const value = container[key];
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return null;
  }
  return value;
}

function expectString(container, key, errors, label = key) {
  const value = container[key];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${label} must be a non-empty string`);
    return null;
  }
  return value;
}

function expectBoolean(container, key, errors, label = key) {
  const value = container[key];
  if (typeof value !== "boolean") {
    errors.push(`${label} must be a boolean`);
    return null;
  }
  return value;
}

function expectArray(container, key, errors, label = key) {
  const value = container[key];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return null;
  }
  return value;
}

function expectNullableString(value, errors, label) {
  if (value !== null && typeof value !== "string") {
    errors.push(`${label} must be null or a string`);
  }
}

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateProviderEvidenceEntries(entries, errors, label) {
  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return;
  }
  entries.forEach((entry, index) => {
    if (!isObject(entry)) {
      errors.push(`${label}[${index}] must be an object`);
      return;
    }
    for (const key of [
      "tool_provider_id",
      "provider_type",
      "current_auth_ref",
      "next_auth_ref",
      "secret_binding_name",
      "cutover_verify_command",
      "rollback_verify_command",
    ]) {
      if (typeof entry[key] !== "string" || entry[key].trim() === "") {
        errors.push(`${label}[${index}].${key} must be a non-empty string`);
      }
    }
    expectNullableString(entry.expected_cutover_verify_output_path ?? null, errors, `${label}[${index}].expected_cutover_verify_output_path`);
    expectNullableString(entry.expected_rollback_verify_output_path ?? null, errors, `${label}[${index}].expected_rollback_verify_output_path`);
  });
}

function validateRollbackFallbackEntries(entries, errors, label) {
  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return;
  }
  entries.forEach((entry, index) => {
    if (!isObject(entry)) {
      errors.push(`${label}[${index}] must be an object`);
      return;
    }
    if (typeof entry.tool_provider_id !== "string" || entry.tool_provider_id.trim() === "") {
      errors.push(`${label}[${index}].tool_provider_id must be a non-empty string`);
    }
    expectNullableString(entry.rollback_verify_command ?? null, errors, `${label}[${index}].rollback_verify_command`);
    expectNullableString(
      entry.expected_rollback_verify_output_path ?? null,
      errors,
      `${label}[${index}].expected_rollback_verify_output_path`,
    );
  });
}

function validateEvidenceBase(evidence, manifest, files, errors, label) {
  if (!isObject(evidence)) {
    errors.push(`${label} must be a JSON object`);
    return false;
  }
  if (evidence.schema_version !== 1) {
    errors.push(`${label}.schema_version must be 1`);
  }
  if (typeof evidence.phase !== "string" || evidence.phase.trim() === "") {
    errors.push(`${label}.phase must be a non-empty string`);
  }
  if (evidence.tenant_id !== manifest.tenant_id) {
    errors.push(`${label}.tenant_id must match manifest.tenant_id`);
  }
  if (evidence.deploy_env !== manifest.deploy_env) {
    errors.push(`${label}.deploy_env must match manifest.deploy_env`);
  }
  if (evidence.owner !== manifest.owner) {
    errors.push(`${label}.owner must match manifest.owner`);
  }
  if ((evidence.change_ref ?? null) !== (manifest.change_ref ?? null)) {
    errors.push(`${label}.change_ref must match manifest.change_ref`);
  }
  if (evidence.rotation_window !== manifest.rotation_window) {
    errors.push(`${label}.rotation_window must match manifest.rotation_window`);
  }
  if ((evidence.notes ?? null) !== (manifest.notes ?? null)) {
    errors.push(`${label}.notes must match manifest.notes`);
  }
  if (evidence.manifest_path !== files.manifest) {
    errors.push(`${label}.manifest_path must match files.manifest`);
  }
  if (evidence.checklist_path !== files.checklist) {
    errors.push(`${label}.checklist_path must match files.checklist`);
  }
  if (evidence.rotate_script_path !== files.script) {
    errors.push(`${label}.rotate_script_path must match files.script`);
  }
  return true;
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const manifestArg = normalizeOptionalString(readArg("--manifest"));
  if (!manifestArg) {
    throw new Error(`--manifest is required`);
  }

  const manifestPath = resolve(manifestArg);
  const artifactDir = resolve(normalizeOptionalString(readArg("--artifact-dir")) ?? resolve(dirname(manifestPath), ".."));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  const errors = [];

  if (basename(manifestPath) !== "rotation-manifest.json") {
    errors.push(`manifest filename must be rotation-manifest.json`);
  }
  if (!isObject(manifest)) {
    throw new Error(`manifest must be a JSON object`);
  }
  if (manifest.schema_version !== 1) {
    errors.push(`schema_version must be 1`);
  }
  if (!isIsoTimestamp(manifest.generated_at)) {
    errors.push(`generated_at must be an ISO timestamp`);
  }
  expectString(manifest, "tenant_id", errors, "tenant_id");
  if (!["staging", "production"].includes(manifest.deploy_env)) {
    errors.push(`deploy_env must be staging or production`);
  }
  expectString(manifest, "owner", errors, "owner");
  expectNullableString(manifest.change_ref ?? null, errors, "change_ref");
  expectNullableString(manifest.notes ?? null, errors, "notes");
  expectString(manifest, "rotation_window", errors, "rotation_window");
  if (!isIsoTimestamp(manifest.rotation_window_start)) {
    errors.push(`rotation_window_start must be an ISO timestamp`);
  }
  if (!isIsoTimestamp(manifest.rotation_window_end)) {
    errors.push(`rotation_window_end must be an ISO timestamp`);
  }

  const validation = expectObject(manifest, "validation", errors, "validation");
  if (validation) {
    expectBoolean(validation, "strict", errors, "validation.strict");
    if (typeof validation.warning_count !== "number") {
      errors.push(`validation.warning_count must be a number`);
    }
    const warnings = expectArray(validation, "warnings", errors, "validation.warnings");
    if (warnings && typeof validation.warning_count === "number" && validation.warning_count !== warnings.length) {
      errors.push(`validation.warning_count must equal validation.warnings.length`);
    }
  }

  const files = expectObject(manifest, "files", errors, "files");
  const phases = expectObject(manifest, "phases", errors, "phases");

  if (!files || !phases) {
    throw new Error(`rotation manifest is missing files or phases`);
  }

  const expectedFileKeys = {
    plan: "rotation-plan.json",
    checklist: "rotation-checklist.md",
    manifest: "rotation-manifest.json",
    script: "rotate.sh",
    preview_evidence: "evidence/preview.json",
    command_log: "evidence/command-log.txt",
    cutover_evidence: "evidence/cutover.json",
    rollback_evidence: "evidence/rollback.json",
  };

  for (const [key, expectedPath] of Object.entries(expectedFileKeys)) {
    if (files[key] !== expectedPath) {
      errors.push(`files.${key} must be ${expectedPath}`);
    }
    const absolutePath = resolve(artifactDir, expectedPath);
    if (!(await fileExists(absolutePath))) {
      errors.push(`Expected bundle artifact is missing: ${expectedPath}`);
    }
  }

  const previewPhase = expectObject(phases, "preview", errors, "phases.preview");
  const cutoverPhase = expectObject(phases, "cutover", errors, "phases.cutover");
  const rollbackPhase = expectObject(phases, "rollback", errors, "phases.rollback");

  if (previewPhase) {
    if (previewPhase.script_mode !== "preview") {
      errors.push(`phases.preview.script_mode must be preview`);
    }
    if (previewPhase.evidence_file !== files.preview_evidence) {
      errors.push(`phases.preview.evidence_file must match files.preview_evidence`);
    }
    const goals = expectArray(previewPhase, "goals", errors, "phases.preview.goals");
    if (goals && goals.length === 0) {
      errors.push(`phases.preview.goals must not be empty`);
    }
  }

  if (cutoverPhase) {
    if (cutoverPhase.script_mode !== "cutover") {
      errors.push(`phases.cutover.script_mode must be cutover`);
    }
    if (cutoverPhase.evidence_file !== files.cutover_evidence) {
      errors.push(`phases.cutover.evidence_file must match files.cutover_evidence`);
    }
    expectArray(cutoverPhase, "secret_commands", errors, "phases.cutover.secret_commands");
    const cutoverPaths = expectArray(cutoverPhase, "expected_verify_output_paths", errors, "phases.cutover.expected_verify_output_paths");
    validateProviderEvidenceEntries(cutoverPhase.provider_updates, errors, "phases.cutover.provider_updates");
    if (cutoverPaths && cutoverPaths.length === 0) {
      errors.push(`phases.cutover.expected_verify_output_paths must not be empty`);
    }
  }

  if (rollbackPhase) {
    if (rollbackPhase.script_mode !== "rollback") {
      errors.push(`phases.rollback.script_mode must be rollback`);
    }
    if (rollbackPhase.evidence_file !== files.rollback_evidence) {
      errors.push(`phases.rollback.evidence_file must match files.rollback_evidence`);
    }
    const revertAuthRefs = expectArray(rollbackPhase, "revert_auth_refs", errors, "phases.rollback.revert_auth_refs");
    if (revertAuthRefs && revertAuthRefs.length === 0) {
      errors.push(`phases.rollback.revert_auth_refs must not be empty`);
    }
    expectNullableString(rollbackPhase.rollback_verify_command ?? null, errors, "phases.rollback.rollback_verify_command");
    validateRollbackFallbackEntries(
      rollbackPhase.provider_fallback_verify_commands,
      errors,
      "phases.rollback.provider_fallback_verify_commands",
    );
    expectArray(rollbackPhase, "expected_verify_output_paths", errors, "phases.rollback.expected_verify_output_paths");
    expectBoolean(rollbackPhase, "delete_new_secret_after_revert", errors, "phases.rollback.delete_new_secret_after_revert");
  }

  const planPath = resolve(artifactDir, files.plan);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  if (!isObject(plan)) {
    errors.push(`rotation-plan.json must be a JSON object`);
  } else {
    if (plan.tenant_id !== manifest.tenant_id) {
      errors.push(`rotation-plan.json tenant_id must match manifest.tenant_id`);
    }
    if (plan.deploy_env !== manifest.deploy_env) {
      errors.push(`rotation-plan.json deploy_env must match manifest.deploy_env`);
    }
    if (plan.owner !== manifest.owner) {
      errors.push(`rotation-plan.json owner must match manifest.owner`);
    }
    if ((plan.change_ref ?? null) !== (manifest.change_ref ?? null)) {
      errors.push(`rotation-plan.json change_ref must match manifest.change_ref`);
    }
    if (plan.rotation_window !== manifest.rotation_window) {
      errors.push(`rotation-plan.json rotation_window must match manifest.rotation_window`);
    }
    const providerUpdates = expectArray(plan, "provider_updates", errors, "rotation-plan.json provider_updates");
    if (providerUpdates && providerUpdates.length === 0) {
      errors.push(`rotation-plan.json provider_updates must not be empty`);
    }
    const secretCommands = expectArray(plan, "secret_commands", errors, "rotation-plan.json secret_commands");
    if (secretCommands && secretCommands.length === 0) {
      errors.push(`rotation-plan.json secret_commands must not be empty`);
    }
    const rollback = expectObject(plan, "rollback", errors, "rotation-plan.json rollback");
    if (rollback) {
      const revertAuthRefs = expectArray(rollback, "revert_auth_refs", errors, "rotation-plan.json rollback.revert_auth_refs");
      if (revertAuthRefs && revertAuthRefs.length === 0) {
        errors.push(`rotation-plan.json rollback.revert_auth_refs must not be empty`);
      }
      expectNullableString(rollback.rollback_verify_command ?? null, errors, "rotation-plan.json rollback.rollback_verify_command");
      expectBoolean(rollback, "delete_new_secret_after_revert", errors, "rotation-plan.json rollback.delete_new_secret_after_revert");
    }
  }

  const previewEvidence = JSON.parse(await readFile(resolve(artifactDir, files.preview_evidence), "utf8"));
  const cutoverEvidence = JSON.parse(await readFile(resolve(artifactDir, files.cutover_evidence), "utf8"));
  const rollbackEvidence = JSON.parse(await readFile(resolve(artifactDir, files.rollback_evidence), "utf8"));

  if (validateEvidenceBase(previewEvidence, manifest, files, errors, "evidence.preview")) {
    if (previewEvidence.phase !== "preview") {
      errors.push(`evidence.preview.phase must be preview`);
    }
    if (previewEvidence.status !== "planned") {
      errors.push(`evidence.preview.status must be planned`);
    }
    expectNullableString(previewEvidence.reviewed_by ?? null, errors, "evidence.preview.reviewed_by");
    expectNullableString(previewEvidence.reviewed_at ?? null, errors, "evidence.preview.reviewed_at");
    expectNullableString(previewEvidence.signoff_notes ?? null, errors, "evidence.preview.signoff_notes");
    if (!arraysEqual(previewEvidence.secret_commands, plan.secret_commands)) {
      errors.push(`evidence.preview.secret_commands must match rotation-plan.json secret_commands`);
    }
    validateProviderEvidenceEntries(previewEvidence.provider_updates, errors, "evidence.preview.provider_updates");
    const expectedArtifacts = expectObject(previewEvidence, "expected_artifacts", errors, "evidence.preview.expected_artifacts");
    if (expectedArtifacts) {
      const expectedArtifactMap = {
        plan: files.plan,
        checklist: files.checklist,
        manifest: files.manifest,
        preview_evidence: files.preview_evidence,
        cutover_evidence: files.cutover_evidence,
        rollback_evidence: files.rollback_evidence,
      };
      for (const [key, value] of Object.entries(expectedArtifactMap)) {
        if (expectedArtifacts[key] !== value) {
          errors.push(`evidence.preview.expected_artifacts.${key} must match files.${key}`);
        }
      }
    }
  }

  if (validateEvidenceBase(cutoverEvidence, manifest, files, errors, "evidence.cutover")) {
    if (cutoverEvidence.phase !== "cutover") {
      errors.push(`evidence.cutover.phase must be cutover`);
    }
    if (cutoverEvidence.status !== "pending") {
      errors.push(`evidence.cutover.status must be pending`);
    }
    expectNullableString(cutoverEvidence.executed_by ?? null, errors, "evidence.cutover.executed_by");
    expectNullableString(cutoverEvidence.started_at ?? null, errors, "evidence.cutover.started_at");
    expectNullableString(cutoverEvidence.completed_at ?? null, errors, "evidence.cutover.completed_at");
    expectNullableString(cutoverEvidence.summary ?? null, errors, "evidence.cutover.summary");
    const cutoverVerificationEvidence = expectObject(
      cutoverEvidence,
      "verification_evidence",
      errors,
      "evidence.cutover.verification_evidence",
    );
    const outputs = cutoverVerificationEvidence
      ? expectArray(cutoverVerificationEvidence, "outputs", errors, "evidence.cutover.verification_evidence.outputs")
      : null;
    if (outputs && outputs.length === 0) {
      errors.push(`evidence.cutover.verification_evidence.outputs must not be empty`);
    }
    const expectedPaths = cutoverEvidence.expected_verify_output_paths;
    if (!arraysEqual(expectedPaths, phases.cutover.expected_verify_output_paths)) {
      errors.push(`evidence.cutover.expected_verify_output_paths must match phases.cutover.expected_verify_output_paths`);
    }
    if (!Array.isArray(cutoverEvidence.secret_commands) || cutoverEvidence.secret_commands.length !== plan.secret_commands.length) {
      errors.push(`evidence.cutover.secret_commands must mirror rotation-plan.json secret_commands`);
    }
    validateProviderEvidenceEntries(cutoverEvidence.provider_updates, errors, "evidence.cutover.provider_updates");
  }

  if (validateEvidenceBase(rollbackEvidence, manifest, files, errors, "evidence.rollback")) {
    if (rollbackEvidence.phase !== "rollback") {
      errors.push(`evidence.rollback.phase must be rollback`);
    }
    if (rollbackEvidence.status !== "not_needed") {
      errors.push(`evidence.rollback.status must be not_needed`);
    }
    expectNullableString(rollbackEvidence.triggered_by ?? null, errors, "evidence.rollback.triggered_by");
    expectNullableString(rollbackEvidence.started_at ?? null, errors, "evidence.rollback.started_at");
    expectNullableString(rollbackEvidence.completed_at ?? null, errors, "evidence.rollback.completed_at");
    expectNullableString(rollbackEvidence.summary ?? null, errors, "evidence.rollback.summary");
    if (!Array.isArray(rollbackEvidence.revert_auth_refs) || rollbackEvidence.revert_auth_refs.length === 0) {
      errors.push(`evidence.rollback.revert_auth_refs must not be empty`);
    }
    expectNullableString(rollbackEvidence.rollback_verify_command ?? null, errors, "evidence.rollback.rollback_verify_command");
    if (!Array.isArray(rollbackEvidence.provider_fallback_verify_commands) || rollbackEvidence.provider_fallback_verify_commands.length === 0) {
      errors.push(`evidence.rollback.provider_fallback_verify_commands must not be empty`);
    }
    validateRollbackFallbackEntries(
      rollbackEvidence.provider_fallback_verify_commands,
      errors,
      "evidence.rollback.provider_fallback_verify_commands",
    );
    const rollbackVerificationEvidence = expectObject(
      rollbackEvidence,
      "verification_evidence",
      errors,
      "evidence.rollback.verification_evidence",
    );
    const outputs = rollbackVerificationEvidence
      ? expectArray(rollbackVerificationEvidence, "outputs", errors, "evidence.rollback.verification_evidence.outputs")
      : null;
    if (outputs && outputs.length === 0) {
      errors.push(`evidence.rollback.verification_evidence.outputs must not be empty`);
    }
    if (!arraysEqual(rollbackEvidence.expected_verify_output_paths, phases.rollback.expected_verify_output_paths)) {
      errors.push(`evidence.rollback.expected_verify_output_paths must match phases.rollback.expected_verify_output_paths`);
    }
    if (rollbackEvidence.delete_new_secret_after_revert !== phases.rollback.delete_new_secret_after_revert) {
      errors.push(`evidence.rollback.delete_new_secret_after_revert must match phases.rollback.delete_new_secret_after_revert`);
    }
    expectNullableString(rollbackEvidence.secret_cleanup_completed_at ?? null, errors, "evidence.rollback.secret_cleanup_completed_at");
  }

  if (errors.length > 0) {
    throw new Error(`Secret rotation bundle validation failed:\n- ${errors.join("\n- ")}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        manifest_path: manifestPath,
        artifact_dir: artifactDir,
        tenant_id: manifest.tenant_id,
        deploy_env: manifest.deploy_env,
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
