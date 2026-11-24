// A scratch workspace for GitHub projection tests: fake GitHub, an approved
// spec plan and the merged approval recorded.
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import { Operations } from "../api/operations.ts";
import { fixture } from "./fixtures.ts";
import { FakeGitHub, type FakeIssue } from "./fake-github.ts";
import { writeSpec } from "./spec-fixture.ts";
import { temporaryDirectory } from "./temporary.ts";
import type { PlanDraft } from "./view-shapes.ts";

const NAMESPACE = "avz_testtesttesttest";
export const COMMIT = "0123456789abcdef0123456789abcdef01234567";
export const MARKER_LINE = /^<!-- avoozl v=1 .* -->$/m;

export type ProjectionWorkspace = Awaited<ReturnType<typeof workspace>>;

export async function workspace(
  t: TestContext,
  {
    mode,
    blockTerm,
    radar,
  }: {
    mode: string;
    coder?: string;
    blockTerm?: string;
    radar?: Record<string, unknown>;
  },
) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode,
        ...(mode === "plans-repo"
          ? { planningRepository: "example/planning" }
          : {}),
        repositories: {
          "example/code": {
            baseBranch: "main",
            ...(radar ? { radar } : {}),
          },
        },
      },
      ...(blockTerm ? { contentRules: { sets: [{ id: "names" }] } } : {}),
    }),
  );
  if (blockTerm) {
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "names.txt"), `name: ${blockTerm}\n`);
  }
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  for (const id of ["planning", "code"])
    store.put("repositories", {
      id,
      root,
      ...(id === "planning" ? { planning: true } : {}),
      baseBranch: "main",
      worktreeRoot: `/tmp/${id}-worktrees`,
      checks: [["npm", "test"]],
    });
  for (const id of mode === "plans-repo" ? ["planning", "code"] : ["code"])
    await ops.execute("github.configure", {
      repository: `example/${id}`,
      repositoryId: id,
      allowedActors: ["maintainer"],
    });
  return { store, github, ops, root };
}

// An approved spec plan.
export async function approvedSpec(
  { store, ops, root }: ProjectionWorkspace,
  { overrides = {} }: { overrides?: Record<string, string> } = {},
) {
  writeSpec(root, "config", overrides);
  const plan = await ops.execute<PlanDraft>("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { repositoryId: "code" },
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  return { plan, approved };
}

export const leaves = (github: FakeGitHub) =>
  github.created.filter((issue) => /"kind":"leaf"/.test(issue.body));
export const markersOf = (issue: FakeIssue) => [
  ...issue.body.matchAll(/<!-- avoozl v=1 .* -->/g),
];

// A spec of one package with three small leaves that may batch (1.1, 1.2,
// 1.3) and a fourth that needs 1.1. Task IDs in the store are `config.<n>`.
export const BATCH_SPEC = (() => {
  const leaf = (summary: string, extra: Record<string, unknown> = {}) => ({
    kind: "leaf",
    summary,
    acceptance: [summary + " works."],
    checks: ["npm test"],
    completion: "integrated",
    ...extra,
  });
  return {
    "tasks.md": [
      "# Tasks",
      "",
      "- [ ] `1` Goal",
      "  - [ ] `1.1` First",
      "  - [ ] `1.2` Second",
      "  - [ ] `1.3` Third",
      "  - [ ] `1.4` Fourth",
      "",
    ].join("\n"),
    "avoozl/manifest.json": JSON.stringify({
      tasks: {
        1: {
          kind: "package",
          summary: "The goal.",
          requires: ["1.1", "1.2", "1.3", "1.4"],
          acceptance: ["All four work."],
        },
        1.1: leaf("First"),
        1.2: leaf("Second"),
        1.3: leaf("Third"),
        1.4: leaf("Fourth", { requires: ["1.1"] }),
      },
    }),
  };
})();

export const BATCH = ["config.1.1", "config.1.2", "config.1.3"];

// GitHub merges a pull request that says `Closes #N` and closes the issue.
export function mergeAndClose(github: FakeGitHub, issue: FakeIssue) {
  const pull = {
    number: 100 + issue.number,
    url: `https://example.test/example/code/pull/${100 + issue.number}`,
    state: "MERGED",
    title: "Pull " + issue.number,
    body: "Closes #" + issue.number,
    merged: true,
    mergedAt: "2026-11-12T10:04:00Z",
    headRefName: "issue-radar/one",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    repository: { nameWithOwner: "example/code" },
    commits: [],
  };
  github.checkRuns = () => Promise.resolve([]);
  github.commitStatus = () => Promise.resolve({ state: "success" });
  github.issueLinks = (_repository: unknown, number: number) =>
    Promise.resolve({
      nodeId: "issue-" + number,
      linkedBranches: [],
      openBlockedBy: 0,
      totalBlockedBy: 0,
    });
  github.closingPullRequests = () => Promise.resolve([pull]);
  github.branchPullRequests = () => Promise.resolve([pull]);
  Object.assign(issue, {
    state: "closed",
    state_reason: "completed",
    closed_at: "2026-11-12T10:05:00Z",
    updated_at: "2026-11-12T10:05:00Z",
  });
  github.events.set(issue.number, [
    {
      event: "closed",
      actor: { login: "maintainer" },
      state_reason: "completed",
      created_at: "2026-11-12T10:05:00Z",
    },
  ]);
}
