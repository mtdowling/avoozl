// Approval delegation (R109): a person lets a named delegate approve spec
// revisions on their behalf. Without an active grant a delegate is refused;
// with one, each approval records the delegate, the person and the hash.
// Approving a spec never needs the draft specs its tasks wait on.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { openApproval, reconcileApproval } from "../spec-approval.mjs";
import { createSpecPlan, readSpecFolder, specHash } from "../spec-plans.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import fs from "node:fs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

const leaf = (summary, requires = []) => ({
  kind: "leaf",
  summary,
  requires,
  paths: ["src/example.mjs"],
  checks: ["node --check src/example.mjs"],
  completion: "integrated",
  acceptance: ["The synthetic fixture produces its expected result."],
});
function draft({ root, store }, name, entries) {
  writeSpec(root, name, {
    "requirements.md": "# Synthetic requirement\n\nStatus: Draft\n",
    "design.md": "# Synthetic design\n\nStatus: Draft\n",
    "tasks.md":
      "# Tasks\n\nStatus: Draft\n\n" +
      Object.entries(entries)
        .map(([id, task]) => `- [ ] ${id} ${task.summary}`)
        .join("\n") +
      "\n",
    "avoozl/manifest.json": JSON.stringify({ version: 1, tasks: entries }),
  });
  return createSpecPlan(store, { id: name }, readSpecFolder(root, name));
}
function setup(t) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" } }),
  );
  const w = {
    root,
    store,
    ops: new Operations(store, { workspaceRoot: root, operator: "Owner" }),
  };
  draft(w, "base", { "base-step": leaf("Build base") });
  draft(w, "next", { "next-step": leaf("Build next", ["base-step"]) });
  return w;
}
const item = (store, id) => ({ id, expectedHash: store.get("plans", id).hash });
const AGENT = [{ mcp: true }, { caller: { sessionKey: "dashboard:s" } }];

test("a delegate with no grant is refused, and only a person grants or revokes", async (t) => {
  const w = setup(t);
  for (const context of [{}, ...AGENT])
    await assert.rejects(
      w.ops.execute(
        "plan.approveMany",
        { items: [item(w.store, "next")], delegate: "claude" },
        undefined,
        context,
      ),
      (error) =>
        error.status === 403 &&
        /^Only a person approves a plan: claude is not an approval delegate/.test(
          error.message,
        ),
    );
  for (const context of AGENT) {
    await assert.rejects(
      w.ops.execute(
        "approval.delegate.grant",
        { identity: "claude" },
        undefined,
        context,
      ),
      (error) => error.status === 403 && /^Only a person/.test(error.message),
    );
    await assert.rejects(
      w.ops.execute(
        "approval.delegate.revoke",
        { identity: "claude" },
        undefined,
        context,
      ),
      (error) => error.status === 403 && /^Only a person/.test(error.message),
    );
  }
  assert.equal(w.store.list("approvals").length, 0);
  // Who may approve is a read an agent may make.
  const listed = await w.ops.execute("approval.delegates", {}, undefined, {
    mcp: true,
  });
  assert.deepEqual(listed.delegates, []);
});

