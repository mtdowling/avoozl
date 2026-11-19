// Task 40.2 (R88.2, R88.3): `avoozl runner report TASK done|blocked --token T`
// from the task's worktree, with no MCP sharing and no session identity.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../settings/config.mjs";
import { localSteps, worktreePath } from "../delivery/delivery.mjs";
import { Operations } from "../api/operations.mjs";
import { issueReportToken } from "../workers/report-match.mjs";
import { Store } from "../store/store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const config = temporaryDirectory("avoozl-report-cli-config-");

function plainEnv() {
  const env = { ...process.env, XDG_CONFIG_HOME: config };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|KIROCREW)(_|$)|^PORT$/.test(name)) delete env[name];
  return env;
}

const run = (root, cwd, args, env = plainEnv()) =>
  spawnSync(process.execPath, [cli, ...args, "--workspace", root], {
    encoding: "utf8",
    env,
    cwd,
  });

async function setup(t, { bind = true, delivery, lanes } = {}) {
  const root = temporaryDirectory("avoozl-report-cli-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  if (delivery)
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, ...(lanes ? { lanes } : {}), delivery }),
    );
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "T");
  git(checkout, "config", "user.email", "t@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  const task = (id) => ({
    id,
    title: "Task " + id,
    kind: "leaf",
    scope: "catalog",
    status: "planned",
    epic: "sample",
    track: "catalog",
    tags: [],
    acceptance: ["Works."],
    checks: [],
    repository: "app",
  });
  store.initialize({
    ...snapshot(),
    tasks: [task("a"), task("b")],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  const ops = new Operations(store, { workspaceRoot: root }),
    wt = {};
  for (const id of bind ? ["a", "b"] : []) {
    wt[id] = (await ops.execute("worktree.prepare", { taskId: id })).path;
    await ops.execute("session.bind", {
      taskId: id,
      slot: `slot-${id}`,
      attempt: 1,
      source: "tick",
      title: `avoozl:${id} Task ${id}`,
    });
  }
  return { root, store, wt };
}

test("the brief names the worktree and the report command with the token", async (t) => {
  const { store } = await setup(t),
    repository = store.get("repositories", "app"),
    token = issueReportToken(store, { taskId: "a", attempt: 1 }),
    steps = localSteps({ id: "a" }, repository, {
      cliReport: { worktree: worktreePath({ id: "a" }, repository), token },
    }).join("\n");
  assert.match(steps, new RegExp(`runner report a done --token ${token}`));
  assert.match(steps, new RegExp(`runner report a blocked --token ${token}`));
  assert.ok(steps.includes(worktreePath({ id: "a" }, repository)));
  assert.doesNotMatch(
    localSteps({ id: "a" }, repository).join("\n"),
    /--token/,
    "without a report token the brief is unchanged",
  );
});

test("a worker reports done from its worktree without any session identity", async (t) => {
  const { root, store, wt } = await setup(t),
    token = issueReportToken(store, { taskId: "a", attempt: 1 });
  fs.writeFileSync(path.join(wt.a, "a.txt"), "x\n");
  git(wt.a, "add", ".");
  git(
    wt.a,
    "-c",
    "user.name=T",
    "-c",
    "user.email=t@e.x",
    "commit",
    "-m",
    "Work",
  );
  const head = git(wt.a, "rev-parse", "HEAD"),
    out = run(root, wt.a, ["runner", "report", "a", "done", "--token", token]);
  assert.equal(out.status, 0, out.stderr);
  // As the brief says it: from the worktree, naming the workspace, with no
  // workspace in the environment (P50).
  const steps = localSteps(
      { id: "a" },
      { id: "app" },
      {
        cliReport: { worktree: wt.a, token, workspace: root },
      },
    ).join("\n"),
    named = steps.match(/--workspace ("[^"]+")/);
  assert.ok(named, steps);
  assert.equal(JSON.parse(named[1]), root);
  assert.equal(JSON.parse(out.stdout).report.commit, head);
  // The token may come from the environment instead.
  const blocked = run(
    root,
    wt.b,
    ["runner", "report", "b", "blocked", "--text", "stuck"],
    {
      ...plainEnv(),
      AVOOZL_REPORT_TOKEN: issueReportToken(store, { taskId: "b", attempt: 1 }),
    },
  );
  assert.equal(blocked.status, 0, blocked.stderr);
});

test("a wrong token, a wrong worktree, or another task's token is refused", async (t) => {
  const { root, store, wt } = await setup(t),
    token = issueReportToken(store, { taskId: "a", attempt: 1 }),
    tokenB = issueReportToken(store, { taskId: "b", attempt: 1 });
  for (const [cwd, id, tok] of [
    [wt.a, "a", "0".repeat(48)],
    [wt.a, "a", "bad"],
    [wt.b, "a", token],
    [root, "a", token],
    [wt.a, "a", tokenB],
    [wt.a, "b", token],
  ]) {
    const out = run(root, cwd, [
      "runner",
      "report",
      id,
      "blocked",
      "--text",
      "x",
      "--token",
      tok,
    ]);
    assert.notEqual(out.status, 0, `${cwd} ${id} ${tok}`);
    assert.ok(!out.stderr.includes(token));
  }
  assert.equal(store.get("session_bindings", "slot-a").report, undefined);
  // With no token, a tick-opened chat is refused; only a command-line claim
  // reports by its worktree alone.
  const bare = run(root, wt.a, ["runner", "report", "a", "done"]);
  assert.notEqual(bare.status, 0);
  assert.match(bare.stderr, /--token/);
  assert.equal(store.get("session_bindings", "slot-a").report, undefined);
});

test("the tick's dispatched brief carries the token and the worktree path", async (t) => {
  const { root, store } = await setup(t, {
      bind: false,
      lanes: { local: 2 },
      delivery: {},
    }),
    ops = new Operations(store, { workspaceRoot: root }),
    { dispatch } = await ops.execute("workspace.tick", { sessions: [] }),
    brief = dispatch.find((d) => d.task === "a").brief,
    repository = store.get("repositories", "app"),
    token = issueReportToken(store, { taskId: "a", attempt: 1 });
  assert.ok(token, "an import made the report secret");
  assert.ok(brief.includes(`runner report a done --token ${token}`));
  assert.ok(brief.includes(worktreePath({ id: "a" }, repository)));
});
