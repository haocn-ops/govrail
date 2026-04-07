import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkspaceContextCallout } from "../workspace-context-callout";

test("WorkspaceContextCallout renders fallback badges, warning copy, and session link", () => {
  const originalReact = (globalThis as typeof globalThis & { React?: typeof React }).React;
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  try {
  const html = renderToStaticMarkup(
    createElement(WorkspaceContextCallout, {
      surface: "verification",
      workspaceSlug: "ops-secure",
      sessionHref: "/session?source=admin-readiness",
      sourceDetail: {
        label: "Environment fallback (non-production)",
        is_fallback: true,
        local_only: true,
        warning:
          "Workspace context was loaded from environment fallback values. Use metadata-backed session context before production rollout.",
        session_checkpoint_required: true,
        checkpoint_label: "Session checkpoint required",
      },
    }),
  );

  assert.match(html, /Verification context checkpoint/);
  assert.match(html, /ops-secure/);
  assert.match(html, /context: Environment fallback \(non-production\)/);
  assert.match(html, /Session checkpoint required/);
  assert.match(html, /fallback warning/);
  assert.match(html, /local-only context/);
  assert.match(
    html,
    /Workspace context was loaded from environment fallback values\. Use metadata-backed session context before production rollout\./,
  );
  assert.match(
    html,
    /Live metadata is unavailable\. Treat this as preview data until you reconfirm metadata-backed identity and tenant on <code class="font-mono">\/session<\/code>\./,
  );
  assert.match(html, /href="\/session\?source=admin-readiness"/);
  assert.match(html, /Review workspace context on \/session/);
  } finally {
    (globalThis as typeof globalThis & { React?: typeof React }).React = originalReact;
  }
});

test("WorkspaceContextCallout keeps metadata context subtle and omits fallback-only copy", () => {
  const originalReact = (globalThis as typeof globalThis & { React?: typeof React }).React;
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  try {
  const html = renderToStaticMarkup(
    createElement(WorkspaceContextCallout, {
      surface: "go-live",
      workspaceSlug: "prod-east",
      sourceDetail: {
        label: "SaaS metadata",
        is_fallback: false,
        local_only: false,
        warning: null,
        session_checkpoint_required: false,
        checkpoint_label: "Trusted metadata session",
      },
    }),
  );

  assert.match(html, /Go-live context checkpoint/);
  assert.match(
    html,
    /Confirm workspace identity before running mock go-live drill notes, reusing the same audit export evidence thread, and handing readiness status back to admin\./,
  );
  assert.doesNotMatch(html, /fallback warning/);
  assert.doesNotMatch(html, /local-only context/);
  assert.doesNotMatch(html, /Live metadata is unavailable/);
  assert.match(html, /context: SaaS metadata/);
  assert.match(html, /Trusted metadata session/);
  } finally {
    (globalThis as typeof globalThis & { React?: typeof React }).React = originalReact;
  }
});
