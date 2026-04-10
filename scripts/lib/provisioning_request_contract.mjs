export const PROVISIONING_REQUEST_SCHEMA_VERSION = "2026-04-01";

const REQUIRED_ACTION_IDS = [
  "seed_import",
  "handoff_submission",
  "provider_overrides",
  "policy_review",
  "apply_bundle_changes",
  "verification",
  "handoff_complete",
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function looksLikeHttpsUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }
  if (value.includes("<") || value.includes(">")) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function pushMissingStringField(errors, value, fieldPath) {
  if (!isNonEmptyString(value)) {
    errors.push(`${fieldPath} must be a non-empty string`);
  }
}

export function validateProvisioningRequestContract(request) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(request)) {
    return {
      ok: false,
      errors: ["request must be a JSON object"],
      warnings,
    };
  }

  if (request.schema_version !== PROVISIONING_REQUEST_SCHEMA_VERSION) {
    errors.push(
      `schema_version must equal ${PROVISIONING_REQUEST_SCHEMA_VERSION} (received: ${JSON.stringify(request.schema_version)})`,
    );
  }
  pushMissingStringField(errors, request.request_type, "request_type");
  pushMissingStringField(errors, request.status, "status");

  const tenant = request.tenant;
  if (!isPlainObject(tenant)) {
    errors.push("tenant must be an object");
  } else {
    pushMissingStringField(errors, tenant.tenant_id, "tenant.tenant_id");
    if (tenant.deploy_env !== "staging" && tenant.deploy_env !== "production") {
      errors.push(`tenant.deploy_env must be staging or production (received: ${JSON.stringify(tenant.deploy_env)})`);
    }
    if (!looksLikeHttpsUrl(tenant.base_url)) {
      errors.push("tenant.base_url must be an https URL or a documented placeholder");
    }
  }

  const bundle = request.bundle;
  if (!isPlainObject(bundle)) {
    errors.push("bundle must be an object");
  } else {
    for (const field of [
      "created_at",
      "output_dir",
      "metadata_json",
      "handoff_markdown",
      "handoff_state_json",
      "provisioning_request_json",
      "rollback_request_json",
      "seed_sql",
      "provision_script",
      "apply_request_script",
      "submit_request_script",
      "complete_handoff_script",
      "rollback_script",
      "status_script",
      "verify_script",
    ]) {
      pushMissingStringField(errors, bundle[field], `bundle.${field}`);
    }
  }

  const externalHandoff = request.external_handoff;
  if (!isPlainObject(externalHandoff)) {
    errors.push("external_handoff must be an object");
  } else {
    for (const field of [
      "request_owner",
      "requester_team",
      "change_ticket",
      "target_completion_date",
      "approver",
      "external_system_record",
    ]) {
      pushMissingStringField(errors, externalHandoff[field], `external_handoff.${field}`);
    }
  }

  if (!Array.isArray(request.actions) || request.actions.length === 0) {
    errors.push("actions must be a non-empty array");
  } else {
    const actionIds = [];
    for (const [index, action] of request.actions.entries()) {
      if (!isPlainObject(action)) {
        errors.push(`actions[${index}] must be an object`);
        continue;
      }
      pushMissingStringField(errors, action.action_id, `actions[${index}].action_id`);
      pushMissingStringField(errors, action.type, `actions[${index}].type`);
      if (typeof action.required !== "boolean") {
        errors.push(`actions[${index}].required must be a boolean`);
      }
      if (isNonEmptyString(action.action_id)) {
        actionIds.push(action.action_id);
      }
      if (!isNonEmptyString(action.command) && !Array.isArray(action.items)) {
        warnings.push(`actions[${index}] should define either command or items for operator handoff`);
      }
      if (action.action_id === "verification" && action.mode !== "write" && action.mode !== "readonly") {
        errors.push(`actions[${index}].mode must be write or readonly`);
      }
    }

    const missingActionIds = REQUIRED_ACTION_IDS.filter((actionId) => !actionIds.includes(actionId));
    if (missingActionIds.length > 0) {
      errors.push(`actions is missing required action_id values: ${missingActionIds.join(", ")}`);
    }
    const duplicateActionIds = actionIds.filter((actionId, index) => actionIds.indexOf(actionId) !== index);
    if (duplicateActionIds.length > 0) {
      errors.push(`actions contains duplicate action_id values: ${[...new Set(duplicateActionIds)].join(", ")}`);
    }
  }

  if (!Array.isArray(request.completion_criteria) || request.completion_criteria.length === 0) {
    errors.push("completion_criteria must be a non-empty array");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    schema_version: PROVISIONING_REQUEST_SCHEMA_VERSION,
  };
}

export function assertProvisioningRequestContract(request) {
  const result = validateProvisioningRequestContract(request);
  if (!result.ok) {
    throw new Error(`Provisioning request contract validation failed:\n- ${result.errors.join("\n- ")}`);
  }
  return result;
}
