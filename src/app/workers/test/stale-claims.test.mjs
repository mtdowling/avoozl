// Stale claims in Needs you (simplify sim-1.3, SM2.4, §D3): a claim branch
// whose newest commit is older than `claims.staleHours` gives one Needs you
// row for the spec issue's assignee; only a person deletes it, as the
// high-risk claim-delete job behind the confirm and the CLI prompt.
import assert from "node:assert/strict";
import test from "node:test";
import { Store } from "../../store/store.mjs";
import { Operations } from "../../api/operations.mjs";
import { commands } from "../../commands/delivery.mjs";
import { JOBS } from "../../github/github-jobs.mjs";
import { claimsNeedsYou, refreshClaims, staleClaims } from "../claims.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { mcpRefusal } from "../../mcp/mcp-policy.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import path from "node:path";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

// GitHub with claim branches whose heads have the given ages, recording
// every commit read and every delete.
function fakeGitHub(heads) {
  const calls = { commit: [], delete: [] };
  return {
    calls,
    async branchesUnder(repository, prefix) {
      return Object.entries(heads[repository] ?? {})
        .filter(([branch]) => branch.startsWith(prefix))
        .map(([branch, h]) => ({
          ref: `refs/heads/${branch}`,
          object: { sha: `${branch}@${h}` },
        }));
    },
    async commit(repository, sha) {
      calls.commit.push(sha);
      return {
        commit: { committer: { date: hoursAgo(Number(sha.split("@")[1])) } },
      };
    },
    async deleteBranch(repository, branch) {
      calls.delete.push(`${repository} ${branch}`);
      return null;
    },
  };
}

function workspace(t) {
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

const HEADS = {
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

test("Avoozl deletes no claim branch on its own: reads and Needs you leave them all", async (t) => {
  const { root, store } = workspace(t),
    github = fakeGitHub(HEADS),
    ops = new Operations(store, { workspaceRoot: root, github });
  await refreshClaims(store, github);
  const view = await ops.execute("conflicts.view", {});
  assert.ok(view.items.some((item) => item.reason === "stale-claim"));
  assert.deepEqual(github.calls.delete, []);
});

test("claim.delete is a person's: refused over MCP, and deletes only a claim branch of a registered repository", async (t) => {
  const { root, store } = workspace(t),
    github = fakeGitHub(HEADS),
    ops = new Operations(store, { workspaceRoot: root, github });
  await refreshClaims(store, github);
  assert.ok(mcpRefusal("claim.delete", {}), "refused over MCP");
  await assert.rejects(
    ops.execute("claim.delete", { repository: "o/app", branch: "main" }),
    /Name a claim branch/,
  );
  await assert.rejects(
    ops.execute("claim.delete", {
      repository: "o/elsewhere",
      branch: "avoozl/search/s-1",
    }),
    /not a repository in this workspace/,
  );
  assert.deepEqual(
    await ops.execute("claim.delete", {
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
  const claim = commands.find((c) => c.command === "claim"),
    calls = [],
    localOrRequest = async (name, input) => {
      calls.push([name, input]);
      return name === "github.job.confirm"
        ? { grants: ["g1"] }
        : { deleted: input.branch };
    },
    need = (value, usage) => {
      if (!value) throw Error(usage);
      return value;
    },
    args = (options) => ({
      options,
      positionals: ["delete", "o/app", "avoozl/search/s-1"],
      localOrRequest,
      need,
      env: {},
    });
  const stdin = process.stdin.isTTY;
  process.stdin.isTTY = false;
  try {
    await assert.rejects(
      claim.run(args({})),
      /run in a terminal, or add --yes/,
    );
  } finally {
    process.stdin.isTTY = stdin;
  }
  assert.deepEqual(calls, []);
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
  assert.equal(calls[0][1].steps[0].job, "claim-delete");
  assert.deepEqual(calls[1][1], {
    repository: "o/app",
    branch: "avoozl/search/s-1",
    allow: ["g1"],
  });
});
