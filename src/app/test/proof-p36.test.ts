// Proof P36 (Requirement 59, design §6.9): one epic over two member plans,
// and the old forms refused. An isolated temporary workspace in plans-repo
// mode with a fake GitHub; every value is fake. The page's own parts of
// (3) and (8), the Graph levels, Dashboard and Settings, are in
// hosts/kirocrew/ui/test/epics.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Operations } from "../api/operations.ts";
import { flowPolicy } from "../flow/flow.ts";
import { FakeGitHub, type FakeIssue } from "./fake-github.ts";
import { fixture } from "./fixtures.ts";
import { writeSpec } from "./spec-fixture.ts";
import { temporaryDirectory } from "./temporary.ts";
import { found, type PlanDraft, type PlanPreview } from "./view-shapes.ts";

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
  closingPullRequests = () => Promise.resolve([]);
  pullRequestReviews() {
    return Promise.resolve([]);
  }
  branchPullRequests = () => Promise.resolve([]);
  issueLinks = () => Promise.resolve([]);
  checkRuns = () => Promise.resolve([]);
  commitStatus = () => Promise.resolve({ statuses: [] });
  close(number: number) {
    const issue = found(this.created.find((item) => item.number === number)),
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

const leaf = (extra: Record<string, unknown> = {}) => ({
  kind: "leaf",
  summary: "Do it.",
  repository: "code",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
  ...extra,
});

function writePlan(
  root: string,
  name: string,
  {
    front,
    tasks,
    entries,
    extra = {},
  }: {
    front?: string;
    tasks: string;
    entries: Record<string, unknown>;
    extra?: Record<string, unknown>;
  },
) {
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
  root: string,
  name: string,
  members: string[],
  entry = (plan: string): Record<string, unknown> => ({
    plan,
    summary: `Plan ${plan}.`,
  }),
) {
  writeSpec(root, name, {
    "requirements.md": `# Rewrite\n\nRewrite the runtime in two plans.\n\n## What done means\n\nAlpha and beta are done.\n`,
    "design.md": "# Design\n\nAlpha first, then beta.\n",
    "tasks.md": `# Plans\n\n${members.map((m, i) => `- [ ] \`${i + 1}\` ${m}\n`).join("")}`,
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

async function workspace(t: TestContext) {
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

const lint = async (ops: Operations, name: string) =>
  (
    await ops.execute<{ items: { name: string }[] }>("plan.specs", {})
  ).items.find((item) => item.name === name);

async function approve(ops: Operations, name: string) {
  const plan =
    ops.store.get<PlanDraft>("plans", name) ||
    (await ops.execute<PlanDraft>("plan.create", {
      spec: name,
      context: { repositoryId: "plans" },
    }));
  const preview = await ops.execute<PlanPreview>("plan.preview", {
    id: plan.id,
  });
  return ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
}

const markerOf = (issue: FakeIssue) =>
  JSON.parse(found(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/))[1]);
