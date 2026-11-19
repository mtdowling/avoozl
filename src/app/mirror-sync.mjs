// Mirror repositories: the sync step and the write targets (RC24.3, RC24.4,
// design D29.2, D29.3). The mirror's default branch only ever moves forward to
// the source's head. Nothing here resets, rebases or force pushes, and nothing
// writes to the source.
//
// Once the mirror has private commits, the source comes in through a
// tracking branch and a reviewed pull request instead (R102.21, §4.32.13).
// shortcut: `gitCopy` uses the local git and the `gh` credential helper, and
// has no live test; the step is tested with an injected copy.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseRepository } from "./github.mjs";
import { fail } from "./store.mjs";

const run = promisify(execFile);
const META = "mirrorSync";
const short = (sha) => String(sha || "").slice(0, 12);

// The repository that receives Avoozl's writes for `repository`: its mirror
// when the policy entry names one, else the repository itself (D29.3).
export function writeRepo(entry, repository) {
  return entry?.mirror?.mirror ?? repository;
}

// `config` (a github_repositories record) pointed at the write repository.
// The node ID belongs to the source, so it is dropped for a mirror.
export function mirrorConfig(config, repositories) {
  const mirror = repositories?.[config?.id]?.mirror;
  if (!mirror) return config;
  const { owner, repo, id } = parseRepository(mirror.mirror);
  const { nodeId: _nodeId, ...rest } = config;
  return { ...rest, id, owner, repo };
}

// The mirror whose public source `id` is, or null.
export function mirrorWithSource(repositories, id) {
  const want = String(id || "").toLowerCase();
  return (
    Object.values(repositories || {})
      .map((entry) => entry.mirror)
      .find((mirror) => mirror?.source?.toLowerCase() === want) ?? null
  );
}

// A private spec (home plansBranch) never writes to a mirror's public
// source, whatever the configured execution repository is: its issues would
// publish the plan's text.
export function refusePrivateToSource(plan, repositories, id) {
  if (plan?.home !== "plansBranch") return;
  const mirror = mirrorWithSource(repositories, id);
  if (!mirror) return;
  const name = plan.spec || plan.id;
  fail(
    `Spec ${name} is private (on the ${mirror.plansBranch} branch), so its issues may not go to ${mirror.source}, the mirror's public source. Nothing was projected. Configure the mirror ${mirror.mirror} as the execution repository, or put the mirror setting on the ${mirror.source} entry in .avoozl.json so its writes go to ${mirror.mirror}.`,
    409,
  );
}

// github.configure refuses a mirror's source as the execution repository
// when nothing sends that repository's writes to the mirror (the mirror
// setting is on another entry): private specs would then project into the
// public source.
export function refuseSourceAsExecution(repositories, repository) {
  if (!repository) return;
  const { id } = parseRepository(repository);
  if (repositories?.[id]?.mirror) return;
  const mirror = mirrorWithSource(repositories, id);
  if (mirror?.plansBranch)
    fail(
      `${id} is the public source of the mirror ${mirror.mirror}, whose private specs live on the ${mirror.plansBranch} branch. Configure the mirror ${mirror.mirror} as the execution repository instead, or put the mirror setting on the ${id} entry in .avoozl.json so its writes go to ${mirror.mirror}.`,
      409,
    );
}

// The mirror branch that holds an exact copy of the source's `branch` once
// the mirror has private commits (R102.21). It only ever fast-forwards, and a
// reviewed pull request from it into the mirror's own branch is the import.
export const trackingBranch = (branch) => `avoozl-upstream/${branch}`;
export const isTrackingBranch = (ref) =>
  String(ref ?? "").startsWith("avoozl-upstream/");

