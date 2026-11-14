// Settings view for the GitHub policy in `.avoozl.json` (task 3.13): load,
// validate and save through Operations. Without an available GitHub client
// nothing calls GitHub; with one, the default-branch check reads it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { principalAllows } from "../app-backend.mjs";
import {
  newTaskAuthority,
  normalizeGitHubPolicy,
  readGitHubPolicy,
} from "../github-policy.mjs";
import { Operations } from "../operations.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { fixture } from "./fixtures.mjs";

const noGitHub = new Proxy(
  { available: () => false },
  {
    get(target, key) {
      if (key === "available") return target.available;
      throw Error("Settings must not call GitHub.");
    },
  },
);

const POLICY = {
  mode: "plans-repo",
  planningRepository: "example/plans",
  defaultAuthority: "github",
  project: {
    owner: "example",
    number: 7,
    fields: {
      status: "Status",
      release: "Release",
      wave: "Wave",
      iteration: null,
    },
    statusValues: {
      todo: "Todo",
      inProgress: "In progress",
      done: "Done",
      deferred: "Deferred",
    },
  },
  epicIssueType: "Epic",
  repositories: {
    "example/app": {
      baseBranch: "main",
      coder: "worker",
      allowedActors: ["maintainer"],
      minimumPermission: "maintain",
      managedLabels: { managed: "agent:managed", ready: "agent:ready" },
      rules: [
        {
          id: "build",
          action: "deliver",
          labelsAll: ["agent:build"],
          labelsNone: ["agent:paused"],
          assignee: "maintainer",
        },
        { id: "pause", action: "pause", labelsAny: ["agent:paused"] },
      ],
    },
  },
};

function workspace(t, { file, server = false } = {}) {
  const { root, store } = fixture(t),
    filename = path.join(root, ".avoozl.json");
  if (file) fs.writeFileSync(filename, JSON.stringify(file, null, 2) + "\n");
  const configuration = server
      ? new RepositorySettings(store, { workspaceRoot: root })
      : undefined,
    ops = new Operations(store, {
      github: noGitHub,
      workspaceRoot: root,
      configuration,
    });
  return { root, store, ops, filename };
}

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));

test("an empty workspace loads empty GitHub settings with the default policy", async (t) => {
  const { ops } = workspace(t),
    settings = await ops.execute("github.settings.get");
  assert.equal(settings.exists, false);
  assert.equal(settings.hash, null);
  assert.deepEqual(settings.github, {});
  assert.equal(settings.error, null);
  assert.equal(settings.effective.mode, null);
  assert.equal(settings.effective.defaultAuthority, "local");
  assert.deepEqual(settings.choices.modes, [
    "local",
    "plans-repo",
    "single-repo",
  ]);
  assert.ok(settings.choices.actions.includes("quarantine"));
  assert.deepEqual(settings.choices.statusValues, [
    "todo",
    "inProgress",
    "done",
    "deferred",
  ]);
});

for (const server of [false, true])
  test(`save and load round-trip the policy and keep other settings (${server ? "server" : "app backend"})`, async (t) => {
    const { ops, root, filename } = workspace(t, {
        server,
        file: {
          version: 1,
          namespace: "avz_0123456789abcdef",
          conversations: { autoArchiveCompleted: false },
          github: {
            issueIntake: {},
            mode: "single-repo",
            repositories: {
              "example/old": { baseBranch: "main" },
            },
          },
        },
      }),
      before = await ops.execute("github.settings.get");
    assert.equal(before.github.mode, "single-repo");
    const saved = await ops.execute("github.settings.update", {
      github: POLICY,
      expectedHash: before.hash,
    });
    assert.notEqual(saved.hash, before.hash);
    assert.equal(saved.error, null);
    assert.equal(saved.effective.mode, "plans-repo");
    assert.equal(saved.effective.project.statusValues.deferred, "Deferred");
    assert.equal(
      saved.effective.repositories["example/app"].minimumPermission,
      "maintain",
    );
    // `iteration: null` is a cleared field, kept as written.
    assert.deepEqual(saved.github.project, POLICY.project);
    assert.deepEqual(
      Object.keys(saved.github.repositories),
      ["example/app"],
      "the edit replaces the repository list",
    );
    const file = readJson(filename);
    assert.equal(file.namespace, "avz_0123456789abcdef");
    assert.deepEqual(file.conversations, { autoArchiveCompleted: false });
    assert.deepEqual(file.github.issueIntake, {});
    assert.equal(readGitHubPolicy(root).planningRepository, "example/plans");
    const again = await ops.execute("github.settings.get");
    assert.equal(again.hash, saved.hash);
    assert.deepEqual(again.github, saved.github);
  });

