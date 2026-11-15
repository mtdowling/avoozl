#!/usr/bin/env node
// Live proof rc-p3, good path: a concrete one-task spec, approved through its
// pull request and projected, so a real crew has something it can build.
// Usage: node p3-good.mjs OWNER/REPO LABEL --confirm
import { liveWorkspace, landFiles, run } from "./lib.mjs";

const [REPO, LABEL] = process.argv.slice(2);
if (!REPO || !LABEL || !process.argv.includes("--confirm")) {
  console.error("usage: p3-good.mjs OWNER/REPO LABEL --confirm");
  process.exit(2);
}
const out = (label, value) => console.log(label, JSON.stringify(value));
const ws = liveWorkspace(REPO, {
  repoConfig: { coder: "issue-radar", managedLabels: { ready: LABEL } },
});
const { ops, store, clone } = ws;
landFiles(
  REPO,
  clone,
  {
    ".kiro/specs/greet/requirements.md":
      "# Greeting file\n\nThe repository has a file `hello.txt` whose only line is `hello`.\n",
    ".kiro/specs/greet/design.md":
      "# Design\n\nOne text file at the repository root. No code.\n",
    ".kiro/specs/greet/tasks.md": "# Tasks\n\n- [ ] 1 Add hello.txt\n",
    ".kiro/specs/greet/avoozl/manifest.json": JSON.stringify({
      tasks: {
        1: {
          kind: "leaf",
          summary:
            "Add `hello.txt` at the repository root. Its whole content is the line `hello` and a newline.",
          acceptance: ["`cat hello.txt` prints `hello`."],
          checks: ['test "$(cat hello.txt)" = hello'],
          completion: "integrated",
        },
      },
    }),
  },
  "greet",
);
await ops.execute("github.configure", {
  repository: REPO,
  projectId: "code",
  allowedActors: ["mtdowling"],
});
const plan = await ops.execute("plan.create", {
  spec: "greet",
  prompt: "Greeting file",
  context: { projectId: "code" },
});
const pending = await ops.execute("plan.approve", {
  id: plan.id,
  expectedHash: plan.hash,
  expectedRevision: store.read().revision,
});
out("approval pull request", pending.approvalPullRequest);
run(
  "gh",
  [
    "pr",
    "merge",
    String(pending.approvalPullRequest.number),
    "-R",
    REPO,
    "--merge",
  ],
  clone,
);
await ops.execute("plan.approve", {
  id: plan.id,
  expectedHash: plan.hash,
  expectedRevision: store.read().revision,
});
const projected = await ops.execute("github.project", { planId: plan.id });
out(
  "issues",
  (projected.issues ?? []).map((i) => [i.taskId, i.number, i.url]),
);
store.close();
