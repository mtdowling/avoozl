// Proof P28: content rules with fake terms and a fake rules plugin (tasks.md
// Phase 10, design §4.9, Requirement 40). An isolated temporary workspace,
// a sample git repository, fake sessions (fake-crew.mjs), three rule sets
// (a terms file in the workspace, a report set whose terms file sits outside
// it, and a set from the fake rules plugin), and fake GitHub writers. Every
// term is fake. Actions (3), (6) and the Project field write (4) have their
// own tests at the end of this file and in github-project.test.mjs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { handleMcp } from "../mcp.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { writePluginSettings } from "../plugins.mjs";
import {
  check,
  describeSets,
  enforce,
  loadRulePlugins,
} from "../content-rules.mjs";
import { snapshot } from "./fixtures.mjs";
import { commitIn, fakeCrew, git } from "./fake-crew.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");
// This machine's own Git settings (a global ignore file) stay out.
process.env.GIT_CONFIG_GLOBAL = path.join(
  process.env.XDG_CONFIG_HOME,
  "gitconfig",
);
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, "");

const FIXTURE = path.join(import.meta.dirname, "fixtures", "plugins");
const CHECK = "scripts/validate.sh";
const A = "p28.1",
  B = "p28.2";
const aliases = { [A]: "a", [B]: "b" };
// Every blocking term, plain and encoded. `fileshare/teams` belongs to the
// report set, whose content is written by design, so it is not here.
const TERMS = [
  /zorblat/i,
  /zorbl&#97;t/i,
  /zorb%6cat/i,
  /build7\.corp\.example/i,
  /build7%2ecorp/i,
  /project[- ]?x\b/i,
];

const leaf = (summary, extra = {}) => ({
  kind: "leaf",
  repository: "app",
  summary,
  acceptance: [summary],
  checks: [CHECK],
  completion: "integrated",
  milestone: "one",
  ...extra,
});

const tasksMd = (note) =>
  ["# Tasks", "", note, "", "- [ ] 1 Write a", "- [ ] 2 Write b on a", ""].join(
    "\n",
  );

const spec = (note = "Plain words only.") => ({
  "requirements.md": "# Content rules proof\n\nTwo leaves, a then b.\n",
  "design.md": "# Design\n\nA writes src/a.txt; b builds on it.\n",
  "tasks.md": tasksMd(note),
  "avoozl/manifest.json": JSON.stringify(
    {
      tasks: {
        1: leaf("a changes src/a.txt."),
        2: leaf("b keeps fileshare/teams paths out of src/b.txt.", {
          acceptance: ["src/b.txt names no share."],
          requires: ["1"],
        }),
      },
    },
    null,
    2,
  ),
});

function policy(extra = {}) {
  return JSON.stringify({
    version: 1,
    delivery: { concurrency: 1, retries: 2, model: "fake-a" },
    contentRules: {
      sets: [
        { id: "fake-terms" },
        { id: "fake-paths", action: "report", boundaries: ["brief"] },
        { id: "fake-plugin-set", plugin: "fake-rules" },
      ],
    },
    ...extra,
  });
}

