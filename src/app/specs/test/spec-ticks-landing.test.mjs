// A landing commit ticks its task in tasks.md (Requirement 113.8 to 113.11).
// Real git: a bare origin, a checkout, a second machine's clone.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../../model.mjs";
import { Store } from "../../store/store.ts";
import { integrateVerified } from "../../delivery/delivery.mjs";
import { landDirect } from "../../landing/direct-landing.mjs";
import { Operations } from "../../api/operations.mjs";
import { tickedText } from "../spec-ticks.mjs";
import { checkedItems, specHash } from "../spec-plans.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const TASKS = [
  "# Tasks",
  "",
  "- [ ] 1 Parent",
  "  - [ ] 1.1 First",
  "    - It works",
  "    - A summary.",
  "  - [ ] 1.2 Second",
  "    - It works",
  "",
].join("\n");
const mainOf = (w) => git(w.origin, "rev-parse", "main");
const tick = (text, n) => text.replace(`- [ ] 1.${n} `, `- [x] 1.${n} `);

// Another machine: its own database and a fresh clone of `origin` (the code
// repository's unless named) at `branch`, after one read of the ticks.
// Returns the store and its tasks by ID.
async function machine(
  t,
  w,
  name,
  { origin = w.origin, branch = "main" } = {},
) {
  const clone = path.join(w.root, name),
    store = new Store(path.join(w.root, `${name}.sqlite`));
  t.after(() => store.close());
  git(w.root, "clone", "-q", "-b", branch, origin, clone);
  // The identity a tick commit needs where git has no global one (CI).
  identity(clone);
  store.initialize({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2")],
    edges: [],
  });
  store.put("plans", {
    id: "s",
    spec: "s",
    hash: digest("plan s"),
    approvalId: "a",
    mapping: MAPPING,
  });
  await new Operations(store, { workspaceRoot: clone }).applyBaseTicks();
  return {
    store,
    task: (id) => store.read().tasks.find((x) => x.id === id),
  };
}
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
  store.initialize({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2")],
    edges: [],
  });
  const repository = {
    id: "app",
    baseBranch: "main",
    landing: "direct",
    checks: [CHECK],
  };
  store.put("repositories", {
    ...repository,
    root: app.checkout,
    worktreeRoot: path.join(root, "wt"),
  });
  store.put("plans", {
    id: "s",
    spec: "s",
    hash: digest("plan s"),
    approvalId: "a",
    mapping: MAPPING,
  });
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
    start = mainOf(w);
  assert.deepEqual((await land(w, "t1")).notify, []);
  const first = mainOf(w);
  assert.equal(
    show(w.origin, "main"),
    tick(TASKS, 1),
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
    tick(tick(TASKS, 1), 2).replace("- [ ] 1 ", "- [x] 1 "),
    "the parent ticks when its last child does",
  );
});

test("a person's Built: note names the landed work, and $built is refused", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567",
    note = (line) =>
      tick(TASKS, 1).replace(
        "    - It works\n    - A summary.",
        `    - It works\n    - ${line}\n    - A summary.`,
      ),
    text = note(`Built: ${sha.slice(0, 12)}`);
  assert.equal(checkedItems("s", text).get("s.1.1").built, sha.slice(0, 12));
  assert.equal(
    checkedItems("s", note(`$built: ${sha.slice(0, 12)}`)).get("s.1.1").built,
    null,
  );
  // A tick alone leaves the hash.
  assert.equal(
    specHash({ "tasks.md": tick(TASKS, 1) }),
    specHash({ "tasks.md": TASKS }),
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
  const landing = mainOf(w);
  assert.equal(
    w.store.read().tasks.find((x) => x.id === "t1").integration.commit,
    landing,
  );
  const other = await machine(t, w, "second"),
    done = other.task("t1");
  assert.equal(done.status, "accepted");
  // The tick commit is the landing commit.
  assert.equal(done.tickCommit, landing);
  assert.equal(done.built, undefined, "Avoozl writes no Built line");
  assert.equal(other.task("t2").status, "planned");
  assert.ok(
    other.store.db
      .prepare("SELECT kind FROM activity_log")
      .all()
      .some((row) => row.kind === "task.ticked"),
  );
});

test("a direct push and a squash-merged pull request each resolve to their tick commit, and a rebuild finds the same", async (t) => {
  const w = await workspace(t),
    file = path.join(w.checkout, FILE);
  // A person ticks 1.1 and pushes it straight to main.
  fs.writeFileSync(file, tick(TASKS, 1));
  git(w.checkout, "commit", "-qam", "Tick 1.1");
  git(w.checkout, "push", "-q", "origin", "main");
  const direct = mainOf(w);
  // A pull request ticks 1.2 and is squash-merged; main moves on after it.
  git(w.checkout, "checkout", "-qb", "pr");
  fs.writeFileSync(path.join(w.checkout, "pr.txt"), "pr\n");
  fs.writeFileSync(file, tick(tick(TASKS, 1), 2));
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-qm", "Do 1.2");
  git(w.checkout, "checkout", "-q", "main");
  git(w.checkout, "merge", "-q", "--squash", "pr");
  git(w.checkout, "commit", "-qm", "Do 1.2 (#9)");
  const squash = git(w.checkout, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(w.checkout, "later.txt"), "later\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-qm", "Later");
  git(w.checkout, "push", "-q", "origin", "main");
  const one = await machine(t, w, "one"),
    again = await machine(t, w, "again");
  for (const m of [one, again]) {
    assert.equal(m.task("t1").tickCommit, direct);
    assert.equal(m.task("t2").tickCommit, squash);
    assert.equal(m.task("t2").integration.commit, squash);
  }
});

