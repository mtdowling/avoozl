import fs from "node:fs";
import path from "node:path";
import { digest } from "../model.mjs";
import { git, withWorkLock } from "./git.mjs";
import { REVISION_FILES, specFacts, specName } from "./spec-plans.mjs";
import { fail } from "./store.mjs";

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

// Only Git itself creates these detached views. No repository helper or
// source command runs when a read-only review is prepared.
export async function preparePlanReviewWorktrees(
  store,
  plan,
  round,
  { workspaceRoot, planningRoot, checkouts = store.list("repositories") } = {},
) {
  if (!workspaceRoot || !planningRoot)
    fail("The planning checkout is unavailable.", 409);
  specName(plan.spec);
  if (plan.files?.["tasks.md"] === undefined)
    fail("The reviewed revision has no tasks.md.", 409);
  const manifest = specFacts(plan.files);
  const repositories = [
    ...new Set(
      Object.values(manifest.tasks || {})
        .map((task) => task.repository)
        .filter(Boolean),
    ),
  ];
  if (repositories.some((id) => typeof id !== "string"))
    fail("Task repositories must be names.");
  const ownedRoot = path.join(
      workspaceRoot,
      ".avoozl",
      "local",
      "plan-reviews",
      round.id,
    ),
    snapshot = path.join(ownedRoot, "spec"),
    folder = path.join(snapshot, ".kiro", "specs", plan.spec),
    views = [],
    commits = {};
  const resources = {
    ownedRoot,
    snapshot,
    planningRoot,
    specFolder: folder,
    views,
  };
  try {
    fs.mkdirSync(folder, { recursive: true });
    for (const file of REVISION_FILES)
      if (typeof plan.files[file] === "string") {
        const target = path.join(folder, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, plan.files[file], { flag: "wx", mode: 0o400 });
      }
    for (const repository of repositories) {
      const checkout = checkouts.find(
        (entry) => entry.id === repository || entry.github === repository,
      );
      if (!checkout?.root)
        fail(`No local checkout is registered for ${repository}.`, 409);
      const view = path.join(
        checkout.worktreeRoot ||
          path.join(path.dirname(checkout.root), ".avoozl-worktrees"),
        `plan-review-${round.id}-${digest(repository).slice(0, 12)}`,
      );
      await withWorkLock(
        store,
        {
          id: `review:${round.id}:${checkout.id}`,
          repositoryId: checkout.id,
          kind: "review",
        },
        async () => {
          const remote = await git(checkout.root, [
              "ls-remote",
              "--symref",
              "origin",
              "HEAD",
            ]),
            branch = /^ref: refs\/heads\/(.+)\s+HEAD$/m.exec(remote)?.[1];
          if (!branch || branch.startsWith("-"))
            fail(`Cannot read the default branch of ${repository}.`, 409);
          await git(checkout.root, [
            "fetch",
            "--no-tags",
            "origin",
            "refs/heads/" + branch,
          ]);
          const commit = await git(checkout.root, [
            "rev-parse",
            "FETCH_HEAD^{commit}",
          ]);
          if (!SHA.test(commit))
            fail(`Cannot read a commit for ${repository}.`, 409);
          fs.mkdirSync(path.dirname(view), { recursive: true });
          await git(checkout.root, [
            "worktree",
            "add",
            "--detach",
            view,
            commit,
          ]);
          views.push({
            repository,
            repositoryId: checkout.id,
            root: checkout.root,
            path: view,
            commit,
          });
          if (
            (await git(view, ["rev-parse", "HEAD"])) !== commit ||
            (await git(view, ["status", "--porcelain"]))
          )
            fail(
              `The review view for ${repository} is not clean at its recorded commit.`,
              409,
            );
          commits[repository] = commit;
        },
      );
    }
    return { ...resources, commits };
  } catch (error) {
    await removePlanReviewWorktrees(store, resources);
    throw error;
  }
}

export async function removePlanReviewWorktrees(store, resources) {
  for (const view of [...(resources?.views || [])].reverse()) {
    if (!fs.existsSync(view.path)) continue;
    await withWorkLock(
      store,
      {
        id: `review-clean:${digest(view.path)}`,
        repositoryId: view.repositoryId,
        kind: "review",
      },
      () => git(view.root, ["worktree", "remove", "--force", view.path]),
    );
  }
  if (resources?.ownedRoot)
    fs.rmSync(resources.ownedRoot, { recursive: true, force: true });
}
