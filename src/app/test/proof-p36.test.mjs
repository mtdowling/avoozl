// Proof P36 (Requirement 59, design §6.9): one epic over two member plans,
// and the old forms refused. An isolated temporary workspace in plans-repo
// mode with a fake GitHub; every value is fake. The page's own parts of
// (3) and (8), the Graph levels, Dashboard and Settings, are in
// hosts/kirocrew/ui/test/epics.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../api/operations.mjs";
import { flowPolicy } from "../flow/flow.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_p36p36p36p36p36p",
  PLANS = "example/plans";

// The shared fake, plus what the tick's completion step reads: closes by
// an allowed actor, with no merged pull request.
class ClosingGitHub extends FakeGitHub {
  constructor() {
    super();
    this.permissions.set("maintainer", "write");
    this.issueTypes = { example: ["Task", "Epic"] };
  }
  closingPullRequests() {
    return Promise.resolve([]);
  }
  pullRequestReviews() {
    return Promise.resolve([]);
  }
  branchPullRequests() {
    return Promise.resolve([]);
  }
  issueLinks() {
    return Promise.resolve([]);
  }
  checkRuns() {
    return Promise.resolve([]);
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
  close(number) {
    const issue = this.created.find((item) => item.number === number),
      at = "2026-11-13T10:00:00Z";
    Object.assign(issue, {
      state: "closed",
      state_reason: "completed",
      closed_at: at,
      updated_at: at,
    });
    this.events.set(number, [
      ...(this.events.get(number) || []),
      {
        event: "closed",
        actor: { login: "maintainer" },
        state_reason: "completed",
        created_at: at,
      },
    ]);
  }
}

const leaf = (extra = {}) => ({
  kind: "leaf",
  summary: "Do it.",
  repository: "code",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
  ...extra,
});

function writePlan(root, name, { front, tasks, entries, extra = {} }) {
  writeSpec(root, name, {
    "requirements.md": `${front ? `---\n${front}\n---\n` : ""}# Plan ${name}\n\nThe goal of ${name}.\n`,
    "tasks.md": `# Tasks\n\n${tasks}`,
    "avoozl/manifest.json": JSON.stringify(
      { tasks: entries, ...extra },
      null,
      2,
    ),
  });
}

function writeEpic(
  root,
  name,
  members,
  entry = (plan) => ({ plan, summary: `Plan ${plan}.` }),
) {
  writeSpec(root, name, {
    "requirements.md": `# Rewrite\n\nRewrite the runtime in two plans.\n\n## What done means\n\nAlpha and beta are done.\n`,
    "design.md": "# Design\n\nAlpha first, then beta.\n",
    "tasks.md": `# Plans\n\n${members.map((m, i) => `- [ ] ${i + 1} ${m}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify(
      {
        kind: "epic",
        tasks: Object.fromEntries(
          members.map((m, i) => [String(i + 1), entry(m)]),
        ),
      },
      null,
      2,
    ),
  });
}

async function workspace(t) {
  const { store } = fixture(t),
    root = temporaryDirectory("avoozl-p36-"),
    github = new ClosingGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "plans-repo",
        planningRepository: PLANS,
        epicIssueType: "Epic",
        repositories: {
          [PLANS]: { baseBranch: "main", allowedActors: ["maintainer"] },
          "example/code": { baseBranch: "main", allowedActors: ["maintainer"] },
        },
      },
    }),
  );
  // The planning checkout holds the spec folders (Requirement 30.3).
  for (const id of ["plans", "code"])
    store.put("repositories", {
      id,
      root: id === "plans" ? root : `/tmp/p36-${id}`,
      ...(id === "plans" ? { planning: true } : { github: "example/code" }),
      baseBranch: "main",
      worktreeRoot: `/tmp/p36-${id}-worktrees`,
      checks: [["npm", "test"]],
    });
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  await ops.execute("github.configure", {
    repository: PLANS,
    repositoryId: "plans",
    allowedActors: ["maintainer"],
  });
  return { root, store, github, ops };
}

const lint = async (ops, name) =>
  (await ops.execute("plan.specs", {})).items.find(
    (item) => item.name === name,
  );

async function approve(ops, name) {
  const plan =
    ops.store.get("plans", name) ||
    (await ops.execute("plan.create", {
      spec: name,
      context: { repositoryId: "plans" },
    }));
  const preview = await ops.execute("plan.preview", { id: plan.id });
  return ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
}

const markerOf = (issue) =>
  JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1]);
