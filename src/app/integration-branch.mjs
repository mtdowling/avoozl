// The integration branch of an epic (RC16.1, design D21): the manifest names
// it, and Avoozl only reads GitHub to check it. It creates no branch. The
// check has four items, each ok or not: the name is usable, the branch is not
// the default branch, it exists, and it is protected.
import { parseRepository } from "./github.mjs";
import { ruleBranch } from "./github-branch-rules.mjs";
import { fail } from "./store.mjs";

export const SYNC_SCHEDULES = ["weekly", "daily", "off"];
export const DEFAULT_SYNC = "weekly";

// Why a branch name cannot be used, or null. A subset of git's ref rules,
// stricter on purpose: letters, digits and . _ - / only.
export function branchNameProblem(name) {
  if (typeof name !== "string" || !name.trim())
    return "Name the integration branch, such as rewrite/my-epic.";
  if (name.length > 200)
    return "The branch name is longer than 200 characters.";
  if (
    !/^[A-Za-z0-9._/-]+$/.test(name) ||
    /^[-./]|[./]$|\.\.|\/\/|\.lock(\/|$)|\/\./.test(name) ||
    name.startsWith("refs/") ||
    name === "HEAD"
  )
    return `"${name}" is not a usable branch name. Use letters, digits and . _ - /, such as rewrite/my-epic.`;
  return null;
}

// The two manifest fields, or throws a message for the lint. A manifest with
// neither field gives `null`, and nothing else changes for that epic.
export function integrationOf(manifest) {
  const { integrationBranch: branch, integrationSync: sync } = manifest || {};
  if (branch === undefined) {
    if (sync !== undefined)
      throw Error('"integrationSync" needs an "integrationBranch".');
    return null;
  }
  const problem = branchNameProblem(branch);
  if (problem) throw Error(`integrationBranch: ${problem}`);
  if (sync !== undefined && !SYNC_SCHEDULES.includes(sync))
    throw Error(`integrationSync must be one of ${SYNC_SCHEDULES.join(", ")}.`);
  return { branch, sync: sync ?? DEFAULT_SYNC };
}

const LABELS = {
  name: "Usable name",
  "not-default": "Not the default branch",
  exists: "Branch exists",
  protected: "Branch is protected",
};

// { repository, branch, defaultBranch, ready, missing: [id], items, error }.
// A GitHub read that fails leaves the items that needed it not ok and puts the
// reason in `error`. Read only.
export async function checkIntegrationBranch(
  github,
  repository,
  branch,
  settings,
) {
  const problem = branchNameProblem(branch);
  let def = null,
    exists = false,
    guarded = false,
    isDefault = false,
    error = null;
  if (!problem)
    try {
      def = await ruleBranch(github, repository, settings);
      const remote = await github.repository(parseRepository(repository));
      // Both the policy's base branch and GitHub's default count as default.
      isDefault = [def, remote?.default_branch].includes(branch);
      if (!isDefault) {
        const found = await github.branch(repository, branch).catch((e) => {
          if (e.status === 404) return null;
          throw e;
        });
        exists = Boolean(found);
        guarded = found?.protected === true;
      }
    } catch (reason) {
      error = `GitHub could not be read: ${reason.message}`;
    }
  const settingsPage = `https://github.com/${repository}/settings/branches`,
    ok = {
      name: !problem,
      "not-default": !problem && !error && !isDefault,
      exists: exists && !isDefault,
      protected: guarded && !isDefault,
    },
    detail = {
      name: problem ?? `${branch} is a usable name.`,
      "not-default": isDefault
        ? `${branch} is the default branch. Name a separate branch for the rewrite.`
        : (error ?? `${branch} differs from the default branch ${def}.`),
      exists: ok.exists
        ? `${branch} exists in ${repository}.`
        : (error ??
          `${branch} does not exist in ${repository}. Avoozl creates no branch; create it on GitHub.`),
      protected: ok.protected
        ? `${branch} is protected.`
        : (error ??
          `${branch} is not protected. Add a branch rule: ${settingsPage}`),
    },
    items = Object.keys(LABELS).map((id) => ({
      id,
      label: LABELS[id],
      ok: ok[id],
      detail: detail[id],
    }));
  return {
    repository,
    branch,
    defaultBranch: def,
    ready: items.every((item) => item.ok),
    missing: items.filter((item) => !item.ok).map((item) => item.id),
    items,
    error,
  };
}

// Refuses a branch that is not ready, naming each reason.
export function requireIntegrationBranch(check) {
  if (!check.ready)
    fail(
      `Integration branch ${check.branch} in ${check.repository} is not ready. ${check.items
        .filter((item) => !item.ok)
        .map((item) => `${item.label} (${item.detail})`)
        .join("; ")}`,
      409,
    );
  return check;
}

// The integration branch of the spec a plan was approved from, or null: no
// field, no approval yet, or a manifest the lint already refuses.
export function integrationBranchOf(store, plan) {
  try {
    const text = store.get("approvals", plan.approvalId)?.files?.[
      "avoozl/manifest.json"
    ];
    return text ? (integrationOf(JSON.parse(text))?.branch ?? null) : null;
  } catch {
    return null;
  }
}
