// @ts-nocheck: typing debt
// Integration branches by name (simplify §D21): a branch on origin named for
// a spec's folder is the base of that spec and of every spec it links, the
// outermost such branch winning; with none the base is the default branch.
// Avoozl creates and merges no integration branch. Before each claim on one,
// the default branch is merged in when it moved, with GitHub's merge call,
// which makes one merge commit and moves the branch forward; a conflict
// changes nothing and holds every claim on that branch.
import { commitSubject } from "../landing/landing-config.ts";
import { asJob } from "../github/github-jobs.ts";

const META = "integration.bases";

// The spec and each spec that links it, innermost first, over a
// linkedReader. A spec linked from two parents follows the first.
export function specChain(spec, linked) {
  const chain = [spec];
  for (let at = spec; linked; ) {
    const parent = linked.parents(at)[0]?.name;
    if (!parent || chain.includes(parent)) break;
    chain.push(parent);
    at = parent;
  }
  return chain;
}

// The base of a spec's tasks: the outermost spec of its chain with a branch
// of its own name on origin, else the default branch. `exists(name)` says
// whether origin has a branch.
export async function integrationBase(spec, { linked, exists, fallback }) {
  const chain = specChain(spec, linked);
  for (const name of chain.reverse()) if (await exists(name)) return name;
  return fallback;
}

// The branch whose task file says whether a task is done (workflow rule
// 14.6): its base when that is an integration branch that `holds` the task
// file of the task's own spec, else the specs branch, which is the default
// branch unless `specs` names another.
export const doneBranch = (base, { fallback, specs = null, holds = true }) =>
  base !== fallback && holds ? base : (specs ?? fallback);

// Files both sides changed, which is where a conflict can be.
export async function sharedFiles(github, repository, branch, base) {
  const [theirs, ours] = await Promise.all([
    github.compareCommits(repository, branch, base),
    github.compareCommits(repository, base, branch),
  ]);
  const mine = new Set((ours.files || []).map((file) => file.filename));
  return (theirs.files || [])
    .map((file) => file.filename)
    .filter((name) => mine.has(name));
}

const keyOf = (repository, branch) => `${repository}@${branch}`;

// Bring `base` (the default branch) into integration branch `branch` before a
// claim on it. Returns {merged} or {conflict: files}; a conflict is kept in
// the cache for Needs you until a later merge goes in.
export async function catchUp(
  store,
  github,
  { repository, branch, base, prefix },
) {
  const all = store.getMeta(META) ?? {},
    key = keyOf(repository, branch),
    save = (entry) => {
      const next = { ...all };
      if (entry) next[key] = entry;
      else delete next[key];
      store.setMeta(META, next);
    };
  const { ahead_by: moved } = await github.compareCommits(
    repository,
    branch,
    base,
  );
  if (!moved) {
    save(null);
    return { merged: false };
  }
  try {
    await asJob("integration", github).mergeBranch(repository, {
      base: branch,
      head: base,
      message: commitSubject(prefix, `Merge ${base} into ${branch}`),
    });
  } catch (error) {
    if (error.status !== 409) throw error;
    const files = await sharedFiles(github, repository, branch, base).catch(
      () => [],
    );
    save({ state: "conflict", base, files, at: new Date().toISOString() });
    return { conflict: files };
  }
  save(null);
  return { merged: true };
}

// The Needs you row for a `repository@branch` key whose merge of
// `entry.base` conflicts; `then` says what waits on it.
export function conflictRow(key, entry, then) {
  const at = key.indexOf("@"),
    repository = key.slice(0, at),
    branch = key.slice(at + 1),
    files = entry.files?.length
      ? entry.files.join(", ")
      : "none could be listed";
  return {
    kind: "needs-human",
    reason: "crew",
    id: `integration-conflict:${key}`,
    taskId: null,
    authority: "github",
    link: `https://github.com/${repository}/compare/${branch}...${entry.base}`,
    title: `${branch} has a conflict with ${entry.base}`,
    detail: `Merging ${entry.base} into ${branch} in ${repository} conflicts. Files changed on both sides: ${files}. Merge ${entry.base} into the branch yourself and push; ${then(branch)}`,
    openedAt: entry.at ?? new Date(entry.lastAt).toISOString(),
  };
}

// One Needs you row per integration branch whose catch-up conflicts.
export function integrationNeedsYou(store) {
  return Object.entries(store.getMeta(META) ?? {}).map(([key, entry]) =>
    conflictRow(
      key,
      entry,
      (branch) => `no task on ${branch} is claimed until it is in.`,
    ),
  );
}
