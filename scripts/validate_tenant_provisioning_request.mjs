#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  PROVISIONING_REQUEST_SCHEMA_VERSION,
  validateProvisioningRequestContract,
} from "./lib/provisioning_request_contract.mjs";

function printUsage() {
  console.log(`validate_tenant_provisioning_request.mjs

Validate the frozen tenant provisioning request contract.

Usage:
  node scripts/validate_tenant_provisioning_request.mjs --request <file> [--strict]

Defaults:
  --request docs/tenant_provisioning_request.example.json
`);
}

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

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const requestPath = resolve(readArg("--request") ?? "docs/tenant_provisioning_request.example.json");
  const strict = hasFlag("--strict");
  const raw = await readFile(requestPath, "utf8");
  const request = JSON.parse(raw);
  const validation = validateProvisioningRequestContract(request);

  const summary = {
    ok: validation.ok && (!strict || validation.warnings.length === 0),
    schema_version: PROVISIONING_REQUEST_SCHEMA_VERSION,
    request_path: requestPath,
    strict,
    errors: validation.errors,
    warnings: validation.warnings,
  };

  if (!summary.ok) {
    console.error(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
