// Single-repo delivery through the tick (§4.5 step 10, §6.4–§6.6, proof
// P19): a blocker's close re-projects readiness, a `worker` repository's
// leaves get linked branches and briefs, Avoozl closes no leaf, and a
// Settings edit with a non-default baseBranch is refused.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { FakeGitHub } from "./fake-github.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_singlesinglesing",
  REPO = "example/code",
  SHA = "a".repeat(40),
  BASE = "b".repeat(40);

class DeliveryGitHub extends FakeGitHub {
  constructor() {
    super();
    this.closing = new Map();
    this.branchPulls = new Map();
    this.linked = new Map();
    this.branches = [];
    this.projectionReads = 0;
    this.stateWrites = [];
  }
  updateIssue(repository, number, input) {
    if ("state" in input) this.stateWrites.push(number);
    return super.updateIssue(repository, number, input);
  }
  repository({ owner, repo }) {
    return Promise.resolve({
      node_id: "repo-node",
      full_name: owner + "/" + repo,
      private: true,
      default_branch: "main",
    });
  }
  listIssues(repository, options) {
    this.projectionReads += 1;
    return super.listIssues(repository, options);
  }
  closingPullRequests(_repository, number) {
    return Promise.resolve(structuredClone(this.closing.get(number) || []));
  }
  branchPullRequests(repository, branch) {
    assert.equal(repository, REPO);
    return Promise.resolve(structuredClone(this.branchPulls.get(branch) || []));
  }
  issueLinks(repository, number) {
    assert.equal(repository, REPO);
    return Promise.resolve({
      nodeId: "issue-" + number,
      linkedBranches: structuredClone(this.linked.get(number) || []),
      openBlockedBy: 0,
      totalBlockedBy: 0,
    });
  }
  branchHead(repository, branch) {
    assert.deepEqual([repository, branch], [REPO, "main"]);
    return Promise.resolve({ repositoryId: "R_code", oid: BASE });
  }
  createLinkedBranch(input) {
    this.branches.push(input.name);
    const number = Number(input.issueId.slice("issue-".length)),
      branch = { id: "LB_" + number, name: input.name, repository: REPO };
    this.linked.set(number, [branch]);
    return Promise.resolve(branch);
  }
  checkRuns() {
    return Promise.resolve([]);
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
  // GitHub merges a pull request into main and closes the issue it closes:
  // `Closes #N` in the body, or the issue's linked branch (F51).
  mergeAndClose(issue, headRefName) {
    const pull = {
      number: 100 + issue.number,
      url: `https://example.test/${REPO}/pull/${100 + issue.number}`,
      state: "MERGED",
      title: "Pull " + issue.number,
      body: headRefName.startsWith("avoozl/")
        ? "No keyword"
        : "Closes #" + issue.number,
      merged: true,
      mergedAt: "2026-11-12T10:04:00Z",
      headRefName,
      headRefOid: SHA,
      baseRefName: "main",
      repository: { nameWithOwner: REPO },
      commits: [],
    };
    this.branchPulls.set(headRefName, [pull]);
    this.closing.set(issue.number, [pull]);
    Object.assign(issue, {
      state: "closed",
      state_reason: "completed",
      closed_at: "2026-11-12T10:05:00Z",
      updated_at: "2026-11-12T10:05:00Z",
    });
    this.linked.set(issue.number, []);
  }
}

async function workspace(t, coder) {
  const { store } = fixture(t),
    github = new DeliveryGitHub(),
    root = temporaryDirectory(),
    policy = {
      mode: "single-repo",
      repositories: {
        [REPO]: {
          baseBranch: "main",
          coder,
          allowedActors: ["maintainer"],
          managedLabels: { managed: "agent:managed", ready: "agent:ready" },
        },
      },
    };
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      delivery: { concurrency: 4, runner: "tick" },
      github: policy,
    }),
  );
  store.put("projects", {
    id: "code",
    root: temporaryDirectory(),
    baseBranch: "main",
    worktreeRoot: temporaryDirectory(),
    checks: [],
  });
  const ops = new Operations(store, { github, workspaceRoot: root });
  await ops.execute("github.configure", {
    repository: REPO,
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  const leaf = (id, extra = {}) => ({
    id,
    title: "Task " + id,
    acceptance: [id + " passes"],
    checks: ["npm test"],
    projectId: "code",
    ...extra,
  });
  const plan = await ops.execute("plan.create", {
      id: "chain",
      prompt: "Chain",
      text:
        "# chain\n\n" +
        [
          leaf("one"),
          leaf("two", { requires: [{ task: "one", condition: "integrated" }] }),
          leaf("three", {
            requires: [{ task: "two", condition: "integrated" }],
          }),
        ]
          .map((task) => "```task\n" + JSON.stringify(task) + "\n```\n")
          .join("\n"),
    }),
    approved = await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    });
  await ops.execute("github.project", { planId: plan.id });
  const [one, two, three] = approved.taskIds,
    issueOf = (id) =>
      github.created.find((issue) => issue.body.includes(`"taskId":"${id}"`)),
    readyLabels = () =>
      approved.taskIds.filter((id) =>
        (issueOf(id).labels || []).some(
          (label) => label.name === "agent:ready",
        ),
      ),
    run = () => ops.execute("workspace.tick", { sessions: [] }),
    briefs = (result) =>
      result.dispatch.filter((d) => d.role === "worker").map((d) => d.task);
  return {
    store,
    github,
    ops,
    root,
    policy,
    ids: { one, two, three },
    issueOf,
    readyLabels,
    run,
    briefs,
  };
}

