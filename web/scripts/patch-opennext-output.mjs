import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targetPaths = [
  resolve(".open-next/server-functions/default/index.mjs"),
  resolve(".open-next/server-functions/default/handler.mjs")
];

const patterns = [
  {
    from: "function setNextjsServerWorkingDirectory(){process.chdir(\"\")}",
    to: "function setNextjsServerWorkingDirectory(){}"
  },
  {
    from: "function setNextjsServerWorkingDirectory(){process.chdir(__dirname)}",
    to: "function setNextjsServerWorkingDirectory(){}"
  },
  {
    from: "process.chdir(\"\")",
    to: "void 0"
  },
  {
    from: "process.chdir(__dirname)",
    to: "void 0"
  }
];

const patchedFiles = [];

for (const targetPath of targetPaths) {
  const source = readFileSync(targetPath, "utf8");
  let patched = source;
  let replaced = false;

  for (const pattern of patterns) {
    if (patched.includes(pattern.from)) {
      patched = patched.replaceAll(pattern.from, pattern.to);
      replaced = true;
    }
  }

  if (!replaced) {
    throw new Error(`Expected process.chdir patch target was not found in ${targetPath}`);
  }

  writeFileSync(targetPath, patched);
  patchedFiles.push(targetPath);
}

process.stdout.write(`Patched OpenNext server runtime in ${patchedFiles.join(", ")}\n`);