test("a granted delegate approves exactly the named spec; draft owners stay pending", async (t) => {
  const w = setup(t);
  const grant = await w.ops.execute("approval.delegate.grant", {
    identity: "claude",
  });
  assert.equal(grant.onBehalfOf, "Owner");
  // The preview names the draft owner as waited on, not as required.
  const { selection } = await w.ops.execute("plan.approvalBatches", {
    ids: ["next"],
  });
  assert.equal(selection.ok, true);
  assert.deepEqual(selection.missing, ["base"]);
  assert.equal(selection.waiting, 1);
  const hash = w.store.get("plans", "next").hash;
  const result = await w.ops.execute(
    "plan.approveMany",
    { items: [item(w.store, "next")], delegate: "claude" },
    undefined,
    { mcp: true },
  );
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  const [receipt] = w.store.list("approvals");
  assert.equal(receipt.planId, "next");
  assert.equal(receipt.hash, hash);
  assert.equal(receipt.approvedBy, "Owner");
  assert.deepEqual(receipt.delegation, {
    delegate: "claude",
    onBehalfOf: "Owner",
    grantedAt: grant.grantedAt,
  });
  assert.match(receipt.evidence, /delegate claude on behalf of Owner/);
  // Only the named spec: base is still a draft, and next-step waits on it.
  assert.equal(w.store.get("plans", "base").state, "draft");
  const task = w.store.read().tasks.find((entry) => entry.id === "next-step");
  assert.deepEqual(
    task.pendingSpecDependencies.map((ref) => ref.spec),
    ["base"],
  );
  // A delegate approves only as the person who granted it.
  await assert.rejects(
    w.ops.execute(
      "plan.approve",
      {
        ...item(w.store, "base"),
        expectedRevision: w.store.read().revision,
        delegate: "claude",
        approvedBy: "someone-else",
      },
      undefined,
      { mcp: true },
    ),
    (error) => error.status === 403 && /on behalf of Owner/.test(error.message),
  );
  // plan.approve takes a delegate too; approving base releases next-step.
  const single = await w.ops.execute(
    "plan.approve",
    {
      ...item(w.store, "base"),
      expectedRevision: w.store.read().revision,
      delegate: "claude",
    },
    undefined,
    { mcp: true },
  );
  assert.equal(single.delegation.delegate, "claude");
  assert.equal(
    w.store.read().tasks.find((entry) => entry.id === "next-step")
      .pendingSpecDependencies,
    undefined,
  );
});

test("revoking stops later delegated approvals and keeps the history", async (t) => {
  const w = setup(t);
  await w.ops.execute("approval.delegate.grant", {
    identity: "claude",
    note: "Avoozl is not operational yet",
  });
  // A second person cannot take over an active grant silently.
  await assert.rejects(
    w.ops.execute("approval.delegate.grant", {
      identity: "claude",
      onBehalfOf: "other",
    }),
    (error) => error.status === 409,
  );
  const revoked = await w.ops.execute("approval.delegate.revoke", {
    identity: "claude",
  });
  assert.deepEqual(revoked.openApprovalPullRequests, []);
  await assert.rejects(
    w.ops.execute(
      "plan.approveMany",
      { items: [item(w.store, "base")], delegate: "claude" },
      undefined,
      { mcp: true },
    ),
    (error) => error.status === 403,
  );
  assert.equal(w.store.list("approvals").length, 0);
  const listed = await w.ops.execute("approval.delegates", {});
  assert.deepEqual(listed.delegates, []);
  assert.equal(listed.history.length, 1);
  assert.equal(listed.history[0].identity, "claude");
  assert.equal(listed.history[0].note, "Avoozl is not operational yet");
  assert.ok(listed.history[0].revokedAt);
  await assert.rejects(
    w.ops.execute("approval.delegate.grant", { identity: "two words" }),
    (error) => error.status === 400,
  );
});

