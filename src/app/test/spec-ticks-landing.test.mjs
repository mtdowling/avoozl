// A landing commit ticks its task in tasks.md (Requirement 113.8 to 113.11).
// Real git: a bare origin, a checkout, a second machine's clone.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { Store } from "../store.mjs";
import { integrateVerified } from "../delivery.mjs";
import { landDirect } from "../direct-landing.mjs";
import { Operations } from "../operations.mjs";
import { takeOverSpec } from "../spec-takeover.mjs";
import { tickedText } from "../spec-ticks.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const TASKS = [
  "# Tasks",
  "",
  "- [ ] 1 Parent",
  "  - Facts:",
  "    - kind: package",
  "  - [ ] 1.1 First",
  "    - A summary.",
  "  - [ ] 1.2 Second",
  "",
].join("\n");
const MAPPING = { "s.1.1": "t1", "s.1.2": "t2" };
const FILE = ".kiro/specs/s/tasks.md";
const leaf = (id) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  planId: "s",
});
const CHECK = [process.execPath, "-e", "process.exit(0)"];
const identity = (dir) => {
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
};

function repo(root, name, files) {
  const origin = path.join(root, `${name}.git`),
    checkout = path.join(root, name);
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, checkout);
  identity(checkout);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true });
    fs.writeFileSync(path.join(checkout, file), text);
  }
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  return { origin, checkout: fs.realpathSync.native(checkout) };
}

async function workspace(t, { specInCode = true } = {}) {
  const root = temporaryDirectory("avoozl-tickland-"),
    app = repo(root, "app", {
      "README.md": "app\n",
      ...(specInCode ? { [FILE]: TASKS } : {}),
    }),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2")],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: app.checkout,
    baseBranch: "main",
    landing: "direct",
    checks: [CHECK],
    worktreeRoot: path.join(root, "wt"),
  });
  store.put("plans", {
    id: "s",
    spec: "s",
    hash: digest("plan s"),
    approvalId: "a",
    mapping: MAPPING,
  });
  store.put("receipts", {
    id: "spec-journal:s",
    kind: "spec-journal",
    planId: "s",
    home: "local",
  });
  await takeOverSpec(store, { workspaceRoot: root, actor: "Operator" }, "s");
  return { root, store, ...app };
}

function verified(w, taskId) {
  const wt = path.join(w.root, "wt", taskId);
  git(
    w.checkout,
    "worktree",
    "add",
    "-q",
    "-b",
    `avoozl/${taskId}`,
    wt,
    "main",
  );
  fs.writeFileSync(path.join(wt, `${taskId}.txt`), taskId + "\n");
  git(wt, "add", ".");
  git(wt, "commit", "-qm", "Do " + taskId);
  w.store.put("task_worktrees", {
    id: taskId,
    taskId,
    path: wt,
    branch: `avoozl/${taskId}`,
    repository: "app",
  });
  w.store.put("task_deliveries", {
    id: taskId,
    taskId,
    state: "verified",
    commit: git(wt, "rev-parse", "HEAD"),
    attempts: [],
    verifications: [],
  });
  w.store.put("session_bindings", {
    id: "slot-" + taskId,
    slot: "slot-" + taskId,
    taskId,
    role: "worker",
    attempt: 1,
    status: "working",
  });
}

const land = async (w, taskId) => {
  verified(w, taskId);
  await integrateVerified(w.store);
  return landDirect(w.store, { workspaceRoot: w.root, rounds: 2, machine: {} });
};
const show = (dir, ref, file = FILE) =>
  execFileSync("git", ["show", `${ref}:${file}`], {
    cwd: dir,
    encoding: "utf8",
  });

test("landing ticks the task in the same commit, touches only its line, and ticks the parent last", async (t) => {
  const w = await workspace(t),
    start = git(w.origin, "rev-parse", "main");
  assert.deepEqual((await land(w, "t1")).notify, []);
  const first = git(w.origin, "rev-parse", "main");
  assert.equal(
    show(w.origin, "main"),
    TASKS.replace("- [ ] 1.1 ", "- [x] 1.1 "),
    "one line changed, every other byte kept",
  );
  // The task's commit and the landing merge: no follow-up commit.
  assert.equal(git(w.origin, "rev-list", "--count", `${start}..${first}`), "2");
  assert.match(
    git(
      w.origin,
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-m",
      "--first-parent",
      first,
    ),
    /tasks\.md/,
  );
  await land(w, "t2");
  assert.equal(
    show(w.origin, "main"),
    TASKS.replaceAll("- [ ] 1", "- [x] 1"),
    "the parent ticks when its last child does",
  );
});