test("clearing a setting removes it and an empty block removes github", async (t) => {
  const { ops, filename } = workspace(t, {
      file: { version: 1, github: { mode: "single-repo" } },
    }),
    before = await ops.execute("github.settings.get"),
    saved = await ops.execute("github.settings.update", {
      github: { mode: null, epicIssueType: null },
      expectedHash: before.hash,
    });
  assert.deepEqual(saved.github, {});
  assert.equal(Object.hasOwn(readJson(filename), "github"), false);
  assert.equal(saved.effective.mode, null);
});

test("a stale hash is refused and the file is unchanged", async (t) => {
  const { ops, filename } = workspace(t, {
      file: { version: 1, github: { mode: "single-repo" } },
    }),
    text = fs.readFileSync(filename, "utf8");
  await assert.rejects(
    ops.execute("github.settings.update", {
      github: POLICY,
      expectedHash: "stale",
    }),
    (error) =>
      error.status === 409 && /reload before saving/.test(error.message),
  );
  assert.equal(fs.readFileSync(filename, "utf8"), text);
});

const repository = (change) => ({
  ...POLICY,
  repositories: {
    "example/app": { ...POLICY.repositories["example/app"], ...change },
  },
});

const INVALID = [
  [
    "plans-repo without a planning repository",
    { ...POLICY, planningRepository: null },
    /plans-repo needs github.planningRepository/,
  ],
  [
    "github authority with no mode",
    { defaultAuthority: "github" },
    /defaultAuthority github needs a github.mode/,
  ],
  [
    "an unknown Status value key",
    {
      ...POLICY,
      project: { ...POLICY.project, statusValues: { ready: "Ready" } },
    },
    /Unknown setting github.project.statusValues.ready/,
  ],
  [
    "an unknown Project field key",
    { ...POLICY, project: { ...POLICY.project, fields: { size: "Size" } } },
    /Unknown setting github.project.fields.size/,
  ],
  [
    "a Project with no number",
    { ...POLICY, project: { owner: "example" } },
    /project.number must be a positive whole number/,
  ],
  [
    "an unknown rule action",
    repository({
      rules: [{ id: "x", action: "merge", labelsAll: ["agent:x"] }],
    }),
    /action must be one of/,
  ],
  [
    "a trigger label that is a managed label",
    repository({
      rules: [{ id: "x", action: "deliver", labelsAll: ["agent:ready"] }],
    }),
    /uses managed label agent:ready as a trigger/,
  ],
  [
    "an unknown minimum permission",
    repository({ minimumPermission: "owner" }),
    /minimumPermission must be one of/,
  ],
  [
    "an unknown coder",
    repository({ coder: "crew" }),
    /coder must be issue-radar, worker or remote/,
  ],
  [
    "a repository with no base branch under a mode",
    repository({ baseBranch: null }),
    /baseBranch must name the repository's default branch/,
  ],
  ["an unknown key", { ...POLICY, queue: {} }, /Unknown setting github.queue/],
];

for (const [label, github, message] of INVALID)
  test(`validation refuses ${label} without writing`, async (t) => {
    const { ops, filename } = workspace(t, {
        file: { version: 1, github: { mode: "single-repo" } },
      }),
      text = fs.readFileSync(filename, "utf8"),
      before = await ops.execute("github.settings.get"),
      checked = await ops.execute("github.settings.validate", { github });
    assert.equal(checked.valid, false);
    assert.match(checked.error, message);
    await assert.rejects(
      ops.execute("github.settings.update", {
        github,
        expectedHash: before.hash,
      }),
      message,
    );
    assert.equal(fs.readFileSync(filename, "utf8"), text);
  });

test("validate accepts a full policy and an empty rule list", async (t) => {
  const { ops } = workspace(t),
    checked = await ops.execute("github.settings.validate", {
      github: POLICY,
    });
  assert.equal(checked.valid, true);
  assert.equal(checked.policy.repositories["example/app"].rules.length, 2);
  const empty = await ops.execute("github.settings.validate", {
    github: repository({ rules: [] }),
  });
  assert.equal(empty.valid, true);
});

test("an invalid file is shown as an error and can be fixed from Settings", async (t) => {
  const { ops } = workspace(t, {
      file: { version: 1, github: { mode: "plans-repo" } },
    }),
    broken = await ops.execute("github.settings.get");
  assert.equal(broken.effective, null);
  assert.match(broken.error, /plans-repo needs github.planningRepository/);
  assert.equal(broken.github.mode, "plans-repo");
  const fixed = await ops.execute("github.settings.update", {
    github: { ...broken.github, planningRepository: "example/plans" },
    expectedHash: broken.hash,
  });
  assert.equal(fixed.error, null);
  assert.equal(fixed.effective.planningRepository, "example/plans");
});

