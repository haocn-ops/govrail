import assert from "node:assert/strict";
import test from "node:test";

import {
  buildControlPlanePageRequestHeaders,
  buildServerBaseUrl,
  requestControlPlanePageData,
} from "../server-control-plane-page-fetch.ts";

test("buildServerBaseUrl returns null without a forwarded host", () => {
  const value = buildServerBaseUrl({
    get(name: string) {
      return name === "x-forwarded-proto" ? "https" : null;
    },
  });

  assert.equal(value, null);
});

test("buildServerBaseUrl prefers forwarded host and proto", () => {
  const value = buildServerBaseUrl({
    get(name: string) {
      if (name === "x-forwarded-host") return "control.example.com";
      if (name === "x-forwarded-proto") return "https";
      return null;
    },
  });

  assert.equal(value, "https://control.example.com");
});

test("buildControlPlanePageRequestHeaders forwards workspace and metadata-auth headers for internal page fetches", () => {
  const headers = buildControlPlanePageRequestHeaders({
    get(name: string) {
      switch (name) {
        case "cookie":
          return "session=demo";
        case "x-workspace-id":
          return "ws_123";
        case "x-workspace-slug":
          return "acme";
        case "x-authenticated-subject":
          return "owner@example.com";
        case "x-authenticated-roles":
          return "workspace_owner";
        case "cf-access-authenticated-user-email":
          return "owner@example.com";
        case "cf-access-authenticated-user-groups":
          return "workspace_owner";
        default:
          return null;
      }
    },
  });

  assert.deepEqual(headers, {
    accept: "application/json",
    cookie: "session=demo",
    "x-workspace-id": "ws_123",
    "x-workspace-slug": "acme",
    "x-authenticated-subject": "owner@example.com",
    "x-authenticated-roles": "workspace_owner",
    "cf-access-authenticated-user-email": "owner@example.com",
    "cf-access-authenticated-user-groups": "workspace_owner",
  });
});

test("requestControlPlanePageData returns null when base url is unavailable", async () => {
  const calls: string[] = [];

  const value = await requestControlPlanePageData("/api/control-plane/workspace", {
    getHeaders: () => ({
      get() {
        return null;
      },
    }),
    fetchImpl: async (input) => {
      calls.push(String(input));
      return Response.json({ data: { ok: true } });
    },
  });

  assert.equal(value, null);
  assert.equal(calls.length, 0);
});

test("requestControlPlanePageData forwards workspace and auth headers and unwraps data payload", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];

  const value = await requestControlPlanePageData<{ ok: boolean }>("/api/control-plane/workspace", {
    getHeaders: () => ({
      get(name: string) {
        if (name === "x-forwarded-host") return "preview.internal";
        if (name === "x-forwarded-proto") return "https";
        if (name === "cookie") return "session=demo";
        if (name === "x-workspace-id") return "ws_123";
        if (name === "x-workspace-slug") return "acme";
        if (name === "x-authenticated-subject") return "owner@example.com";
        if (name === "x-authenticated-roles") return "workspace_owner";
        return null;
      },
    }),
    fetchImpl: async (input, init) => {
      calls.push({ input: String(input), init });
      return Response.json({ data: { ok: true } });
    },
  });

  assert.deepEqual(value, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "https://preview.internal/api/control-plane/workspace");
  assert.equal(calls[0]?.init?.cache, "no-store");
  assert.deepEqual(calls[0]?.init?.headers, {
    accept: "application/json",
    cookie: "session=demo",
    "x-workspace-id": "ws_123",
    "x-workspace-slug": "acme",
    "x-authenticated-subject": "owner@example.com",
    "x-authenticated-roles": "workspace_owner",
  });
});

test("requestControlPlanePageData returns null on non-ok responses", async () => {
  const value = await requestControlPlanePageData("/api/control-plane/runs/run_123", {
    getHeaders: () => ({
      get(name: string) {
        if (name === "host") return "localhost:3000";
        return null;
      },
    }),
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
  });

  assert.equal(value, null);
});