async function workspace(t) {
  const root = temporaryDirectory("avoozl-p28-"),
    checkout = path.join(root, "app"),
    remote = temporaryDirectory("avoozl-p28-remote-"),
    outside = temporaryDirectory("avoozl-p28-outside-");
  // The planning workspace is a Git checkout that ignores .avoozl/local/.
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(root, ".gitignore"), ".avoozl/local/\napp/\n");
  git(root, "add", ".gitignore");
  git(root, "commit", "-qm", "Start");
  const terms = path.join(root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(terms, { recursive: true });
  fs.writeFileSync(
    path.join(terms, "fake-terms.txt"),
    "# Fake terms for P28\ncodename: \\bzorblat\\b\nhost: \\bbuild\\d+\\.corp\\.example\\b\n",
  );
  // The report set's terms file sits outside the workspace, named in this
  // machine's settings.
  const pathsFile = path.join(outside, "fake-paths.txt");
  fs.writeFileSync(pathsFile, "share: \\bfileshare/teams\\b\n");
  const config = path.join(process.env.XDG_CONFIG_HOME, "avoozl");
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(
    path.join(config, "config.json"),
    JSON.stringify({
      version: 1,
      contentRules: { terms: { "fake-paths": pathsFile } },
    }),
  );
  // The sample code repository: its base already names the fake host.
  fs.mkdirSync(path.join(checkout, "scripts"), { recursive: true });
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  fs.writeFileSync(
    path.join(checkout, "hosts.txt"),
    "legacy build7.corp.example\n",
  );
  fs.writeFileSync(path.join(checkout, CHECK), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(remote, "init", "-q", "--bare");
  git(checkout, "remote", "add", "origin", remote);
  // The fake rules plugin, declared and approved on this machine.
  const crashFile = path.join(outside, "crash"),
    pluginSettingsFile = path.join(config, "plugins.json");
  writePluginSettings(pluginSettingsFile, {
    plugins: [
      {
        id: "fake-rules",
        path: path.join(FIXTURE, "fake-rules"),
        contract: 1,
        config: { crashFile },
      },
    ],
  });
  fs.writeFileSync(path.join(root, ".avoozl.json"), policy());
  // The CLI's default database, so the pre-push hook finds it.
  const store = new Store(path.join(terms, "..", "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  const ops = new Operations(store, {
    workspaceRoot: root,
    pluginSettingsFile,
    operator: "owner",
  });
  const listed = await ops.execute("plugins.list", {});
  await ops.execute("plugin.approve", {
    id: "fake-rules",
    hash: listed.plugins[0].hash,
  });
  await ops.execute("project.configure", {
    id: "app",
    root: checkout,
    baseBranch: "main",
    checks: [[CHECK]],
  });
  return {
    root,
    checkout: fs.realpathSync(checkout),
    store,
    ops,
    terms,
    crashFile,
  };
}

const planner = { caller: { sessionKey: "dashboard:planner-1" }, mcp: true };
const openDecisions = (store, kind) =>
  store
    .list("content_decisions")
    .filter((d) => d.state === "open" && (!kind || d.kind === kind));

async function approve(ops) {
  const preview = await ops.execute("plan.preview", { id: "p28" });
  return ops.execute("plan.approve", {
    id: "p28",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
}

const passed = [{ command: CHECK, exitCode: 0 }];
const defaults = (role) =>
  role === "worker"
    ? async ({ session, worktree, report }) => {
        const commit = commitIn(
          await worktree(),
          `src/${session.alias}.txt`,
          `${session.alias} ${session.attempt}\n`,
          `Work ${session.alias}`,
        );
        await report({ commit });
        return commit;
      }
    : role === "verifier"
      ? ({ session, report }) =>
          report({ commit: session.commit, checks: passed })
      : ({ session, report }) =>
          report({ commit: session.commit, verdict: "approved" });

test("P28: content rules block, ask, allow once, fail closed, and never leak a term", async (t) => {
  const env = await workspace(t),
    { root, store, ops, terms, checkout } = env;

  // Settings shows each set, its source kind and availability, never a rule.
  const rules = await ops.execute("content.rules", {});
  assert.deepEqual(
    rules.sets.map((s) => [s.id, s.source, s.available, s.action]),
    [
      ["fake-terms", "file", true, "block"],
      ["fake-paths", "file", true, "report"],
      ["fake-plugin-set", "plugin", true, "block"],
    ],
  );
  assert.equal(rules.sets[1].termsFrom, "machine");
  assert.equal(rules.sets[2].version, "1.0.0");
  assert.equal(rules.builtins.length, 3);

  // (1) The planner's draft names the codename in design.md: refused in-call
  // with set, rule, file and line; no decision opens.
  writeSpec(root, "p28", {
    ...spec(),
    "design.md": "# Design\n\nThe zorblat loader.\n",
  });
  await assert.rejects(
    ops.execute("plan.create", { spec: "p28" }, undefined, planner),
    (error) =>
      error.status === 422 &&
      /fake-terms rule codename at p28\/design\.md line 3/.test(
        error.message,
      ) &&
      !/zorblat/i.test(error.message),
  );
  assert.equal(store.get("plans", "p28"), null);
  assert.deepEqual(openDecisions(store), []);
  assert.ok(
    store.events({ limit: 1000 }).some((e) => e.kind === "content.refused"),
  );

  // (2) A person puts the line in tasks.md and approves: refused with a
  // content.match diagnostic and a decision. Allow once, approve again.
  writeSpec(root, "p28", spec("Codename zorblat stays internal."));
  await ops.execute("plan.create", { spec: "p28" });
  const lint = await ops.execute("plan.lint", { id: "p28" });
  assert.ok(
    lint.diagnostics.some(
      (d) =>
        d.code === "content.match" &&
        d.file === "tasks.md" &&
        d.lineStart === 3,
    ),
  );
  await assert.rejects(approve(ops), /content\.match/);
  const [blocked] = openDecisions(store, "match");
  assert.deepEqual(
    [
      blocked.set,
      blocked.rules,
      blocked.boundary,
      blocked.target,
      blocked.line,
    ],
    ["fake-terms", ["codename"], "plan", "p28/tasks.md", 3],
  );
  const shown = await ops.execute("content.show", { id: blocked.id });
  assert.equal(shown.text, "Codename zorblat stays internal.");
  await assert.rejects(
    ops.execute(
      "content.allow",
      { id: blocked.id, reason: "x" },
      undefined,
      planner,
    ),
    (error) => error.status === 403,
  );
  const allowed = await ops.execute("content.allow", {
    id: blocked.id,
    reason: "The codename is public after launch.",
  });
  assert.deepEqual(
    [allowed.allowances[0].by, allowed.allowances[0].reason],
    ["owner", "The codename is public after launch."],
  );
  assert.match(allowed.allowances[0].contentHash, /^[0-9a-f]{64}$/);
  await approve(ops);
  assert.ok(store.list("content_allowances").every((a) => a.usedAt));

  // (5) Worker a adds a line naming the fake host: done is refused in-call,
  // the hook stops the push, and the fixed commit is accepted and lands.
  let pushed = null;
  const crew = fakeCrew(ops, {
    aliases,
    defaults,
    scripts: {
      "a:worker:1": async ({ session, worktree, report, refused }) => {
        const tree = await worktree();
        const bad = commitIn(
          tree,
          "src/a.txt",
          "deploy to build7.corp.example\n",
          "Work a",
        );
        await refused(
          { commit: bad },
          (error) =>
            /fake-terms rule host at src\/a\.txt line 1/.test(error.message) &&
            !/build7/.test(error.message),
        );
        pushed = spawnSync("git", ["push", "-q", "origin", `avoozl/${A}`], {
          cwd: tree,
          encoding: "utf8",
        });
        fs.writeFileSync(path.join(tree, "src", "a.txt"), "deploy a\n");
        git(tree, "add", ".");
        git(tree, "commit", "-q", "--amend", "-m", "Work a");
        const good = git(tree, "rev-parse", "HEAD");
        await report({ commit: good });
        return good;
      },
    },
  });
  const first = await crew.tick();
  assert.deepEqual(
    first.dispatch.map((d) => [aliases[d.task], d.role]),
    [["a", "worker"]],
  );
  await crew.play();
  assert.notEqual(pushed.status, 0, "the hook stopped the push");
  assert.match(pushed.stderr, /fake-terms rule host/);
  assert.doesNotMatch(pushed.stderr, /build7/);
  assert.equal(
    spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: checkout })
      .status,
    1,
    "the main checkout keeps its own hooks",
  );
  for (
    let i = 0;
    i < 4 && !store.read().tasks.find((x) => x.id === A).integration;
    i++
  ) {
    await crew.tick();
    await crew.play((s) => s.alias === "a");
  }
  await crew.tick();
  assert.ok(store.read().tasks.find((x) => x.id === A).integration, "a lands");
  assert.equal(
    git(checkout, "show", "main:hosts.txt"),
    "legacy build7.corp.example",
    "a base line never blocks",
  );

  // (8) b's brief quotes its issue line that matches the report set: it is
  // sent, and the Delivery view shows one fake-paths finding with one
  // notification.
  const bWorker = crew.find("b", "worker", 1);
  assert.ok(bWorker, "b's brief was sent");
  assert.match(bWorker.brief, /fileshare\/teams/);
  const delivery = await ops.execute("delivery.view", {});
  assert.deepEqual(
    delivery.contentReports.map((r) => [r.set, r.rule, r.boundary, r.taskId]),
    [["fake-paths", "share", "brief", B]],
  );
  assert.equal(
    store
      .list("app_notifications")
      .filter((n) => /fake-paths reported/.test(n.payload.title)).length,
    1,
  );

  // (9) Delete the terms file: every boundary fake-terms covers fails
  // closed with one decision; the tick still finishes.
  const file = path.join(terms, "fake-terms.txt"),
    saved = fs.readFileSync(file, "utf8");
  fs.rmSync(file);
  await assert.rejects(
    crew.find("b", "worker", 1) &&
      ops.execute(
        "session.report",
        { kind: "done", taskId: B, commit: git(checkout, "rev-parse", "main") },
        undefined,
        { caller: { sessionKey: "dashboard:" + bWorker.slot } },
      ),
    /fake-terms is unavailable \(no terms file/,
  );
  for (const input of [
    { boundary: "brief", target: "brief:x", text: "plain" },
    { boundary: "brief", target: "brief:y", text: "plain" },
  ])
    assert.equal(enforce(store, input).ok, false);
  const done = await crew.tick();
  assert.ok(done.policy, "the tick finished");
  assert.deepEqual(
    openDecisions(store, "unavailable").map((d) => d.set),
    ["fake-terms"],
  );
  // Restore it, then track it: refused.
  fs.writeFileSync(file, saved);
  await crew.tick();
  assert.deepEqual(openDecisions(store, "unavailable"), [], "settled");
  git(root, "add", "-f", file);
  assert.match(describeSets(store).sets[0].reason, /refused: Git tracks it/);
  git(root, "rm", "-q", "--cached", file);
  assert.equal(describeSets(store).sets[0].available, true);
  // The plugin crashes: only its set is unavailable.
  fs.writeFileSync(env.crashFile, "crash");
  await loadRulePlugins(store, ops.plugins);
  assert.deepEqual(
    describeSets(store).sets.map((s) => [s.id, s.available]),
    [
      ["fake-terms", true],
      ["fake-paths", true],
      ["fake-plugin-set", false],
    ],
  );
  assert.match(describeSets(store).sets[2].reason, /fake-rules/);
  fs.rmSync(env.crashFile);
  await loadRulePlugins(store, ops.plugins);
  // The plugin's own rule, from memory only.
  assert.deepEqual(
    check(store, {
      boundary: "github",
      target: "t",
      text: "Project X launch",
    }).findings.map((f) => [f.set, f.rule, f.version]),
    [["fake-plugin-set", "project", "1.0.0"]],
  );
  // A slow rule times out in about two seconds; its set fails closed.
  fs.appendFileSync(file, "slow: (a+)+$\n");
  const started = Date.now(),
    slow = check(store, {
      boundary: "brief",
      target: "t",
      text: "a".repeat(40) + "!",
    });
  const took = Date.now() - started;
  assert.ok(took >= 1900 && took < 4500, `took ${took} ms`);
  assert.deepEqual(slow.unavailable.map((u) => u.set).sort(), [
    "fake-paths",
    "fake-plugin-set",
    "fake-terms",
  ]);
  assert.match(slow.unavailable[0].reason, /time limit/);
  fs.writeFileSync(file, saved);

  // (2, end) The person changes the allowed line: blocked again.
  writeSpec(root, "p28", spec("The zorblat launch moves later."));
  const plan = store.get("plans", "p28");
  await ops.execute("plan.save", { id: "p28", expectedHash: plan.hash });
  await assert.rejects(approve(ops), /content\.match/);
  assert.equal(openDecisions(store, "match").length, 1);

  // (10) A rule in .avoozl.json is refused; a session's allow gets 403.
  const good = fs.readFileSync(path.join(root, ".avoozl.json"), "utf8");
  const bad = JSON.parse(good);
  bad.contentRules.sets[0].terms = ["zorblat"];
  fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(bad));
  const invalid = await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(invalid.policy.status, "invalid");
  assert.match(invalid.policy.error, /could hold a rule/);
  assert.match(describeSets(store).error, /could hold a rule/);
  assert.equal(
    enforce(store, { boundary: "plan", target: "x", text: "plain" }).ok,
    false,
    "invalid content rules fail closed",
  );
  fs.writeFileSync(path.join(root, ".avoozl.json"), good);
  const decision = openDecisions(store, "match")[0];
  const reply = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "plans_content_allow",
        arguments: { input: { id: decision.id, reason: "please" } },
      },
    },
    ops,
  );
  assert.equal(reply.body.result.isError, true);
  assert.match(reply.body.result.content[0].text, /Only a person/);

  // (11) No blocking term, plain or encoded, in Avoozl's own records or in
  // the landed history. `plans` and `approvals` hold the plan text a person
  // saved and allowed; they are the plan, not a record about it.
  const tables = [
    "content_decisions",
    "content_allowances",
    "content_reports",
    "app_notifications",
    "receipts",
    "session_bindings",
    "task_deliveries",
    "task_worktrees",
    "integration",
    "evidence",
    "runs",
  ];
  const records =
    JSON.stringify(tables.map((name) => store.list(name))) +
    JSON.stringify(store.events({ limit: 100000 })) +
    JSON.stringify(store.read().tasks);
  for (const term of TERMS) assert.doesNotMatch(records, term, String(term));
  const landed = git(checkout, "log", "-p", "main", "--", ".", ":!hosts.txt");
  for (const term of TERMS) assert.doesNotMatch(landed, term);
  assert.doesNotMatch(git(root, "log", "-p", "--all"), /zorblat/i);

  // The release scan reads the same terms file and prints the rule id with
  // the line number, never the matched line.
  const scanned = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { scanText, RULES } from ${JSON.stringify(
        path.resolve(import.meta.dirname, "../../../scripts/release-scan.mjs"),
      )}; console.log(JSON.stringify(scanText("plain\\nthe zorblat note", RULES)))`,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, AVOOZL_RELEASE_TERMS: file },
    },
  );
  assert.deepEqual(JSON.parse(scanned), [
    { category: "private-name", rule: "codename", line: 2 },
  ]);
});

test("P28 (3), (7): a GitHub issue write and a reply naming a fake term", async (t) => {
  const { store, ops } = await workspace(t);
  // (3) An issue title holding an encoded term is not written; the next
  // issue is.
  const created = [];
  assert.equal(typeof ops.github, "object");
  const { guardGitHub } = await import("../content-rules.mjs");
  const client = guardGitHub(
    {
      createIssue: async (_c, input) => {
        created.push(input.title);
        return { number: created.length };
      },
    },
    store,
  );
  await assert.rejects(
    client.createIssue("example/app", {
      title: "Ship zorbl&#97;t",
      body: '<!-- avoozl-task\n{"taskId":"p28.1"}\n-->',
    }),
    (error) => error.contentBlocked,
  );
  await client.createIssue("example/app", { title: "Ship b", body: "" });
  assert.deepEqual(created, ["Ship b"]);
  const [issue] = store
    .list("content_decisions")
    .filter((d) => d.boundary === "github");
  assert.deepEqual(
    [issue.set, issue.target, issue.line],
    ["fake-terms", "issue:example/app:p28.1", 1],
  );
  // (7) A responder reply with a token-shaped string or the planning
  // repository's name keeps today's refusals (github-respond tests run
  // unchanged); a reply naming a fake term is refused in-call, no decision.
  const before = store.list("content_decisions").length;
  assert.throws(
    () =>
      enforce(
        store,
        { boundary: "github", target: "reply:r1", text: "The zorblat fix" },
        { mode: "refuse" },
      ),
    (error) => error.status === 422,
  );
  assert.equal(store.list("content_decisions").length, before);
});

test("P28 (6): a pull request body naming a fake term holds completion and opens a decision", async (t) => {
  const { workspace: plansRepo } = await import("./plans-repo-github.mjs");
  const { store, github, run, task } = plansRepo(t),
    { contentBinding } = await import("../content-rules.mjs"),
    workspaceRoot = contentBinding(store)?.workspaceRoot;
  assert.ok(workspaceRoot, "the workspace's Operations bound content rules");
  const file = path.join(workspaceRoot, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.contentRules = { sets: [{ id: "fake-terms" }] };
  fs.writeFileSync(file, JSON.stringify(value));
  const terms = path.join(workspaceRoot, ".avoozl", "local", "content-rules");
  fs.mkdirSync(terms, { recursive: true });
  fs.writeFileSync(
    path.join(terms, "fake-terms.txt"),
    "codename: \\bzorblat\\b\n",
  );
  await run();
  const pull = github.pull("b");
  pull.body = "Ships the zorblat part.";
  const result = await run();
  const verdict = task("b").githubVerdict;
  assert.equal(verdict?.state, "held");
  assert.match(
    verdict.reason,
    /content rule fake-terms rule codename matches its body line 1/,
  );
  assert.doesNotMatch(JSON.stringify(verdict), /zorblat/);
  assert.ok(
    store
      .list("content_decisions")
      .some(
        (d) =>
          d.state === "open" && d.target.endsWith(":body") && d.taskId === "b",
      ),
  );
  assert.doesNotMatch(JSON.stringify(result), /zorblat/);
});

test("P28 (3): projection writes nothing for an issue whose title holds an encoded term, and projects the other", async (t) => {
  const { FakeGitHub } = await import("./fake-github.mjs"),
    { fixture } = await import("./fixtures.mjs"),
    { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory("avoozl-p28-project-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, namespace: "avz_p28p28p28p28p28p" }),
  );
  const ops = new Operations(store, { github, workspaceRoot: root });
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
  });
  const task = (id, title) =>
    "```task\n" +
    JSON.stringify({
      id,
      title,
      summary: "Do it.",
      acceptance: ["It works"],
      projectId: "code",
    }) +
    "\n```\n";
  const plan = await ops.execute("plan.create", {
    id: "titles",
    prompt: "Two issues",
    text: `# Titles\n\n${task("one", "Ship zorbl&#97;t")}\n${task("two", "Ship two")}`,
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  // The rule set arrives after approval; projection is the boundary here.
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_p28p28p28p28p28p",
      contentRules: { sets: [{ id: "fake-terms" }] },
    }),
  );
  const terms = path.join(root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(terms, { recursive: true });
  fs.writeFileSync(
    path.join(terms, "fake-terms.txt"),
    "codename: \\bzorblat\\b\n",
  );
  const projected = await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(
    github.created.map((issue) => issue.title),
    ["Ship two"],
  );
  assert.deepEqual(
    projected.issues.map((issue) => issue.taskId),
    [approved.taskIds[1]],
  );
  const [decision] = store
    .list("content_decisions")
    .filter((d) => d.state === "open");
  assert.deepEqual(
    [decision.set, decision.rules, decision.boundary, decision.line],
    ["fake-terms", ["codename"], "github", 1],
  );
  assert.doesNotMatch(
    JSON.stringify(store.list("app_notifications")),
    /zorbl/i,
  );
});
