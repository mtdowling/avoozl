// In flight across every Avoozl: the `instance` field of the task marker, the
// name variable an Avoozl publishes in its private mirror, and the Radar claims
// grouped by owning Avoozl. Fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderMarker, parseMarker } from "../github-marker.mjs";
import { publishInstanceStep } from "../instance-publish.mjs";
import {
  assertNoInstance,
  instanceIdentity,
  instanceOfVariable,
  instanceVariableName,
  instanceView,
  renameInstance,
  stripInstance,
} from "../instance.mjs";
import { Operations } from "../operations.mjs";
import { claimsView, refreshClaims } from "../radar-claims.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const MIRA = "inst-00000000a001",
  JUNO = "inst-00000000b002",
  DIGEST = "0".repeat(64);

const marker = (extra = {}) => ({
  version: 2,
  taskId: "t1",
  namespace: "avz_testtesttesttest",
  kind: "leaf",
  source: { commit: null, manifest: DIGEST },
  applied: { title: DIGEST, body: DIGEST, labels: [], blockers: [] },
  ...extra,
});

test("a marker reads with or without instance, and refuses a bad one", () => {
  const old = renderMarker(marker()),
    stamped = renderMarker(marker({ instance: MIRA }));
  assert.equal(parseMarker(old).instance, undefined);
  assert.equal(parseMarker(stamped).instance, MIRA);
  assert.throws(
    () => renderMarker(marker({ instance: "Mira" })),
    /Invalid marker: instance/,
  );
});

test("a public forward strips the instance field and refuses text that carries it", () => {
  const body = renderMarker(marker({ instance: MIRA })) + "\nBody";
  const stripped = stripInstance(body, { id: MIRA, name: "Mira" });
  assert.doesNotMatch(stripped, /instance|inst-/);
  assert.ok(parseMarker(stripped), "the marker still parses");
  assert.throws(
    () => assertNoInstance(body, { id: MIRA, name: "Mira" }),
    /must not carry the instance/,
  );
});

test("variable names round trip to the instance ID", () => {
  assert.equal(
    instanceVariableName("inst-0123456789ab"),
    "AVOOZL_INSTANCE_INST_0123456789AB",
  );
  assert.equal(
    instanceOfVariable("AVOOZL_INSTANCE_INST_0123456789AB"),
    "inst-0123456789ab",
  );
  assert.equal(instanceOfVariable("OTHER"), null);
});

function storeOf(t) {
  const { store } = fixture(t);
  return store;
}

const mirrorPolicy = (mirror = "example/code-mirror") => ({
  repositories: {
    "example/code": { mirror: { source: "example/code", mirror } },
  },
});

function variableGitHub({ isPrivate }) {
  const calls = [];
  return {
    calls,
    available: () => true,
    repository: async () => ({ private: isPrivate }),
    setRepoVariable: async (repository, name, value) =>
      calls.push({ repository, name, value }),
  };
}

test("an Avoozl publishes its name once in a private mirror and again after a rename", async (t) => {
  const store = storeOf(t),
    github = variableGitHub({ isPrivate: true }),
    { id, name } = instanceIdentity(store);
  assert.deepEqual(
    (await publishInstanceStep(store, github, { policy: mirrorPolicy() }))
      .errors,
    [],
  );
  assert.deepEqual(github.calls, [
    {
      repository: "example/code-mirror",
      name: instanceVariableName(id),
      value: name,
    },
  ]);
  await publishInstanceStep(store, github, { policy: mirrorPolicy() });
  assert.equal(github.calls.length, 1, "nothing again for the same name");
  renameInstance(store, "Fresh");
  await publishInstanceStep(store, github, { policy: mirrorPolicy() });
  assert.equal(github.calls.length, 2);
  assert.equal(github.calls[1].value, "Fresh");
});

test("an Avoozl never publishes its name to a public repository", async (t) => {
  const store = storeOf(t),
    github = variableGitHub({ isPrivate: false }),
    first = await publishInstanceStep(store, github, {
      policy: mirrorPolicy(),
    });
  assert.equal(github.calls.length, 0);
  assert.match(first.errors[0], /not private/);
  // The notice comes once, not on every tick.
  const again = await publishInstanceStep(store, github, {
    policy: mirrorPolicy(),
  });
  assert.deepEqual(again.errors, []);
  assert.equal(github.calls.length, 0);
});

