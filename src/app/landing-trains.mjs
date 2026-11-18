// Direct landing: exact verified portions and bounded trains (Requirement
// 87.1, 87.2, 87.4, 87.9, 102.13 and 102.15, design §4.32.5 and §4.32.7,
// task 41.3). Plugs the git and check steps into the per-base landing queue
// (landing-queue.mjs).
//
// - A portion is an exact commit on a spec's working branch that passed its
//   checks (`verifiedEvidence`, working-heads.mjs), with each task's
//   definition. Nothing else enters the queue.
// - A train is up to four tasks one driver schedules, possibly from several
//   specs. A landing worktree merges them, in queue order, with the current
//   base; the queue checks that exact candidate, halves a failed train and
//   lands a passing one (landing-queue.mjs).
// - Declared append-only `landing.unionPaths` merge with union semantics,
//   only in that landing worktree. Any other conflict refuses the portion.
//   The union result still has to pass every check.
// - Before the push, the outgoing range is scanned (`privacyScan`); a hit
//   fails the candidate like a check, so nothing is pushed.
// - Each spec in the train gets an intent, read back before the push
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

export const TRAIN_TASKS = 4;
const DIGEST = /^[0-9a-f]{64}$/;
const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0" };

// Queues one verified portion for direct landing. Refuses a commit without
// passing evidence for exactly it, and a task without its definition.
export function queuePortion(
  store,
  { projectId, base, spec, driver, commit, tasks, evidence, key },
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
    projectId,
    base,
    spec,
    driver,
    commit,
    tasks: tasks.map(({ task, definition }) => ({ task, definition })),
    key: key ?? `${spec}.${commit.slice(0, 12)}`,
  });
}

export const trailers = (entry) =>
  entry.tasks
    .filter((t) => typeof t !== "string")
    .map((t) => `Avoozl-Task: ${t.task}@${t.definition}`);

// The checks a candidate passed, in the journal's check shape
// ({name, conclusion}), for its landing intent. Without them a landed
// outcome carries no evidence and never completes its tasks (R102.5).
export function journalChecks(checks = []) {
  return checks.map((check) => {
    const name = String(check.command ?? check.name ?? "check")
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

// Merges each portion, in order, into `baseHead` in a fresh detached
// landing worktree. {candidate} or {conflict: files, key}. The worktree is
// removed before returning; its commits stay in `root`.
export async function mergeTrain(root, entries, baseHead, unionPaths = []) {
  const union = new Set(unionPaths),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-landing-"));
  try {
    await git(root, ["worktree", "add", "--detach", "--quiet", dir, baseHead]);
    for (const entry of entries) {
      const message = [`Land ${entry.key}`, "", ...trailers(entry)]
        .join("\n")
        .trim();
      try {
        await git(dir, [
          "merge",
          "--no-ff",
          "--quiet",
          "-m",
          message,
          entry.commit,
        ]);
        continue;
      } catch {}
      const files = (await git(dir, ["diff", "--name-only", "--diff-filter=U"]))
        .split("\n")
        .filter(Boolean);
      if (!files.length || files.some((f) => !union.has(f))) {
        await git(dir, ["merge", "--abort"]).catch(() => {});
        if (!files.length)
          fail(`Merging ${entry.key} failed without a conflict.`, 500);
        return { conflict: files, key: entry.key };
      }
      for (const file of files) await unionMerge(dir, file);
      await git(dir, ["commit", "--quiet", "--cleanup=strip", "-m", message]);
    }
    return { candidate: await git(dir, ["rev-parse", "HEAD"]) };
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
//   checks      declared check argv lists, run at the candidate
//   unionPaths  append-only paths merged with union semantics
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
  intent,
  env,
  machine,
  configFile,
  checksEnv,
  run = runCheckAt,
  scan = privacyScan,
}) {
  if (!checks.length) fail("Direct landing needs at least one check.", 400);
  if (typeof intent !== "function")
    fail("Direct landing writes an intent before every push.", 400);
  const environment = { ...(env ?? process.env), ...NO_PROMPT },
    log = { results: [] };
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
      await git(root, ["fetch", "--quiet", url, `refs/heads/${branch}`], {
        env: environment,
      });
      return mergeTrain(root, entries, baseHead, unionPaths);
    },
    async check(candidate, entries, baseHead) {
      // The outgoing data first: everything the base lacks.
      const hits = await scan(root, {
        base: baseHead,
        head: candidate,
        refs: [branch],
        machine,
        configFile,
      });
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
      const out = [];
      for (const argv of checks) {
        const result = await run({ root, checksEnv }, candidate, argv);
        out.push({ command: argv.join(" "), exitCode: result.exitCode });
        if (result.exitCode !== 0) return { ok: false, checks: out };
      }
      return { ok: true, checks: out };
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
              tasks: own.flatMap((e) => e.tasks),
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
