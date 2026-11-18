// Hard guards for live proof P67 (scripts/proof-p67-live.mjs). Pure
// functions, so a unit test can check them with fakes
// (src/app/test/proof-p67-guards.test.mjs).
//
// - Writes reach only the scratch org's p67-* repositories (the
//   contributor's fork lives in the org too). Nothing is written under
//   either login's own account. Reads may go anywhere the logins can see.
// - git pushes name one exact commit and one branch; nothing forced,
//   deleted, mirrored or pushed by pattern.
// - No permission-skipping harness flag reaches any child process.
// - Waiting on checks polls GitHub at most once per 10 minutes.
// - The run happens once per --root.
// - Nothing written out carries a token, a home or temp path, or this
//   machine's names.
import fs from "node:fs";
import path from "node:path";
import { privacyHits, privacyRules } from "../../src/app/privacy.mjs";

export const ORG = "avoozl-scratch";
export const PREFIX = "p67-";
export const POLL_MS = 10 * 60 * 1000;
export const MARK = "Avoozl P67 scratch (script-owned)";
export const RUN_RECORD = "p67-run.json";

const lower = (value) => String(value ?? "").toLowerCase();
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

// Whether this script may write to `repository` ("owner/name"): only
// avoozl-scratch/p67-*.
export function writableRepository(repository) {
  if (!REPOSITORY.test(String(repository ?? ""))) return false;
  const [owner, name] = lower(repository).split("/");
  return owner === ORG && name.startsWith(PREFIX) && !name.includes("..");
}

export function assertWritable(repository) {
  if (!writableRepository(repository))
    throw Error(
      `P67 guard: refused a write to ${repository}; only ${ORG}/${PREFIX}*.`,
    );
}

const READ = new Set(["GET", "HEAD"]);
const isQuery = (body) => /^\s*(query\b|\{)/.test(String(body?.query ?? ""));
// GraphQL mutations this proof may send, each only with node IDs that came
// back from a writable repository.
const MUTATIONS = new Set([
  "createIssue",
  "addBlockedBy",
  "addSubIssue",
  "mergePullRequest",
]);

// Every string value under a key ending in Id or Ids.
function nodeIds(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => nodeIds(v, out));
  else if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      if (/Ids?$/.test(key))
        [v].flat().forEach((id) => typeof id === "string" && out.push(id));
      else nodeIds(v, out);
    }
  return out;
}

// {ok, reason, repository}. `known` holds node IDs read from writable
// repositories (collectNodes).
export function requestAllowed(
  { method, url, body },
  { known = new Set() } = {},
) {
  const verb = String(method || "GET").toUpperCase(),
    p = new URL(String(url)).pathname,
    repo = /^\/repos\/([^/]+\/[^/]+)/.exec(p)?.[1] ?? null;
  if (READ.has(verb)) return { ok: true, repository: repo };
  if (p === "/graphql") {
    if (isQuery(body)) return { ok: true, repository: null };
    const name = /\{\s*([A-Za-z]+)\s*\(/.exec(String(body?.query ?? ""))?.[1];
    if (!MUTATIONS.has(name))
      return { ok: false, reason: `GraphQL mutation ${name ?? "?"}` };
    const ids = nodeIds(body?.variables ?? {});
    if (!ids.length || ids.some((id) => !known.has(id)))
      return { ok: false, reason: `GraphQL ${name} on an unknown node` };
    return { ok: true, repository: null };
  }
  if (repo)
    return writableRepository(repo)
      ? { ok: true, repository: repo }
      : { ok: false, reason: `${verb} on ${repo}` };
  // A new repository in the org, named p67-*.
  if (verb === "POST" && lower(p) === `/orgs/${ORG}/repos`)
    return lower(body?.name).startsWith(PREFIX)
      ? { ok: true, repository: `${ORG}/${body.name}` }
      : { ok: false, reason: `a repository named ${body?.name}` };
  // The contributor accepting an invitation to a p67-* repository; the
  // script checks the invitation's repository before it calls.
  if (verb === "PATCH" && /^\/user\/repository_invitations\/\d+$/.test(p))
    return { ok: true, repository: null };
  return { ok: false, reason: `${verb} ${p}` };
}

// Node IDs found in a response from a writable repository.
export function collectNodes(value, known) {
  if (Array.isArray(value)) value.forEach((v) => collectNodes(v, known));
  else if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      if ((key === "node_id" || key === "id") && typeof v === "string")
        known.add(v);
      else collectNodes(v, known);
    }
  return known;
}

// A fetch for GitHubClient that refuses every write requestAllowed refuses,
// and every write to a public repository whose body names a private term
// (the last line of defense; Avoozl's own checks should refuse first).
// `calls` counts requests by method and path shape.
export function guardedFetch({
  fetch,
  known = new Set(),
  calls = {},
  publicRepositories = [],
  privateTerms = [],
  onStopped = () => {},
}) {
  const publics = new Set(publicRepositories.map(lower));
  return async (input, init = {}) => {
    const method = String(init.method || "GET").toUpperCase(),
      body = init.body ? JSON.parse(String(init.body)) : undefined,
      verdict = requestAllowed({ method, url: input, body }, { known });
    if (!verdict.ok) throw Error(`P67 guard refused ${verdict.reason}`);
    if (
      !READ.has(method) &&
      verdict.repository &&
      publics.has(lower(verdict.repository)) &&
      privateTerms.some((term) => lower(init.body).includes(lower(term)))
    ) {
      onStopped({ method, repository: verdict.repository });
      const error = Error(
        "P67 guard stopped a public write that names a private term; Avoozl did not refuse it.",
      );
      error.p67Stopped = true;
      throw error;
    }
    const shape = `${method} ${new URL(String(input)).pathname.replace(/\/\d+/g, "/N")}`;
    calls[shape] = (calls[shape] ?? 0) + 1;
    const response = await fetch(input, init);
    if (
      verdict.repository &&
      writableRepository(verdict.repository) &&
      response.ok
    ) {
      try {
        collectNodes(await response.clone().json(), known);
      } catch {}
    }
    return response;
  };
}

// Flags that skip an agent's permission checks, refused in any argv.
const SKIPPING = [
  /^--dangerously/i,
  /bypassPermissions/i,
  /danger-full-access/i,
  /^--yolo$/i,
];
export function refuseSkippingFlags(argv) {
  const bad = argv.find((a) => SKIPPING.some((r) => r.test(String(a))));
  if (bad) throw Error(`P67 guard: refused a permission-skipping flag.`);
  return argv;
}

// The argv for one push: `git push URL SHA:refs/heads/BRANCH`. Refuses a
// force, a delete, a pattern and a repository the guard does not allow.
const BRANCH = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}(?<![./])$/;
export function pushArgs({ repository, branch, commit }) {
  assertWritable(repository);
  if (!/^[0-9a-f]{40}$/.test(String(commit ?? "")))
    throw Error("P67 guard: a push names one exact commit.");
  if (!BRANCH.test(String(branch ?? "")) || branch.includes("*"))
    throw Error("P67 guard: a push names one branch by name.");
  return refusePushFlags([
    "push",
    "--quiet",
    `https://github.com/${repository}.git`,
    `${commit}:refs/heads/${branch}`,
  ]);
}

