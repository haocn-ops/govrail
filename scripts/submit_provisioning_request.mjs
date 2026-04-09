#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { validateProvisioningRequestContract } from "./lib/provisioning_request_contract.mjs";

function printUsage() {
  console.log([
    "Usage: node scripts/submit_provisioning_request.mjs --request <file> --endpoint <url> [options]",
    "",
    "Required:",
    "  --request <file>       Provisioning request JSON to submit",
    "  --endpoint <url>       HTTP endpoint that accepts the request JSON",
    "",
    "Options:",
    "  --output <file>        Evidence JSON output path (default: ./provisioning-submission-evidence.json)",
    "  --method <verb>        HTTP method (default: POST)",
    "  --timeout-ms <n>       Request timeout in milliseconds (default: 30000)",
    "  --dry-run             Do not send network request; write evidence as planned submission",
    "  --retries <n>          Number of retries on network/5xx/429 (default: 2)",
    "  --retry-backoff-ms <n> Base backoff in ms between retries (default: 800)",
    "  --retry-on <codes>     Comma-separated HTTP status codes to retry (default: 429,500,502,503,504)",
    "  --header <name:value>  Extra header to send; may be repeated",
    "  --idempotency-key <k>  Optional idempotency key passed to the endpoint",
    "  --idempotency-header <h> Header name for idempotency key (default: Idempotency-Key)",
    "  --help                 Show this help message",
    "",
    "Environment:",
    "  PROVISIONING_TOKEN     Optional bearer token added as Authorization: Bearer <token>",
    "  PROVISIONING_HEADERS   Optional JSON object merged into request headers",
    "  PROVISIONING_IDEMPOTENCY_KEY     Optional default idempotency key",
    "  PROVISIONING_IDEMPOTENCY_HEADER  Optional default idempotency header name",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { headers: [] };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      options._ = options._ ?? [];
      options._.push(arg);
      continue;
    }

    const eqIndex = arg.indexOf("=");
    const key = arg.slice(2, eqIndex === -1 ? undefined : eqIndex);
    let value = eqIndex === -1 ? argv[index + 1] : arg.slice(eqIndex + 1);
    if (eqIndex === -1) {
      if (value === undefined || value.startsWith("--")) {
        value = "true";
      } else {
        index += 1;
      }
    }

    if (key === "header") {
      options.headers.push(value);
    } else {
      options[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
  }
  return options;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required argument: ${label}`);
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseJsonMaybe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parsePositiveInt(value, label, fallback) {
  const raw = normalizeOptionalString(value);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function parseStatusCodes(value, fallback) {
  const raw = normalizeOptionalString(value);
  if (!raw) return fallback;
  const parts = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  const codes = [];
  for (const part of parts) {
    const code = Number.parseInt(part, 10);
    if (!Number.isFinite(code) || code < 100 || code > 599) {
      throw new Error(`--retry-on must be a comma-separated list of HTTP status codes (got ${JSON.stringify(value)})`);
    }
    codes.push(code);
  }
  return codes.length ? codes : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseHeaderPair(value) {
  const raw = requireString(value, "--header");
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`Invalid --header value: ${raw}. Expected name:value`);
  }
  const name = raw.slice(0, separatorIndex).trim();
  const headerValue = raw.slice(separatorIndex + 1).trim();
  if (name === "" || headerValue === "") {
    throw new Error(`Invalid --header value: ${raw}. Expected name:value`);
  }
  return [name, headerValue];
}

function pickRequestMetadata(requestJson) {
  if (!requestJson || typeof requestJson !== "object" || Array.isArray(requestJson)) {
    return null;
  }

  const tenant = requestJson.tenant && typeof requestJson.tenant === "object" && !Array.isArray(requestJson.tenant)
    ? requestJson.tenant
    : null;
  const externalHandoff =
    requestJson.external_handoff && typeof requestJson.external_handoff === "object" && !Array.isArray(requestJson.external_handoff)
      ? requestJson.external_handoff
      : null;

  return {
    schema_version: typeof requestJson.schema_version === "string" ? requestJson.schema_version : null,
    request_type: typeof requestJson.request_type === "string" ? requestJson.request_type : null,
    status: typeof requestJson.status === "string" ? requestJson.status : null,
    tenant_id: typeof tenant?.tenant_id === "string" ? tenant.tenant_id : null,
    deploy_env: typeof tenant?.deploy_env === "string" ? tenant.deploy_env : null,
    base_url: typeof tenant?.base_url === "string" ? tenant.base_url : null,
    change_ticket: typeof externalHandoff?.change_ticket === "string" ? externalHandoff.change_ticket : null,
    request_owner: typeof externalHandoff?.request_owner === "string" ? externalHandoff.request_owner : null,
    external_system_record: typeof externalHandoff?.external_system_record === "string" ? externalHandoff.external_system_record : null,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  const requestPath = resolve(requireString(args.request, "--request"));
  const endpoint = requireString(args.endpoint, "--endpoint");
  const method = normalizeOptionalString(args.method)?.toUpperCase() ?? "POST";
  const outputPath = resolve(normalizeOptionalString(args.output) ?? "provisioning-submission-evidence.json");
  const timeoutMs = Number.parseInt(normalizeOptionalString(args.timeoutMs) ?? "30000", 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }

  const dryRun = toBoolean(args.dryRun);
  const retries = parsePositiveInt(args.retries, "--retries", 2);
  const retryBackoffMs = parsePositiveInt(args.retryBackoffMs, "--retry-backoff-ms", 800);
  const retryOn = parseStatusCodes(args.retryOn, [429, 500, 502, 503, 504]);
  const idempotencyHeader =
    normalizeOptionalString(args.idempotencyHeader) ??
    normalizeOptionalString(process.env.PROVISIONING_IDEMPOTENCY_HEADER) ??
    "Idempotency-Key";
  const idempotencyKey =
    normalizeOptionalString(args.idempotencyKey) ??
    normalizeOptionalString(process.env.PROVISIONING_IDEMPOTENCY_KEY);

  const rawRequest = await readFile(requestPath, "utf8");
  const requestJson = parseJsonMaybe(rawRequest);
  if (requestJson === null || typeof requestJson !== "object" || Array.isArray(requestJson)) {
    throw new Error(`Request file must contain a JSON object: ${requestPath}`);
  }
  const contractValidation = validateProvisioningRequestContract(requestJson);
  if (!contractValidation.ok) {
    throw new Error(`Provisioning request contract validation failed:\n- ${contractValidation.errors.join("\n- ")}`);
  }

  const requestMetadata = pickRequestMetadata(requestJson);

  const headers = new Headers({
    "content-type": "application/json",
    "user-agent": "agent-control-plane-provisioning-submit-helper",
  });
  const authToken = normalizeOptionalString(process.env.PROVISIONING_TOKEN);
  if (authToken) {
    headers.set("authorization", `Bearer ${authToken}`);
  }

  if (idempotencyKey) {
    headers.set(idempotencyHeader, idempotencyKey);
  }

  const mergedHeaders = normalizeOptionalString(process.env.PROVISIONING_HEADERS);
  if (mergedHeaders) {
    const parsed = parseJsonMaybe(mergedHeaders);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("PROVISIONING_HEADERS must be a JSON object");
    }
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim() !== "") {
        headers.set(name, value.trim());
      }
    }
  }

  for (const header of args.headers ?? []) {
    const [name, value] = parseHeaderPair(header);
    headers.set(name, value);
  }

  const headerNames = [...headers.keys()].sort();
  const submittedAt = new Date().toISOString();

  let response = null;
  let responseText = null;
  let responseJson = null;
  let networkError = null;
  const attempts = [];

  if (!dryRun) {
    const maxAttempts = retries + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      let attemptError = null;
      let status = null;
      let statusText = null;
      try {
        response = await fetch(endpoint, {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : rawRequest,
          signal: controller.signal,
        });
        status = response.status;
        statusText = response.statusText;
        responseText = await response.text();
        responseJson = parseJsonMaybe(responseText);
      } catch (error) {
        attemptError = error instanceof Error ? error.message : String(error);
        networkError = attemptError;
      } finally {
        clearTimeout(timeout);
      }

      const ok = attemptError === null && response !== null && response.ok;
      const retryable =
        attemptError !== null ||
        (response !== null && !response.ok && typeof response.status === "number" && retryOn.includes(response.status));

      attempts.push({
        attempt,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
        ok,
        retryable,
        error: attemptError,
        status,
        status_text: statusText,
      });

      if (ok || attempt === maxAttempts || !retryable) {
        break;
      }

      const backoff = retryBackoffMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * Math.min(250, backoff));
      await sleep(backoff + jitter);
    }
  }

  const evidence = {
    ok: dryRun ? true : networkError === null && response !== null && response.ok,
    submitted_at: submittedAt,
    dry_run: dryRun,
    client: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    retry: {
      retries,
      retry_backoff_ms: retryBackoffMs,
      retry_on: retryOn,
      attempts,
    },
    request: {
      path: requestPath,
      sha256: sha256(rawRequest),
      metadata: requestMetadata,
      contract_validation: {
        ok: contractValidation.ok,
        warnings: contractValidation.warnings,
      },
      body: requestJson,
    },
    endpoint: {
      url: endpoint,
      method,
      timeout_ms: timeoutMs,
      headers: headerNames,
      idempotency: idempotencyKey
        ? {
            header: idempotencyHeader,
            key: idempotencyKey,
          }
        : null,
    },
    response:
      dryRun
        ? {
            ok: true,
            skipped: true,
            reason: "dry-run",
          }
        : response === null
        ? {
            ok: false,
            error: networkError,
          }
        : {
            ok: response.ok,
            status: response.status,
            status_text: response.statusText,
            headers: Object.fromEntries(
              [...response.headers.entries()].filter(([name]) =>
                ["content-type", "x-request-id", "x-trace-id", "location"].includes(name.toLowerCase()),
              ),
            ),
            text: responseText,
            text_sha256: typeof responseText === "string" ? sha256(responseText) : null,
            json: responseJson,
          },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  if (!evidence.ok) {
    const message =
      networkError ??
      `Provisioning request failed with status ${response?.status ?? "unknown"} ${response?.statusText ?? ""}`.trim();
    console.error(message);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
