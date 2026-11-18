// Failure in an integrator train (landing-trains LT10, design D11): confirm a
// red validation with reruns, bisect member boundaries to the culprit, then
// land the good branches and return, eject, revert or fix forward.
//
//   1. Rerun each failing suite `failure.flakyReruns` times on the same head
//      and platform. One that passes is recorded `flaky` and does not fail the
//      train.
//   2. Bisect over the stack's member boundaries. The head is known failing and
//      the trunk before the train is known passing (the last train validated
//      it). Each probe runs only the suites that still fail, on only the
//      platforms that failed. The member ending at the first failing boundary
//      is the culprit. A failure no probe can place names the last member and is
//      recorded as an interaction of the full set.
//
// A suite is rerun by name when a platform's `validation.full` entry has
// `suiteArgs` (an argv suffix holding `{suite}`); without it a rerun uses the
// platform's whole command and reads the results file.
import { git } from "./git.mjs";
import { landGit } from "./integrator-stack.mjs";
import { runFull } from "./integrator-validation.mjs";

const fill = (argv, suite) => argv.map((a) => a.replaceAll("{suite}", suite));

// The suites of one result that did not pass: names, or null when the
// platform has no results file (the whole command is the only unit).
export const failedSuites = (result) =>
  result.suites
    ? result.suites.filter((s) => s.status !== "passed").map((s) => s.name)
    : null;

// Runs a platform's validation again, only for `names` when it can.
// {ok, failed: [names] | null, result}. `failed` is null when the platform
// has no results file and was rerun whole.
export async function runSuites(
  dir,
  platform,
  spec,
  environment,
  { names = null, ...options } = {},
) {
  if (names?.length && spec.suiteArgs) {
    const failed = [];
    let last = null;
    for (const name of names) {
      last = await runFull(
        dir,
        platform,
        {
          command: [...spec.command, ...fill(spec.suiteArgs, name)],
          results: null,
        },
        environment,
        options,
      );
      if (!last.ok) failed.push(name);
    }
    return { ok: !failed.length, failed, result: last };
  }
  const result = await runFull(dir, platform, spec, environment, options),
    all = failedSuites(result),
    failed = names && all ? all.filter((n) => names.includes(n)) : all;
  return { ok: names && failed ? !failed.length : result.ok, failed, result };
}

// Step 1. `failures`: [{platform, names}] (names null for a whole-command
// platform). Returns {persistent: [{platform, names}], flaky: [{platform,
// suite}]}.
export async function confirmFailures(
  dir,
  failures,
  { spec, environment, reruns, run = runSuites, options = {} },
) {
  const persistent = [],
    flaky = [];
  for (const { platform, names } of failures) {
    let still = names;
    for (let i = 0; i < reruns && (still === null || still.length); i++) {
      const again = await run(
        dir,
        platform,
        spec(platform),
        environment(platform),
        {
          names: still,
          ...options,
        },
      );
      if (again.ok) {
        for (const suite of still ?? ["*"]) flaky.push({ platform, suite });
        still = [];
        break;
      }
      const passed = (still ?? []).filter((n) => !again.failed?.includes(n));
      for (const suite of passed) flaky.push({ platform, suite });
      still = again.failed ?? still;
    }
    if (still === null || still.length)
      persistent.push({ platform, names: still });
  }
  return { persistent, flaky };
}

// Step 2. `boundaries`: [{key, boundary}] in stack order; the last is the
// failing head. `fails(boundary)` runs the still-failing suites there and
// returns true when any still fails. Returns {index, probes, interaction}:
// the culprit is boundaries[index].
export async function bisectBoundaries(boundaries, fails) {
  const probes = [];
  let lo = -1, // the trunk before the train: passing
    hi = boundaries.length - 1; // the stack head: failing
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2),
      failed = await fails(boundaries[mid].boundary);
    probes.push({
      key: boundaries[mid].key,
      boundary: boundaries[mid].boundary,
      failed,
    });
    if (failed) hi = mid;
    else lo = mid;
  }
  return {
    index: hi,
    probes,
    interaction:
      hi === boundaries.length - 1 &&
      probes.length > 0 &&
      probes.every((p) => !p.failed),
  };
}

// Puts the landing worktree at `commit`, clean, so a probe runs on exactly it.
export async function checkoutClean(dir, commit) {
  // Reset first: a half-done revert leaves unmerged paths that block a checkout.
  await landGit(dir, ["reset", "--quiet", "--hard"]);
  await landGit(dir, ["checkout", "--quiet", "--detach", commit]);
  await landGit(dir, ["clean", "--quiet", "-fdx"]);
}

// One revert commit for a culprit's range `from..to`, on top of `onto`, in the
// landing worktree: the range's commits reverted newest first, together. null
// when a revert conflicts (nothing is left behind). The commit is a plain
// descendant of `onto`, so pushing it is a fast-forward.
export async function revertRange(dir, { onto, from, to, message }) {
  await checkoutClean(dir, onto);
  const commits = (
    await git(dir, ["rev-list", "--no-merges", `${from}..${to}`])
  )
    .split("\n")
    .filter(Boolean);
  if (!commits.length) return null;
  try {
    await landGit(dir, ["revert", "--no-commit", ...commits]);
  } catch {
    await landGit(dir, ["revert", "--quit"]).catch(() => {});
    await checkoutClean(dir, onto);
    return null;
  }
  await landGit(dir, ["commit", "--quiet", "--allow-empty", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]);
}
