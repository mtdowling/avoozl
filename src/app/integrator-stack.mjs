// Stacking for integrator trains (landing-trains LT5, design D7): a train's
// members are replayed, in order, onto the trunk head in a fresh detached
// landing worktree. Each member's range starts at its fork point on the
// trunk, or, when its head descends from another queued, in-train or landed
// head, at the newest such head (the cut), so a branch built on another
// never carries that branch's commits twice. The cut uses the heads recorded
// at queue time, not patch matching.
//
// Every stacked commit keeps its author and message and gains the
// `Avoozl-Task` trailer. Merge commits are dropped (their content is in the
// replayed commits or already in the trunk). rerere is off here, so a
// recorded resolution is never replayed without verification.
//
// shortcut: a commit that changes nothing on the stack (already in the
// trunk) is skipped by the empty result of its replay, not by `git cherry`
// patch ids; a patch the trunk holds in a different form conflicts instead.
// Upgrade if a receipt shows a false conflict.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "./git.mjs";
import { trailers } from "./landing-trains.mjs";

const LIVE = new Set(["queued", "in-train", "landed"]);
const NO_RERERE = [
  "-c",
  "rerere.enabled=false",
  "-c",
  "rerere.autoUpdate=false",
];

// Every git call in a landing worktree runs with rerere off.
export const landGit = (dir, args, options) =>
  git(dir, [...NO_RERERE, ...args], options);

const isAncestor = async (root, older, newer) => {
  try {
    await git(root, ["merge-base", "--is-ancestor", older, newer]);
    return true;
  } catch {
    return false;
  }
};

// A fresh detached landing worktree at `baseHead`. The caller records it on
// the train so a taker can remove it if this process dies (D5.3).
export async function addLandingWorktree(root, baseHead) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-train-"));
  await git(root, ["worktree", "add", "--detach", "--quiet", dir, baseHead]);
  await git(dir, ["config", "--worktree", "rerere.enabled", "false"]).catch(
    () => {},
  );
  return dir;
}

export async function removeLandingWorktree(root, dir) {
  await git(root, ["worktree", "remove", "--force", dir]).catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}

// Where a member's range starts: its fork point, or the newest recorded head
// it descends from. {from, via}: `via` is the entry the cut is at, or null.
export async function cutPoint(root, member, others) {
  let from = member.forkPoint,
    newest = null;
  for (const other of others) {
    if (
      other.key === member.key ||
      !LIVE.has(other.state) ||
      other.commit === member.commit ||
      other.commit === from
    )
      continue;
    if (!(await isAncestor(root, other.commit, member.commit))) continue;
    // Newer than the fork point: it descends from it.
    if (!(await isAncestor(root, from, other.commit))) continue;
    if (!newest || (await isAncestor(root, newest.commit, other.commit)))
      newest = other;
  }
  if (newest) from = newest.commit;
  return { from, via: newest };
}

async function commitWithTrailers(dir, commit, entry) {
  const [name, email, date] = (
      await git(dir, ["log", "-1", "--format=%an%n%ae%n%aI", commit])
    ).split("\n"),
    message = await git(dir, ["log", "-1", "--format=%B", commit]),
    file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-msg-")),
      "m",
    );
  try {
    fs.writeFileSync(file, message.trimEnd() + "\n");
    await git(dir, [
      "interpret-trailers",
      "--in-place",
      "--if-exists",
      "addIfDifferent",
      ...trailers(entry).flatMap((line) => ["--trailer", line]),
      file,
    ]);
    await landGit(
      dir,
      ["commit", "--quiet", "--allow-empty-message", "-F", file],
      {
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: name,
          GIT_AUTHOR_EMAIL: email,
          GIT_AUTHOR_DATE: date,
        },
      },
    );
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

const conflicted = async (dir) =>
  (await git(dir, ["diff", "--name-only", "--diff-filter=U"]))
    .split("\n")
    .filter(Boolean);

// Replays each member's range onto the stack in order.
//
//   members  the train's queue entries, in order
//   others   every queue entry of the target (the cut looks at them)
//   resolve  optional ({dir, files, member, commit}) -> true when it settled
//            every conflicted file and staged them (mechanical rules, D8)
//
// Returns {stack, members: [{key, from, boundary, state, ...}]} with state
// `stacked`, `contained` (nothing of it is new on the trunk), `held` (built
// on an entry that is queued outside this train: `holdReason`) or `conflict`
// (a semantic conflict: dropped, `files` and `against` name it; stacking
// went on without it).
export async function stackMembers({
  root,
  dir,
  baseHead,
  members,
  others,
  resolve,
}) {
  const inTrain = new Set(members.map((m) => m.key)),
    out = [];
  let stack = baseHead;
  for (const member of members) {
    const { from, via } = await cutPoint(root, member, others);
    if (via && via.state === "queued" && !inTrain.has(via.key)) {
      out.push({
        key: member.key,
        from,
        boundary: null,
        state: "held",
        holdReason: `built on ${via.key}, which is queued outside this train`,
      });
      continue;
    }
    const commits = (
      await git(root, [
        "rev-list",
        "--reverse",
        "--no-merges",
        `${from}..${member.commit}`,
      ])
    )
      .split("\n")
      .filter(Boolean);
    let applied = 0,
      lost = null;
    for (const commit of commits) {
      try {
        await landGit(dir, ["cherry-pick", "--no-commit", commit]);
      } catch {
        const files = await conflicted(dir);
        if (
          !files.length ||
          !(await resolve?.({ dir, files, member, commit }))
        ) {
          await landGit(dir, ["cherry-pick", "--quit"]).catch(() => {});
          lost = { files, commit };
          break;
        }
      }
      if (!(await git(dir, ["diff", "--cached", "--name-only"]))) continue;
      await commitWithTrailers(dir, commit, member);
      applied += 1;
    }
    if (lost) {
      await landGit(dir, ["reset", "--quiet", "--hard", stack]);
      out.push({
        key: member.key,
        from,
        boundary: null,
        state: "conflict",
        files: lost.files,
        commit: lost.commit,
        // The earlier member this one conflicts with: the stack so far.
        against: stack,
      });
      continue;
    }
    if (!applied) {
      out.push({ key: member.key, from, boundary: null, state: "contained" });
      continue;
    }
    stack = await git(dir, ["rev-parse", "HEAD"]);
    out.push({ key: member.key, from, boundary: stack, state: "stacked" });
  }
  return { stack, members: out };
}