test("the raw configuration editor refuses an invalid GitHub policy", async (t) => {
  const { ops, filename } = workspace(t, {
      server: true,
      file: { version: 1 },
    }),
    text = fs.readFileSync(filename, "utf8"),
    current = await ops.execute("configuration.get", { scope: "repository" });
  await assert.rejects(
    ops.execute("configuration.update", {
      scope: "repository",
      expectedHash: current.hash,
      text: JSON.stringify({ version: 1, github: { mode: "solo" } }),
    }),
    /github.mode must be local, plans-repo or single-repo/,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), text);
});

test("only the dashboard owner may save settings from the app page", () => {
  for (const operation of ["github.settings.get", "github.settings.validate"])
    for (const kind of ["owner-session", "app-token", "agent-tool"])
      assert.equal(principalAllows({ kind }, operation), true);
  assert.equal(
    principalAllows({ kind: "owner-session" }, "github.settings.update"),
    true,
  );
  for (const kind of ["app-token", "agent-tool", "none"])
    assert.equal(principalAllows({ kind }, "github.settings.update"), false);
});

test("settings show review roles from delivery, read only", async (t) => {
  const role = {
    id: "security",
    focus: "Look for injection.",
    agent: "reviewer",
    model: "model-b",
  };
  const { ops } = workspace(t, {
    file: {
      version: 1,
      github: POLICY,
      delivery: {
        model: "model-a",
        reviewers: [role],
        repositories: { "example/app": { reviewers: [] } },
      },
    },
  });
  const { review } = await ops.execute("github.settings.get");
  assert.deepEqual(review, {
    error: null,
    writerModel: "model-a",
    reviewers: [{ ...role, distinctFrom: "model" }],
    repositories: { "example/app": [] },
  });
});

test("Local only is a mode: no GitHub mode, and stored GitHub settings are kept but unused", () => {
  const stored = {
    mode: "local",
    planningRepository: "example/plans",
    defaultAuthority: "github",
    project: { owner: "example", number: 7 },
    repositories: {
      "example/app": { coder: "issue-radar", rules: [] },
    },
  };
  const policy = normalizeGitHubPolicy(stored);
  assert.equal(policy.mode, null);
  assert.equal(policy.planningRepository, null);
  assert.equal(policy.defaultAuthority, "local");
  assert.equal(newTaskAuthority(policy), "local");
  // Kept: the Project and the repository settings still validate and stay.
  assert.equal(policy.project.number, 7);
  assert.ok(policy.repositories["example/app"]);
  // A switch back to plans-repo uses the kept planning repository.
  assert.equal(
    normalizeGitHubPolicy({ ...stored, mode: "plans-repo", repositories: {} })
      .planningRepository,
    "example/plans",
  );
  // single-repo keeps the planning repository too, and ignores it.
  assert.equal(
    normalizeGitHubPolicy({ ...stored, mode: "single-repo", repositories: {} })
      .planningRepository,
    null,
  );
  assert.throws(
    () => normalizeGitHubPolicy({ mode: "solo" }),
    /github.mode must be local, plans-repo or single-repo/,
  );
});

test("githubMode() is null in Local only", async (t) => {
  const { ops } = workspace(t, {
    file: { version: 1, github: { mode: "local" } },
  });
  assert.equal(ops.githubMode(), null);
  const settings = await ops.execute("github.settings.get");
  assert.equal(settings.github.mode, "local");
  assert.equal(settings.effective.mode, null);
  assert.deepEqual(settings.choices.modes, [
    "local",
    "plans-repo",
    "single-repo",
  ]);
});

test("github.cacheSeconds and a repository's own are whole seconds from 0 to 3600", () => {
  const ok = normalizeGitHubPolicy({
    cacheSeconds: 30,
    repositories: { "o/r": { cacheSeconds: 0 } },
  });
  assert.equal(ok.cacheSeconds, 30);
  assert.equal(ok.repositories["o/r"].cacheSeconds, 0);
  assert.equal(normalizeGitHubPolicy({}).cacheSeconds, null);
  for (const bad of [-1, 3601, 1.5, "60"])
    assert.throws(
      () => normalizeGitHubPolicy({ cacheSeconds: bad }),
      /cacheSeconds/,
    );
});
