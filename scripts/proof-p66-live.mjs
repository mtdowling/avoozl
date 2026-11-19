#!/usr/bin/env node
// Proof P66 (R102, design §4.32): journal, working-head recovery and
// takeover, live. It drives Avoozl's own journal, working-head, scheduler,
// landing and rebuild modules against two private scratch repositories with
// the owner's `gh` login, and a real agent CLI (Claude Code, edit tools
// only) does each task's work in its own worktree. Nothing here touches a
// real workspace: the root must be under the temporary folder, and every
// request goes through a guard that allows only the two named repositories.
//
//   node scripts/proof-p66-live.mjs --root <temp dir> \
//     --code o/scratch-code --plans o/scratch-plans [--out report.json]
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { git } from "../src/app/git.mjs";
import { GitHubClient } from "../src/app/github.mjs";
import { Store } from "../src/app/store.mjs";
import { emptySnapshot } from "../src/app/workspace.mjs";
import { queryTasks } from "../src/model.mjs";
import { specHash } from "../src/app/spec-plans.mjs";
import {
  taskDefinition,
  taskOutcome,
  releases,
} from "../src/app/task-outcomes.mjs";
import {
  appendRecord,
  githubJournal,
  journalOutcomes,
  replayJournal,
} from "../src/app/spec-journal.mjs";
import {
  checkpointBranch,
  checkpointTask,
  ensureWorkingBranch,
  integrateVerified,
  pushHead,
  retainVerified,
  sourceRegistry,
  workingBranch,
} from "../src/app/working-heads.mjs";
import {
  driverState,
  effectiveOwner,
  guardedFastForward,
  landIntent,
  outstandingIntents,
  reconcileIntents,
  revalidate,
  takeOver,
  trailerOutcome,
} from "../src/app/driver-generations.mjs";
import {
  rememberDriver,
  revalidateSpecs,
  scheduleHolds,
} from "../src/app/spec-scheduler.mjs";
import { specBase } from "../src/app/spec-base.mjs";
import { runCheckAt } from "../src/app/flow-line.mjs";
import {
  stackMembers,
  directSteps,
  queuePortion,
} from "../src/app/merge-batch.mjs";
import { landNext } from "../src/app/landing-queue.mjs";
import { rebuildSpec, resumeRebuild } from "../src/app/spec-rebuild.mjs";
import { refreshSpec } from "../src/app/spec-refresh.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    code: { type: "string" },
    plans: { type: "string" },
    out: { type: "string" },
    only: { type: "string" },
  },
});
if (!values.root || !values.code || !values.plans) {
  console.error(
    "Name a scratch --root, the --code and the --plans repository.",
  );
  process.exit(2);
}
const root = path.resolve(values.root);
const temp = [os.tmpdir(), "/tmp"].flatMap((dir) => [
  path.resolve(dir) + path.sep,
  fs.realpathSync(dir) + path.sep,
]);
if (!temp.some((dir) => (root + path.sep).startsWith(dir))) {
  console.error("The scratch root must be in the temporary folder.");
  process.exit(2);
}
if (
  !/\/avoozl-scratch-/.test("/" + values.code) ||
  !/\/avoozl-scratch-/.test("/" + values.plans)
) {
  console.error("Only avoozl-scratch-* repositories may be used.");
  process.exit(2);
}
fs.mkdirSync(root, { recursive: true });
const CODE = values.code,
  PLANS = values.plans,
  LOGIN = execFileSync("gh", ["api", "user", "--jq", ".login"], {
    encoding: "utf8",
  }).trim(),
  token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim(),
  url = (repository) => `https://github.com/${repository}.git`,
  registry = sourceRegistry({
    [CODE]: { url: url(CODE) },
  }),
  person = { kind: "person", login: LOGIN },
  journalOptions = { visibility: "private" },
  report = { startedAt: new Date().toISOString(), steps: [], calls: {} },
  outFile = values.out
    ? path.resolve(values.out)
    : path.join(root, "report.json");
const save = () => fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
const step = (name, facts) => {
  report.steps.push({ name, at: new Date().toISOString(), ...facts });
  console.log(`- ${name}: ${JSON.stringify(facts).slice(0, 400)}`);
  save();
};
const short = (sha) => String(sha).slice(0, 12);

// Every GitHub request: only the two scratch repositories, counted by kind.
const allowed = [CODE, PLANS].map((r) => `/repos/${r.toLowerCase()}`);
const guarded = async (input, init = {}) => {
  const u = new URL(String(input)),
    method = (init.method || "GET").toUpperCase(),
    p = u.pathname.toLowerCase();
  const ok =
    allowed.some((prefix) => p === prefix || p.startsWith(prefix + "/")) ||
    (method === "GET" &&
      (p === "/user" || p === `/users/${LOGIN.toLowerCase()}`)) ||
    (method === "POST" && p === "/graphql");
  if (!ok) throw Error(`P66 guard refused ${method} ${u.pathname}`);
  const kind = `${method} ${p.replace(/\/\d+/g, "/N").replace(allowed[1], "{plans}").replace(allowed[0], "{code}")}`;
  report.calls[kind] = (report.calls[kind] ?? 0) + 1;
  return fetch(input, init);
};
const github = new GitHubClient({ token, fetch: guarded });

const run = (cwd, cmd, args, options = {}) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", ...options }).trim();

// --- Setup -------------------------------------------------------------
const codeRoot = path.join(root, "code");
const plansRoot = path.join(root, "plans");
const ALPHA = "p66-alpha",
  BETA = "p66-beta";
const manifests = {
  [ALPHA]: {
    tasks: {
      t1: {
        kind: "leaf",
        repository: "code",
        summary: "alpha() returns 'alpha'",
        paths: ["src/alpha.mjs", "test/alpha.test.mjs"],
        checks: ["npm test"],
      },
      t2: {
        kind: "leaf",
        repository: "code",
        summary: "beta() returns 'beta'",
        paths: ["src/alpha.mjs", "test/alpha.test.mjs"],
        checks: ["npm test"],
        requires: ["t1"],
      },
      t3: {
        kind: "leaf",
        repository: "code",
        summary: "gamma() returns 'gamma'",
        paths: ["src/alpha.mjs", "test/alpha.test.mjs"],
        checks: ["npm test"],
        requires: ["t2"],
      },
    },
  },
  [BETA]: {
    tasks: {
      x1: {
        kind: "leaf",
        repository: "code",
        summary: "greet() uses alpha()",
        paths: ["src/beta.mjs", "test/beta.test.mjs"],
        checks: ["npm test"],
        requires: [`${ALPHA}:t1`],
      },
    },
  },
};
const specFiles = (spec) => ({
  "requirements.md": `# ${spec}\n\nScratch requirements for proof P66.\n`,
  "design.md": `# ${spec}\n\nScratch design for proof P66.\n`,
  "tasks.md":
    Object.keys(manifests[spec].tasks)
      .map((t) => `- [ ] ${t} ${manifests[spec].tasks[t].summary}`)
      .join("\n") + "\n",
  "avoozl/manifest.json": JSON.stringify(manifests[spec], null, 2) + "\n",
});
const revision = Object.fromEntries(
  [ALPHA, BETA].map((s) => [s, specHash(specFiles(s))]),
);
const definitions = Object.fromEntries(
  [ALPHA, BETA].map((s) => [
    s,
    new Map(
      Object.entries(manifests[s].tasks).map(([t, e]) => [
        t,
        taskDefinition(e),
      ]),
    ),
  ]),
);

