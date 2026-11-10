#!/usr/bin/env node
// Builds the canned project the VS Code client is implemented and verified
// against: a fresh Avoozl workspace, the optional product-launch example
// pack, and a separate disposable Git repository holding a trivial
// application, a deterministic check, and an authored slow command.
//
// Nothing here needs a particular machine, a personal workspace, provider
// credentials, or an existing provider session. It never approves a draft,
// starts an agent, or registers a tunnel.
//
//   node scripts/vscode-fixture.mjs [--root DIR] [--no-example] [--json]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Store } from "../src/app/store.mjs";
import { Operations } from "../src/app/operations.mjs";
import { initializeWorkspace } from "../src/app/workspace.mjs";
import { projectConfig } from "../src/app/git.mjs";
import { workspaceIdentity } from "../src/app/identity.mjs";

const exec = promisify(execFile);

// A trivial application. Its only job is to be real code with a real check.
export const APPLICATION_SOURCE = `// Disposable fixture application.
export function greet(name) {
  if (typeof name !== "string" || !name.trim()) throw Error("Name required.");
  return "Hello, " + name.trim() + "!";
}
`;

// A deterministic check: same input, same verdict, no network, no clock.
export const CHECK_SOURCE = `import assert from "node:assert/strict";
import { greet } from "./app.mjs";
assert.equal(greet("fixture"), "Hello, fixture!");
assert.equal(greet("  padded  "), "Hello, padded!");
assert.throws(() => greet(""), /Name required/);
console.log("fixture checks passed");
`;

// A harmless slow command. It records the identity of the process that really
// ran, so cancellation can be proven against an actual process rather than
// inferred from a stopped spinner. The completion marker is written only on a
// normal finish, and uses a different name from the start marker.
export const SLOW_COMMAND_SOURCE = `import fs from "node:fs";
import path from "node:path";
const target = process.argv[2];
if (!target) throw Error("Usage: node slow-command.mjs MARKER_PREFIX [SECONDS]");
const seconds = Number(process.argv[3] || 180);
fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
fs.writeFileSync(
  target + ".started",
  JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
);
console.log("FIXTURE_SLOW_COMMAND_STARTED " + process.pid);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => {
    fs.writeFileSync(target + ".interrupted", signal);
    process.exit(0);
  });
setTimeout(() => {
  fs.writeFileSync(target + ".completed", "normal completion");
  console.log("FIXTURE_SLOW_COMMAND_COMPLETED");
}, seconds * 1000);
`;

export const README_SOURCE = `# Disposable VS Code client fixture

A throwaway repository for exercising Avoozl's VS Code client: one
trivial application, one deterministic check, and one authored slow command
used to prove approval, execution, and cancellation against a real process.

    node check.mjs                      # deterministic check
    node slow-command.mjs markers/demo  # writes markers/demo.started, then waits

Nothing here is production code and nothing outside this directory is touched.
`;

export async function createFixture({
  root,
  example = "product-launch",
  name = "VS Code client fixture",
  port = 9428,
} = {}) {
  root =
    root || fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-vscode-fixture-"));
  fs.mkdirSync(root, { recursive: true });
  const workspaceRoot = path.join(root, "workspace"),
    repo = path.join(root, "fixture-repo"),
    markers = path.join(root, "markers");
  const initialized = initializeWorkspace(workspaceRoot, { name, port });
  fs.mkdirSync(markers, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });
  const git = (args) =>
    exec("git", args, { cwd: repo }).then((r) => r.stdout.trim());
  await git(["init", "-b", "main"]);
  // Identity local to this repository only; no global Git configuration is read
  // for authorship and none is written.
  await git(["config", "user.name", "Avoozl fixture"]);
  await git(["config", "user.email", "fixture@example.invalid"]);
  await git(["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(repo, "app.mjs"), APPLICATION_SOURCE);
  fs.writeFileSync(path.join(repo, "check.mjs"), CHECK_SOURCE);
  fs.writeFileSync(path.join(repo, "slow-command.mjs"), SLOW_COMMAND_SOURCE);
  fs.writeFileSync(path.join(repo, "README.md"), README_SOURCE);
  await git(["add", "."]);
  await git([
    "commit",
    "-m",
    "Add fixture application, check and slow command",
  ]);
  const baseCommit = await git(["rev-parse", "HEAD"]);

  const store = new Store(initialized.dbPath);
  let seeded = null,
    workspaceId;
  try {
    const ops = new Operations(store);
    workspaceId = workspaceIdentity(store);
    // The example pack is explicitly requested and installed once. It does not
    // approve its draft, configure execution, or start anything.
    if (example) seeded = await ops.execute("workspace.seed", { example });
    const project = await projectConfig({
      id: "fixture",
      root: repo,
      baseBranch: "main",
      worktreeRoot: path.join(root, "worktrees"),
      checks: [[process.execPath, "check.mjs"]],
    });
    store.put("projects", project);
  } finally {
    store.close();
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    root,
    workspace: initialized.workspace,
    workspaceId,
    dbPath: initialized.dbPath,
    repository: repo,
    baseCommit,
    worktreeRoot: path.join(root, "worktrees"),
    markers,
    projectId: "fixture",
    checks: [[process.execPath, "check.mjs"]],
    slowCommand: [process.execPath, "slow-command.mjs"],
    example: seeded ? { id: example, taskIds: seeded.taskIds } : null,
    node: process.version,
    notes: [
      "Disposable. Remove the root directory to clean up.",
      "No plan is approved, no agent is started, and no tunnel is registered.",
    ],
  };
  fs.writeFileSync(
    path.join(root, "fixture.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2),
    options = { example: "product-launch" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") options.root = argv[++i];
    else if (argv[i] === "--name") options.name = argv[++i];
    else if (argv[i] === "--port") options.port = Number(argv[++i]);
    else if (argv[i] === "--no-example") options.example = null;
    else if (argv[i] === "--json") options.json = true;
    else throw Error("Unknown option " + argv[i]);
  }
  const manifest = await createFixture(options);
  if (options.json) console.log(JSON.stringify(manifest, null, 2));
  else {
    console.log("Fixture root:        " + manifest.root);
    console.log("Workspace:           " + manifest.workspace);
    console.log("Workspace database:  " + manifest.dbPath);
    console.log("Execution repository:" + manifest.repository);
    console.log("Marker directory:    " + manifest.markers);
    console.log(
      "Serve it with:       node cli.mjs serve --workspace " +
        manifest.workspace,
    );
  }
}
