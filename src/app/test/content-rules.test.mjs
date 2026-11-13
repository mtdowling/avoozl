// Content rules (tasks 10.1–10.7, design §4.9, Requirement 40): the matcher,
// policy validation, terms files, the time limit, the pre-push hook, the
// guarded GitHub client and rules plugins. Every term is fake.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  addedLines,
  bindContentRules,
  check,
  describeSets,
  enforce,
  findPlanningLeak,
  gitExposure,
  guardGitHub,
  installPushHook,
  matchInWorker,
  parseTerms,
  screenReply,
  secretReason,
  validateContentRules,
} from "../content-rules.mjs";
import { checkReply } from "../plugin-contract.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");
// This machine's own Git settings (a global ignore file) stay out.
process.env.GIT_CONFIG_GLOBAL = path.join(
  process.env.XDG_CONFIG_HOME,
  "gitconfig",
);
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, "");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function workspace(t, sets, terms = {}) {
  const root = temporaryDirectory("avoozl-cr-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, contentRules: { sets } }),
  );
  for (const [id, text] of Object.entries(terms)) {
    fs.mkdirSync(path.join(root, ".avoozl", "local", "content-rules"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, ".avoozl", "local", "content-rules", `${id}.txt`),
      text,
    );
  }
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "config", "config.json"),
  });
  return { root, store };
}

test("validation refuses rules in .avoozl.json, reserved ids, unknown boundaries and plugins", () => {
  assert.deepEqual(validateContentRules(undefined), { sets: [] });
  const ok = validateContentRules({
    sets: [{ id: "a" }, { id: "b", action: "report", boundaries: ["diff"] }],
  });
  assert.deepEqual(
    ok.sets.map((s) => [s.id, s.action, s.boundaries]),
    [
      ["a", "block", null],
      ["b", "report", ["diff"]],
    ],
  );
  for (const [value, pattern] of [
    [{ sets: [{ id: "a", terms: ["x"] }] }, /could hold a rule/],
    [{ terms: { a: "x" }, sets: [] }, /could hold a rule/],
    [{ sets: [{ id: "a", patterns: [] }] }, /could hold a rule/],
    [{ sets: [{ id: "builtin:reply-safety" }] }, /reserved/],
    [{ sets: [{ id: "a" }, { id: "a" }] }, /named twice/],
    [{ sets: [{ id: "a", boundaries: ["email"] }] }, /may list only/],
    [{ sets: [{ id: "a", action: "redact" }] }, /block or report/],
  ])
    assert.throws(() => validateContentRules(value), pattern);
  assert.throws(
    () =>
      validateContentRules(
        { sets: [{ id: "a", plugin: "missing" }] },
        { pluginIds: ["other"] },
      ),
    /names no plugins entry/,
  );
  assert.throws(
    () =>
      validateContentRules(
        { sets: [{ id: "a", repositories: ["x/y"] }] },
        { repositories: ["example/app"] },
      ),
    /not a registered repository/,
  );
});

test("the matcher finds encoded terms per line and never returns the text", (t) => {
  const { store } = workspace(t, [{ id: "fake-terms" }], {
    "fake-terms": "# fake\ncodename: \\bzorblat\\b\n",
  });
  for (const text of [
    "a zorblat here",
    "ZORBLAT",
    "zorbl&#97;t",
    "zorb%6cat",
    "zorb%256cat",
    "zor\u200bblat",
  ]) {
    const { findings } = check(store, {
      boundary: "plan",
      target: "x.md",
      text: `first\n${text}`,
    });
    assert.deepEqual(
      findings.map((f) => [f.set, f.rule, f.target, f.line]),
      [["fake-terms", "codename", "x.md", 2]],
      text,
    );
    assert.doesNotMatch(JSON.stringify(findings), /zorbl|ZORBL/);
  }
  assert.deepEqual(
    check(store, { boundary: "plan", target: "x", text: "zorblatx" }).findings,
    [],
  );
});

test("a slow rule times out in about two seconds and fails closed", () => {
  const started = Date.now();
  assert.throws(
    () =>
      matchInWorker(
        [{ set: "s", rule: "slow", source: "(a+)+$" }],
        ["a".repeat(40) + "!"],
      ),
    (error) => error.timeout === true,
  );
  const took = Date.now() - started;
  assert.ok(took >= 1900 && took < 4000, `took ${took} ms`);
  // The next check gets a fresh worker.
  assert.deepEqual(
    matchInWorker([{ set: "s", rule: "r", source: "b" }], ["abc"]),
    [{ index: 0, set: "s", rule: "r" }],
  );
});

