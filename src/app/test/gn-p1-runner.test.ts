// The gn-p1 runner's pure parts: its repositories, its specs, the check
// that fails once, and the expected items it reads from GitHub.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  checkScript,
  expectedItems,
  gnRepositories,
  reviewMarks,
  SPECS,
  specFiles,
  trailers,
} from "../../../scripts/proofs/gn-p1.ts";

test("one run makes three private scratch repositories with one stamp", () => {
  const repos = gnRepositories("me", new Date("2026-11-21T10:40:00Z"));
  assert.deepEqual(repos, {
    ws: "me/avoozl-scratch-gn-p1-20261121-1040-ws",
    pr: "me/avoozl-scratch-gn-p1-20261121-1040-pr",
    direct: "me/avoozl-scratch-gn-p1-20261121-1040-direct",
  });
});

test("each spec changes one repository and has one task", () => {
  assert.deepEqual(Object.keys(SPECS), ["gnp-pr", "gnp-direct"]);
  const files = specFiles("gnp-direct");
  assert.match(
    files[".kiro/specs/gnp-direct/requirements.md"],
    /^---\nrepo: lib\n---\n/,
  );
  assert.equal(
    files[".kiro/specs/gnp-direct/tasks.md"].match(/^- \[ \] /gm)?.length,
    1,
  );
});

// Runs the check over one note and returns its exit code.
function runCheck(t: TestContext, script: string, note: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gn-p1-check-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "check.mjs"), script);
  fs.mkdirSync(path.join(dir, "notes"));
  fs.writeFileSync(path.join(dir, "notes", "gamma.txt"), note);
  try {
    execFileSync(process.execPath, ["check.mjs"], { cwd: dir, stdio: "pipe" });
    return 0;
  } catch (error) {
    return (error as { status: number }).status;
  }
}

test("the direct repository's check fails the plain note once and says what to add", (t) => {
  const once = checkScript({ failOnce: true });
  assert.equal(runCheck(t, once, "gamma\n"), 1);
  assert.equal(runCheck(t, once, "gamma\nchecked\n"), 0);
  assert.match(once, /then the line checked/);
  const plain = checkScript();
  assert.equal(runCheck(t, plain, "alpha\n"), 0);
  assert.equal(runCheck(t, plain, "Alpha\n"), 1);
});

test("review markers and trailers are read from GitHub text", () => {
  assert.deepEqual(
    reviewMarks([
      {
        body: "<!-- avoozl:review task=gnp-pr-1 round=1 kind=review:a -->\nok",
      },
      { body: "plain" },
    ]),
    [{ task: "gnp-pr-1", round: "1", kind: "review:a" }],
  );
  assert.deepEqual(trailers("Write the note\n\nAvoozl-Task: x"), [
    "Avoozl-Task: x",
  ]);
  assert.deepEqual(trailers("Write the note\n\nIt holds gamma."), []);
});

const mark = (task: string, round: number, kind: string) => ({
  body: `<!-- avoozl:review task=${task} round=${round} kind=${kind} -->`,
});
const good = () => ({
  approver: "owner",
  bot: "bot",
  issues: {
    "gnp-pr": [{ number: 1, author: "owner", assignees: ["owner"] }],
    "gnp-direct": [{ number: 2, author: "owner", assignees: ["owner"] }],
  },
  prComments: [mark("gnp-pr-1", 1, "review:a")],
  issueComments: [
    mark("gnp-direct-1", 1, "checks"),
    mark("gnp-direct-1", 2, "review:a"),
  ],
  landings: { "gnp-pr-1": "Write alpha", "gnp-direct-1": "Write gamma" },
});

test("every expected item holds on a good run", () => {
  assert.ok(Object.values(expectedItems(good())).every(Boolean));
});

test("each wrong result fails its own item", () => {
  const failed = (change: (input: ReturnType<typeof good>) => void) => {
    const input = good();
    change(input);
    return Object.entries(expectedItems(input))
      .filter(([, ok]) => !ok)
      .map(([item]) => item.split(" ")[0]);
  };
  assert.deepEqual(
    failed((i) => i.issues["gnp-pr"].push(i.issues["gnp-pr"][0])),
    ["1"],
  );
  assert.deepEqual(
    failed((i) => {
      i.issues["gnp-direct"][0].author = "bot";
    }),
    ["1"],
  );
  assert.deepEqual(
    failed((i) => i.prComments.push(i.prComments[0])),
    ["2a"],
  );
  assert.deepEqual(
    failed((i) => {
      i.issueComments = i.issueComments.slice(1);
    }),
    ["2b"],
  );
  assert.deepEqual(
    failed((i) => {
      i.landings["gnp-pr-1"] = "Write alpha\n\nAvoozl-Task: gnp-pr-1";
    }),
    ["3"],
  );
});
