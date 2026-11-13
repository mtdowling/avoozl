// The Onboard flow's backend (onboarding.mjs, plan.issues.preview): the
// reads each step makes, the nearby inputs (no remote, a non-GitHub remote,
// a repository already registered, specs with lint errors), and the flow's
// invariant: its reads write nothing, and the flow never approves,
// dispatches or pushes. Fake GitHub only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { classifyOperation } from "../operation-kinds.mjs";
import { principalAllows } from "../app-backend.mjs";
import { Operations } from "../operations.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_onboardonboardon",
  REPO = "example/code";

class OnboardGitHub extends FakeGitHub {
  constructor({ visibility = "private" } = {}) {
    super();
    this.visibility = visibility;
    this.reads = [];
  }
  repository(value) {
    const id =
      typeof value === "string" ? value : `${value.owner}/${value.repo}`;
    this.reads.push(id);
    return Promise.resolve({
      node_id: "repo-node",
      full_name: id,
      private: this.visibility !== "public",
      default_branch: "main",
    });
  }
}

function checkout(remote) {
  const root = fs.realpathSync.native(
    temporaryDirectory("avoozl-onboard-code-"),
  );
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git(
    "-c",
    "user.email=a@b",
    "-c",
    "user.name=a",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "x",
  );
  if (remote) git("remote", "add", "origin", remote);
  return root;
}

function workspace(t, { visibility } = {}) {
  const { store } = fixture(t),
    github = new OnboardGitHub({ visibility }),
    root = temporaryDirectory(),
    settings = path.join(root, ".avoozl.json");
  fs.writeFileSync(
    settings,
    JSON.stringify({ version: 1, namespace: NAMESPACE }, null, 2) + "\n",
  );
  const ops = new Operations(store, {
    github,
    operator: "Owner",
    workspaceRoot: root,
  });
  return { store, github, ops, root, settings };
}

// Everything a step could write: the database, .avoozl.json, GitHub.
const snapshot = ({ store, github, settings }) =>
  JSON.stringify({
    data: store.read(),
    plans: store.list("plans"),
    projects: store.list("projects"),
    repositories: store.list("github_repositories"),
    approvals: store.list("approvals"),
    events: store.events({ latest: true, limit: 1 }),
    settings: fs.readFileSync(settings, "utf8"),
    created: github.created,
    updated: github.updated,
    labels: github.labels,
  });

test("the Onboard reads are classified, page-only and read-only", () => {
  for (const name of [
    "onboarding.inspect",
    "onboarding.scan",
    "plan.issues.preview",
  ]) {
    assert.equal(classifyOperation(name), "observe", name);
    assert.equal(principalAllows({ kind: "owner-session" }, name), true, name);
    assert.equal(principalAllows({ kind: "app-token" }, name), true, name);
  }
});

test("inspect names what a folder already has, with no remote, a non-GitHub remote, or a registered checkout", async (t) => {
  const ws = workspace(t);
  const bare = checkout(null);
  let found = await ws.ops.execute("onboarding.inspect", { folder: bare });
  assert.equal(found.github, null);
  assert.equal(found.remote, null);
  assert.equal(found.visibility, null);
  assert.equal(found.settingsFile, false);
  assert.deepEqual(found.specs, []);
  assert.equal(found.registered, null);

  const other = checkout("https://git.example.com/team/code.git");
  found = await ws.ops.execute("onboarding.inspect", { folder: other });
  assert.equal(found.remote, "origin");
  assert.equal(
    found.github,
    null,
    "a non-GitHub remote is not a GitHub repository",
  );
  assert.deepEqual(
    ws.github.reads,
    [],
    "no GitHub read without a GitHub remote",
  );

  const code = checkout(`git@github.com:${REPO}.git`);
  writeSpec(code, "load-config");
  fs.writeFileSync(path.join(code, ".avoozl.json"), "{}\n");
  found = await ws.ops.execute("onboarding.inspect", {
    folder: path.join(code, ".kiro"),
  });
  assert.equal(found.root, code);
  assert.equal(found.github, REPO);
  assert.equal(found.visibility, "private");
  assert.equal(found.settingsFile, true);
  assert.deepEqual(found.specs, ["load-config"]);
  assert.equal(found.registered, null);

  await ws.ops.execute("repositories.configure", {
    id: "code",
    localCheckout: code,
    baseBranch: "main",
  });
  found = await ws.ops.execute("onboarding.inspect", { folder: code });
  assert.equal(
    found.registered.id,
    "code",
    "an added checkout shows as already registered",
  );

  await assert.rejects(
    ws.ops.execute("onboarding.inspect", { folder: "relative" }),
    /absolute path/,
  );
});

