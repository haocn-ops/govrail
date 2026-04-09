import { access, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

function printUsage() {
  console.log(`validate_release_artifact_manifest.mjs

Validate a GitHub Actions release/deploy artifact manifest and its expected file layout.

Usage:
  node scripts/validate_release_artifact_manifest.mjs --manifest <file> [--artifact-dir <dir>]
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
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(path) {
  if (!(await fileExists(path))) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8"));
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

function expectOutcomeValue(container, key, errors, label = key) {
  const value = container[key];
  if (!["success", "failure", "cancelled", "skipped"].includes(value)) {
    errors.push(`${label} must be one of success, failure, cancelled, skipped`);
    return null;
  }
  return value;
}

function inferKind(manifestPath, manifest) {
  const explicitType = normalizeOptionalString(manifest.type);
  if (explicitType !== null) {
    return explicitType;
  }

  const filename = basename(manifestPath);
  const inferred = {
    "release-gate-manifest.json": "manual_release_gate",
    "staging-deploy-manifest.json": "staging_deploy",
    "production-deploy-manifest.json": "production_deploy",
    "production-readonly-manifest.json": "production_readonly_verify",
  }[filename];

  if (!inferred) {
    throw new Error(`Unable to infer manifest type from filename: ${filename}`);
  }
  return inferred;
}

const CONTRACTS = {
  manual_release_gate: {
    artifactDirName: "release-gate",
    manifestFilename: "release-gate-manifest.json",
    inputKeys: ["base_url", "tenant_id", "run_id", "expected_run_rate_limit", "expected_replay_rate_limit"],
    outcomeKeys: ["local", "build", "validate_observability", "write", "readonly"],
    artifactRules: [
      { key: "local_log", existsWhen: "not_skipped", outcomeKey: "local" },
      { key: "build_log", existsWhen: "not_skipped", outcomeKey: "build" },
      { key: "validate_observability_log", existsWhen: "not_skipped", outcomeKey: "validate_observability" },
      { key: "write_log", existsWhen: "not_skipped", outcomeKey: "write" },
      { key: "write_summary", existsWhen: "success", outcomeKey: "write" },
      { key: "readonly_log", existsWhen: "not_skipped", outcomeKey: "readonly" },
      { key: "readonly_summary", existsWhen: "success", outcomeKey: "readonly" },
      { key: "summary_md", existsWhen: "always" },
    ],
    validate(manifest, errors) {
      const mode = expectString(manifest, "mode", errors);
      if (mode && !["local", "write", "readonly"].includes(mode)) {
        errors.push(`mode must be local, write, or readonly`);
      }
    },
  },
  staging_deploy: {
    artifactDirName: "staging-deploy",
    manifestFilename: "staging-deploy-manifest.json",
    inputKeys: ["base_url", "tenant_id", "expected_run_rate_limit", "expected_replay_rate_limit"],
    outcomeKeys: ["verify_local", "verify_staging_build", "validate_observability", "deploy_staging", "verify_remote"],
    artifactRules: [
      { key: "verify_local_log", existsWhen: "not_skipped", outcomeKey: "verify_local" },
      { key: "verify_staging_build_log", existsWhen: "not_skipped", outcomeKey: "verify_staging_build" },
      { key: "validate_observability_log", existsWhen: "not_skipped", outcomeKey: "validate_observability" },
      { key: "deploy_staging_log", existsWhen: "not_skipped", outcomeKey: "deploy_staging" },
      { key: "verify_remote_log", existsWhen: "not_skipped", outcomeKey: "verify_remote" },
      { key: "verify_remote_summary", existsWhen: "success", outcomeKey: "verify_remote" },
      { key: "summary_md", existsWhen: "always" },
    ],
  },
  production_deploy: {
    artifactDirName: "production-deploy",
    manifestFilename: "production-deploy-manifest.json",
    inputKeys: ["change_ref", "base_url", "tenant_id", "run_id", "apply_migrations", "d1_database"],
    outcomeKeys: [
      "verify_local",
      "verify_build",
      "validate_observability",
      "apply_migrations",
      "deploy_production",
      "verify_readonly",
    ],
    artifactRules: [
      { key: "verify_local_log", existsWhen: "not_skipped", outcomeKey: "verify_local" },
      { key: "verify_build_log", existsWhen: "not_skipped", outcomeKey: "verify_build" },
      { key: "validate_observability_log", existsWhen: "not_skipped", outcomeKey: "validate_observability" },
      { key: "apply_migrations_log", existsWhen: "not_skipped", outcomeKey: "apply_migrations" },
      { key: "deploy_production_log", existsWhen: "not_skipped", outcomeKey: "deploy_production" },
      { key: "verify_readonly_log", existsWhen: "not_skipped", outcomeKey: "verify_readonly" },
      { key: "verify_readonly_summary", existsWhen: "success", outcomeKey: "verify_readonly" },
      { key: "summary_md", existsWhen: "always" },
    ],
    validate(manifest, errors) {
      if (typeof manifest.version_id !== "string") {
        errors.push(`version_id must be a string`);
      }
    },
  },
  production_readonly_verify: {
    artifactDirName: "production-readonly-verify",
    manifestFilename: "production-readonly-manifest.json",
    inputKeys: ["base_url", "tenant_id", "run_id"],
    outcomeKeys: ["validate_observability", "verify_readonly"],
    artifactRules: [
      { key: "validate_observability_log", existsWhen: "not_skipped", outcomeKey: "validate_observability" },
      { key: "verify_readonly_log", existsWhen: "not_skipped", outcomeKey: "verify_readonly" },
      { key: "verify_readonly_summary", existsWhen: "success", outcomeKey: "verify_readonly" },
      { key: "summary_md", existsWhen: "always" },
    ],
  },
};

function shouldExist(rule, outcomes) {
  if (rule.existsWhen === "always") {
    return true;
  }
  const outcome = outcomes?.[rule.outcomeKey];
  if (rule.existsWhen === "not_skipped") {
    return outcome !== "skipped";
  }
  if (rule.existsWhen === "success") {
    return outcome === "success";
  }
  return false;
}

function validateVerifySummary(summary, label, errors) {
  if (!isObject(summary)) {
    errors.push(`${label} must be a JSON object`);
    return;
  }
  if (typeof summary.ok !== "boolean") {
    errors.push(`${label}.ok must be a boolean`);
  }
  if (!isIsoTimestamp(summary.started_at)) {
    errors.push(`${label}.started_at must be an ISO timestamp`);
  }
  if (!isIsoTimestamp(summary.completed_at)) {
    errors.push(`${label}.completed_at must be an ISO timestamp`);
  }
  if (typeof summary.duration_ms !== "number") {
    errors.push(`${label}.duration_ms must be a number`);
  }
  if (typeof summary.check_count !== "number") {
    errors.push(`${label}.check_count must be a number`);
  }
  if (!Array.isArray(summary.checks)) {
    errors.push(`${label}.checks must be an array`);
  }
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
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const kind = inferKind(manifestPath, manifest);
  const contract = CONTRACTS[kind];
  if (!contract) {
    throw new Error(`Unsupported manifest type: ${kind}`);
  }

  const artifactDir = resolve(
    normalizeOptionalString(readArg("--artifact-dir")) ?? resolve(dirname(manifestPath), ".."),
  );

  const errors = [];
  const inputs = expectObject(manifest, "inputs", errors);
  const outcomes = expectObject(manifest, "outcomes", errors);
  const artifacts = expectObject(manifest, "artifacts", errors);

  if (basename(manifestPath) !== contract.manifestFilename) {
    errors.push(`manifest filename must be ${contract.manifestFilename}`);
  }
  if (basename(artifactDir) !== contract.artifactDirName) {
    errors.push(`artifact directory must end with ${contract.artifactDirName}`);
  }
  if (!isIsoTimestamp(manifest.generated_at)) {
    errors.push(`generated_at must be an ISO timestamp`);
  }

  for (const key of contract.inputKeys) {
    if (inputs) {
      const value = inputs[key];
      if (typeof value !== "string") {
        errors.push(`inputs.${key} must be a string`);
      }
    }
  }

  for (const key of contract.outcomeKeys) {
    if (outcomes) {
      expectOutcomeValue(outcomes, key, errors, `outcomes.${key}`);
    }
  }

  if (artifacts) {
    for (const rule of contract.artifactRules) {
      const artifactPath = expectString(artifacts, rule.key, errors, `artifacts.${rule.key}`);
      if (!artifactPath) {
        continue;
      }
      if (!artifactPath.startsWith(`${contract.artifactDirName}/`)) {
        errors.push(`artifacts.${rule.key} must stay under ${contract.artifactDirName}/`);
        continue;
      }
      if (shouldExist(rule, outcomes)) {
        const absolutePath = resolve(artifactDir, artifactPath.slice(`${contract.artifactDirName}/`.length));
        if (!(await fileExists(absolutePath))) {
          errors.push(`Expected artifact file is missing: ${artifactPath}`);
          continue;
        }
        if (rule.key.endsWith("_summary") || rule.key === "write_summary" || rule.key === "readonly_summary") {
          const summary = await readJsonIfExists(absolutePath);
          validateVerifySummary(summary, artifactPath, errors);
        }
      }
    }
  }

  contract.validate?.(manifest, errors);

  if (errors.length > 0) {
    throw new Error(`Release artifact manifest validation failed:\n- ${errors.join("\n- ")}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        type: kind,
        manifest_path: manifestPath,
        artifact_dir: artifactDir,
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
