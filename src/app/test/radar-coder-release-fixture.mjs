// Shared fixture for the release tests: a single-repo workspace on fake GitHub.
import fs from "node:fs";
import path from "node:path";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { FakeGitHub } from "./fake-github.mjs";

const NAMESPACE = "avz_testtesttesttest";
export const READY = "ready",
  CLAIM = "crew: in progress";

export const markerOf = (issue) =>
  JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1]);
export const labelsOf = (issue) =>
  (issue.labels || []).map((label) => label.name);
export const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  acceptance: [id + " passes"],
  projectId: "code",
  ...extra,
});

export async function setup(
  t,
  repository = {},
  tasks = [],
  coder = "issue-radar",
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
        mode: "single-repo",
        repositories: {
          "example/code": {
            baseBranch: "main",
            coder,
            managedLabels: { managed: "avoozl", ready: READY },
            ...repository,
          },
        },
      },
    }),
  );
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/code-worktrees",
    checks: [["npm", "test"]],
  });
  await ops.execute("github.configure", {
    repository: "example/code",
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  const plan = await ops.execute("plan.create", {
    id: "rel",
    prompt: "Release",
    text:
      "# rel\n\n" +
      tasks
        .map((task) => "```task\n" + JSON.stringify(task) + "\n```\n")
        .join("\n"),
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  const issueOf = (id) =>
      github.created.find(
        (issue) =>
          issue.body?.includes?.("avoozl-task") &&
          markerOf(issue).taskId === id,
      ),
    readyIds = () =>
      approved.taskIds.filter((id) => labelsOf(issueOf(id)).includes(READY)),
    tick = () => ops.execute("github.project", { planId: plan.id });
  return { store, github, ops, approved, issueOf, readyIds, tick, root };
}