test("a terms file Git tracks or does not ignore is refused; a missing one fails closed", (t) => {
  const { root, store } = workspace(t, [{ id: "fake-terms" }]);
  let [set] = describeSets(store).sets;
  assert.equal(set.available, false);
  assert.match(set.reason, /no terms file/);
  const result = enforce(store, { boundary: "brief", target: "b", text: "x" });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.unavailable.map((u) => u.set),
    ["fake-terms"],
  );
  git(root, "init", "-q");
  const file = path.join(
    root,
    ".avoozl",
    "local",
    "content-rules",
    "fake-terms.txt",
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "codename: zorblat\n");
  assert.match(gitExposure(file), /not ignored/);
  fs.writeFileSync(path.join(root, ".gitignore"), ".avoozl/local/\n");
  assert.equal(gitExposure(file), null);
  [set] = describeSets(store).sets;
  assert.equal(set.available, true);
  assert.equal(set.ruleCount, 1);
  assert.equal(JSON.stringify(describeSets(store)).includes("zorblat"), false);
  git(root, "add", "-f", file);
  assert.equal(gitExposure(file), "Git tracks it");
  [set] = describeSets(store).sets;
  assert.match(set.reason, /refused: Git tracks it/);
  assert.equal(parseTerms("a: b").length, 1);
  assert.throws(() => parseTerms("nothing"), /rule: regex/);
});

test("added lines only: a line already in the base never matches", () => {
  const repo = temporaryDirectory("avoozl-cr-git-");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "T");
  fs.writeFileSync(path.join(repo, "a.txt"), "old zorblat\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "base");
  const base = git(repo, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo, "a.txt"), "old zorblat\nnew line\n");
  git(repo, "commit", "-qam", "work");
  assert.deepEqual(addedLines(repo, base, "HEAD"), [
    { target: "a.txt", line: 2, text: "new line" },
  ]);
});

test("the pre-push hook goes in one linked worktree, not the main checkout's hooks", (t) => {
  const repo = temporaryDirectory("avoozl-cr-hook-"),
    remote = temporaryDirectory("avoozl-cr-remote-");
  git(remote, "init", "-q", "--bare");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "T");
  git(repo, "commit", "-q", "--allow-empty", "-m", "base");
  git(repo, "remote", "add", "origin", remote);
  const worktree = path.join(temporaryDirectory("avoozl-cr-wt-"), "wt");
  git(repo, "worktree", "add", "-q", "-b", "avoozl/x", worktree);
  // A stand-in for the CLI: refuse every push and say so.
  const cli = path.join(repo, "..", "fake-cli.mjs");
  fs.writeFileSync(
    cli,
    'console.error("refused by fake hook"); process.exit(1);\n',
  );
  const { hook } = installPushHook(worktree, {
    cli,
    workspaceRoot: repo,
    taskId: "x",
  });
  assert.ok(fs.existsSync(hook));
  assert.equal(
    fs.existsSync(path.join(repo, ".git", "hooks", "pre-push")),
    false,
  );
  assert.equal(
    spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: repo })
      .status,
    1,
    "the main checkout keeps its own hooks",
  );
  const pushed = spawnSync("git", ["push", "-q", "origin", "avoozl/x"], {
    cwd: worktree,
    encoding: "utf8",
  });
  assert.notEqual(pushed.status, 0);
  assert.match(pushed.stderr, /refused by fake hook/);
  const main = spawnSync("git", ["push", "-q", "origin", "main"], {
    cwd: repo,
    encoding: "utf8",
  });
  assert.equal(main.status, 0, main.stderr);
  // Installing again changes nothing.
  assert.equal(
    installPushHook(worktree, { cli, workspaceRoot: repo, taskId: "x" }).hook,
    hook,
  );
  assert.throws(
    () => installPushHook(repo, { cli, workspaceRoot: repo, taskId: "x" }),
    /linked worktree/,
  );
  t.after(() => {});
});

test("the guarded GitHub client blocks a matching write and lets the rest through", async (t) => {
  const { store } = workspace(
    t,
    [{ id: "fake-terms", boundaries: ["github"] }],
    {
      "fake-terms": "codename: \\bzorblat\\b\n",
    },
  );
  const writes = [];
  const github = guardGitHub(
    {
      createIssue: async (config, input) => (
        writes.push(input.title),
        { number: 1 }
      ),
      issue: async () => ({ title: "zorblat may be read" }),
    },
    store,
  );
  await assert.rejects(
    github.createIssue(
      { id: "example/app" },
      { title: "Ship zorblat", body: "" },
    ),
    (error) => error.contentBlocked === true && !/zorblat/.test(error.message),
  );
  await github.createIssue(
    { id: "example/app" },
    { title: "Ship it", body: "" },
  );
  assert.deepEqual(writes, ["Ship it"]);
  assert.equal((await github.issue()).title, "zorblat may be read");
  const [decision] = store.list("content_decisions");
  assert.deepEqual(
    [decision.kind, decision.set, decision.rules, decision.boundary],
    ["match", "fake-terms", ["codename"], "github"],
  );
});

