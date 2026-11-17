// The privacy scan (task 56.11, Requirement 102.23-102.25, design §4.32.4):
// no public write or outgoing push names this machine, a host, an internal
// domain or a home path, and a refusal comes before the first write. Every
// machine name, username, domain and term here is made up.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  allowOnce,
  bindContentRules,
  enforceDiff,
  guardGitHub,
} from "../content-rules.mjs";
import { aliasProblem, machineAlias, setMachineAlias } from "../privacy.mjs";
import { appendRecord, validateRecord } from "../spec-journal.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");
process.env.GIT_CONFIG_GLOBAL = path.join(
  process.env.XDG_CONFIG_HOME,
  "gitconfig",
);
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, "");

const MACHINE = { hostname: "Velvetbox-Q7.example", username: "pemberly" },
  PRIVATE_NAME = "zorblat";

function workspace(t) {
  const root = temporaryDirectory("avoozl-privacy-"),
    configFile = path.join(root, "machine", "config.json"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(
    configFile,
    JSON.stringify({ privacy: { internalDomains: ["intra.example"] } }),
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      contentRules: {
        sets: [{ id: "fake-terms", boundaries: ["github", "diff"] }],
      },
    }),
  );
  fs.mkdirSync(path.join(root, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, ".avoozl", "local", "content-rules", "fake-terms.txt"),
    `codename: \\b${PRIVATE_NAME}\\b\n`,
  );
  bindContentRules(store, {
    workspaceRoot: root,
    configFile,
    machine: MACHINE,
  });
  return { root, store, configFile };
}

// A fake GitHub client that records every write it receives.
function fakeGitHub(store) {
  const writes = [];
  const record =
    (name) =>
    async (...args) => (writes.push(name), { number: 1, id: 1 });
  const client = Object.fromEntries(
    [
      "createIssue",
      "updateIssue",
      "createIssueComment",
      "createPullRequest",
      "createCommitStatus",
      "createBranch",
      "createLinkedBranch",
      "mergeBranch",
      "armAutoMerge",
      "createPendingReview",
    ].map((name) => [name, record(name)]),
  );
  return { github: guardGitHub(client, store), writes };
}

// Each public field, as the call that writes it with `value` inside.
const REPO = { id: "example/code", owner: "example", repo: "code" };
const PUBLIC_FIELDS = {
  "issue title": (g, v) =>
    g.createIssue(REPO, { title: `Ship ${v}`, body: "" }),
  "issue body": (g, v) =>
    g.createIssue(REPO, { title: "Ship", body: `On ${v}` }),
  "issue edit": (g, v) => g.updateIssue(REPO, 3, { body: `On ${v}` }),
  "status comment": (g, v) => g.createIssueComment(REPO, 3, `Ran on ${v}`),
  "pull request title": (g, v) =>
    g.createPullRequest(REPO, {
      title: `Fix ${v}`,
      body: "",
      head: "x",
      base: "main",
    }),
  "pull request body": (g, v) =>
    g.createPullRequest(REPO, {
      title: "Fix",
      body: `From ${v}`,
      head: "x",
      base: "main",
    }),
  "pull request branch": (g, v) =>
    g.createPullRequest(REPO, {
      title: "Fix",
      body: "",
      head: v,
      base: "main",
    }),
  "check summary": (g, v) =>
    g.createCommitStatus(REPO, "abc1234", {
      state: "success",
      context: "avoozl",
      description: `Passed on ${v}`,
    }),
  "branch name": (g, v) => g.createBranch(REPO, v, "abc1234"),
  "linked branch": (g, v) =>
    g.createLinkedBranch({
      issueId: "I_1",
      repositoryId: "R_1",
      oid: "abc1234",
      name: v,
    }),
  "merge message": (g, v) =>
    g.mergeBranch(REPO, {
      base: "spec/a",
      head: "main",
      message: `Merge on ${v}`,
    }),
  "squash message": (g, v) =>
    g.armAutoMerge(REPO, "PR_1", "SQUASH", { headline: `Land ${v}`, body: "" }),
  "review draft": (g, v) =>
    g.createPendingReview(REPO, 4, {
      commit_id: "abc1234",
      body: "",
      comments: [{ path: "a", line: 1, body: `See ${v}` }],
    }),
};

