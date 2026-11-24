// Stale claims in Needs you: a claim branch
// whose newest commit and lease are older than `claims.staleHours` gives one
// Needs you row for the spec issue's assignee; only a person deletes it, as
// the high-risk claim-delete job behind the confirm and the CLI prompt. And
// the leases (workflow rule 15): the lease commit, renewal, the claims a
// rebuilt cache knows as this runner's, and resuming a claim.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Store } from "../../store/store.ts";
import { Operations } from "../../api/operations.ts";
import { commands } from "../../commands/delivery.ts";
import { JOBS } from "../../github/github-jobs.ts";
import { claimDispatches } from "../runner.ts";
import {
  claimFirst,
  claimOf,
  heldTaskIds,
  claimsNeedsYou,
  claimsView,
  leaseSigner,
  refreshClaims,
  renewLeases,
  resumable,
  resumeClaim,
  runnerId,
  staleClaims,
} from "../claims.ts";
import { git } from "../../git/git.ts";
import fs from "node:fs";
import { snapshot } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import path from "node:path";
import { commandContext } from "../../test/command-context.ts";
import { found, type ConflictsView } from "../../test/view-shapes.ts";

// Claim branch heads by repository, each with its age in hours.
type Heads = Record<string, Record<string, number>>;
// An operation the claim command asked for, with its input.
type Asked = [string, { steps?: { job: string }[]; [key: string]: unknown }];

