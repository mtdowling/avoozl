// Bringing the default branch into an epic's integration branch on a schedule
// (RC16.6, design D21). GitHub's own merge call makes one merge commit on the
// branch and moves it forward the ordinary way. Nothing here rewrites
// history, and the only write is that merge call. A conflict changes nothing
// on GitHub: the sync stops, and one Needs you row names the files.
//
// shortcut: the files named for a conflict are those both sides changed (the
// first 300 each, as GitHub lists them). Upgrade when a conflict list is needed.
import { commitSubject } from "../landing/landing-config.ts";
import { integrationOf } from "./integration-branch.ts";
import { specFacts } from "../specs/spec-plans.ts";
import { ruleBranch } from "../github/github-branch-rules.ts";
import type { RulesReader } from "../github/github-branch-rules.ts";
import { asJob } from "../github/github-jobs.ts";
import { conflictRow, sharedFiles } from "../specs/integration-base.ts";
import { specTasks } from "../specs/spec-tasks.ts";
import type { Store } from "../store/store.ts";

const META = "integrationSync";
const DAY = 24 * 60 * 60 * 1000;
const EVERY: Record<string, number> = { daily: DAY, weekly: 7 * DAY };
const keyOf = (repository: string, branch: string) => `${repository}@${branch}`;

type Plan = {
  id: string;
  spec?: string;
  approvalId?: string;
  deletedAt?: string;
};
// The GitHub policy fields the sync reads.
type Policy = {
  repositories?: Record<
    string,
    {
      landing?: { commitPrefix?: string };
      baseBranch?: string | null;
      [key: string]: unknown;
    }
  >;
} | null;
export type SyncTarget = {
  spec?: string;
  repository: string;
  branch: string;
  sync: string;
};
type Entry = {
  state: "ok" | "conflict" | "error";
  lastAt?: number;
  error?: string;
  files?: string[];
  base?: string;
};
type SyncMeta = { entries: Record<string, Entry>; problems: string };
// The GitHub calls the sync makes (with ruleBranch's and sharedFiles').
type SyncGitHub = Pick<RulesReader, "repository"> & {
  compareCommits(
    repository: string,
    base: string,
    head: string,
  ): Promise<{ ahead_by?: number }>;
  mergeBranch(
    repository: string,
    merge: { base: string; head: string; message: string },
  ): Promise<unknown>;
};
type Notice = { channel: string; title: string; text: string };

// The facts of the spec a plan was approved from, or null.
function planManifest(store: Store, plan: Plan) {
  const files = store.get<{ id: string; files?: Record<string, string> }>(
    "approvals",
    plan?.approvalId,
  )?.files;
  return !files || !specTasks(files) ? null : specFacts(files);
}

// { targets: [{spec, repository, branch, sync}], problems: [text] } from the
// approved plans whose manifest names an integration branch. The repository
// is the one the epic's leaf tasks name; it is never guessed from two.
export function syncTargets(store: Store, policy: Policy) {
  const targets: SyncTarget[] = [],
    problems: string[] = [],
    registered = Object.keys(policy?.repositories || {});
  const plans = store
    .list<Plan>("plans")
    .filter((plan) => plan.approvalId && !plan.deletedAt)
    .sort((a, b) => String(a.spec).localeCompare(String(b.spec)));
  for (const plan of plans) {
    let manifest: Record<string, unknown> | null, wanted;
    try {
      manifest = planManifest(store, plan);
      wanted = integrationOf(manifest);
    } catch (error) {
      problems.push(`${plan.spec}: ${(error as Error).message}`);
      continue;
    }
    if (!wanted || !manifest) continue;
    type Leaf = { kind?: string; repository?: string } | null;
    const named = [
      ...new Set(
        (Object.values(manifest.tasks || {}) as Leaf[])
          .filter((entry) => entry?.kind !== "package" && entry?.repository)
          // A leaf names a repository ID or an owner/name; policy keys are owner/names.
          .map(
            (entry) =>
              store
                .list<{ id: string; github?: string }>("repositories")
                .find((p) => p.id === entry!.repository)?.github ??
              (entry!.repository as string),
          ),
      ),
    ];
    if (named.length > 1)
      problems.push(
        `${plan.spec}: its tasks name two or more repositories (${named.join(", ")}), so Avoozl cannot pick one for ${wanted.branch}.`,
      );
    else if (named.length === 0 && registered.length !== 1)
      problems.push(
        `${plan.spec}: its tasks name no repository and there is not exactly one registered repository for ${wanted.branch}.`,
      );
    else {
      const repository = named[0] ?? registered[0];
      if (!registered.includes(repository))
        problems.push(
          `${plan.spec}: ${repository} is not a registered repository.`,
        );
      else targets.push({ spec: plan.spec, repository, ...wanted });
    }
  }
  return { targets, problems };
}

// The tick step. `targets` are the epics this machine syncs. Returns
// {notify, errors}. An entry is {state: ok|conflict|error, lastAt, error,
// files, base}. A conflict or an error is looked at again on each tick; an
// ok entry waits for its schedule.
export async function syncStep(
  store: Store,
  github: SyncGitHub | null,
  targets: SyncTarget[],
  {
    policy,
    now = Date.now(),
    problems = [],
  }: { policy?: Policy; now?: number; problems?: string[] } = {},
) {
  const notify: Notice[] = [],
    errors: string[] = [],
    old = store.getMeta<SyncMeta>(META) ?? { entries: {}, problems: "" },
    next: SyncMeta = { entries: {}, problems: problems.join("\n") };
  if (next.problems && next.problems !== old.problems) errors.push(...problems);
  for (const target of targets) {
    const { repository, branch, sync } = target,
      key = keyOf(repository, branch),
      before = old.entries?.[key];
    if (sync === "off" || !github) continue;
    next.entries[key] = before ?? { state: "ok" };
    const say = (text: string) => {
      if (before?.error !== text) errors.push(`${key}: ${text}`);
      next.entries[key] = { ...next.entries[key], error: text };
    };
    try {
      const base = await ruleBranch(
        github,
        repository,
        policy?.repositories?.[repository],
      );
      if (!base) throw Error("the default branch could not be read");
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
        next.entries[key] = { ...before!, error: undefined };
        continue;
      }
      try {
        await asJob("integration", github).mergeBranch(repository, {
          base: branch,
          head: base,
          message: commitSubject(
            policy?.repositories?.[repository]?.landing?.commitPrefix,
            `Merge ${base} into ${branch}`,
          ),
        });
        next.entries[key] = { state: "ok", lastAt: now, base };
      } catch (error) {
        if ((error as { status?: number }).status !== 409) throw error;
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
      say(`GitHub could not be read: ${(error as Error).message}`);
    }
  }
  store.setMeta(META, next);
  return { notify, errors };
}

// The Needs you rows the last step left standing.
export function syncNeedsYou(store: Store) {
  return Object.entries(store.getMeta<SyncMeta>(META)?.entries ?? {})
    .filter(([, entry]) => entry.state === "conflict")
    .map(([key, entry]) =>
      conflictRow(
        key,
        entry,
        () =>
          "Avoozl changed nothing and the row clears when the branch has caught up.",
      ),
    );
}
