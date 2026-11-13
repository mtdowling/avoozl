import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { fixture, waitFor } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
}

test("repository settings preserve unrelated JSON and expose canonical metadata", async (t) => {
  const { root, store } = fixture(t),
    filename = path.join(root, ".avoozl.json");
  writeJson(filename, {
    version: 1,
    projects: {
      code: {
        root: "../code",
        checks: [["npm", "test"]],
      },
    },
    conversations: {
      autoArchiveCompleted: false,
      driver: {
        agentProfile: "reviewer",
        model: "model-before",
      },
    },
  });
  const configuration = new RepositorySettings(store, {
    workspaceRoot: root,
    files: { repository: filename },
    sources: [],
  });
  configuration.reload();
  const ops = new Operations(store, { configuration });

  // An old file's Driver choice still loads; only auto-archive acts.
  assert.deepEqual(await ops.execute("conversations.settings.get"), {
    autoArchiveCompleted: false,
  });
  assert.deepEqual(
    await ops.execute("conversations.settings.update", {
      autoArchiveCompleted: true,
    }),
    { autoArchiveCompleted: true },
  );

  const saved = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.deepEqual(saved.projects, {
    code: {
      root: "../code",
      checks: [["npm", "test"]],
    },
  });
  assert.deepEqual(saved.conversations, { autoArchiveCompleted: true });
  assert.equal(
    fs
      .readdirSync(path.dirname(filename))
      .some((name) => name.endsWith(".pending")),
    false,
  );

  const workspace = await ops.execute("workspace");
  assert.equal(workspace.configuration.version, 1);
  assert.equal(workspace.configuration.files.repository, filename);
  assert.equal(workspace.configuration.repository.filename, filename);
  assert.equal(workspace.configuration.repository.exists, true);
  assert.match(workspace.configuration.repository.hash, /^[a-f0-9]{64}$/);
  assert.equal(workspace.configuration.repository.error, null);
  assert.deepEqual(workspace.configuration.pending, ["projects"]);
  assert.deepEqual(workspace.configuration.applyRequired, ["projects"]);
  assert.deepEqual(workspace.configuration.restartRequired, []);
  assert.match(
    workspace.configuration.schemaPath,
    /avoozl-config\.schema\.json$/,
  );
  assert.equal(workspace.configuration.sources.at(-1).filename, filename);
});

test("repository settings use a file hash to avoid clobbering direct edits", (t) => {
  const { root, store } = fixture(t),
    configuration = new RepositorySettings(store, { workspaceRoot: root });
  const first = configuration.updateConversationSettings({
    autoArchiveCompleted: false,
  });
  writeJson(path.join(root, ".avoozl.json"), {
    version: 1,
    notes: { editedBy: "person" },
    conversations: { autoArchiveCompleted: true },
  });

  assert.throws(
    () =>
      configuration.updateConversationSettings({
        autoArchiveCompleted: false,
        expectedHash: first.configuration.hash,
      }),
    /changed; reload before saving/,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"))
      .conversations.autoArchiveCompleted,
    true,
  );
});

test("repository settings ignore .avoozl/config.json", (t) => {
  const { root, store } = fixture(t),
    legacy = path.join(root, ".avoozl", "config.json"),
    current = path.join(root, ".avoozl.json"),
    configuration = new RepositorySettings(store, { workspaceRoot: root });
  writeJson(legacy, {
    version: 1,
    dbPath: "local/workspace.sqlite",
    documents: "../plans",
    projects: {
      code: {
        root: "../code",
        worktreeRoot: "../worktrees",
        checks: [],
      },
      machine: {
        root: "/machine/checkout",
        checks: [],
      },
    },
    ahp: { tokens: "/machine/secret-state/ahp-tokens.json" },
  });

  configuration.reload();
  assert.equal(
    Object.hasOwn(configuration.metadata(), "legacyRepository"),
    false,
  );
  const editable = configuration.readConfiguration("repository");
  assert.equal(editable.exists, false);
  assert.equal(Object.hasOwn(editable, "legacy"), false);
  assert.deepEqual(JSON.parse(editable.text), { version: 1 });
  configuration.updateConversationSettings({ autoArchiveCompleted: false });

  const saved = JSON.parse(fs.readFileSync(current, "utf8"));
  assert.equal(
    saved.$schema,
    "https://avoozl.dev/schema/repository-config-v1.json",
  );
  assert.equal(saved.dbPath, undefined);
  assert.equal(saved.documents, undefined);
  assert.equal(saved.projects, undefined);
  assert.equal(saved.ahp, undefined);
  assert.equal(saved.conversations.autoArchiveCompleted, false);
  assert.equal(fs.existsSync(legacy), true);
});

