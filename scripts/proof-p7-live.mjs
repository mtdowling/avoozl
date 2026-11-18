#!/usr/bin/env node
// Proof P7 (R10, R11, R27.1; design §4.4): configurable GitHub label intake
// on a public repository, live. One `deliver` rule (two labels all, a pause
// label none, an assignee) and one `respond` rule run through the tick's
// intakeStep (syncGitHubIssues) on a scratch workspace. Labels go on in eight
// combinations, two of them from a second account that the policy does not
// allow, then one matched issue's body is edited. Every Expected line is read
// back from GitHub and from the workspace database.
//
// Nothing here touches a real workspace or Kiro Crew home: --root must be in
// the temporary folder, KIROCREW_HOME must name a test harness home there,
// and every GitHub request Avoozl makes goes through a guard that allows only
// the one scratch repository. The second account is used only through its
// own GH_CONFIG_DIR, one command at a time; its token is never read here.
//
//   env KIROCREW_HOME=<harness>/home node scripts/proof-p7-live.mjs \
//     --root DIR [--repo avoozl-scratch/p07-label-intake] preflight|setup|run|respond
//
// `preflight` reads only. `setup` makes the checkout and the workspace.
// `run` writes the eight issues and runs the ticks (part A). `respond` reads
// back the responder session's reply after the test harness ran (part B).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CLI = path.join(REPO_DIR, "cli.mjs");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    repo: { type: "string", default: "avoozl-scratch/p07-label-intake" },
    second: { type: "string", default: "avoozlbot" },
    "second-config": {
      type: "string",
      default: path.join(os.homedir(), ".config", "gh-avoozl-test"),
    },
  },
});
const phase = positionals[0];
if (!values.root || !["preflight", "setup", "run", "respond"].includes(phase)) {
  console.error(
    "Usage: env KIROCREW_HOME=<harness>/home node scripts/proof-p7-live.mjs --root DIR preflight|setup|run|respond",
  );
  process.exit(2);
}

// --- Guards ------------------------------------------------------------
// /tmp only: a chat's os.tmpdir() can sit under ~/.kiro.
const temp = ["/tmp"].flatMap((dir) => [
  path.resolve(dir) + path.sep,
  fs.realpathSync(dir) + path.sep,
]);
const inTemp = (dir) =>
  temp.some((prefix) => (path.resolve(dir) + path.sep).startsWith(prefix));
const ROOT = path.resolve(values.root);
if (!inTemp(ROOT)) {
  console.error("The scratch root must be in the temporary folder.");
  process.exit(2);
}
const CREW_HOME = process.env.KIROCREW_HOME;
if (!CREW_HOME || !inTemp(CREW_HOME)) {
  console.error(
    "Set KIROCREW_HOME to a test harness home in the temporary folder; never the real ~/.kiro/crew.",
  );
  process.exit(2);
}
const REPO = values.repo;
if (!/^avoozl-scratch\/p07-[a-z0-9-]+$/.test(REPO)) {
  console.error("Only an avoozl-scratch/p07-* repository may be used.");
  process.exit(2);
}
const SECOND = values.second;

const CODE = path.join(ROOT, "code");
const WS = path.join(ROOT, "ws");
const OUT = path.join(ROOT, "report.json");
fs.mkdirSync(ROOT, { recursive: true });
const report = fs.existsSync(OUT)
  ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : { repo: REPO, steps: [], writes: [] };
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
const step = (name, facts) => {
  report.steps.push({ phase, name, at: new Date().toISOString(), ...facts });
  console.log(`- ${name}: ${JSON.stringify(facts).slice(0, 600)}`);
  save();
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sh = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...options }).trim();
// The owner's login (the default gh config) and the second account's (its
// own GH_CONFIG_DIR, for that one command only).
const gh = (...args) => sh("gh", args);
const ghJson = (...args) => JSON.parse(gh(...args) || "null");
const ghSecond = (...args) =>
  sh("gh", args, {
    env: { ...process.env, GH_CONFIG_DIR: values["second-config"] },
  });
