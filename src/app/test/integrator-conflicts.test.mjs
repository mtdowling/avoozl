// Mechanical conflict rules with per-file verification, and semantic
// conflicts sent back (lt-3.3), real git.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  mechanicalResolver,
  mechanicalRules,
  returnConflicted,
} from "../integrator-conflicts.mjs";
import {
  addLandingWorktree,
  removeLandingWorktree,
  stackMembers,
} from "../integrator-stack.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const node = (code) => [process.execPath, "-e", code];

function repo(files = { "base.txt": "base\n" }) {
  const root = temporaryDirectory("avoozl-conflicts-");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Landing");
  git(root, "config", "user.email", "landing@example.com");
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), text);
  }
  git(root, "add", ".");
  git(root, "commit", "-qm", "Base");
  const base = git(root, "rev-parse", "HEAD");
  const branch = (name, steps, from = base) => {
    git(root, "checkout", "-q", "-b", name, from);
    for (const [file, text, message = `Edit ${file}`] of steps) {
      fs.writeFileSync(path.join(root, file), text);
      git(root, "add", ".");
      git(root, "commit", "-qm", message);
    }
    const head = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-q", "main");
    return head;
  };
  const entry = (key, head) => ({
    key,
    id: `app\0main\0${key}`,
    base: "main",
    commit: head,
    forkPoint: base,
    state: "queued",
    tasks: [{ task: key, definition: "d".repeat(64) }],
  });
  return { root, base, branch, entry };
}

async function stack(r, members, resolve) {
  const dir = await addLandingWorktree(r.root, r.base);
  try {
    const out = await stackMembers({
      root: r.root,
      dir,
      baseHead: r.base,
      members,
      others: members,
      resolve,
    });
    return {
      ...out,
      files: Object.fromEntries(
        git(dir, "ls-files")
          .split("\n")
          .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]),
      ),
      subjects: git(dir, "log", "--format=%s", `${r.base}..HEAD`)
        .split("\n")
        .filter(Boolean)
        .reverse(),
      staged: git(dir, "diff", "--cached", "--name-only"),
      status: git(dir, "status", "--porcelain"),
    };
  } finally {
    await removeLandingWorktree(r.root, dir);
  }
}

const union = (...paths) => ({ paths, strategy: "union" });

test("two appends to a union path stack cleanly", async () => {
  const r = repo({ "CHANGELOG.md": "# Log\n" }),
    a = r.branch("a", [["CHANGELOG.md", "# Log\n- a\n"]]),
    b = r.branch("b", [["CHANGELOG.md", "# Log\n- b\n"]]),
    resolve = mechanicalResolver({ rules: [union("CHANGELOG.md")] }),
    out = await stack(r, [r.entry("a", a), r.entry("b", b)], resolve);
  assert.deepEqual(
    out.members.map((m) => m.state),
    ["stacked", "stacked"],
  );
  const text = out.files["CHANGELOG.md"];
  assert.match(text, /- a/);
  assert.match(text, /- b/);
  assert.doesNotMatch(text, /<<<<<<<|>>>>>>>/);
});

test("landing.unionPaths is read as union rules", () => {
  const rules = mechanicalRules(
    { landing: { unionPaths: ["CHANGELOG.md"] } },
    { conflicts: { mechanical: [{ paths: ["x"], strategy: "format" }] } },
  );
  assert.deepEqual(
    rules.map((r) => r.strategy),
    ["union", "format"],
  );
  assert.deepEqual(rules[0].paths, ["CHANGELOG.md"]);
});

test("a regenerate rule's command rewrites a lockfile and it is staged", async () => {
  const r = repo({ "pkg.lock": "x=0\n" }),
    a = r.branch("a", [["pkg.lock", "x=1\n"]]),
    b = r.branch("b", [["pkg.lock", "x=2\n"]]),
    rule = {
      paths: ["**/*.lock", "*.lock"],
      strategy: "regenerate",
      command: node(
        "require('fs').writeFileSync(process.argv[1], 'regenerated\\n')",
      ).concat(["{file}"]),
    },
    out = await stack(
      r,
      [r.entry("a", a), r.entry("b", b)],
      mechanicalResolver({ rules: [rule] }),
    );
  assert.deepEqual(
    out.members.map((m) => m.state),
    ["stacked", "stacked"],
  );
  assert.equal(out.files["pkg.lock"], "regenerated\n");
});

test("a rule whose verify fails leaves the file unstaged and the conflict semantic", async () => {
  const r = repo({ "pkg.lock": "x=0\n" }),
    a = r.branch("a", [["pkg.lock", "x=1\n"]]),
    b = r.branch("b", [["pkg.lock", "x=2\n"]]),
    rule = {
      paths: ["pkg.lock"],
      strategy: "regenerate",
      command: node(
        "require('fs').writeFileSync(process.argv[1], 'bad\\n')",
      ).concat(["{file}"]),
      verify: node("process.exit(1)"),
    },
    out = await stack(
      r,
      [r.entry("a", a), r.entry("b", b)],
      mechanicalResolver({ rules: [rule] }),
    );
  assert.deepEqual(
    out.members.map((m) => m.state),
    ["stacked", "conflict"],
  );
  assert.deepEqual(out.members[1].files, ["pkg.lock"]);
  assert.equal(out.staged, "");
  assert.equal(
    out.files["pkg.lock"].replace(/\r\n/g, "\n"),
    "x=1\n",
    "the dropped member left nothing behind",
  );
});

