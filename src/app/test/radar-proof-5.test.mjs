// Proof 5 (rc-p5): auto-merge on the right pull requests only. Run on a fake
// GitHub in an isolated temporary workspace. The fake merges a pull request
// only when auto-merge is armed on it, its required check is green and it has
// no conflict, which is what GitHub does; Avoozl never merges.
import assert from "node:assert/strict";
import test from "node:test";
import { mergeNeedsYou } from "../radar-merge.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import {
  MergeGitHub,
  managed,
  provenance,
  setup,
} from "./radar-coder-merge-fixture.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const MARKED = managed() + "\n" + provenance() + "\nBody";

class Proof5GitHub extends MergeGitHub {
  constructor() {
    super();
    this.red = false;
    this.merged = [];
    this.written = [];
  }
  checkRuns() {
    return Promise.resolve([
      {
        name: "build",
        status: "completed",
        conclusion: this.red ? "failure" : "success",
      },
    ]);
  }
  addLabels(_repository, number, labels) {
    this.written.push(["add", number, ...labels]);
    this.pulls.get(number).labels.push(...labels.map((name) => ({ name })));
    return Promise.resolve({});
  }
  removeLabel(_repository, number, label) {
    this.written.push(["remove", number, label]);
    return Promise.resolve({});
  }
  pull(number, closes, options = {}) {
    this.addPull(number, options);
    Object.assign(this.pulls.get(number), {
      title: "Change " + number,
      html_url: "https://example.test/example/code/pull/" + number,
      labels: [],
      mergeable: options.conflict ? false : true,
      mergeable_state: options.conflict ? "dirty" : "clean",
    });
    this.pulls.get(number).head.sha = "sha" + number;
    if (closes) {
      this.addIssue(closes, MARKED);
      this.closes.set(closes, [number]);
    }
  }
  // GitHub merges an armed pull request when it is green and has no conflict.
  settle() {
    for (const [number, pull] of this.pulls)
      if (pull.auto_merge && !this.red && pull.mergeable !== false) {
        this.merged.push(number);
        this.pulls.delete(number);
      }
  }
}

const settled = (github) => {
  github.settle();
  return github.merged.slice().sort((a, b) => a - b);
};
const rows = (store, kind) =>
  mergeNeedsYou(store).filter((row) => row.kind === kind);

test("Proof 5: only the crew's pull request merges by itself; the rest wait", async (t) => {
  const github = new Proof5GitHub(),
    { store, tick } = setup(t, { github });
  github.pull(21, 1); // the crew's pull request for a marked issue
  github.pull(22, 2, { head: "stranger/code" }); // a stranger's fork
  github.pull(23, 3, { author: "stranger" }); // a stranger's own branch
  github.pull(24, null); // a crew pull request that closes no marked issue
  github.pull(25, 5, { conflict: true }); // the crew's, but it conflicts
  // The required check is red: the crew's pull request is armed, not merged.
  github.red = true;
  for (let round = 0; round < 3; round += 1) await tick();
  // (A conflicted crew pull request is armed too; GitHub waits for the fix.)
  assert.deepEqual(github.armed, [
    ["PR_21", "MERGE"],
    ["PR_25", "MERGE"],
  ]);
  assert.deepEqual(settled(github), []);
  // Green: GitHub merges it, and only it.
  github.red = false;
  for (let round = 0; round < 3; round += 1) await tick();
  assert.deepEqual(settled(github), [21]);
  assert.equal(github.armed.length, 2);
  // The conflicted pull request got the label and one row, and is still open.
  assert.ok(github.pulls.has(25));
  assert.deepEqual(
    github.written.filter(([kind]) => kind === "add"),
    [["add", 25, "merge conflict"]],
  );
  assert.equal(rows(store, "needs-human").length, 1);
  assert.equal(rows(store, "needs-human")[0].pullRequest, 25);
  // The others were never armed.
  for (const number of [22, 23, 24])
    assert.equal(github.pulls.get(number).auto_merge, null);
});

test("Proof 5: in manual mode nothing merges by itself and the crew's pull request shows as Ready to merge", async (t) => {
  const github = new Proof5GitHub(),
    { store, tick } = setup(t, { ship: "manual", github });
  github.pull(21, 1);
  github.pull(22, 2, { head: "stranger/code" });
  for (let round = 0; round < 3; round += 1) await tick();
  assert.deepEqual(github.armed, []);
  assert.deepEqual(settled(github), []);
  assert.deepEqual(
    rows(store, "ready-to-merge").map((row) => row.pullRequest),
    [21],
  );
});