test("configuration editor reads, formats, and conflict-checks repository and global JSON", async (t) => {
  const { root, store } = fixture(t),
    global = path.join(root, "global", "config.json"),
    configuration = new RepositorySettings(store, {
      workspaceRoot: root,
      files: { global },
    }),
    ops = new Operations(store, { configuration });

  const emptyRepository = await ops.execute("configuration.get", {
    scope: "repository",
  });
  assert.equal(emptyRepository.exists, false);
  assert.equal(emptyRepository.hash, null);
  assert.equal(emptyRepository.text, '{\n  "version": 1\n}\n');

  const savedRepository = await ops.execute("configuration.update", {
    scope: "repository",
    expectedHash: emptyRepository.hash,
    text: '{"version":1,"conversations":{"autoArchiveCompleted":false}}',
  });
  assert.equal(savedRepository.exists, true);
  assert.match(savedRepository.hash, /^[a-f0-9]{64}$/);
  assert.equal(
    savedRepository.text,
    '{\n  "version": 1,\n  "conversations": {\n    "autoArchiveCompleted": false\n  }\n}\n',
  );
  assert.deepEqual(await ops.execute("conversations.settings.get"), {
    autoArchiveCompleted: false,
  });

  await assert.rejects(
    ops.execute("configuration.update", {
      scope: "repository",
      expectedHash: null,
      text: '{"version":1}',
    }),
    (error) => error.status === 409 && /changed; reload/.test(error.message),
  );
  await assert.rejects(
    ops.execute("configuration.update", {
      scope: "repository",
      expectedHash: savedRepository.hash,
      text: '{"version":1,"github":{"token":"nope"}}',
    }),
    /secret-like key github\.token/,
  );
  assert.equal(
    fs.readFileSync(savedRepository.filename, "utf8"),
    savedRepository.text,
  );

  const emptyGlobal = await ops.execute("configuration.get", {
    scope: "global",
  });
  const savedGlobal = await ops.execute("configuration.update", {
    scope: "global",
    expectedHash: emptyGlobal.hash,
    text: '{"version":1,"name":"Shared defaults"}',
  });
  assert.equal(savedGlobal.filename, global);
  assert.equal(savedGlobal.exists, true);
  assert.deepEqual(savedGlobal.restartRequired, [
    "Restart Avoozl to apply global configuration changes",
  ]);
  assert.equal(
    fs.readFileSync(global, "utf8"),
    '{\n  "version": 1,\n  "name": "Shared defaults"\n}\n',
  );
});

test("repository settings refuse symbolic and non-regular paths", (t) => {
  const { root, store } = fixture(t),
    outside = temporaryDirectory("avoozl-settings-outside-"),
    directory = root,
    filename = path.join(root, ".avoozl.json");
  writeJson(path.join(outside, "config.json"), { version: 1 });
  fs.symlinkSync(path.join(outside, "config.json"), filename);
  const linkedFile = new RepositorySettings(store, { workspaceRoot: root });
  assert.throws(
    () =>
      linkedFile.updateConversationSettings({ autoArchiveCompleted: false }),
    /regular file/,
  );

  fs.unlinkSync(filename);
  fs.symlinkSync(path.join(outside, "missing.json"), filename);
  const brokenLinkedFile = new RepositorySettings(store, {
    workspaceRoot: root,
  });
  assert.throws(
    () =>
      brokenLinkedFile.updateConversationSettings({
        autoArchiveCompleted: false,
      }),
    /regular file/,
  );

  fs.unlinkSync(filename);
  fs.mkdirSync(filename);
  const directoryTarget = new RepositorySettings(store, {
    workspaceRoot: root,
  });
  assert.throws(
    () =>
      directoryTarget.updateConversationSettings({
        autoArchiveCompleted: false,
      }),
    /regular file/,
  );
});

