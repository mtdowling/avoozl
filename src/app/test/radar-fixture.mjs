// A scratch workspace for radar projection tests: fake GitHub, an approved
// spec plan, the merged approval recorded, and a reader that serves the
// created issue and the approved spec to `verifyIssue`.
import fs from "node:fs";
import path from "node:path";
import { approvalChanges } from "../spec-approval.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const NAMESPACE = "avz_testtesttesttest";
export const COMMIT = "0123456789abcdef0123456789abcdef01234567";
export const MARKER_LINE = /^<!-- avoozl v=1 .* -->$/m;

export async function workspace(t, { mode, coder, blockTerm }) {
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
          "example/code": { baseBranch: "main", ...(coder ? { coder } : {}) },
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
    store.put("projects", {
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
      projectId: id,
      allowedActors: ["maintainer"],
    });
  return { store, github, ops, root };
}

// An approved spec plan. `approval` records the merged approval pull request
// the way `reconcileApproval` does; null leaves it unrecorded.
export async function approvedSpec(
  { store, ops, root },
  { approval = { commit: COMMIT, approvedBy: "octocat" }, overrides = {} } = {},
) {
  writeSpec(root, "config", overrides);
  const plan = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { projectId: "code" },
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  if (approval)
    store.setMeta(`spec-approval:${plan.id}:${plan.hash}`, {
      state: "merged",
      ...approval,
    });
  return { plan, approved };
}

export const leaves = (github) =>
  github.created.filter((issue) => /"kind":"leaf"/.test(issue.body));
export const markersOf = (issue) => [
  ...issue.body.matchAll(/<!-- avoozl v=1 .* -->/g),
];

// A reader over the fake: the created issue, the approver and author with
// write access, and the approved spec files at the recorded commit.
export function reader(
  github,
  issue,
  repository = "example/code",
  overrides = {},
) {
  const base = `repos/${repository}/contents/.kiro/specs/config`,
    approved = approvalChanges({
      spec: "config",
      files: { ...specFiles(), ...overrides },
    }),
    table = new Map([
      [
        `repos/example/code/issues/${issue.number}`,
        { body: { body: issue.body, user: { login: "maintainer" } } },
      ],
      [`repos/${repository}`, { body: { default_branch: "main" } }],
      [
        `repos/${repository}/compare/main...${COMMIT}`,
        { body: { status: "identical" } },
      ],
    ]);
  for (const login of ["octocat", "maintainer"])
    for (const repo of new Set(["example/code", repository]))
      table.set(`repos/${repo}/collaborators/${login}/permission`, {
        body: { permission: "write" },
      });
  for (const [file, text] of Object.entries(approved))
    table.set(`${base}/${file.split("/").slice(3).join("/")}?ref=${COMMIT}`, {
      text,
    });
  table.set(`${base}/avoozl/manifest.json?ref=${COMMIT}`, {
    text: { ...specFiles(), ...overrides }["avoozl/manifest.json"],
  });
  return async (apiPath) => {
    const hit = table.get(apiPath);
    if (!hit) return { status: 404, headers: {}, text: "{}" };
    return {
      status: 200,
      headers: {},
      text: hit.text ?? JSON.stringify(hit.body),
    };
  };
}

// A spec of one package with three small leaves that may batch (1.1, 1.2,
// 1.3) and a fourth that needs 1.1. Task IDs in the store are `config.<n>`.
export const BATCH_SPEC = (() => {
  const leaf = (summary, extra = {}) => ({
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
      "- [ ] 1 Goal",
      "  - [ ] 1.1 First",
      "  - [ ] 1.2 Second",
      "  - [ ] 1.3 Third",
      "  - [ ] 1.4 Fourth",
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
export function mergeAndClose(github, issue) {
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
  github.issueLinks = (_repository, number) =>
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
