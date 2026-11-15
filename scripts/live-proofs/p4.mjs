#!/usr/bin/env node
// Live proof rc-p4: release honors N, scopes, phases and the stop, with real
// Issue Radar crews building. Real GitHub. Runs for tens of minutes.
// Usage: node p4.mjs OWNER/REPO CODE_CREW_ID DOCS_CREW_ID --confirm
// Needs the harness running with both crews on REPO (code crew label `ready`,
// docs crew label `docs-ready`). The script ticks Avoozl each minute, merges
// crew pull requests as the owner, and pauses the docs crew before the stop.
import { execFileSync } from "node:child_process";
import { liveWorkspace, landFiles, run } from "./lib.mjs";

const [REPO, CODE_CREW, DOCS_CREW] = process.argv.slice(2);
if (!DOCS_CREW || !process.argv.includes("--confirm")) {
  console.error("usage: p4.mjs OWNER/REPO CODE_CREW_ID DOCS_CREW_ID --confirm");
  process.exit(2);
}
const READY = "ready",
  DOCS = "docs-ready",
  CLAIM = "crew: in progress";
const t0 = Date.now();
const out = (label, value) =>
  console.log(
    `[${Math.round((Date.now() - t0) / 1000)}s]`,
    label,
    JSON.stringify(value),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const harness = (...args) =>
  execFileSync("scripts/live-harness/harness.sh", args, {
    encoding: "utf8",
    env: { ...process.env, AVOOZL_HARNESS_REPO: `https://github.com/${REPO}` },
  });

const leaf = (name, phase, extra = {}) => ({
  kind: "leaf",
  phase,
  summary: `Add \`${name}.txt\` at the repository root. Its whole content is the line \`${name}\` and a newline.`,
  acceptance: [`\`cat ${name}.txt\` prints \`${name}\`.`],
  checks: [`test "$(cat ${name}.txt)" = ${name}`],
  completion: "integrated",
  ...extra,
});
const NAMES = ["code-a", "code-b", "docs-a", "docs-b", "code-c", "docs-c"];
const ws = liveWorkspace(REPO, {
  repoConfig: {
    coder: "issue-radar",
    managedLabels: { ready: READY },
    release: { capacity: 1, scopes: [{ label: DOCS, capacity: 1 }] },
  },
});
const { ops, store, github, clone } = ws;
for (const name of [READY, DOCS, CLAIM, "crew: needs human"])
  await github
    .request("POST", `/repos/${REPO}/labels`, { body: { name } })
    .catch(() => {});
landFiles(
  REPO,
  clone,
  {
    ".kiro/specs/files/requirements.md":
      "# Text files\n\nSix text files, each holding its own name.\n",
    ".kiro/specs/files/design.md":
      "# Design\n\nOne text file per task. No code.\n",
    ".kiro/specs/files/tasks.md": [
      "# Tasks",
      "",
      "## Phase 1",
      "",
      "- [ ] 1 Add code-a.txt",
      "- [ ] 2 Add code-b.txt",
      "- [ ] 3 Add docs-a.txt",
      "- [ ] 4 Add docs-b.txt",
      "",
      "## Phase 2",
      "",
      "- [ ] 5 Add code-c.txt",
      "- [ ] 6 Add docs-c.txt",
      "",
    ].join("\n"),
    ".kiro/specs/files/avoozl/manifest.json": JSON.stringify({
      phases: { p1: { title: "Phase 1" }, p2: { title: "Phase 2" } },
      tasks: {
        1: leaf("code-a", "p1"),
        2: leaf("code-b", "p1"),
        3: leaf("docs-a", "p1", { scope: DOCS }),
        4: leaf("docs-b", "p1", { scope: DOCS }),
        5: leaf("code-c", "p2"),
        6: leaf("docs-c", "p2", { scope: DOCS }),
      },
    }),
  },
  "files",
);
await ops.execute("github.configure", {
  repository: REPO,
  projectId: "code",
  allowedActors: ["mtdowling"],
});
const plan = await ops.execute("plan.create", {
  spec: "files",
  prompt: "Text files",
  context: { projectId: "code" },
});
const pending = await ops.execute("plan.approve", {
  id: plan.id,
  expectedHash: plan.hash,
  expectedRevision: store.read().revision,
});
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
const approved = await ops.execute("plan.approve", {
  id: plan.id,
  expectedHash: plan.hash,
  expectedRevision: store.read().revision,
});
const phases = Object.fromEntries(
  store
    .read()
    .tasks.filter((t) => t.planId === plan.id)
    .map((t) => [t.id, t.phase?.id]),
);
out("phases", phases);

const ids = Object.fromEntries(NAMES.map((n, i) => [n, `files.${i + 1}`]));
let issueByTask = new Map();
const readIssues = async () => {
  const list = await github.request(
    "GET",
    `/repos/${REPO}/issues?state=all&per_page=100`,
  );
  issueByTask = new Map();
  for (const issue of list.filter((i) => !i.pull_request)) {
    const m = issue.body?.match(/<!-- avoozl-task\n(.*)\n-->/);
    if (m) issueByTask.set(JSON.parse(m[1]).taskId, issue);
  }
  return list;
};
const labels = (name) =>
  (issueByTask.get(ids[name])?.labels ?? []).map((l) => l.name);
const isOpen = (name) => issueByTask.get(ids[name])?.state === "open";
const violations = [];
const snapshot = async (why) => {
  await readIssues();
  const ready = NAMES.filter((n) => isOpen(n) && labels(n).includes(READY)),
    docs = NAMES.filter((n) => isOpen(n) && labels(n).includes(DOCS)),
    claimed = NAMES.filter((n) => labels(n).includes(CLAIM)),
    closed = NAMES.filter((n) => issueByTask.has(ids[n]) && !isOpen(n));
  if (ready.length > 1 || docs.length > 1)
    violations.push({ why, ready, docs });
  const p2Early =
    (labels("code-c").some((l) => l === READY || l === DOCS) ||
      labels("docs-c").some((l) => l === READY || l === DOCS)) &&
    ["code-a", "code-b", "docs-a", "docs-b"].some(isOpen);
  if (p2Early && !reopened) violations.push({ why, phase2Early: true });
  out(why, { ready, docs, claimed, closed });
  return { ready, docs, claimed, closed };
};
let reopened = false;
const tick = async () => {
  await ops
    .execute("workspace.tick", { sessions: [] })
    .catch((e) => out("tick error", e.message));
  await ops
    .execute("github.project", { planId: plan.id })
    .catch((e) => out("project error", e.message));
};
// The owner merges a crew pull request once it is open and mergeable.
const mergeCrewPulls = async () => {
  const pulls = await github.request(
    "GET",
    `/repos/${REPO}/pulls?state=open&per_page=50`,
  );
  for (const pull of pulls) {
    if (
      pull.head.ref.startsWith("avoozl/") ||
      pull.head.ref.startsWith("seed/")
    )
      continue;
    try {
      run(
        "gh",
        ["pr", "merge", String(pull.number), "-R", REPO, "--merge"],
        clone,
      );
      out("merged crew pull request", [pull.number, pull.head.ref, pull.title]);
    } catch (e) {
      out("merge failed", [pull.number, String(e.message).slice(0, 200)]);
    }
  }
};

const deadline = Date.now() + 120 * 60 * 1000;
let stage = "phase1";
let stopId = null;
let claimedLabels = null;
while (Date.now() < deadline) {
  await tick();
  const s = await snapshot(stage);
  if (stage === "phase1" || stage === "phase2") await mergeCrewPulls();
  if (stage === "phase1" && s.closed.length >= 4) stage = "phase2";
  if (
    stage === "phase2" &&
    labels("docs-c").includes(DOCS) &&
    labels("code-c").includes(READY)
  ) {
    harness("crew-edit", DOCS_CREW, '{"enabled":false}');
    out("paused docs crew", DOCS_CREW);
    stage = "await-claim";
  }
  if (
    stage === "await-claim" &&
    labels("code-c").includes(CLAIM) &&
    !labels("docs-c").includes(CLAIM)
  ) {
    claimedLabels = labels("code-c").sort();
    harness("crew-edit", CODE_CREW, '{"enabled":false}');
    const result = await ops.execute("flow.stop", {
      scope: "all",
      reason: "live proof stop",
    });
    stopId = result.stop?.id;
    out("stopped the line", { stopId, claimedLabels });
    stage = "stopped";
    continue;
  }
  if (stage === "stopped") {
    await tick();
    await tick();
    await readIssues();
    const comments = await github.request(
      "GET",
      `/repos/${REPO}/issues/${issueByTask.get(ids["code-c"]).number}/comments`,
    );
    const docsCComments = await github.request(
      "GET",
      `/repos/${REPO}/issues/${issueByTask.get(ids["docs-c"]).number}/comments`,
    );
    out("after stop", {
      docsC: labels("docs-c"),
      codeC: labels("code-c").sort(),
      codeCUnchanged:
        JSON.stringify(labels("code-c").sort()) ===
        JSON.stringify(claimedLabels),
      codeCAvoozlComments: comments
        .filter((c) => /Avoozl/.test(c.body))
        .map((c) => c.body.slice(0, 120)),
      docsCComments: docsCComments.length,
    });
    await ops.execute("flow.resume", { stopId });
    await tick();
    await readIssues();
    out("after resume", { docsC: labels("docs-c") });
    run(
      "gh",
      [
        "issue",
        "reopen",
        String(issueByTask.get(ids["code-a"]).number),
        "-R",
        REPO,
      ],
      clone,
    );
    reopened = true;
    // GitHub answers stay cached for 60 seconds (github.cacheSeconds).
    await sleep(70000);
    await tick();
    await readIssues();
    out("after reopen", {
      docsC: labels("docs-c"),
      codeC: labels("code-c").sort(),
    });
    break;
  }
  await sleep(60000);
}
out("violations", violations);
out("final stage", stage);
out("rate", github.rateLimit("core"));
store.close();
