// The world epic-context's process tests and its proof run in: a process
// machine with a fake harness CLI, an approved spec, the example plugin with
// a fake MCP server, and the stores the gate reads.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { drainProcessRequests } from "../process.mjs";
import { childRecord, openSupervisorDatabase } from "../supervisor.mjs";
import { approverCheck } from "../../git/git-approvals.mjs";
import { bindContentRules } from "../../content/content-rules.mjs";
import { enqueueSessionRequests } from "../../sessions/session-requests.mjs";
import { contextMachine } from "../../context/test/context-fixture.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";
import { seedApproval } from "../../test/epic-context-seed.mjs";
import { appStore, gitIn, machine, until } from "./process-machine.mjs";

export const APPROVER = "test@example.com";

// The fake MCP server the plugin ships: one tool, `ask`, that echoes a
// marker, and a file of the environment names it ran with.
export const server = (record, { listen = false } = {}) => `
import fs from "node:fs";
import net from "node:net";
import readline from "node:readline";
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify(Object.keys(process.env)));
${listen ? 'net.createServer().listen(0, "127.0.0.1");' : ""}
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\\n");
for await (const line of readline.createInterface({ input: process.stdin })) {
  const m = JSON.parse(line);
  if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "research", version: "1" } } });
  else if (m.method === "tools/list") send({ id: m.id, result: { tools: [{ name: "ask", inputSchema: { type: "object" } }] } });
  else if (m.method === "tools/call") send({ id: m.id, result: { content: [{ type: "text", text: "marker:" + process.env.RESEARCH_TOKEN }] } });
}
`;

// A fake harness CLI: it logs its argv and environment names, copies the
// folder and skill a brief names, and acts as an MCP client for each server
// of the config file it is given.
export const AGENT = `
import fs from "node:fs";
import { spawn } from "node:child_process";
import readline from "node:readline";
const text = fs.readFileSync(0, "utf8");
const argv = process.argv.slice(2);
const runs = fs.existsSync("runs.json") ? JSON.parse(fs.readFileSync("runs.json", "utf8")) : [];
runs.push({ argv, prompt: text, env: Object.keys(process.env).sort() });
fs.writeFileSync("runs.json", JSON.stringify(runs));
const skill = /\\((\\/[^)\\n]*module-layout\\/SKILL\\.md)\\)/.exec(text);
if (skill) fs.writeFileSync("skill.txt", fs.readFileSync(skill[1], "utf8"));
const note = /READ:(\\S+)/.exec(text);
if (note) fs.writeFileSync("note.txt", fs.readFileSync(note[1], "utf8"));
const at = argv.indexOf("--mcp-config");
if (at >= 0) {
  const config = JSON.parse(fs.readFileSync(argv[at + 1], "utf8"));
  for (const [alias, def] of Object.entries(config.mcpServers)) {
    const relay = spawn(def.command, def.args, { stdio: ["pipe", "pipe", "inherit"] });
    const lines = readline.createInterface({ input: relay.stdout })[Symbol.asyncIterator]();
    const send = (m) => relay.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\\n");
    const reply = async () => JSON.parse((await lines.next()).value);
    send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    await reply();
    send({ id: 2, method: "tools/call", params: { name: "ask", arguments: { question: "SECRET-ARGUMENT" } } });
    fs.writeFileSync("mcp-" + alias + ".json", JSON.stringify(await reply()));
    const hold = /HOLD:(\\d+)/.exec(text);
    if (hold) await new Promise((resolve) => setTimeout(resolve, +hold[1]));
    relay.stdin.end();
  }
}
fs.mkdirSync(".avoozl", { recursive: true });
fs.writeFileSync(".avoozl/result.json", JSON.stringify({ state: "done", text: "ok" }));
`;

export function world(t, { mcp = true } = {}) {
  const m = machine(
    t,
    mcp ? { context: { mcp: ["--mcp-config", "{context_mcp}"] } } : {},
    { agent: AGENT },
  );
  const configDirectory = path.join(m.root, "config");
  keepKiroCrewHome(t, m.root);
  const store = appStore(
    { root: m.root, defer: m.defer },
    {
      root: m.checkout,
      baseBranch: "main",
      github: "acme/widgets",
      executor: "process",
      harness: "fake-cli",
    },
  );
  // An approved spec whose one task is `sample-task`, committed by the
  // checkout's own git user, who is the approver.
  const files = {
    "requirements.md": "# Config\n\nRead config.json.\n",
    "design.md": "# Design\n\nA loader.\n",
    "tasks.md": "- [ ] `sample-task` Read the file\n  - It reads\n",
  };
  writeSpec(m.checkout, "config", files);
  gitIn(m.checkout, "add", "-A");
  gitIn(m.checkout, "commit", "-q", "-m", "Spec config");
  const revision = gitIn(m.checkout, "rev-parse", "HEAD");
  return { m, store, configDirectory, files, revision };
}