// A fake repository with claimed issues, one claim comment each, and the
// name variables of the mirror.
function claimGitHub(store) {
  const own = instanceIdentity(store),
    calls = [],
    issue = (number, instance) => ({
      number,
      title: `Issue ${number}`,
      html_url: `https://github.com/example/code/issues/${number}`,
      updated_at: "2026-01-02T00:00:00Z",
      labels: [{ name: "crew: in progress" }],
      body: instance
        ? renderMarker(marker({ taskId: `t${number}`, instance })) + "\nBody"
        : "A person's issue",
    }),
    issues = [issue(1, MIRA), issue(2, JUNO), issue(3, own.id), issue(4, null)];
  return {
    calls,
    own,
    listIssues: async () => (calls.push("issues"), issues),
    listIssueComments: async (_repository, number) => (
      calls.push(`comments ${number}`),
      [
        {
          id: number,
          created_at: "2026-01-01T00:00:00Z",
          body: `👻 **Draco**\nimplementing\n<!-- kirocrew-crew v=1 id=c_draco phase=implementing pr= updated=2026-01-01T01:00:00Z -->`,
        },
      ]
    ),
    listRepoVariables: async () => (
      calls.push("variables"),
      [
        { name: instanceVariableName(MIRA), value: "Mira" },
        { name: instanceVariableName(JUNO), value: "Juno" },
        { name: "UNRELATED", value: "x" },
      ]
    ),
  };
}

const claimPolicy = {
  mode: "single-repo",
  repositories: {
    "example/code": {
      crewLabels: { claim: "crew: in progress" },
      mirror: { source: "example/code", mirror: "example/code-mirror" },
    },
  },
};

test("claims group by owning Avoozl, with a No Avoozl group for a missing marker", async (t) => {
  const store = storeOf(t),
    github = claimGitHub(store);
  await refreshClaims(store, github, claimPolicy, { force: true });
  const { groups } = claimsView(store);
  assert.deepEqual(
    groups.map((group) => [group.name, group.rows.map((row) => row.number)]),
    [
      [github.own.name, [3]],
      ["Juno", [2]],
      ["Mira", [1]],
      ["No Avoozl", [4]],
    ],
  );
  assert.equal(groups.at(-1).instanceId, null);
  const [row] = groups[2].rows;
  assert.equal(row.instanceId, MIRA);
  assert.equal(row.claimedAt, "2026-01-01T00:00:00Z");
  assert.equal(row.issueUpdatedAt, "2026-01-02T00:00:00Z");
  // Another Avoozl's marker was read, so the header may show the name.
  assert.deepEqual(instanceView(store).others.sort(), [MIRA, JUNO].sort());
});

test("a read costs one list, one comment read per claim and one variable list", async (t) => {
  const store = storeOf(t),
    github = claimGitHub(store);
  await refreshClaims(store, github, claimPolicy, { force: true });
  assert.deepEqual(github.calls.sort(), [
    "comments 1",
    "comments 2",
    "comments 3",
    "comments 4",
    "issues",
    "variables",
  ]);
});

test("a second look within the cache age makes no GitHub call", async (t) => {
  const store = storeOf(t),
    github = claimGitHub(store);
  await refreshClaims(store, github, claimPolicy, { force: true });
  const before = github.calls.length;
  await refreshClaims(store, github, claimPolicy);
  claimsView(store);
  assert.equal(github.calls.length, before);
});

test("an unreadable variable list leaves the ID as the group name", async (t) => {
  const store = storeOf(t),
    github = {
      ...claimGitHub(store),
      listRepoVariables: async () => {
        throw new Error("no access");
      },
    };
  await refreshClaims(store, github, claimPolicy, { force: true });
  assert.ok(claimsView(store).groups.some((group) => group.name === MIRA));
});

test("projection stamps the projecting Avoozl's ID in the task marker", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_testtesttesttest",
      github: {
        mode: "single-repo",
        repositories: { "example/code": { baseBranch: "main" } },
      },
    }),
  );
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/code-worktrees",
    checks: [["npm", "test"]],
  });
  await ops.execute("github.configure", {
    repository: "example/code",
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  const plan = await ops.execute("plan.create", {
    id: "stamp",
    prompt: "Project stamp",
    text:
      "# stamp\n\n```task\n" +
      JSON.stringify({
        id: "stamp-leaf",
        title: "Stamp leaf",
        acceptance: ["passes"],
        projectId: "code",
      }) +
      "\n```\n",
  });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  await ops.execute("github.project", { planId: plan.id });
  const issue = github.created.find((entry) =>
    /avoozl-task/.test(entry.body ?? ""),
  );
  assert.equal(parseMarker(issue.body).instance, instanceIdentity(store).id);
});
