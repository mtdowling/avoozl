// The `batch` target and the public branch (RC26.3, RC26.4, design D31.1).
// When a batch epic is done, one record is made for it; the forward step then
// builds one commit holding the net change of the epic's mirror branch and
// opens one public pull request (mirror-forward-run.mjs). The epic's mirror
// branch is never pushed to the source. A public branch that has pull requests
// merged into it is shown as a Needs you row naming its head. Avoozl never
// merges it into the default branch: it holds no call that could.
//
// shortcut: the public branch's head and its relation to the default branch
// are read once per tick for each branch that has a merged change; add a
// conditional read when many branches wait.
import { batchEpics, batchId, epicDone } from "./forward-epics.mjs";
import { parseRepository } from "../github/github.mjs";

const READY = "publicBranchReady";
const slug = (text) =>
  String(text)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "epic";

// The tick step. Returns {errors}. One record per done batch epic.
export function mirrorBatchStep(
  store,
  _github,
  { policy, now = Date.now() } = {},
) {
  for (const repository of Object.keys(policy?.repositories ?? {})) {
    const mirror = policy.repositories[repository].mirror;
    if (!mirror) continue;
    for (const epic of batchEpics(store, policy, repository)) {
      const id = batchId(epic.plan);
      if (store.get("mirror_forward", id) || !epicDone(store, epic.plan))
        continue;
      store.put("mirror_forward", {
        id,
        repository,
        mirror: mirror.mirror,
        mirrorPr: null,
        taskId: null,
        planId: epic.plan.id,
        title: String(epic.plan.title || epic.plan.spec || "Update"),
        batch: {
          branch: epic.branch,
          name: `epic-${slug(epic.plan.spec)}`,
          ...(epic.publicBranch ? { publicBranch: epic.publicBranch } : {}),
        },
        approver: mirror.trustedPersons?.[0] ?? null,
        state: "to_forward",
        reason: "The epic is done in the mirror, not forwarded yet.",
        mirrorMergedAt: new Date(now).toISOString(),
        forwardedAt: null,
        publicPrAt: null,
        publicMergedAt: null,
        forwardBranch: null,
        publicPr: null,
      });
    }
  }
  return Promise.resolve({ errors: [] });
}

// The public branches that have a merged change, by repository.
function branchesWithMerges(store, repository) {
  const names = new Set();
  for (const record of store.list("mirror_forward"))
    if (record.repository === repository && record.state === "public_merged") {
      const name = record.batch?.publicBranch ?? record.base;
      if (name) names.add(name);
    }
  return [...names];
}

// The tick step: for each public branch with a merged change, read its head
// and whether the default branch already holds it. A branch the default
// branch holds has landed and its row goes. Read only.
export async function publicBranchStep(store, github, { policy } = {}) {
  const errors = [],
    ready = {};
  for (const [repository, entry] of Object.entries(
    policy?.repositories ?? {},
  )) {
    const mirror = entry.mirror;
    if (!mirror || !github) continue;
    for (const name of branchesWithMerges(store, repository))
      try {
        const base = (await github.repository(parseRepository(mirror.source)))
            ?.default_branch,
          head = (await github.branch(mirror.source, name))?.commit?.sha,
          status = (await github.compareCommits(mirror.source, base, name))
            ?.status;
        if (head && !["identical", "behind"].includes(status))
          ready[`${repository}@${name}`] = {
            repository,
            source: mirror.source,
            branch: name,
            base,
            head,
          };
      } catch (error) {
        errors.push(
          `Public branch ${name} of ${mirror.source} could not be read: ${error.message}`,
        );
      }
  }
  if (JSON.stringify(ready) !== JSON.stringify(store.getMeta(READY) ?? {}))
    store.setMeta(READY, ready);
  return { errors };
}

// Waiting on you: the public branch is ready; a person merges it on GitHub.
export const publicBranchRows = (store) =>
  Object.entries(store.getMeta(READY) ?? {}).map(([key, found]) => ({
    kind: "needs-human",
    reason: "public-branch",
    id: `public-branch:${key}`,
    taskId: null,
    authority: "github",
    link: `https://github.com/${found.source}/compare/${found.base}...${found.branch}`,
    title: `${found.branch} is ready to land in ${found.base}`,
    detail: `Head ${found.head.slice(0, 7)} was checked. Merge it on GitHub yourself; Avoozl never merges it.`,
  }));