export async function finish(w, ctx) {
  await seedApproval(w.store, { root: w.m.checkout, tasks: ["sample-task"] });
  bindContentRules(w.store, {
    workspaceRoot: ctx.workspaceRoot,
    pluginSettingsFile: ctx.settingsFile,
    configFile: path.join(w.m.root, "config.json"),
  });
  w.ops = {
    configDirectory: w.configDirectory,
    workspaceRoot: w.m.checkout,
    pluginOptions: ctx.options,
    approvalCheckout: async () => w.m.checkout,
    approverOf: async () =>
      approverCheck({
        repository: { allowedActors: [APPROVER] },
        trust: "branch-protection",
      }),
    execute: async () => ({}),
  };
}

// Plugin side: the example plugin, its server replaced by the fake, the
// answers and the mapping this machine holds.
export function plugin(
  w,
  { approve = true, sets = false, listen = false } = {},
) {
  const ctx = contextMachine({
    approve: false,
    settingsFolder: w.configDirectory,
    edit: (manifest) => {
      if (!sets) delete manifest.context.contentSets;
      return manifest;
    },
  });
  const record = path.join(w.m.root, "server-env.json");
  fs.writeFileSync(
    path.join(ctx.folder, "mcp", "research.mjs"),
    server(record, { listen }),
  );
  if (approve) ctx.approve();
  return { ctx, record };
}

export const start = (w, extra = {}) =>
  enqueueSessionRequests(w.store, {
    starts: [
      {
        executor: "process",
        role: "worker",
        task: "sample-task",
        brief: `Do the work. READ:${w.note}`,
        worktree: w.m.worktree,
        permissionClass: "write",
        ...extra,
      },
    ],
  });

export async function run(w, extra = {}) {
  start(w, extra);
  const { errors } = await drainProcessRequests(w.store, {
    stateDirectory: w.m.stateDirectory,
    prepareWorktree: async () => ({ path: w.m.worktree }),
    ops: w.ops,
  });
  assert.deepEqual(errors, []);
  const binding = w.store
    .list("session_bindings")
    .find((b) => (b.attempt ?? 1) === (extra.attempt ?? 1));
  await settle(w, binding.slot);
  return binding.slot;
}

export async function settle(w, slot) {
  await until(() => {
    w.m.supervisor.pass();
    const db = openSupervisorDatabase(w.m.stateDirectory);
    try {
      return childRecord(db, slot).state === "exited";
    } finally {
      db.close();
    }
  });
}

export const settings = (w, slot) => {
  const db = openSupervisorDatabase(w.m.stateDirectory);
  try {
    return JSON.parse(childRecord(db, slot).settings);
  } finally {
    db.close();
  }
};
export const runs = (w) =>
  JSON.parse(fs.readFileSync(path.join(w.m.worktree, "runs.json"), "utf8"));

// Drain until the session of `attempt` has started, then wait for it to end.
export async function followUp(w, attempt) {
  await until(async () => {
    w.m.supervisor.pass();
    await drainProcessRequests(w.store, {
      stateDirectory: w.m.stateDirectory,
      prepareWorktree: async () => ({ path: w.m.worktree }),
      ops: w.ops,
    });
    return w.store.list("session_bindings").some((b) => b.attempt === attempt);
  });
  const binding = w.store
    .list("session_bindings")
    .find((b) => b.attempt === attempt);
  await settle(w, binding.slot);
  return binding;
}

// A scratch folder can sit under the real Kiro Crew home, a path the sandbox
// denies; name another home for the test, so only the folders it makes are
// judged.
export function keepKiroCrewHome(t, root) {
  const was = process.env.KIROCREW_HOME;
  process.env.KIROCREW_HOME = path.join(root, "kirocrew-home");
  t.after(() => {
    if (was === undefined) delete process.env.KIROCREW_HOME;
    else process.env.KIROCREW_HOME = was;
  });
}
