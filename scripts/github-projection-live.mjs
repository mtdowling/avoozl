#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Operations } from "../src/app/operations.mjs";
import { GitHubClient } from "../src/app/github.mjs";
import { Store } from "../src/app/store.mjs";

const planningRepository =
    process.env.AVOOZL_E2E_PLANNING_REPOSITORY ||
    "mtdowling/avoozl-e2e-planning-20261111",
  codeRepository =
    process.env.AVOOZL_E2E_CODE_REPOSITORY ||
    "mtdowling/avoozl-e2e-code-20261111",
  combinedRepository =
    process.env.AVOOZL_E2E_COMBINED_REPOSITORY ||
    "mtdowling/avoozl-e2e-combined-20261111",
  keepIssues = process.argv.includes("--keep-issues");

if (!process.argv.includes("--confirm")) {
  console.error(
    "This check creates issues and dependency edges in the configured private repositories. Re-run with --confirm.",
  );
  process.exit(2);
}

function snapshot() {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    project: {
      name: "Avoozl GitHub projection proof",
      title: "Avoozl GitHub projection proof",
      integration: { revision: "", mainRevision: "", acceptedRevision: "" },
      pollIntervalMs: 10000,
    },
    statuses: [
      { id: "planned", label: "Planned", complete: false },
      { id: "partial", label: "Partly implemented", complete: false },
      { id: "implemented", label: "Implemented", complete: false },
      { id: "accepted", label: "Accepted", complete: true },
      { id: "review", label: "Review", complete: false },
      { id: "blocked", label: "Blocked", complete: false },
      { id: "deferred", label: "Deferred", complete: false },
    ],
    epics: [{ id: "proof", title: "Proof", scope: "catalog" }],
    tracks: [{ id: "catalog", label: "Proof" }],
    tasks: [],
    edges: [],
    documents: {},
    changelog: [],
  };
}

function taskBlock({ id, title, projectId, requires = [] }) {
  return `\`\`\`task\n${JSON.stringify({
    id,
    title,
    summary: `${title} for the GitHub projection proof.`,
    acceptance: [`${title} is represented by one GitHub issue.`],
    requires,
    epic: "proof",
    projectId,
  })}\n\`\`\``;
}

