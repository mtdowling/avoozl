// Fixes from the 2026-11-13 security audit: a caller-named revision never
// reaches git as an option, repository code never sees the gateway's
// credentials, and branch settings refuse a leading dash.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { addedLines, diffBase, revision } from "../content-rules.mjs";
import { commandEvidence, repositoryEnvironment } from "../git.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function repository() {
  const root = temporaryDirectory("avoozl-security-");
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-b", "main");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "init",
  );
  return root;
}

test("a revision that looks like an option is refused before git runs", () => {
  const root = repository(),
    written = path.join(temporaryDirectory("avoozl-security-out-"), "x");
  const head = `--output=${written}`;
  assert.throws(
    () => diffBase({ root, baseBranch: "main" }, head),
    /not an option/,
  );
  assert.throws(() => addedLines(root, null, head), /not an option/);
  assert.equal(
    fs.existsSync(written),
    false,
    "git wrote the file it was told to",
  );
  for (const bad of ["", "-x", "a b", "a\nb", 7])
    assert.throws(() => revision(bad), /not an option/);
  assert.equal(revision("HEAD"), "HEAD");
  assert.equal(revision("refs/heads/task/a-1"), "refs/heads/task/a-1");
  assert.deepEqual(addedLines(root, null, "HEAD"), []);
});

test("checks run without the Kiro Crew gateway credentials", async () => {
  const env = repositoryEnvironment({
    PATH: "/bin",
    KIROCREW_PROXY_SECRET: "s",
    KIROCREW_GATEWAY_ORIGIN_PROOF: "p",
  });
  assert.deepEqual(env, { PATH: "/bin" });
  const saved = process.env.KIROCREW_PROXY_SECRET;
  process.env.KIROCREW_PROXY_SECRET = "secret-for-test";
  try {
    const result = await commandEvidence(
      temporaryDirectory("avoozl-security-"),
      [
        process.execPath,
        "-e",
        "process.stdout.write(String(process.env.KIROCREW_PROXY_SECRET))",
      ],
    );
    assert.equal(result.stdout, "undefined");
  } finally {
    if (saved === undefined) delete process.env.KIROCREW_PROXY_SECRET;
    else process.env.KIROCREW_PROXY_SECRET = saved;
  }
});

test("a project branch that starts with a dash is refused", (t) => {
  const { root, store } = fixture(t);
  for (const key of ["baseBranch", "integrationBranch"]) {
    const filename = path.join(root, `.avoozl-${key}.json`);
    fs.writeFileSync(
      filename,
      JSON.stringify({
        version: 1,
        projects: { code: { root: "../code", [key]: "--upload-pack=x" } },
      }),
    );
    const configuration = new RepositorySettings(store, {
      workspaceRoot: root,
      files: { repository: filename },
      sources: [],
    });
    configuration.reload();
    assert.match(
      configuration.state.error?.message ?? "",
      /must not start with a dash/,
    );
  }
});

test(
  "a new database and its folders are private; old ones are tightened",
  {
    skip: process.platform === "win32" && "Node maps no modes on Windows",
  },
  async () => {
    const { Store, privateFile } = await import("../store.mjs");
    const mode = (file) => fs.statSync(file).mode & 0o777;
    const root = temporaryDirectory("avoozl-private-"),
      db = path.join(root, ".avoozl", "local", "workspace.sqlite");
    new Store(db).close();
    assert.equal(mode(path.join(root, ".avoozl")), 0o700);
    assert.equal(mode(path.join(root, ".avoozl", "local")), 0o700);
    assert.equal(mode(db), 0o600);
    // An existing workspace made with the old defaults is tightened on open.
    fs.chmodSync(path.join(root, ".avoozl"), 0o755);
    fs.chmodSync(db, 0o644);
    const again = new Store(db);
    again.db.exec("CREATE TABLE IF NOT EXISTS t(x)");
    again.close();
    assert.equal(mode(path.join(root, ".avoozl")), 0o700);
    assert.equal(mode(db), 0o600);
    for (const suffix of ["-wal", "-shm"])
      if (fs.existsSync(db + suffix)) assert.equal(mode(db + suffix), 0o600);
    // A database named elsewhere leaves its shared folder alone.
    const shared = temporaryDirectory("avoozl-shared-");
    fs.chmodSync(shared, 0o755);
    new Store(path.join(shared, "x.sqlite")).close();
    assert.equal(mode(shared), 0o755);
    assert.equal(mode(path.join(shared, "x.sqlite")), 0o600);
    // privateFile creates a missing file 0600 and tightens an open one.
    const out = path.join(shared, "out.json");
    privateFile(out);
    assert.equal(mode(out), 0o600);
    fs.chmodSync(out, 0o666);
    privateFile(out);
    assert.equal(mode(out), 0o600);
  },
);

test(
  "backup and export --output write 0600 files",
  {
    skip: process.platform === "win32" && "Node maps no modes on Windows",
  },
  async () => {
    const { spawnSync } = await import("node:child_process");
    const { initializeWorkspace } = await import("../workspace.mjs");
    const workspace = temporaryDirectory("avoozl-private-cli-"),
      out = temporaryDirectory("avoozl-private-out-"),
      cli = path.resolve(import.meta.dirname, "../../../cli.mjs");
    initializeWorkspace(workspace, { name: "t" });
    const previous = process.umask(0o022);
    try {
      for (const [command, name] of [
        ["backup", "b.sqlite"],
        ["export", "e.json"],
      ]) {
        const file = path.join(out, name),
          run = spawnSync(
            process.execPath,
            [cli, command, "--workspace", workspace, "--output", file],
            { encoding: "utf8" },
          );
        assert.equal(run.status, 0, run.stderr);
        assert.equal(fs.statSync(file).mode & 0o777, 0o600, command);
      }
    } finally {
      process.umask(previous);
    }
  },
);

