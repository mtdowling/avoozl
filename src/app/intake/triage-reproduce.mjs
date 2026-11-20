// Reproduce, then fix (triage-agent TA3, design §D4). A run proposes a
// reproduction as a file; Avoozl does not take the run's word for it and
// runs no command the run names. In a clean detached worktree at the base
// branch it runs the repository's configured checks twice, without the file
// and with it, inside the `process` sandbox: no network, no credentials.
//
// - Pass without, fail with: reproduced. A bounded fix starts (fix.mjs)
//   with the file as its first commit, so the repository's checks, which
//   landing runs, fail until the fix makes them pass. A collaborator's issue
//   lands by the landing setting; anyone else's waits as Fix ready.
// - Pass both times: not reproduced. The run is told once and tries again;
//   after that it asks the author once, or the owner gets it.
// - Fail without the file, or it cannot run: the owner gets it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandEvidence, git, taskGit } from "../git/git.mjs";
import {
  checkOptions,
  recordIsolation,
} from "../workspace/check-isolation.mjs";
import { strangerRule } from "./stranger-input.mjs";
import { repositoryChecks } from "../workspace/repository-checks.mjs";
import { pathVerdict } from "../delivery/verify.mjs";
import { patchTask } from "./intake.mjs";
import { startGitHubItem } from "../github/github-intake.mjs";
import { openFixJournal } from "./fix.mjs";
import { prepareWorktree } from "../delivery/delivery.mjs";
import { AGENT_LINE } from "./triage.mjs";
import { asJob } from "../github/github-jobs.mjs";

const COLLABORATOR = new Set(["write", "maintain", "admin"]);
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;

// One check argv in `dir` under the repository's isolation, as every
// other check runs (checkOptions): a stranger's reproduction on a public
// repository runs in a container with the network off (VM6.4, TA7.7).
// Returns {exitCode, tail?}.
export async function reproductionCheck(
  dir,
  argv,
  { repository, stranger } = {},
) {
  const result = await commandEvidence(dir, argv, {
    ...checkOptions(repository, dir, { stranger }),
    timeoutMs: CHECK_TIMEOUT_MS,
  });
  return {
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 1,
    ...(result.exitCode === 0
      ? {}
      : {
          tail: String((result.stdout || "") + (result.stderr || "")).slice(
            -2000,
          ),
        }),
    ...recordIsolation(result),
  };
}

async function passes(dir, checks, check, context) {
  for (const argv of checks) {
    const result = await check(dir, argv, context);
    if (result.exitCode !== 0) return false;
  }
  return true;
}

