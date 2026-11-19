// Direct landing in merge batches (Requirements MB1 to MB6; 87.1, 87.2,
// 87.4, 87.9, 102.13 and 102.15). Plugs the git and check steps into the
// per-base landing queue (landing-queue.mjs).
//
// - A member is an exact commit on a spec's working branch that passed its
//   checks (`verifiedEvidence`, working-heads.mjs), with each task's
//   definition. Nothing else enters the queue. Waiting members are local
//   refs under refs/avoozl/land/ (`holdMember`); only the base is pushed.
// - A merge batch is up to the base's size limit of members, possibly from
//   several specs and drivers. A landing worktree stacks them, in queue
//   order, on the base; the queue checks that exact candidate, finds the
//   culprit of a failed one and lands a passing one (landing-queue.mjs).
// - Declared append-only `landing.unionPaths` merge with union semantics,
//   only in that landing worktree. Any other conflict sends the later
//   member back. The union result still has to pass every check.
// - Before the push, the outgoing range is scanned (`privacyScan`); a hit
//   fails the candidate like a check, so nothing is pushed.
// - Each spec in the batch gets an intent, read back before the push
//   (`landIntent`, driver-generations.mjs). The push is a guarded
//   fast-forward from the recorded base; never forced.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "./git.mjs";
import { guardedFastForward, landIntent } from "./driver-generations.mjs";
import { runCheckAt } from "./flow-line.mjs";
import { enqueueLanding } from "./landing-queue.mjs";
import { privacyScan, verifiedEvidence } from "./working-heads.mjs";
import { mergeBaseBack } from "./spec-base.mjs";
import { fail } from "./store.mjs";
import { checkApplies } from "./repository-checks.mjs";
import { landingMessage } from "./landing-trailers.mjs";
import { commitSubject } from "./landing-config.mjs";

const DIGEST = /^[0-9a-f]{64}$/;
const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0" };

// Queues one verified portion for direct landing. Refuses a commit without
// passing evidence for exactly it, and a task without its definition.
export function queuePortion(
  store,
  { repositoryId, base, spec, driver, commit, tasks, evidence, key },
) {
  const problem = verifiedEvidence(evidence, commit);
  if (problem)
    fail(
      `This portion cannot land: ${problem}. Only verified work is queued.`,
      409,
    );
  if (
    !tasks?.length ||
    tasks.some((t) => !t?.task || !DIGEST.test(t.definition ?? ""))
  )
    fail("A portion names each task with its definition.", 400);
  if (!spec || !driver) fail("A portion names its spec and driver.", 400);
  return enqueueLanding(store, {
    repositoryId,
    base,
    spec,
    driver,
    commit,
    tasks: tasks.map(({ task, definition, metrics }) => ({
      task,
      definition,
      // What its landing cost, for the landing commit (landing-trailers.mjs).
      ...(metrics ? { metrics } : {}),
    })),
    key: key ?? `${spec}.${commit.slice(0, 12)}`,
  });
}

// Each task's trailer, then what its landing cost (landing-trailers.mjs).
// The checks a candidate passed, in the journal's check shape
// ({name, conclusion}), for its landing intent. Without them a landed
// outcome carries no evidence and never completes its tasks (R102.5).
export function journalChecks(checks = []) {
  return checks.map((check) => {
    const name = String(check.name ?? check.command ?? "check")
      .split(" ")
      .map((part, i) => (i === 0 ? path.basename(part) : part))
      .join(" ")
      .replace(/[^A-Za-z0-9 ._()-]/g, "_")
      .replace(/^[^A-Za-z0-9]+/, "")
      .slice(0, 80);
    return {
      name: name || "check",
      conclusion:
        check.exitCode === 0 || check.conclusion === "success"
          ? "success"
          : "failure",
    };
  });
}

