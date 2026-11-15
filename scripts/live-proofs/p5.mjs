#!/usr/bin/env node
// Live proof rc-p5: auto-merge arms on the right pull requests only. Real
// GitHub, real Actions check `build`, real branch ruleset. The pull requests
// are opened by hand with the login a crew uses, so GitHub cannot tell them
// from a crew's. Usage: node p5.mjs OWNER/NEW-EMPTY-REPO --confirm
import fs from "node:fs";
import path from "node:path";
import { liveWorkspace, landFiles, run } from "./lib.mjs";
import { mergeNeedsYou } from "../../src/app/radar-merge.mjs";

const REPO = process.argv[2];
if (!REPO || !process.argv.includes("--confirm")) {
  console.error("usage: p5.mjs OWNER/REPO --confirm");
  process.exit(2);
}
const t0 = Date.now();
const out = (label, value) =>
  console.log(
    `[${Math.round((Date.now() - t0) / 1000)}s]`,
    label,
    JSON.stringify(value),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const repoConfig = {
  coder: "issue-radar",
  requiredChecks: ["build"],
  managedLabels: { ready: "ready" },
};
const ws = liveWorkspace(REPO, {
  repoConfig,
  config: { delivery: { ship: "auto-merge" } },
});
const { ops, store, github, clone } = ws;
const git = (...args) => run("git", args, clone);
const leaf = (name) => ({
  kind: "leaf",
  summary: `Add \`${name}.txt\` holding the line \`${name}\`.`,
  acceptance: [`\`cat ${name}.txt\` prints \`${name}\`.`],
  checks: [`test "$(cat ${name}.txt)" = ${name}`],
  completion: "integrated",
});
run(
  "gh",
  ["repo", "edit", REPO, "--enable-auto-merge", "--enable-squash-merge"],
  clone,
);
landFiles(
  REPO,
  clone,
  {
    ".github/workflows/build.yml": [
      "name: build",
      "on: [pull_request]",
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - run: test ! -f RED",
      "",
    ].join("\n"),
    "shared.txt": "base\n",
    ".kiro/specs/merge/requirements.md": "# Files\n\nThree text files.\n",
    ".kiro/specs/merge/design.md": "# Design\n\nOne file per task.\n",
    ".kiro/specs/merge/tasks.md":
      "# Tasks\n\n- [ ] 1 Add a.txt\n- [ ] 2 Add b.txt\n- [ ] 3 Add c.txt\n",
    ".kiro/specs/merge/avoozl/manifest.json": JSON.stringify({
      tasks: { 1: leaf("a"), 2: leaf("b"), 3: leaf("c") },
    }),
  },
  "merge",
);
await ops.execute("github.configure", {
  repository: REPO,
  projectId: "code",
  allowedActors: ["mtdowling"],
});
const plan = await ops.execute("plan.create", {
  spec: "merge",
  prompt: "Merge proof",
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
await ops.execute("plan.approve", {
  id: plan.id,
  expectedHash: plan.hash,
  expectedRevision: store.read().revision,
});
const projected = await ops.execute("github.project", { planId: plan.id });
const issue = Object.fromEntries(
  (projected.issues ?? []).map((i) => [i.taskId, i.number]),
);
out("issues", issue);
git("pull", "-q", "origin", "main");

// The conflicted branch: changes shared.txt, then main changes it too.
const branch = (name, files, base = "main") => {
  git("checkout", "-q", base);
  git("checkout", "-q", "-b", name);
  for (const [file, text] of Object.entries(files)) {
    if (text === null) fs.rmSync(path.join(clone, file));
    else fs.writeFileSync(path.join(clone, file), text);
  }
  git("add", "-A");
  git("commit", "-q", "-m", `Work on ${name}`);
  git("push", "-q", "origin", name);
  git("checkout", "-q", "main");
};
branch("crew/c", { "c.txt": "c\n", "shared.txt": "from crew\n" });
landFiles(REPO, clone, { "shared.txt": "from main\n" }, "shared");
branch("crew/a", { "a.txt": "a\n", RED: "red\n" });
branch("crew/none", { "none.txt": "none\n" });

// The required check, as a branch ruleset on main.
await github.request("POST", `/repos/${REPO}/rulesets`, {
  body: {
    name: "build required",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [{ context: "build" }],
        },
      },
    ],
  },
});
const pr = (head, body) =>
  Number(
    run(
      "gh",
      [
        "pr",
        "create",
        "-R",
        REPO,
        "--head",
        head,
        "--base",
        "main",
        "--title",
        `Work on ${head}`,
        "--body",
        body,
      ],
      clone,
    )
      .split("/")
      .pop(),
  );