// Fast-forward `mirror`'s `target` branch (default `branch`) to `sha`, which
// `source` has on `branch`. A normal push of one explicit refspec: GitHub
// refuses it unless it is a fast-forward.
export async function gitCopy({
  source,
  mirror,
  branch,
  sha,
  target = branch,
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-mirror-")),
    helper = [
      "-c",
      "credential.helper=",
      "-c",
      "credential.helper=!gh auth git-credential",
    ],
    git = (...args) => run("git", [...helper, ...args], { cwd: dir });
  try {
    await git("init", "--bare", "-q");
    await git(
      "fetch",
      "-q",
      `https://github.com/${source}.git`,
      `refs/heads/${branch}`,
    );
    await git(
      "push",
      "-q",
      `https://github.com/${mirror}.git`,
      `${sha}:refs/heads/${target}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// After the mirror has private commits (R102.21): fast-forward the tracking
// branch to the source head, then, unless the mirror branch already holds
// that head, keep one open pull request from the tracking branch for a person
// to review and merge. Nothing here merges, resets or force pushes.
async function importUpstream({
  github,
  copy,
  mirror,
  notify,
  stop,
  sourceBranch,
  mirrorBranch,
  sourceHead,
  mirrorHead,
}) {
  const tracking = trackingBranch(mirrorBranch),
    trackingHead = (
      await github.branch(mirror.mirror, tracking).catch((error) => {
        if (error.status === 404) return null;
        throw error;
      })
    )?.commit?.sha;
  if (trackingHead !== sourceHead) {
    let status = trackingHead ? null : "ahead";
    if (trackingHead)
      try {
        status = (
          await github.compareCommits(mirror.source, trackingHead, sourceHead)
        )?.status;
      } catch (error) {
        if (error.status !== 404 && error.status !== 422) throw error;
      }
    if (status !== "ahead") {
      if (
        stop("diverged", `diverged:${sourceHead}:${trackingHead}`, {
          sourceHead,
          mirrorHead: trackingHead,
          branch: tracking,
        })
      )
        notify.push({
          channel: "decision",
          title: `${mirror.mirror} ${tracking} has diverged from ${mirror.source}`,
          text: `The ${tracking} branch of ${mirror.mirror} (${short(trackingHead)}) has commits ${mirror.source} (${short(sourceHead)}) does not. It must only copy ${mirror.source}. Avoozl changed nothing and stopped importing.`,
        });
      return;
    }
    await copy({
      source: mirror.source,
      mirror: mirror.mirror,
      branch: sourceBranch,
      target: tracking,
      sha: sourceHead,
    });
  }
  // The mirror branch already holds the source head: an import merged.
  const held = (
    await github.compareCommits(mirror.mirror, mirrorHead, sourceHead)
  )?.status;
  if (held === "behind" || held === "identical") {
    stop("imported", "imported", { sourceHead, mirrorHead });
    return;
  }
  const { owner } = parseRepository(mirror.mirror),
    open = await github.listPullRequests(mirror.mirror, {
      state: "open",
      head: `${owner}:${tracking}`,
      base: mirrorBranch,
    });
  let pull = open.find((p) => p.head?.ref === tracking);
  if (!pull)
    pull = await github.createPullRequest(mirror.mirror, {
      title: `Import ${mirror.source} ${sourceBranch} into ${mirrorBranch}`,
      head: tracking,
      base: mirrorBranch,
      body: `Avoozl copied ${mirror.source} ${sourceBranch} (${short(sourceHead)}) to ${tracking}. Review and merge this pull request to bring it into ${mirrorBranch}. Use a merge commit so the next import starts from here. Forwarding never sends these commits back to ${mirror.source}.`,
    });
  if (
    stop("import", `import:${pull.number}`, {
      sourceHead,
      mirrorHead,
      pr: pull.number,
      mirror: mirror.mirror,
    })
  )
    notify.push({
      channel: "decision",
      title: `Review the import of ${mirror.source} into ${mirror.mirror}`,
      text: `${mirror.mirror} has private commits, so ${mirror.source} (${short(sourceHead)}) comes in by pull request #${pull.number}. Review and merge it.`,
    });
}

// The tick step. Returns {notify, errors}. State is one entry per source
// branch: {state: ok|diverged|error, ...}. A row and a notice appear once per
// cause. The default branch is synced first; each public branch (RC26.3,
// `publicBranches`) is synced after it on the same terms, with its own
// explicit refspec.
export async function mirrorSyncStep(
  store,
  github,
  { policy, copy = gitCopy, publicBranches = () => [] } = {},
) {
  const notify = [],
    errors = [],
    old = store.getMeta(META) ?? { entries: {} },
    next = { entries: {} };
  for (const [repository, entry] of Object.entries(
    policy?.repositories || {},
  )) {
    const mirror = entry.mirror;
    if (!mirror || !github) continue;
    const sync = async (key, sourceBranch, mirrorBranch, label) => {
      const before = old.entries?.[key],
        stop = (state, cause, row) => {
          const fresh = before?.cause !== cause;
          next.entries[key] = {
            state,
            cause,
            openedAt: fresh ? new Date().toISOString() : before.openedAt,
            repository,
            ...(label ? { branch: label } : {}),
            ...row,
          };
          return fresh;
        };
      try {
        const [a, b] = await Promise.all([
            github.branch(mirror.source, sourceBranch),
            github.branch(mirror.mirror, mirrorBranch).catch((error) => {
              // A public branch the mirror has no copy of yet is copied whole.
              if (label && error.status === 404) return null;
              throw error;
            }),
          ]),
          sourceHead = a?.commit?.sha,
          mirrorHead = b?.commit?.sha;
        if (!sourceHead || (!mirrorHead && !(label && !b)))
          throw new Error("a branch head could not be read");
        if (sourceHead === mirrorHead) {
          next.entries[key] = { state: "ok" };
          return;
        }
        // Nothing moved since the last import check: no more calls.
        if (
          ["imported", "import"].includes(before?.state) &&
          before.sourceHead === sourceHead &&
          before.mirrorHead === mirrorHead
        ) {
          next.entries[key] = before;
          return;
        }
        // The mirror head is an ancestor of the source head, or it is not
        // (GitHub answers 404 when the source has no such commit).
        let status = mirrorHead ? null : "ahead";
        if (mirrorHead)
          try {
            status = (
              await github.compareCommits(mirror.source, mirrorHead, sourceHead)
            )?.status;
          } catch (error) {
            if (error.status !== 404 && error.status !== 422) throw error;
          }
        if (status !== "ahead") {
          await importUpstream({
            github,
            copy,
            mirror,
            notify,
            stop,
            sourceBranch,
            mirrorBranch,
            sourceHead,
            mirrorHead,
          });
          return;
        }
        await copy({
          source: mirror.source,
          mirror: mirror.mirror,
          branch: mirrorBranch,
          sha: sourceHead,
        });
        next.entries[key] = { state: "ok" };
      } catch (error) {
        const text = `${mirror.mirror} could not be synced from ${mirror.source}: ${error.message}`;
        if (stop("error", `error:${error.message}`, { error: text }))
          errors.push(text);
      }
    };
    let sourceBranch, mirrorBranch;
    try {
      const [from, to] = await Promise.all([
        github.repository(parseRepository(mirror.source)),
        github.repository(parseRepository(mirror.mirror)),
      ]);
      sourceBranch = from?.default_branch;
      mirrorBranch = to?.default_branch;
      if (!sourceBranch || !mirrorBranch)
        throw new Error("the default branch could not be read");
    } catch (error) {
      const text = `${mirror.mirror} could not be synced from ${mirror.source}: ${error.message}`,
        before = old.entries?.[repository];
      next.entries[repository] = {
        state: "error",
        cause: `error:${error.message}`,
        openedAt:
          before?.cause === `error:${error.message}`
            ? before.openedAt
            : new Date().toISOString(),
        repository,
        error: text,
      };
      if (before?.cause !== `error:${error.message}`) errors.push(text);
      continue;
    }
    await sync(repository, sourceBranch, mirrorBranch, null);
    for (const name of publicBranches(repository, mirror))
      if (name !== sourceBranch)
        await sync(`${repository}@${name}`, name, name, name);
  }
  if (Object.keys(next.entries).length || Object.keys(old.entries).length)
    store.setMeta(META, next);
  return { notify, errors };
}

// The Needs you rows the last step left standing.
export function mirrorNeedsYou(store) {
  const items = [];
  for (const [key, entry] of Object.entries(
    store.getMeta(META)?.entries ?? {},
  )) {
    if (entry.state === "ok" || entry.state === "imported") continue;
    const repository = entry.repository ?? key,
      where = entry.branch ? ` (branch ${entry.branch})` : "";
    if (entry.state === "import") {
      items.push({
        kind: "needs-human",
        reason: "crew",
        id: `mirror-sync:${key}`,
        taskId: null,
        authority: "github",
        link: `https://github.com/${entry.mirror}/pull/${entry.pr}`,
        title: `Review the import of ${repository}${where} into its mirror`,
        detail: `The mirror has private commits, so ${repository} (${short(entry.sourceHead)}) comes in by pull request #${entry.pr}. Review and merge it; the row clears when the mirror holds that head.`,
        openedAt: entry.openedAt,
      });
      continue;
    }
    items.push({
      kind: "needs-human",
      reason: "crew",
      id: `mirror-sync:${key}`,
      taskId: null,
      authority: "github",
      link: `https://github.com/${repository}`,
      title:
        entry.state === "diverged"
          ? `The mirror of ${repository}${where} has diverged`
          : `The mirror of ${repository}${where} could not be synced`,
      detail:
        entry.state === "diverged"
          ? `The mirror branch (${short(entry.mirrorHead)}) and ${repository} (${short(entry.sourceHead)}) have different history. Avoozl does not reset, rebase or force push. That branch must only copy ${repository}. Fix it yourself; the row clears when it is behind ${repository} again.`
          : `${entry.error} Avoozl tries again on the next tick and the row clears when it works.`,
      openedAt: entry.openedAt,
    });
  }
  return items;
}
