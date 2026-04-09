import { access, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

function printUsage() {
  console.log(`validate_synthetic_runtime_artifact.mjs

Validate a Synthetic Runtime Checks artifact manifest and its expected file layout.

Usage:
  node scripts/validate_synthetic_runtime_artifact.mjs --manifest <file> [--artifact-dir <dir>]
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
  return Number.isFinite(Date.parse(value));
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

function expectObject(container, key, errors, label = key) {
  const value = container[key];
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
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
  if (explicitType) {
    return explicitType;
  }
  const filename = basename(manifestPath);
  const inferred = {
    "synthetic-runtime-health-manifest.json": "synthetic_runtime_health",
    "synthetic-runtime-production-manifest.json": "synthetic_runtime_production_readonly",
  }[filename];
  if (!inferred) {
    throw new Error(`Unable to infer synthetic artifact manifest type from filename: ${filename}`);
  }
  return inferred;
}

function validateSyntheticCheck(check, index, errors) {
  if (!isObject(check)) {
    errors.push(`synthetic checks[${index}] must be an object`);
    return;
  }
  if (typeof check.service !== "string" || check.service.trim() === "") {
    errors.push(`synthetic checks[${index}].service must be a non-empty string`);
  }
  if (typeof check.environment !== "string" || check.environment.trim() === "") {
    errors.push(`synthetic checks[${index}].environment must be a non-empty string`);
  }
  if (typeof check.check_id !== "string" || check.check_id.trim() === "") {
    errors.push(`synthetic checks[${index}].check_id must be a non-empty string`);
  }
  if (check.skipped === true) {
    if (typeof check.reason !== "string" || check.reason.trim() === "") {
      errors.push(`synthetic checks[${index}].reason must be set when skipped=true`);
    }
    return;
  }
  if (typeof check.base_url !== "string" || !check.base_url.startsWith("https://")) {
    errors.push(`synthetic checks[${index}].base_url must start with https://`);
  }
  if (!isIsoTimestamp(check.timestamp)) {
    errors.push(`synthetic checks[${index}].timestamp must be an ISO timestamp`);
  }
  if (typeof check.status_code !== "number") {
    errors.push(`synthetic checks[${index}].status_code must be a number`);
  }
  if (typeof check.ok !== "boolean") {
    errors.push(`synthetic checks[${index}].ok must be a boolean`);
  }
}

function validateSyntheticSummary(summary, errors, label) {
  if (!isObject(summary)) {
    errors.push(`${label} must be a JSON object`);
    return;
  }
  if (typeof summary.ok !== "boolean") {
    errors.push(`${label}.ok must be a boolean`);
  }
  if (typeof summary.service !== "string" || summary.service.trim() === "") {
    errors.push(`${label}.service must be a non-empty string`);
  }
  if (!isIsoTimestamp(summary.generated_at)) {
    errors.push(`${label}.generated_at must be an ISO timestamp`);
  }
  if (typeof summary.run_sse_probes !== "boolean") {
    errors.push(`${label}.run_sse_probes must be a boolean`);
  }
  if (!Array.isArray(summary.configured_targets) || summary.configured_targets.length === 0) {
    errors.push(`${label}.configured_targets must be a non-empty array`);
  }
  if (!isObject(summary.configured_identity)) {
    errors.push(`${label}.configured_identity must be an object`);
  }
  if (!Array.isArray(summary.checks) || summary.checks.length === 0) {
    errors.push(`${label}.checks must be a non-empty array`);
  } else {
    summary.checks.forEach((check, index) => validateSyntheticCheck(check, index, errors));
  }
}

function validateReadonlySummary(summary, errors, label) {
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

const CONTRACTS = {
  synthetic_runtime_health: {
    artifactDirName: "synthetic-runtime-checks",
    manifestFilename: "synthetic-runtime-health-manifest.json",
    inputValidators(inputs, errors) {
      expectString(inputs, "event_name", errors, "inputs.event_name");
      expectBoolean(inputs, "run_sse_probes", errors, "inputs.run_sse_probes");
    },
    outcomeKeys: ["probe_runtime"],
    artifactRules: [
      { key: "synthetic_summary_json", existsWhen: "always", validator: validateSyntheticSummary },
      { key: "summary_md", existsWhen: "always" },
    ],
    validate(manifest, errors) {
      if (typeof manifest.target_count !== "number") {
        errors.push(`target_count must be a number`);
      }
      if (typeof manifest.check_count !== "number") {
        errors.push(`check_count must be a number`);
      }
      if (!isObject(manifest.configured_identity)) {
        errors.push(`configured_identity must be an object`);
      }
    },
  },
  synthetic_runtime_production_readonly: {
    artifactDirName: "synthetic-runtime-checks",
    manifestFilename: "synthetic-runtime-production-manifest.json",
    inputValidators(inputs, errors) {
      expectString(inputs, "base_url", errors, "inputs.base_url");
      expectString(inputs, "tenant_id", errors, "inputs.tenant_id");
      expectString(inputs, "run_id", errors, "inputs.run_id");
      expectString(inputs, "event_name", errors, "inputs.event_name");
    },
    outcomeKeys: ["verify_readonly"],
    artifactRules: [
      { key: "verify_readonly_log", existsWhen: "not_skipped", outcomeKey: "verify_readonly" },
      { key: "verify_readonly_summary", existsWhen: "success", outcomeKey: "verify_readonly", validator: validateReadonlySummary },
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
    throw new Error(`Unsupported synthetic artifact manifest type: ${kind}`);
  }

  const artifactDir = resolve(normalizeOptionalString(readArg("--artifact-dir")) ?? resolve(dirname(manifestPath), ".."));

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

  if (inputs) {
    contract.inputValidators(inputs, errors);
  }
  if (outcomes) {
    for (const key of contract.outcomeKeys) {
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
      if (!shouldExist(rule, outcomes)) {
        continue;
      }
      const absolutePath = resolve(artifactDir, artifactPath.slice(`${contract.artifactDirName}/`.length));
      if (!(await fileExists(absolutePath))) {
        errors.push(`Expected artifact file is missing: ${artifactPath}`);
        continue;
      }
      if (rule.validator) {
        const data = JSON.parse(await readFile(absolutePath, "utf8"));
        rule.validator(data, errors, artifactPath);
      }
    }
  }

  contract.validate?.(manifest, errors);

  if (errors.length > 0) {
    throw new Error(`Synthetic runtime artifact validation failed:\n- ${errors.join("\n- ")}`);
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
