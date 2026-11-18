#!/usr/bin/env node
// Live proof rc-p2: spec to issues (single-repo mode), one batch, one merge,
// spec edit. Real GitHub. Usage: node p2.mjs OWNER/EMPTY-SCRATCH-REPO --confirm
// The repository needs a `main` branch (an initial README is enough).
import fs from "node:fs";
import path from "node:path";
import { liveWorkspace, landFiles, run } from "./lib.mjs";

// Plans-repo mode: p2.mjs OWNER/CODE --plans OWNER/PLANS --confirm
const REPO = process.argv[2];
const PLANS = process.argv.includes("--plans")
  ? process.argv[process.argv.indexOf("--plans") + 1]
  : null;
if (!REPO || !process.argv.includes("--confirm")) {
  console.error("usage: p2.mjs OWNER/REPO [--plans OWNER/PLANS] --confirm");
  process.exit(2);
}
const out = (label, value) => console.log(label, JSON.stringify(value));
const leaf = (summary, extra = {}) => ({
  kind: "leaf",
  summary,
  acceptance: [summary + " works."],
  checks: ["npm test"],
  completion: "integrated",
  ...extra,
});
const manifest = (changes = {}) => ({
  tasks: {
    1: {
      kind: "package",
      summary: "The goal.",
      requires: ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"],
      acceptance: ["All work."],
    },
    1.1: leaf("First"),
    1.2: leaf("Second"),
    1.3: leaf("Third"),
    1.4: leaf("Fourth", { requires: ["1.1"] }),
    1.5: leaf("Fifth"),
    1.6: leaf("Sixth"),
    1.7: leaf("Seventh"),
    ...changes,
  },
  // The planner grouped the three small leaves (§4.37).
  batches: {
    small: {
      tasks: ["1.1", "1.2", "1.3"],
      reason: "Three small config edits",
    },
  },
});
const specFiles = (changes) => ({
  ".kiro/specs/config/requirements.md":
    "# Load configuration\n\nThe CLI reads and validates config.json.\n",
  ".kiro/specs/config/design.md": "# Design\n\nA loader, then a validator.\n",
  ".kiro/specs/config/tasks.md": [
    "# Tasks",
    "",
    "- [ ] 1 Goal",
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => `  - [ ] 1.${n} Task ${n}`),
    "",
  ].join("\n"),
  ".kiro/specs/config/avoozl/manifest.json": JSON.stringify(manifest(changes)),
});
const BATCH = ["config.1.1", "config.1.2", "config.1.3"];
const managed = (issue) =>
  JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)?.[1] ?? "null");

// The workspace is a clone of the repository that holds the spec.
const ws = PLANS
  ? liveWorkspace(PLANS, {
      github: {
        mode: "plans-repo",
        planningRepository: PLANS,
        repositories: { [REPO]: { baseBranch: "main", coder: "issue-radar" } },
      },
    })
  : liveWorkspace(REPO, { repoConfig: { coder: "issue-radar" } });
const { ops, store, github, dir } = ws;
// `clone` holds the spec; `code` is where the crew's pull requests land.
const clone = ws.clone;
let code = clone;
if (PLANS) {
  code = path.join(dir, "code");
  run("git", ["clone", "-q", `https://github.com/${REPO}.git`, code], dir);
  store.put("projects", {
    id: "planning",
    root: clone,
    planning: true,
    baseBranch: "main",
    worktreeRoot: path.join(dir, "worktrees-planning"),
    checks: [["true"]],
  });
  await ops.execute("github.configure", {
    repository: PLANS,
    projectId: "planning",
    allowedActors: ["mtdowling"],
  });
}
if (!fs.existsSync(path.join(clone, ".kiro/specs/config/tasks.md")))
  landFiles(PLANS ?? REPO, clone, specFiles(), "spec");
