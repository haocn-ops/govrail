import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(testDir, "../../components/dashboard/recent-tasks.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("recent tasks component reuses shared server-side control-plane page fetch helper", async () => {
  const source = await readSource(componentPath);

  assert.match(
    source,
    /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/,
  );
  assert.match(source, /requestControlPlanePageData<RunGraphResponse>\(`\/api\/control-plane\/runs\/\$\{runId\}\/graph`\)/);
  assert.doesNotMatch(source, /function getBaseUrl\(\): string/);
  assert.doesNotMatch(source, /async function requestControlPlane/);
});
