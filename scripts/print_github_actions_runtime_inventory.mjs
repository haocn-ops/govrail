import {
  BOOTSTRAP_OPTIONAL_ENV_NAMES,
  BOOTSTRAP_REQUIRED_ENV_NAMES,
  buildGithubActionsRuntimeInventory,
} from "./lib/github_actions_runtime_inventory.mjs";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function printUsage() {
  console.log(`Usage:
  npm run github:actions:inventory -- [--format json|markdown] [--workflow <workflow_id>]

Examples:
  npm run github:actions:inventory -- --format json
  npm run github:actions:inventory -- --format markdown
  npm run github:actions:inventory -- --workflow deploy-production
`);
}

function formatInputLine(input) {
  const required = input.required ? "required" : "optional";
  return `- \`${input.name}\` (${required}; ${input.when}) - ${input.description}`;
}

function formatList(items) {
  if (!items.length) {
    return ["- `<none>`"];
  }
  return items.map((item) => `- \`${item}\``);
}

function renderMarkdown(inventory) {
  const lines = [
    "# GitHub Actions Runtime Inventory",
    "",
    `Version: \`${inventory.version}\``,
    "",
    "## Bootstrap",
    "",
    "Required local environment values before running `github:actions:bootstrap`:",
    ...formatList(BOOTSTRAP_REQUIRED_ENV_NAMES),
    "",
    "Optional local environment values for synthetic SSE probes:",
    ...formatList(BOOTSTRAP_OPTIONAL_ENV_NAMES),
    "",
    "## Workflows",
    "",
  ];

  for (const workflow of inventory.workflows) {
    lines.push(`### ${workflow.name}`);
    lines.push("");
    lines.push(`- Workflow ID: \`${workflow.workflow_id}\``);
    lines.push(`- File: \`${workflow.file}\``);
    lines.push(`- Triggers: ${workflow.triggers.map((trigger) => `\`${trigger}\``).join(", ")}`);
    lines.push("- Repository variables:");
    lines.push(...formatList(workflow.repository_variables));
    lines.push("- Repository secrets:");
    lines.push(...formatList(workflow.repository_secrets));
    lines.push("- workflow_dispatch inputs:");
    if (workflow.workflow_dispatch_inputs.length) {
      lines.push(...workflow.workflow_dispatch_inputs.map(formatInputLine));
    } else {
      lines.push("- `<none>`");
    }
    lines.push("- Notes:");
    lines.push(...workflow.notes.map((note) => `- ${note}`));
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const format = (readArg("--format") ?? "json").trim().toLowerCase();
  if (!["json", "markdown"].includes(format)) {
    throw new Error(`Unsupported format: ${format}. Use json or markdown.`);
  }

  const workflowId = (readArg("--workflow") ?? "").trim();
  const inventory = buildGithubActionsRuntimeInventory();
  const filteredInventory =
    workflowId === ""
      ? inventory
      : {
          ...inventory,
          workflows: inventory.workflows.filter((workflow) => workflow.workflow_id === workflowId),
        };

  if (workflowId !== "" && filteredInventory.workflows.length === 0) {
    throw new Error(`Unknown workflow_id: ${workflowId}`);
  }

  if (format === "markdown") {
    process.stdout.write(renderMarkdown(filteredInventory));
    return;
  }

  process.stdout.write(`${JSON.stringify(filteredInventory, null, 2)}\n`);
}

main();
