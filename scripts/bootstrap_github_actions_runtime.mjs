import { execFileSync } from "node:child_process";
import {
  RECOMMENDED_PROBE_VARIABLE_NAMES,
  REQUIRED_SECRET_NAMES,
  REQUIRED_VARIABLE_NAMES,
} from "./lib/github_actions_runtime_inventory.mjs";

const DEFAULT_REPO = process.env.GITHUB_REPOSITORY || "haocn-ops/agent_control_plane";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function requireRepo(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !normalized.includes("/")) {
    throw new Error(`Invalid GitHub repository: ${value || "<empty>"}. Use --repo owner/name or set GITHUB_REPOSITORY.`);
  }
  return normalized;
}

function collectEntries(names, kind) {
  const missing = [];
  const entries = [];

  for (const name of names) {
    const rawValue = process.env[name];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) {
      missing.push(name);
      continue;
    }
    entries.push({ kind, name, value });
  }

  return { entries, missing };
}

function collectOptionalEntries(names, kind) {
  const entries = [];
  const missing = [];
  for (const name of names) {
    const rawValue = process.env[name];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) {
      missing.push(name);
      continue;
    }
    entries.push({ kind, name, value });
  }
  return { entries, missing };
}

function runGh(args, options = {}) {
  execFileSync("gh", args, {
    stdio: options.stdio ?? "inherit",
    env: process.env,
  });
}

function formatCommand(entry, repo) {
  if (entry.kind === "variable") {
    return `gh variable set ${entry.name} --repo ${repo} --body <${entry.name}>`;
  }
  return `gh secret set ${entry.name} --repo ${repo} --body <redacted>`;
}

function printUsage() {
  console.log(`Usage:
  npm run github:actions:bootstrap -- [--repo owner/name] [--dry-run] [--skip-variables] [--skip-secrets]
  Optional synthetic check support:
    --include-synthetic   Also set optional synthetic probe variables if present in your environment
    --require-synthetic   Require optional synthetic probe variables to be present (implies --include-synthetic)

Required environment variables:
  CLOUDFLARE_ACCOUNT_ID
  ACP_STAGING_BASE_URL
  ACP_PRODUCTION_BASE_URL
  ACP_PRODUCTION_TENANT_ID
  ACP_PRODUCTION_RUN_ID
  CLOUDFLARE_API_TOKEN
Optional (recommended for Synthetic Runtime Checks SSE probes):
  ACP_STAGING_TENANT_ID
  ACP_SYNTH_SUBJECT_ID
  ACP_SYNTH_SUBJECT_ROLES

Notes:
  - Use --dry-run to print the gh commands without mutating the repository.
  - If you only have a local Wrangler OAuth login, that is not enough for GitHub deploy workflows.
    You still need a real Cloudflare API token to populate CLOUDFLARE_API_TOKEN.
`);
}

async function main() {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const repo = requireRepo(readArg("--repo") ?? DEFAULT_REPO);
  const dryRun = hasFlag("--dry-run");
  const skipVariables = hasFlag("--skip-variables");
  const skipSecrets = hasFlag("--skip-secrets");
  const includeSynthetic = hasFlag("--include-synthetic") || hasFlag("--require-synthetic");
  const requireSynthetic = hasFlag("--require-synthetic");

  const variableResult = skipVariables
    ? { entries: [], missing: [] }
    : collectEntries(REQUIRED_VARIABLE_NAMES, "variable");
  const secretResult = skipSecrets
    ? { entries: [], missing: [] }
    : collectEntries(REQUIRED_SECRET_NAMES, "secret");

  const syntheticResult =
    skipVariables || !includeSynthetic
      ? { entries: [], missing: [] }
      : collectOptionalEntries(RECOMMENDED_PROBE_VARIABLE_NAMES, "variable");

  const missing = [
    ...variableResult.missing,
    ...secretResult.missing,
    ...(requireSynthetic ? syntheticResult.missing : []),
  ];
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment values: ${missing.join(", ")}. ` +
        "Populate them locally first, then rerun the bootstrap.",
    );
  }

  const operations = [...variableResult.entries, ...syntheticResult.entries, ...secretResult.entries];
  if (operations.length === 0) {
    console.log("Nothing to do: both variables and secrets were skipped.");
    return;
  }

  console.log(
    JSON.stringify(
      {
        repo,
        dry_run: dryRun,
        variable_count: variableResult.entries.length,
        synthetic_variable_count: syntheticResult.entries.length,
        secret_count: secretResult.entries.length,
        warnings:
          includeSynthetic && !requireSynthetic && syntheticResult.missing.length > 0
            ? [
                "Synthetic Runtime Checks SSE probes are optional but recommended. Missing: " +
                  syntheticResult.missing.join(", "),
              ]
            : [],
        operations: operations.map((entry) => ({
          kind: entry.kind,
          name: entry.name,
          command: formatCommand(entry, repo),
        })),
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    return;
  }

  runGh(["auth", "status"]);

  for (const entry of variableResult.entries) {
    runGh(["variable", "set", entry.name, "--repo", repo, "--body", entry.value]);
  }

  for (const entry of syntheticResult.entries) {
    runGh(["variable", "set", entry.name, "--repo", repo, "--body", entry.value]);
  }

  for (const entry of secretResult.entries) {
    runGh(["secret", "set", entry.name, "--repo", repo, "--body", entry.value]);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        repo,
        variables_updated: variableResult.entries.map((entry) => entry.name),
        synthetic_variables_updated: syntheticResult.entries.map((entry) => entry.name),
        secrets_updated: secretResult.entries.map((entry) => entry.name),
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
