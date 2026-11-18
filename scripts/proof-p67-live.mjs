#!/usr/bin/env node
// Proof P67 (R102.7, R102.8, R102.12, R102.19, R102.21, design §4.32): fork
// source and upstream permissions, live, in the scratch org avoozl-scratch.
//
// Two logins. The maintainer is the default gh login and owns the org. The
// contributor is a second account with its own gh config folder
// (default ~/.config/gh-avoozl-test, or --contributor-gh-config DIR); every
// contributor call sets GH_CONFIG_DIR for that call only. The contributor
// is not an org member: it gets read on the upstream and write on the fork
// and the two spec homes, by repository invitations it accepts. The
// contributor's Avoozl drives the spec: it checkpoints to the fork, opens
// and updates the pull request, and observes the maintainer's merge.
//
//   node scripts/proof-p67-live.mjs --root DIR preflight
//   node scripts/proof-p67-live.mjs --root DIR run
//   node scripts/proof-p67-live.mjs --root DIR owner STAGE
//   node scripts/proof-p67-live.mjs --root DIR continue
//
// preflight reads only and prints PREFLIGHT OK, or each missing item as an
// owner step. Each run has its own repositories, named for the --root
// folder: /tmp/p67-run2 gives avoozl-scratch/p67-run2-upstream (public),
// its fork p67-run2-upstream-fork, the spec homes p67-run2-plans-public and
// p67-run2-plans-private, and the private mirror p67-run2-mirror. run
// creates them, then performs P67's Action steps, stage by stage, through
// Avoozl's own modules and CLI in isolated scratch workspaces under --root.
// Results are read back from GitHub.
//
// Person stages (the maintainer's merge, and each `avoozl spec
// export-issues --confirm`) run inline in a person's terminal. In an agent
// session the run stops before each one and prints the owner's exact
// command (`owner STAGE`, which refuses an agent session); `continue` then
// goes on. run happens once per --root (p67-run.json); progress is in
// p67-state.json. The last stage writes a receipt draft to <root>/evidence/
// for a person to review and copy to docs/evidence/. Nothing here writes
// into this repository or ticks P67.
//
// Guards (scripts/live-proofs/p67-guards.mjs): writes only to
// avoozl-scratch/p67-*, no force push, one named branch per push, no
// permission-skipping flags, at most one GitHub poll per 10 minutes while
// waiting on checks or reviews, and a receipt with no tokens, local paths or
// machine names.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  MARK,
  ORG,
  RUN_RECORD,
  assertClean,
  assertWritable,
  claimRun,
  guardedFetch,
  outputProblems,
  poller,
  pushArgs,
  refuseSkippingFlags,
  writableRepository,
} from "./live-proofs/p67-guards.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SCRIPT), "..");
const CLI = path.join(REPO, "cli.mjs");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    "contributor-gh-config": { type: "string" },
  },
});
const MODE = positionals[0] ?? "";
if (!values.root || !["preflight", "run", "owner", "continue"].includes(MODE)) {
  console.error(
    "Usage: node scripts/proof-p67-live.mjs --root DIR [--contributor-gh-config DIR] preflight|run|continue|owner STAGE",
  );
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const temp = [os.tmpdir(), "/tmp"].flatMap((dir) => [
  path.resolve(dir) + path.sep,
  fs.realpathSync(dir) + path.sep,
]);
if (!temp.some((dir) => (ROOT + path.sep).startsWith(dir))) {
  console.error("The scratch --root must be in the temporary folder.");
  process.exit(64);
}
fs.mkdirSync(ROOT, { recursive: true });

// The two gh config folders, fixed before anything changes the
// environment. Tokens never come from the environment.
const HOME_CONFIG =
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
const MAINTAINER_GH = path.join(HOME_CONFIG, "gh");
const CONTRIBUTOR_GH = path.resolve(
  values["contributor-gh-config"] ||
    path.join(os.homedir(), ".config", "gh-avoozl-test"),
);
// The owner's machine config, read only, for the receipt's private
// internal-domain list.
const REAL_CONFIG = path.join(HOME_CONFIG, "avoozl", "config.json");
const TOKEN_VARS = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "AVOOZL_GITHUB_TOKEN",
  "GH_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN",
];

// Each run has its own repositories, named for the root's last folder
// (`/tmp/p67-run2` gives avoozl-scratch/p67-run2-upstream and so on), so a
// later run never reuses or deletes an earlier run's repositories.
const TAG = path
  .basename(ROOT)
  .toLowerCase()
  .replace(/^p67-?/, "")
  .replace(/[^a-z0-9-]/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 30);
if (!TAG) {
  console.error(
    "Name the --root folder for the run, for example /tmp/p67-run2.",
  );
  process.exit(64);
}
const UP = `${ORG}/p67-${TAG}-upstream`,
  FORK = `${ORG}/p67-${TAG}-upstream-fork`,
  PUB = `${ORG}/p67-${TAG}-plans-public`,
  PRIV = `${ORG}/p67-${TAG}-plans-private`,
  MIRROR = `${ORG}/p67-${TAG}-mirror`,
  CHECK = "p67-check";

// --- Processes -----------------------------------------------------------
const secrets = [];
const scrubText = (text) =>
  String(text)
    .split(ROOT)
    .join("<root>")
    .split(fs.realpathSync(os.tmpdir()))
    .join("<tmp>")
    .split(os.tmpdir())
    .join("<tmp>")
    .split(os.homedir())
    .join("<home>");
const say = (line) => {
  const text = scrubText(line);
  const problems = outputProblems(text, { secrets });
  console.log(problems.length ? `[withheld: ${problems.join(", ")}]` : text);
};

