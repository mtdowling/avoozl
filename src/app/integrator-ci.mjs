// CI as a validation fallback for integrator trains (landing-trains LT7.7,
// LT8.6, design D9.3). A platform with no local environment on this machine
// counts as validated only when one CI run of that platform's jobs passed on
// the train's head.
//
//   optimistic  the trunk push's own CI run is that run: nothing is
//               dispatched, the run for the pushed head is read.
//   gated       one `workflow_dispatch` of `ci.workflow` on a candidate ref
//               `avoozl-validate/<train>` with the platforms as an input,
//               pushed as a plain new branch and deleted afterward.
//
// Reads go through the GitHub client, which paces itself. No ref is forced:
// the candidate is created, and removed with a delete push.
import { git } from "./git.mjs";
import { pushHead, sourceRegistry } from "./working-heads.mjs";
import { fail } from "./store.mjs";

const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0" };
export const validateBranch = (train) => `avoozl-validate/${train}`;

const sameWorkflow = (run, workflow) =>
  run.workflow === workflow || run.workflow.endsWith(`/${workflow}`);

// Reads the run of `workflow` for `headSha` until it completes or `timeoutMs`
// passes. `event` is "push" for a trunk push's run and "workflow_dispatch"
// for a dispatched one. Returns {state, run}: state "passed", "failed" (a
// completed run whose conclusion is not success) or "timeout" (`run` is the
// last one seen, or null).
export async function watchRun(
  github,
  {
    repository,
    workflow,
    headSha,
    event,
    since,
    intervalMs = 15_000,
    timeoutMs = 60 * 60_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  },
) {
  const started = now();
  let last = null;
  for (;;) {
    const runs = await github.workflowRuns(repository, since),
      run = runs
        .filter(
          (r) =>
            r.headSha === headSha &&
            r.event === event &&
            sameWorkflow(r, workflow),
        )
        .sort((a, b) => b.id - a.id)[0];
    if (run) last = run;
    if (run?.status === "completed")
      return {
        state: run.conclusion === "success" ? "passed" : "failed",
        run,
      };
    if (now() - started >= timeoutMs) return { state: "timeout", run: last };
    await sleep(intervalMs);
  }
}

// Validates `platforms` (those with no local environment) for one train.
//
//   policy "optimistic"  needs `pushed` (the trunk commit); dispatches nothing
//   policy "gated"       needs `candidate` (the stack head), `baseHead` (the
//                        trunk it stacks on, where the content scan starts)
//                        and `root`/`url` to push the candidate ref
//
// Returns {state: "passed" | "failed" | "timeout", mode, run, ref?}.
export async function validateByCi({
  github,
  repository,
  workflow,
  train,
  platforms,
  policy,
  pushed,
  candidate,
  baseHead,
  root,
  url,
  since = new Date(Date.now() - 60_000).toISOString(),
  env,
  machine,
  configFile,
  store,
  ...watch
}) {
  if (!platforms.length) return { state: "passed", mode: "none", run: null };
  if (!workflow)
    fail("A CI-only platform needs landing.trains.ci.workflow.", 409);
  if (policy === "optimistic") {
    if (!pushed) fail("The trunk push's own run needs the pushed commit.", 400);
    return {
      mode: "push-run",
      ...(await watchRun(github, {
        repository,
        workflow,
        headSha: pushed,
        event: "push",
        since,
        ...watch,
      })),
    };
  }
  if (!candidate)
    fail("A dispatched validation needs the candidate commit.", 400);
  const ref = validateBranch(train);
  await pushHead(
    root,
    { repository, branch: ref, commit: candidate },
    sourceRegistry({ [repository]: { url } }),
    { since: baseHead ?? candidate, env, machine, configFile, store },
  );
  try {
    await github.dispatchWorkflow(repository, workflow, ref, {
      platforms: platforms.join(","),
    });
    return {
      mode: "dispatch",
      ref,
      ...(await watchRun(github, {
        repository,
        workflow,
        headSha: candidate,
        event: "workflow_dispatch",
        since,
        ...watch,
      })),
    };
  } finally {
    // A delete push: no force, no `+` refspec.
    await git(root, ["push", "--quiet", url, `:refs/heads/${ref}`], {
      env: { ...(env ?? process.env), ...NO_PROMPT },
    }).catch(() => {});
  }
}

// Reads the one CI run of each pushed train's trunk head and records it on the
// train (LT8.6): the run ID, its status and, when it finished, its conclusion.
// One read of the workflow's runs per call, through the client's pacer, and no
// more often than `everyMs` for a train. A train whose run is not found yet is
// tried again on the next call.
export async function readTrainCi(
  store,
  {
    github,
    repository,
    projectId,
    target,
    workflow,
    everyMs = 30_000,
    now = Date.now(),
  },
) {
  if (!github || !workflow) return [];
  const open = store
    .list("landing_trains")
    .filter(
      (t) =>
        t.projectId === projectId &&
        t.target === target &&
        t.pushed &&
        !t.ci?.conclusion &&
        now - (Date.parse(t.ci?.readAt) || 0) >= everyMs,
    );
  if (!open.length) return [];
  const since = new Date(
    Math.min(...open.map((t) => Date.parse(t.startedAt))) - 60_000,
  ).toISOString();
  const runs = await github.workflowRuns(repository, since),
    out = [];
  for (const train of open) {
    const run = runs
      .filter(
        (r) =>
          r.headSha === train.pushed &&
          r.event === "push" &&
          sameWorkflow(r, workflow),
      )
      .sort((a, b) => b.id - a.id)[0];
    out.push(
      store.transaction(() =>
        store.put("landing_trains", {
          ...store.get("landing_trains", train.id),
          ci: {
            ...(train.ci ?? {}),
            ...(run
              ? { run: run.id, status: run.status, conclusion: run.conclusion }
              : {}),
            readAt: new Date(now).toISOString(),
          },
        }),
      ),
    );
  }
  return out;
}