test("watcher reloads typed direct edits, leaves privileged desired state inert, and retains last good settings", async (t) => {
  const { root, store } = fixture(t),
    filename = path.join(root, ".avoozl.json"),
    watch = {},
    configuration = new RepositorySettings(store, {
      workspaceRoot: root,
      debounceMs: 10,
      watchFactory(_directory, listener) {
        watch.listener = listener;
        return { close() {} };
      },
    });
  t.after(configuration.watch());

  writeJson(filename, {
    version: 1,
    projects: {
      privileged: {
        root: "should-not-be-activated",
        checks: [["false"]],
      },
    },
    conversations: {
      autoArchiveCompleted: false,
      driver: {
        agentProfile: "direct-profile",
        model: "direct-model",
      },
    },
  });
  watch.listener("rename", ".avoozl.json");
  await waitFor(
    () => store.getMeta("conversationSettings")?.autoArchiveCompleted === false,
    { label: "direct repository settings reload" },
  );
  assert.equal(store.get("projects", "privileged"), null);
  assert.equal(configuration.metadata().repository.error, null);
  assert.deepEqual(configuration.metadata().applyRequired, ["projects"]);
  assert.deepEqual(configuration.metadata().restartRequired, []);

  writeJson(filename, {
    version: 1,
    integrations: {
      github: {
        apiKey: "must-not-be-configured",
      },
    },
    conversations: {
      autoArchiveCompleted: true,
      driver: {
        agentProfile: "bad-profile",
        model: "bad-model",
      },
    },
  });
  watch.listener("change", ".avoozl.json");
  await waitFor(() => configuration.metadata().repository.error, {
    label: "invalid settings error",
  });
  assert.deepEqual(store.getMeta("conversationSettings"), {
    autoArchiveCompleted: false,
  });
  assert.match(
    configuration.metadata().repository.error.message,
    /secret-like key integrations\.github\.apiKey/,
  );
});

test("direct conversation settings reject unknown keys without applying them", (t) => {
  const { root, store } = fixture(t),
    filename = path.join(root, ".avoozl.json"),
    configuration = new RepositorySettings(store, { workspaceRoot: root });
  writeJson(filename, {
    version: 1,
    conversations: {
      autoArchiveCompleted: false,
      automaticallyAuthorizeWork: true,
      driver: { agentProfile: null, model: null },
    },
  });

  const metadata = configuration.reload();
  assert.match(
    metadata.repository.error.message,
    /Unknown conversation configuration setting automaticallyAuthorizeWork/,
  );
  assert.equal(store.getMeta("conversationSettings"), null);
});

test("repository conversation settings override and fall back to global defaults", (t) => {
  const { root, store } = fixture(t),
    filename = path.join(root, ".avoozl.json"),
    configuration = new RepositorySettings(store, {
      workspaceRoot: root,
      baseConfig: {
        conversations: {
          autoArchiveCompleted: false,
          driver: { agentProfile: "global-agent", model: "global-model" },
        },
      },
    });
  writeJson(filename, {
    version: 1,
    conversations: { autoArchiveCompleted: true },
  });

  configuration.reload();
  assert.deepEqual(store.getMeta("conversationSettings"), {
    autoArchiveCompleted: true,
  });

  writeJson(filename, { version: 1 });
  configuration.reload();
  assert.deepEqual(store.getMeta("conversationSettings"), {
    autoArchiveCompleted: false,
  });
});

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repository(root) {
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Avoozl test"]);
  git(root, ["config", "user.email", "avoozl@example.test"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Test\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "Initialize"]);
  git(root, ["remote", "add", "origin", path.join(root, "private.git")]);
}

class PrivateGitHub {
  available() {
    return true;
  }
  async repository() {
    return { node_id: "repository-node", private: true };
  }
  async currentUser() {
    return { login: "operator" };
  }
  async ensureLabel() {}
}