const INTERNAL = {
  hostname: "Velvetbox-Q7",
  "full hostname": "Velvetbox-Q7.example",
  username: "pemberly",
  "home path": "/Users/pemberly/src",
  "linux home": "/home/someone/src",
  "windows home": "C:\\Users\\someone\\src",
  "tilde path": "~/notes",
  "IPv4 literal": "10.20.30.40",
  "IPv6 literal": "fd00:1:2:3::9",
  loopback: "localhost:4100",
  "internal domain": "build.corp",
  "internal URL": "https://wiki.internal/page",
  "private domain list": "ci.intra.example",
  "private name": PRIVATE_NAME,
};

test("a made-up hostname, username and private name in every public field is refused with nothing written", async (t) => {
  const { store } = workspace(t);
  const { github, writes } = fakeGitHub(store);
  for (const [field, write] of Object.entries(PUBLIC_FIELDS))
    for (const [kind, value] of Object.entries(INTERNAL))
      await assert.rejects(
        write(github, value),
        (error) =>
          error.contentBlocked === true &&
          !error.message.includes(value) &&
          !error.message.includes("pemberly"),
        `${field}: ${kind}`,
      );
  assert.deepEqual(writes, []);
  // A decision names the set, rule and target, never the matched text.
  const saved = JSON.stringify(store.list("content_decisions"));
  for (const value of ["pemberly", "Velvetbox", PRIVATE_NAME, "intra.example"])
    assert.ok(!saved.includes(value), value);
});

test("useful public references pass: opaque IDs, commits, checks and GitHub links", async (t) => {
  const { store } = workspace(t);
  const { github, writes } = fakeGitHub(store);
  const clean = [
    "Avoozl journal: outcome a1b2c3d4e5f60718 at abc1234def",
    "Checks: test (ubuntu-latest) success, run 7",
    "See https://github.com/example/code/pull/12 and example/code#3",
    "Machine Draco landed v1.2.3",
  ].join("\n");
  for (const write of Object.values(PUBLIC_FIELDS))
    await write(github, clean.split("\n")[0]);
  await github.createIssueComment(REPO, 3, clean);
  assert.equal(writes.length, Object.keys(PUBLIC_FIELDS).length + 1);
});

test("a false hit is allowed once with a reason, then blocks again", async (t) => {
  const { store } = workspace(t);
  const { github, writes } = fakeGitHub(store);
  const body = "Bind to localhost in the example";
  await assert.rejects(github.createIssueComment(REPO, 3, body));
  const [decision] = store.list("content_decisions");
  assert.deepEqual(
    [decision.set, decision.rules],
    ["builtin:privacy", ["loopback"]],
  );
  allowOnce(store, { id: decision.id, reason: "Example text, not a host." });
  await github.createIssueComment(REPO, 3, body);
  await assert.rejects(github.createIssueComment(REPO, 3, body));
  assert.equal(writes.length, 1);
});

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function repository(root) {
  const repo = path.join(root, "code");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "a@example.test");
  git(repo, "config", "user.name", "A");
  fs.writeFileSync(path.join(repo, "a.txt"), "base\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "Base");
  return repo;
}

function commit(repo, branch, file, text, message) {
  git(repo, "checkout", "-q", "-B", branch, "main");
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, "add", ".");
  git(repo, "commit", "-qm", message);
}

