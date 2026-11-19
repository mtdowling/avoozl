// Proof P30 (design §4.11, §8.4; Requirements 43–48): flow with fake workers
// and scripted timings. One workspace, one sample repository with one
// declared check, fake worker and verifier sessions that follow a script on
// a fake clock, a fake check-run feed for one plans-repo leaf, and a fake
// retro model. Each numbered block is the proof's action of that number.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { snapshot } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const MIN = 60_000;
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  ...extra,
});
const CHECK = "node test/check.mjs";
// A planner batch group as approval stores it (§4.37).
const planned = (id, tasks) => ({
  planId: "p1",
  planHash: "h1",
  batch: { id, tasks, reason: "Small edits in one area" },
});

function workspace(t) {
  const root = temporaryDirectory("avoozl-p30-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(path.join(checkout, "test"), { recursive: true });
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  const flaky = path.join(root, "flaky");
  // The one declared check. `broken` fails it anywhere; `breaks-main` fails
  // it only on the branch (a scratch worktree), as a check can that depends
  // on what else is on main; the flaky file fails one run.
  fs.writeFileSync(
    path.join(checkout, "test/check.mjs"),
    `import fs from "node:fs";
import path from "node:path";
const f = ${JSON.stringify(flaky)};
if (fs.existsSync(f) && fs.readFileSync(f, "utf8") === "1") { fs.writeFileSync(f, "0"); console.error("flaky"); process.exit(1); }
if (fs.existsSync("broken")) { console.error("assertion failed: broken"); process.exit(1); }
if (fs.existsSync("breaks-main") && path.basename(process.cwd()).startsWith("avoozl-line-")) { console.error("main is broken by breaks-main"); process.exit(1); }
`,
  );
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const filler = Array.from({ length: 20 }, (_, i) =>
    leaf("f" + (i + 1), { status: "accepted" }),
  );
  const tasks = [
    leaf("e1", { kind: "package", acceptance: undefined }),
    // The planner grouped a1–a3 (R108); a4 is grouped with a5, which is
    // deferred, so a4 waits for it.
    ...["a1", "a2", "a3"].map((id) =>
      leaf(id, { parent: "e1", ...planned("g1", ["a1", "a2", "a3"]) }),
    ),
    leaf("a4", { parent: "e1", ...planned("g2", ["a4", "a5"]) }),
    leaf("a5", { status: "deferred", ...planned("g2", ["a4", "a5"]) }),
    leaf("b1"),
    leaf("c1"),
    leaf("c2"),
    leaf("d1"),
    leaf("g1", {
      route: "github",
      github: { repository: "example/app", number: 7 },
    }),
    ...filler,
  ];
  const dbPath = path.join(root, "workspace.sqlite"),
    store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks,
    edges: [{ from: "a1", to: "d1", kind: "requires" }],
  });
  store.put("approvals", { id: "approval-p1", planId: "p1", hash: "h1" });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: [["node", "test/check.mjs"]],
  });
  const config = {
    version: 1,
    delivery: { concurrency: 3, retries: 2 },
    flow: { ci: { minPullRequests: 5 } },
  };
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
  return {
    root,
    dbPath,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops: new Operations(store, { workspaceRoot: root }),
    flaky,
    config,
  };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