function labels(issue) {
  return (issue.labels || []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

async function runCase({ name, repositories, tasks }) {
  const base = process.env.KIROCREW_SCRATCH || os.tmpdir(),
    directory = fs.mkdtempSync(path.join(base, `avoozl-${name}-`)),
    store = new Store(path.join(directory, "workspace.sqlite")),
    github = new GitHubClient(),
    ops = new Operations(store, {
      github,
      operator: "GitHub projection proof",
    }),
    created = [];
  try {
    store.importSnapshot(snapshot());
    for (const [projectId, repository] of Object.entries(repositories)) {
      store.put("projects", {
        id: projectId,
        root: directory,
        baseBranch: "main",
        worktreeRoot: path.join(directory, "worktrees", projectId),
        checks: [],
      });
      await ops.execute("github.configure", {
        repository,
        projectId,
        label: "avoozl:e2e-ready",
        managedLabel: "avoozl:e2e-managed",
        allowedActors: ["mtdowling"],
      });
    }

    const planId = `github-${name}-${Date.now()}`,
      planText = `# ${name} projection proof\n\n${tasks.map(taskBlock).join("\n\n")}\n`,
      plan = await ops.execute("plan.create", {
        id: planId,
        prompt: `Prove ${name} GitHub projection`,
        text: planText,
      }),
      approved = await ops.execute("plan.approve", {
        id: plan.id,
        expectedHash: plan.hash,
        expectedRevision: store.read().revision,
      }),
      first = await ops.execute("github.project", { planId: plan.id });
    created.push(...first.issues);

    const byTask = new Map(first.issues.map((issue) => [issue.taskId, issue])),
      foundation = byTask.get(approved.taskIds[0]),
      delivery = byTask.get(approved.taskIds[1]),
      blockers = await github.listIssueBlockers(
        delivery.repository,
        delivery.number,
      ),
      foundationRemote = await github.issue(
        foundation.repository,
        foundation.number,
      ),
      deliveryRemote = await github.issue(delivery.repository, delivery.number);

    if (
      blockers.length !== 1 ||
      Number(blockers[0].id) !== Number(foundation.issueId)
    )
      throw Error(`${name}: GitHub did not preserve the expected dependency.`);
    if (!labels(foundationRemote).includes("avoozl:e2e-ready"))
      throw Error(`${name}: the unblocked issue did not receive readiness.`);
    if (labels(deliveryRemote).includes("avoozl:e2e-ready"))
      throw Error(`${name}: the blocked issue received readiness early.`);

    const repeated = await ops.execute("github.project", { planId: plan.id });
    if (
      repeated.issues.some(
        (issue, index) => issue.number !== first.issues[index].number,
      )
    )
      throw Error(`${name}: the repeated projection created different issues.`);

    const recoveryDirectory = fs.mkdtempSync(
        path.join(base, `avoozl-${name}-recovery-`),
      ),
      recoveryStore = new Store(
        path.join(recoveryDirectory, "workspace.sqlite"),
      ),
      recoveryOps = new Operations(recoveryStore, {
        github,
        operator: "GitHub projection recovery proof",
      });
    try {
      recoveryStore.importSnapshot(snapshot());
      for (const [projectId, repository] of Object.entries(repositories)) {
        recoveryStore.put("projects", {
          id: projectId,
          root: recoveryDirectory,
          baseBranch: "main",
          worktreeRoot: path.join(recoveryDirectory, "worktrees", projectId),
          checks: [],
        });
        await recoveryOps.execute("github.configure", {
          repository,
          projectId,
          label: "avoozl:e2e-ready",
          managedLabel: "avoozl:e2e-managed",
          allowedActors: ["mtdowling"],
        });
      }
      const recoveryPlan = await recoveryOps.execute("plan.create", {
        id: planId,
        prompt: `Recover ${name} GitHub projection`,
        text: planText,
      });
      await recoveryOps.execute("plan.approve", {
        id: recoveryPlan.id,
        expectedHash: recoveryPlan.hash,
        expectedRevision: recoveryStore.read().revision,
      });
      const recovered = await recoveryOps.execute("github.project", {
        planId: recoveryPlan.id,
      });
      if (
        recovered.issues.some(
          (issue, index) => issue.number !== first.issues[index].number,
        )
      )
        throw Error(`${name}: a fresh workspace created duplicate issues.`);
    } finally {
      recoveryStore.close();
      fs.rmSync(recoveryDirectory, { recursive: true, force: true });
    }

    return {
      name,
      planId: plan.id,
      issues: first.issues.map((issue) => ({
        taskId: issue.taskId,
        repository: issue.repository,
        number: issue.number,
        url: issue.url,
        ready: issue.state === "authorized",
        blockerIssueIds: issue.managedBlockerIssueIds,
      })),
      dependency: {
        blocked: delivery.url,
        blocker: foundation.url,
        githubIssueId: Number(blockers[0].id),
      },
      repeatedWithoutDuplication: true,
      freshWorkspaceRecovery: true,
    };
  } finally {
    if (!keepIssues)
      for (const issue of created)
        await github
          .updateIssue(issue.repository, issue.number, {
            state: "closed",
            state_reason: "not_planned",
          })
          .catch((error) =>
            console.error(`Could not close ${issue.url}: ${error.message}`),
          );
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function runIntakeCase() {
  const name = "configurable-intake",
    base = process.env.KIROCREW_SCRATCH || os.tmpdir(),
    directory = fs.mkdtempSync(path.join(base, `avoozl-${name}-`)),
    store = new Store(path.join(directory, "workspace.sqlite")),
    github = new GitHubClient(),
    ops = new Operations(store, { github, operator: "GitHub intake proof" }),
    label = "ship-with-avoozl";
  let issue;
  try {
    store.importSnapshot(snapshot());
    store.put("projects", {
      id: "combined",
      root: directory,
      baseBranch: "main",
      worktreeRoot: path.join(directory, "worktrees", "combined"),
      checks: [],
    });
    await ops.execute("github.configure", {
      repository: combinedRepository,
      projectId: "combined",
      label,
      assignee: "mtdowling",
      allowedActors: ["mtdowling"],
      minimumPermission: "write",
    });
    issue = await github.createIssue(combinedRepository, {
      title: "Prove configurable Avoozl intake",
      body: `## Acceptance criteria\n\n- [ ] A configured label creates one authorized local task.`,
      assignees: ["mtdowling"],
    });
    await github.addLabels(combinedRepository, issue.number, [label]);
    const synced = await ops.execute("github.sync", {
        repository: combinedRepository,
        issueNumber: issue.number,
      }),
      authorized = synced.authorized[0],
      task = store
        .read()
        .tasks.find((candidate) => candidate.id === authorized?.taskId);
    if (!authorized || task?.dispatch?.state !== "authorized")
      throw Error(
        "configurable-intake: the configured label did not authorize the task.",
      );

    await github.removeLabel(combinedRepository, issue.number, label);
    const withdrawn = await ops.execute("github.sync", {
      repository: combinedRepository,
      issueNumber: issue.number,
    });
    if (
      withdrawn.withdrawn.length !== 1 ||
      store.read().tasks.find((candidate) => candidate.id === task.id)?.dispatch
        ?.state !== "withdrawn"
    )
      throw Error(
        "configurable-intake: removing the label did not withdraw readiness.",
      );

    return {
      name,
      repository: combinedRepository,
      issue: issue.html_url,
      label,
      authorizedActor: authorized.labelActor,
      taskId: task.id,
      withdrawnAfterRemoval: true,
    };
  } finally {
    if (issue && !keepIssues)
      await github
        .updateIssue(combinedRepository, issue.number, {
          state: "closed",
          state_reason: "not_planned",
        })
        .catch((error) =>
          console.error(`Could not close ${issue.html_url}: ${error.message}`),
        );
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const results = [];
try {
  results.push(
    await runCase({
      name: "cross-repository",
      repositories: {
        planning: planningRepository,
        code: codeRepository,
      },
      tasks: [
        {
          id: "planning-foundation",
          title: "Approve projection foundation",
          projectId: "planning",
        },
        {
          id: "code-delivery",
          title: "Deliver projected code",
          projectId: "code",
          requires: ["planning-foundation"],
        },
      ],
    }),
  );
  results.push(
    await runCase({
      name: "same-repository",
      repositories: { combined: combinedRepository },
      tasks: [
        {
          id: "combined-foundation",
          title: "Build combined foundation",
          projectId: "combined",
        },
        {
          id: "combined-delivery",
          title: "Deliver combined change",
          projectId: "combined",
          requires: ["combined-foundation"],
        },
      ],
    }),
  );
  results.push(await runIntakeCase());
  console.log(JSON.stringify({ ok: true, keepIssues, results }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
