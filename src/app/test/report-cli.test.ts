// Task 40.2 (R88.2, R88.3): `avoozl runner report TASK done|blocked --token T`
// from the task's worktree, with no MCP sharing and no session identity.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { localSteps, worktreePath } from "../delivery/delivery.ts";
import { Operations } from "../api/operations.ts";
import { issueReportToken } from "../workers/report-match.ts";
import type { Repository } from "../git/git.ts";
import type { SessionBinding } from "../sessions/session-bindings.ts";
import { temporaryDirectory } from "./temporary.ts";
import { loopOn } from "./fixtures.ts";
import { found, type TickResult } from "./view-shapes.ts";
import { boundWorktrees } from "./delivery-fixture.ts";
import { reportWorkspace } from "./report-workspace.ts";

// The tick starts and lands work only with the server loop on.
loopOn();

const cli = fileURLToPath(new URL("../../../cli.ts", import.meta.url));
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const config = temporaryDirectory("avoozl-report-cli-config-");

function plainEnv() {
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|KIROCREW)(_|$)|^PORT$/.test(name)) delete env[name];
  return env;
}

const run = (
  root: string,
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = plainEnv(),
) =>
  spawnSync(process.execPath, [cli, ...args, "--workspace", root], {
    encoding: "utf8",
    env,
    cwd,
  });

async function setup(
  t: TestContext,
  {
    bind = true,
    delivery,
    lanes,
  }: {
    bind?: boolean;
    delivery?: Record<string, unknown>;
    lanes?: Record<string, number>;
  } = {},
) {
  const root = temporaryDirectory("avoozl-report-cli-");
  if (delivery)
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, ...(lanes ? { lanes } : {}), delivery }),
    );
  const store = reportWorkspace(t, root);
  const ops = new Operations(store, { workspaceRoot: root }),
    wt = await boundWorktrees(ops, bind ? ["a", "b"] : []);
  const repository = () => found(store.get<Repository>("repositories", "app"));
  const binding = (slot: string) =>
    store.get<SessionBinding>("session_bindings", slot);
  return { root, store, wt, repository, binding };
}

test("the brief names the worktree and the report command with the token", async (t) => {
  const setUp = await setup(t),
    { store } = setUp,
    repository = setUp.repository(),
    token = found(issueReportToken(store, { taskId: "a", attempt: 1 })),
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
    token = found(issueReportToken(store, { taskId: "a", attempt: 1 }));
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
      AVOOZL_REPORT_TOKEN:
        issueReportToken(store, { taskId: "b", attempt: 1 }) ?? undefined,
    },
  );
  assert.equal(blocked.status, 0, blocked.stderr);
});

test("a wrong token, a wrong worktree, or another task's token is refused", async (t) => {
  const { root, store, wt, binding } = await setup(t),
    token = found(issueReportToken(store, { taskId: "a", attempt: 1 })),
    tokenB = found(issueReportToken(store, { taskId: "b", attempt: 1 }));
  const cases: [string, string, string][] = [
    [wt.a, "a", "0".repeat(48)],
    [wt.a, "a", "bad"],
    [wt.b, "a", token],
    [root, "a", token],
    [wt.a, "a", tokenB],
    [wt.a, "b", token],
  ];
  for (const [cwd, id, tok] of cases) {
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
  assert.equal(binding("slot-a")?.report, undefined);
  // With no token, a tick-opened chat is refused; only a command-line claim
  // reports by its worktree alone.
  const bare = run(root, wt.a, ["runner", "report", "a", "done"]);
  assert.notEqual(bare.status, 0);
  assert.match(bare.stderr, /--token/);
  assert.equal(binding("slot-a")?.report, undefined);
});

test("the tick's dispatched brief carries the token and the worktree path", async (t) => {
  const setUp = await setup(t, {
      bind: false,
      lanes: { local: 2 },
      delivery: {},
    }),
    { root, store } = setUp,
    ops = new Operations(store, { workspaceRoot: root }),
    { dispatch } = await ops.execute<TickResult>("workspace.tick", {
      sessions: [],
    }),
    brief = String(found(dispatch.find((d) => d.task === "a")).brief),
    repository = setUp.repository(),
    token = issueReportToken(store, { taskId: "a", attempt: 1 });
  assert.ok(token, "an import made the report secret");
  assert.ok(brief.includes(`runner report a done --token ${token}`));
  assert.ok(brief.includes(worktreePath({ id: "a" }, repository)));
});

test("a review reports its verdict by command line with its own token", async (t) => {
  // Nearby inputs: the worker's token on the review, the review's token
  // without --role, and a verdict file that is not JSON.
  const { root, store, repository, binding } = await setup(t, {
      bind: false,
      lanes: { local: 1, reviewers: 1 },
      delivery: {},
    }),
    ops = new Operations(store, { workspaceRoot: root });
  await ops.execute("workspace.tick", { sessions: [] });
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "slot-a",
    role: "worker",
    attempt: 1,
    source: "tick",
    title: "avoozl:a Task a",
  });
  const wt = (
    await ops.execute<{ path: string }>("worktree.prepare", { taskId: "a" })
  ).path;
  fs.writeFileSync(path.join(wt, "a.txt"), "x\n");
  git(wt, "add", ".");
  git(wt, "-c", "user.name=T", "-c", "user.email=t@e.x", "commit", "-m", "W");
  const head = git(wt, "rev-parse", "HEAD"),
    worker = found(issueReportToken(store, { taskId: "a", attempt: 1 }));
  const done = run(root, wt, [
    "runner",
    "report",
    "a",
    "done",
    "--token",
    worker,
  ]);
  assert.equal(done.status, 0, done.stderr);
  const { dispatch } = await ops.execute<TickResult>("workspace.tick", {
      sessions: [{ target: "slot-a", status: "idle" }],
    }),
    review = dispatch.find((d) => d.role === "review:review"),
    token = found(
      issueReportToken(store, {
        taskId: "a",
        attempt: 1,
        role: "review:review",
      }),
    );
  assert.ok(review, "the review starts");
  const reviewBrief = String(review.brief);
  assert.ok(
    reviewBrief.includes(
      `runner report a done --token ${token} --role review:review`,
    ),
    reviewBrief,
  );
  assert.doesNotMatch(reviewBrief, /Call plans_report/);
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "slot-r",
    role: "review:review",
    attempt: 1,
    source: "tick",
    title: "avoozl:a review",
  });
  const detached = path.join(root, "review-wt");
  git(repository().root, "worktree", "add", "--detach", detached, head);
  const file = path.join(root, "verdict.json"),
    bad = path.join(root, "bad.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ verdict: "approved", findings: [], closures: [] }),
  );
  fs.writeFileSync(bad, "{not json");
  const report = (args: string[]) =>
    run(root, detached, ["runner", "report", "a", "done", ...args]);
  for (const args of [
    ["--token", worker, "--role", "review:review", "--review", file],
    ["--token", token, "--review", file],
    ["--token", token, "--role", "review:review", "--review", bad],
  ])
    assert.notEqual(report(args).status, 0, args.join(" "));
  assert.equal(binding("slot-r")?.report, undefined);
  const ok = report([
    "--token",
    token,
    "--role",
    "review:review",
    "--review",
    file,
  ]);
  assert.equal(ok.status, 0, ok.stderr);
  const saved = found(binding("slot-r")?.report);
  assert.deepEqual(
    [saved.kind, saved.commit, saved.review?.verdict],
    ["done", head, "approved"],
  );
});
