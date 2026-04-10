import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const onboardingWizardPath = path.resolve(testDir, "../../components/onboarding/workspace-onboarding-wizard.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("onboarding wizard keeps explicit workspace-context selection helper after workspace creation", async () => {
  const source = await readSource(onboardingWizardPath);

  assert.match(
    source,
    /import \{[\s\S]*fetchWorkspaceContextSource,[\s\S]*type WorkspaceContextSourceState[\s\S]*\} from "@\/lib\/client-workspace-context";/s,
  );
  assert.match(source, /import \{ performWorkspaceSwitch \} from "@\/lib\/client-workspace-navigation";/);
  assert.match(source, /queryFn: async \(\): Promise<WorkspaceContextSourceState \| null> => \{/);
  assert.match(source, /return await fetchWorkspaceContextSource\(\);/);
  assert.match(source, /await performWorkspaceSwitch\(\{/);
  assert.match(source, /selection: \{/);
  assert.match(source, /workspace_id: nextWorkspace\.workspace_id/);
  assert.match(source, /workspace_slug: nextWorkspace\.slug/);
  assert.match(source, /resetMode: "invalidate",/);
  assert.match(source, /continueOnError: true,/);
});

test("onboarding wizard keeps create->context-switch->invalidate->refresh sequencing contract", async () => {
  const source = await readSource(onboardingWizardPath);

  assert.match(source, /setCreatedWorkspace\(nextWorkspace\);\s*setBootstrapResult\(null\);/s);
  assert.match(source, /setBootstrapResult\(null\);\s*await performWorkspaceSwitch\(\{/s);
  assert.match(source, /queryClient,/);
  assert.match(source, /resetMode: "invalidate",/);
  assert.match(source, /continueOnError: true,/);
  assert.match(source, /\}\);\s*router\.refresh\(\);/s);
});