const NOW = Date.parse("2026-11-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString();

// GitHub with claim branches whose heads have the given ages, recording
// every commit read and every delete.
function fakeGitHub(heads: Heads) {
  const calls: { commit: string[]; delete: string[] } = {
    commit: [],
    delete: [],
  };
  return {
    calls,
    async branchesUnder(repository: string, prefix: string) {
      return Object.entries(heads[repository] ?? {})
        .filter(([branch]) => branch.startsWith(prefix))
        .map(([branch, h]) => ({
          ref: `refs/heads/${branch}`,
          object: { sha: `${branch}@${h}` },
        }));
    },
    async commit(_repository: string, sha: string) {
      calls.commit.push(sha);
      return {
        commit: { committer: { date: hoursAgo(Number(sha.split("@")[1])) } },
      };
    },
    async deleteBranch(repository: string, branch: string) {
      calls.delete.push(`${repository} ${branch}`);
      return null;
    },
  };
}

function workspace(t: TestContext) {
  const root = temporaryDirectory("avoozl-stale-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize(snapshot());
  store.put("repositories", {
    id: "app",
    github: "o/app",
    claims: { staleHours: 6 },
  });
  store.put("repositories", { id: "web", github: "o/web" });
  return { root, store };
}

const HEADS: Heads = {
  "o/app": {
    "avoozl/search/s-1": 10,
    "avoozl/search/s-2": 2,
    "avoozl-lease/search/s-1/1": 10,
    "avoozl-lease/search/s-1/2": 10,
  },
  "o/web": { "avoozl/search/w-1": 10, "avoozl/other/w-2": 30 },
};

test("a claim branch older than its repository's staleHours (default 24) gives one Needs you row for the spec issue's assignee", async (t) => {
  const { store } = workspace(t),
    github = fakeGitHub(HEADS);
  assert.deepEqual(await refreshClaims(store, github), []);
  assert.deepEqual(
    staleClaims(store, NOW).map((c) => [c.branch, c.hours, c.ageHours]),
    [
      ["avoozl/other/w-2", 24, 30],
      ["avoozl/search/s-1", 6, 10],
    ],
    "oldest stale first",
  );
  const [web, app] = claimsNeedsYou(store, NOW);
  assert.equal(app.id, "stale-claim:o/app:avoozl/search/s-1");
  assert.equal(app.reason, "stale-claim");
  assert.match(app.detail, /^For the spec issue's assignee: /);
  assert.match(app.detail, /Avoozl deletes no other runner's claim branch/);
  assert.equal(app.openedAt, hoursAgo(4));
  assert.match(web.detail, /^For the spec issue's assignee: /);
  // Delete branch is the high-risk claim-delete job, behind the confirm.
  const [action] = app.actions;
  assert.equal(action.operation, "claim.delete");
  assert.deepEqual(action.input, {
    repository: "o/app",
    branch: "avoozl/search/s-1",
  });
  assert.equal(action.confirm[0].job, "claim-delete");
  assert.equal(action.confirm[0].risk, "high");
  assert.equal(JOBS["claim-delete"].risk, "high");
  // Each head's time is read once; a later read reuses it.
  const read = github.calls.commit.length;
  await refreshClaims(store, github);
  assert.equal(github.calls.commit.length, read);
});

test("claims.view lists every claim branch with its holder, head, age and whether it is stale", async (t) => {
  const { root, store } = workspace(t),
    github = fakeGitHub(HEADS),
    ops = new Operations(store, { workspaceRoot: root, github });
  await refreshClaims(store, github);
  assert.deepEqual(
    claimsView(store, NOW).map((c) => [
      c.repository,
      c.branch,
      c.holder,
      c.head,
      c.ageHours,
      c.stale,
    ]),
    [
      [
        "o/web",
        "avoozl/other/w-2",
        "another runner",
        "avoozl/other/w-2@30",
        30,
        true,
      ],
      [
        "o/app",
        "avoozl/search/s-1",
        "another runner",
        "avoozl/search/s-1@10",
        10,
        true,
      ],
      [
        "o/app",
        "avoozl/search/s-2",
        "another runner",
        "avoozl/search/s-2@2",
        2,
        false,
      ],
      [
        "o/web",
        "avoozl/search/w-1",
        "another runner",
        "avoozl/search/w-1@10",
        10,
        false,
      ],
    ],
  );
  const { claims } = await ops.execute<{ claims: unknown[] }>(
    "claims.view",
    {},
  );
  assert.equal(claims.length, 4);
});

test("Avoozl deletes no claim branch on its own: reads and Needs you leave them all", async (t) => {
  const { root, store } = workspace(t),
    github = fakeGitHub(HEADS),
    ops = new Operations(store, { workspaceRoot: root, github });
  await refreshClaims(store, github);
  const view = await ops.execute<ConflictsView>("conflicts.view", {});
  assert.ok(view.items.some((item) => item.reason === "stale-claim"));
  assert.deepEqual(github.calls.delete, []);
});

test("claim.delete needs confirm, and deletes only a claim branch of a registered repository", async (t) => {
  const { root, store } = workspace(t),
    github = fakeGitHub(HEADS),
    ops = new Operations(store, { workspaceRoot: root, github });
  await refreshClaims(store, github);
  await assert.rejects(
    ops.execute("claim.delete", {
      repository: "o/app",
      branch: "avoozl/search/s-1",
    }),
    /Pass confirm: true/,
  );
  await assert.rejects(
    ops.execute("claim.delete", {
      confirm: true,
      repository: "o/app",
      branch: "main",
    }),
    /Name a claim branch/,
  );
  await assert.rejects(
    ops.execute("claim.delete", {
      confirm: true,
      repository: "o/elsewhere",
      branch: "avoozl/search/s-1",
    }),
    /not a repository in this workspace/,
  );
  assert.deepEqual(
    await ops.execute("claim.delete", {
      confirm: true,
      repository: "o/app",
      branch: "avoozl/search/s-1",
    }),
    { deleted: "avoozl/search/s-1", repository: "o/app" },
  );
  // The task's leases go with it, every generation (workflow rule 15.6).
  assert.deepEqual(github.calls.delete, [
    "o/app avoozl-lease/search/s-1/1",
    "o/app avoozl-lease/search/s-1/2",
    "o/app avoozl/search/s-1",
  ]);
  assert.ok(
    !claimsNeedsYou(store, NOW).some((item) =>
      item.id.endsWith("avoozl/search/s-1"),
    ),
    "the deleted claim leaves Needs you",
  );
});

test("avoozl claim delete asks Allow? first, and deletes nothing without a yes", async () => {
  const claim = found(commands.find((c) => c.command === "claim")),
    calls: Asked[] = [],
    answer = (name: string, input: Asked[1]) => {
      calls.push([name, input]);
      return name === "github.job.confirm"
        ? { grants: ["g1"] }
        : { deleted: input.branch };
    },
    args = (options: Record<string, true>) =>
      commandContext({
        options,
        positionals: ["delete", "o/app", "avoozl/search/s-1"],
        answer,
      });
  const stdin = process.stdin.isTTY;
  process.stdin.isTTY = false;
  try {
    await assert.rejects(
      async () => claim.run(args({})),
      /run in a terminal, or add --yes/,
    );
  } finally {
    process.stdin.isTTY = stdin;
  }
  assert.equal(calls.length, 0);
  const log = console.log,
    stderr = process.stderr.write;
  console.log = () => {};
  process.stderr.write = () => true;
  try {
    await claim.run(args({ yes: true }));
  } finally {
    console.log = log;
    process.stderr.write = stderr;
  }
  assert.deepEqual(
    calls.map(([name]) => name),
    ["github.job.confirm", "claim.delete"],
  );
  assert.equal(calls[0]?.[1].steps?.[0]?.job, "claim-delete");
  assert.deepEqual(calls[1][1], {
    repository: "o/app",
    branch: "avoozl/search/s-1",
    allow: ["g1"],
    confirm: true,
  });
});

// ---- Leases (workflow rule 15) ----

// A commit the lease fake holds.
type FakeCommit = {
  tree: string;
  parents: string[];
  message: string;
  date: string;
};

// GitHub with commits and refs: claim branches at a base 30 hours old, and
// lease commits on them. New commits are dated `NOW`; a ref moves only as a
// fast-forward.
function leaseGitHub() {
  const commits = new Map<string, FakeCommit>(),
    refs = new Map<string, string>(),
    moves: string[] = [];
  let made = 0;
  const make = (body: Omit<FakeCommit, "date">, date = hoursAgo(0)) => {
    const sha = `c${++made}`.padEnd(40, "0");
    commits.set(sha, { ...body, date });
    return sha;
  };
  const base = make(
    { tree: "t0", parents: [], message: "Start" },
    hoursAgo(30),
  );
  refs.set("main", base);
  return {
    base,
    commits,
    refs,
    moves,
    // A claim on `task` of the parser spec at the base, with lease 1 of the
    // given age naming `runner`.
    claim(
      task: string,
      {
        runner,
        hours,
        released = false,
      }: {
        runner: string;
        hours: number;
        released?: boolean;
      },
    ) {
      refs.set(`avoozl/parser/${task}`, base);
      refs.set(
        `avoozl-lease/parser/${task}/1`,
        make(
          {
            tree: "t0",
            parents: [base],
            message: `${released ? "Release" : "Lease"} parser/${task} generation 1\n\nStart: ${base}\nTask: ${task}\nRunner: ${runner}`,
          },
          hoursAgo(hours),
        ),
      );
    },
    async branch(_repository: string, name: string) {
      const sha = refs.get(name);
      if (!sha) throw Object.assign(Error("Branch not found"), { status: 404 });
      return { commit: { sha } };
    },
    async branchesUnder(_repository: string, prefix: string) {
      return [...refs]
        .filter(([name]) => name.startsWith(prefix))
        .map(([name, sha]) => ({ ref: `refs/heads/${name}`, object: { sha } }));
    },
    async commit(_repository: string, sha: string) {
      const commit = commits.get(sha);
      return commit
        ? {
            commit: {
              committer: { date: commit.date },
              message: commit.message,
              tree: { sha: commit.tree },
            },
          }
        : null;
    },
    async createCommit(_repository: string, body: Omit<FakeCommit, "date">) {
      return { sha: make(body) };
    },
    async createBranch(_repository: string, name: string, sha: string) {
      if (refs.has(name))
        throw Object.assign(Error("Reference already exists"), {
          status: 422,
        });
      refs.set(name, sha);
    },
    // The loop pass catches no integration branch up here.
    async compareCommits() {
      return { ahead_by: 0 };
    },
    async mergeBranch() {
      throw Error("No integration branch merges here.");
    },
    async moveBranch(_repository: string, name: string, sha: string) {
      if (!commits.get(sha)?.parents.includes(refs.get(name) ?? ""))
        throw Object.assign(Error("Update is not a fast forward"), {
          status: 422,
        });
      refs.set(name, sha);
      moves.push(name);
    },
  };
}

// A parser task in the repository `app`.
const leaf = (id: string) => ({
  id,
  title: `Task ${id}`,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  checks: ["npm test"],
  repository: "app",
  planId: "parser",
});

// A workspace whose one repository has a checkout, so it has a runner ID.
async function leaseWorkspace(t: TestContext, tasks: string[] = []) {
  const root = temporaryDirectory("avoozl-lease-"),
    checkout = path.join(root, "app"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.mkdirSync(checkout);
  await git(checkout, ["init", "-q"]);
  store.initialize({ ...snapshot(), tasks: tasks.map(leaf), edges: [] });
  store.put("repositories", {
    id: "app",
    root: checkout,
    github: "o/app",
    claims: { staleHours: 6 },
  });
  return { store, checkout, runner: String(await runnerId(checkout)) };
}

test("a claim's lease commit sits on the claim head and records the start, the task text, the runner and the label event", async (t) => {
  const { checkout, runner } = await leaseWorkspace(t),
    github = leaseGitHub(),
    claimed = await claimFirst(
      github,
      [
        {
          task: {
            id: "p-2",
            planId: "parser",
            title: "Report unknown tokens",
            acceptance: ["An unknown token is reported\n  with its line"],
            labeledIssue: {
              number: 12,
              event: { id: "98765", createdAt: hoursAgo(1) },
            },
          },
          repository: { github: "o/app", root: checkout },
        },
      ],
      { baseOf: () => "main" },
    );
  assert.equal(claimed?.lease, "avoozl-lease/parser/p-2/1");
  assert.equal(github.refs.get("avoozl/parser/p-2"), github.base);
  const lease = found(
    github.commits.get(found(github.refs.get("avoozl-lease/parser/p-2/1"))),
  );
  assert.deepEqual([lease.parents, lease.tree], [[github.base], "t0"]);
  assert.equal(
    lease.message,
    [
      "Lease parser/p-2 generation 1",
      "",
      `Start: ${github.base}`,
      "Task: Report unknown tokens",
      "Done: An unknown token is reported with its line",
      `Runner: ${runner}`,
      "Issue #12 label event 98765",
    ].join("\n"),
  );
});

test("a rebuilt cache knows this runner's claims by their leases, and a fresh lease on a quiet base is not stale", async (t) => {
  const { store, runner } = await leaseWorkspace(t),
    github = leaseGitHub();
  github.claim("p-2", { runner, hours: 1 });
  github.claim("p-3", { runner: "runner-other", hours: 1 });
  github.claim("p-4", { runner: "runner-other", hours: 1, released: true });
  github.claim("p-5", { runner: "runner-other", hours: 10 });
  // An empty cache, as after avoozl rebuild.
  assert.deepEqual(await refreshClaims(store, github), []);
  const claim = (task: string) => found(claimOf(store, "o/app", task));
  assert.deepEqual(
    ["p-2", "p-3", "p-4", "p-5"].map((task) => Boolean(claim(task).own)),
    [true, false, false, false],
  );
  // Every head is 30 hours old; only p-5's lease is older than 6 hours.
  assert.deepEqual(
    staleClaims(store, NOW).map((c) => c.task),
    ["p-5"],
  );
  assert.deepEqual(
    ["p-2", "p-3", "p-4", "p-5"].map((task) => resumable(claim(task), 6, NOW)),
    [false, false, true, true],
  );
});

test("this runner renews its own leases once half the stale hours pass, with the same message", async (t) => {
  const { store, runner } = await leaseWorkspace(t),
    github = leaseGitHub();
  github.claim("p-2", { runner, hours: 4 });
  github.claim("p-3", { runner, hours: 2 });
  github.claim("p-4", { runner: "runner-other", hours: 4 });
  await refreshClaims(store, github);
  const old = found(github.refs.get("avoozl-lease/parser/p-2/1"));
  assert.deepEqual(await renewLeases(store, github, NOW), []);
  assert.deepEqual(github.moves, ["avoozl-lease/parser/p-2/1"]);
  const renewed = found(
    github.commits.get(found(github.refs.get("avoozl-lease/parser/p-2/1"))),
  );
  assert.deepEqual(renewed.parents, [old]);
  assert.equal(renewed.message, found(github.commits.get(old)).message);
  // The cache keeps the renewed lease, so the next pass renews nothing.
  await renewLeases(store, github, NOW);
  assert.equal(github.moves.length, 1);
});

test("resuming a released claim takes the next lease with the same start, then moves the claim past a takeover commit", async (t) => {
  const { store, checkout, runner } = await leaseWorkspace(t),
    github = leaseGitHub();
  github.claim("p-4", { runner: "runner-other", hours: 1, released: true });
  await refreshClaims(store, github);
  const claim = found(claimOf(store, "o/app", "p-4")),
    task = { id: "p-4", planId: "parser" },
    resumed = await resumeClaim(github, {
      repository: "o/app",
      claim,
      task,
      signer: await leaseSigner(checkout),
    });
  assert.equal(resumed?.lease.ref, "avoozl-lease/parser/p-4/2");
  const lease = found(
    github.commits.get(found(github.refs.get("avoozl-lease/parser/p-4/2"))),
  );
  assert.match(lease.message, new RegExp(`^Start: ${github.base}$`, "m"));
  assert.match(lease.message, new RegExp(`^Runner: ${runner}$`, "m"));
  const takeover = found(
    github.commits.get(found(github.refs.get("avoozl/parser/p-4"))),
  );
  assert.equal(resumed?.head, github.refs.get("avoozl/parser/p-4"));
  assert.deepEqual(
    [takeover.parents, takeover.tree, takeover.message],
    [[github.base], "t0", "Take over avoozl/parser/p-4"],
  );
  // A second runner that read the same claim finds the lease moved.
  assert.equal(
    await resumeClaim(github, {
      repository: "o/app",
      claim,
      task,
      signer: { runner: "runner-other" },
    }),
    null,
  );
  assert.equal(github.refs.has("avoozl-lease/parser/p-4/3"), false);
});

test("the loop pass works this runner's claims after a rebuild, resumes a released one, and leaves a live one held", async (t) => {
  const { store, checkout } = await leaseWorkspace(t, ["p-2", "p-3", "p-4"]),
    runner = String(await runnerId(checkout)),
    github = leaseGitHub(),
    origin = path.join(path.dirname(checkout), "origin.git");
  github.claim("p-2", { runner, hours: 1 });
  github.claim("p-3", { runner: "runner-other", hours: 1 });
  github.claim("p-4", { runner: "runner-other", hours: 1, released: true });
  // Origin's git holds the claim branch the takeover brings down.
  await git(checkout, ["config", "user.name", "Test"]);
  await git(checkout, ["config", "user.email", "test@example.com"]);
  await git(checkout, ["commit", "-q", "--allow-empty", "-m", "Start"]);
  await git(checkout, ["clone", "-q", "--bare", checkout, origin]);
  await git(checkout, ["remote", "add", "origin", origin]);
  await git(checkout, [
    "push",
    "-q",
    "origin",
    "HEAD:refs/heads/avoozl/parser/p-4",
  ]);
  await refreshClaims(store, github);
  assert.deepEqual([...heldTaskIds(store, NOW)], ["p-3"]);
  const out = await claimDispatches(
    store,
    github,
    [
      { task: "p-2", role: "worker" },
      { task: "p-3", role: "worker" },
      { task: "p-4", role: "worker" },
    ],
    { now: NOW },
  );
  assert.deepEqual(out.errors, []);
  assert.deepEqual(
    out.dispatches.map((d) => d.task),
    ["p-2", "p-4"],
  );
  assert.equal(claimOf(store, "o/app", "p-4")?.own, true);
  assert.equal(github.refs.has("avoozl-lease/parser/p-4/2"), true);
  assert.equal(github.refs.has("avoozl-lease/parser/p-2/2"), false);
  assert.equal(
    await git(checkout, [
      "rev-parse",
      "--verify",
      "refs/heads/avoozl/parser/p-4",
    ]),
    await git(checkout, ["rev-parse", "origin/avoozl/parser/p-4"]),
    "the local claim branch is made at origin's head",
  );
});
