import { ApiError } from "./http.js";

interface ParsedAuthRef {
  normalized: string;
  binding_name: string;
  header_name: string | null;
  mode: "default" | "bearer" | "header";
}

const SECRET_BINDING_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function normalizeAuthRef(authRef?: string | null): string | null {
  const parsed = parseAuthRef(authRef);
  return parsed ? parsed.normalized : null;
}

export function resolveAuthHeaders(env: Env, authRef?: string | null): Headers {
  const headers = new Headers();
  const parsed = parseAuthRef(authRef);
  if (!parsed) {
    return headers;
  }

  if (parsed.mode === "header") {
    headers.set(parsed.header_name ?? "", readSecretBinding(env, parsed.binding_name, parsed.normalized));
    return headers;
  }

  headers.set("authorization", `Bearer ${readSecretBinding(env, parsed.binding_name, parsed.normalized)}`);
  return headers;
}

function parseAuthRef(authRef?: string | null): ParsedAuthRef | null {
  if (authRef === undefined || authRef === null) {
    return null;
  }

  const trimmed = authRef.trim();
  if (trimmed === "") {
    return null;
  }

  if (trimmed.startsWith("bearer:")) {
    const bindingName = trimmed.slice("bearer:".length).trim();
    validateSecretBindingName(bindingName, trimmed);
    return {
      normalized: `bearer:${bindingName}`,
      binding_name: bindingName,
      header_name: null,
      mode: "bearer",
    };
  }

  if (trimmed.startsWith("header:")) {
    const remainder = trimmed.slice("header:".length);
    const separatorIndex = remainder.indexOf(":");
    if (separatorIndex === -1) {
      throw invalidAuthRef(
        trimmed,
        "auth_ref must use header:<Header-Name>:<SECRET_BINDING_NAME> format",
      );
    }

    const headerName = remainder.slice(0, separatorIndex).trim();
    const bindingName = remainder.slice(separatorIndex + 1).trim();
    validateHeaderName(headerName, trimmed);
    validateSecretBindingName(bindingName, trimmed);
    return {
      normalized: `header:${headerName}:${bindingName}`,
      binding_name: bindingName,
      header_name: headerName,
      mode: "header",
    };
  }

  validateSecretBindingName(trimmed, trimmed);
  return {
    normalized: trimmed,
    binding_name: trimmed,
    header_name: null,
    mode: "default",
  };
}

function readSecretBinding(env: Env, bindingName: string, authRef: string): string {
  if (bindingName === "") {
    throw invalidAuthRef(authRef, "auth_ref secret binding name must not be empty");
  }

  const secretValue = ((env as unknown) as Record<string, unknown>)[bindingName];
  if (typeof secretValue !== "string" || secretValue.trim() === "") {
    throw new ApiError(
      500,
      "upstream_auth_not_configured",
      `Secret binding ${bindingName} referenced by auth_ref is not configured on this Worker environment`,
      {
        auth_ref: authRef,
        binding_name: bindingName,
      },
    );
  }

  return secretValue;
}

function validateSecretBindingName(bindingName: string, authRef: string): void {
  if (bindingName === "") {
    throw invalidAuthRef(authRef, "auth_ref secret binding name must not be empty");
  }

  if (!SECRET_BINDING_NAME_PATTERN.test(bindingName)) {
    throw invalidAuthRef(
      authRef,
      "auth_ref secret binding name must contain only letters, numbers, and underscores",
      {
        binding_name: bindingName,
      },
    );
  }
}

function validateHeaderName(headerName: string, authRef: string): void {
  if (headerName === "") {
    throw invalidAuthRef(authRef, "auth_ref header name must not be empty");
  }

  if (!HTTP_HEADER_NAME_PATTERN.test(headerName)) {
    throw invalidAuthRef(
      authRef,
      "auth_ref header name must be a valid HTTP header token",
      {
        header_name: headerName,
      },
    );
  }
}

function invalidAuthRef(
  authRef: string,
  message: string,
  details: Record<string, unknown> = {},
): ApiError {
  return new ApiError(500, "upstream_auth_invalid", message, {
    auth_ref: authRef,
    expected_format: "bearer:<SECRET_BINDING_NAME>, header:<Header-Name>:<SECRET_BINDING_NAME>, or <SECRET_BINDING_NAME>",
    ...details,
  });
}
