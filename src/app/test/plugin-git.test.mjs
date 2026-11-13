// Git plugin sources (design §4.8, Requirement 34.12–34.15). Every repository
// here is a local file:// repository made in a temporary folder: no network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  addGitPlugin,
  approvePlugin,
  inspectPlugins,
  pluginHost,
  readPluginSettings,
  removePlugin,
  updateGitPlugin,
  validateEntry,
  writePluginSettings,
} from "../plugins.mjs";
import { maskCredentials } from "../plugin-git.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const FIXTURE = path.join(import.meta.dirname, "fixtures", "plugins");

// The person's git configuration for these tests: an isolated global file,
// so no real configuration (signing, hooks, templates) leaks in or out.
function isolateGit(t, root) {
  const global = path.join(root, "gitconfig");
  fs.writeFileSync(global, "");
  const saved = {
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
  };
  process.env.GIT_CONFIG_GLOBAL = global;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  t.after(() => {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
  return global;
}

function setup(t) {
  const root = temporaryDirectory("avoozl-plugin-git-"),
    repo = path.join(root, "repo"),
    workspaceRoot = path.join(root, "workspace"),
    settingsFile = path.join(root, "config", "plugins.json"),
    stateFile = path.join(root, "route-state.json");
  const gitConfig = isolateGit(t, root);
  fs.mkdirSync(workspaceRoot);
  fs.writeFileSync(stateFile, "{}\n");
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=t@example.com", ...args],
      { cwd: repo, encoding: "utf8" },
    ).trim();
  fs.mkdirSync(repo);
  git("init", "-q", "-b", "main");
  fs.cpSync(path.join(FIXTURE, "fake-route"), path.join(repo, "plugin"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(repo, "README.md"), "A plugin repository.\n");
  git("add", ".");
  git("commit", "-q", "-m", "Add the plugin");
  git("tag", "v1");
  git("tag", "-a", "v1-annotated", "-m", "Annotated");
  const options = { workspaceRoot, settingsFile };
  const url = pathToFileURL(repo).href;
  const entry = (more = {}) => ({
    id: "fake-route",
    git: url,
    ref: "main",
    subdir: "plugin",
    contract: 1,
    config: { stateFile },
    ...more,
  });
  const gitRoot = path.join(root, "config", "plugins", "git", "fake-route");
  return { root, repo, git, options, url, entry, gitRoot, gitConfig };
}

const approve = (options) => {
  const plugin = inspectPlugins(options).find((p) => p.id === "fake-route");
  return approvePlugin(options, {
    id: plugin.id,
    hash: plugin.hash,
    commit: plugin.commit,
  });
};

test("a git entry names git and ref, never credentials, and a subdir inside", () => {
  const entry = {
    id: "fake-route",
    git: "https://git.example.com/team/plugin.git",
    ref: "v1.0.0",
    subdir: "plugin",
    contract: 1,
  };
  assert.equal(validateEntry(entry), entry);
  assert.ok(validateEntry({ ...entry, git: "git@git.example.com:team/x.git" }));
  assert.ok(validateEntry({ ...entry, git: "ssh://git@git.example.com/x" }));
  assert.ok(validateEntry({ ...entry, git: "../plugin-repo" }));
  assert.ok(validateEntry({ ...entry, ref: "a".repeat(40) }));
  for (const [change, pattern] of [
    [{ path: "../x" }, /exactly one of package, path or git/],
    [
      { git: "https://user:pw@git.example.com/x" },
      /must not carry credentials/,
    ],
    [
      { git: "https://ghp_abc@git.example.com/x" },
      /must not carry credentials/,
    ],
    [
      { git: "https://git.example.com/x?token=1" },
      /must not carry credentials/,
    ],
    [{ git: "ssh://git:pw@git.example.com/x" }, /must not carry credentials/],
    [{ git: "--upload-pack=touch /tmp/x" }, /repository URL or path/],
    [{ git: "ext::sh -c touch% /tmp/x" }, /repository URL or path|transport/],
    [{ git: "ftp://git.example.com/x" }, /https, ssh, git or file/],
    [{ ref: "--orphan" }, /tag, branch or full commit/],
    [{ ref: "a..b" }, /tag, branch or full commit/],
    [{ ref: undefined }, /tag, branch or full commit/],
    [{ ref: "abc1234" }, /full commit, not a short one/],
    [{ subdir: "../outside" }, /inside the repository/],
    [{ subdir: "/etc" }, /inside the repository/],
  ])
    assert.throws(() => validateEntry({ ...entry, ...change }), pattern);
  assert.throws(
    () => validateEntry({ id: "x", path: "../x", ref: "main", contract: 1 }),
    /go with git/,
  );
  assert.equal(
    maskCredentials("fatal: https://me:secret@host/x not found"),
    "fatal: https://***@host/x not found",
  );
});

test("Add from git pins the ref to a commit, fetches only it, and needs approval", async (t) => {
  const { git, options, entry, gitRoot } = setup(t);
  const head = git("rev-parse", "HEAD");
  const added = await addGitPlugin(options, { entry: entry() });
  assert.equal(added.state, "unapproved");
  assert.equal(added.commit, head);
  assert.equal(added.location, path.join(gitRoot, head, "plugin"));
  // Plain files: no .git folder, and only the one commit's folder.
  assert.ok(!fs.existsSync(path.join(gitRoot, head, ".git")));
  assert.ok(fs.existsSync(path.join(gitRoot, head, "README.md")));
  assert.deepEqual(
    fs.readdirSync(gitRoot).filter((name) => !name.startsWith(".")),
    [head],
  );
  const settings = readPluginSettings(options.settingsFile);
  assert.equal(settings.pins["fake-route"].commit, head);
  assert.equal(settings.plugins[0].ref, "main", "the entry keeps the ref");

  const approved = approve(options);
  assert.equal(approved.state, "approved");
  assert.equal(
    readPluginSettings(options.settingsFile).approvals["fake-route"].commit,
    head,
  );
  // It runs like any other plugin.
  const session = pluginHost(options).open();
  const reply = await session.call("fake-route", "route", "submit", {
    task: { id: "t1" },
    brief: "",
  });
  assert.equal(reply.id, "remote-t1");
  await session.close();

  // A stale commit in the approval request is refused.
  assert.throws(
    () =>
      approvePlugin(options, {
        id: "fake-route",
        hash: approved.hash,
        commit: "0".repeat(40),
      }),
    /Review it again/,
  );

  removePlugin(options, { id: "fake-route" });
  assert.deepEqual(readPluginSettings(options.settingsFile).pins, {});
  assert.ok(!fs.existsSync(path.join(gitRoot, head)));
});

test("tags, annotated tags and full commits resolve to their commit", async (t) => {
  const { git, options, entry } = setup(t);
  const first = git("rev-parse", "HEAD");
  git("commit", "-q", "--allow-empty", "-m", "Later");
  for (const ref of ["v1", "v1-annotated", first, "refs/tags/v1"]) {
    const added = await addGitPlugin(options, { entry: entry({ ref }) });
    assert.equal(added.commit, first, ref);
    removePlugin(options, { id: "fake-route" });
  }
  await assert.rejects(
    addGitPlugin(options, { entry: entry({ ref: "nope" }) }),
    /No branch or tag named nope/,
  );
  assert.deepEqual(readPluginSettings(options.settingsFile).plugins, []);
});

test("a new commit on the branch needs a new approval, even with the same files", async (t) => {
  const { git, options, entry, gitRoot } = setup(t);
  const first = (await addGitPlugin(options, { entry: entry() })).commit;
  approve(options);
  // The tick sees nothing new until a person chooses Update.
  git("commit", "-q", "--allow-empty", "-m", "Same files, new commit");
  const second = git("rev-parse", "HEAD");
  assert.equal(inspectPlugins(options)[0].state, "approved");

  const updated = await updateGitPlugin(options, { id: "fake-route" });
  assert.equal(updated.commit, second);
  assert.equal(updated.state, "changed");
  assert.match(updated.reason, /approve it again/);
  assert.equal(updated.hash, updated.approval.hash, "same content hash");
  assert.ok(!fs.existsSync(path.join(gitRoot, first)), "old commit pruned");
  const session = pluginHost(options).open();
  assert.equal((await session.use("fake-route", "route")).ok, false);
  await session.close();
  assert.equal(approve(options).state, "approved");
});

test("the tick never fetches: it reads only the pinned folder", async (t) => {
  const { repo, options, entry, gitRoot } = setup(t);
  await addGitPlugin(options, { entry: entry() });
  approve(options);
  // Take the repository and git itself away; loading still works.
  fs.renameSync(repo, `${repo}-gone`);
  // PATH keeps only lsof, which the listener check needs outside Linux
  // (/proc) and Windows (netstat by full path).
  const savedPath = process.env.PATH,
    bin = path.join(path.dirname(gitRoot), "..", "only-lsof");
  fs.mkdirSync(bin, { recursive: true });
  if (!["linux", "win32"].includes(process.platform))
    fs.symlinkSync(
      execFileSync("sh", ["-c", "command -v lsof"], {
        encoding: "utf8",
      }).trim(),
      path.join(bin, "lsof"),
    );
  process.env.PATH = bin;
  try {
    const session = pluginHost(options).open();
    assert.equal(
      (
        await session.call("fake-route", "route", "submit", {
          task: { id: "t1" },
          brief: "",
        })
      ).id,
      "remote-t1",
    );
    await session.close();
  } finally {
    process.env.PATH = savedPath;
  }
  // An entry whose ref changed shows as missing until Update; nothing fetched.
  const settings = readPluginSettings(options.settingsFile);
  settings.plugins[0].ref = "v1";
  writePluginSettings(options.settingsFile, settings);
  const before = fs.readdirSync(gitRoot).sort();
  const [plugin] = inspectPlugins(options);
  assert.equal(plugin.state, "missing");
  assert.match(plugin.reason, /Not fetched on this machine. Choose Update/);
  const session = pluginHost(options).open();
  assert.equal((await session.use("fake-route", "route")).ok, false);
  await session.close();
  assert.deepEqual(fs.readdirSync(gitRoot).sort(), before);
});

test("refused: a subdir that leaves the repository, no manifest, unshipped dependencies", async (t) => {
  const { repo, git, options, entry } = setup(t);
  fs.symlinkSync("..", path.join(repo, "escape"));
  fs.mkdirSync(path.join(repo, "empty"));
  fs.writeFileSync(path.join(repo, "empty", "notes.txt"), "no plugin\n");
  fs.writeFileSync(
    path.join(repo, "plugin", "package.json"),
    JSON.stringify({ name: "fake-route", dependencies: { "left-pad": "1" } }),
  );
  git("add", ".");
  git("commit", "-q", "-m", "Refusals");
  for (const [subdir, pattern] of [
    // Git for Windows checks a symlink out as a file (core.symlinks off).
    [
      "escape",
      process.platform === "win32"
        ? /leaves the repository|is not a folder/
        : /leaves the repository/,
    ],
    ["empty", /has no avoozl-plugin.json in empty/],
    ["missing", /has no folder missing/],
    ["plugin", /does not ship \(left-pad\).*runs no npm install/],
  ])
    await assert.rejects(
      addGitPlugin(options, { entry: entry({ subdir }) }),
      pattern,
      subdir,
    );
  const settings = readPluginSettings(options.settingsFile);
  assert.deepEqual(settings.plugins, []);
  assert.deepEqual(settings.pins, {});
  // A manifest whose id differs from the entry is refused too.
  await assert.rejects(
    addGitPlugin(options, { entry: entry({ id: "other", subdir: "plugin" }) }),
    /does not ship|does not match/,
  );
});

test("git hooks and init templates from the person's config never run", async (t) => {
  const { root, options, entry, gitConfig } = setup(t);
  const marker = path.join(root, "hook-ran"),
    hooks = path.join(root, "hooks"),
    template = path.join(root, "template");
  fs.mkdirSync(hooks);
  fs.mkdirSync(path.join(template, "hooks"), { recursive: true });
  for (const folder of [hooks, path.join(template, "hooks")])
    for (const name of ["post-checkout", "reference-transaction"])
      fs.writeFileSync(
        path.join(folder, name),
        `#!/bin/sh\necho ran >> "${marker}"\n`,
        { mode: 0o755 },
      );
  fs.writeFileSync(
    gitConfig,
    // Forward slashes: git config reads `\` as an escape.
    `[core]\n\thooksPath = ${hooks.replaceAll("\\", "/")}\n[init]\n\ttemplateDir = ${template.replaceAll("\\", "/")}\n`,
  );
  const added = await addGitPlugin(options, { entry: entry() });
  assert.equal(added.state, "unapproved");
  assert.ok(!fs.existsSync(marker), "no hook ran");
});

test("plugin.add and plugin.update reach git entries through Operations", async (t) => {
  const { root, git, options, entry } = setup(t);
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  const ops = new Operations(store, {
    workspaceRoot: options.workspaceRoot,
    pluginSettingsFile: options.settingsFile,
  });
  const added = await ops.execute("plugin.add", { entry: entry() });
  assert.equal(added.commit, git("rev-parse", "HEAD"));
  assert.equal(added.manifest, undefined);
  git("commit", "-q", "--allow-empty", "-m", "Next");
  const updated = await ops.execute("plugin.update", { id: "fake-route" });
  assert.equal(updated.commit, git("rev-parse", "HEAD"));
  const listed = await ops.execute("plugins.list", {});
  assert.equal(listed.plugins[0].commit, updated.commit);
  assert.deepEqual(listed.plugins[0].git, {
    url: entry().git,
    ref: "main",
    subdir: "plugin",
  });
});
