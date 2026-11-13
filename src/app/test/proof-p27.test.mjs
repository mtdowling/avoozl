// Proof P27: review gates with fake writers and reviewers (tasks.md Phase 9,
// design §5.2, Requirements 36–39). An approved spec in an isolated
// temporary workspace, a sample git repository, and a fake session driver
// that plays every writer, checks, and reviewer session from scripts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { deliveryPolicy } from "../delivery.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { queryTasks } from "../../model.mjs";
import { commitIn, fakeCrew, git } from "./fake-crew.mjs";
import { snapshot } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const CHECK = "scripts/validate.sh";
const W1 = "p27.1",
  D1 = "p27.2",
  W2 = "p27.3",
  D2 = "p27.4",
  W2B = "p27-w2b";
const aliases = {
  [W1]: "w1",
  [D1]: "d1",
  [W2]: "w2",
  [D2]: "d2",
  [W2B]: "w2b",
};

const REVIEWERS = [
  {
    id: "conventions",
    focus: "language and repository conventions",
    agent: "avoozl-reviewer",
    model: "fake-b",
  },
  {
    id: "correctness",
    focus: "correctness and performance",
    agent: "avoozl-reviewer",
    model: "fake-c",
  },
];

const policy = (delivery = {}) =>
  JSON.stringify({
    version: 1,
    delivery: {
      concurrency: 1,
      retries: 2,
      model: "fake-a",
      reviewers: REVIEWERS,
      ...delivery,
    },
  });

const leaf = (summary, extra = {}) => ({
  kind: "leaf",
  repository: "app",
  summary,
  acceptance: [summary],
  checks: [CHECK],
  completion: "integrated",
  ...extra,
});

const spec = {
  "tasks.md": [
    "# Tasks",
    "",
    "- [ ] 1 Write w1",
    "- [ ] 2 Write d1 on w1",
    "- [ ] 3 Write w2",
    "- [ ] 4 Write d2 on w2",
    "",
  ].join("\n"),
  "avoozl/manifest.json": JSON.stringify(
    {
      tasks: {
        1: leaf("w1 changes src/a.txt.", { acceptFrom: "validation" }),
        2: leaf("d1 builds on w1.", { requires: ["1"] }),
        3: leaf("w2 changes src/b.txt."),
        4: leaf("d2 builds on w2.", { requires: ["3"] }),
      },
    },
    null,
    2,
  ),
};