test("a rules plugin reply is schema-checked", () => {
  assert.deepEqual(
    checkReply("rules", "ruleSets", {
      sets: [{ id: "s", version: "1", rules: [{ id: "r", pattern: "x" }] }],
    }),
    { sets: [{ id: "s", version: "1", rules: [{ id: "r", source: "x" }] }] },
  );
  for (const reply of [
    {},
    { sets: [{ id: "s", rules: [] }] },
    { sets: [{ id: "s", version: "1", rules: [{ id: "r" }] }] },
    { sets: [{ id: "s", version: "1", rules: [{ id: "r", pattern: "(" }] }] },
  ])
    assert.throws(() => checkReply("rules", "ruleSets", reply));
});

// Allowed patterns (task 10.8, R40.15). Every term is fake.
const ALLOW_TERMS = [
  "codename: \\bzorblat\\b",
  "host: \\bbuild\\d+\\.corp\\.example\\b",
  "allow: \\bzorblat-public\\b",
  "allow host: \\bbuild0\\.corp\\.example\\b",
  "",
].join("\n");

test("allow: cancels any rule's match on the same line; other lines still block", (t) => {
  const { store } = workspace(t, [{ id: "fake-terms" }], {
    "fake-terms": ALLOW_TERMS,
  });
  const found = (text) =>
    check(store, { boundary: "plan", target: "x.md", text }).findings.map(
      (f) => [f.rule, f.line],
    );
  // Allowed on its own line, even encoded and in any case.
  assert.deepEqual(found("ship ZORBLAT-public"), []);
  assert.deepEqual(found("ship zorbl&#97;t-public"), []);
  // A line the allow pattern does not match still blocks.
  assert.deepEqual(found("zorblat-public\nzorblat alone"), [["codename", 2]]);
  const result = enforce(store, {
    boundary: "plan",
    target: "x.md",
    text: "zorblat-public\nzorblat alone",
  });
  assert.equal(result.ok, false);
  // A cancelled match is counted, never a finding.
  const allowed = check(store, {
    boundary: "plan",
    target: "x.md",
    text: "zorblat-public\nzorblat-public again",
  });
  assert.deepEqual(allowed.findings, []);
  assert.deepEqual(allowed.allowed, [
    { set: "fake-terms", rule: "codename", count: 2 },
  ]);
  // Diffs: per added line.
  assert.deepEqual(
    check(store, {
      boundary: "diff",
      added: [
        { target: "a.txt", line: 3, text: "see zorblat-public" },
        { target: "a.txt", line: 9, text: "see zorblat" },
      ],
    }).findings.map((f) => [f.target, f.line]),
    [["a.txt", 9]],
  );
});

test("allow <rule>: cancels only that rule's match", (t) => {
  const { store } = workspace(t, [{ id: "fake-terms" }], {
    "fake-terms": ALLOW_TERMS,
  });
  const found = (text) =>
    check(store, { boundary: "brief", target: "b", text }).findings.map(
      (f) => f.rule,
    );
  assert.deepEqual(found("build0.corp.example"), []);
  assert.deepEqual(found("build7.corp.example"), ["host"]);
  // The host allow does not cancel the codename rule on the same line.
  assert.deepEqual(found("build0.corp.example zorblat"), ["codename"]);
});

test("a bad allow line makes the set unavailable and never repeats its text", (t) => {
  for (const [terms, line] of [
    ["codename: zorblat\nallow nosuchrule: quartz\n", 2],
    ["codename: zorblat\n\nallow: quartz(\n", 3],
    ["codename: zorblat\nallow:\n", 2],
  ]) {
    const { store } = workspace(t, [{ id: "fake-terms" }], {
      "fake-terms": terms,
    });
    const [set] = describeSets(store).sets;
    assert.equal(set.available, false, terms);
    assert.match(set.reason, new RegExp(`line ${line}\\b`), terms);
    assert.doesNotMatch(
      JSON.stringify(describeSets(store)),
      /zorblat|quartz|nosuchrule/,
    );
    assert.equal(
      enforce(store, { boundary: "plan", target: "x", text: "fine" }).ok,
      false,
    );
  }
});

test("allow lines never reach the built-in sets", (t) => {
  const { store } = workspace(t, [{ id: "fake-terms" }], {
    "fake-terms": "codename: zorblat\nallow: .\n",
  });
  assert.deepEqual(
    check(store, { boundary: "github", target: "t", text: "zorblat" }).findings,
    [],
  );
  const token = "ghp_" + "a".repeat(36);
  assert.ok(screenReply(`token ${token}`).length > 0);
  assert.ok(secretReason(`token ${token}`));
  assert.ok(
    findPlanningLeak(
      [["body", "see example-org/secret-plans#1"]],
      "example-org/secret-plans",
    ),
  );
});

test("a rules plugin cannot return allow patterns", () => {
  for (const set of [
    { id: "s", version: "1", rules: [{ id: "r", pattern: "x" }], allow: ["y"] },
    { id: "s", version: "1", rules: [{ id: "r", pattern: "x", allow: "y" }] },
  ])
    assert.throws(
      () => checkReply("rules", "ruleSets", { sets: [set] }),
      /cannot.*exception into the rule's pattern/,
    );
});
