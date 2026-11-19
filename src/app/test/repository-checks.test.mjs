// A repository's named checks: the only checks there are. Validation, the
// older argv-list form, selection by the change's paths, timeouts by name,
// and a check run that skips a check whose paths the commit does not touch.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  checksSetting,
  repositoryChecks,
  resultFor,
  selectedChecks,
} from "../repository-checks.mjs";
import { checkTimeout } from "../verify.mjs";
import { checkRuns, drainCheckRuns, queueCheckRun } from "../check-runs.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import {
  deliveryWorkspace,
  git,
  gitCheckout,
  leaf,
} from "./delivery-fixture.mjs";

const NAMED = {
  test: ["npm", "test"],
  diff: ["git", "diff", "--check"],
  ui: { run: ["npm", "run", "test:ui"], paths: ["src/ui/**"] },
};

test("named checks validate; the older argv list loads named by its command", () => {
  assert.deepEqual(checksSetting(NAMED), NAMED);
  assert.deepEqual(checksSetting(undefined), []);
  for (const [bad, message] of [
    [{ Test: ["npm"] }, /not a check name/],
    [{ "a b": ["npm"] }, /not a check name/],
    [{ ["x".repeat(41)]: ["npm"] }, /not a check name/],
    [{ test: [] }, /command arguments/],
    [{ test: { run: ["npm"], when: "always" } }, /Unknown check setting/],
    [{ test: { run: ["npm"], paths: [""] } }, /path globs/],
    [[["npm", 7]], /arrays of command arguments/],
    ["npm test", /map a check name/],
  ])
    assert.throws(() => checksSetting(bad), message);
  assert.deepEqual(
    repositoryChecks({ checks: [["npm", "test"]] }).map((c) => c.name),
    ["npm test"],
  );
  assert.deepEqual(
    repositoryChecks({ checks: NAMED }).map((c) => [c.name, c.paths]),
    [
      ["test", null],
      ["diff", null],
      ["ui", ["src/ui/**"]],
    ],
  );
});

test("a check with paths runs only for a change that touches one", () => {
  const project = { checks: NAMED },
    names = (files) => selectedChecks(project, files).map((c) => c.name);
  assert.deepEqual(names(["README.md"]), ["test", "diff"]);
  assert.deepEqual(names(["src/ui/Panel.tsx"]), ["test", "diff", "ui"]);
  assert.deepEqual(names(null), ["test", "diff", "ui"], "unknown diff: all");
  // A result matches its check by name, or by command when it has none.
  const [first] = repositoryChecks(project);
  assert.ok(resultFor([{ name: "test", exitCode: 0 }], first));
  assert.ok(resultFor([{ command: "npm test", exitCode: 0 }], first));
  assert.equal(
    resultFor([{ name: "diff", command: "npm test" }], first),
    undefined,
  );
});

test("a check's timeout is keyed by its name; a command key still matches", () => {
  const flow = { verify: { checkTimeouts: { ui: 60, "npm test": 30 } } };
  assert.equal(checkTimeout("ui", flow, undefined, "npm run test:ui"), 60_000);
  assert.equal(checkTimeout("test", flow, undefined, "npm test"), 30_000);
  assert.equal(checkTimeout("diff", flow, 5_000, "git diff --check"), 5_000);
});

test("a check run skips a check whose paths the commit does not touch", async (t) => {
  const node = process.execPath,
    { store, checkout } = deliveryWorkspace(t, {
      prefix: "avoozl-named-checks-",
      // A stored task's own list is ignored.
      tasks: [leaf("a", { checks: ["false"] })],
      project: {
        checks: {
          unit: [node, "-e", "process.exit(0)"],
          ui: { run: [node, "-e", "process.exit(1)"], paths: ["src/ui/**"] },
        },
      },
    });
  git(checkout, "checkout", "-qb", "work");
  fs.writeFileSync(path.join(checkout, "notes.md"), "notes\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Work");
  const commit = git(checkout, "rev-parse", "HEAD");
  git(checkout, "checkout", "-q", "main");
  queueCheckRun(store, {
    task: { id: "a" },
    project: store.get("projects", "app"),
    commit,
    attempt: 1,
  });
  await drainCheckRuns(store);
  const [run] = checkRuns(store);
  assert.equal(run.state, "finished");
  assert.deepEqual(
    run.checks.map((c) => [c.name, c.exitCode]),
    [["unit", 0]],
  );
  assert.deepEqual(run.selected, ["unit"]);
});

test("a merge batch runs every check without paths and those a member's change touches", async () => {
  const { directSteps } = await import("../merge-batch.mjs"),
    root = gitCheckout(temporaryDirectory("avoozl-named-batch-"));
  const base = git(root, "rev-parse", "HEAD"),
    candidate = (file) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), file + "\n");
      git(root, "add", ".");
      git(root, "commit", "-qm", file);
      return git(root, "rev-parse", "HEAD");
    },
    ran = [],
    steps = directSteps({
      root,
      url: root,
      branch: "main",
      repository: "local/app",
      checks: repositoryChecks({ checks: NAMED }),
      intent: () => ({}),
      scan: async () => [],
      run: async (_where, _commit, argv) => {
        ran.push(argv.join(" "));
        return { exitCode: 0 };
      },
    });
  const docs = await steps.check(candidate("docs/a.md"), [], base);
  assert.deepEqual(
    docs.checks.map((c) => c.name),
    ["test", "diff"],
  );
  const ui = await steps.check(candidate("src/ui/b.tsx"), [], base);
  assert.deepEqual(
    ui.checks.map((c) => c.name),
    ["test", "diff", "ui"],
  );
  // A rerun names the checks to run again by name.
  const again = await steps.check(candidate("src/ui/c.tsx"), [], base, ["ui"]);
  assert.deepEqual(
    again.checks.map((c) => c.name),
    ["ui"],
  );
  assert.equal(ran.length, 6);
});