test("an approval pull request a delegate opens names it and keeps it at merge", async () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567",
    files = {
      "requirements.md": "# Requirements\n\nStatus: Draft\n",
      "design.md": "# Design\n\nStatus: Draft\n",
      "tasks.md": "# Tasks\n\nStatus: Draft\n\n- [ ] 1 Do it\n",
      "avoozl/manifest.json": "{}",
    },
    hash = specHash(files),
    meta = new Map(),
    store = {
      getMeta: (k) => meta.get(k) ?? null,
      setMeta: (k, v) => meta.set(k, structuredClone(v)),
    },
    written = {},
    pulls = [],
    github = {
      repository: async () => ({ default_branch: "main" }),
      branchHead: async () => ({ oid: SHA }),
      createBranch: async () => {},
      commitFiles: async (_r, { files: changed }) => {
        for (const [name, content] of Object.entries(changed))
          written[name] = Buffer.from(content, "base64").toString();
      },
      createPullRequest: async (_r, input) => {
        pulls.push({ number: pulls.length + 1, state: "open", ...input });
        return { number: pulls.length };
      },
      pullRequest: async (_r, number) => pulls[number - 1],
      blobTexts: async (_r, _ref, paths) =>
        new Map(
          paths.map((name) => [
            name,
            written[name] ?? files[name.split("/").slice(3).join("/")] ?? null,
          ]),
        ),
    },
    delegation = {
      delegate: "claude",
      onBehalfOf: "octocat",
      grantedAt: "2026-11-18T00:00:00.000Z",
    };
  const state = await openApproval(store, {
    github,
    repository: { owner: "octo", repo: "plans" },
    planId: "p1",
    hash,
    spec: "demo",
    files,
    approvedBy: "octocat",
    delegation,
  });
  assert.deepEqual(state.delegation, delegation);
  assert.match(
    pulls[0].body,
    /Opened by approval delegate claude on behalf of @octocat/,
  );
  Object.assign(pulls[0], {
    state: "closed",
    merged: true,
    merge_commit_sha: SHA,
    merged_by: { login: "octocat" },
  });
  const merged = await reconcileApproval(store, {
    github,
    repository: { owner: "octo", repo: "plans" },
    planId: "p1",
    hash,
  });
  assert.equal(merged.state, "merged");
  assert.deepEqual(merged.delegation, delegation);
});

test("the CLI: an agent approves with --delegate only after a person grants it", () => {
  const workspace = temporaryDirectory("avoozl-delegate-cli-"),
    config = initializeWorkspace(workspace, { name: "t" }),
    dbPath = config.dbPath || `${workspace}/.avoozl/local/workspace.sqlite`,
    store = new Store(dbPath);
  try {
    draft({ root: workspace, store }, "base", {
      "base-step": leaf("Build base"),
    });
  } finally {
    store.close();
  }
  const run = (agent, ...args) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", workspace], {
      encoding: "utf8",
      env: {
        ...process.env,
        KIROCREW_SPAWNED: agent ? "1" : "",
        KIRO_SESSION_ID: "",
        AVOOZL_CHILD: "",
      },
    });
  const read = (fn) => {
    const s = new Store(dbPath);
    try {
      return fn(s);
    } finally {
      s.close();
    }
  };
  const prefix = read((s) => s.get("plans", "base").hash).slice(0, 16),
    approve = (agent) =>
      run(
        agent,
        "plan",
        "approve",
        "base",
        "--yes",
        "--expect",
        prefix,
        "--delegate",
        "claude",
      );
  // The preview's command names the delegate instead of --as-person.
  const preview = run(true, "plan", "approve", "base", "--delegate", "claude");
  assert.equal(preview.status, 0, preview.stderr + preview.stdout);
  assert.match(preview.stdout, /--expect [0-9a-f]{16} .*--delegate claude\n/);
  const refused = approve(true);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /claude is not an approval delegate/);
  // An agent session cannot grant itself.
  const self = run(true, "approval", "delegate", "claude");
  assert.notEqual(self.status, 0);
  assert.match(self.stderr, /Only a person grants approval delegation/);
  const granted = run(
    false,
    "approval",
    "delegate",
    "claude",
    "--on-behalf-of",
    "octocat",
  );
  assert.equal(granted.status, 0, granted.stderr);
  assert.match(granted.stdout, /claude may approve specs on behalf of octocat/);
  const approved = approve(true);
  assert.equal(approved.status, 0, approved.stderr + approved.stdout);
  assert.match(
    approved.stdout,
    /Approved 1 specs as delegate claude on behalf of octocat/,
  );
  assert.deepEqual(
    read((s) =>
      s
        .list("approvals")
        .map((receipt) => [
          receipt.planId,
          receipt.approvedBy,
          receipt.delegation.delegate,
        ]),
    ),
    [["base", "octocat", "claude"]],
  );
  const listed = run(true, "approval", "delegates");
  assert.match(listed.stdout, /claude approves on behalf of octocat/);
  const revoked = run(false, "approval", "revoke", "claude");
  assert.equal(revoked.status, 0, revoked.stderr);
  assert.match(
    run(true, "approval", "delegates").stdout,
    /No approval delegates/,
  );
});