test("explicit Settings operations persist typed desired state without changing legacy results", async (t) => {
  const { root, store } = fixture(t),
    code = path.join(root, "code"),
    planning = path.join(root, "planning");
  repository(code);
  repository(planning);
  const configuration = new RepositorySettings(store, {
      workspaceRoot: root,
    }),
    ops = new Operations(store, {
      configuration,
      github: new PrivateGitHub(),
    });

  const project = await ops.execute("project.configure", {
    id: "code",
    root: code,
    baseBranch: "main",
    checks: [["npm", "test"]],
  });
  assert.equal(project.root, fs.realpathSync(code));
  assert.equal(project.configuration, undefined);
  const updatedProject = await ops.execute("project.configure", {
    id: "code",
    root: code,
    baseBranch: "main",
    checks: [["npm", "run", "test"]],
  });
  assert.deepEqual(updatedProject.checks, [["npm", "run", "test"]]);

  const issue = await ops.execute("github.configure", {
    repository: "Example/Code",
    projectId: "code",
    label: "ready",
    managedLabel: "projected",
    allowedActors: ["maintainer"],
  });
  assert.equal(issue.id, "Example/Code");

  const workspaceRepository = await ops.execute(
    "workspace.repository.configure",
    {
      root: planning,
      remote: "origin",
      branch: "planning",
      directory: "workspace",
    },
  );
  assert.equal(workspaceRepository.root, fs.realpathSync(planning));

  const filename = path.join(root, ".avoozl.json"),
    saved = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.equal(saved.projects.code.root, "code");
  assert.equal(saved.projects.code.worktreeRoot, ".avoozl-worktrees");
  assert.deepEqual(saved.projects.code.checks, [["npm", "run", "test"]]);
  assert.deepEqual(saved.github.issueIntake["Example/Code"], {
    projectId: "code",
    assignee: "operator",
    label: "ready",
    managedLabel: "projected",
    enabled: true,
    autoStart: false,
    provider: null,
    model: null,
    allowedActors: ["maintainer"],
    minimumPermission: "write",
  });
  assert.equal(saved.github.queue, undefined);
  assert.equal(saved.planningRepository.root, "planning");
  assert.deepEqual(configuration.metadata().pending, []);
  assert.deepEqual(configuration.metadata().applyRequired, []);
  assert.deepEqual(configuration.metadata().restartRequired, []);
  assert.deepEqual(configuration.metadata().lastApplied.keys, [
    "planningRepository",
  ]);

  const connected = await ops.execute("github.project.connect", {
    repository: "Example/Code",
    projectId: "code",
    assignee: "operator",
  });
  assert.equal(connected.execution.id, "Example/Code");
  assert.equal(connected.queue, undefined);
  const afterConnect = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.equal(
    afterConnect.github.issueIntake["Example/Code"].projectId,
    "code",
  );
  assert.equal(afterConnect.github.queue, undefined);
  const reopened = new RepositorySettings(store, { workspaceRoot: root });
  assert.equal(
    reopened.metadata().lastApplied.hash,
    configuration.metadata().lastApplied.hash,
  );
});

test("direct privileged edits are validated and reported as inert apply or restart work", (t) => {
  const { root, store } = fixture(t),
    code = path.join(root, "code"),
    configuration = new RepositorySettings(store, { workspaceRoot: root });
  repository(code);
  store.put("projects", {
    id: "code",
    root: code,
    baseBranch: "main",
    worktreeRoot: path.join(root, "worktrees"),
    checks: [],
  });
  configuration.updateConversationSettings({
    autoArchiveCompleted: false,
  });
  const filename = path.join(root, ".avoozl.json"),
    direct = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.equal(direct.projects.code.root, "code");
  direct.projects.code.baseBranch = "next";
  direct.port = 9999;
  writeJson(filename, direct);

  const metadata = configuration.reload();

  assert.equal(store.get("projects", "code").baseBranch, "main");
  assert.deepEqual(metadata.applyRequired, ["projects"]);
  assert.deepEqual(metadata.restartRequired, ["port"]);
  assert.deepEqual(metadata.pending, ["projects", "port"]);
  assert.equal(metadata.repository.error, null);
});