test("a worker repository's leaves get linked branches; each close releases the next in the same tick", async (t) => {
  const { github, ids, issueOf, readyLabels, run, briefs, store } =
    await workspace(t, "worker");
  assert.deepEqual(readyLabels(), [ids.one]);
  let result = await run();
  assert.deepEqual(github.branches, [`avoozl/${ids.one}`]);
  assert.deepEqual(briefs(result), [ids.one]);
  // A quiet graph projects nothing again.
  const reads = github.projectionReads;
  await run();
  assert.equal(github.projectionReads, reads);

  // The first leaf is coded the Issue Radar way: `Closes #N` on another branch.
  github.mergeAndClose(issueOf(ids.one), "issue-radar/one");
  result = await run();
  const task = (id) => store.read().tasks.find((item) => item.id === id);
  assert.equal(task(ids.one).githubVerdict.state, "verified");
  assert.deepEqual(readyLabels(), [ids.two]);
  assert.deepEqual(result.github.projection.projected, ["chain"]);
  assert.deepEqual(github.branches, [`avoozl/${ids.one}`, `avoozl/${ids.two}`]);
  assert.ok(briefs(result).includes(ids.two));
  assert.equal(briefs(result).includes(ids.three), false);

  // The second through its linked branch, with no closing keyword.
  github.mergeAndClose(issueOf(ids.two), `avoozl/${ids.two}`);
  result = await run();
  assert.equal(task(ids.two).githubVerdict.state, "verified");
  assert.deepEqual(readyLabels(), [ids.three]);
  assert.ok(briefs(result).includes(ids.three));
  // GitHub closed both; Avoozl never wrote an issue's state.
  assert.deepEqual(github.stateWrites, []);
  assert.equal(issueOf(ids.three).state, "open");
});

test("an Issue Radar repository gets the ready label moved by the tick and no Avoozl dispatch", async (t) => {
  const { github, ids, issueOf, readyLabels, run, briefs } = await workspace(
    t,
    "issue-radar",
  );
  let result = await run();
  assert.deepEqual(briefs(result), []);
  github.mergeAndClose(issueOf(ids.one), "issue-radar/one");
  result = await run();
  assert.deepEqual(readyLabels(), [ids.two]);
  assert.deepEqual(briefs(result), []);
  assert.deepEqual(github.branches, []);
});

test("an Issue Radar leaf blocked again by a reopened blocker loses the crew's label", async (t) => {
  const { github, ids, issueOf, readyLabels, run } = await workspace(
    t,
    "issue-radar",
  );
  await run();
  github.mergeAndClose(issueOf(ids.one), "issue-radar/one");
  await run();
  assert.deepEqual(readyLabels(), [ids.two]);
  // The blocker is reopened: its done state is withdrawn (R33.10), so the
  // crew's scope label comes off the dependent (R52.7).
  Object.assign(issueOf(ids.one), {
    state: "open",
    state_reason: "reopened",
    closed_at: null,
    updated_at: "2026-11-12T11:00:00Z",
  });
  await run();
  assert.equal(readyLabels().includes(ids.two), false);
});

test("Settings refuses a non-default baseBranch, naming the file and field", async (t) => {
  const { ops, root, policy } = await workspace(t, "worker"),
    filename = path.join(root, ".avoozl.json"),
    before = fs.readFileSync(filename, "utf8"),
    edit = structuredClone(policy);
  edit.repositories[REPO].baseBranch = "develop";
  const field = new RegExp(
    `\\.avoozl\\.json github\\.repositories\\.${REPO.replace("/", "\\/")}\\.baseBranch is develop, but the default branch of ${REPO.replace("/", "\\/")} is main\\.`,
  );
  const checked = await ops.execute("github.settings.validate", {
    github: edit,
  });
  assert.equal(checked.valid, false);
  assert.match(checked.error, field);
  const settings = await ops.execute("github.settings.get", {});
  await assert.rejects(
    ops.execute("github.settings.update", {
      github: edit,
      expectedHash: settings.hash,
    }),
    field,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), before);
  assert.equal(
    (await ops.execute("github.settings.validate", { github: policy })).valid,
    true,
  );
});
