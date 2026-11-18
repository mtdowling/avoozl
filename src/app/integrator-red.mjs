// Red CI on a landed trunk (landing-trains lt-11.2, LT10.6, design D11.3).
// With `ci.bisectOnRed`, a failed run of the watched workflow on a head a
// train pushed is bisected before the next train starts. The failing jobs name
// the platforms (`ci.jobPlatforms`); a platform with a local environment is
// probed here, member boundary by boundary, and the culprit is dealt with like
// a red validation (D11.2). A platform with no local environment cannot be
// probed: one Needs you item names the failing jobs. Each train is handled
// once, whatever the outcome.
//
// shortcut: probes run without taking the machine's resource slots, so a probe
// can overlap a worker's check on a shared VM; take the slots here if that
// shows up.
import { git } from "./git.mjs";
import { failureTools } from "./integrator-run.mjs";
import {
  addLandingWorktree,
  removeLandingWorktree,
} from "./integrator-stack.mjs";
import { runningTrain } from "./integrator-trains.mjs";
import { machinePlatforms } from "./integrator-validation.mjs";

const TRAINS = "landing_trains";
const FAILED = ["failure", "timed_out"];

const needsYou = (target, title, text) => ({
  channel: "failure",
  title,
  text,
  target,
});

// {state, notify, messages}: state is null when there was nothing to do.
export async function bisectRedTrain(store, ctx) {
  const { project, target, settings, config, github } = ctx,
    out = { state: null, notify: [], messages: [] };
  if (!settings.ci?.bisectOnRed || !github || !project.repository) return out;
  if (runningTrain(store, project.id, target)) return out;
  const train = store
    .list(TRAINS)
    .filter(
      (t) =>
        t.projectId === project.id &&
        t.target === target &&
        t.pushed &&
        ["landed", "partly-landed"].includes(t.outcome) &&
        FAILED.includes(t.ci?.conclusion) &&
        !t.redCi,
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
  if (!train) return out;
  const mark = (redCi) =>
    store.put(TRAINS, {
      ...store.get(TRAINS, train.id),
      redCi: { ...redCi, at: new Date().toISOString() },
    });
  const jobs = (await github.runJobs(project.repository, train.ci.run)).filter(
      (job) => FAILED.includes(job.conclusion),
    ),
    names = jobs.map((job) => job.name),
    mapped = settings.ci.jobPlatforms ?? {},
    platforms = [...new Set(names.map((n) => mapped[n]).filter(Boolean))],
    unplaced = names.filter((n) => !mapped[n]),
    environments = machinePlatforms(config),
    local = platforms.filter(
      (p) => environments[p] && settings.validation.full[p],
    ),
    remote = platforms.filter((p) => !local.includes(p));
  const stacked = train.members.filter((m) => m.state === "stacked");
  if (!local.length || !stacked.length) {
    mark({ state: "needs-you", jobs: names });
    out.state = "needs-you";
    out.notify.push(
      needsYou(
        target,
        `CI is red on ${target} and Avoozl cannot test it here`,
        `${train.id} landed and the run of ${settings.ci.workflow ?? "CI"} failed: ${names.join(", ") || "no failing job was named"}. ${[
          ...remote.map((p) => `${p} has no local environment.`),
          ...(unplaced.length
            ? [`${unplaced.join(", ")} is not in ci.jobPlatforms.`]
            : []),
        ].join(" ")}`.trim(),
      ),
    );
    return out;
  }
  mark({ state: "bisecting", jobs: names });
  const root = project.root,
    tools = failureTools(store, ctx, train.id),
    outcomes = stacked.map((m) => ({
      key: m.key,
      boundary: m.boundary,
      state: "stacked",
    })),
    head = outcomes.at(-1).boundary,
    dir = await addLandingWorktree(root, head);
  try {
    const url = await git(root, ["remote", "get-url", "origin"]),
      env = { ...(ctx.env ?? process.env), GIT_TERMINAL_PROMPT: "0" },
      verdict = await tools.handleRed(
        dir,
        local.map((platform) => ({ platform, ok: false })),
        outcomes,
        head,
        train.baseHead,
      );
    if (!verdict.culprit) {
      mark({ state: "flaky", jobs: names });
      out.state = "flaky";
    } else {
      const result = { messages: [], notify: [] },
        repaired = await tools.repairTrunk(dir, verdict, outcomes, {
          candidate: train.pushed,
          baseHead: train.baseHead,
          url,
          env,
          result,
        });
      out.notify.push(...result.notify);
      out.messages.push(...result.messages);
      mark({
        state: "culprit",
        jobs: names,
        culprit: verdict.culprit.key,
        repaired: Boolean(repaired.validated),
      });
      out.state = "culprit";
    }
    if (remote.length || unplaced.length)
      out.notify.push(
        needsYou(
          target,
          `CI is red on ${target} for jobs Avoozl cannot test here`,
          `${[...remote, ...unplaced].join(", ")} failed in the run of ${train.id} and has no local environment.`,
        ),
      );
  } finally {
    await removeLandingWorktree(root, dir);
  }
  return out;
}