// Refuses a git push argv that forces, deletes, mirrors or pushes all.
export function refusePushFlags(args) {
  const at = args.indexOf("push");
  if (at < 0) return args;
  for (const arg of args.slice(at + 1)) {
    if (
      /^(?:-f|--force(?:-with-lease|-if-includes)?(?:=.*)?|--mirror|--all|--delete|-d|--prune|--tags)$/.test(
        arg,
      )
    )
      throw Error(`P67 guard: refused git push ${arg}.`);
    if (arg.startsWith("+") || /^:/.test(arg) || /:\s*$/.test(arg))
      throw Error("P67 guard: refused a forced or deleting refspec.");
  }
  return args;
}

// At most one poll per POLL_MS. `wait()` sleeps until the next poll may go.
// `last` carries the previous poll's time across processes.
export function poller({
  now = Date.now,
  sleep,
  minMs = POLL_MS,
  last: previous = null,
} = {}) {
  let last = previous;
  return {
    get last() {
      return last;
    },
    due() {
      return last === null ? 0 : Math.max(0, last + minMs - now());
    },
    async wait() {
      const ms = this.due();
      if (ms > 0) await sleep(ms);
      last = now();
    },
  };
}

// Claims the one run for `root`: writes the run record, refusing if it is
// already there.
export function claimRun(root, facts = {}) {
  const file = path.join(root, RUN_RECORD);
  try {
    fs.writeFileSync(
      file,
      JSON.stringify(
        { startedAt: new Date().toISOString(), ...facts },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
  } catch (error) {
    if (error.code === "EEXIST")
      throw Error(
        `P67 already ran under this root (${RUN_RECORD} exists). Each proof runs once.`,
      );
    throw error;
  }
  return file;
}

const TOKEN = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bBearer\s+\S{20,}/i,
  /\bx-access-token:/i,
];
const LOCAL_PATH =
  /(?<![\w.:/-])\/(?:Users|home|var|tmp|private|opt|Volumes)\/[^\s"')]*/;

// Problems with text about to be printed or written: secrets, local
// paths, and the privacy scan's text rules for this machine.
export function outputProblems(
  text,
  { secrets = [], machine = null, configFile = null } = {},
) {
  const problems = [],
    value = String(text);
  if (secrets.some((s) => s && value.includes(s))) problems.push("secret");
  if (TOKEN.some((r) => r.test(value))) problems.push("token");
  if (LOCAL_PATH.test(value)) problems.push("local-path");
  const hits = privacyHits(
    value.split("\n"),
    privacyRules({ scope: "text", machine, configFile }),
  );
  for (const rule of new Set(hits.map((h) => h.rule)))
    problems.push(`privacy:${rule}`);
  return problems;
}

export function assertClean(text, options) {
  const problems = outputProblems(text, options);
  if (problems.length)
    throw Error(`P67 guard: refused output with ${problems.join(", ")}.`);
  return text;
}

// After the script itself crashed: clears the crash, takes `stage` off the
// done list so the next continue reruns it, and records what happened,
// keeping the stage's earlier result and the guard stops it caused. Only a
// stage that already ran may be rerun, and only once per crash.
export function recoverRun(state, stage, at) {
  if (!state.failure)
    throw Error("This run did not crash; nothing to recover.");
  if (!state.done.includes(stage))
    throw Error(`Stage ${stage} has not run; only a stage that ran is rerun.`);
  const report = state.report,
    earlier = report.steps.find((s) => s.name === stage) ?? null;
  (state.recoveries ??= []).push({
    at,
    crash: state.failure,
    rerun: stage,
    earlier,
    stopped: report.stopped,
  });
  report.stopped = [];
  report.steps = report.steps.filter((s) => s.name !== stage);
  state.done = state.done.filter((name) => name !== stage);
  delete state.failure;
  delete state.finished;
  return state;
}