test("creating repository JSON materializes already-applied non-secret settings", (t) => {
  const { root, store } = fixture(t),
    realRoot = fs.realpathSync(root),
    configuration = new RepositorySettings(store, { workspaceRoot: root });
  store.put("projects", {
    id: "code",
    root: path.join(realRoot, "code"),
    baseBranch: "main",
    worktreeRoot: path.join(realRoot, "worktrees"),
    checks: [["npm", "test"]],
  });
  store.put("github_repositories", {
    id: "example/code",
    projectId: "code",
    assignee: "operator",
    label: "ready",
    allowedActors: [],
    minimumPermission: "write",
  });
  store.put("github_queue_repositories", {
    id: "example/code",
    projectId: "code",
    enabled: true,
    includeIssues: true,
    includePullRequests: true,
  });
  store.setMeta("workspaceRepository", {
    root: path.join(realRoot, "planning"),
    remote: "origin",
    branch: "planning",
    directory: "workspace",
  });

  configuration.updateConversationSettings({ autoArchiveCompleted: false });

  const saved = JSON.parse(
    fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"),
  );
  assert.equal(saved.projects.code.root, "code");
  assert.equal(saved.github.issueIntake["example/code"].assignee, "operator");
  assert.equal(saved.github.queue["example/code"].projectId, "code");
  assert.equal(saved.planningRepository.root, "planning");
  assert.equal(saved.conversations.autoArchiveCompleted, false);
  assert.deepEqual(configuration.metadata().pending, []);
});

test("project removal clears persisted configuration and records the action", async (t) => {
  const { root, store } = fixture(t),
    configuration = new RepositorySettings(store, { workspaceRoot: root }),
    ops = new Operations(store, { configuration }),
    project = {
      id: "removable",
      root: path.join(root, "code"),
      baseBranch: "main",
      worktreeRoot: path.join(root, "worktrees"),
      checks: [],
    };
  store.put("projects", project);
  configuration.updateExecutionProject(project);
  store.put("runs", {
    id: "completed-run",
    taskId: "sample-task",
    projectId: project.id,
    state: "complete",
  });

  const removed = await ops.execute("project.remove", { id: project.id });

  assert.equal(removed.removed, true);
  assert.equal(store.get("projects", project.id), null);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"))
      .projects,
    undefined,
  );
  assert.ok(
    store
      .events({ latest: true })
      .some(
        (event) =>
          event.kind === "project.removed" && event.projectId === project.id,
      ),
  );
});

test("project removal refuses active work, locks, and GitHub connections", async (t) => {
  const { root, store } = fixture(t),
    configuration = new RepositorySettings(store, { workspaceRoot: root }),
    ops = new Operations(store, { configuration });
  for (const id of ["active", "locked", "authorized", "monitored"])
    store.put("projects", {
      id,
      root: path.join(root, id),
      baseBranch: "main",
      worktreeRoot: path.join(root, "worktrees", id),
      checks: [],
    });
  store.put("runs", {
    id: "active-run",
    taskId: "sample-task",
    projectId: "active",
    state: "waiting-input",
  });
  store.db
    .prepare("INSERT INTO work_locks VALUES (?,?,?,?,?)")
    .run("lock", "locked", "integration", process.pid, "token");
  store.put("github_repositories", {
    id: "owner/authorized",
    projectId: "authorized",
  });
  store.put("github_queue_repositories", {
    id: "owner/monitored",
    projectId: "monitored",
  });

  for (const [id, message] of [
    ["active", /active conversation/],
    ["locked", /currently locked/],
    ["authorized", /still connected to GitHub/],
    ["monitored", /still connected to GitHub/],
  ])
    await assert.rejects(
      ops.execute("project.remove", { id }),
      (error) => error.status === 409 && message.test(error.message),
    );

  for (const id of ["active", "locked", "authorized", "monitored"])
    assert.ok(store.get("projects", id));
});