test("an outgoing range is refused for its ref name, commit message or added lines", (t) => {
  const { root, store } = workspace(t),
    repo = repository(root),
    project = { id: "code", root: repo, baseBranch: "main" },
    push = (taskId) =>
      enforceDiff(store, { project, head: "HEAD", taskId, mode: "refuse" });
  for (const [name, branch, text, message] of [
    ["ref name", `task/${PRIVATE_NAME}`, "ok\n", "Add a"],
    ["ref name host", "task/velvetbox-q7", "ok\n", "Add a"],
    ["commit message", "task/b", "ok\n", `Built on ${MACHINE.hostname}`],
    ["commit message IP", "task/c", "ok\n", "Reached 10.20.30.40"],
    ["commit message private", "task/d", "ok\n", `Ship ${PRIVATE_NAME}`],
    ["added line username", "task/e", "owner = pemberly\n", "Add e"],
    ["added line private domain", "task/f", "api.intra.example\n", "Add f"],
  ]) {
    commit(repo, branch, "b.txt", text, message);
    assert.throws(
      () => push(name.replace(/\s/g, "-")),
      (error) =>
        error.status === 422 &&
        !error.message.includes("pemberly") &&
        !error.message.includes(PRIVATE_NAME),
      name,
    );
  }
  // Code may say `options.local` or a loopback address; prose may not.
  commit(
    repo,
    "task/ok",
    "c.mjs",
    "const host = options.local ?? '127.0.0.1';\n",
    "Add a default host",
  );
  assert.equal(push("ok").ok, true);
  // A named ref is checked in place of the checked-out branch.
  assert.throws(
    () =>
      enforceDiff(store, {
        project,
        head: "HEAD",
        taskId: "named",
        mode: "refuse",
        refs: [`refs/heads/spec/${PRIVATE_NAME}`],
      }),
    /refused/,
  );
});

test("a journal record names a machine only by its alias, and the scan refuses one that names it", async (t) => {
  const { configFile } = workspace(t),
    entries = [],
    journal = {
      list: async () => entries,
      create: async (body) => (entries.push(body), { id: 1 }),
      permission: async () => "admin",
    },
    options = {
      visibility: "public",
      publicRepositories: ["example/code"],
      machine: MACHINE,
      configFile,
    },
    fields = {
      op: "op-1",
      kind: "control",
      spec: "a1b2c3d4e5f60718",
      controls: [{ flag: "hold", id: "h1" }],
    };
  assert.throws(
    () =>
      validateRecord(
        { v: 1, generation: 0, prev: null, ...fields, hostname: "x" },
        options,
      ),
    /may not carry: hostname/,
  );
  for (const alias of ["Velvetbox-Q7", "pemberly", "Pemberly-2"])
    await assert.rejects(
      appendRecord(journal, fields, { ...options, alias }),
      /privacy scan refused/,
      alias,
    );
  await assert.rejects(
    appendRecord(journal, { ...fields, alias: "Velvetbox-Q7" }, options),
    /privacy scan refused/,
  );
  assert.deepEqual(entries, []);
  const alias = machineAlias({ configFile, machine: MACHINE });
  await appendRecord(journal, fields, { ...options, alias });
  assert.equal(entries.length, 1);
  assert.ok(entries[0].includes(`"alias":"${alias}"`));
});

test("an unset alias is a neutral generated name, stored once; Settings refuses one naming this machine", (t) => {
  const { configFile } = workspace(t);
  const first = machineAlias({ configFile, machine: MACHINE });
  assert.match(first, /^[A-Z][a-z]+-[A-Z][a-z]+$/);
  assert.equal(aliasProblem(first, MACHINE), null);
  assert.equal(machineAlias({ configFile, machine: MACHINE }), first);
  const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
  assert.equal(saved.machine.alias, first);
  assert.deepEqual(saved.privacy.internalDomains, ["intra.example"]);
  assert.throws(
    () =>
      setMachineAlias({ configFile, alias: "Pemberly-Box", machine: MACHINE }),
    /hostname or username/,
  );
  assert.throws(
    () =>
      setMachineAlias({
        configFile,
        alias: "velvetbox-q7-2",
        machine: MACHINE,
      }),
    /hostname or username/,
  );
  assert.equal(
    setMachineAlias({ configFile, alias: "Draco", machine: MACHINE }),
    "Draco",
  );
  assert.equal(machineAlias({ configFile, machine: MACHINE }), "Draco");
});
