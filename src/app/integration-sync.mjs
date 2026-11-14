// Bringing the default branch into an epic's integration branch on a schedule
// (RC16.6, design D21). GitHub's own merge call makes one merge commit on the
// branch and moves it forward the ordinary way. Nothing here rewrites
// history, and the only write is that merge call. A conflict changes nothing
// on GitHub: the sync stops, and one Needs you row names the files.
//
// shortcut: the files named for a conflict are those both sides changed (the
// first 300 each, as GitHub lists them). Upgrade when a conflict list is needed.
import { integrationOf } from "./integration-branch.mjs";
import { ruleBranch } from "./github-branch-rules.mjs";

const META = "integrationSync";
const DAY = 24 * 60 * 60 * 1000;
const EVERY = { daily: DAY, weekly: 7 * DAY };
const keyOf = (repository, branch) => `${repository}@${branch}`;

// { targets: [{spec, repository, branch, sync}], problems: [text] } from the
// approved plans whose manifest names an integration branch. The repository
// is the one the epic's leaf tasks name; it is never guessed from two.
export function syncTargets(store, policy) {
  const targets = [],
    problems = [],
    registered = Object.keys(policy?.repositories || {}),
    radar = registered.filter(
      (id) => policy.repositories[id].coder === "issue-radar",
    );
  const plans = store
    .list("plans")
    .filter((plan) => plan.approvalId && !plan.deletedAt)
    .sort((a, b) => String(a.spec).localeCompare(String(b.spec)));
  for (const plan of plans) {
    const text = store.get("approvals", plan.approvalId)?.files?.[
      "avoozl/manifest.json"
    ];
    let manifest, wanted;
    try {
      manifest = text ? JSON.parse(text) : null;
      wanted = integrationOf(manifest);
    } catch (error) {
      problems.push(`${plan.spec}: ${error.message}`);
      continue;
    }
    if (!wanted) continue;
    const named = [
      ...new Set(
        Object.values(manifest.tasks || {})
          .filter((entry) => entry?.kind !== "package" && entry?.repository)
          .map((entry) => entry.repository),
      ),
    ];
    if (named.length > 1)
      problems.push(
        `${plan.spec}: its tasks name two or more repositories (${named.join(", ")}), so Avoozl cannot pick one for ${wanted.branch}.`,
      );
    else if (named.length === 0 && radar.length !== 1)
      problems.push(
        `${plan.spec}: its tasks name no repository and there is not exactly one Issue Radar repository for ${wanted.branch}.`,
      );
    else {
      const repository = named[0] ?? radar[0];
      if (!registered.includes(repository))
        problems.push(
          `${plan.spec}: ${repository} is not a registered repository.`,
        );
      else targets.push({ spec: plan.spec, repository, ...wanted });
    }
  }
  return { targets, problems };
}

// Files both sides changed, which is where a conflict can be.
async function sharedFiles(github, repository, branch, base) {
  const [theirs, ours] = await Promise.all([
    github.compareCommits(repository, branch, base),
    github.compareCommits(repository, base, branch),
  ]);
  const mine = new Set((ours.files || []).map((file) => file.filename));
  return (theirs.files || [])
    .map((file) => file.filename)
    .filter((name) => mine.has(name));
}

// The tick step. `targets` are the epics this machine syncs. Returns
// {notify, errors}. An entry is {state: ok|conflict|error, lastAt, error,
// files, base}. A conflict or an error is looked at again on each tick; an
// ok entry waits for its schedule.
export async function syncStep(
  store,
  github,
  targets,
  { policy, now = Date.now(), problems = [] } = {},
) {
  const notify = [],
    errors = [],
    old = store.getMeta(META) ?? { entries: {}, problems: "" },
    next = { entries: {}, problems: problems.join("\n") };
  if (next.problems && next.problems !== old.problems) errors.push(...problems);
  for (const target of targets) {
    const { repository, branch, sync } = target,
      key = keyOf(repository, branch),
      before = old.entries?.[key];
    if (sync === "off" || !github) continue;
    next.entries[key] = before ?? { state: "ok" };
    const say = (text) => {
      if (before?.error !== text) errors.push(`${key}: ${text}`);
      next.entries[key] = { ...next.entries[key], error: text };
    };
    try {
      const base = await ruleBranch(
        github,
        repository,
        policy?.repositories?.[repository],
      );
      if (base === branch) {
        say(
          "the integration branch is the default branch, so nothing is merged.",
        );
        continue;
      }
      const waiting = before?.state === "ok" && before.lastAt,
        due = !before?.lastAt || now - before.lastAt >= EVERY[sync];
      if (waiting && !due) continue;
      const wasConflict = before?.state === "conflict",
        { ahead_by: fresh } = await github.compareCommits(
          repository,
          branch,
          base,
        );
      if (!fresh) {
        next.entries[key] = { state: "ok", lastAt: now, base };
        continue;
      }
      // A conflict is not tried again before its schedule comes round.
      if (wasConflict && !due) {
        next.entries[key] = { ...before, error: undefined };
        continue;
      }
      try {
        await github.mergeBranch(repository, {
          base: branch,
          head: base,
          message: `Merge ${base} into ${branch}`,
        });
        next.entries[key] = { state: "ok", lastAt: now, base };
      } catch (error) {
        if (error.status !== 409) throw error;
        const files = await sharedFiles(github, repository, branch, base).catch(
          () => before?.files ?? [],
        );
        next.entries[key] = { state: "conflict", lastAt: now, base, files };
        if (!wasConflict)
          notify.push({
            channel: "decision",
            title: `${branch} could not take ${base}`,
            text: `Merging ${base} into ${branch} in ${repository} has a conflict. Resolve it on the branch; Avoozl changed nothing.`,
          });
      }
    } catch (error) {
      say(`GitHub could not be read: ${error.message}`);
    }
  }
  store.setMeta(META, next);
  return { notify, errors };
}

// The Needs you rows the last step left standing.
export function syncNeedsYou(store) {
  const items = [];
  for (const [key, entry] of Object.entries(
    store.getMeta(META)?.entries ?? {},
  )) {
    if (entry.state !== "conflict") continue;
    const [repository, branch] = [
        key.slice(0, key.indexOf("@")),
        key.slice(key.indexOf("@") + 1),
      ],
      files = entry.files?.length
        ? entry.files.join(", ")
        : "none could be listed";
    items.push({
      kind: "needs-human",
      reason: "crew",
      id: `integration-conflict:${key}`,
      taskId: null,
      authority: "github",
      link: `https://github.com/${repository}/compare/${branch}...${entry.base}`,
      title: `${branch} has a conflict with ${entry.base}`,
      detail: `Merging ${entry.base} into ${branch} in ${repository} conflicts. Files changed on both sides: ${files}. Merge ${entry.base} into the branch yourself and push; Avoozl changed nothing and the row clears when the branch has caught up.`,
      openedAt: new Date(entry.lastAt).toISOString(),
    });
  }
  return items;
}