const avoozl = (...args) =>
  sh(process.execPath, [CLI, ...args], {
    env: { ...process.env, KIROCREW_HOME: CREW_HOME },
  });

// --- Policy ------------------------------------------------------------
const LABELS = {
  build: "p7:build",
  go: "p7:go",
  ask: "p7:ask",
  paused: "p7:paused",
  managed: "p7:managed",
  ready: "p7:ready",
  responding: "p7:responding",
};
const OWNER_LOGIN = "mtdowling";
const repositoryPolicy = (overrides = {}) => ({
  baseBranch: "main",
  allowedActors: [OWNER_LOGIN],
  minimumPermission: "write",
  managedLabels: {
    managed: LABELS.managed,
    ready: LABELS.ready,
    responding: LABELS.responding,
  },
  rules: [
    {
      id: "build",
      action: "deliver",
      match: `label:${LABELS.build} label:${LABELS.go} -label:${LABELS.paused} assignee:${OWNER_LOGIN}`,
    },
    {
      id: "answer",
      action: "respond",
      match: `label:${LABELS.ask} -label:${LABELS.paused}`,
    },
  ],
  ...overrides,
});
const policyFile = (repository) => ({
  version: 1,
  github: { repositories: { [REPO]: repository } },
});
const TRIGGERS = [LABELS.build, LABELS.go, LABELS.ask];
const MANAGED = [LABELS.managed, LABELS.ready, LABELS.responding];

// The eight combinations: labels, assignee, and who adds the labels. The
// assignee is set at create, by the owner, before any label goes on, so
// the newest event that makes a rule true is the label event.
const CASES = [
  {
    key: "c1",
    labels: ["build", "go"],
    assign: true,
    by: "owner",
    expect: "deliver",
  },
  { key: "c2", labels: ["build"], assign: true, by: "owner", expect: "none" },
  {
    key: "c3",
    labels: ["build", "go", "paused"],
    assign: true,
    by: "owner",
    expect: "none",
  },
  {
    key: "c4",
    labels: ["build", "go"],
    assign: false,
    by: "owner",
    expect: "none",
  },
  {
    key: "c5",
    labels: ["build", "go"],
    assign: true,
    by: "second",
    expect: "ignored",
  },
  { key: "c6", labels: ["ask"], assign: false, by: "owner", expect: "respond" },
  {
    key: "c7",
    labels: ["ask"],
    assign: false,
    by: "second",
    expect: "ignored",
  },
  {
    key: "c8",
    labels: ["ask", "paused"],
    assign: false,
    by: "owner",
    expect: "none",
  },
];

// --- Avoozl's GitHub client, guarded and logged -------------------------
async function avoozlClient() {
  const { GitHubClient } = await import("../src/app/github.mjs");
  const token = gh("auth", "token"),
    prefix = `/repos/${REPO.toLowerCase()}`;
  const guarded = async (input, init = {}) => {
    const u = new URL(String(input)),
      method = (init.method || "GET").toUpperCase(),
      p = u.pathname.toLowerCase(),
      search =
        p === "/search/issues" &&
        (u.searchParams.get("q") || "")
          .toLowerCase()
          .includes(`repo:${REPO.toLowerCase()} `);
    const ok =
      p === prefix ||
      p.startsWith(prefix + "/") ||
      (method === "GET" && (p === "/user" || p === "/rate_limit" || search)) ||
      (method === "POST" && p === "/graphql");
    if (!ok) throw Error(`P7 guard refused ${method} ${u.pathname}`);
    if (method !== "GET") {
      let body = null;
      try {
        body = init.body ? JSON.parse(String(init.body)) : null;
      } catch {}
      const mutation =
        p === "/graphql" && /^\s*mutation/.test(body?.query || "");
      if (p !== "/graphql" || mutation)
        report.writes.push({
          phase,
          at: new Date().toISOString(),
          method,
          path: u.pathname,
          body,
        });
      save();
    }
    return fetch(input, init);
  };
  return new GitHubClient({ token, fetch: guarded });
}

