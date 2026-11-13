// R74: when a spec is approved, only open tasks get GitHub issues unless
// `github.issues.includeDone` is true. Done tasks get no issue or Project
// card, an edge to one counts as met with no link, and the plan issue is
// still made. Fake GitHub only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_includedoneincl0",
  REPO = "example/code";

class RepoGitHub extends FakeGitHub {
  repository(value) {
    const id =
      typeof value === "string" ? value : `${value.owner}/${value.repo}`;
    return Promise.resolve({
      node_id: "repo-node",
      full_name: id,
      private: true,
      default_branch: "main",
    });
  }
}

function checkout() {
  const root = fs.realpathSync.native(temporaryDirectory("avoozl-done-code-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git(
    "-c",
    "user.email=a@b",
    "-c",
    "user.name=a",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "x",
  );
  git("remote", "add", "origin", `git@github.com:${REPO}.git`);
  return root;
}

async function preview(t, issues) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, namespace: NAMESPACE }) + "\n",
  );
  const ops = new Operations(store, {
    github: new RepoGitHub(),
    operator: "Owner",
    workspaceRoot: root,
  });
  const code = checkout();
  writeSpec(code, "load-config", {
    "tasks.md": specFiles()["tasks.md"].replace(
      "- [ ] 1.1 Read",
      "- [x] 1.1 Read",
    ),
  });
  const settings = await ops.execute("github.settings.get");
  await ops.execute("github.settings.update", {
    github: {
      mode: "single-repo",
      repositories: { [REPO]: { baseBranch: "main" } },
      ...(issues === undefined ? {} : { issues }),
    },
    expectedHash: settings.hash,
  });
  await ops.execute("repositories.configure", {
    id: "code",
    localCheckout: code,
    baseBranch: "main",
    github: REPO,
    issueAuthorization: true,
  });
  const plan = await ops.execute("plan.create", { spec: "load-config" });
  return {
    ops,
    result: await ops.execute("plan.issues.preview", { planId: plan.id }),
  };
}

const created = (writes) =>
  writes
    .filter((write) => write.kind === "issue.create")
    .map((write) => write.taskId)
    .sort();

test("by default a done task gets no issue, card or link, and the plan issue is still made", async (t) => {
  const { result } = await preview(t);
  const done = result.skippedDone.filter((id) => id.endsWith("1.1"));
  assert.equal(done.length, 1, JSON.stringify(result.skippedDone));
  const [doneId] = done;
  assert.ok(!created(result.writes).includes(doneId));
  assert.ok(created(result.writes).includes("plan.load-config"));
  assert.equal(created(result.writes).length, 3, JSON.stringify(result.writes));
  assert.ok(
    result.writes.every(
      (write) => write.taskId !== doneId && write.blockerTaskId !== doneId,
    ),
    "a write names the done task",
  );
});

test("github.issues.includeDone true gives done tasks issues as before", async (t) => {
  const { result } = await preview(t, { includeDone: true });
  assert.deepEqual(result.skippedDone, []);
  assert.equal(created(result.writes).length, 4);
});

test("github.issues.includeDone must be true or false", async (t) => {
  await assert.rejects(preview(t, { includeDone: "yes" }), /true or false/);
  await assert.rejects(preview(t, { other: 1 }), /github\.issues/);
});