await ops.execute("github.configure", {
  repository: REPO,
  projectId: "code",
  allowedActors: ["mtdowling"],
});
// --project: run Set up GitHub with a new Project board, then check its fields.
let projectNumber = null;
if (process.argv.includes("--project")) {
  const request = {
    mode: PLANS ? "plans-repo" : "single-repo",
    ...(PLANS ? { planningRepository: PLANS } : {}),
    repositories: [REPO],
    project: { title: "Avoozl live proof p2" },
  };
  const preview = await ops.execute("github.setup", request);
  const applied = await ops.execute("github.setup", {
    ...request,
    confirm: true,
    previewHash: preview.previewHash,
  });
  out(
    "setup steps",
    applied.steps.map((step) => [
      step.id ?? step.title,
      step.state ?? step.status,
    ]),
  );
  const proposed =
    applied.settings?.github?.project ??
    applied.settings?.proposed?.github?.project ??
    null;
  out(
    "setup project proposal",
    proposed ?? Object.keys(applied.settings ?? {}),
  );
  projectNumber = proposed?.number ?? null;
  const file = path.join(clone, ".avoozl.json"),
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.github.project = { ...(proposed ?? {}), owner: REPO.split("/")[0] };
  fs.writeFileSync(file, JSON.stringify(config));
  ops.cachePolicy = null;
}
const plan = await ops.execute("plan.create", {
  spec: "config",
  prompt: "Load config",
  context: { projectId: "code" },
});
// Approval is a pull request. Merge it, then approve again.
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
    pending.approvalPullRequest.repository,
    "--merge",
  ],
  clone,
);
const approved = await ops.execute("plan.approve", {
  id: plan.id,
  expectedHash: plan.hash,
  expectedRevision: store.read().revision,
});
out("approved", { taskIds: approved.taskIds?.length ?? approved.pending });

const before = await github.request(
  "GET",
  `/repos/${REPO}/issues?state=all&per_page=100`,
);
const preview = await ops.execute("plan.issues.preview", { planId: plan.id });
out("suggestedBatches", preview.suggestedBatches);
const afterPreview = await github.request(
  "GET",
  `/repos/${REPO}/issues?state=all&per_page=100`,
);
out("preview wrote issues", afterPreview.length - before.length);

await ops.execute("github.project", { planId: plan.id, batches: [BATCH] });
const issues = (
  await github.request("GET", `/repos/${REPO}/issues?state=all&per_page=100`)
).filter((i) => !i.pull_request);
const byTask = new Map();
let batch = null;
for (const issue of issues) {
  const m = managed(issue);
  if (!m) continue;
  if (m.members) batch = { issue, m };
  else byTask.set(m.taskId, issue);
}
out("issue count", issues.length);
if (PLANS) {
  const plansIssues = (
    await github.request("GET", `/repos/${PLANS}/issues?state=all&per_page=100`)
  ).filter((i) => !i.pull_request);
  out(
    "issues in the plans repository",
    plansIssues.map((i) => [i.number, i.title]),
  );
}
out("batch members", batch?.m.members);
const parent = byTask.get("config.1");
const subs = parent
  ? await github.request(
      "GET",
      `/repos/${REPO}/issues/${parent.number}/sub_issues`,
    )
  : [];
out(
  "sub-issues of the package",
  subs.map((s) => s.number),
);
const four = byTask.get("config.1.4");
const blockers = four
  ? await github.request(
      "GET",
      `/repos/${REPO}/issues/${four.number}/dependencies/blocked_by`,
    )
  : [];
if (projectNumber) {
  const items = JSON.parse(
    run(
      "gh",
      [
        "project",
        "item-list",
        String(projectNumber),
        "--owner",
        REPO.split("/")[0],
        "--format",
        "json",
        "--limit",
        "50",
      ],
      clone,
    ),
  ).items;
  out(
    "project items",
    items.map((i) => [
      i.content?.number,
      i.status ?? null,
      i.wave ?? null,
      i.release ?? null,
    ]),
  );
}
out("1.4 blocked by", {
  blockers: blockers.map((b) => b.number),
  batch: batch?.issue.number,
});

