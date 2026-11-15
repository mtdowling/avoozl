// Mirror repositories: the sync step and the write targets (RC24.3, RC24.4,
// design D29.2, D29.3). The mirror's default branch only ever moves forward to
// the source's head. Nothing here resets, rebases or force pushes, and nothing
// writes to the source.
//
// shortcut: a divergence pauses this sync only; the other mirror steps keep
// running against the mirror. Upgrade when RC24.4's full pause is wanted.
// shortcut: `gitCopy` uses the local git and the `gh` credential helper, and
// has no live test; the step is tested with an injected copy.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseRepository } from "./github.mjs";

const run = promisify(execFile);
const META = "mirrorSync";
const short = (sha) => String(sha || "").slice(0, 12);

// The repository that receives Avoozl's writes for `repository`: its mirror
// when the policy entry names one, else the repository itself (D29.3).
export function writeRepo(entry, repository) {
  return entry?.mirror?.mirror ?? repository;
}

// The policy entry for a repository Avoozl writes: its own, or for a mirror
// the entry of the repository it mirrors.
export function policyEntryOf(repositories, id) {
  return (
    repositories?.[id] ??
    Object.values(repositories || {}).find(
      (entry) => entry.mirror?.mirror === id,
    )
  );
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

// Fast-forward `mirror`'s branch to `sha`, which only `source` has. A normal
// push of one explicit refspec: GitHub refuses it unless it is a fast-forward.
export async function gitCopy({ source, mirror, branch, sha }) {
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
      `${sha}:refs/heads/${branch}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
          if (
            stop("diverged", `diverged:${sourceHead}:${mirrorHead}`, {
              sourceHead,
              mirrorHead,
              branch: mirrorBranch,
            })
          )
            notify.push({
              channel: "decision",
              title: `${mirror.mirror} has diverged from ${mirror.source}`,
              text: `The ${mirrorBranch} branch of ${mirror.mirror} (${short(mirrorHead)}) has commits ${mirror.source} (${short(sourceHead)}) does not. Avoozl changed nothing and stopped syncing it.`,
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
    if (entry.state === "ok") continue;
    const repository = entry.repository ?? key,
      where = entry.branch ? ` (public branch ${entry.branch})` : "";
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
          ? `The mirror's default branch (${short(entry.mirrorHead)}) and ${repository} (${short(entry.sourceHead)}) have different history. Avoozl does not reset, rebase or force push. Fix the mirror yourself; the row clears when the mirror is behind the source again.`
          : `${entry.error} Avoozl tries again on the next tick and the row clears when it works.`,
      openedAt: entry.openedAt,
    });
  }
  return items;
}
