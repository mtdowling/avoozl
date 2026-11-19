// The content hook (R85, design §6.14) scans an agent's writes before they
// run. The terms
// file is fake and the canary is made up; no real term is in this repo.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { bindContentRules } from "../content-rules.mjs";
import { contentHook, parseShell, scanCall } from "../content-hook.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");
process.env.GIT_CONFIG_GLOBAL = path.join(
  process.env.XDG_CONFIG_HOME,
  "gitconfig",
);
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, "");

const CANARY = "zorblatcanary",
  git = (cwd, ...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function workspace(t, { terms = `canary: ${CANARY}\n` } = {}) {
  const root = temporaryDirectory("avoozl-pc-"),
    dbPath = path.join(root, "workspace.sqlite"),
    store = new Store(dbPath);
  t.after(() => store.close());
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      contentRules: { sets: [{ id: "fake-terms" }] },
    }),
  );
  if (terms !== null) {
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "fake-terms.txt"), terms);
  }
  const configFile = path.join(root, "config", "config.json");
  bindContentRules(store, { workspaceRoot: root, configFile });
  return { root, store, dbPath, configFile };
}

const refused = (store, command, cwd) => {
  const result = scanCall(store, { command, cwd });
  assert.equal(result.ok, false, command);
  assert.ok(
    !result.refusals.join("\n").includes(CANARY),
    "the matched text is never repeated",
  );
  return result.refusals.join("\n");
};

test("each write kind in R85.3 is refused when its text holds the canary", (t) => {
  const { store, root } = workspace(t),
    c = CANARY;
  for (const command of [
    `gh issue create --title "x ${c}" --body ok`,
    `gh issue create --title x --body 'see ${c}'`,
    `gh issue create --title x --body ok --label ${c}`,
    `gh issue comment 4 --body "${c}"`,
    `gh issue edit 4 --add-label ${c}`,
    `gh issue edit 4 --title ${c}`,
    `gh pr create --title ${c} --body ok`,
    `gh pr create --title x --body ok --head ${c}`,
    `gh pr edit 4 --body "${c}"`,
    `gh pr comment 4 --body "${c}"`,
    `gh pr review 4 --approve --body "${c}"`,
    `gh pr merge 4 --squash --subject "${c}"`,
    `gh api repos/o/r/issues/4/comments -f body=${c}`,
    `gh api repos/o/r/issues -X POST -f title=${c}`,
    `gh api repos/o/r/issues/4 --method PATCH --raw-field body="${c}"`,
    `git commit -m "${c}"`,
    `git commit -am '${c}'`,
    `git tag -a v1 -m ${c}`,
    `git tag ${c}`,
    `git push origin ${c}`,
    `git status && git -C . commit -m ${c}`,
    `FOO=1 gh issue comment 4 --body ${c}`,
    `bash -c 'gh issue comment 4 --body ${c}'`,
  ])
    assert.match(
      refused(store, command, root),
      /fake-terms rule canary at arg:\d+ line 1/,
      command,
    );
});

test("a body or message file is read, and a stdin or missing file is refused", (t) => {
  const { store, root } = workspace(t);
  fs.writeFileSync(path.join(root, "body.md"), `line one\n${CANARY}\n`);
  fs.writeFileSync(path.join(root, "clean.md"), "nothing here\n");
  for (const command of [
    "gh issue create --title x --body-file body.md",
    "gh pr create --title x --body-file=body.md",
    "git commit -F body.md",
    "gh api repos/o/r/issues -F body=@body.md",
    "gh api repos/o/r/issues --input body.md",
  ])
    assert.match(
      refused(store, command, root),
      /fake-terms rule canary at file:body.md line 2/,
      command,
    );
  assert.equal(
    scanCall(store, {
      command: "gh issue create --title x --body-file clean.md",
      cwd: root,
    }).ok,
    true,
  );
  assert.match(
    refused(store, "gh issue comment 4 --body-file -", root),
    /reads its text from stdin/,
  );
  assert.match(
    refused(store, "gh issue comment 4 --body-file gone.md", root),
    /cannot read \(gone.md\)/,
  );
});

test("text from a shell expansion or here-document is refused with the reason", (t) => {
  const { store, root } = workspace(t);
  for (const [command, pattern] of [
    ['gh issue comment 4 --body "$(cat note.md)"', /shell expansion/],
    ["gh issue comment 4 --body $BODY", /shell expansion/],
    ["gh issue comment 4 --body `cat note.md`", /shell expansion/],
    ["git push origin $BRANCH", /shell expansion/],
    ['git commit -m "$(cat <<EOF\nhello\nEOF\n)"', /shell expansion/],
    ["gh issue comment 4 -F - <<EOF\nhello\nEOF", /here-document/],
  ]) {
    const text = refused(store, command, root);
    assert.match(text, pattern, command);
    assert.match(text, /Write the text to a file and pass the file/);
  }
  // Single quotes stop expansion: the text is literal and readable.
  assert.equal(
    scanCall(store, {
      command: "gh issue comment 4 --body 'costs $5'",
      cwd: root,
    }).ok,
    true,
  );
});

test("calls that are not writes, and clean writes, pass", (t) => {
  const { store, root } = workspace(t);
  for (const command of [
    `gh issue view 4 --json title`,
    `gh issue list --search ${CANARY}`,
    `gh pr view 4`,
    `gh api repos/o/r/issues/4`,
    `gh api repos/o/r/issues/4 -X GET`,
    `git log --grep ${CANARY}`,
    `git status`,
    `echo ${CANARY}`,
    `cat <<EOF > note.md\n${CANARY}\nEOF`,
    `gh issue comment 4 --body "all good"`,
    `git commit -m "fix parser"`,
  ])
    assert.deepEqual(
      scanCall(store, { command, cwd: root }),
      {
        ok: true,
        refusals: [],
      },
      command,
    );
});