// The environment for one login's commands. The contributor's folder is
// set per call, never as this process's default.
function ghEnv(configDir) {
  const env = {
    ...process.env,
    GH_CONFIG_DIR: configDir,
    GH_PROMPT_DISABLED: "1",
    GIT_TERMINAL_PROMPT: "0",
    // git authenticates through this login's gh, never a stored helper.
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "",
    GIT_CONFIG_KEY_1: "credential.helper",
    GIT_CONFIG_VALUE_1: "!gh auth git-credential",
  };
  for (const name of TOKEN_VARS) delete env[name];
  return env;
}
const run = (cmd, args, { cwd = ROOT, env = process.env, input } = {}) =>
  execFileSync(cmd, refuseSkippingFlags(args), {
    cwd,
    env,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
// {status, json, headers}; a 404 is a status, not a throw.
function ghApi(env, pathname, { headers = false } = {}) {
  try {
    const out = run("gh", ["api", ...(headers ? ["-i"] : []), pathname], {
      env,
    });
    if (!headers) return { status: 200, json: out ? JSON.parse(out) : null };
    const [head, ...rest] = out.split(/\r?\n\r?\n/);
    return {
      status: Number(/HTTP\/\S+\s+(\d+)/.exec(head)?.[1] ?? 200),
      headers: head,
      json: rest.join("\n\n") ? JSON.parse(rest.join("\n\n")) : null,
    };
  } catch (error) {
    const status = Number(/HTTP (\d{3})/.exec(String(error.stderr))?.[1] ?? 0);
    return { status: status || 500, json: null, error: true };
  }
}
const scopesOf = (headers) =>
  (/^x-oauth-scopes:\s*(.*)$/im.exec(headers ?? "")?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const hasScope = (scopes, want) =>
  scopes.includes(want) ||
  (want === "read:org" && scopes.includes("admin:org"));

// --- Preflight -----------------------------------------------------------
const MAINTAINER_SCOPES = ["repo", "workflow", "read:org"];
const CONTRIBUTOR_SCOPES = ["repo"];
const WRITE = ["admin", "maintain", "write"];

function preflight({ resuming = false } = {}) {
  const missing = [],
    facts = [];
  for (const name of TOKEN_VARS)
    if (process.env[name])
      missing.push(
        `Unset ${name} in this shell (set -e ${name}); P67 reads each login's token from its own gh config.`,
      );
  try {
    run("gh", ["--version"]);
  } catch {
    missing.push("Install the gh command line tool.");
    return { missing, facts };
  }
  const mEnv = ghEnv(MAINTAINER_GH),
    me = ghApi(mEnv, "user", { headers: true });
  if (me.status !== 200 || !me.json?.login) {
    missing.push("Sign in the maintainer: gh auth login (default gh config).");
    return { missing, facts };
  }
  const M = me.json.login,
    mScopes = scopesOf(me.headers);
  facts.push(
    `maintainer login: ${M}; scopes: ${mScopes.join(" ") || "(none shown)"}`,
  );
  const mNeed = MAINTAINER_SCOPES.filter((s) => !hasScope(mScopes, s));
  if (mNeed.length)
    missing.push(
      `Give the maintainer login the ${mNeed.join(", ")} scope(s): gh auth refresh -h github.com -s ${mNeed.join(",")}`,
    );
  const org = ghApi(mEnv, `orgs/${ORG}`);
  if (org.status !== 200)
    missing.push(
      `Create the org ${ORG} on the Free plan: https://github.com/account/organizations/new?plan=free`,
    );
  else {
    facts.push(`org ${ORG}: exists`);
    const membership = ghApi(mEnv, `user/memberships/orgs/${ORG}`);
    facts.push(
      `maintainer role in ${ORG}: ${membership.json?.role ?? "unknown"}`,
    );
    if (membership.json?.role !== "admin")
      missing.push(`Make ${M} an owner (admin) of ${ORG}.`);
  }

  let C = null;
  if (path.resolve(CONTRIBUTOR_GH) === path.resolve(MAINTAINER_GH))
    missing.push(
      "The contributor's gh config folder must not be the maintainer's.",
    );
  else if (!fs.existsSync(CONTRIBUTOR_GH))
    missing.push(
      "Sign in the second account in its own gh config folder: env GH_CONFIG_DIR=$HOME/.config/gh-avoozl-test gh auth login -h github.com -s repo",
    );
  else {
    const cEnv = ghEnv(CONTRIBUTOR_GH),
      you = ghApi(cEnv, "user", { headers: true });
    if (you.status !== 200 || !you.json?.login)
      missing.push(
        "Sign in the second account: env GH_CONFIG_DIR=$HOME/.config/gh-avoozl-test gh auth login -h github.com -s repo",
      );
    else if (you.json.login.toLowerCase() === M.toLowerCase())
      missing.push(
        "The contributor login is the maintainer login; sign in a second account.",
      );
    else {
      C = you.json.login;
      const cScopes = scopesOf(you.headers);
      facts.push(
        `contributor login: ${C}; scopes: ${cScopes.join(" ") || "(none shown)"}`,
      );
      const cNeed = CONTRIBUTOR_SCOPES.filter((s) => !hasScope(cScopes, s));
      if (cNeed.length)
        missing.push(
          `Give the contributor login the ${cNeed.join(", ")} scope(s): env GH_CONFIG_DIR=$HOME/.config/gh-avoozl-test gh auth refresh -h github.com -s ${cNeed.join(",")}`,
        );
      if (org.status === 200) {
        const member = ghApi(mEnv, `orgs/${ORG}/members/${C}`),
          isMember = member.status === 204 || member.status === 200;
        facts.push(`contributor is an org member: ${isMember}`);
        if (isMember)
          missing.push(
            `Remove ${C} from ${ORG}; the contributor must have no org role, so it has no upstream push or merge right.`,
          );
      }
    }
  }

  // Target repositories: absent, or made by this script.
  for (const repository of [UP, FORK, PUB, PRIV, MIRROR]) {
    const found = ghApi(mEnv, `repos/${repository}`);
    if (found.status === 404) facts.push(`${repository}: absent`);
    else if (
      found.status === 200 &&
      String(found.json?.description ?? "").includes(MARK)
    )
      facts.push(`${repository}: exists, script-owned`);
    else if (found.status === 200)
      missing.push(
        `${repository} exists and was not made by P67. Rename or delete it.`,
      );
    else facts.push(`${repository}: unreadable (HTTP ${found.status})`);
  }
  if (C) {
    const up = ghApi(mEnv, `repos/${UP}`);
    if (up.status === 200) {
      const role = ghApi(mEnv, `repos/${UP}/collaborators/${C}/permission`);
      const name = role.json?.role_name ?? role.json?.permission ?? "none";
      facts.push(`contributor role on ${UP}: ${name}`);
      if (WRITE.includes(name))
        missing.push(
          `Remove ${C}'s push access to ${UP}; it must be read only.`,
        );
    }
  }
  if (!resuming && fs.existsSync(path.join(ROOT, RUN_RECORD)))
    missing.push("P67 already ran under this --root; each proof runs once.");
  return { missing, facts, maintainer: M, contributor: C };
}

if (MODE === "preflight") {
  const { missing, facts } = preflight();
  for (const line of facts) say(`- ${line}`);
  if (missing.length) {
    say("PREFLIGHT FAILED. Owner steps:");
    missing.forEach((item, i) => say(`${i + 1}. ${item}`));
    process.exit(1);
  }
  say("PREFLIGHT OK");
  process.exit(0);
}

// --- Run, continue and owner stages --------------------------------------
const { agentSession } = await import("../src/app/mcp-policy.mjs");
const AGENT = agentSession(process.env);
const STATE_FILE = path.join(ROOT, "p67-state.json");
if (MODE === "owner" && AGENT) {
  console.error(
    "An owner stage is a person's act; run it in your own terminal, not an agent session.",
  );
  process.exit(2);
}
const checked = preflight({ resuming: MODE !== "run" });
if (checked.missing.length) {
  for (const item of checked.missing) say(`- ${item}`);
  console.error("Preflight is not OK; do its owner steps first.");
  process.exit(1);
}
const M = checked.maintainer,
  C = checked.contributor;
let S;
if (MODE === "run") {
  claimRun(ROOT, { maintainer: M, contributor: C });
  S = {
    runId: randomBytes(4).toString("hex"),
    done: [],
    report: {
      maintainer: M,
      contributor: C,
      steps: [],
      calls: {},
      stopped: [],
    },
  };
} else {
  if (
    !fs.existsSync(path.join(ROOT, RUN_RECORD)) ||
    !fs.existsSync(STATE_FILE)
  ) {
    console.error("No P67 run under this --root; start one with run.");
    process.exit(1);
  }
  S = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  if (S.report.maintainer !== M || S.report.contributor !== C) {
    console.error("The logins changed since this run started.");
    process.exit(1);
  }
  if (S.finished) {
    console.error("This P67 run already finished; each proof runs once.");
    process.exit(1);
  }
}
const report = S.report;
const save = () =>
  fs.writeFileSync(STATE_FILE, scrubText(JSON.stringify(S, null, 2)));

// Isolated machine config and state; the real ones are never written.
const HOME = path.join(ROOT, "home");
process.env.XDG_CONFIG_HOME = path.join(HOME, "config");
process.env.XDG_STATE_HOME = path.join(HOME, "state");
process.env.GH_CONFIG_DIR = MAINTAINER_GH; // this process acts as the maintainer
for (const name of [...TOKEN_VARS, "KIROCREW_HOME"]) delete process.env[name];
const { machineAvoozlPaths } = await import("../src/app/host-config.mjs");
const MACHINE = machineAvoozlPaths();
for (const dir of [MACHINE.configDirectory, MACHINE.stateDirectory])
  if (!dir.startsWith(HOME + path.sep))
    throw Error("The machine config is not isolated.");
const CONFIG_FILE = path.join(MACHINE.configDirectory, "config.json");

const { GitHubClient } = await import("../src/app/github.mjs");
const { git } = await import("../src/app/git.mjs");
const { Store } = await import("../src/app/store.mjs");
const { initializeWorkspace } = await import("../src/app/workspace.mjs");
const { workspaceConfig } = await import("../src/app/config.mjs");
const { bindContentRules, guardGitHub } = await import(
  "../src/app/content-rules.mjs"
);
const { specHash } = await import("../src/app/spec-plans.mjs");
const { taskDefinition, taskOutcome } = await import(
  "../src/app/task-outcomes.mjs"
);
const { appendRecord, githubJournal, journalOutcomes, replayJournal } =
  await import("../src/app/spec-journal.mjs");
const {
  checkpointTask,
  discoverFromJournal,
  discoverFromPullRequest,
  ensureWorkingBranch,
  fetchExact,
  integrateVerified,
  landingRights,
  opaqueId,
  pushHead,
  qualifiedRef,
  retainVerified,
  sourceRegistry,
  verifyRelationship,
  workingBranch,
} = await import("../src/app/working-heads.mjs");
const { effectiveOwner, headGuardedMerge, takeOver } = await import(
  "../src/app/driver-generations.mjs"
);
const { runCheckAt } = await import("../src/app/flow-line.mjs");
const { enqueueLanding, landNext, withdrawLanding } = await import(
  "../src/app/landing-queue.mjs"
);
const { pullSteps } = await import("../src/app/landing-pulls.mjs");
const { applyAccess, previewAccess } = await import(
  "../src/app/setup-access.mjs"
);
const { rebuildSpec, resumeRebuild } = await import(
  "../src/app/spec-rebuild.mjs"
);
const { gitCopy, mirrorNeedsYou, mirrorSyncStep, trackingBranch } =
  await import("../src/app/mirror-sync.mjs");
const { mirrorForwardStep, mirrorForwards } = await import(
  "../src/app/mirror-forward.mjs"
);

const mEnv = ghEnv(MAINTAINER_GH),
  cEnv = ghEnv(CONTRIBUTOR_GH);
const tokenOf = (env) => {
  const token = run("gh", ["auth", "token"], { env });
  secrets.push(token);
  return token;
};
const url = (repository) => `https://github.com/${repository}.git`;
const short = (sha) => String(sha).slice(0, 12);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The private terms no public surface may carry.
const PRIV_SPEC = `p67-private-${S.runId}`;
const PRIVATE_TERMS = [PRIV, PRIV_SPEC];

const known = new Set(S.known ?? []);
const clientFor = (who) => {
  report.calls[who] ??= {};
  return new GitHubClient({
    token: tokenOf(who === "maintainer" ? mEnv : cEnv),
    fetch: guardedFetch({
      fetch: globalThis.fetch,
      known,
      calls: report.calls[who],
      publicRepositories: [UP, FORK, PUB],
      privateTerms: PRIVATE_TERMS,
      onStopped: (what) => report.stopped.push({ who, ...what }),
    }),
  });
};
const mRaw = clientFor("maintainer"),
  cRaw = clientFor("contributor");

const step = (name, facts) => {
  report.steps = report.steps.filter((s) => s.name !== name);
  report.steps.push({ name, at: new Date().toISOString(), ...facts });
  say(`- ${name}: ${JSON.stringify(facts).slice(0, 600)}`);
};
const outcomeOf = async (promise) => {
  try {
    const value = await promise;
    return { refused: false, value };
  } catch (error) {
    return {
      refused: true,
      status: error.status ?? null,
      byP67Guard: Boolean(error.p67Stopped),
      contentBlocked: Boolean(error.contentBlocked),
      message: scrubText(String(error.message)).slice(0, 300),
    };
  }
};
const gitIn = (dir, args, env = mEnv) => run("git", args, { cwd: dir, env });
// A push this script makes itself: one exact commit, one named branch.
const push = (dir, target, env) =>
  run("git", pushArgs(target), { cwd: dir, env });
const remoteHeads = (repository, env = mEnv) =>
  run("git", ["ls-remote", "--heads", url(repository)], { env })
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, ref] = line.split(/\s+/);
      return { sha, branch: ref.replace(/^refs\/heads\//, "") };
    });
const upstreamAvoozl = () =>
  remoteHeads(UP)
    .filter((h) => h.branch.startsWith("avoozl/"))
    .map((h) => h.branch);

// --- Workspaces ----------------------------------------------------------
// `publicRepositories`: the content rule set naming the private plan covers
// GitHub writes and pushes for these (registered here) and nothing else, so
// the private home's own journal may name its plan.
function createWorkspace(name, { publicRepositories = [] } = {}) {
  const dir = path.join(ROOT, name);
  initializeWorkspace(dir, { name: `P67 ${name}` });
  if (!publicRepositories.length) return;
  const policyFile = path.join(dir, ".avoozl.json"),
    policy = fs.existsSync(policyFile)
      ? JSON.parse(fs.readFileSync(policyFile, "utf8"))
      : {};
  policy.contentRules = {
    sets: [
      {
        id: "p67-private",
        boundaries: ["github", "diff"],
        repositories: publicRepositories,
      },
    ],
  };
  fs.writeFileSync(policyFile, JSON.stringify(policy, null, 2) + "\n");
  const terms = path.join(
    dir,
    ".avoozl",
    "local",
    "content-rules",
    "p67-private.txt",
  );
  fs.mkdirSync(path.dirname(terms), { recursive: true });
  fs.writeFileSync(
    terms,
    PRIVATE_TERMS.map(
      (term, i) =>
        `private-${i + 1}: ${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ).join("\n") + "\n",
  );
  // Registered, so the set is available (an unknown name fails closed).
  const store = openWorkspace(name).store;
  for (const repository of publicRepositories)
    store.put("github_repositories", {
      id: repository,
      owner: ORG,
      repo: repository.split("/")[1],
      projectId: repository === UP ? "code" : "plans",
    });
}
const opened = new Map();
function openWorkspace(name) {
  if (opened.has(name)) return opened.get(name);
  const dir = path.join(ROOT, name),
    store = new Store(workspaceConfig({ workspace: dir }).dbPath);
  bindContentRules(store, { workspaceRoot: dir, configFile: CONFIG_FILE });
  const ws = { dir, store };
  opened.set(name, ws);
  return ws;
}

// --- The spec ------------------------------------------------------------
const PUBLIC_SPEC = opaqueId("p67", S.runId, "public");
const T = Object.fromEntries(
  ["t1", "t2", "t3"].map((t) => [t, opaqueId(PUBLIC_SPEC, t)]),
);
const manifest = {
  tasks: {
    [T.t1]: {
      kind: "leaf",
      repository: "code",
      summary: "one() returns 1",
      paths: ["src/one.mjs", "test/one.test.mjs"],
      checks: ["node --test"],
    },
    [T.t2]: {
      kind: "leaf",
      repository: "code",
      summary: "two() returns 2",
      paths: ["src/two.mjs"],
      checks: ["node --test"],
      requires: [T.t1],
    },
    [T.t3]: {
      kind: "leaf",
      repository: "code",
      summary: "three() returns 3",
      paths: ["src/three.mjs"],
      checks: ["node --test"],
      requires: [T.t2],
    },
  },
};
const publicFiles = {
  "requirements.md": "# Scratch spec\n\nScratch requirements for proof P67.\n",
  "design.md": "# Scratch spec\n\nScratch design for proof P67.\n",
  "tasks.md":
    Object.entries(manifest.tasks)
      .map(([id, e]) => `- [ ] ${id} ${e.summary}`)
      .join("\n") + "\n",
  "avoozl/manifest.json": JSON.stringify(manifest, null, 2) + "\n",
};
const REVISION = specHash(publicFiles);
const DEFINITIONS = new Map(
  Object.entries(manifest.tasks).map(([id, entry]) => [
    id,
    taskDefinition(entry),
  ]),
);
const TASKS1 = [{ task: T.t1, definition: DEFINITIONS.get(T.t1) }];

// --- Shared context, rebuilt in each process ------------------------------
const P = {
  upSeed: path.join(ROOT, "seed-upstream"),
  code: path.join(ROOT, "contributor-code"),
  access: path.join(ROOT, "contributor-workspace", "p67-access.json"),
};
const pubOptions = {
    visibility: "public",
    publicRepositories: [UP, FORK, PUB],
    configFile: CONFIG_FILE,
  },
  privOptions = { visibility: "private", configFile: CONFIG_FILE },
  person = { kind: "person", login: C },
  queue = { projectId: "code", base: "main" },
  source = { repository: FORK, branch: workingBranch(PUBLIC_SPEC) },
  pushOptions = () => ({
    since: S.base1,
    env: cEnv,
    configFile: CONFIG_FILE,
    store: X.cWs.store,
  });
const X = {
  get cWs() {
    return openWorkspace("contributor-workspace");
  },
  get mWs() {
    return openWorkspace("maintainer-workspace");
  },
  get cGithub() {
    return (this._c ??= guardGitHub(cRaw, this.cWs.store));
  },
  get mGithub() {
    return (this._m ??= guardGitHub(mRaw, this.mWs.store));
  },
  get registry() {
    return sourceRegistry(
      JSON.parse(fs.readFileSync(P.access, "utf8")).sources,
    );
  },
  get jPub() {
    return githubJournal(this.cGithub, PUB, S.pubIssue);
  },
  get jPriv() {
    return githubJournal(this.cGithub, PRIV, S.privIssue);
  },
  intent() {
    return {
      journal: X.jPub,
      options: pubOptions,
      input: {
        driver: S.driver,
        owner: { login: C, from: "spec" },
        login: C,
        revision: REVISION,
      },
    };
  },
  // A tick builds its landing steps afresh; so does each stage here.
  steps() {
    return pullSteps({
      github: X.cGithub,
      registry: X.registry,
      root: P.code,
      target: UP,
      base: "main",
      login: C,
      method: "merge",
      intent: X.intent,
      env: cEnv,
      configFile: CONFIG_FILE,
      store: X.cWs.store,
    });
  },
};
const replayOf = async (journal, options) =>
  replayJournal(await journal.list(), {
    ...options,
    permission: journal.permission,
  });

// --- Poll: one batched GraphQL read, at most every 10 minutes ------------
const pace = poller({ sleep, last: S.lastPoll ?? null });
const POLL = `query($o:String!,$n:String!,$pr:Int!){repository(owner:$o,name:$n){pullRequest(number:$pr){state merged mergedBy{login} mergeCommit{oid} headRefOid headRepository{nameWithOwner}
 reviews(last:30){nodes{state author{login} commit{oid}}}
 commits(last:1){nodes{commit{oid checkSuites(first:10){nodes{status conclusion workflowRun{databaseId}}} statusCheckRollup{state contexts(first:30){nodes{__typename ... on CheckRun{name status conclusion} ... on StatusContext{context state}}}}}}}}}}`;
async function pollPull(number) {
  await pace.wait();
  S.lastPoll = pace.last;
  save();
  const [o, n] = UP.split("/"),
    data = await mRaw.graphql(
      POLL,
      { o, n, pr: number },
      "read the pull request",
    ),
    pull = data?.repository?.pullRequest,
    commit = pull?.commits?.nodes?.[0]?.commit;
  const checks = (commit?.statusCheckRollup?.contexts?.nodes ?? []).map((c) =>
    c.__typename === "CheckRun"
      ? { name: c.name, status: c.status, conclusion: c.conclusion }
      : { name: c.context, status: "COMPLETED", conclusion: c.state },
  );
  return {
    state: pull?.state,
    merged: pull?.merged,
    mergedBy: pull?.mergedBy?.login ?? null,
    mergeCommit: pull?.mergeCommit?.oid ?? null,
    head: pull?.headRefOid,
    headRepository: pull?.headRepository?.nameWithOwner ?? null,
    reviews: (pull?.reviews?.nodes ?? []).map((r) => ({
      state: r.state,
      by: r.author?.login,
      commit: r.commit?.oid,
    })),
    check: checks.find((c) => c.name === CHECK) ?? null,
    waitingRuns: (commit?.checkSuites?.nodes ?? [])
      .filter(
        (s) => s.conclusion === "ACTION_REQUIRED" && s.workflowRun?.databaseId,
      )
      .map((s) => s.workflowRun.databaseId),
  };
}
// The maintainer approves the fork runs GitHub holds (the target's own fork
// workflow rule): a person's act, recorded.
async function approveRuns(ids) {
  for (const id of ids) {
    await mRaw.request("POST", `/repos/${UP}/actions/runs/${id}/approve`);
    (report.approvedRuns ??= []).push(id);
  }
}
// Polls until `done(state)`. A held fork run is approved inline in a
// person's terminal; an agent session stops for the owner instead.
async function waitFor(label, done, limitMs = 3 * 60 * 60 * 1000) {
  const started = Date.now();
  for (;;) {
    const state = await pollPull(S.pr);
    if (done(state)) return state;
    if (state.waitingRuns.length) await approveRuns(state.waitingRuns);
    if (Date.now() - started > limitMs)
      throw Error(`Timed out waiting for ${label}.`);
    say(`  waiting for ${label}; next poll in 10 minutes`);
  }
}
const checkDone = (head) => (s) =>
  s.head === head && s.check?.status === "COMPLETED";

// GitHub moves a pull request's head a moment after a push: retry a step
// that saw the old head, a few times, seconds apart (not a check poll).
async function settled(fn) {
  for (let i = 0; ; i++)
    try {
      return await fn();
    } catch (error) {
      if (i >= 5 || !/does not carry the exact commit/.test(error.message))
        throw error;
      await sleep(10_000);
    }
}

// --- Helpers for the stages -----------------------------------------------
async function ensureRepo(repository, { visibility }) {
  const [, name] = repository.split("/"),
    found = await mRaw.repository(repository).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
  if (found) {
    if (!String(found.description ?? "").includes(MARK))
      throw Error(`${repository} is not script-owned.`);
    return { repository, created: false, private: found.private };
  }
  assertWritable(repository);
  const made = await mRaw.request("POST", `/orgs/${ORG}/repos`, {
    body: {
      name,
      private: visibility === "private",
      description: MARK,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
      auto_init: false,
    },
  });
  return { repository, created: true, private: made.private };
}
function seedDir(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  gitIn(dir, ["init", "-q", "-b", "main"]);
  gitIn(dir, ["config", "user.name", "Avoozl P67"]);
  gitIn(dir, ["config", "user.email", "p67@example.invalid"]);
  return commitIn(dir, files, "Seed P67 scratch");
}
function commitIn(dir, files, message) {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  gitIn(dir, ["add", "-A"]);
  gitIn(dir, ["commit", "-q", "-m", message]);
  return gitIn(dir, ["rev-parse", "HEAD"]);
}
// The maintainer invites the contributor with `permission`; the
// contributor accepts under its own gh config.
async function invite(repository, permission) {
  await mRaw.request(
    "PUT",
    `/repos/${repository}/collaborators/${encodeURIComponent(C)}`,
    { body: { permission } },
  );
  const pending = await cRaw.request("GET", "/user/repository_invitations"),
    mine = (pending ?? []).find(
      (i) =>
        i.repository?.full_name?.toLowerCase() === repository.toLowerCase(),
    );
  if (mine) {
    if (!writableRepository(mine.repository.full_name))
      throw Error(
        "P67 guard: refused an invitation outside the scratch repositories.",
      );
    await cRaw.request("PATCH", `/user/repository_invitations/${mine.id}`);
  }
  return { permission, accepted: Boolean(mine) };
}
const role = async (gh, repository, login) =>
  (await gh.permission(repository, login))?.permission ?? "none";
const approve = (commit) =>
  mRaw.request("POST", `/repos/${UP}/pulls/${S.pr}/reviews`, {
    body: { event: "APPROVE", commit_id: commit, body: "Approved for P67." },
  });

// --- Stages ----------------------------------------------------------------
// [name, person?, fn]. A person stage is a person's own act.
const STAGES = [
  [
    "setup",
    false,
    async () => {
      const repos = [];
      for (const [repository, visibility] of [
        [UP, "public"],
        [PUB, "public"],
        [PRIV, "private"],
        [MIRROR, "private"],
      ])
        repos.push(await ensureRepo(repository, { visibility }));
      S.upMain = seedDir(P.upSeed, {
        "package.json":
          JSON.stringify(
            {
              name: "p67-scratch",
              type: "module",
              private: true,
              scripts: { test: "node --test" },
            },
            null,
            2,
          ) + "\n",
        "test/base.test.mjs":
          'import test from "node:test";\ntest("base", () => {});\n',
        "README.md": "Scratch code for Avoozl proof P67.\n",
        ".github/workflows/p67.yml": `name: p67\non: [pull_request, push]\npermissions:\n  contents: read\njobs:\n  ${CHECK}:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: node --test\n`,
      });
      push(
        P.upSeed,
        { repository: UP, branch: "main", commit: S.upMain },
        mEnv,
      );
      const pubDir = path.join(ROOT, "seed-plans-public");
      S.pubSeed = seedDir(
        pubDir,
        Object.fromEntries(
          Object.entries(publicFiles).map(([f, t]) => [
            `.kiro/specs/${PUBLIC_SPEC}/${f}`,
            t,
          ]),
        ),
      );
      push(
        pubDir,
        { repository: PUB, branch: "main", commit: S.pubSeed },
        mEnv,
      );
      const privDir = path.join(ROOT, "seed-plans-private");
      S.privSeed = seedDir(privDir, {
        [`.kiro/specs/${PRIV_SPEC}/requirements.md`]:
          "# Private scratch spec\n\nThis plan stays private.\n",
      });
      push(
        privDir,
        { repository: PRIV, branch: "main", commit: S.privSeed },
        mEnv,
      );
      // The mirror starts as an exact copy of the upstream.
      push(
        P.upSeed,
        { repository: MIRROR, branch: "main", commit: S.upMain },
        mEnv,
      );
      // The fork, in the org, made by the maintainer.
      assertWritable(FORK);
      if (!(await mRaw.repository(FORK).catch(() => null)))
        await mRaw.request("POST", `/repos/${UP}/forks`, {
          body: {
            organization: ORG,
            name: FORK.split("/")[1],
            default_branch_only: true,
          },
        });
      const forkReady = () => {
        try {
          return remoteHeads(FORK).some((h) => h.branch === "main");
        } catch {
          return false;
        }
      };
      let fork = null;
      for (let i = 0; i < 36 && !(fork && forkReady()); i++) {
        await sleep(5000);
        fork = await mRaw.repository(FORK).catch(() => null);
      }
      if (!fork || !forkReady()) throw Error("The fork did not appear.");
      await mRaw.request("PATCH", `/repos/${FORK}`, {
        body: { description: MARK },
      });
      // The target's own rules: one approval, stale approvals dismissed, the
      // check required on an up-to-date head, no force push. Org owners may
      // push the base directly (the base move below).
      const ruleset = await mRaw.request("POST", `/repos/${UP}/rulesets`, {
        body: {
          name: "p67-main",
          target: "branch",
          enforcement: "active",
          conditions: {
            ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] },
          },
          bypass_actors: [
            {
              actor_id: 1,
              actor_type: "OrganizationAdmin",
              bypass_mode: "always",
            },
          ],
          rules: [
            {
              type: "pull_request",
              parameters: {
                required_approving_review_count: 1,
                dismiss_stale_reviews_on_push: true,
                require_code_owner_review: false,
                require_last_push_approval: false,
                required_review_thread_resolution: false,
              },
            },
            {
              type: "required_status_checks",
              parameters: {
                strict_required_status_checks_policy: true,
                required_status_checks: [{ context: CHECK }],
              },
            },
            { type: "non_fast_forward" },
          ],
        },
      });
      const invites = {
        [UP]: await invite(UP, "pull"),
        [FORK]: await invite(FORK, "push"),
        [PUB]: await invite(PUB, "push"),
        [PRIV]: await invite(PRIV, "push"),
      };
      createWorkspace("contributor-workspace", {
        publicRepositories: [UP, PUB],
      });
      createWorkspace("maintainer-workspace");
      step("setup", {
        repositories: repos,
        upstreamMain: S.upMain,
        ruleset: { id: ruleset?.id ?? null },
        invites,
        fork: {
          repository: fork.full_name,
          parent: fork.parent?.full_name,
          private: fork.private,
        },
        roles: {
          contributorOnUpstream: await role(mRaw, UP, C),
          contributorOnFork: await role(mRaw, FORK, C),
          contributorOnPublicHome: await role(mRaw, PUB, C),
          contributorOnPrivateHome: await role(mRaw, PRIV, C),
          maintainerOnUpstream: await role(mRaw, UP, M),
        },
      });
    },
  ],

  // Setup access preview (42.2) for both logins; a retry writes nothing.
  [
    "access",
    false,
    async () => {
      run("git", ["clone", "-q", url(FORK), P.code], { env: cEnv });
      gitIn(P.code, ["config", "user.name", "Avoozl P67"], cEnv);
      gitIn(P.code, ["config", "user.email", "p67@example.invalid"], cEnv);
      const wanted = {
        target: UP,
        base: "main",
        roots: { code: "code", plans: "plans-public" },
        sources: {
          [UP]: { url: url(UP) },
          [FORK]: { url: url(FORK), parent: UP },
        },
      };
      const first = await previewAccess(X.cGithub, {
        wanted,
        current: null,
        login: C,
      });
      const applied = await applyAccess(first, async (settings) =>
        fs.writeFileSync(P.access, JSON.stringify(settings, null, 2)),
      );
      const saved = JSON.parse(fs.readFileSync(P.access, "utf8"));
      const retry = await previewAccess(X.cGithub, {
        wanted,
        current: saved,
        login: C,
      });
      const retried = await applyAccess(retry, async () => {
        throw Error("A no-change retry wrote settings.");
      });
      const maintainer = await previewAccess(X.mGithub, {
        wanted,
        current: saved,
        login: M,
      });
      step("setup-access", {
        contributor: {
          changes: first.changes.map((c) => c.key),
          access: first.access,
          written: applied.written,
        },
        retry: {
          changes: retry.changes.length,
          message: retry.message,
          written: retried.written,
        },
        maintainer: { access: maintainer.access },
      });
    },
  ],

  [
    "issues",
    false,
    async () => {
      S.pubIssue = (
        await X.cGithub.createIssue(PUB, {
          title: "P67 scratch spec",
          body: "Avoozl keeps this spec's journal here.",
          assignees: [C],
        })
      ).number;
      S.privIssue = (
        await X.cGithub.createIssue(PRIV, {
          title: `P67 private scratch spec ${PRIV_SPEC}`,
          body: "Avoozl keeps this private spec's journal here.",
          assignees: [C],
        })
      ).number;
      step("spec-issues", {
        public: { repository: PUB, number: S.pubIssue },
        private: { repository: PRIV },
      });
    },
  ],

  // Take over: the spec owner's (the contributor's) own act.
  [
    "takeover",
    false,
    async () => {
      const ownerOf = async (repository, number) =>
        effectiveOwner({
          spec: ((await cRaw.issue(repository, number)).assignees ?? []).map(
            (a) => a.login,
          ),
        });
      const owner = await ownerOf(PUB, S.pubIssue);
      const pub = await takeOver(
        X.jPub,
        { by: person, owner, spec: PUBLIC_SPEC },
        pubOptions,
      );
      const priv = await takeOver(
        X.jPriv,
        {
          by: person,
          owner: await ownerOf(PRIV, S.privIssue),
          spec: PRIV_SPEC,
        },
        privOptions,
      );
      S.driver = pub.driver;
      S.privDriver = priv.driver;
      step("takeover", {
        public: pub.generation,
        private: priv.generation,
        owner: owner.login,
      });
    },
  ],

  // A pre-PR fork head: working branch and a checkpoint on the fork, both
  // published on the spec issue, then a verified integration.
  [
    "pre-pr",
    false,
    async () => {
      const registry = X.registry,
        journal = X.jPub;
      S.base1 = remoteHeads(UP).find((h) => h.branch === "main").sha;
      gitIn(P.code, ["fetch", "-q", url(UP), "main"], cEnv);
      const work = await ensureWorkingBranch(P.code, {
        spec: PUBLIC_SPEC,
        repository: FORK,
        target: { repository: UP, base: "main" },
        baseCommit: S.base1,
      });
      await pushHead(
        P.code,
        { ...source, commit: S.base1 },
        registry,
        pushOptions(),
      );
      await appendRecord(
        journal,
        {
          op: `checkpoint.work.${short(S.base1)}`,
          kind: "checkpoint",
          spec: PUBLIC_SPEC,
          driver: S.driver,
          refs: [{ ...source, commit: S.base1 }],
        },
        pubOptions,
      );
      const taskDir = path.join(ROOT, "task-t1");
      await git(P.code, [
        "worktree",
        "add",
        "-q",
        "--detach",
        taskDir,
        S.base1,
      ]);
      const unfinished = commitIn(
        taskDir,
        { "src/one.mjs": "export const one = () => 0;\n" },
        `Task ${T.t1} checkpoint`,
      );
      const cp = await checkpointTask(P.code, {
        spec: PUBLIC_SPEC,
        task: T.t1,
        commit: unfinished,
      });
      await pushHead(
        P.code,
        { repository: FORK, branch: cp.branch, commit: unfinished },
        registry,
        pushOptions(),
      );
      await appendRecord(
        journal,
        {
          op: `checkpoint.${short(unfinished)}`,
          kind: "checkpoint",
          spec: PUBLIC_SPEC,
          driver: S.driver,
          refs: [{ repository: FORK, branch: cp.branch, commit: unfinished }],
        },
        pubOptions,
      );
      const unverified = await outcomeOf(
        integrateVerified(P.code, {
          spec: PUBLIC_SPEC,
          task: T.t1,
          commit: unfinished,
          evidence: null,
        }),
      );
      const finished = commitIn(
        taskDir,
        {
          "src/one.mjs": "export const one = () => 1;\n",
          "test/one.test.mjs":
            'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { one } from "../src/one.mjs";\ntest("one", () => assert.equal(one(), 1));\n',
        },
        `Task ${T.t1}`,
      );
      await checkpointTask(P.code, {
        spec: PUBLIC_SPEC,
        task: T.t1,
        commit: finished,
      });
      const check = await runCheckAt({ root: P.code }, finished, [
        "node",
        "--test",
      ]);
      const evidence = {
        commit: finished,
        checks: [{ command: "node --test", exitCode: check.exitCode }],
        paths: { outside: [], protected: [] },
      };
      S.W1 = (
        await integrateVerified(P.code, {
          spec: PUBLIC_SPEC,
          task: T.t1,
          commit: finished,
          evidence,
        })
      ).head;
      await pushHead(
        P.code,
        { ...source, commit: S.W1 },
        registry,
        pushOptions(),
      );
      await retainVerified(
        P.code,
        PUBLIC_SPEC,
        qualifiedRef({
          source: { ...source, commit: S.W1 },
          target: { repository: UP, base: "main" },
        }),
      );
      await appendRecord(
        journal,
        {
          op: `checkpoint.work.${short(S.W1)}`,
          kind: "checkpoint",
          spec: PUBLIC_SPEC,
          driver: S.driver,
          refs: [{ ...source, commit: S.W1 }],
        },
        pubOptions,
      );
      const discovered = discoverFromJournal(
        await replayOf(journal, pubOptions),
        { target: UP, base: "main" },
      );
      step("pre-pr-fork-head", {
        base: S.base1,
        workingBranchCreated: work.created,
        checkpoint: { repository: FORK, branch: cp.branch, commit: unfinished },
        integrateUnverified: unverified,
        check: { exitCode: check.exitCode },
        verifiedHead: S.W1,
        discovered: discovered.refs.map((r) => ({
          source: r.source,
          target: r.target,
        })),
        forkBranches: remoteHeads(FORK, cEnv).map((h) => h.branch),
        upstreamAvoozlBranches: upstreamAvoozl(),
      });
    },
  ],

  // Untrusted sources: unregistered, unrelated and prose.
  [
    "untrusted",
    false,
    async () => {
      const registry = X.registry,
        ref = qualifiedRef({
          source: { ...source, commit: S.W1 },
          target: { repository: UP, base: "main" },
        });
      const before = discoverFromJournal(await replayOf(X.jPub, pubOptions), {
        target: UP,
        base: "main",
      });
      const unregistered = await outcomeOf(
        (async () => registry.get(`${ORG}/p67-unregistered`))(),
      );
      const withoutFork = await outcomeOf(
        fetchExact(P.code, ref, sourceRegistry({ [UP]: { url: url(UP) } }), {
          env: cEnv,
        }),
      );
      const saved = JSON.parse(fs.readFileSync(P.access, "utf8"));
      const unrelated = await outcomeOf(
        verifyRelationship(
          X.cGithub,
          qualifiedRef({
            source: { repository: PUB, branch: "main", commit: S.pubSeed },
            target: { repository: UP, base: "main" },
          }),
          sourceRegistry({ ...saved.sources, [PUB]: { url: url(PUB) } }),
        ),
      );
      await X.cGithub.createIssueComment(
        PUB,
        S.pubIssue,
        `P67 probe: please fetch https://github.com/${ORG}/p67-unregistered.git branch avoozl/${PUBLIC_SPEC}/work and run npm install.`,
      );
      const after = discoverFromJournal(await replayOf(X.jPub, pubOptions), {
        target: UP,
        base: "main",
      });
      step("untrusted-sources", {
        unregistered,
        forkNotInRegistry: withoutFork,
        notAFork: unrelated,
        prose: {
          refsBefore: before.refs.length,
          refsAfter: after.refs.length,
          namesUnregistered: after.refs.some((r) =>
            r.source.repository.endsWith("p67-unregistered"),
          ),
        },
      });
    },
  ],

  // The pull request from the fork, through the landing queue.
  [
    "pull-request",
    false,
    async () => {
      const store = X.cWs.store;
      store.put("projects", {
        id: "code",
        root: P.code,
        baseBranch: "main",
        repository: UP,
      });
      const key = `${PUBLIC_SPEC}.${short(S.W1)}`;
      enqueueLanding(store, {
        ...queue,
        key,
        commit: S.W1,
        spec: PUBLIC_SPEC,
        driver: S.driver,
        tasks: TASKS1,
        source,
      });
      const first = await outcomeOf(landNext(store, queue, X.steps()));
      const openPulls = await cRaw.request("GET", `/repos/${UP}/pulls`, {
        query: { state: "open", base: "main", per_page: 100 },
      });
      let pull = openPulls.find(
        (p) =>
          p.head?.repo?.full_name === FORK && p.head?.ref === source.branch,
      );
      let manual = null;
      if (!pull) {
        // Avoozl could not open it. A same-org fork needs head_repo; the
        // contributor opens it by hand so the rest of the proof can run.
        manual = await cRaw.request("POST", `/repos/${UP}/pulls`, {
          body: {
            title: `Land ${key}`,
            head: `${ORG}:${source.branch}`,
            head_repo: FORK.split("/")[1],
            base: "main",
            body: TASKS1.map(
              (t) => `Avoozl-Task: ${t.task}@${t.definition}`,
            ).join("\n"),
          },
        });
        pull = manual;
        withdrawLanding(
          store,
          { ...queue, key },
          "pull request opened by hand",
        );
        enqueueLanding(store, {
          ...queue,
          key: `${key}.pr`,
          commit: S.W1,
          spec: PUBLIC_SPEC,
          driver: S.driver,
          tasks: TASKS1,
          source,
          pr: pull.number,
        });
      }
      S.pr = pull.number;
      S.queueKey = manual ? `${key}.pr` : key;
      const fromPull = await discoverFromPullRequest(X.cGithub, UP, S.pr);
      step("fork-pull-request", {
        avoozlOpened: !manual,
        landNext: first.refused
          ? first
          : {
              state: first.value.state,
              waiting: first.value.entry?.waiting ?? null,
            },
        pr: S.pr,
        head: {
          repository: pull.head?.repo?.full_name,
          branch: pull.head?.ref,
          sha: pull.head?.sha,
        },
        discovered: fromPull.ref ?? fromPull,
        upstreamAvoozlBranches: upstreamAvoozl(),
      });
    },
  ],

  // Rebuild from the journal and the pull request, in a fresh clone; the
  // workspace database is not read.
  [
    "rebuild",
    false,
    async () => {
      const fresh = path.join(ROOT, "rebuild-clone");
      run("git", ["init", "-q", fresh]);
      const rebuilt = await rebuildSpec({
        root: fresh,
        registry: X.registry,
        spec: PUBLIC_SPEC,
        target: { repository: UP, base: "main" },
        entries: await X.jPub.list(),
        replayOptions: { ...pubOptions, permission: X.jPub.permission },
        revision: REVISION,
        approved: DEFINITIONS,
        pulls: [S.pr],
        github: X.cGithub,
        env: cEnv,
      });
      S.rebuilt = rebuilt;
      step("rebuild", {
        held: rebuilt.held,
        generation: rebuilt.generation,
        heads: rebuilt.heads.map((h) => ({
          repository: h.repository,
          branch: h.branch,
          commit: h.commit,
          pr: h.pr ?? null,
          state: h.state,
        })),
        unresolved: rebuilt.unresolved,
        spend: rebuilt.spend.state,
        upstreamAvoozlBranches: upstreamAvoozl(),
      });
    },
  ],

  // Resume after the rebuild: the spec owner's act.
  [
    "resume",
    false,
    async () => {
      const refused = await outcomeOf(
        (async () => resumeRebuild(S.rebuilt, { by: person }))(),
      );
      const resumed = resumeRebuild(S.rebuilt, {
        by: person,
        acceptUnknownSpend: true,
      });
      step("resume", {
        withoutSpend: refused,
        resumed: { held: resumed.held, stillHeld: resumed.stillHeld },
      });
    },
  ],

  [
    "first-check",
    false,
    async () => {
      const state = await waitFor(
        "the check on the first head",
        checkDone(S.W1),
      );
      step("first-check", {
        head: state.head,
        check: state.check,
        approvedRuns: report.approvedRuns ?? [],
      });
    },
  ],

  // The maintainer's review of the first head.
  [
    "approve-first",
    false,
    async () => {
      await approve(S.W1);
      step("approve-first", { approvedHead: S.W1 });
    },
  ],

  // The base moves; the driver merges it into its working branch (a merge
  // commit, never a rebase) and queues that exact head; the queue pushes it
  // to the fork, which the contributor may write.
  [
    "base-move",
    false,
    async () => {
      gitIn(P.upSeed, ["fetch", "-q", url(UP), "main"]);
      gitIn(P.upSeed, ["merge", "--ff-only", "-q", "FETCH_HEAD"]);
      S.baseMove = commitIn(
        P.upSeed,
        { "BASE.md": "The base moved during P67.\n" },
        "Move the base",
      );
      push(
        P.upSeed,
        { repository: UP, branch: "main", commit: S.baseMove },
        mEnv,
      );
      gitIn(P.code, ["fetch", "-q", url(UP), "main"], cEnv);
      const mergeDir = path.join(ROOT, "merge-base");
      await git(P.code, ["worktree", "add", "-q", "--detach", mergeDir, S.W1]);
      gitIn(
        mergeDir,
        [
          "merge",
          "--no-ff",
          "-q",
          "-m",
          "Merge the base into the working branch",
          S.baseMove,
        ],
        cEnv,
      );
      S.H2 = gitIn(mergeDir, ["rev-parse", "HEAD"], cEnv);
      await git(P.code, [
        "update-ref",
        `refs/heads/${source.branch}`,
        S.H2,
        S.W1,
      ]);
      const check = await runCheckAt({ root: P.code }, S.H2, [
        "node",
        "--test",
      ]);
      const store = X.cWs.store;
      withdrawLanding(store, { ...queue, key: S.queueKey }, "base moved");
      S.queueKey = `${PUBLIC_SPEC}.${short(S.H2)}`;
      enqueueLanding(store, {
        ...queue,
        key: S.queueKey,
        commit: S.H2,
        spec: PUBLIC_SPEC,
        driver: S.driver,
        tasks: TASKS1,
        source,
        pr: S.pr,
      });
      const steps = X.steps();
      const updated = await outcomeOf(
        settled(() => landNext(store, queue, steps)),
      );
      await appendRecord(
        X.jPub,
        {
          op: `checkpoint.work.${short(S.H2)}`,
          kind: "checkpoint",
          spec: PUBLIC_SPEC,
          driver: S.driver,
          refs: [{ ...source, commit: S.H2, pr: S.pr }],
        },
        pubOptions,
      );
      step("base-move", {
        baseMove: S.baseMove,
        refreshedHead: S.H2,
        localCheck: check.exitCode,
        queueAfterUpdate: updated.refused
          ? updated
          : {
              state: updated.value.state,
              waiting: updated.value.entry?.waiting ?? null,
            },
        forkHead: remoteHeads(FORK, cEnv).find(
          (h) => h.branch === source.branch,
        )?.sha,
        upstreamAvoozlBranches: upstreamAvoozl(),
      });
    },
  ],

  [
    "refreshed-check",
    false,
    async () => {
      const state = await waitFor(
        "the check on the refreshed head",
        checkDone(S.H2),
      );
      const stale = await outcomeOf(landNext(X.cWs.store, queue, X.steps()));
      step("refreshed-check", {
        check: state.check,
        reviews: state.reviews,
        afterStaleApproval: stale.refused
          ? stale
          : {
              state: stale.value.state,
              waiting: stale.value.entry?.waiting ?? null,
            },
        upstreamAvoozlBranches: upstreamAvoozl(),
      });
    },
  ],

  [
    "approve-refreshed",
    false,
    async () => {
      await approve(S.H2);
      step("approve-refreshed", { approvedHead: S.H2 });
    },
  ],

  // The contributor's Avoozl cannot merge; neither can the contributor.
  [
    "contributor-cannot-merge",
    false,
    async () => {
      const approved = await waitFor(
        "the approval on the refreshed head",
        (s) =>
          s.reviews.some(
            (r) => r.state === "APPROVED" && r.commit === S.H2 && r.by === M,
          ),
      );
      const ref = qualifiedRef({
        source: { ...source, commit: S.H2 },
        target: { repository: UP, base: "main" },
      });
      const rights = {
        contributor: await outcomeOf(landingRights(cRaw, ref, C)),
        maintainer: await outcomeOf(landingRights(mRaw, ref, M)),
      };
      const landing = await outcomeOf(landNext(X.cWs.store, queue, X.steps()));
      const direct = await outcomeOf(
        cRaw.mergePullRequest(UP, S.pr, { sha: S.H2, method: "merge" }),
      );
      step("contributor-cannot-merge", {
        reviews: approved.reviews,
        rights: {
          contributor: rights.contributor.value ?? rights.contributor,
          maintainer: rights.maintainer.value ?? rights.maintainer,
        },
        contributorLanding: landing.refused
          ? landing
          : {
              state: landing.value.state,
              waiting: landing.value.entry?.waiting ?? null,
            },
        contributorDirectMerge: direct,
      });
    },
  ],

  // The maintainer merges, guarded by the exact approved head.
  [
    "maintainer-merge",
    true,
    async () => {
      const merged = await headGuardedMerge(mRaw, UP, S.pr, S.H2, "merge");
      step("maintainer-merge", { merged, head: S.H2 });
    },
  ],

  // A later tick observes the maintainer's merge with fresh landing steps.
  [
    "observe",
    false,
    async () => {
      const observed = await outcomeOf(landNext(X.cWs.store, queue, X.steps()));
      const pull = await cRaw.pullRequest(UP, S.pr);
      const t1 = taskOutcome(
        journalOutcomes(await replayOf(X.jPub, pubOptions)),
        {
          spec: PUBLIC_SPEC,
          task: T.t1,
          revision: REVISION,
          definition: DEFINITIONS.get(T.t1),
        },
      );
      const reviews = await mRaw.pullRequestReviews(UP, S.pr);
      const runs = await mRaw.checkRuns(UP, S.H2);
      S.mergeCommit = pull.merge_commit_sha;
      step("observe", {
        observed: observed.refused
          ? observed
          : {
              state: observed.value.state,
              observed: observed.value.observed ?? false,
              mergedBy: observed.value.entry?.mergedBy,
              mergeCommit: observed.value.entry?.mergeCommit,
              pr: observed.value.entry?.pr,
            },
        pullRequest: {
          head: pull.head?.sha,
          headRepository: pull.head?.repo?.full_name,
          base: pull.base?.ref,
          mergedBy: pull.merged_by?.login,
          mergeCommit: pull.merge_commit_sha,
        },
        standing: {
          approvals: reviews
            .filter((r) => r.state === "APPROVED")
            .map((r) => ({ by: r.user?.login, commit: r.commit_id })),
          checks: runs
            .filter((r) => r.name === CHECK)
            .map((r) => ({
              name: r.name,
              conclusion: r.conclusion,
              head: r.head_sha,
            })),
        },
        t1Outcome: {
          state: t1.state,
          commit: t1.outcome?.commit ?? null,
          evidence: Boolean(t1.outcome?.evidence),
        },
        upstreamAvoozlBranches: upstreamAvoozl(),
      });
    },
  ],

  // A private-plan reference on every public surface.
  [
    "private-references",
    false,
    async () => {
      const jPub = X.jPub,
        gh = X.cGithub,
        probes = {};
      probes.publicJournalRef = await outcomeOf(
        appendRecord(
          jPub,
          {
            op: "probe.private-ref",
            kind: "checkpoint",
            spec: PUBLIC_SPEC,
            driver: S.driver,
            refs: [{ repository: PRIV, branch: "main", commit: S.privSeed }],
          },
          pubOptions,
        ),
      );
      probes.publicJournalName = await outcomeOf(
        appendRecord(
          jPub,
          {
            op: "probe.private-name",
            kind: "control",
            spec: PRIV_SPEC,
            driver: S.driver,
            controls: [{ flag: "hold", id: "probe" }],
          },
          pubOptions,
        ),
      );
      probes.pullRequestComment = await outcomeOf(
        gh.createIssueComment(UP, S.pr, `Tracks ${PRIV} spec ${PRIV_SPEC}.`),
      );
      probes.publicSpecComment = await outcomeOf(
        gh.createIssueComment(PUB, S.pubIssue, `See ${PRIV}#${S.privIssue}.`),
      );
      probes.pullRequestCreate = await outcomeOf(
        gh.createPullRequest(UP, {
          title: `Land ${PRIV_SPEC}`,
          head: `${ORG}:${source.branch}`,
          head_repo: FORK.split("/")[1],
          base: "main",
          body: "P67 probe.",
        }),
      );
      probes.checkSummary = await outcomeOf(
        gh.createCommitStatus(UP, S.H2, {
          state: "success",
          context: "p67-probe",
          description: `Checked ${PRIV_SPEC}`,
        }),
      );
      // Pushes: Avoozl's own checks before a push. The probe pushes go to a
      // local copy of the fork registered under the fork's name, so a push
      // Avoozl lets through reaches no GitHub repository.
      const probeDir = path.join(ROOT, "probe-push"),
        trap = path.join(ROOT, "probe-trap.git");
      await git(P.code, ["worktree", "add", "-q", "--detach", probeDir, S.H2]);
      run("git", ["clone", "-q", "--bare", url(FORK), trap], { env: cEnv });
      const trapRegistry = sourceRegistry({
        [UP]: { url: url(UP) },
        [FORK]: { url: trap, parent: UP },
      });
      const pushProbe = async (name, branch, message) => {
        gitIn(probeDir, ["checkout", "-q", "--detach", S.H2]);
        const commit = commitIn(
          probeDir,
          { [`probe/${name}.txt`]: "probe\n" },
          message,
        );
        const pushed = await outcomeOf(
          pushHead(P.code, { repository: FORK, branch, commit }, trapRegistry, {
            since: S.H2,
            env: cEnv,
            configFile: CONFIG_FILE,
            store: X.cWs.store,
          }),
        );
        if (!pushed.refused)
          report.stopped.push({
            who: "contributor",
            push: name,
            to: "local copy",
          });
        return pushed;
      };
      probes.commitMessage = await pushProbe(
        "message",
        `avoozl/${PUBLIC_SPEC}/probe-message`,
        `Probe for ${PRIV_SPEC}`,
      );
      probes.refName = await pushProbe(
        "ref",
        `avoozl/${PRIV_SPEC}/probe`,
        "Probe ref",
      );
      // The private side may name the public pull request.
      probes.privateNamesPublic = await outcomeOf(
        appendRecord(
          X.jPriv,
          {
            op: "checkpoint.public-pr",
            kind: "checkpoint",
            spec: PRIV_SPEC,
            driver: S.privDriver,
            refs: [
              { repository: UP, branch: source.branch, commit: S.H2, pr: S.pr },
            ],
          },
          privOptions,
        ),
      );
      const pull = await cRaw.pullRequest(UP, S.pr);
      const publicTexts = [
        ...(await cRaw.listIssueComments(PUB, S.pubIssue)).map((c) => c.body),
        ...(await cRaw.listIssueComments(UP, S.pr)).map((c) => c.body),
        pull.title,
        pull.body,
        ...remoteHeads(FORK, cEnv).map((h) => h.branch),
        ...remoteHeads(UP).map((h) => h.branch),
        ...(
          await cRaw.request("GET", `/repos/${UP}/pulls/${S.pr}/commits`)
        ).map((c) => c.commit?.message),
      ];
      step("private-references", {
        probes,
        publicTextsRead: publicTexts.length,
        publicTextsNamingPrivate: publicTexts.filter((t) =>
          PRIVATE_TERMS.some((p) =>
            String(t ?? "")
              .toLowerCase()
              .includes(p.toLowerCase()),
          ),
        ).length,
      });
    },
  ],

  // Export issues: seed the workspace and preview through the CLI.
  [
    "export-preview",
    false,
    async () => {
      const store = X.cWs.store;
      store.put("plans", {
        id: PUBLIC_SPEC,
        state: "approved",
        title: "P67 scratch spec",
      });
      store.put("receipts", {
        id: `github-parent:plan:${PUBLIC_SPEC}`,
        kind: "github-parent",
        level: "plan",
        parentId: PUBLIC_SPEC,
        planId: PUBLIC_SPEC,
        repository: PUB,
        number: S.pubIssue,
      });
      store.mutate("Seed P67 tasks", (data) => {
        for (const [id, entry] of Object.entries(manifest.tasks))
          data.tasks.push({
            id,
            title: entry.summary,
            scope: "catalog",
            track: "catalog",
            tags: [],
            kind: "leaf",
            status: id === T.t1 ? "accepted" : "planned",
            acceptance: [entry.summary],
            repository: "code",
            planId: PUBLIC_SPEC,
            paths: entry.paths,
          });
        data.edges.push({
          id: `${T.t1}:requires:${T.t2}`,
          from: T.t1,
          to: T.t2,
          kind: "requires",
        });
        data.edges.push({
          id: `${T.t2}:requires:${T.t3}`,
          from: T.t2,
          to: T.t3,
          kind: "requires",
        });
      });
      const preview = cli(
        "spec",
        "export-issues",
        PUBLIC_SPEC,
        "--repository",
        PUB,
      );
      for (const item of preview.create ?? []) assertWritable(item.repository);
      step("export-preview", {
        create: (preview.create ?? []).length,
        reuse: (preview.reuse ?? []).length,
        links: (preview.links ?? []).length,
      });
    },
  ],

  // Export issues, then the retry: each a person's act through the CLI.
  ["export-first", true, async () => exportOnce("first")],
  ["export-retry", true, async () => exportOnce("retry")],

  [
    "export-check",
    false,
    async () => {
      const issues = (await cRaw.listIssues(PUB, { state: "all" })).filter(
        (i) => /<!-- avoozl-export:[0-9a-f]{20} -->/.test(i.body ?? ""),
      );
      let links = 0;
      for (const issue of issues)
        links += (await cRaw.listIssueBlockers(PUB, issue.number)).length;
      step("export-check", {
        issues: issues.length,
        blockedByLinks: links,
        withCrewLabel: issues.filter((i) =>
          (i.labels ?? []).some((l) => (l.name ?? l) === "crew:avoozl"),
        ).length,
        exportedStatusComments: (
          await cRaw.listIssueComments(PUB, S.pubIssue)
        ).filter((c) => /^Status: Exported/.test(c.body ?? "")).length,
      });
    },
  ],

  // A divergent mirror: a private change, then the upstream's changes.
  [
    "mirror-diverge",
    false,
    async () => {
      const policy = mirrorPolicy;
      await mirrorForwardStep(X.mWs.store, X.mGithub, { policy });
      await sleep(5000); // merges after this moment are the mirror's to forward
      const dir = path.join(ROOT, "mirror-private");
      run("git", ["clone", "-q", url(MIRROR), dir], { env: mEnv });
      gitIn(dir, ["config", "user.name", "Avoozl P67"]);
      gitIn(dir, ["config", "user.email", "p67@example.invalid"]);
      const change = commitIn(
        dir,
        { "PRIVATE.md": "A private change in the mirror.\n" },
        "Private change",
      );
      push(
        dir,
        { repository: MIRROR, branch: "p67-private-change", commit: change },
        mEnv,
      );
      const pull = await mRaw.createPullRequest(MIRROR, {
        title: "Private change",
        head: "p67-private-change",
        base: "main",
        body: "P67 private change.",
      });
      await headGuardedMerge(mRaw, MIRROR, pull.number, change, "merge");
      S.privatePr = pull.number;
      const sync = await mirrorSyncStep(X.mWs.store, X.mGithub, {
        policy,
        copy: guardedCopy,
      });
      const imports = await mRaw.listPullRequests(MIRROR, {
        state: "open",
        head: `${ORG}:${trackingBranch("main")}`,
        base: "main",
      });
      S.importPr = imports[0]?.number ?? null;
      step("mirror-diverge", {
        privatePr: S.privatePr,
        sync: { notify: sync.notify.map((n) => n.title), errors: sync.errors },
        importPr: S.importPr,
        upstreamHead: remoteHeads(UP).find((h) => h.branch === "main").sha,
      });
      if (!S.importPr)
        throw Error("No import pull request was opened in the mirror.");
    },
  ],

  // The maintainer reviews and merges the import with a merge commit.
  [
    "import-merge",
    false,
    async () => {
      const pull = await mRaw.pullRequest(MIRROR, S.importPr);
      const merged = await headGuardedMerge(
        mRaw,
        MIRROR,
        S.importPr,
        pull.head.sha,
        "merge",
      );
      step("import-merge", { merged, head: pull.head.sha });
    },
  ],

  [
    "mirror-forward",
    false,
    async () => {
      const policy = mirrorPolicy;
      const merged = await mRaw.pullRequest(MIRROR, S.importPr);
      const commit = await mRaw.commit(MIRROR, merged.merge_commit_sha);
      const sync = await mirrorSyncStep(X.mWs.store, X.mGithub, {
        policy,
        copy: guardedCopy,
      });
      await mirrorForwardStep(X.mWs.store, X.mGithub, { policy });
      const forwards = mirrorForwards(X.mWs.store);
      const upstreamPulls = await mRaw.listPullRequests(UP, { state: "all" });
      step("mirror-forward", {
        importMerge: {
          commit: merged.merge_commit_sha,
          parents: (commit?.parents ?? []).map((p) => p.sha),
        },
        sync: {
          notify: sync.notify.map((n) => n.title),
          errors: sync.errors,
          needsYou: mirrorNeedsYou(X.mWs.store).length,
        },
        forwards: forwards.map((f) => ({
          mirrorPr: f.mirrorPr,
          state: f.state,
        })),
        importForwarded: forwards.some(
          (f) => f.mirrorPr === S.importPr || f.id === merged.merge_commit_sha,
        ),
        upstreamBranches: remoteHeads(UP).map((h) => h.branch),
        upstreamPullsFromMirror: upstreamPulls.filter(
          (p) => p.head?.repo?.full_name === MIRROR,
        ).length,
      });
    },
  ],
];

const mirrorPolicy = {
  repositories: { [UP]: { mirror: { source: UP, mirror: MIRROR } } },
};
const guardedCopy = async (args) => {
  assertWritable(args.mirror);
  return gitCopy(args);
};
// One `avoozl spec export-issues --confirm`, as the contributor.
function exportOnce(which) {
  const result = cli(
    "spec",
    "export-issues",
    PUBLIC_SPEC,
    "--repository",
    PUB,
    "--confirm",
  );
  step(`export-${which}`, {
    created: result.created,
    linked: result.linked,
    state: result.state,
  });
}
// The CLI as the contributor, in the contributor's scratch workspace.
const cli = (...args) =>
  JSON.parse(
    run(process.execPath, [CLI, ...args, "--workspace", X.cWs.dir], {
      env: cEnv,
    }),
  );

// --- Verdict and receipt -------------------------------------------------
const get = (name) => report.steps.find((s) => s.name === name) ?? {};
function expectations() {
  const setup = get("setup"),
    pre = get("pre-pr-fork-head"),
    untrusted = get("untrusted-sources"),
    pr = get("fork-pull-request"),
    rebuild = get("rebuild"),
    move = get("base-move"),
    refreshed = get("refreshed-check"),
    cannot = get("contributor-cannot-merge"),
    observe = get("observe"),
    priv = get("private-references"),
    expFirst = get("export-first"),
    expRetry = get("export-retry"),
    expCheck = get("export-check"),
    fwd = get("mirror-forward"),
    div = get("mirror-diverge");
  const avoozlRefused = (p) => p?.refused === true && !p.byP67Guard;
  return [
    [
      "contributor has no upstream push or merge right",
      setup.roles && !WRITE.includes(setup.roles.contributorOnUpstream),
    ],
    [
      "fork branches work without upstream copies",
      [pre, pr, rebuild, move, refreshed, observe].every(
        (s) =>
          Array.isArray(s.upstreamAvoozlBranches) &&
          !s.upstreamAvoozlBranches.length,
      ),
    ],
    [
      "unfinished checkpoint never integrates",
      pre.integrateUnverified?.refused === true,
    ],
    ["Avoozl opened the pull request from the fork", pr.avoozlOpened === true],
    [
      "PR head is the fork's exact head",
      pr.discovered?.source?.repository === FORK &&
        pr.discovered?.source?.commit === pre.verifiedHead,
    ],
    [
      "rebuild comes back held with exact heads",
      rebuild.held === true &&
        (rebuild.heads ?? []).length > 0 &&
        rebuild.heads.every((h) => h.state === "exact"),
    ],
    [
      "base move requires a refreshed review",
      refreshed.afterStaleApproval?.state === "waiting" &&
        refreshed.afterStaleApproval?.waiting?.reason === "review" &&
        (refreshed.reviews ?? []).some(
          (r) => r.commit === pre.verifiedHead && r.state === "DISMISSED",
        ),
    ],
    [
      "source push rights never permit target merge",
      cannot.rights?.contributor?.checkpoint === true &&
        cannot.rights?.contributor?.land === "observe" &&
        // Without merge rights the driver waits (it cannot read the
        // maintainer's role, so it never counts the review) or declines.
        ["not-landed", "waiting"].includes(cannot.contributorLanding?.state) &&
        cannot.contributorDirectMerge?.refused === true,
    ],
    [
      "exact approved head accepted from the maintainer's merge",
      observe.observed?.state === "landed" &&
        observe.pullRequest?.mergedBy === report.maintainer &&
        observe.pullRequest?.head === move.refreshedHead &&
        observe.t1Outcome?.state === "complete",
    ],
    [
      "untrusted fetches refused",
      untrusted.unregistered?.refused &&
        untrusted.forkNotInRegistry?.refused &&
        untrusted.notAFork?.refused &&
        untrusted.prose?.refsAfter === untrusted.prose?.refsBefore &&
        !untrusted.prose?.namesUnregistered,
    ],
    [
      "every private-plan probe refused by Avoozl",
      priv.probes &&
        [
          "publicJournalRef",
          "publicJournalName",
          "pullRequestComment",
          "publicSpecComment",
          "pullRequestCreate",
          "checkSummary",
          "commitMessage",
          "refName",
        ].every((k) => avoozlRefused(priv.probes[k])),
    ],
    [
      "private side may name the public PR",
      priv.probes?.privateNamesPublic?.refused === false,
    ],
    [
      "no public surface names the private plan",
      priv.publicTextsNamingPrivate === 0 && report.stopped.length === 0,
    ],
    [
      "export retry creates nothing new",
      expFirst.created > 0 &&
        expRetry.created === 0 &&
        expRetry.linked === 0 &&
        expCheck.issues === expFirst.created &&
        expCheck.withCrewLabel === 0 &&
        expCheck.exportedStatusComments === 1,
    ],
    [
      "mirror import by PR, not forwarded upstream",
      div.importPr &&
        fwd.importForwarded === false &&
        fwd.forwards?.length === 1 &&
        fwd.forwards[0].mirrorPr === div.privatePr &&
        fwd.upstreamPullsFromMirror === 0 &&
        !(fwd.upstreamBranches ?? []).some((b) =>
          b.startsWith("avoozl-upstream/"),
        ),
    ],
  ].map(([name, ok]) => ({ name, ok: Boolean(ok) }));
}

function receipt(failure) {
  const checks = expectations(),
    verdict = failure
      ? "failed to finish"
      : checks.every((c) => c.ok)
        ? "pass"
        : "fail";
  return [
    "# P67: fork source and upstream permissions (live receipt draft)",
    "",
    `Run ${S.runId} in the scratch org ${ORG}. Maintainer login: ${report.maintainer}. Contributor login: ${report.contributor}.`,
    "Every fact below was read back from GitHub or git by scripts/proof-p67-live.mjs. A person reviews this draft before it goes to docs/evidence/; it ticks nothing.",
    "",
    `Verdict: **${verdict}**`,
    ...(failure ? ["", `Stopped at: ${failure}`] : []),
    "",
    "| Expected | Result |",
    "|---|---|",
    ...checks.map((c) => `| ${c.name} | ${c.ok ? "yes" : "no"} |`),
    "",
    "## Steps",
    "",
    ...report.steps.flatMap((s) => [
      `### ${s.name}`,
      "",
      "```json",
      JSON.stringify(s, null, 2),
      "```",
      "",
    ]),
    "## GitHub calls by login",
    "",
    "```json",
    JSON.stringify(report.calls, null, 2),
    "```",
    "",
    `Writes the P67 guard stopped: ${report.stopped.length}.`,
    "",
    "Next decision: enable fork heads in ordinary worker pulls, or fix source resolution and permissions before enabling them.",
    "",
  ].join("\n");
}
function writeReceipt(failure) {
  const draft = scrubText(receipt(failure)),
    problems = outputProblems(draft, { secrets, configFile: REAL_CONFIG });
  if (problems.length) {
    say(
      `The receipt draft failed its privacy check (${problems.join(", ")}); it was not written.`,
    );
    return false;
  }
  const dir = path.join(ROOT, "evidence");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "p67-fork-permissions.md"),
    assertClean(draft, { secrets, configFile: REAL_CONFIG }),
  );
  say(
    `Receipt draft: <root>/evidence/p67-fork-permissions.md (${failure ? "stopped" : "finished"}).`,
  );
  return true;
}