// Run the checks without and with the file. Returns {state} with state
// reproduced, not-reproduced, base-fails or cannot-run, and `why`.
export async function reproduce(
  repository,
  file,
  { check = reproductionCheck, workspaceRoot, stranger = null } = {},
) {
  if (!repository?.localCheckout)
    return {
      state: "cannot-run",
      why: "The repository has no local checkout.",
    };
  const checks = repositoryChecks(repository).map((entry) => entry.argv);
  if (!checks.length)
    return {
      state: "cannot-run",
      why: "The repository has no configured checks.",
    };
  const base = repository.baseBranch || "main",
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-repro-"));
  let ref = `origin/${base}`;
  try {
    await git(repository.localCheckout, [
      "rev-parse",
      "--verify",
      `${ref}^{commit}`,
    ]).catch(() => (ref = base));
    await git(repository.localCheckout, [
      "worktree",
      "add",
      "--detach",
      dir,
      ref,
    ]);
    const context = { workspaceRoot, repository, stranger };
    if (!(await passes(dir, checks, check, context)))
      return {
        state: "base-fails",
        why: `The checks fail on ${base} without the reproduction.`,
      };
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.text);
    if (await passes(dir, checks, check, context))
      return {
        state: "not-reproduced",
        why: `The checks still pass on ${base} with ${file.path}.`,
      };
    return {
      state: "reproduced",
      why: `The checks pass on ${base} and fail with ${file.path}.`,
    };
  } catch (error) {
    return {
      state: "cannot-run",
      why: `The reproduction could not run: ${error.message}`,
    };
  } finally {
    await git(repository.localCheckout, [
      "worktree",
      "remove",
      "--force",
      dir,
    ]).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The fix for a reproduced, bounded bug: Deliver this's task, its journal,
// and the reproduction as its worktree's first commit. A stranger's issue
// waits for a person's Integrate (ship: manual).
export async function startReproducedFix(
  store,
  github,
  run,
  file,
  { policy, workspaceRoot, collaborator },
) {
  const started = await startGitHubItem(store, github, policy, {
    id: `${run.repository}#${run.number}`,
    action: "deliver",
  });
  await openFixJournal(
    store,
    { workspaceRoot, actor: "triage agent" },
    started.taskId,
  );
  patchTask(
    store,
    started.taskId,
    `Reproduction for ${started.taskId}`,
    (task) => {
      task.fix = { ...task.fix, reproduction: { path: file.path } };
      task.summary = `${task.summary}\n\nAvoozl committed a reproduction at ${file.path}: the repository's checks fail with it. Make them pass without changing what it tests.`;
      // A task that names its paths gets the reproduction among them; one
      // that names none (a fix from an issue) may change any file, so adding
      // the reproduction alone would hold the fix itself outside its paths.
      if (task.paths?.length)
        task.paths = [...new Set([...task.paths, file.path])];
      if (!collaborator) task.ship = "manual";
      // The run's stranger input stays on the fix it made (VM6.1).
      if (run.strangerInput) task.strangerInput = { ...run.strangerInput };
      else if (!collaborator)
        task.strangerInput = {
          reason: "the issue's author is not a collaborator",
          source: `${run.repository}#${run.number}`,
        };
    },
  );
  const prepared = await prepareWorktree(store, {
      taskId: started.taskId,
    }),
    worktree = prepared.path,
    checkout = store.get("repositories", prepared.repository)?.root;
  const target = path.join(worktree, file.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.text);
  await taskGit(worktree, ["add", "--", file.path], { checkout });
  await taskGit(
    worktree,
    [
      "-c",
      "user.name=Avoozl",
      "-c",
      "user.email=avoozl@localhost",
      "commit",
      "-qm",
      `Add a reproduction of ${run.repository}#${run.number}`,
    ],
    { checkout },
  );
  return started.taskId;
}

const ASK = (question) =>
  `${question}\n\nAvoozl asks this once; your answer starts the next look at this issue.\n\n${AGENT_LINE}`;

// A bug or optimization's result, carried out. Returns the writes made.
export async function reproduceStep(store, github, run, row, context) {
  const result = run.result,
    writes = [],
    save = (change) =>
      store.put("triage_runs", {
        ...store.get("triage_runs", run.id),
        ...change,
      }),
    note = (change) =>
      store.put("github_items", {
        ...store.get("github_items", row.id),
        triage: {
          ...(store.get("github_items", row.id)?.triage || {}),
          ...change,
        },
      });
  const ask = async () => {
    if (store.get("github_items", row.id)?.triage?.asked) {
      context.toOwner({
        reason:
          "It needs information the author has not given, and Avoozl already asked once.",
        kind: "bug",
      });
      return;
    }
    const sent = await context.write(
      { kind: "question", body: ASK(result.question) },
      () =>
        asJob("triage", github).createIssueComment(
          run.repository,
          run.number,
          ASK(result.question),
        ),
    );
    writes.push(sent);
    if (sent.state === "sent")
      note({
        asked: { at: new Date().toISOString(), run: run.id },
        answered: null,
      });
  };
  if (!result.reproduction) {
    if (result.question) await ask();
    return writes;
  }
  const guarded = pathVerdict([result.reproduction.path], {
    protectedPaths: context.config?.flow?.verify?.protectedPaths || [],
  }).protected;
  if (guarded.length) {
    save({ outcome: "protected" });
    context.toOwner({
      reason: `The reproduction ${result.reproduction.path} is under a protected path.`,
      kind: "bug",
    });
    return writes;
  }
  const outcome = await reproduce(context.repository, result.reproduction, {
    ...(context.run?.check ? { check: context.run.check } : {}),
    workspaceRoot: context.workspaceRoot,
    stranger: strangerRule(store, context.repository, run, "checks"),
  });
  save({ outcome: outcome.state, outcomeWhy: outcome.why });
  if (outcome.state === "reproduced") {
    if (!result.fix?.bounded) {
      context.toOwner({
        reason: `Reproduced, but the fix is not bounded: ${result.fix?.why ?? "the run did not say why"}.`,
        kind: "bug",
      });
      return writes;
    }
    const permission =
        (await github.permission(run.repository, row.author).catch(() => null))
          ?.permission ?? "none",
      collaborator = COLLABORATOR.has(permission);
    const taskId = await startReproducedFix(
      store,
      github,
      run,
      result.reproduction,
      {
        policy: context.policy,
        workspaceRoot: context.workspaceRoot,
        collaborator,
      },
    );
    save({ fixTask: taskId });
    note({ fix: { taskId, collaborator } });
    writes.push({ kind: "fix", state: "sent", taskId });
    if (!collaborator)
      context.toOwner({
        reason: `Fix ready: ${taskId} lands when you press Integrate, since the issue's author is not a collaborator.`,
        kind: "fix-ready",
      });
    return writes;
  }
  if (outcome.state === "not-reproduced") {
    if (!run.retryOf) {
      context.queueRetry(
        `Your earlier reproduction (${result.reproduction.path}) passed on the base branch, so it does not show the problem. Try once more, or name what is missing in question.`,
      );
      return writes;
    }
    if (result.question) await ask();
    else
      context.toOwner({
        reason: `It did not reproduce: ${outcome.why}`,
        kind: "bug",
      });
    return writes;
  }
  context.toOwner({ reason: outcome.why, kind: "bug" });
  return writes;
}