test("git push and gh pr create scan commit messages and added lines", (t) => {
  const { store, root } = workspace(t),
    remote = path.join(root, "remote.git"),
    repo = path.join(root, "repo");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  git(root, "init", "-q", "-b", "main", repo);
  git(repo, "config", "user.email", "a@example.com");
  git(repo, "config", "user.name", "A");
  git(repo, "remote", "add", "origin", remote);
  fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "first");
  git(repo, "push", "-q", "origin", "main");
  git(repo, "fetch", "-q", "origin");
  // Clean branch: passes.
  git(repo, "checkout", "-q", "-b", "crew/fix");
  fs.writeFileSync(path.join(repo, "b.txt"), "two\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "add b");
  assert.equal(
    scanCall(store, { command: "git push origin crew/fix", cwd: repo }).ok,
    true,
  );
  assert.equal(scanCall(store, { command: "git push", cwd: repo }).ok, true);
  assert.equal(
    scanCall(store, { command: "gh pr create --title t --body b", cwd: repo })
      .ok,
    true,
  );
  // The canary only in a file.
  fs.writeFileSync(path.join(repo, "c.txt"), `x ${CANARY}\n`);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "add c");
  for (const command of [
    "git push origin crew/fix",
    "git push -u origin HEAD:crew/fix",
    "git push",
    "gh pr create --title t --body b",
    `cd "${repo.replaceAll("\\", "/")}" && git push origin crew/fix`,
  ])
    assert.match(
      refused(store, command, command.startsWith("cd ") ? root : repo),
      /fake-terms rule canary at c\.txt line 1/,
      command,
    );
  // The canary only in a commit message.
  git(repo, "reset", "-q", "--hard", "HEAD~1");
  git(repo, "commit", "-q", "--allow-empty", "-m", `note ${CANARY}`);
  assert.match(
    refused(store, "git push origin crew/fix", repo),
    /at commit:[0-9a-f]+ line 1/,
  );
  // The canary only in the branch name.
  git(repo, "reset", "-q", "--hard", "HEAD~1");
  git(repo, "checkout", "-q", "-b", `crew/${CANARY}`);
  assert.match(refused(store, "git push", repo), /at ref:1 line 1/);
  assert.match(
    refused(store, "git push --all origin", repo),
    /names no single branch/,
  );
});

test("a push with no remote branch to measure against is refused", (t) => {
  const { store, root } = workspace(t),
    repo = path.join(root, "lonely");
  git(root, "init", "-q", "-b", "main", repo);
  git(repo, "config", "user.email", "a@example.com");
  git(repo, "config", "user.name", "A");
  git(repo, "commit", "-q", "--allow-empty", "-m", "first");
  assert.match(
    refused(store, "git push origin main", repo),
    /cannot read the commits it would publish/,
  );
});

test("a missing terms file refuses the call and names the set", (t) => {
  const { store, root } = workspace(t, { terms: null });
  assert.match(
    refused(store, "gh issue comment 4 --body fine", root),
    /Content rule set fake-terms is unavailable \(.*\)/,
  );
  // A call that is not a write is not blocked by it.
  assert.equal(scanCall(store, { command: "git status", cwd: root }).ok, true);
});

test("the hook command returns exit code 2 with a message, 0 for a pass", (t) => {
  const { root, dbPath, configFile } = workspace(t),
    run = (event) =>
      contentHook({
        stdin: typeof event === "string" ? event : JSON.stringify(event),
        dbPath,
        workspaceRoot: root,
        configFile,
        cwd: root,
      }),
    call = (command) => ({
      hook_event_name: "preToolUse",
      cwd: root,
      tool_name: "execute_bash",
      tool_input: { command },
    });
  const bad = run(call(`gh issue comment 4 --body ${CANARY}`));
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /fake-terms rule canary at arg:\d+ line 1/);
  assert.ok(!bad.stderr.includes(CANARY));
  assert.deepEqual(run(call("gh issue comment 4 --body fine")), {
    code: 0,
    stderr: "",
  });
  // Another tool, or no command: nothing to scan.
  assert.equal(
    run({ tool_name: "fs_read", tool_input: { path: "x" } }).code,
    0,
  );
  // Input it cannot read is refused, never passed.
  assert.equal(run("{not json").code, 2);
  assert.equal(
    contentHook({
      stdin: JSON.stringify(call("gh issue comment 4 --body x")),
      dbPath: path.join(root, ".avoozl.json", "db.sqlite"),
      workspaceRoot: root,
    }).code,
    2,
  );
});

test("the shell reader splits commands and marks expansions", () => {
  const words = (line) =>
    parseShell(line).map((c) => c.words.map((w) => w.text));
  assert.deepEqual(words("a b && c 'd e' \"f g\"; h\\ i | j"), [
    ["a", "b"],
    ["c", "d e", "f g"],
    ["h i"],
    ["j"],
  ]);
  assert.deepEqual(words("a 2>&1 # note\nb"), [["a", "2>&1"], ["b"]]);
  assert.deepEqual(words("cat <<'EOF' > f\ngit push\nEOF\nb"), [
    ["cat", ">", "f"],
    ["b"],
  ]);
  assert.equal(parseShell("a $X")[0].words[1].dynamic, true);
  assert.equal(parseShell("a '$X'")[0].words[1].dynamic, false);
  assert.equal(parseShell('a "$(x)"')[0].words[1].dynamic, true);
});