// --- Driver ----------------------------------------------------------------
const command = (tail) =>
  `cd ${REPO}; and node scripts/proof-p67-live.mjs --root ${ROOT} --contributor-gh-config ${CONTRIBUTOR_GH} ${tail}`;
// Stops for the owner: their exact fish command. Paths are printed as they
// are, for the owner's own terminal.
function ownerStep(stage, why) {
  save();
  console.log(`OWNER STEP ${stage}: ${why}`);
  console.log(`Run in your own terminal (fish):`);
  console.log(`  ${command(`owner ${stage}`)}`);
  console.log(
    `Then continue (the agent may run it, or you, which also runs later person stages inline):`,
  );
  console.log(`  ${command("continue")}`);
  return 3;
}
const finishStage = (name) => {
  S.done.push(name);
  S.known = [...known];
  save();
};

async function drive() {
  const next = () => STAGES.find(([stage]) => !S.done.includes(stage));
  if (MODE === "owner") {
    const name = positionals[1];
    if (name === "approve-runs") {
      const state = await pollPull(S.pr);
      await approveRuns(state.waitingRuns);
      S.known = [...known];
      save();
      say(`Approved ${state.waitingRuns.length} held fork run(s).`);
      return 0;
    }
    const stage = next();
    if (!stage || stage[0] !== name || !stage[1]) {
      console.error(
        `The next stage is ${stage?.[0] ?? "none"}, not the owner stage ${name}.`,
      );
      return 1;
    }
    say(`stage ${name}`);
    await stage[2]();
    finishStage(name);
    return 0;
  }
  for (let stage = next(); stage; stage = next()) {
    const [name, personal, fn] = stage;
    if (personal && AGENT)
      return ownerStep(
        name,
        "a person's act: the maintainer's merge, or avoozl spec export-issues --confirm.",
      );
    say(`stage ${name}`);
    try {
      await fn();
    } catch (error) {
      if (error.ownerStage) return ownerStep(error.ownerStage, error.message);
      throw error;
    }
    finishStage(name);
  }
  S.finished = true;
  save();
  return writeReceipt(null) ? 0 : 1;
}

let code;
try {
  code = await drive();
} catch (error) {
  const failure = scrubText(String(error.message)).slice(0, 400);
  say(`P67 stopped: ${failure}`);
  S.failure = failure;
  S.finished = true; // a failed proof is not retried on the same root
  save();
  writeReceipt(failure);
  code = 1;
}
process.exit(code);