// Both sides of a conflicted path, appended: `git merge-file --union`.
export async function unionMerge(dir, file) {
  const stage = async (n) => {
    try {
      return await git(dir, ["show", `:${n}:${file}`]);
    } catch {
      return "";
    }
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-union-")),
    names = ["ours", "base", "theirs"].map((n) => path.join(tmp, n));
  try {
    const texts = [await stage(2), await stage(1), await stage(3)];
    names.forEach((name, i) =>
      fs.writeFileSync(name, texts[i] ? texts[i] + "\n" : ""),
    );
    const merged = await git(dir, ["merge-file", "-p", "--union", ...names]);
    fs.writeFileSync(path.join(dir, file), merged ? merged + "\n" : "");
    await git(dir, ["add", "--", file]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// A waiting member is a local ref in the checkout that lands, at its
// verified commit. `refs/avoozl/` is not under `refs/heads/`, so a plain
// push never sends it and no CI runs on it (MB6). A worker machine's result
// is fetched into the same ref.
export const memberRef = (key) =>
  `refs/avoozl/land/${String(key).replace(/[^A-Za-z0-9._-]/g, "_")}`;

export const holdMember = (root, entry) =>
  git(root, ["update-ref", memberRef(entry.key), entry.commit]);

export const dropMember = (root, entry) =>
  git(root, ["update-ref", "-d", memberRef(entry.key)]).catch(() => {});

// Stacks each member, in order, on `baseHead` in a fresh detached landing
// worktree. {candidate, heads} or {conflict: files, key}; `heads[i]` is the
// stack after member i. The worktree is removed before returning; its
// commits stay in `root`.
export async function stackMembers(
  root,
  entries,
  baseHead,
  unionPaths = [],
  tickOf = null,
  commitPrefix = "",
) {
  const union = new Set(unionPaths),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-landing-")),
    // How many commits the stack has after each member.
    made = [];
  try {
    await git(root, ["worktree", "add", "--detach", "--quiet", dir, baseHead]);
    for (const entry of entries) {
      made.push(made.at(-1) ?? 0);
      const message = landingMessage(
        commitSubject(commitPrefix, `Land ${entry.key}`),
        entry.tasks,
      );
      let conflicted = false;
      try {
        await git(dir, [
          "merge",
          "--no-ff",
          "--no-commit",
          "--quiet",
          memberRef(entry.key),
        ]);
      } catch {
        conflicted = true;
      }
      if (conflicted) {
        const files = (
          await git(dir, ["diff", "--name-only", "--diff-filter=U"])
        )
          .split("\n")
          .filter(Boolean);
        if (!files.length || files.some((f) => !union.has(f))) {
          await git(dir, ["merge", "--abort"]).catch(() => {});
          if (!files.length)
            fail(`Merging ${entry.key} failed without a conflict.`, 500);
          return { conflict: files, key: entry.key };
        }
        for (const file of files) await unionMerge(dir, file);
      }
      // A merge with nothing to bring leaves no merge in progress.
      const merging = await git(dir, [
        "rev-parse",
        "-q",
        "--verify",
        "MERGE_HEAD",
      ]).catch(() => null);
      if (!merging) continue;
      // The landing commit ticks its own task (Requirement 113.8): one commit.
      await tickOf?.(dir, entry);
      await git(dir, ["commit", "--quiet", "--cleanup=strip", "-m", message]);
      made[made.length - 1] += 1;
    }
    // Each landing commit is the first parent of the next one's, so this
    // one call names the head after every member.
    const total = made.at(-1) ?? 0,
      chain = (
        await git(dir, [
          "rev-list",
          "--first-parent",
          "-n",
          String(total + 1),
          "HEAD",
        ])
      ).split("\n");
    return {
      candidate: chain[0],
      heads: made.map((n) => chain[total - n]),
    };
  } finally {
    await git(root, ["worktree", "remove", "--force", dir]).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Lands each spec's intent around one push: the first spec's intent wraps
// the next, the last wraps the guarded push. Every intent is written and
// read back before the push; each outcome is written after it. Returns
// whether the push happened, with each spec's result.
export async function landWithIntents(intents, push) {
  let pushed = false;
  const results = [];
  const run = async (i) => {
    if (i === intents.length) {
      pushed = await push();
      return pushed;
    }
    const { journal, input, options } = intents[i],
      result = await landIntent(
        journal,
        { ...input, land: () => run(i + 1) },
        options,
      );
    results[i] = { spec: input.spec, ...result };
    return result.state === "landed" || result.state === "landed-unrecorded";
  };
  await run(0);
  return { pushed, results };
}

// The landing-queue steps for `direct` landing over a registered remote.
//
// options:
//   root        the landing checkout, with every portion's commit fetched
//   url, branch the registered target remote and its base branch
//   repository  the target repository identity, for the intents' refs
//   checks      the repository's checks ([{name, argv, paths}]); the ones
//               the candidate's diff from the base picks run at it
//   unionPaths  append-only paths merged with union semantics
//   commitPrefix  the repository's landing.commitPrefix, for each commit subject
//   tickOf(dir, entry)  ticks the entry's tasks in the candidate worktree
//               before its merge commit, so the commit carries the tick
//   intent(spec, entries) -> {journal, input, options}: the spec's driver
//               journal and landIntent input (driver, owner, login,
//               revision, op?). Candidate, base, tasks and refs are filled.
//   run, scan   injectable check runner and content scan (tests)
export function directSteps({
  root,
  url,
  branch,
  repository,
  checks = [],
  unionPaths = [],
  tickOf = null,
  commitPrefix = "",
  intent,
  env,
  machine,
  configFile,
  checksEnv,
  // The repository's id and isolation: each check runs under it.
  repositoryId,
  isolation,
  run = runCheckAt,
  scan = privacyScan,
}) {
  if (!checks.length) fail("Direct landing needs at least one check.", 400);
  // A bare argv list is a check named by its command, with no paths.
  checks = checks.map((check) =>
    Array.isArray(check)
      ? { name: check.join(" "), argv: check, paths: null }
      : check,
  );
  if (typeof intent !== "function")
    fail("Direct landing writes an intent before every push.", 400);
  const environment = { ...(env ?? process.env), ...NO_PROMPT },
    log = { results: [] },
    // A bisect step stacks a prefix of members already stacked on the same
    // base. The earlier stack's head after that prefix is the same
    // candidate, so it is used again instead of stacked again.
    stacked = new Map(),
    stackId = (baseHead, entries) =>
      [baseHead, ...entries.map((e) => `${e.key}@${e.commit}`)].join(" ");
  return {
    log,
    async readBase() {
      return (
        await git(root, ["ls-remote", "--heads", url, `refs/heads/${branch}`], {
          env: environment,
        })
      ).split(/\s+/)[0];
    },
    async prepare(entries, baseHead) {
      const known = stacked.get(stackId(baseHead, entries));
      if (known) return { candidate: known };
      await git(root, ["fetch", "--quiet", url, `refs/heads/${branch}`], {
        env: environment,
      });
      for (const entry of entries) await holdMember(root, entry);
      const result = await stackMembers(
        root,
        entries,
        baseHead,
        unionPaths,
        tickOf,
        commitPrefix,
      );
      result.heads?.forEach((head, i) =>
        stacked.set(stackId(baseHead, entries.slice(0, i + 1)), head),
      );
      return result;
    },
    // `only` names the checks to run again (a rerun or a bisect step); the
    // content scan is one of them. Every selected check runs, so the failing
    // ones are all known.
    async check(candidate, entries, baseHead, only) {
      const wanted = (name) => !only || only.includes(name);
      // The outgoing data first: everything the base lacks.
      const hits = wanted("content scan")
        ? await scan(root, {
            base: baseHead,
            head: candidate,
            refs: [branch],
            machine,
            configFile,
          })
        : [];
      if (hits.length)
        return {
          ok: false,
          checks: [
            {
              command: "content scan",
              exitCode: 1,
              rules: [...new Set(hits.map((h) => h.rule))],
            },
          ],
        };
      // Every check whose paths a member's change touches, and every check
      // without paths: the candidate's diff from the base is every member's.
      let files = null;
      try {
        files = (
          await git(root, ["diff", "--name-only", "-z", baseHead, candidate])
        )
          .split("\0")
          .filter(Boolean);
      } catch {}
      const out = [];
      for (const check of checks) {
        if (!wanted(check.name) || !checkApplies(check, files)) continue;
        const result = await run(
          { id: repositoryId, root, checksEnv, isolation },
          candidate,
          check.argv,
        );
        out.push({
          name: check.name,
          command: check.argv.join(" "),
          ...(result.isolation !== undefined
            ? { isolation: result.isolation }
            : {}),
          exitCode: result.exitCode,
          ...(result.exitCode !== 0 && result.tail
            ? { tail: result.tail }
            : {}),
        });
      }
      return { ok: out.every((c) => c.exitCode === 0), checks: out };
    },
    async land({ entries, candidate, baseHead, checks: passed = [] }) {
      const specs = [...new Set(entries.map((e) => e.spec))],
        evidence = journalChecks(passed),
        intents = specs.map((spec) => {
          const own = entries.filter((e) => e.spec === spec),
            given = intent(spec, own);
          return {
            journal: given.journal,
            options: given.options,
            input: {
              op: `land.${candidate.slice(0, 16)}`,
              ...given.input,
              ...(evidence.length ? { checks: evidence } : {}),
              refs: [{ repository, branch, commit: candidate }],
              spec,
              candidate,
              base: baseHead,
              tasks: own.flatMap((e) =>
                e.tasks.map((t) =>
                  typeof t === "string"
                    ? t
                    : { task: t.task, definition: t.definition },
                ),
              ),
            },
          };
        });
      const { pushed, results } = await landWithIntents(intents, () =>
        guardedFastForward(root, {
          url,
          branch,
          base: baseHead,
          candidate,
          env,
        }),
      );
      log.results.push(results);
      return pushed;
    },
    // The landed base comes back into each spec's working branch in `root`
    // as a merge commit; unlanded integrations and checkpoints stay.
    async afterLand({ entries, candidate }) {
      const out = [];
      for (const spec of [...new Set(entries.map((e) => e.spec))])
        out.push({
          spec,
          ...(await mergeBaseBack(root, {
            spec,
            landed: candidate,
            base: branch,
          })),
        });
      return out;
    },
  };
}