test("a second machine reading origin marks the task done; the landing machine records nothing twice", async (t) => {
  const w = await workspace(t);
  await land(w, "t1");
  // Machine 1 knows its own tick.
  const own = new Operations(w.store, { workspaceRoot: w.root });
  await own.applyBaseTicks();
  const kinds = () =>
    w.store.db
      .prepare("SELECT kind FROM activity_log")
      .all()
      .map((row) => row.kind);
  assert.ok(!kinds().includes("task.ticked"));
  assert.equal(w.store.get("session_bindings", "slot-t1").status, "working");
  // Machine 2: its own database, a fresh clone of origin.
  const clone = path.join(w.root, "second"),
    other = new Store(path.join(w.root, "second.sqlite"));
  t.after(() => other.close());
  git(w.root, "clone", "-q", w.origin, clone);
  other.importSnapshot({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2")],
    edges: [],
  });
  other.put("plans", {
    id: "s",
    spec: "s",
    hash: digest("plan s"),
    approvalId: "a",
    mapping: MAPPING,
  });
  const second = new Operations(other, { workspaceRoot: clone });
  await second.applyBaseTicks();
  const rows = other.read().tasks;
  assert.equal(rows.find((x) => x.id === "t1").status, "accepted");
  assert.equal(rows.find((x) => x.id === "t2").status, "planned");
  assert.ok(
    other.db
      .prepare("SELECT kind FROM activity_log")
      .all()
      .some((row) => row.kind === "task.ticked"),
  );
});

test("a spec in a separate plans repository is ticked there, as its own commit, retrying a race", async (t) => {
  const w = await workspace(t, { specInCode: false }),
    plans = repo(w.root, "plans", { [FILE]: TASKS }),
    rival = path.join(w.root, "rival");
  git(w.root, "clone", "-q", plans.origin, rival);
  identity(rival);
  w.store.setMeta("workspaceRepository", { root: plans.checkout });
  // The first push finds the branch moved: another machine lands a commit
  // between the fetch and the push. The retry builds on it; nothing is forced.
  const hooks = path.join(plans.checkout, ".git", "hooks"),
    marker = path.join(w.root, "raced");
  fs.writeFileSync(
    path.join(hooks, "pre-push"),
    `#!/bin/sh\nif [ ! -e "${marker}" ]; then touch "${marker}"; unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR; cd "${rival}" && echo more >> notes.md && git add . && git commit -qm Rival && git push -q origin main; fi\n`,
    { mode: 0o755 },
  );
  await land(w, "t1");
  const head = git(plans.origin, "rev-parse", "main");
  assert.equal(
    show(plans.origin, "main"),
    TASKS.replace("- [ ] 1.1 ", "- [x] 1.1 "),
  );
  assert.equal(show(plans.origin, "main", "notes.md"), "more\n");
  assert.equal(git(plans.origin, "rev-list", "--count", head), "3");
  assert.equal(
    git(plans.origin, "log", "-1", "--format=%s", head),
    "Tick s.1.1",
  );
  assert.ok(fs.existsSync(marker), "the race happened");
});

test("tickedText ticks a parent only when every child is ticked, and nothing else", () => {
  const one = tickedText("s", TASKS, ["s.1.1"]);
  assert.deepEqual(one.ticked, ["s.1.1"]);
  assert.equal(one.text, TASKS.replace("- [ ] 1.1 ", "- [x] 1.1 "));
  const both = tickedText("s", one.text, ["s.1.2"]);
  assert.deepEqual(both.ticked, ["s.1.2", "s.1"]);
  // A parent whose children are all ticked is left alone when nothing under
  // it ticks now.
  const idle = tickedText("s", both.text.replace("- [x] 1 ", "- [ ] 1 "), []);
  assert.deepEqual(idle.ticked, []);
  assert.equal(
    tickedText("s", TASKS.replace("[ ] 1.2", "[~] 1.2"), ["s.1.2"]).ticked[0],
    "s.1.2",
    "a queued mark becomes ticked",
  );
});
