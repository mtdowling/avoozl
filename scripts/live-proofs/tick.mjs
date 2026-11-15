#!/usr/bin/env node
// Tick an existing live-proof workspace once and print its merge rows.
// Usage: node tick.mjs WORKSPACE_DIR [PLAN_ID]  (with a plan, project it too)
import path from "node:path";
import { Operations } from "../../src/app/operations.mjs";
import { GitHubClient } from "../../src/app/github.mjs";
import { Store } from "../../src/app/store.mjs";
import { mergeNeedsYou } from "../../src/app/radar-merge.mjs";

const dir = process.argv[2];
const store = new Store(path.join(dir, "workspace.sqlite"));
const ops = new Operations(store, {
  github: new GitHubClient(),
  operator: "mtdowling",
  workspaceRoot: path.join(dir, "clone"),
});
await ops.execute("workspace.tick", { sessions: [] });
if (process.argv[3])
  await ops.execute("github.project", { planId: process.argv[3] });
console.log(
  JSON.stringify(
    mergeNeedsYou(store).map((r) => [r.kind, r.pullRequest, r.title]),
  ),
);
store.close();