test("a group two landings left open is ticked by the next read, in its own commit, once", async (t) => {
  // Nearby inputs: a second machine reading the fixed branch commits
  // nothing, and a group with an open child is left open.
  const root = temporaryDirectory("avoozl-group-box-"),
    raced = tick(tick(TASKS, 1), 2),
    { origin } = repo(root, "app", { [FILE]: raced }),
    w = { root, origin },
    start = git(origin, "rev-parse", "main");
  await machine(t, w, "a");
  const head = git(origin, "rev-parse", "main");
  assert.equal(show(origin, "main"), raced.replace("- [ ] 1 ", "- [x] 1 "));
  assert.equal(git(origin, "rev-list", "--count", `${start}..${head}`), "1");
  assert.equal(git(origin, "log", "-1", "--format=%s", head), "Tick s.1");
  assert.equal(
    git(origin, "diff", "--numstat", start, head),
    `1\t1\t${FILE}`,
    "only the group's box changed",
  );
  await machine(t, w, "b");
  assert.equal(git(origin, "rev-parse", "main"), head);
  const open = repo(root, "open", { [FILE]: tick(TASKS, 1) });
  await machine(t, { root, origin: open.origin }, "c");
  assert.equal(show(open.origin, "main"), tick(TASKS, 1));
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
  assert.equal(show(plans.origin, "main"), tick(TASKS, 1));
  assert.equal(show(plans.origin, "main", "notes.md"), "more\n");
  assert.equal(git(plans.origin, "rev-list", "--count", head), "3");
  assert.equal(
    git(plans.origin, "log", "-1", "--format=%s", head),
    "Tick s.1.1",
  );
  assert.ok(fs.existsSync(marker), "the race happened");
  assert.deepEqual(whoAndTrailers(plans.origin, head), IDENTITY);
});

test("with specs.branch, a plans repository's specs are ticked and read on that branch, and code lands on the code repository's base", async (t) => {
  const w = await workspace(t, { specInCode: false }),
    config = JSON.stringify({ version: 1, specs: { branch: "avoozl-plans" } }),
    plans = repo(w.root, "plans", { "README.md": "plans\n" });
  // The specs live on their own branch of the plans repository, beside the
  // workspace settings that name it.
  git(plans.checkout, "checkout", "-q", "-b", "avoozl-plans");
  fs.mkdirSync(path.dirname(path.join(plans.checkout, FILE)), {
    recursive: true,
  });
  fs.writeFileSync(path.join(plans.checkout, FILE), TASKS);
  fs.writeFileSync(path.join(plans.checkout, ".avoozl.json"), config);
  git(plans.checkout, "add", ".");
  git(plans.checkout, "commit", "-qm", "Plans");
  git(plans.checkout, "push", "-q", "origin", "avoozl-plans");
  fs.writeFileSync(path.join(w.root, ".avoozl.json"), config);
  w.store.setMeta("workspaceRepository", { root: plans.checkout });
  const plansMain = git(plans.origin, "rev-parse", "main"),
    codeMain = mainOf(w);
  await land(w, "t1");
  assert.equal(show(plans.origin, "avoozl-plans"), tick(TASKS, 1));
  assert.equal(
    git(plans.origin, "log", "-1", "--format=%s", "avoozl-plans"),
    "Tick s.1.1",
  );
  assert.equal(git(plans.origin, "rev-parse", "main"), plansMain);
  assert.notEqual(mainOf(w), codeMain, "the code landed on its own main");
  // Another machine reads the tick from the specs branch.
  const other = await machine(t, w, "reader", {
    origin: plans.origin,
    branch: "avoozl-plans",
  });
  assert.equal(other.task("t1").status, "accepted");
  assert.equal(other.task("t2").status, "planned");
});

// Avoozl's commits use the checkout's own git identity as author and
// committer, and carry no Co-authored-by or other attribution.
const IDENTITY = {
  who: "Test <test@example.com> | Test <test@example.com>",
  attribution: false,
};
const whoAndTrailers = (dir, ref) => {
  const [who, ...trailers] = git(
    dir,
    "log",
    "-1",
    "--format=%an <%ae> | %cn <%ce>%n%(trailers)",
    ref,
  ).split("\n");
  return {
    who,
    attribution: trailers.some((line) => /^co-authored-by:/i.test(line)),
  };
};

test("a landing commit is authored and committed by the configured identity, with no Co-authored-by", async (t) => {
  const w = await workspace(t);
  await land(w, "t1");
  assert.deepEqual(whoAndTrailers(w.origin, mainOf(w)), IDENTITY);
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
