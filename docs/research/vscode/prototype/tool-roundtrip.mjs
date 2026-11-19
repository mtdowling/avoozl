// Research prototype only. See ../README.md for known gaps and limits.
// Actual provider permissions and cancellation; isolated DB/repository only.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fork } from "node:child_process";
import { once } from "node:events";
import { importApp, appRoot } from "./app-source.mjs";
if (process.env.RUN_REAL_PROVIDER_PROBE !== "1")
  throw Error(
    "Opt in explicitly with RUN_REAL_PROVIDER_PROBE=1; this starts real provider sessions",
  );
const { Store } = await importApp("store.mjs");
const { snapshot } = await importApp("test/fixtures.mjs");
const { git, projectConfig } = await importApp("git.mjs");
const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aicommander-vscode-probe-"),
  ),
  repo = path.join(root, "repo");
fs.mkdirSync(repo);
fs.mkdirSync(path.join(root, "markers"));
await git(repo, ["init", "-b", "main"]);
await git(repo, ["config", "user.name", "Investigation"]);
await git(repo, ["config", "user.email", "probe@example.invalid"]);
fs.writeFileSync(
  path.join(repo, "README.md"),
  "Disposable approval and cancellation test. No production files.\n",
);
fs.writeFileSync(
  path.join(repo, "slow-tool.mjs"),
  `import fs from 'node:fs';\nconst target=process.argv[2];\nfs.writeFileSync(target+'.started',JSON.stringify({pid:process.pid,at:new Date().toISOString()}));\nconsole.log('ACTUAL_TOOL_STARTED '+process.pid);\nfor(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{fs.writeFileSync(target+'.interrupted',signal);process.exit(0);});\nsetTimeout(()=>{fs.writeFileSync(target+'.completed','normal completion');console.log('ACTUAL_TOOL_COMPLETED');},180000);\n`,
);
await git(repo, ["add", "."]);
await git(repo, ["commit", "-m", "Add approval and cancellation fixture"]);
const store = new Store(path.join(root, "workspace.sqlite"));
const data = snapshot();
data.tasks = ["claude", "codex"].map((p) => ({
  ...data.tasks[0],
  id: "tool-" + p,
  title: p + " actual tool cancellation",
}));
store.importSnapshot(data);
store.put(
  "projects",
  await projectConfig({ id: "probe", root: repo, checks: [] }),
);
const host = fork(new URL("./managed-host.mjs", import.meta.url), [root], {
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
for (const stream of [host.stdout, host.stderr])
  stream.on("data", (b) => fs.appendFileSync(path.join(root, "host.log"), b));
await new Promise((resolve, reject) => {
  host.once("exit", (c) => reject(Error("Host exit " + c)));
  host.on("message", (m) => {
    if (m.ready) resolve();
  });
});
const manifest = JSON.parse(fs.readFileSync(path.join(root, "host.json")));
async function rpc(operation, input) {
  const r = await fetch(manifest.url + "/rpc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + manifest.secret,
    },
    body: JSON.stringify({ operation, input }),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b.result;
}
const report = {
  at: new Date().toISOString(),
  root,
  appRoot,
  sourceCommit: await git(appRoot, ["rev-parse", "HEAD"]),
  hostPid: host.pid,
  runs: {},
};
for (const provider of ["claude", "codex"]) {
  const id = "run-tool-" + provider,
    command = "node slow-tool.mjs " + path.join(root, "markers", provider);
  const prompt =
    "Tiny controlled permission/cancellation test. You are authorized only to run this disposable fixture command, then wait for its result. Do not inspect files, call MCP, edit code, create plans or commit. Run exactly: " +
    command +
    ". " +
    (provider === "codex"
      ? "Use exec_command with sandbox_permissions=require_escalated, asking permission for this harmless probe command, and yield_time_ms=1000."
      : "Use Bash, requesting permission normally. Set timeout=240000 and do not use run_in_background.") +
    " Do not retry if cancelled or denied. If the command ends naturally, reply TOOL_FINISHED.";
  const run = await rpc("run.start", {
    id,
    taskId: "tool-" + provider,
    projectId: "probe",
    provider,
    model:
      provider === "claude"
        ? process.env.CLAUDE_MODEL || "haiku"
        : process.env.CODEX_MODEL,
    mode: "implement",
    approvalMode: "manual",
    title: provider + " — approve, execute, cancel",
    prompt,
  });
  report.runs[provider] = { id, command, worktree: run.worktree };
}

fs.writeFileSync(
  path.join(root, "tool-roundtrip-setup.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ root, hostPid: host.pid, runs: report.runs }));
process.on("SIGTERM", async () => {
  host.kill("SIGTERM");
  await once(host, "exit");
  store.close();
  process.exit(0);
});
await new Promise(() => {});