async function seed() {
  for (const [dir, repository] of [
    [codeRoot, CODE],
    [plansRoot, PLANS],
  ]) {
    if (fs.existsSync(dir)) continue;
    run(root, "git", ["clone", "-q", url(repository), dir]);
    run(dir, "git", ["config", "user.name", "Avoozl P66"]);
    run(dir, "git", ["config", "user.email", "p66@example.invalid"]);
  }
  if (!fs.existsSync(path.join(codeRoot, "package.json"))) {
    fs.mkdirSync(path.join(codeRoot, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(codeRoot, "package.json"),
      JSON.stringify(
        {
          name: "p66-scratch",
          type: "module",
          private: true,
          scripts: { test: "node --test" },
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(
      path.join(codeRoot, "test", "base.test.mjs"),
      'import test from "node:test";\ntest("base", () => {});\n',
    );
    fs.writeFileSync(
      path.join(codeRoot, "README.md"),
      "Scratch code for Avoozl proof P66.\n",
    );
    run(codeRoot, "git", ["checkout", "-q", "-b", "main"]);
    run(codeRoot, "git", ["add", "."]);
    run(codeRoot, "git", ["commit", "-q", "-m", "Start"]);
    run(codeRoot, "git", ["push", "-q", "origin", "main"]);
  }
  if (!fs.existsSync(path.join(plansRoot, ".kiro"))) {
    for (const spec of [ALPHA, BETA])
      for (const [file, text] of Object.entries(specFiles(spec))) {
        const at = path.join(plansRoot, ".kiro", "specs", spec, file);
        fs.mkdirSync(path.dirname(at), { recursive: true });
        fs.writeFileSync(at, text);
      }
    run(plansRoot, "git", ["checkout", "-q", "-b", "main"]);
    run(plansRoot, "git", ["add", "."]);
    run(plansRoot, "git", ["commit", "-q", "-m", "Add scratch specs"]);
    run(plansRoot, "git", ["push", "-q", "origin", "main"]);
  }
}

const issues = {};
async function publish() {
  const known = path.join(root, "issues.json");
  if (fs.existsSync(known))
    return Object.assign(issues, JSON.parse(fs.readFileSync(known, "utf8")));
  const epic = await github.createIssue(PLANS, {
    title: "P66 scratch epic",
    body: "Avoozl keeps this epic's journal here.",
    labels: ["crew:avoozl"],
    assignees: [LOGIN],
  });
  issues.epic = { number: epic.number, node: epic.node_id };
  for (const spec of [ALPHA, BETA, "p66-mut", "p66-del"]) {
    const made = await github.createIssue(PLANS, {
      title: `P66 scratch spec ${spec}`,
      body: "Avoozl keeps this spec's journal here.",
      labels: ["crew:avoozl"],
      assignees: [LOGIN],
      ...(spec.startsWith("p66-a") || spec.startsWith("p66-b")
        ? { parentIssueId: epic.node_id }
        : {}),
    });
    issues[spec] = { number: made.number };
  }
  fs.writeFileSync(known, JSON.stringify(issues, null, 2));
  return issues;
}

const journalOf = (spec) => githubJournal(github, PLANS, issues[spec].number);
const ownerOf = async (spec) => {
  const [specIssue, epicIssue] = await Promise.all([
    github.issue(PLANS, issues[spec].number),
    github.issue(PLANS, issues.epic.number),
  ]);
  return effectiveOwner({
    spec: (specIssue.assignees ?? []).map((a) => a.login),
    epic: (epicIssue.assignees ?? []).map((a) => a.login),
  });
};
const stateOf = async (spec) =>
  driverState(
    await replayJournal(await journalOf(spec).list(), {
      ...journalOptions,
      permission: journalOf(spec).permission,
    }),
  );

// --- The disposable workspace database --------------------------------
const dbFile = path.join(root, "workspace.sqlite");
const store = new Store(dbFile);
try {
  store.read();
} catch {
  store.importSnapshot(emptySnapshot("P66 scratch"));
}
function seedStore() {
  if (store.read().tasks.length) return;
  store.put("projects", { id: "code", root: codeRoot, baseBranch: "main" });
  // The spec issues the scheduler replays before dispatch.
  for (const spec of [ALPHA, BETA])
    store.put("receipts", {
      id: `github-parent:plan:${spec}`,
      kind: "github-parent",
      level: "plan",
      parentId: spec,
      planId: spec,
      repository: PLANS,
      number: issues[spec].number,
    });
  store.mutate("Seed P66 tasks", (data) => {
    for (const spec of [ALPHA, BETA])
      for (const [id, entry] of Object.entries(manifests[spec].tasks))
        data.tasks.push({
          id,
          title: entry.summary,
          scope: "catalog",
          status: "planned",
          epic: "p66",
          track: "catalog",
          tags: [],
          kind: "leaf",
          acceptance: [entry.summary],
          repository: "code",
          planId: spec,
          paths: entry.paths,
        });
    for (const [from, to] of [
      ["t1", "t2"],
      ["t2", "t3"],
      ["t1", "x1"],
    ])
      data.edges.push({
        id: `${from}:requires:${to}`,
        from,
        to,
        kind: "requires",
      });
  });
}
const frontier = () => {
  const ready = queryTasks(store.read(), { scope: "all", q: "ready:true" })
      .map((t) => t.id)
      .sort(),
    schedule = scheduleHolds(store, { github: null });
  return {
    ready,
    dispatchable: schedule.order,
    held: Object.fromEntries(schedule.held),
  };
};
const setTask = (id, fields) =>
  store.mutate(`P66 ${id}`, (data) => {
    Object.assign(
      data.tasks.find((t) => t.id === id),
      fields,
    );
  });

// --- The worker: a real agent CLI in the task worktree -----------------
const BRIEFS = {
  t1: "Create src/alpha.mjs exporting a function alpha() that returns the string 'alpha'. Create test/alpha.test.mjs that imports it with node:test and node:assert and checks alpha() === 'alpha'.",
  t2: "In src/alpha.mjs add and export a function beta() that returns the string 'beta'; keep alpha(). In test/alpha.test.mjs add a test that beta() === 'beta'.",
  t3: "In src/alpha.mjs add and export a function gamma() that returns the string 'gamma'; keep the others. In test/alpha.test.mjs add a test that gamma() === 'gamma'.",
  x1: "Create src/beta.mjs that imports alpha from './alpha.mjs' and exports greet() returning 'hello ' + alpha(). Create test/beta.test.mjs with node:test checking greet() === 'hello alpha'.",
};
async function work(spec, task, from) {
  const dir = path.join(root, "worktrees", task),
    branch = `p66-work/${task}`;
  if (!fs.existsSync(dir))
    await git(codeRoot, ["worktree", "add", "-q", "-b", branch, dir, from]);
  const started = Date.now(),
    brief = `You are an Avoozl worker on task ${task}. ${BRIEFS[task]} Edit only those files. Do not run git or any shell command; Avoozl commits your change after you finish.`;
  const child = spawnSync(
    "claude",
    [
      "-p",
      brief,
      "--allowedTools",
      "Read",
      "Write",
      "Edit",
      "--permission-mode",
      "acceptEdits",
    ],
    { cwd: dir, encoding: "utf8", timeout: 600_000 },
  );
  // Avoozl commits after the child exits, never under .avoozl/.
  await git(dir, ["add", "-A", "--", ".", ":(exclude).avoozl"]);
  await git(dir, ["commit", "-q", "-m", `Task ${task}`]);
  const commit = await git(dir, ["rev-parse", "HEAD"]),
    changed = (await git(dir, ["diff", "--name-only", `${from}..${commit}`]))
      .split("\n")
      .filter(Boolean),
    declared = manifests[spec].tasks[task].paths;
  return {
    dir,
    commit,
    exit: child.status,
    seconds: Math.round((Date.now() - started) / 1000),
    changed,
    outside: changed.filter((f) => !declared.includes(f)),
  };
}
async function verify(spec, task, done) {
  const check = await runCheckAt({ root: codeRoot }, done.commit, [
    "npm",
    "test",
  ]);
  return {
    commit: done.commit,
    checks: [{ command: "npm test", exitCode: check.exitCode }],
    paths: { outside: done.outside, protected: [] },
  };
}

// --- The proof ---------------------------------------------------------
const drivers = {};
async function main() {
  await seed();
  await publish();
  seedStore();
  const baseHead = () =>
    run(codeRoot, "git", ["ls-remote", url(CODE), "refs/heads/main"]).split(
      /\s+/,
    )[0];
  const mainAtStart = baseHead();
  step("setup", {
    code: CODE,
    plans: PLANS,
    issues,
    revision,
    definitions: Object.fromEntries(
      Object.entries(definitions).map(([s, m]) => [s, Object.fromEntries(m)]),
    ),
    main: mainAtStart,
    frontier: frontier(),
  });

  // Take over each spec: generation 1, by the owner.
  for (const spec of [ALPHA, BETA, "p66-mut", "p66-del"]) {
    const state = await stateOf(spec);
    if (state.generation > 0) {
      drivers[spec] = JSON.parse(
        fs.readFileSync(path.join(root, `driver-${spec}`), "utf8"),
      );
      continue;
    }
    const took = await takeOver(
      journalOf(spec),
      { by: person, owner: await ownerOf(spec), spec },
      journalOptions,
    );
    drivers[spec] = took.driver;
    fs.writeFileSync(
      path.join(root, `driver-${spec}`),
      JSON.stringify(took.driver),
    );
    if (spec === ALPHA || spec === BETA)
      rememberDriver(store, spec, took.driver);
  }
  step("takeover-generation-1", {
    generations: Object.fromEntries(
      await Promise.all(
        [ALPHA, BETA].map(async (s) => [s, (await stateOf(s)).generation]),
      ),
    ),
  });

  // Working branch for alpha, at main.
  const alphaRef = await ensureWorkingBranch(codeRoot, {
    spec: ALPHA,
    repository: CODE,
    target: { repository: CODE, base: "main" },
    baseCommit: mainAtStart,
  });
  await pushHead(
    codeRoot,
    {
      repository: CODE,
      branch: workingBranch(ALPHA),
      commit: alphaRef.ref.source.commit,
    },
    registry,
    { since: mainAtStart },
  );
  const prepared = await specBase(codeRoot, { spec: ALPHA, base: "main" });

  // t1: the worker, an unfinished checkpoint, then checks.
  const t1 = await work(ALPHA, "t1", prepared.commit);
  const cp = await checkpointTask(codeRoot, {
    spec: ALPHA,
    task: "t1",
    commit: t1.commit,
  });
  await pushHead(
    codeRoot,
    { repository: CODE, branch: cp.branch, commit: t1.commit },
    registry,
    { since: prepared.commit },
  );
  await appendRecord(
    journalOf(ALPHA),
    {
      op: `checkpoint.t1.${short(t1.commit)}`,
      kind: "checkpoint",
      spec: ALPHA,
      driver: drivers[ALPHA],
      refs: [{ repository: CODE, branch: cp.branch, commit: t1.commit }],
    },
    journalOptions,
  );
  setTask("t1", { status: "partial" });
  const refusedUnverified = await integrateVerified(codeRoot, {
    spec: ALPHA,
    task: "t1",
    commit: t1.commit,
    evidence: null,
  }).then(
    () => "integrated",
    (e) => e.message,
  );
  step("t1-checkpoint", {
    prepareBase: prepared,
    worker: {
      exit: t1.exit,
      seconds: t1.seconds,
      changed: t1.changed,
      outside: t1.outside,
    },
    checkpoint: { branch: cp.branch, commit: t1.commit },
    integrateUnverified: refusedUnverified,
    releasesFromCheckpoint: releases({
      outcome: { state: "open" },
      branch: { state: "checkpoint", commit: t1.commit },
      sameSpec: true,
      repositories: ["code"],
    }),
    frontier: frontier(),
  });

  const t1Evidence = await verify(ALPHA, "t1", t1);
  const t1Int = await integrateVerified(codeRoot, {
    spec: ALPHA,
    task: "t1",
    commit: t1.commit,
    evidence: t1Evidence,
  });
  await pushHead(
    codeRoot,
    { repository: CODE, branch: workingBranch(ALPHA), commit: t1Int.head },
    registry,
    { since: mainAtStart },
  );
  await retainVerified(codeRoot, ALPHA, {
    source: {
      repository: CODE,
      branch: workingBranch(ALPHA),
      commit: t1Int.head,
    },
    target: { repository: CODE, base: "main" },
  });
  await appendRecord(
    journalOf(ALPHA),
    {
      op: `checkpoint.work.${short(t1Int.head)}`,
      kind: "checkpoint",
      spec: ALPHA,
      driver: drivers[ALPHA],
      refs: [
        { repository: CODE, branch: workingBranch(ALPHA), commit: t1Int.head },
      ],
    },
    journalOptions,
  );
  setTask("t1", {
    status: "implemented",
    integration: {
      commit: t1Int.head,
      branch: cp.branch,
      into: workingBranch(ALPHA),
      at: new Date().toISOString(),
    },
  });
  step("t1-verified-integrated", {
    checks: t1Evidence.checks,
    workingHead: t1Int.head,
    releasesInSpec: releases({
      outcome: { state: "open" },
      branch: {
        state: "verified",
        commit: t1Int.head,
        available: { code: [t1Int.head] },
      },
      sameSpec: true,
      repositories: ["code"],
    }),
    releasesCrossSpec: releases({
      outcome: { state: "open" },
      branch: {
        state: "verified",
        commit: t1Int.head,
        available: { code: [t1Int.head] },
      },
      sameSpec: false,
      repositories: ["code"],
    }),
    frontier: frontier(),
  });

  // Branch marks: a checked box on a plans working branch.
  const marked = specFiles(ALPHA);
  marked["tasks.md"] = marked["tasks.md"].replace("- [ ] t1", "- [x] t1");
  const marksBranch = `avoozl/${ALPHA}/marks`;
  run(plansRoot, "git", ["checkout", "-q", "-B", marksBranch, "origin/main"]);
  fs.writeFileSync(
    path.join(plansRoot, ".kiro", "specs", ALPHA, "tasks.md"),
    marked["tasks.md"],
  );
  run(plansRoot, "git", ["commit", "-q", "-am", "Mark t1 as branch progress"]);
  run(plansRoot, "git", [
    "push",
    "-q",
    "origin",
    `HEAD:refs/heads/${marksBranch}`,
  ]);
  run(plansRoot, "git", ["checkout", "-q", "main"]);
  step("branch-marks", {
    branch: marksBranch,
    revisionUnchanged: specHash(marked) === revision[ALPHA],
    t1Outcome: taskOutcome(
      journalOutcomes(
        await replayJournal(await journalOf(ALPHA).list(), {
          ...journalOptions,
          permission: journalOf(ALPHA).permission,
        }),
      ),
      {
        spec: ALPHA,
        task: "t1",
        revision: revision[ALPHA],
        definition: definitions[ALPHA].get("t1"),
      },
    ).state,
    frontier: frontier(),
  });

  // Journal retry: the same operation twice, and one duplicated comment.
  const before = (await journalOf(ALPHA).list()).length;
  const retryFields = {
    op: "control.resume-1",
    kind: "control",
    spec: ALPHA,
    driver: drivers[ALPHA],
    controls: [{ flag: "resume", id: "resume-1" }],
  };
  const first = await appendRecord(
    journalOf(ALPHA),
    retryFields,
    journalOptions,
  );
  const second = await appendRecord(
    journalOf(ALPHA),
    retryFields,
    journalOptions,
  );
  const body = (await journalOf(ALPHA).list()).find(
    (e) => e.id === first.id,
  ).body;
  await journalOf(ALPHA).create(body); // a lost-response retry posts the same record again
  const afterRetry = await replayJournal(await journalOf(ALPHA).list(), {
    ...journalOptions,
    permission: journalOf(ALPHA).permission,
  });
  step("journal-retry", {
    comments: { before, after: (await journalOf(ALPHA).list()).length },
    secondWriteExisting: second.existing === true,
    held: afterRetry.held,
    effectiveControlRecords: afterRetry.records.filter(
      (r) => r.record.op === retryFields.op,
    ).length,
  });

  // Mutate one linked record; delete another, on their own journals.
  for (const spec of ["p66-mut", "p66-del"])
    for (const n of [1, 2])
      await appendRecord(
        journalOf(spec),
        {
          op: `checkpoint.seed-${n}`,
          kind: "checkpoint",
          spec,
          driver: drivers[spec],
          refs: [{ repository: CODE, branch: "main", commit: mainAtStart }],
        },
        journalOptions,
      );
  const [o, rN] = PLANS.split("/");
  const mutEntries = await journalOf("p66-mut").list();
  await github.request(
    "PATCH",
    `/repos/${o}/${rN}/issues/comments/${mutEntries[1].id}`,
    { body: { body: mutEntries[1].body.replace("seed-1", "seed-x") } },
  );
  const delEntries = await journalOf("p66-del").list();
  await github.request(
    "DELETE",
    `/repos/${o}/${rN}/issues/comments/${delEntries[1].id}`,
  );
  const replayOf = async (spec) =>
    replayJournal(await journalOf(spec).list(), {
      ...journalOptions,
      permission: journalOf(spec).permission,
    });
  const mut = await replayOf("p66-mut"),
    del = await replayOf("p66-del");
  const mutTake = await takeOver(
    journalOf("p66-mut"),
    { by: person, owner: await ownerOf("p66-mut"), spec: "p66-mut" },
    journalOptions,
  ).then(
    () => "taken",
    (e) => e.message,
  );
  step("journal-mutation", {
    mutated: { held: mut.held, reasons: mut.reasons.map((r) => r.reason) },
    deleted: { held: del.held, reasons: del.reasons.map((r) => r.reason) },
    takeoverOnHeld: mutTake,
    restore: "see the journal-reanchor step",
  });

  // Land t1's portion through the landing queue (direct).
  const steps = directSteps({
    root: codeRoot,
    url: url(CODE),
    branch: "main",
    repository: CODE,
    checks: [["npm", "test"]],
    intent: (spec) => ({
      journal: journalOf(spec),
      options: journalOptions,
      input: {
        driver: drivers[spec],
        owner: { login: LOGIN, from: "spec" },
        login: LOGIN,
        revision: revision[spec],
      },
    }),
  });
  queuePortion(store, {
    projectId: "code",
    base: "main",
    spec: ALPHA,
    driver: drivers[ALPHA],
    commit: t1Int.head,
    tasks: [{ task: "t1", definition: definitions[ALPHA].get("t1") }],
    evidence: { ...t1Evidence, commit: t1Int.head },
  });
  const landed1 = await landNext(
    store,
    { projectId: "code", base: "main" },
    steps,
    { maxTasks: 4 },
  );
  const t1Outcome = taskOutcome(journalOutcomes(await replayOf(ALPHA)), {
    spec: ALPHA,
    task: "t1",
    revision: revision[ALPHA],
    definition: definitions[ALPHA].get("t1"),
  });
  if (t1Outcome.state === "complete")
    setTask("t1", {
      status: "accepted",
      integration: {
        commit: landed1.candidate,
        into: "main",
        at: new Date().toISOString(),
      },
    });
  step("t1-landed", {
    state: landed1.state,
    candidate: landed1.candidate,
    main: baseHead(),
    t1Outcome: t1Outcome.state,
    crossSpecReleases: releases({ outcome: t1Outcome, sameSpec: false }),
    frontier: frontier(),
  });

  // t2 from the working head; verify and integrate.
  await git(codeRoot, ["fetch", "-q", url(CODE), "main"]);
  const prep2 = await specBase(codeRoot, { spec: ALPHA, base: "main" });
  const t2 = await work(ALPHA, "t2", prep2.commit);
  const t2Evidence = await verify(ALPHA, "t2", t2);
  const t2Int = await integrateVerified(codeRoot, {
    spec: ALPHA,
    task: "t2",
    commit: t2.commit,
    evidence: t2Evidence,
  });
  await pushHead(
    codeRoot,
    { repository: CODE, branch: workingBranch(ALPHA), commit: t2Int.head },
    registry,
    { since: mainAtStart },
  );
  await appendRecord(
    journalOf(ALPHA),
    {
      op: `checkpoint.work.${short(t2Int.head)}`,
      kind: "checkpoint",
      spec: ALPHA,
      driver: drivers[ALPHA],
      refs: [
        { repository: CODE, branch: workingBranch(ALPHA), commit: t2Int.head },
      ],
    },
    journalOptions,
  );
  setTask("t2", {
    status: "implemented",
    integration: {
      commit: t2Int.head,
      into: workingBranch(ALPHA),
      at: new Date().toISOString(),
    },
  });
  step("t2-verified-integrated", {
    prepareBase: prep2,
    worker: {
      exit: t2.exit,
      seconds: t2.seconds,
      changed: t2.changed,
      outside: t2.outside,
    },
    checks: t2Evidence.checks,
    workingHead: t2Int.head,
    frontier: frontier(),
  });

  // Reconstruct after discarding a copied disposable database.
  const copy = path.join(root, "workspace-copy.sqlite");
  fs.copyFileSync(dbFile, copy);
  fs.rmSync(copy);
  const fresh = path.join(root, "rebuild-clone");
  if (!fs.existsSync(fresh))
    run(root, "git", ["clone", "-q", url(CODE), fresh]);
  const rebuilt = await rebuildSpec({
    root: fresh,
    registry,
    spec: ALPHA,
    target: { repository: CODE, base: "main" },
    entries: await journalOf(ALPHA).list(),
    replayOptions: {
      ...journalOptions,
      permission: journalOf(ALPHA).permission,
    },
    revision: revision[ALPHA],
    approved: definitions[ALPHA],
  });
  const resumeRefused = (() => {
    try {
      resumeRebuild(rebuilt, { by: person });
      return "resumed";
    } catch (e) {
      return e.message;
    }
  })();
  const resumed = resumeRebuild(rebuilt, {
    by: person,
    acceptUnknownSpend: true,
  });
  step("rebuild", {
    held: rebuilt.held,
    generation: rebuilt.generation,
    tasks: rebuilt.tasks,
    heads: rebuilt.heads.map((h) => ({
      branch: h.branch,
      commit: short(h.commit),
      state: h.state,
    })),
    unresolved: rebuilt.unresolved,
    spend: rebuilt.spend,
    resumeWithoutSpend: resumeRefused,
    resumed: {
      held: resumed.held,
      stillHeld: resumed.stillHeld,
      branchProgress: resumed.branchProgress,
    },
  });

  // The takeover race: pause the old driver right before its guarded push.
  const oldDriver = drivers[ALPHA];
  const main2 = baseHead();
  await git(codeRoot, ["fetch", "-q", url(CODE), "main"]);
  const merged = await stackMembers(
    codeRoot,
    [
      {
        key: `${ALPHA}.${short(t2Int.head)}`,
        commit: t2Int.head,
        tasks: [{ task: "t2", definition: definitions[ALPHA].get("t2") }],
      },
    ],
    main2,
  );
  const candCheck = await runCheckAt({ root: codeRoot }, merged.candidate, [
    "npm",
    "test",
  ]);
  let paused = null,
    newDriver = null;
  const raced = await landIntent(
    journalOf(ALPHA),
    {
      driver: oldDriver,
      owner: { login: LOGIN, from: "spec" },
      login: LOGIN,
      spec: ALPHA,
      op: `land.race.${short(merged.candidate)}`,
      revision: revision[ALPHA],
      candidate: merged.candidate,
      base: main2,
      tasks: [{ task: "t2", definition: definitions[ALPHA].get("t2") }],
      checks: [
        {
          name: "npm test",
          conclusion: candCheck.exitCode === 0 ? "success" : "failure",
        },
      ],
      refs: [{ repository: CODE, branch: "main", commit: merged.candidate }],
      land: () =>
        guardedFastForward(codeRoot, {
          url: url(CODE),
          branch: "main",
          base: main2,
          candidate: merged.candidate,
        }),
    },
    journalOptions,
    {
      beforeLand: async () => {
        paused = { at: new Date().toISOString() };
        const took = await takeOver(
          journalOf(ALPHA),
          { by: person, owner: await ownerOf(ALPHA), spec: ALPHA },
          journalOptions,
        );
        newDriver = took.driver;
        paused.takeover = {
          generation: took.generation,
          outstanding: took.outstanding.map((i) => i.op),
        };
        paused.resumedAt = new Date().toISOString();
      },
    },
  );
  drivers[ALPHA] = newDriver;
  fs.writeFileSync(
    path.join(root, `driver-${ALPHA}`),
    JSON.stringify(newDriver),
  );
  const displacedDispatch = await revalidateSpecs(store, {
    github,
    planIds: [ALPHA],
  });
  const oldNewWork = await revalidate(
    journalOf(ALPHA),
    { driver: oldDriver, owner: { login: LOGIN }, login: LOGIN },
    journalOptions,
  );
  const oldNewLanding = await landIntent(
    journalOf(ALPHA),
    {
      driver: oldDriver,
      owner: { login: LOGIN },
      login: LOGIN,
      spec: ALPHA,
      op: "land.after-takeover",
      revision: revision[ALPHA],
      candidate: merged.candidate,
      base: merged.candidate,
      tasks: [{ task: "t3", definition: definitions[ALPHA].get("t3") }],
      refs: [{ repository: CODE, branch: "main", commit: merged.candidate }],
      land: async () => true,
    },
    journalOptions,
  );
  await git(codeRoot, ["fetch", "-q", url(CODE), "main"]);
  const reconcile1 = await reconcileIntents(
    journalOf(ALPHA),
    {
      driver: newDriver,
      owner: { login: LOGIN },
      login: LOGIN,
      spec: ALPHA,
      root: codeRoot,
      baseHead: baseHead(),
    },
    journalOptions,
  );
  const reconcile2 = await reconcileIntents(
    journalOf(ALPHA),
    {
      driver: newDriver,
      owner: { login: LOGIN },
      login: LOGIN,
      spec: ALPHA,
      root: codeRoot,
      baseHead: baseHead(),
    },
    journalOptions,
  );
  const raceState = await stateOf(ALPHA);
  rememberDriver(store, ALPHA, newDriver);
  step("takeover-race", {
    oldDriverResult: raced,
    pause: paused,
    main: baseHead(),
    candidate: merged.candidate,
    storeWithOldDriver: Object.fromEntries(displacedDispatch.reasons),
    oldDriverNewWork: oldNewWork.reason,
    oldDriverNewLanding: oldNewLanding,
    reconcileFirst: reconcile1.intents,
    reconcileSecond: reconcile2.intents,
    t2EffectiveOutcomes: raceState.outcomes.filter((x) => x.task === "t2")
      .length,
    outstanding: outstandingIntents(raceState).map((i) => i.op),
    generation: raceState.generation,
  });
  setTask("t2", {
    status: "accepted",
    integration: {
      commit: merged.candidate,
      into: "main",
      at: new Date().toISOString(),
    },
  });

  // Stale and copied trailers on the base.
  const trailerDir = path.join(root, "trailers");
  if (!fs.existsSync(trailerDir))
    run(root, "git", ["clone", "-q", url(CODE), trailerDir]);
  run(trailerDir, "git", ["config", "user.name", "Someone"]);
  run(trailerDir, "git", ["config", "user.email", "someone@example.invalid"]);
  run(trailerDir, "git", ["pull", "-q", "origin", "main"]);
  fs.writeFileSync(path.join(trailerDir, "NOTES.md"), "A person's note.\n");
  run(trailerDir, "git", ["add", "."]);
  const stale = "0".repeat(64);
  run(trailerDir, "git", [
    "commit",
    "-q",
    "-m",
    `Note\n\nAvoozl-Task: t3@${definitions[ALPHA].get("t3")}\nAvoozl-Task: t3@${stale}`,
  ]);
  run(trailerDir, "git", ["push", "-q", "origin", "HEAD:main"]);
  const noted = run(trailerDir, "git", ["rev-parse", "HEAD"]);
  const st = await stateOf(ALPHA);
  step("trailers", {
    commit: noted,
    copied: trailerOutcome(
      { task: "t3", definition: definitions[ALPHA].get("t3"), commit: noted },
      { approved: definitions[ALPHA], state: st },
    ),
    stale: trailerOutcome(
      { task: "t3", definition: stale, commit: noted },
      { approved: definitions[ALPHA], state: st },
    ),
    t3Outcome: taskOutcome(journalOutcomes(await replayOf(ALPHA)), {
      spec: ALPHA,
      task: "t3",
      revision: revision[ALPHA],
      definition: definitions[ALPHA].get("t3"),
    }).state,
  });

  // x1, the cross-spec successor, now that t1 landed.
  await git(codeRoot, ["fetch", "-q", url(CODE), "main"]);
  const mainNow = baseHead();
  await ensureWorkingBranch(codeRoot, {
    spec: BETA,
    repository: CODE,
    target: { repository: CODE, base: "main" },
    baseCommit: mainNow,
  });
  const prepX = await specBase(codeRoot, { spec: BETA, base: "main" });
  const x1 = await work(BETA, "x1", prepX.commit);
  const x1Evidence = await verify(BETA, "x1", x1);
  const x1Int = await integrateVerified(codeRoot, {
    spec: BETA,
    task: "x1",
    commit: x1.commit,
    evidence: x1Evidence,
  });
  await pushHead(
    codeRoot,
    { repository: CODE, branch: workingBranch(BETA), commit: x1Int.head },
    registry,
    { since: mainNow },
  );
  step("x1-cross-spec", {
    prepareBase: prepX,
    worker: {
      exit: x1.exit,
      seconds: x1.seconds,
      changed: x1.changed,
      outside: x1.outside,
    },
    checks: x1Evidence.checks,
    workingHead: x1Int.head,
  });

  // Hold and reassignment with no commit: the journal and the issue only.
  const plansHead = run(plansRoot, "git", [
    "ls-remote",
    url(PLANS),
    "refs/heads/main",
  ]).split(/\s+/)[0];
  const issuePath = `/repos/${o}/${rN}/issues/${issues[ALPHA].number}`;
  const conditionalIssue = async (etag) => {
    const res = await guarded(`https://api.github.com${issuePath}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        ...(etag ? { "if-none-match": etag } : {}),
      },
    });
    if (res.status === 304) return { changed: false, etag };
    return {
      changed: true,
      etag: res.headers.get("etag"),
      value: await res.json(),
    };
  };
  const sources = {
    head: async () =>
      run(plansRoot, "git", ["ls-remote", url(PLANS), "refs/heads/main"]).split(
        /\s+/,
      )[0],
    blobs: async () => [["tasks.md", "fixed"]],
    parse: async () => manifests[ALPHA].tasks,
    issue: conditionalIssue,
    journal: () => journalOf(ALPHA).list(),
    permission: journalOf(ALPHA).permission,
    pulls: [],
  };
  const r0 = await refreshSpec(null, sources, journalOptions);
  await appendRecord(
    journalOf(ALPHA),
    {
      op: "control.hold-1",
      kind: "control",
      spec: ALPHA,
      driver: newDriver,
      controls: [{ flag: "hold", id: "hold-1" }],
    },
    journalOptions,
  );
  const r1 = await refreshSpec(r0.state, sources, journalOptions);
  const heldCheck = await revalidate(
    journalOf(ALPHA),
    { driver: newDriver, owner: await ownerOf(ALPHA), login: LOGIN },
    journalOptions,
  );
  const heldDispatch = await revalidateSpecs(store, {
    github,
    planIds: [ALPHA],
  });
  await appendRecord(
    journalOf(ALPHA),
    {
      op: "control.release-1",
      kind: "control",
      spec: ALPHA,
      driver: newDriver,
      controls: [{ flag: "release", id: "hold-1" }],
    },
    journalOptions,
  );
  await github.removeAssignees(PLANS, issues[ALPHA].number, [LOGIN]);
  await github.removeAssignees(PLANS, issues.epic.number, [LOGIN]);
  const r2 = await refreshSpec(r1.state, sources, journalOptions);
  const unowned = await revalidate(
    journalOf(ALPHA),
    { driver: newDriver, owner: await ownerOf(ALPHA), login: LOGIN },
    journalOptions,
  );
  await github.addAssignees(PLANS, issues[ALPHA].number, [LOGIN]);
  await github.addAssignees(PLANS, issues.epic.number, [LOGIN]);
  const r3 = await refreshSpec(r2.state, sources, journalOptions);
  const owned = await revalidate(
    journalOf(ALPHA),
    { driver: newDriver, owner: await ownerOf(ALPHA), login: LOGIN },
    journalOptions,
  );
  step("hold-and-reassignment", {
    plansHeadUnchanged: plansHead === (await sources.head()),
    afterHold: {
      changed: [...(r1.changed ?? [])],
      revalidate: heldCheck.reason,
      dispatch: Object.fromEntries(heldDispatch.reasons),
    },
    afterUnassign: {
      changed: [...(r2.changed ?? [])],
      owner: r2.state.owner,
      revalidate: unowned.reason,
    },
    afterReassign: {
      changed: [...(r3.changed ?? [])],
      owner: r3.state.owner,
      revalidate: owned.ok,
    },
  });

  // Canaries: made-up names that must never be published.
  const canaryConfig = path.join(root, "canary-machine.json");
  fs.writeFileSync(
    canaryConfig,
    JSON.stringify({
      privacy: { internalDomains: ["build.canary-p66.example"] },
    }),
  );
  const canaryMachine = {
    hostname: "canaryhost-p66",
    username: "canaryuser66",
  };
  const canaryDir = path.join(root, "worktrees", "canary");
  if (!fs.existsSync(canaryDir))
    await git(codeRoot, [
      "worktree",
      "add",
      "-q",
      "--detach",
      canaryDir,
      mainNow,
    ]);
  const tryPush = async (file, text, message, branch) => {
    await git(canaryDir, ["checkout", "-q", "--detach", mainNow]);
    fs.writeFileSync(path.join(canaryDir, file), text);
    await git(canaryDir, ["add", file]);
    await git(canaryDir, [
      "-c",
      "user.name=P66",
      "-c",
      "user.email=p66@example.invalid",
      "commit",
      "-q",
      "-m",
      message,
    ]);
    const commit = await git(canaryDir, ["rev-parse", "HEAD"]);
    return pushHead(codeRoot, { repository: CODE, branch, commit }, registry, {
      since: mainNow,
      machine: canaryMachine,
      configFile: canaryConfig,
    }).then(
      () => "pushed",
      (e) => e.message,
    );
  };
  const canaries = {
    codeDomain: await tryPush(
      "canary.txt",
      "server = ci.build.canary-p66.example\n",
      "Add config",
      `avoozl/${ALPHA}/task/canary-a`,
    ),
    codeHostname: await tryPush(
      "canary.txt",
      "host canaryhost-p66\n",
      "Add host",
      `avoozl/${ALPHA}/task/canary-b`,
    ),
    commitHomePath: await tryPush(
      "canary.txt",
      "plain\n",
      "Copied from /Users/canaryuser66/notes",
      `avoozl/${ALPHA}/task/canary-c`,
    ),
    commitIp: await tryPush(
      "canary.txt",
      "plain two\n",
      "Seen at 10.20.30.40",
      `avoozl/${ALPHA}/task/canary-d`,
    ),
    refName: await tryPush(
      "canary.txt",
      "plain three\n",
      "Plain",
      `avoozl/canaryhost-p66/task/x`,
    ),
    journalAlias: await appendRecord(
      journalOf(ALPHA),
      {
        op: "control.canary",
        kind: "control",
        spec: ALPHA,
        driver: newDriver,
        controls: [{ flag: "resume", id: "canary" }],
      },
      {
        ...journalOptions,
        alias: "canaryuser66",
        machine: canaryMachine,
        configFile: canaryConfig,
      },
    ).then(
      () => "written",
      (e) => e.message,
    ),
  };
  const remoteRefs = run(codeRoot, "git", ["ls-remote", url(CODE)]);
  const comments = (await journalOf(ALPHA).list())
    .map((c) => c.body)
    .join("\n");
  step("canaries", {
    verdicts: canaries,
    anyOnRemote:
      /canary/.test(remoteRefs) || /canary(host|user)/.test(comments),
  });

  report.finishedAt = new Date().toISOString();
  report.final = {
    main: baseHead(),
    frontier: frontier(),
    generation: (await stateOf(ALPHA)).generation,
  };
  save();
  await retirement();
  await reanchorLive();
}

// Restore a held journal by a person's reanchor (56.15), live, through the
// same Operations.execute path the local CLI uses: publish and take over two
// scratch specs, break one journal by an edit and one by a deletion, then
// reanchor, check the spec stays held, and Resume.
async function reanchorLive() {
  const ws = path.join(root, `reanchor-ws-${Date.now()}`);
  fs.mkdirSync(ws, { recursive: true });
  fs.writeFileSync(
    path.join(ws, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdee",
      github: {
        mode: "single-repo",
        repositories: { [PLANS]: { baseBranch: "main" } },
      },
    }),
  );
  const s3 = new Store(path.join(ws, "workspace.sqlite"));
  try {
    s3.read();
  } catch {
    s3.importSnapshot(emptySnapshot("P66 reanchor"));
  }
  const { Operations } = await import("../src/app/operations.mjs");
  const ops = new Operations(s3, {
    github,
    operator: LOGIN,
    workspaceRoot: ws,
    driver: { settingsFile: path.join(ws, "driver.json") },
  });
  // Single-repo mode keeps the spec folders in the project checkout.
  s3.put("projects", { id: "code", root: ws, baseBranch: "main" });
  await ops.execute("github.configure", {
    repository: PLANS,
    projectId: "code",
    allowedActors: [LOGIN],
  });
  const results = {};
  for (const [spec, damage] of [
    ["p66-edit", "edit"],
    ["p66-gone", "delete"],
  ]) {
    manifests[spec] = {
      tasks: {
        r1: {
          kind: "leaf",
          repository: "code",
          summary: "A scratch leaf",
          checks: ["npm test"],
          acceptance: ["Works."],
        },
      },
    };
    for (const [file, text] of Object.entries(specFiles(spec))) {
      const at = path.join(ws, ".kiro", "specs", spec, file);
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, text);
    }
    const plan = await ops.execute("plan.create", {
      spec,
      prompt: "Scratch spec for P66",
      context: { projectId: "code" },
    });
    const published = await ops.execute("spec.publish", {
      planId: plan.id,
      repository: PLANS,
    });
    // The owner assigns themselves on the new spec issue, as on GitHub.
    await github.addAssignees(PLANS, published.number, [LOGIN]);
    const took = await ops.execute("spec.takeover", { planId: plan.id });
    const journal = githubJournal(github, PLANS, published.number);
    for (const id of ["a", "b", "c"])
      await appendRecord(
        journal,
        {
          op: `control.${id}`,
          kind: "control",
          spec: plan.id,
          controls: [{ flag: "resume", id }],
        },
        journalOptions,
      );
    const entries = await journal.list(),
      target = entries.at(-2);
    if (damage === "edit")
      await github.updateIssueComment(
        PLANS,
        target.id,
        target.body.replace('"id":"b"', '"id":"x"'),
      );
    else
      await github.request(
        "DELETE",
        `/repos/${PLANS}/issues/comments/${target.id}`,
      );
    const replay = await replayJournal(await journal.list(), {
      ...journalOptions,
      permission: journal.permission,
    });
    const held = replay.reasons.map((r) => r.id),
      tail = replay.tail.id,
      commentsBefore = (await journal.list()).length;
    const agent = await ops
      .execute(
        "spec.journal.reanchor",
        { planId: plan.id, held, tail, apply: true },
        undefined,
        { mcp: true },
      )
      .then(
        () => "written",
        (e) => e.message,
      );
    const preview = await ops.execute("spec.journal.reanchor", {
      planId: plan.id,
      held,
      tail,
    });
    const stale = await ops
      .execute("spec.journal.reanchor", {
        planId: plan.id,
        held,
        tail: tail - 1,
        apply: true,
      })
      .then(
        () => "written",
        (e) => e.message,
      );
    const applied = await ops.execute("spec.journal.reanchor", {
      planId: plan.id,
      held,
      tail,
      apply: true,
    });
    const stopped = await revalidateSpecs(s3, {
      github,
      workspaceRoot: ws,
      planIds: [plan.id],
    });
    const resumed = await ops.execute("spec.journal.resume", {
      planId: plan.id,
      tail,
    });
    const after = await revalidateSpecs(s3, {
      github,
      workspaceRoot: ws,
      planIds: [plan.id],
    });
    const remaining = await journal.list();
    results[spec] = {
      issue: published.number,
      generation: took.generation,
      damage,
      heldOn: replay.reasons,
      agentCaller: agent,
      preview: { written: preview.written, after: preview.after },
      staleTail: stale,
      applied: {
        written: applied.written,
        after: applied.after,
        heldUntilResume: applied.heldUntilResume,
      },
      beforeResume: Object.fromEntries(stopped.reasons),
      resumed: Boolean(resumed.id),
      afterResume: Object.fromEntries(after.reasons),
      commentsBefore,
      commentsAfter: remaining.length,
      damagedStillThere:
        damage === "edit"
          ? remaining.find((e) => e.id === target.id)?.edited === true
          : !remaining.some((e) => e.id === target.id),
      cli: `avoozl spec journal reanchor ${plan.id} --held ${held.join(",")} --tail ${tail} --yes`,
    };
  }
  step("journal-reanchor", results);
  s3.close();
}

// Issue-binding retirement on a second scratch workspace whose two tasks
// were projected to real task issues the old way.
async function retirement() {
  const ws = path.join(root, "retire-ws");
  fs.mkdirSync(ws, { recursive: true });
  const NAMESPACE = "avz_0123456789abcdef";
  fs.writeFileSync(
    path.join(ws, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        repositories: {
          [PLANS]: {
            baseBranch: "main",
            allowedActors: [LOGIN],
            minimumPermission: "write",
          },
        },
      },
    }),
  );
  const s2 = new Store(path.join(ws, "workspace.sqlite"));
  try {
    s2.read();
  } catch {
    s2.importSnapshot(emptySnapshot("P66 retire"));
  }
  const { machineIdentity } = await import("../src/app/github-sync.mjs");
  const { renderMarker } = await import("../src/app/github-marker.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const known = path.join(root, "retire-issues.json");
  let numbers = fs.existsSync(known)
    ? JSON.parse(fs.readFileSync(known, "utf8"))
    : null;
  const h = "b".repeat(64);
  if (!numbers) {
    numbers = {};
    for (const taskId of ["ra", "rb"]) {
      const made = await github.createIssue(PLANS, {
        title: `Legacy task issue ${taskId}`,
        body:
          renderMarker({
            version: 2,
            taskId,
            namespace: NAMESPACE,
            kind: "leaf",
            source: { commit: null, manifest: h },
            applied: { title: h, body: h, labels: [], blockers: [] },
          }) + "\nA task issue from before retirement.",
        labels: ["crew:avoozl"],
      });
      numbers[taskId] = made.number;
    }
    fs.writeFileSync(known, JSON.stringify(numbers));
  }
  const [owner, repo] = PLANS.split("/");
  if (!s2.read().tasks.length) {
    s2.put("projects", {
      id: "code",
      root: codeRoot,
      baseBranch: "main",
      checks: [],
    });
    s2.put("github_repositories", {
      id: PLANS,
      owner,
      repo,
      projectId: "code",
      activeMachine: machineIdentity(s2).id,
    });
    s2.mutate("Seed projected leaves", (data) => {
      const leaf = (id, extra = {}) => ({
        id,
        title: "Task " + id,
        scope: "catalog",
        status: "planned",
        epic: "p66",
        track: "catalog",
        kind: "leaf",
        authority: "github",
        repository: "code",
        acceptance: [id + " works"],
        approvedSource: { hash: "h-" + id, text: id },
        ...extra,
      });
      const bound = (number) => ({
        github: {
          repository: PLANS,
          number,
          nodeId: "I_" + number,
          url: `https://github.com/${PLANS}/issues/${number}`,
          origin: "design",
        },
      });
      data.tasks.push(
        leaf("ra", {
          ...bound(numbers.ra),
          dispatch: { ready: true, state: "authorized" },
        }),
        leaf("rb", {
          ...bound(numbers.rb),
          dispatch: { ready: true, state: "authorized" },
        }),
        leaf("ra-next"),
      );
      data.edges.push({
        id: "ra:requires:ra-next",
        from: "ra",
        to: "ra-next",
        kind: "requires",
      });
    });
  }
  const ops = new Operations(s2, { github, workspaceRoot: ws });
  const ready = () =>
    queryTasks(s2.read(), { scope: "all", q: "ready:true" })
      .map((t) => t.id)
      .sort();
  const callsBefore = { ...report.calls };
  const readyBefore = ready();
  const preview = await ops.execute("github.retireTaskIssues", {
    step: "preview",
  });
  await ops.execute("github.retireTaskIssues", { step: "hold" });
  await ops.execute("github.retireTaskIssues", { step: "apply" });
  const verified = await ops.execute("github.retireTaskIssues", {
    step: "verify",
  });
  const readyAfter = ready();
  const taskIssueCalls = Object.entries(report.calls)
    .filter(([k, v]) => /issues\/N/.test(k) && v !== (callsBefore[k] ?? 0))
    .map(([k, v]) => [k, v - (callsBefore[k] ?? 0)]);
  const closed = await ops.execute("github.retireTaskIssues", {
    step: "close",
    reason: "completed",
  });
  await ops.execute("workspace.tick", { cron: true });
  step("issue-binding-retirement", {
    preview: {
      bindings: preview.bindings?.map((b) => [b.taskId, b.number]),
      changed: preview.changed,
    },
    verify: { state: verified.state, failure: verified.failure ?? null },
    readyBefore,
    readyAfterVerify: readyAfter,
    issueCallsDuringVerify: taskIssueCalls,
    closed: closed.closed,
    readyAfterClose: ready(),
    raNextReleased: ready().includes("ra-next"),
  });
  s2.close();
}

// `--only reanchor` adds the reanchor step to an earlier run's report.
const entry =
  values.only === "reanchor"
    ? async () => {
        if (fs.existsSync(outFile)) {
          const earlier = JSON.parse(fs.readFileSync(outFile, "utf8"));
          report.steps = earlier.steps.filter((s) => s.name !== "error");
          report.calls = earlier.calls;
          report.startedAt = earlier.startedAt;
          report.final = earlier.final;
        }
        await reanchorLive();
        report.finishedAt = new Date().toISOString();
        save();
      }
    : main;
entry().then(
  () => console.log(`report: ${outFile}`),
  (error) => {
    step("error", {
      message: error.message,
      stack: String(error.stack).split("\n").slice(0, 6),
    });
    process.exitCode = 1;
  },
);