test("the default verify is the cheap checks, run once after the files are resolved", async () => {
  const r = repo({ "CHANGELOG.md": "# Log\n" }),
    a = r.branch("a", [["CHANGELOG.md", "# Log\n- a\n"]]),
    b = r.branch("b", [["CHANGELOG.md", "# Log\n- b\n"]]),
    good = await stack(
      r,
      [r.entry("a", a), r.entry("b", b)],
      mechanicalResolver({
        rules: [union("CHANGELOG.md")],
        cheap: [node("process.exit(0)")],
      }),
    ),
    bad = await stack(
      r,
      [r.entry("a", a), r.entry("b", b)],
      mechanicalResolver({
        rules: [union("CHANGELOG.md")],
        cheap: [node("process.exit(3)")],
      }),
    );
  assert.equal(good.members[1].state, "stacked");
  assert.equal(bad.members[1].state, "conflict");
});

test("a format rule accepts sides that differ only in whitespace", async () => {
  const r = repo({ "f.txt": "a b\n" }),
    a = r.branch("a", [["f.txt", "a  b\n"]]),
    b = r.branch("b", [["f.txt", "a b \n"]]),
    c = r.branch("c", [["f.txt", "different\n"]]),
    rule = { paths: ["f.txt"], strategy: "format" },
    ok = await stack(
      r,
      [r.entry("a", a), r.entry("b", b)],
      mechanicalResolver({ rules: [rule] }),
    ),
    no = await stack(
      r,
      [r.entry("a", a), r.entry("c", c)],
      mechanicalResolver({ rules: [rule] }),
    );
  assert.equal(ok.members[1].state, "stacked");
  assert.equal(no.members[1].state, "conflict");
});

test("with no rules every conflict is semantic", async () => {
  const r = repo({ "CHANGELOG.md": "# Log\n" }),
    a = r.branch("a", [["CHANGELOG.md", "# Log\n- a\n"]]),
    b = r.branch("b", [["CHANGELOG.md", "# Log\n- b\n"]]),
    out = await stack(
      r,
      [r.entry("a", a), r.entry("b", b)],
      mechanicalResolver({ rules: [] }),
    );
  assert.deepEqual(
    out.members.map((m) => m.state),
    ["stacked", "conflict"],
  );
});

test("a planted rerere record is not replayed", async () => {
  const r = repo({ "s.txt": "one\ntwo\nthree\n" });
  git(r.root, "config", "rerere.enabled", "true");
  const a = r.branch("a", [["s.txt", "one\nA\nthree\n"]]),
    b = r.branch("b", [["s.txt", "one\nB\nthree\n"]]);
  // Record a resolution for this exact conflict.
  git(r.root, "checkout", "-q", "-b", "recorder", a);
  try {
    git(r.root, "merge", "-q", b);
  } catch {}
  fs.writeFileSync(path.join(r.root, "s.txt"), "one\nA+B\nthree\n");
  git(r.root, "add", ".");
  git(r.root, "commit", "-qm", "Resolve");
  git(r.root, "checkout", "-q", "main");
  assert.ok(
    fs.existsSync(path.join(r.root, ".git", "rr-cache")),
    "a resolution was recorded",
  );
  const out = await stack(
    r,
    [r.entry("a", a), r.entry("b", b)],
    mechanicalResolver({ rules: [] }),
  );
  assert.equal(
    out.members[1].state,
    "conflict",
    "the recorded resolution was not replayed",
  );
});

test("the later of two same-line branches is dropped and its chat gets the files and the earlier commit; an unrelated third still lands", async (t) => {
  const { store } = fixture(t);
  store.put("task_deliveries", {
    id: "b",
    taskId: "b",
    state: "verified",
    commit: "b".repeat(40),
    attempts: [],
  });
  store.put("session_bindings", {
    id: "slot-b",
    slot: "slot-b",
    taskId: "b",
    role: "worker",
    attempt: 1,
    status: "working",
  });
  const r = repo({ "s.txt": "one\ntwo\nthree\n" }),
    a = r.branch("a", [["s.txt", "one\nA\nthree\n"]]),
    b = r.branch("b", [["s.txt", "one\nB\nthree\n"]]),
    c = r.branch("c", [["c.txt", "c\n"]]),
    entries = [r.entry("a", a), r.entry("b", b), r.entry("c", c)];
  for (const e of entries)
    store.put("landing_queue", {
      ...e,
      projectId: "app",
      seq: 1,
      spec: "s",
      driver: "d",
    });
  const out = await stack(r, entries, mechanicalResolver({ rules: [] })),
    dropped = out.members.find((m) => m.state === "conflict");
  assert.deepEqual(
    out.members.map((m) => [m.key, m.state]),
    [
      ["a", "stacked"],
      ["b", "conflict"],
      ["c", "stacked"],
    ],
  );
  const sent = returnConflicted(store, {
    entry: entries[1],
    files: dropped.files,
    against: dropped.against,
    baseHead: r.base,
    rounds: 2,
  });
  assert.equal(sent.messages.length, 1);
  assert.equal(sent.messages[0].slot, "slot-b");
  assert.match(sent.messages[0].text, /s\.txt/);
  assert.match(
    sent.messages[0].text,
    new RegExp(`commit ${dropped.against.commit.slice(0, 12)} \\(task a\\)`),
  );
  assert.equal(store.get("landing_queue", "app\0main\0b").state, "returned");
  assert.deepEqual(out.subjects, ["Edit s.txt", "Edit c.txt"]);
});