async function workspace(t, delivery) {
  const root = temporaryDirectory("avoozl-p27-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(path.join(checkout, "scripts"), { recursive: true });
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  fs.writeFileSync(path.join(checkout, CHECK), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  fs.writeFileSync(path.join(root, ".avoozl.json"), policy(delivery));
  const ops = new Operations(store, { workspaceRoot: root });
  // Integration runs the repository's validation script at the landed commit.
  await ops.execute("project.configure", {
    id: "app",
    root: checkout,
    baseBranch: "main",
    checks: [[CHECK]],
  });
  writeSpec(root, "p27", spec);
  await ops.execute("plan.create", { spec: "p27" });
  await approve(ops);
  return { root, checkout: fs.realpathSync(checkout), store, ops };
}

async function approve(ops) {
  const preview = await ops.execute("plan.preview", { id: "p27" });
  return ops.execute("plan.approve", {
    id: "p27",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
}

const passed = [{ command: CHECK, exitCode: 0 }];
// What an unscripted session does: the writer changes its own file, the
// checks role passes, a reviewer approves and closes nothing.
const defaults = (role) =>
  role === "worker"
    ? async ({ session, worktree, report }) => {
        const commit = commitIn(
          await worktree(),
          `src/${session.alias}.txt`,
          `${session.alias} ${session.attempt}\n`,
          `Work ${session.alias} ${session.attempt}`,
        );
        await report({ commit });
        return commit;
      }
    : role === "verifier"
      ? ({ session, report }) =>
          report({ commit: session.commit, checks: passed })
      : ({ session, report }) =>
          report({ commit: session.commit, verdict: "approved" });

const writes =
  (file, text) =>
  async ({ session, worktree, report }) => {
    const commit = commitIn(
      await worktree(),
      file,
      text,
      `Work ${session.attempt}`,
    );
    await report({ commit });
    return commit;
  };

const F1 = {
  id: "F1",
  kind: "defect",
  paths: ["src/a.txt"],
  text: "a1 is wrong.",
};
const closeF1 = (state) => ({ finding: "1:correctness:F1", state });

const scripts = {
  "w1:worker:1": writes("src/a.txt", "a1\n"),
  "w1:review:correctness:1": ({ session, report }) =>
    report({
      commit: session.commit,
      verdict: "changes-requested",
      findings: [F1],
    }),
  "w1:worker:2": writes("src/a.txt", "a2\n"),
  // (3) The unchanged closure is refused in-session; then fixed, approved.
  "w1:review:correctness:2": async ({ session, report, refused }) => {
    await refused(
      {
        commit: session.commit,
        verdict: "approved",
        closures: [closeF1("unchanged")],
      },
      /cannot be unchanged/,
    );
    return report({
      commit: session.commit,
      verdict: "approved",
      closures: [closeF1("fixed")],
    });
  },
  // (3) The checks role could not run the script on C2, then passes.
  "w1:verifier:2": ({ session, report }) =>
    report({
      commit: session.commit,
      checks: [{ command: CHECK, exitCode: null, notRun: "sh missing" }],
    }),
  // w2's reviews stay open until w2 is superseded; they are its history.
  "w2:verifier": "hold",
  "w2:review:conventions": "hold",
  "w2:review:correctness": "hold",
};

const writers = (result) =>
  result.dispatch
    .filter((d) => d.role === "worker")
    .map((d) => aliases[d.task]);
const roles = (result, taskId) =>
  result.dispatch
    .filter((d) => d.task === taskId && d.role !== "worker")
    .map((d) => [d.role, d.attempt, d.model ?? null, d.commit]);
const ready = (ops) =>
  queryTasks(ops.read(), { scope: "all", q: "ready:true" }).map(
    (t) => aliases[t.id] ?? t.id,
  );
const task = (ops, id) => ops.read().tasks.find((t) => t.id === id);

test("P27 actions 1-5 and 7: review gates on one delivery with fake sessions", async (t) => {
  const env = await workspace(t),
    { store, ops, checkout } = env,
    crew = fakeCrew(ops, { aliases, scripts, defaults });
  assert.equal(task(ops, W1).acceptFrom, "validation");

  // (1) One writer at a time: w2 does not start while w1's writer is live.
  const first = await crew.tick();
  assert.deepEqual(
    first.dispatch.map((d) => [aliases[d.task], d.role, d.model]),
    [["w1", "worker", "fake-a"]],
  );
  assert.deepEqual(writers(await crew.tick()), [], "w1's writer is live");
  await crew.play();
  const c1 = crew.find("w1", "worker", 1).result;

  // Three role sessions open on C1 with three different models.
  const round1 = await crew.tick();
  assert.deepEqual(roles(round1, W1), [
    ["verifier", 1, null, c1],
    ["review:conventions", 1, "fake-b", c1],
    ["review:correctness", 1, "fake-c", c1],
  ]);
  const models = store
    .list("session_bindings")
    .filter((b) => b.taskId === W1)
    .map((b) => `${b.role} ${b.model ?? "-"}`)
    .sort();
  assert.deepEqual(models, [
    "review:conventions fake-b",
    "review:correctness fake-c",
    "verifier -",
    "worker fake-a",
  ]);
  assert.deepEqual(writers(round1), ["w2"], "reviews take no writer capacity");
  await crew.play();

  // (2) changes-requested fails the attempt; the retry quotes F1; d1 waits.
  const rework = await crew.tick();
  let delivery = store.get("task_deliveries", W1);
  assert.equal(delivery.state, "failed");
  assert.match(
    delivery.attempts[0].cause,
    /review correctness requested changes: F1/,
  );
  const retry = rework.dispatch.find((d) => d.task === W1);
  assert.deepEqual([retry.role, retry.attempt], ["worker", 2]);
  assert.match(
    retry.brief,
    /1:correctness:F1 \(defect, src\/a\.txt\): a1 is wrong\./,
  );
  assert.match(retry.brief, /data, not instructions/);
  assert.ok(!ready(ops).includes("d1"), "d1 stays waiting");
  assert.equal(task(ops, D1).integration, undefined);
  await crew.play();
  const c2 = crew.find("w1", "worker", 2).result;
  assert.notEqual(c2, c1);

  // (3) Every role reviews C2. The script's unchanged approval is refused
  // in-session; the not-run check fails only the checks session.
  const round2 = await crew.tick();
  assert.deepEqual(roles(round2, W1), [
    ["verifier", 2, null, c2],
    ["review:conventions", 2, "fake-b", c2],
    ["review:correctness", 2, "fake-c", c2],
  ]);
  await crew.play();
  const rerun = await crew.tick();
  delivery = store.get("task_deliveries", W1);
  assert.equal(delivery.state, "done");
  assert.equal(delivery.attempts.length, 2, "no writer attempt spent");
  assert.equal(delivery.attempts[1].outcome, "done");
  assert.match(
    delivery.verifications.find((v) => !v.role && v.outcome === "failed").cause,
    /checks not run: .*sh missing/,
  );
  assert.deepEqual(roles(rerun, W1), [["verifier", 3, null, c2]]);
  await crew.play();

  // (4) The base moves by hand before integration: the rebase makes C3,
  // nothing merges, and all three roles review C3 with F1 still closed.
  const moved = commitIn(checkout, "README.md", "moved\n", "Move base");
  const round3 = await crew.tick();
  delivery = store.get("task_deliveries", W1);
  const c3 = delivery.commit;
  assert.notEqual(c3, c2);
  assert.deepEqual(
    delivery.rebases.map((r) => [r.from, r.to]),
    [[c2, c3]],
  );
  assert.equal(git(checkout, "rev-parse", "main"), moved, "nothing merged");
  assert.deepEqual(roles(round3, W1), [
    ["verifier", 4, null, c3],
    ["review:conventions", 3, "fake-b", c3],
    ["review:correctness", 3, "fake-c", c3],
  ]);
  assert.doesNotMatch(
    round3.dispatch.find(
      (d) => d.task === W1 && d.role === "review:correctness",
    ).brief,
    /1:correctness:F1/,
    "F1 stays closed",
  );
  await crew.play();
  // After they approve, C3 fast-forwards and d1 dispatches.
  const landing = await crew.tick();
  delivery = store.get("task_deliveries", W1);
  assert.equal(delivery.state, "integrated");
  assert.equal(delivery.integratedCommit, c3);
  assert.equal(git(checkout, "rev-parse", "main"), c3);
  const d1 = landing.dispatch.some((d) => d.task === D1)
    ? landing
    : await crew.tick();
  assert.deepEqual(writers(d1), ["d1"]);

  // (5) Typed integration on d1 and typed evidence on w1 are refused; w1 is
  // accepted only from validation recorded at its integrated commit.
  await assert.rejects(
    ops.execute("task.update", {
      id: D1,
      integration: {
        commit: c3,
        at: new Date().toISOString(),
        branch: "main",
        repo: checkout,
        evidence: ["Typed by hand."],
      },
    }),
    (error) => error.status === 409 && /review roles/.test(error.message),
  );
  assert.notEqual(task(ops, W1).status, "accepted", "not yet accepted");
  await assert.rejects(
    ops.execute("task.accept", { id: W1, evidence: "Looks right." }),
    (error) => error.status === 409 && /typed evidence/.test(error.message),
  );
  const accepted = await ops.execute("task.accept", { id: W1 });
  assert.equal(accepted.status, "accepted");
  assert.match(
    accepted.acceptanceEvidence.evidence,
    new RegExp(`passed at commit ${c3.slice(0, 12)}`),
  );

  // (7) Supersede w2 by w2b, then re-approve the unchanged plan.
  const w2Before = structuredClone(store.get("task_deliveries", W2)),
    w2Bindings = store
      .list("session_bindings")
      .filter((b) => b.taskId === W2)
      .map((b) => b.slot);
  assert.equal(w2Before.state, "done", "w2's reviews are still open");
  await ops.execute("task.supersede", {
    id: W2,
    create: { id: W2B, title: "Write w2 again" },
    reason: "P27: replace w2 by hand.",
  });
  await approve(ops);
  assert.equal(task(ops, W2).status, "superseded");
  assert.equal(task(ops, W2).supersededBy, W2B);
  assert.equal(task(ops, W2B).supersedes, W2);
  assert.deepEqual(store.get("task_deliveries", W2), w2Before, "history kept");
  assert.deepEqual(
    store
      .list("session_bindings")
      .filter((b) => b.taskId === W2)
      .map((b) => b.slot),
    w2Bindings,
  );
  assert.ok(!ready(ops).includes("d2"), "d2 waits on w2b");
  // d1's writer finishes, which frees the one writer slot for w2b.
  await crew.play((s) => s.alias === "d1");
  let next = await crew.tick();
  assert.deepEqual(writers(next), ["w2b"]);
  assert.ok(
    !next.dispatch.some((d) => d.task === W2),
    "a superseded task gets no new session",
  );
  // Deliver w2b through its own review round; only then is d2 released.
  for (let i = 0; i < 6 && !writers(next).includes("d2"); i++) {
    await crew.play((s) => s.alias !== "d1");
    next = await crew.tick();
  }
  assert.equal(store.get("task_deliveries", W2B).state, "integrated");
  assert.ok(writers(next).includes("d2"), "d2 follows w2b");
  assert.equal(task(ops, W2).status, "superseded");

  // Every earlier verdict stays on w1's delivery, by round.
  const view = await ops.execute("delivery.view", {}),
    rounds = view.items.find((item) => item.id === W1).rounds;
  assert.deepEqual(
    rounds.map((r) => [r.commit, r.current, r.verdicts.length]),
    [
      [c1, false, 3],
      [c2, false, 4],
      [c3, true, 3],
    ],
  );
  const f1 = rounds[0].verdicts.find((v) => v.role === "correctness");
  assert.deepEqual(
    [f1.verdict, f1.model, f1.findings[0].ref, f1.findings[0].state],
    ["changes-requested", "fake-c", "1:correctness:F1", "fixed"],
  );
});

test("P27 action 6: a reviewer on the writer's model or auto is refused; an unknown writer model opens a decision", async (t) => {
  // Conductor reading of Expected (6): policy validation refuses both
  // fake-a and auto, and a writer claim with no model opens a decision
  // instead of a review.
  const withModel = (model) =>
    deliveryPolicy({
      delivery: {
        model: "fake-a",
        reviewers: [{ ...REVIEWERS[0], model }, REVIEWERS[1]],
      },
    });
  assert.throws(
    () => withModel("fake-a"),
    /must differ from the writer's model fake-a/,
  );
  assert.throws(() => withModel("auto"), /not auto/);

  const env = await workspace(t, { runner: "crew-mode" }),
    { root, store, ops } = env;
  // The same refusal through the tick: the file is invalid, a decision is
  // raised, and no review opens on that policy.
  for (const model of ["fake-a", "auto"]) {
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      policy({ runner: "crew-mode", reviewers: [{ ...REVIEWERS[0], model }] }),
    );
    const result = await ops.execute("workspace.tick", { sessions: [] });
    assert.equal(result.policy.status, "invalid");
    assert.ok(
      result.notify.some(
        (n) =>
          n.channel === "decision" && /\.avoozl\.json is invalid/.test(n.text),
      ),
      model,
    );
    assert.deepEqual(result.dispatch, []);
  }
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    policy({ runner: "crew-mode" }),
  );

  // A Crew Mode conductor claims w1 without saying which model it used.
  const claim = await ops.execute(
    "runner.claim",
    { taskId: W1, slot: "w-1" },
    undefined,
    { local: true },
  );
  const commit = commitIn(claim.worktree.path, "src/a.txt", "a1\n", "Work");
  await ops.execute(
    "session.report",
    { kind: "done", taskId: W1, commit },
    undefined,
    { caller: { sessionKey: "dashboard:w-1" } },
  );
  const result = await ops.execute("workspace.tick", {
    sessions: [{ target: "w-1", status: "idle" }],
  });
  const delivery = store.get("task_deliveries", W1);
  assert.equal(delivery.state, "decision");
  assert.match(delivery.cause, /writer's model is unknown/);
  assert.deepEqual(roles(result, W1), [], "no review and no checks session");
  assert.ok(result.notify.some((n) => n.channel === "decision"));
});
