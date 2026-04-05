import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const panelPath = path.resolve(testDir, "../../components/service-accounts/service-accounts-panel.tsx");

test("Service accounts panel keeps disable error helper and copy", async () => {
  const source = await readFile(panelPath, "utf8");

  assert.match(source, /ControlPlaneRequestError/);
  assert.match(source, /function formatServiceAccountDisableError/);
  assert.match(source, /Service account disable failed/);
  assert.match(source, /text-red-600/);
});

test("Service accounts panel highlights go-live drill and evidence path", async () => {
  const source = await readFile(panelPath, "utf8");

  assert.match(source, /go-live drill so the evidence path stays intact/);
  assert.match(source, /Capture Week 8 evidence/);
});