// One merge closes all three batched tasks.
run("git", ["checkout", "-q", "-b", "work/batch"], code);
fs.writeFileSync(path.join(code, "done.txt"), "done\n");
run("git", ["add", "done.txt"], code);
run("git", ["commit", "-q", "-m", "Do the batch"], code);
run("git", ["push", "-q", "origin", "work/batch"], code);
const pr = run(
  "gh",
  [
    "pr",
    "create",
    "-R",
    REPO,
    "--head",
    "work/batch",
    "--base",
    "main",
    "--title",
    "Do the batch",
    "--body",
    `Closes #${batch.issue.number}`,
  ],
  clone,
);
run("gh", ["pr", "merge", pr, "--merge"], code);
run("git", ["checkout", "-q", "main"], code);
run("git", ["pull", "-q", "origin", "main"], code);
await ops.execute("workspace.tick", { sessions: [] });
const states = BATCH.map((id) => [
  id,
  store.read().tasks.find((t) => t.id === id)?.githubVerdict,
]);
out(
  "verdicts (first tick)",
  states.map(([id, v]) => [id, v?.state, v?.reason]),
);
// GitHub closes the issue a few seconds after the merge; tick again.
await new Promise((r) => setTimeout(r, 70000));
await ops.execute("workspace.tick", { sessions: [] });
out(
  "verdicts (second tick)",
  BATCH.map((id) => [
    id,
    store.read().tasks.find((t) => t.id === id)?.githubVerdict?.state,
  ]),
);

// Edit two tasks; 1.6 is claimed by a crew.
const claimed = byTask.get("config.1.6"),
  unclaimed = byTask.get("config.1.5"),
  untouched = byTask.get("config.1.7");
await github
  .request("POST", `/repos/${REPO}/labels`, {
    body: { name: "crew: in progress" },
  })
  .catch(() => {});
await github.addLabels(REPO, claimed.number, ["crew: in progress"]);
const bodies = {
  claimed: claimed.body,
  unclaimed: unclaimed.body,
  untouched: untouched.body,
};
const next = specFiles({
  1.5: leaf("Fifth", { acceptance: ["Fifth changed."] }),
  1.6: leaf("Sixth", { acceptance: ["Sixth changed."] }),
});
landFiles(
  PLANS ?? REPO,
  clone,
  {
    ".kiro/specs/config/avoozl/manifest.json":
      next[".kiro/specs/config/avoozl/manifest.json"],
  },
  "edit",
);
const saved = await ops.execute("plan.save", {
  id: plan.id,
  expectedHash: store.get("plans", plan.id).hash,
});
const again = await ops.execute("plan.approve", {
  id: plan.id,
  expectedHash: saved.hash,
  expectedRevision: store.read().revision,
});
if (again.pending) {
  run(
    "gh",
    [
      "pr",
      "merge",
      String(again.approvalPullRequest.number),
      "-R",
      again.approvalPullRequest.repository,
      "--merge",
    ],
    clone,
  );
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: saved.hash,
    expectedRevision: store.read().revision,
  });
}
const pre = (
  await github.request("GET", `/repos/${REPO}/issues?state=all&per_page=100`)
).length;
const changed = await ops.execute("spec.changed.preview", { planId: plan.id });
const post = (
  await github.request("GET", `/repos/${REPO}/issues?state=all&per_page=100`)
).length;
out(
  "changed preview rows",
  changed.rows.map((r) => [r.taskId, r.action]),
);
out("preview wrote issues", post - pre);
await ops.execute("spec.changed.apply", { planId: plan.id });
const read = async (n) => github.request("GET", `/repos/${REPO}/issues/${n}`);
const [c, u, x] = await Promise.all(
  [claimed, unclaimed, untouched].map((i) => read(i.number)),
);
const diff = (a, b) => {
  const x = a.split("\n"),
    y = b.split("\n");
  return y
    .map((line, i) => (line === x[i] ? null : [i, x[i], line]))
    .filter(Boolean);
};
out("claimed body diff", diff(bodies.claimed, c.body));
out("unclaimed body diff", diff(bodies.unclaimed, u.body));
out("untouched body diff", diff(bodies.untouched, x.body));
out("claimed body unchanged", c.body === bodies.claimed);
out("claimed comments", c.comments);
out("unclaimed body changed", u.body !== bodies.unclaimed);
out("untouched body unchanged", x.body === bodies.untouched);
out("rate", github.rateLimit("core"));
store.close();