test(
  "scripts/worktree runs only after a person approves its hash",
  {
    skip: process.platform === "win32" && "the helper is a shell script",
  },
  async (t) => {
    const { createWorktree, helperHash, projectConfig } = await import(
      "../git.mjs"
    );
    const { store } = fixture(t),
      root = repository(),
      helper = path.join(root, "scripts", "worktree");
    fs.mkdirSync(path.dirname(helper));
    fs.writeFileSync(
      helper,
      '#!/bin/sh\ntouch "$2.ran" 2>/dev/null; git worktree add -b "$1" "$2" "$3"\n',
      { mode: 0o755 },
    );
    const base = {
      id: "pj",
      root,
      worktreeRoot: path.join(temporaryDirectory("avoozl-wt-"), "wt"),
    };
    const unapproved = await projectConfig(base);
    await assert.rejects(
      createWorktree(store, unapproved, "r1"),
      (error) =>
        error.status === 409 &&
        error.message.includes(helperHash(helper)) &&
        !fs.existsSync(path.join(unapproved.worktreeRoot, "r1.ran")),
    );
    // Another hash is not an approval of this file.
    const wrong = await projectConfig({
      ...base,
      worktreeHelper: "0".repeat(64),
    });
    await assert.rejects(createWorktree(store, wrong, "r1"), /differs/);
    const approved = await projectConfig({
      ...base,
      worktreeHelper: helperHash(helper),
    });
    const made = await createWorktree(store, approved, "r1");
    assert.ok(fs.existsSync(made.worktree));
    // A changed helper needs a new approval.
    fs.appendFileSync(helper, "# changed\n");
    await assert.rejects(createWorktree(store, approved, "r2"), /differs/);
    // No helper: nothing to approve.
    fs.rmSync(helper);
    const plain = await createWorktree(store, unapproved, "r3");
    assert.ok(fs.existsSync(plain.worktree));
  },
);

test("checksEnv lists the variables a check may see; unset keeps today's", async () => {
  const { projectConfig } = await import("../git.mjs");
  const env = {
    PATH: "/bin",
    HOME: "/h",
    GH_TOKEN: "t",
    KEEP_ME: "k",
    KIROCREW_PROXY_SECRET: "s",
  };
  // Default: everything but the gateway credentials, as before.
  assert.deepEqual(repositoryEnvironment(env), {
    PATH: "/bin",
    HOME: "/h",
    GH_TOKEN: "t",
    KEEP_ME: "k",
  });
  // Listed: the basics plus the names given; the gateway secret never.
  assert.deepEqual(
    repositoryEnvironment(env, ["KEEP_ME", "KIROCREW_PROXY_SECRET"]),
    { PATH: "/bin", HOME: "/h", KEEP_ME: "k" },
  );
  const saved = { ...process.env };
  process.env.GH_TOKEN = "secret-token";
  process.env.KEEP_ME = "kept";
  try {
    const show = [
      process.execPath,
      "-e",
      "process.stdout.write(String(process.env.GH_TOKEN)+','+process.env.KEEP_ME)",
    ];
    const cwd = temporaryDirectory("avoozl-security-");
    assert.equal(
      (await commandEvidence(cwd, show)).stdout,
      "secret-token,kept",
    );
    assert.equal(
      (await commandEvidence(cwd, show, { env: ["KEEP_ME"] })).stdout,
      "undefined,kept",
    );
  } finally {
    for (const key of ["GH_TOKEN", "KEEP_ME"])
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
  }
  const root = repository();
  assert.deepEqual(
    (await projectConfig({ id: "pj", root, checksEnv: ["A_B"] })).checksEnv,
    ["A_B"],
  );
  await assert.rejects(
    projectConfig({ id: "pj", root, checksEnv: ["A B"] }),
    /environment variable names/,
  );
  assert.equal((await projectConfig({ id: "pj", root })).checksEnv, undefined);
});

test("project settings take checksEnv and worktreeHelper and refuse bad ones", (t) => {
  const { root, store } = fixture(t);
  const load = (project) => {
    const filename = path.join(root, `.avoozl-${Math.random()}.json`);
    fs.writeFileSync(
      filename,
      JSON.stringify({
        version: 1,
        projects: { code: { root: "../code", ...project } },
      }),
    );
    const configuration = new RepositorySettings(store, {
      workspaceRoot: root,
      files: { repository: filename },
      sources: [],
    });
    configuration.reload();
    return configuration.state.error?.message ?? "";
  };
  assert.equal(
    load({ checksEnv: ["GH_TOKEN"], worktreeHelper: "a".repeat(64) }),
    "",
  );
  assert.match(load({ checksEnv: ["a b"] }), /checksEnv/);
  assert.match(load({ checksEnv: "GH_TOKEN" }), /checksEnv/);
  assert.match(load({ worktreeHelper: "abc" }), /worktreeHelper/);
});
