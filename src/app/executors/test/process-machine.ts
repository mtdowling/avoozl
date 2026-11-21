// @ts-nocheck: typing debt
// The machine every process-executor test runs on: a state and config folder,
// a git checkout with a linked worktree, an approved fake harness definition
// and a running supervisor.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../harness-definitions.ts";
import { sandboxKind } from "../sandbox.ts";
import { openSupervisor } from "../supervisor.ts";
import { snapshot } from "../../test/fixtures.ts";
import { Store } from "../../store/store.ts";

// A fake CLI that reads its prompt from stdin, the way Claude Code's `-p` does.
export const AGENT = `
import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
console.log("argv:", process.argv.slice(2).join(" "), "|", text);
fs.appendFileSync("seen.txt", process.argv.slice(2).join(" ") + "|" + text + "\\n");
const wait = /WAIT:(\\S+)/.exec(text);
// RESULT:<json> writes the result file; EXIT:<n> sets the exit code.
const result = /RESULT:(.+)/.exec(text);
if (result) {
  fs.mkdirSync(".avoozl", { recursive: true });
  fs.writeFileSync(".avoozl/result.json", result[1]);
}
// SERVED prints the model this run was started on as Claude Code's
// modelUsage does.
if (/SERVED/.test(text)) {
  const at = process.argv.indexOf("--model");
  console.log(JSON.stringify({ modelUsage: { [process.argv[at + 1]]: {} } }));
}
// OUTPUT:<name>=<text> writes .avoozl/output/<name>.
for (const [, name, body] of text.matchAll(/OUTPUT:([^=\\s]+)=(.*)/g)) {
  fs.mkdirSync(".avoozl/output", { recursive: true });
  fs.writeFileSync(".avoozl/output/" + name, body);
}
// ENV:<name> writes that variable and TMPDIR to env.txt.
const env = /ENV:(\\S+)/.exec(text);
if (env) fs.writeFileSync("env.txt", process.env[env[1]] + "|" + process.env.TMPDIR);
const code = Number(/EXIT:(\\d+)/.exec(text)?.[1] ?? 0);
if (wait) {
  const timer = setInterval(() => {
    if (fs.existsSync(wait[1])) { clearInterval(timer); process.exit(code); }
  }, 50);
} else process.exit(code);
`;

export const gitIn = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// The workspace store of a machine's test: its task on repository "app",
// whose record is `repository`.
export function appStore({ root, defer }, repository) {
  const store = new Store(path.join(root, "workspace.sqlite"));
  defer(() => store.close());
  const data = snapshot();
  data.tasks[0].repository = "app";
  store.initialize(data);
  store.put("repositories", { id: "app", ...repository });
  return store;
}

// A scratch folder that goes when the test ends, after each `defer`red
// cleanup, newest first: Windows cannot remove an open database or a live
// process's folder.
export function scratchRoot(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const cleanups = [];
  t.after(async () => {
    for (const fn of cleanups.reverse()) await fn();
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  });
  return { root, defer: (fn) => cleanups.push(fn) };
}

// A git checkout of one commit, whose user is Test.
export function initCheckout(checkout) {
  fs.mkdirSync(checkout);
  gitIn(checkout, "init", "-q", "-b", "main");
  gitIn(checkout, "config", "user.name", "Test");
  gitIn(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  gitIn(checkout, "add", ".");
  gitIn(checkout, "commit", "-q", "-m", "Start");
}

// Write the fake CLI's definition, approve it (or opt it out of the sandbox
// where this machine has none) and open a supervisor on it; each pass() is
// one tick's.
export function openFakeSupervisor({ stateDirectory, configDirectory, bytes }) {
  fs.writeFileSync(
    path.join(configDirectory, "harnesses", "fake-cli.json"),
    bytes,
  );
  const hash = harnessDefinitionHash(Buffer.from(bytes));
  approveHarnessDefinition({ configDirectory, name: "fake-cli", hash });
  if (!sandboxKind())
    fs.writeFileSync(
      path.join(configDirectory, "harness-unconfined.json"),
      JSON.stringify({ "fake-cli": hash }),
    );
  return openSupervisor({ stateDirectory, configDirectory });
}

export function machine(t, extra = {}, { agent = AGENT } = {}) {
  const { root, defer } = scratchRoot(t, "avoozl-process-");
  const stateDirectory = path.join(root, "state");
  const configDirectory = path.join(root, "config");
  // A write worker runs in a linked worktree of the main checkout (R88.6).
  const checkout = path.join(root, "checkout");
  const worktree = path.join(root, "worktree");
  initCheckout(checkout);
  gitIn(
    checkout,
    "worktree",
    "add",
    "-q",
    "-b",
    "avoozl/sample-task",
    worktree,
  );
  for (const where of [worktree, checkout])
    fs.writeFileSync(path.join(where, "agent.mjs"), agent);
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const bytes = JSON.stringify({
    name: "fake-cli",
    start: ["node", "{worktree}/agent.mjs", "start", "{session_uuid}"],
    resume: ["node", "{worktree}/agent.mjs", "resume", "{session_uuid}"],
    promptFrom: "stdin",
    model: ["--model", "{model}"],
    permission: { write: "workspace-write", read: "read-only" },
    writeRoots: ["{worktree}", "{tmp}"],
    ...extra,
  });
  const supervisor = openFakeSupervisor({
    stateDirectory,
    configDirectory,
    bytes,
  });
  defer(() => supervisor.close());
  return {
    root,
    stateDirectory,
    checkout,
    worktree,
    supervisor,
    defer,
  };
}

export async function until(check, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