async function openWorkspace(github) {
  const { Store } = await import("../src/app/store.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const { workspaceConfig } = await import("../src/app/config.mjs");
  const { machineAvoozlPaths } = await import("../src/app/host-config.mjs");
  const target = workspaceConfig({
    workspace: WS,
    env: { ...process.env, AVOOZL_WORKSPACE: WS },
  });
  const store = new Store(target.dbPath);
  const ops = new Operations(store, {
    operator: target.operator,
    workspaceRoot: target.workspaceRoot,
    plansRoot: target.plansRoot,
    configDirectory: machineAvoozlPaths().configDirectory,
    github,
  });
  return { store, ops };
}

// One tick as the script cron runs it (cron: true), so intakeStep and the
// respond step run. The intents it returns are recorded, not carried out.
async function tick(name) {
  const github = await avoozlClient(),
    { store, ops } = await openWorkspace(github);
  try {
    const result = await ops.execute("workspace.tick", { cron: true });
    const sync = store.getMeta("githubSync");
    const rows = store
      .list("github_issues")
      .filter((r) => r.repository === REPO)
      .map((r) => ({
        number: r.number,
        state: r.state,
        rule: r.rule,
        action: r.action,
        actor: r.labelActor,
        reason: r.reason,
      }))
      .sort((a, b) => a.number - b.number);
    const tasks = store
      .read()
      .tasks.filter((t) => t.github?.repository === REPO)
      .map((t) => ({
        id: t.id,
        number: t.github.number,
        dispatch: t.dispatch,
      }));
    const responses = store.list("github_responses").map((r) => ({
      id: r.id,
      number: r.number,
      state: r.state,
      label: r.label,
      labelRemovedAt: r.labelRemovedAt || null,
    }));
    const intents = JSON.stringify(result || {});
    step(name, {
      sync: sync && {
        authorized: sync.authorized.map((r) => r.number),
        matched: sync.matched.map((r) => r.number),
        quarantined: sync.quarantined.map((r) => r.number),
        paused: sync.paused.map((r) => r.number),
        ignored: sync.ignored.map((r) => ({
          number: r.number,
          matches: r.matches.map((m) => ({
            rule: m.rule,
            actor: m.actor,
            allowed: m.allowed,
            reason: m.reason,
          })),
        })),
        withdrawn: sync.withdrawn.map((r) => r.number),
        unchecked: sync.unchecked,
      },
      rows,
      tasks,
      responses,
      notify: (result?.notify || []).map((n) => `${n.channel}: ${n.title}`),
      responderIntents: (intents.match(/avoozl-responder/g) || []).length,
    });
    return { rows, tasks, responses, sync };
  } finally {
    store.close();
  }
}

// One GraphQL read of every proof issue: labels, assignees, comments, and
// the label events with their actors.
function readIssues(numbers) {
  const [owner, name] = REPO.split("/");
  const fields = numbers
    .map(
      (n) => `i${n}: issue(number: ${n}) { number title body state
        labels(first: 20) { nodes { name } }
        assignees(first: 5) { nodes { login } }
        comments(first: 20) { nodes { author { login } body createdAt } }
        timelineItems(first: 50, itemTypes: [LABELED_EVENT, UNLABELED_EVENT]) {
          nodes { __typename
            ... on LabeledEvent { actor { login } label { name } createdAt }
            ... on UnlabeledEvent { actor { login } label { name } createdAt } } } }`,
    )
    .join("\n");
  const data = ghJson(
    "api",
    "graphql",
    "-f",
    `query=query { repository(owner: "${owner}", name: "${name}") { ${fields} } }`,
  ).data.repository;
  return Object.fromEntries(
    numbers.map((n) => {
      const issue = data[`i${n}`];
      return [
        n,
        {
          number: n,
          state: issue.state,
          body: issue.body,
          labels: issue.labels.nodes.map((l) => l.name).sort(),
          assignees: issue.assignees.nodes.map((a) => a.login),
          comments: issue.comments.nodes.map((c) => ({
            author: c.author?.login,
            body: c.body,
            at: c.createdAt,
          })),
          labelEvents: issue.timelineItems.nodes.map((e) => ({
            event: e.__typename === "LabeledEvent" ? "labeled" : "unlabeled",
            actor: e.actor?.login,
            label: e.label?.name,
            at: e.createdAt,
          })),
        },
      ];
    }),
  );
}

// --- Phases ------------------------------------------------------------
async function preflight() {
  const owner = gh("api", "user", "--jq", ".login"),
    second = ghSecond("api", "user", "--jq", ".login"),
    repo = ghJson("api", `repos/${REPO}`),
    role = ghJson("api", `repos/${REPO}/collaborators/${SECOND}/permission`),
    labels = ghJson("api", `repos/${REPO}/labels?per_page=100`).map(
      (l) => l.name,
    ),
    { readGitHubPolicy } = await import("../src/app/github-policy.mjs");
  // The policy validates, and one whose trigger is a managed label does not.
  const check = (repository) => {
    const dir = fs.mkdtempSync(path.join(ROOT, "policy-"));
    fs.writeFileSync(
      path.join(dir, ".avoozl.json"),
      JSON.stringify(policyFile(repository)),
    );
    try {
      return { ok: true, policy: readGitHubPolicy(dir).repositories[REPO] };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };
  const good = check(repositoryPolicy()),
    overlap = check(
      repositoryPolicy({
        managedLabels: {
          managed: LABELS.managed,
          ready: LABELS.go,
          responding: LABELS.responding,
        },
      }),
    ),
    overlapResponding = check(
      repositoryPolicy({
        managedLabels: {
          managed: LABELS.managed,
          ready: LABELS.ready,
          responding: LABELS.ask,
        },
      }),
    );
  const facts = {
    owner,
    second,
    repo: {
      fullName: repo.full_name,
      visibility: repo.visibility,
      hasIssues: repo.has_issues,
      defaultBranch: repo.default_branch,
    },
    secondRole: role.role_name,
    labels: labels.filter((l) => l.startsWith("p7:")).sort(),
    policy: good.ok
      ? good.policy.rules.map((r) => ({
          id: r.id,
          action: r.action,
          labelsAll: r.labelsAll,
          labelsNone: r.labelsNone,
          assignee: r.assignee,
        }))
      : good.error,
    allowedActors: good.policy?.allowedActors,
    overlapRefused: !overlap.ok && overlap.error,
    overlapRespondingRefused: !overlapResponding.ok && overlapResponding.error,
    crewHome: CREW_HOME,
  };
  step("preflight", facts);
  const problems = [
    owner !== OWNER_LOGIN && "default gh login is not mtdowling",
    second !== SECOND && `second login is not ${SECOND}`,
    repo.visibility !== "public" && "repository is not public",
    role.role_name !== "triage" && `${SECOND} does not have triage`,
    !good.ok && `policy refused: ${good.error}`,
    overlap.ok && "an overlapping policy was accepted",
    overlapResponding.ok && "an overlapping responding label was accepted",
    good.policy?.allowedActors?.includes(SECOND) && "second is allowed",
  ].filter(Boolean);
  if (problems.length) throw Error("Preflight failed: " + problems.join("; "));
}

async function setup() {
  fs.mkdirSync(ROOT, { recursive: true });
  if (!fs.existsSync(CODE))
    sh("git", ["clone", "-q", `https://github.com/${REPO}.git`, CODE]);
  if (!fs.existsSync(path.join(WS, "workspace.sqlite")))
    avoozl("init", WS, "--name", "p7");
  const registered = avoozl("workspace", "list");
  if (!registered.includes(WS)) avoozl("workspace", "add", "p7", "--root", WS);
  avoozl("workspace", "set-default", "p7");
  fs.writeFileSync(
    path.join(WS, ".avoozl.json"),
    JSON.stringify(policyFile(repositoryPolicy()), null, 2) + "\n",
  );
  avoozl(
    "project",
    "configure",
    "code",
    "--root",
    CODE,
    "--branch",
    "main",
    "--workspace",
    WS,
    "--as-person",
  );
  avoozl(
    "github",
    "configure",
    REPO,
    "--project",
    "code",
    "--label",
    LABELS.ready,
    "--managed-label",
    LABELS.managed,
    "--allowed-actors",
    OWNER_LOGIN,
    "--workspace",
    WS,
    "--as-person",
  );
  step("setup", {
    code: CODE,
    workspace: WS,
    catalog: avoozl("workspace", "list").slice(0, 400),
  });
}

async function run() {
  const created = [];
  for (const c of CASES) {
    const args = [
      "issue",
      "create",
      "-R",
      REPO,
      "--title",
      `P7 ${c.key}: ${c.labels.join("+")}${c.assign ? " assigned" : ""} by ${c.by}`,
      "--body",
      `Scratch issue for proof P7, case ${c.key}. Expected: ${c.expect}.`,
    ];
    if (c.assign) args.push("--assignee", OWNER_LOGIN);
    const url = gh(...args),
      number = Number(url.split("/").pop());
    created.push({ ...c, number });
  }
  report.cases = created;
  save();
  for (const c of created) {
    const add = c.labels.map((k) => LABELS[k]).join(",");
    if (c.by === "second")
      ghSecond(
        "issue",
        "edit",
        String(c.number),
        "-R",
        REPO,
        "--add-label",
        add,
      );
    else gh("issue", "edit", String(c.number), "-R", REPO, "--add-label", add);
  }
  step(
    "issues",
    created.map(({ key, number, labels, by }) => ({ key, number, labels, by })),
  );

  // Avoozl's intake reads GitHub search; wait (at most 5 tries) until the
  // index shows every issue that carries a rule's first label.
  const q = `repo:${REPO} is:issue is:open label:${LABELS.build},${LABELS.ask}`;
  let seen = 0;
  for (let i = 0; i < 5 && seen < CASES.length; i += 1) {
    await sleep(20000);
    seen = ghJson(
      "api",
      "-X",
      "GET",
      "search/issues",
      "-f",
      `q=${q}`,
    ).total_count;
  }
  step("search index", { query: q, seen });

  const writesBefore = report.writes.length;
  const first = await tick("tick 1 (labels)");
  const numbers = created.map((c) => c.number);
  const afterFirst = readIssues(numbers);
  step("github after tick 1", { issues: Object.values(afterFirst) });

  // Edit the matched deliver issue's body, then tick again.
  const target = created.find((c) => c.expect === "deliver");
  gh(
    "issue",
    "edit",
    String(target.number),
    "-R",
    REPO,
    "--body",
    `Scratch issue for proof P7, case ${target.key}. Edited after the trigger: build something else.`,
  );
  await sleep(20000);
  const second = await tick("tick 2 (body edited)");
  const afterSecond = readIssues(numbers);
  step("github after tick 2", { issues: Object.values(afterSecond) });

  // --- Expected lines ---
  const rowOf = (rows, n) => rows.find((r) => r.number === n);
  const verdicts = [];
  const expect = (line, ok, detail) => {
    verdicts.push({ line, ok: Boolean(ok), detail });
  };
  for (const c of created) {
    const row = rowOf(first.rows, c.number),
      ignored = first.sync.ignored.find((r) => r.number === c.number);
    if (c.expect === "deliver")
      expect(
        `${c.key} #${c.number} matches deliver`,
        row?.state === "authorized" && row.rule === "build",
        row,
      );
    else if (c.expect === "respond")
      expect(
        `${c.key} #${c.number} matches respond`,
        row?.state === "authorized" && row.rule === "answer",
        row,
      );
    else if (c.expect === "ignored")
      expect(
        `${c.key} #${c.number} from ${SECOND} causes no match`,
        !row &&
          ignored &&
          ignored.matches.every((m) => !m.allowed && m.actor === SECOND),
        { row: row || null, ignored },
      );
    else
      expect(`${c.key} #${c.number} matches no rule`, !row && !ignored, {
        row: row || null,
        ignored: ignored || null,
      });
  }
  const writes = report.writes.slice(writesBefore);
  const writeNumbers = (w) =>
    Number((w.path.match(/\/issues\/(\d+)/) || [])[1]);
  for (const c of created.filter(
    (c) => c.expect === "ignored" || c.expect === "none",
  )) {
    const own = writes.filter((w) => writeNumbers(w) === c.number),
      gh1 = afterSecond[c.number],
      foreign = gh1.labelEvents.filter(
        (e) =>
          !c.labels.map((k) => LABELS[k]).includes(e.label) ||
          e.event !== "labeled",
      );
    expect(
      `${c.key} #${c.number}: Avoozl wrote nothing`,
      !own.length && !gh1.comments.length && !foreign.length,
      { writes: own, comments: gh1.comments.length, otherLabelEvents: foreign },
    );
  }
  const quarantined = rowOf(second.rows, target.number);
  expect(
    `${target.key} #${target.number} is quarantined after its body edit`,
    quarantined?.state === "quarantined" &&
      second.tasks.find((t) => t.number === target.number)?.dispatch?.ready ===
        false,
    {
      row: quarantined,
      task: second.tasks.find((t) => t.number === target.number),
    },
  );
  const labelWrites = writes.flatMap((w) =>
    w.method === "DELETE" && /\/labels\//.test(w.path)
      ? [decodeURIComponent(w.path.split("/labels/")[1])]
      : /\/labels$/.test(w.path)
        ? w.body?.labels || []
        : [],
  );
  expect(
    "Avoozl added or removed only managed labels, never a trigger label",
    labelWrites.every((l) => MANAGED.includes(l)) &&
      !labelWrites.some((l) => TRIGGERS.includes(l)),
    { labelWrites },
  );
  report.verdicts = verdicts;
  report.partA = verdicts.every((v) => v.ok) ? "pass" : "fail";
  save();
  for (const v of verdicts) console.log(`${v.ok ? "PASS" : "FAIL"} ${v.line}`);
  console.log(`part A: ${report.partA}; ${writes.length} Avoozl writes`);
}

// Part B, after the test harness's tick dispatched the responder: one
// GraphQL read of the respond issue and the workspace's response row.
async function respond() {
  const c = report.cases.find((x) => x.expect === "respond");
  const issue = readIssues([c.number])[c.number];
  const { Store } = await import("../src/app/store.mjs");
  const store = new Store(path.join(WS, "workspace.sqlite"));
  let responses, bindings;
  try {
    responses = store.list("github_responses");
    const { listSessionBindings } = await import(
      "../src/app/session-bindings.mjs"
    );
    bindings = listSessionBindings(store)
      .filter((b) => b.role === "responder")
      .map((b) => ({ slot: b.slot, status: b.status, taskId: b.taskId }));
  } finally {
    store.close();
  }
  const response = responses.find((r) => r.number === c.number);
  const ok =
    response?.state === "replied" &&
    issue.comments.length === 1 &&
    !issue.labels.includes(LABELS.responding) &&
    issue.labelEvents.some(
      (e) => e.event === "labeled" && e.label === LABELS.responding,
    ) &&
    issue.labelEvents.some(
      (e) => e.event === "unlabeled" && e.label === LABELS.responding,
    );
  step("respond", { issue, response, bindings, ok });
  report.partB = ok ? "pass" : "fail";
  save();
  console.log(`part B: ${report.partB}`);
}

await { preflight, setup, run, respond }[phase]();