const prA = pr("crew/a", `Closes #${issue["merge.1"]}`),
  prNone = pr("crew/none", "No issue."),
  prC = pr("crew/c", `Closes #${issue["merge.3"]}`);
out("pull requests", { prA, prNone, prC });
out("merge path", await ops.mergePaths(REPO));

const readPull = (n) => github.request("GET", `/repos/${REPO}/pulls/${n}`);
const state = async (label) => {
  const rows = {};
  for (const [name, n] of Object.entries({ prA, prNone, prC })) {
    const p = await readPull(n);
    rows[name] = {
      state: p.merged ? "merged" : p.state,
      armed: Boolean(p.auto_merge),
      mergeable: p.mergeable_state,
      labels: p.labels.map((l) => l.name),
    };
  }
  out(label, rows);
  return rows;
};
const tick = () =>
  ops
    .execute("workspace.tick", { sessions: [] })
    .catch((e) => out("tick error", e.message));

// Red: wait for build to fail on A, then tick twice.
await sleep(90000);
await tick();
await sleep(5000);
await tick();
const red = await state("red, after two ticks");
out(
  "needs you (red)",
  mergeNeedsYou(store).map((r) => [r.kind, r.pullRequest]),
);

// Green: remove RED on A.
git("checkout", "-q", "crew/a");
git("rm", "-q", "RED");
git("commit", "-q", "-m", "Make build pass");
git("push", "-q", "origin", "crew/a");
git("checkout", "-q", "main");
await sleep(120000);
await tick();
await sleep(30000);
const green = await state("green, after a tick");
out(
  "needs you (green)",
  mergeNeedsYou(store).map((r) => [r.kind, r.pullRequest]),
);

// Resolve C's conflict: merge main into it, keep main's line.
git("checkout", "-q", "crew/c");
git("pull", "-q", "origin", "crew/c");
try {
  git("merge", "-q", "origin/main", "-m", "Merge main");
} catch {
  fs.writeFileSync(path.join(clone, "shared.txt"), "from main\n");
  git("add", "shared.txt");
  git("commit", "-q", "-m", "Merge main");
}
git("push", "-q", "origin", "crew/c");
git("checkout", "-q", "main");
await sleep(20000);
await tick();
const resolved = await state("conflict resolved, after a tick");
out(
  "needs you (resolved)",
  mergeNeedsYou(store).map((r) => [r.kind, r.pullRequest]),
);

// Manual mode: a new pull request for B, green; it must not be armed.
const config = JSON.parse(
  fs.readFileSync(path.join(clone, ".avoozl.json"), "utf8"),
);
config.delivery = { ship: "manual" };
fs.writeFileSync(path.join(clone, ".avoozl.json"), JSON.stringify(config));
git("pull", "-q", "origin", "main");
branch("crew/b", { "b.txt": "b\n" });
const prB = pr("crew/b", `Closes #${issue["merge.2"]}`);
await sleep(100000);
await tick();
await sleep(5000);
await tick();
const b = await readPull(prB);
out("manual B", {
  prB,
  state: b.merged ? "merged" : b.state,
  armed: Boolean(b.auto_merge),
});
out(
  "needs you (manual)",
  mergeNeedsYou(store).map((r) => [r.kind, r.pullRequest]),
);

const pass =
  red.prA.armed &&
  red.prA.state === "open" &&
  !red.prNone.armed &&
  green.prA.state === "merged" &&
  green.prNone.state === "open" &&
  !green.prNone.armed &&
  green.prC.state === "open" &&
  green.prC.labels.includes("avoozl:merge-conflict") &&
  !b.auto_merge &&
  !b.merged &&
  mergeNeedsYou(store).some(
    (r) => r.kind === "ready-to-merge" && r.pullRequest === prB,
  );
out("verdict", pass ? "PASS (fork and stranger cases not run)" : "FAIL");
out("rate", github.rateLimit("core"));
store.close();
