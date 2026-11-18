// Validation for integrator trains (landing-trains LT7, design D9): which
// platforms a train needs, the cheap checks before any push, and the full
// validation per platform through its machine environment.
//
// A platform environment is machine settings (the global file only, LT7.3):
// `native`, or a wrapper argv prefix that runs a command in a container or a
// VM. How a wrapper reaches the landing worktree's files is the wrapper's
// business; Avoozl runs `wrapper ++ command` with the worktree as the
// working directory.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { commandEvidence, git } from "./git.mjs";
import { globMatch } from "./path-glob.mjs";
import { notRunCause, outputExcerpt, outputTail, runEach } from "./verify.mjs";

const CHECK_TIMEOUT_MS = 20 * 60_000;

export const machinePlatforms = (config) => config?.machine?.platforms ?? {};

// The files a stack changed against the trunk, one path per entry.
export async function changedFiles(dir, baseHead, head = "HEAD") {
  return (await git(dir, ["diff", "--name-only", `${baseHead}..${head}`]))
    .split("\n")
    .filter(Boolean);
}

// Runs `argv` with `input` on stdin; {exitCode, stdout, stderr}.
function runWithInput(cwd, argv, input, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }),
      timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: error.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: code, signal, stdout, stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

// The platforms a train needs (LT7.4, D9.2), in `validation.full` order.
//   platforms.classifier  an argv that reads the changed paths on stdin and
//                         prints a JSON list of platform names
//   platforms.rules       globs to platform names; a changed path that no
//                         rule matches needs every platform
//   neither               every platform in `validation.full`
// A classifier that exits nonzero or prints anything but a JSON list of
// names throws, naming the reason; the train's step fails with it.
export async function neededPlatforms(
  settings,
  { dir, files, run = runWithInput },
) {
  const all = Object.keys(settings.validation?.full ?? {}),
    { classifier, rules } = settings.platforms ?? {};
  let named = all;
  if (classifier) {
    const result = await run(dir, classifier, files.join("\n") + "\n");
    if (result.exitCode !== 0)
      throw Error(
        `The platform classifier exited ${result.exitCode ?? result.signal ?? "without a code"}: ${String(
          result.stderr || "",
        )
          .trim()
          .split("\n")[0]
          .slice(0, 200)}`,
      );
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw Error(
        "The platform classifier did not print a JSON list of platforms.",
      );
    }
    if (!Array.isArray(parsed) || parsed.some((p) => typeof p !== "string"))
      throw Error(
        "The platform classifier did not print a JSON list of platforms.",
      );
    named = parsed;
  } else if (rules && files.length) {
    const unmatched = files.some(
      (file) => !Object.keys(rules).some((glob) => globMatch(glob, file)),
    );
    named = unmatched
      ? all
      : [
          ...new Set(
            files.flatMap((file) =>
              Object.entries(rules).flatMap(([glob, platforms]) =>
                globMatch(glob, file) ? platforms : [],
              ),
            ),
          ),
        ];
  }
  return all.filter((platform) => named.includes(platform));
}

// Cheap checks on the stack head, in order, stopping at the first failure,
// each with its own timeout. {ok, checks}.
export async function runCheap(
  dir,
  argvs,
  { timeoutFor = () => CHECK_TIMEOUT_MS, run = commandEvidence, env } = {},
) {
  const checks = [];
  for (const argv of argvs) {
    const [check] = await runEach(dir, [argv], { timeoutFor, run, env });
    checks.push(check);
    if (check.exitCode !== 0) return { ok: false, checks };
  }
  return { ok: true, checks };
}

// The suites a results file declares, or why it could not be read.
// {suites} or {problem}.
function readResults(dir, file) {
  if (!file) return { suites: null };
  const full = path.resolve(dir, file);
  if (path.relative(dir, full).startsWith(".."))
    return { problem: `results file ${file} is outside the worktree` };
  let value;
  try {
    value = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (error) {
    return {
      problem:
        error.code === "ENOENT"
          ? `results file ${file} was not written`
          : `results file ${file} is not valid JSON`,
    };
  }
  const suites = value?.suites;
  if (
    !Array.isArray(suites) ||
    suites.some(
      (s) => typeof s?.name !== "string" || typeof s?.status !== "string",
    )
  )
    return {
      problem: `results file ${file} has no suites with a name and status`,
    };
  return {
    suites: suites.map(({ name, status, seconds }) => ({
      name,
      status,
      ...(Number.isFinite(seconds) ? { seconds } : {}),
    })),
  };
}

// Full validation of one platform on the landing worktree: the declared
// command through the platform's environment, then its results file. Returns
//   {platform, ok, exitCode, notRun?, durationMs, tail?, suites, resultsProblem?}
// `suites` is null with no results file declared or a bad one; a bad one is
// recorded once as `resultsProblem` and later reruns use the whole command.
export async function runFull(
  dir,
  platform,
  { command, results },
  environment,
  { timeoutFor = () => CHECK_TIMEOUT_MS, run = commandEvidence, env } = {},
) {
  const argv = [
    ...(environment?.kind && environment.kind !== "native"
      ? environment.wrapper
      : []),
    ...command,
  ];
  if (results) fs.rmSync(path.resolve(dir, results), { force: true });
  const timeoutMs = timeoutFor(argv.join(" ")),
    started = Date.now(),
    result = await run(dir, argv, { timeoutMs, env }),
    elapsed = Date.now() - started,
    exitCode = Number.isInteger(result.exitCode) ? result.exitCode : null,
    output = (result.stdout || "") + "\n" + (result.stderr || ""),
    tail = outputTail(output, dir),
    read = readResults(dir, results);
  return {
    platform,
    ok: exitCode === 0,
    exitCode,
    ...(exitCode === null
      ? { notRun: notRunCause(result, elapsed, timeoutMs) }
      : {}),
    durationMs: elapsed,
    ...(tail ? { tail } : {}),
    // A longer redacted excerpt, for a failure sent back to its task.
    ...(exitCode === 0 ? {} : { excerpt: outputExcerpt(output, dir, 200) }),
    suites: read.suites ?? null,
    ...(read.problem ? { resultsProblem: read.problem } : {}),
  };
}

// Full validation of every needed platform. `limit` bounds how many run at
// once (the free resource slots, lt-4.3); the rest wait their turn.
export async function runPlatforms(
  dir,
  platforms,
  settings,
  machine,
  { limit = Infinity, ...options } = {},
) {
  const out = new Array(platforms.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, platforms.length) }, async () => {
      while (next < platforms.length) {
        const index = next++,
          platform = platforms[index];
        out[index] = await runFull(
          dir,
          platform,
          settings.validation.full[platform],
          machine[platform] ?? null,
          options,
        );
      }
    }),
  );
  return out;
}

// Records one platform's full-validation result on the train: the suites per
// platform, and a results file problem once (a later run of the same train
// reruns the whole command without saying so again).
export function recordPlatformResult(store, trainId, result) {
  return store.transaction(() => {
    const train = store.get("landing_trains", trainId);
    if (!train) return null;
    const notes = new Set(train.notes ?? []);
    if (result.resultsProblem)
      notes.add(
        `${result.platform}: ${result.resultsProblem}; later reruns use the whole command`,
      );
    return store.put("landing_trains", {
      ...train,
      checks: { ...train.checks, [result.platform]: result },
      notes: [...notes],
    });
  });
}