test("the leak scan names secrets and machine paths by file and line, never the text", async (t) => {
  const ws = workspace(t, { visibility: "public" });
  const code = checkout(`git@github.com:${REPO}.git`);
  const home = "/Users/" + "someone/notes";
  writeSpec(code, "clean");
  writeSpec(code, "leaky", {
    "design.md": `# Design\n\nSee ${home} for the draft.\n`,
  });
  // Local only: specs are read from the planning checkout.
  await ws.ops.execute("repositories.configure", {
    id: "code",
    localCheckout: code,
    baseBranch: "main",
    planning: true,
  });
  const scan = await ws.ops.execute("onboarding.scan", {
    specs: ["clean", "leaky", "absent"],
  });
  const byName = Object.fromEntries(
    scan.items.map((item) => [item.name, item]),
  );
  assert.deepEqual(byName.clean.findings, []);
  assert.equal(byName.absent.missing, true);
  assert.equal(byName.leaky.findings.length, 1);
  assert.deepEqual(
    {
      file: byName.leaky.findings[0].file,
      line: byName.leaky.findings[0].line,
      rule: byName.leaky.findings[0].rule,
    },
    { file: "design.md", line: 3, rule: "macos-home" },
  );
  assert.doesNotMatch(JSON.stringify(scan), /someone/);
  await assert.rejects(
    ws.ops.execute("onboarding.scan", { specs: "leaky" }),
    /Name the spec folders/,
  );
});

test("Onboard end to end: reads before setup write nothing; issues are previewed, never made; nothing is approved", async (t) => {
  const ws = workspace(t);
  const code = checkout(`git@github.com:${REPO}.git`);
  writeSpec(code, "load-config");
  writeSpec(code, "broken", {
    "tasks.md": "# Tasks\n\n- [ ] 1 One\n- [ ] 1 Repeated\n",
  });

  // Steps 1–3: pick the folder, pick the mode, check GitHub. Cancel here.
  const before = snapshot(ws);
  await ws.ops.execute("onboarding.inspect", { folder: code });
  await ws.ops.execute("github.settings.get");
  await ws.ops.execute("repositories.list");
  assert.equal(
    snapshot(ws),
    before,
    "a step before Set up GitHub wrote something",
  );

  // Step 4 (after its confirms): save the mode, register the repository.
  const settings = await ws.ops.execute("github.settings.get");
  await ws.ops.execute("github.settings.update", {
    github: {
      mode: "single-repo",
      repositories: { [REPO]: { baseBranch: "main" } },
    },
    expectedHash: settings.hash,
  });
  await ws.ops.execute("repositories.configure", {
    id: "code",
    localCheckout: code,
    baseBranch: "main",
    github: REPO,
    issueAuthorization: true,
  });

  // Step 5: list specs with lint, import the clean one as a draft.
  const specs = await ws.ops.execute("plan.specs");
  const names = Object.fromEntries(
    specs.items.map((item) => [item.name, item]),
  );
  assert.ok(names.broken.counts.error > 0, "lint errors show before import");
  assert.equal(names["load-config"].counts.error, 0);
  const plan = await ws.ops.execute("plan.create", { spec: "load-config" });
  assert.notEqual(plan.state, "approved");

  // Step 7: preview the issues approval would make.
  const created = ws.github.created.length,
    tasks = ws.store.read().tasks.length,
    approvals = ws.store.list("approvals").length;
  const preview = await ws.ops.execute("plan.issues.preview", {
    planId: plan.id,
  });
  assert.equal(preview.simulated, true);
  const issues = preview.writes.filter(
    (write) => write.kind === "issue.create",
  );
  assert.equal(issues.length, 3, JSON.stringify(preview.writes));
  assert.ok(issues.every((write) => write.repository === REPO));
  assert.equal(
    ws.github.created.length,
    created,
    "the preview made a GitHub issue",
  );
  assert.equal(ws.store.read().tasks.length, tasks, "the preview made tasks");
  assert.equal(
    ws.store.list("approvals").length,
    approvals,
    "the preview approved",
  );
  assert.notEqual(ws.store.get("plans", plan.id).state, "approved");

  // A plan with lint errors is not previewed; the errors say why.
  const broken = await ws.ops.execute("plan.create", { spec: "broken" });
  const held = await ws.ops.execute("plan.issues.preview", {
    planId: broken.id,
  });
  assert.ok(held.blocked.length > 0);
  assert.deepEqual(held.writes, []);

  // The flow never approved, dispatched or pushed.
  assert.equal(ws.store.list("approvals").length, 0);
  assert.equal(ws.store.list("runs").length, 0);
  assert.equal(ws.store.list("execution_jobs").length, 0);
  assert.ok(ws.store.list("plans").every((row) => row.state !== "approved"));
});
