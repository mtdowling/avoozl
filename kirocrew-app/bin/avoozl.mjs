#!/usr/bin/env node
// The Kiro Crew app's entry point. Kiro Crew starts the backend as
// `node bin/avoozl.mjs` with no arguments, so the default command is
// `app-backend`; the MCP server runs `mcp`. A Crew Mode conductor runs the
// runner commands (`next`, `claim`, `report`, `retry`) and its AgentSpawn hook
// runs `next --hook`. The avoozl-driver agent's hooks run `driver hook`. No
// command served from the installed package opens a listener beyond the
// loopback, signed-principal app backend.
// `npm run build:kirocrew-app` writes ./lib.
const COMMANDS = new Set([
  "app-backend",
  "mcp",
  "next",
  "claim",
  "report",
  "retry",
]);

const given = process.argv.slice(2),
  named = given[0] !== undefined && !given[0].startsWith("--"),
  command = named ? given[0] : "app-backend",
  rest = named ? given.slice(1) : given;
// `driver` is allowed only as `driver hook`, the avoozl-driver agent's hook.
const hook = command === "driver" && rest[0] === "hook";
if (!COMMANDS.has(command) && !hook) {
  console.error(
    `avoozl app package: unknown command ${JSON.stringify(command)}; use ${[...COMMANDS].join(", ")}.`,
  );
  process.exit(2);
}

// Without a named workspace, serve the machine catalog's default workspace,
// the one the Workspace view adds or initializes.
const env = process.env;
if (
  !rest.includes("--workspace") &&
  !env.AVOOZL_WORKSPACE &&
  !env.AICOMMANDER_WORKSPACE &&
  !env.NUPP_WORKSPACE
) {
  const { loadHostConfig } = await import("./lib/src/app/host-config.mjs"),
    { config } = loadHostConfig({ env }),
    workspace = config.workspaces[config.defaultWorkspace];
  if (workspace) rest.push("--workspace", workspace.root);
}

// The CLI reads process.argv when it loads.
process.argv = [process.argv[0], process.argv[1], command, ...rest];
await import("./lib/cli.mjs");
