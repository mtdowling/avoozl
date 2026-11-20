#!/usr/bin/env node
// Proof pk-p1 (plugin-checks): a slow outside check on a scratch repository.
// Everything runs on this machine, in a temporary folder: an isolated
// Avoozl workspace, a scratch repository acme/api with a bare remote, a fake
// review service on 127.0.0.1 that answers each request after 60 seconds
// and fails any change to schema/, and a fake stdio MCP server whose review
// reports running for 90 seconds. The worker that commits each task and the
// model that answers each decide call are scripted stand-ins; everything
// else (the tick, the check runner, the filters, the cache, the stages, the
// MCP client) is Avoozl's own code. Prints one JSON line per observation
// and a summary; exits 1 on any failed expectation.
//
//   node scripts/proofs/pk-p1.mjs [--keep] [--fast]
//
// --fast shortens the service's 60 and 90 second waits (for a dry run only;
// the receipt's run uses the real waits).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2),
  keep = args.includes("--keep"),
  fast = args.includes("--fast"),
  SERVICE_MS = fast ? 3000 : 60_000,
  REVIEW_MS = fast ? 4000 : 90_000;
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pk-p1-")));
process.env.XDG_CONFIG_HOME = path.join(root, "config");
process.env.XDG_STATE_HOME = path.join(root, "state");
delete process.env.KIROCREW_HOME;
const src = (file) => path.join(repoRoot, "src", "app", file);
const imp = (file) => import(src(file));

const results = [];
const observe = (leg, what, ok, detail = {}) => {
  results.push({ leg, what, ok });
  console.log(JSON.stringify({ leg, what, ok, ...detail }));
};
const git = (cwd, ...a) =>
  execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- The fake review service on 127.0.0.1 ------------------------------
const service = { requests: 0 };
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    service.requests++;
    const { files = [] } = JSON.parse(body || "{}");
    setTimeout(() => {
      const differs = files.some((f) => f.startsWith("schema/"));
      res.end(JSON.stringify({ verdict: differs ? "differs" : "same" }));
    }, SERVICE_MS);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

// ---- The workspace and the scratch repository ---------------------------
const { Store } = await imp("store/store.mjs");
const { Operations } = await imp("api/operations.mjs");
const { snapshot } = await imp("test/fixtures.mjs");
const plugins = await imp("plugins/plugins.mjs");
const pluginChecks = await imp("plugins/plugin-checks.mjs");
const { runPluginCheck } = await imp("plugins/plugin-check-run.mjs");
const { checkRuns, drainCheckRuns, runChecksAt } = await imp(
  "delivery/check-runs.mjs",
);
const { queuePhaseChecks } = await imp("plugins/check-stages.mjs");
const { localCheckResult } = await imp("plugins/check-stages.mjs");

const bare = path.join(root, "remote", "api.git"),
  checkout = path.join(root, "api");
fs.mkdirSync(path.dirname(bare), { recursive: true });
git(root, "init", "-q", "--bare", "-b", "main", bare);
fs.mkdirSync(path.join(checkout, "src", "api"), { recursive: true });
fs.mkdirSync(path.join(checkout, "schema"), { recursive: true });
fs.writeFileSync(path.join(checkout, "README.md"), "acme api\n");
fs.writeFileSync(
  path.join(checkout, "src", "api", "handler.js"),
  "export const fields = ['id', 'name'];\n",
);
fs.writeFileSync(
  path.join(checkout, "src", "api", "helper.js"),
  "export const helper = (x) => x;\n",
);
fs.writeFileSync(path.join(checkout, "schema", "api.json"), '{"fields": 2}\n');
git(checkout, "init", "-q", "-b", "main");
git(checkout, "config", "user.name", "Proof");
git(checkout, "config", "user.email", "proof@example.invalid");
git(checkout, "add", ".");
git(checkout, "commit", "-qm", "Start");
git(checkout, "remote", "add", "origin", bare);
git(checkout, "push", "-q", "origin", "main");

const leaf = (id, title, phase) => ({
  id,
  title,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "api",
  planId: "api-spec",
  summary: title,
  ...(phase ? { phase } : {}),
});
const tasks = [
  leaf("t1", "Fix a typo in the README"),
  leaf("t2", "Refactor the internal helper in src/api"),
  leaf("t3", "Add the email field to the response"),
  leaf("t4", "Change the published schema"),
  leaf("t5", "Phase task: add the age field", { id: "p2", title: "Phase 2" }),
  leaf("t6", "Phase task: change the schema", { id: "p2", title: "Phase 2" }),
  leaf("t7", "MCP leg: add the phone field"),
  leaf("t8", "MCP leg: change the schema again"),
];
const storeFile = path.join(root, "workspace.sqlite"),
  store = new Store(storeFile);
store.initialize({ ...snapshot(), tasks, edges: [] });
store.put("plans", { id: "api-spec", spec: "api-spec", state: "approved" });
store.put("repositories", {
  id: "api",
  root: checkout,
  baseBranch: "main",
  github: "acme/api",
  checks: [["git", "status"]],
  // The fake service is on 127.0.0.1; the check's own network: true opens it.
  isolation: { run: "sandbox" },
});
fs.writeFileSync(
  path.join(root, ".avoozl.json"),
  JSON.stringify({
    version: 1,
    lanes: { local: 4 },
    delivery: { retries: 1 },
    github: {
      mode: "single-repo",
      repositories: { "acme/api": { requiredChecks: ["parity"] } },
    },
  }),
);
const settingsFile = path.join(root, "machine", "plugins.json"),
  options = { workspaceRoot: root, settingsFile };
const ops = new Operations(store, {
  workspaceRoot: root,
  pluginSettingsFile: settingsFile,
});

// ---- The local-folder plugin acme-checks --------------------------------
const folder = path.join(root, "acme-checks");
fs.mkdirSync(path.join(folder, "bin"), { recursive: true });
fs.mkdirSync(path.join(folder, "prompts"), { recursive: true });
const parityScript = `// Asks the review service about the change and fails when it differs.
import { execFileSync } from "node:child_process";
const arg = (n) => process.argv[process.argv.indexOf(n) + 1];
const files = execFileSync("git", ["diff", "--name-only", arg("--from"), arg("--to")], { encoding: "utf8" }).split("\\n").filter(Boolean);
const reply = await fetch("http://127.0.0.1:" + process.env.PARITY_PORT + "/review", { method: "POST", body: JSON.stringify({ repo: arg("--repo"), files }) });
const { verdict } = await reply.json();
console.log("parity: " + verdict);
process.exit(verdict === "same" ? 0 : 1);
`;
fs.writeFileSync(path.join(folder, "bin", "parity.mjs"), parityScript);
fs.writeFileSync(
  path.join(folder, "prompts", "parity.md"),
  "Answer whether this change can alter the public API of the service:\nrequest or response shapes, error codes, or the published schema.\nChanges only to tests, docs, comments or internal helpers do not.\n",
);
fs.writeFileSync(
  path.join(folder, "ask.md"),
  "Does this change alter how the API behaves for a caller?\n",
);
const manifest = (stage, { review = false } = {}) => ({
  id: "acme-checks",
  version: "1.4.0",
  contract: 1,
  provides: ["checks"],
  ...(review
    ? { servers: { review: { about: "The acme review service" } } }
    : {}),
  checks: {
    parity: {
      repos: ["acme/*"],
      paths: ["src/api/**", "schema/**"],
      run: [
        "bin/parity.mjs",
        "--repo",
        "{repo}",
        "--from",
        "{base}",
        "--to",
        "{commit}",
      ],
      env: ["PARITY_PORT"],
      network: true,
      timeout: 600,
      decide: "prompts/parity.md",
      decideAt: ["approve", "diff"],
      stage,
    },
    ...(review
      ? {
          "parity-review": {
            repos: ["acme/*"],
            paths: ["src/api/**", "schema/**"],
            timeout: 900,
            stage: "task",
            mcp: {
              server: "review",
              start: {
                tool: "create_review",
                args: {
                  repo: "{repo}",
                  diff: "{diff_path}",
                  question: "{file:ask.md}",
                },
                id: "$.review.id",
              },
              poll: {
                tool: "get_review",
                args: { id: "{id}" },
                everySeconds: 10,
                until: { path: "$.state", in: ["done", "error"] },
              },
              result: { path: "$.verdict", pass: ["same"], text: "$.summary" },
            },
          },
        }
      : {}),
  },
});
const writeManifest = (m) =>
  fs.writeFileSync(
    path.join(folder, "avoozl-plugin.json"),
    JSON.stringify(m, null, 2),
  );
writeManifest(manifest("task"));
plugins.writePluginSettings(settingsFile, {
  plugins: [{ id: "acme-checks", path: folder, contract: 1 }],
  approvals: {},
  disabled: [],
  pins: {},
});
const approve = () => {
  const p = plugins.inspectPlugins(options).find((x) => x.id === "acme-checks");
  return plugins.approvePlugin(
    options,
    { id: p.id, version: p.version, hash: p.hash },
    "proof",
  );
};
observe("setup", "plugin approved in Settings", approve().state === "approved");
process.env.PARITY_PORT = String(port);

// ---- Scripted stand-ins: a worker and the decide model -------------------
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const bind = (taskId, slot, role, attempt = 1) =>
  ops.execute("session.bind", {
    taskId,
    slot,
    role,
    attempt,
    source: "tick",
    title: `avoozl:${taskId} ${role}`,
  });
let slots = 0;
async function work(taskId, files) {
  const slot = `w-${taskId}-${++slots}`,
    attempt = (store.get("task_deliveries", taskId)?.attempts?.length ?? 0) + 1;
  await bind(taskId, slot, "worker", attempt);
  const { path: worktree } = await ops.execute("worktree.prepare", { taskId });
  for (const [file, text] of Object.entries(files))
    fs.writeFileSync(path.join(worktree, file), text);
  git(worktree, "add", ".");
  git(worktree, "commit", "-qm", `Work ${taskId}`);
  const commit = git(worktree, "rev-parse", "HEAD");
  await ops.execute(
    "session.report",
    { taskId, kind: "done", commit },
    undefined,
    as(slot),
  );
  return { slot, commit };
}
// The stand-in model: reads the prompt's question against the input as a
// reader would. A response field or the schema is the public API; an
// internal helper or docs are not.
const answerFor = (record) =>
  record.at === "approve"
    ? {
        needed: false,
        reason: "The task text alone does not say; decide on the diff.",
      }
    : /^[+-].*(fields|"fields")/m.test(record.input ?? "")
      ? {
          needed: true,
          reason: "The diff changes the response fields or the schema.",
        }
      : { needed: false, reason: "Only an internal helper changed." };
async function answerDecides() {
  const queued = store
    .list("flow_records")
    .filter((r) => r.kind === "check-decide" && r.state === "queued");
  for (const record of queued) {
    const slot = `d-${++slots}`;
    await bind(record.id, slot, "check-decide");
    await ops.execute(
      "check.decide.submit",
      answerFor(record),
      undefined,
      as(slot),
    );
  }
  return queued.length;
}
const tick = (sessions) =>
  ops.execute("workspace.tick", {
    cron: true,
    sessions: sessions.map((target) => ({ target, status: "idle" })),
  });
// Tick, answer, drain until nothing is queued and each named task's
// delivery has landed or gone back to its worker.
const FINAL = new Set(["integrated", "failed"]);
async function settle(sessions, taskIds = [], rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    await tick(sessions);
    await answerDecides();
    await drainCheckRuns(store);
    await answerDecides();
    const busy = checkRuns(store).some((r) => r.state !== "finished");
    if (
      !busy &&
      taskIds.every((id) => FINAL.has(store.get("task_deliveries", id)?.state))
    )
      return;
  }
}
const runOf = (taskId) =>
  checkRuns(store)
    .filter((r) => r.taskId === taskId && r.state === "finished")
    .sort((a, b) => (a.endedAt < b.endedAt ? -1 : 1))
    .at(-1);
// The task's run that ran (or skipped) a named check, newest first.
const ranCheck = (taskId, name) =>
  checkRuns(store)
    .filter(
      (r) =>
        r.taskId === taskId &&
        (r.checks?.some((c) => c.name === name) ||
          r.skipped?.some((c) => c.name === name)),
    )
    .sort((a, b) => (a.endedAt < b.endedAt ? -1 : 1))
    .at(-1);
// The task's first run that ran a named check itself (not from the cache).
const firstRan = (taskId, name) =>
  checkRuns(store)
    .filter(
      (r) =>
        r.taskId === taskId &&
        r.checks?.some((c) => c.name === name && !c.cached),
    )
    .sort((a, b) => (a.endedAt < b.endedAt ? -1 : 1))[0];
const delivery = (taskId) => store.get("task_deliveries", taskId);
const parityOf = (run) => run?.checks?.find((c) => c.name === "parity");

try {
  // ---- Leg 1: four tasks, one approval, the tick until the queue is empty
  const handler = fs.readFileSync(
    path.join(checkout, "src/api/handler.js"),
    "utf8",
  );
  await tick([]);
  await answerDecides();
  const t1 = await work("t1", { "README.md": "acme api, fixed\n" }),
    t2 = await work("t2", {
      "src/api/helper.js": "export const helper = (value) => value;\n",
    }),
    t3 = await work("t3", {
      "src/api/handler.js": handler.replace("'name']", "'name', 'email']"),
    }),
    t4 = await work("t4", { "schema/api.json": '{"fields": 3}\n' });
  const started = Date.now();
  await settle([t1.slot, t2.slot, t3.slot, t4.slot], ["t1", "t2", "t3", "t4"]);
  const r1 = ranCheck("t1", "parity"),
    r2 = ranCheck("t2", "parity"),
    r3 = firstRan("t3", "parity"),
    r4 = ranCheck("t4", "parity");
  observe(
    "1",
    "docs task: parity skipped by paths, lands",
    r1.skipped?.[0]?.filter === "paths" &&
      delivery("t1").state === "integrated",
    { skipped: r1.skipped },
  );
  observe(
    "1",
    "refactor: skipped by decide with its reason, lands",
    r2.skipped?.[0]?.filter === "decide" &&
      /internal helper/.test(r2.skipped[0].reason) &&
      delivery("t2").state === "integrated",
    { skipped: r2.skipped },
  );
  observe(
    "1",
    "field change: waits about 60 s and lands",
    parityOf(r3)?.exitCode === 0 &&
      parityOf(r3).durationMs >= SERVICE_MS - 500 &&
      delivery("t3").state === "integrated",
    { durationMs: parityOf(r3)?.durationMs, tail: parityOf(r3)?.tail },
  );
  observe(
    "1",
    "schema change fails and goes back to its worker",
    parityOf(r4)?.exitCode === 1 && delivery("t4").state === "failed",
    { state: delivery("t4").state, cause: delivery("t4").attempts?.[0]?.cause },
  );
  observe(
    "1",
    "required parity: the local result on the exact head",
    localCheckResult(store, "api", "parity", r3.commit).conclusion ===
      "success" &&
      localCheckResult(store, "api", "parity", r4.commit).conclusion ===
        "failure",
  );
  observe("1", "leg time", true, {
    seconds: Math.round((Date.now() - started) / 1000),
  });

  // ---- Leg 2: rerun the third task's check on the same content ----------
  // The same commit and base the first run checked, through the same
  // runner a merge batch candidate uses.
  const parityCheck = pluginChecks
      .approvedPluginChecks(options)
      .find((c) => c.name === "parity"),
    repository = store.get("repositories", "api"),
    before = service.requests,
    t0 = Date.now();
  const {
    checks: [again],
  } = await runChecksAt(repository, r3.commit, [parityCheck], {
    timeoutFor: () => 600_000,
    plugin: (check, dir, timeoutMs) =>
      runPluginCheck(check, {
        store,
        repository,
        dir,
        commit: r3.commit,
        base: git(checkout, "rev-parse", `${r3.commit}^`),
        repo: "acme/api",
        timeoutMs,
        pluginOptions: options,
      }),
  });
  const elapsed = Date.now() - t0;
  observe(
    "2",
    "rerun is cached and takes under a second",
    Boolean(again?.cached) &&
      service.requests === before &&
      again.durationMs < 1000,
    { cached: again?.cached, wallMs: elapsed },
  );

  // ---- Leg 3: edit the plugin's script, one more tick ---------------------
  fs.appendFileSync(path.join(folder, "bin", "parity.mjs"), "// edited\n");
  await sleep(2100); // past the 2 s plugin read cache
  const t4b = await work("t4", {
    "schema/api.json": '{"fields": 3, "v": 2}\n',
  });
  await settle([t4b.slot], ["t4"]);
  const r4b = runOf("t4");
  observe(
    "3",
    "no plugin check runs until the plugin is approved again",
    !r4b.selected?.includes("parity") &&
      plugins.inspectPlugins(options)[0].state === "changed",
    { selected: r4b.selected, state: plugins.inspectPlugins(options)[0].state },
  );

  // ---- Leg 4: parity at the phase stage; a two-task phase ----------------
  fs.writeFileSync(path.join(folder, "bin", "parity.mjs"), parityScript);
  writeManifest(manifest("phase"));
  approve();
  await sleep(2100);
  const base5 = fs.readFileSync(
    path.join(checkout, "src/api/handler.js"),
    "utf8",
  );
  const t5 = await work("t5", {
    "src/api/handler.js": base5.replace("]", ", 'age']"),
  });
  await settle([t5.slot], ["t5"]);
  const t6 = await work("t6", { "schema/api.json": '{"fields": 4}\n' });
  const p0 = Date.now();
  await settle([t6.slot], ["t6"]);
  const landed = ["t5", "t6"].map((id) => delivery(id).state);
  const taskWaited = ["t5", "t6"].some((id) =>
    runOf(id)?.selected?.includes("parity"),
  );
  queuePhaseChecks(store);
  await drainCheckRuns(store);
  const phaseRuns = checkRuns(store).filter((r) => r.scope?.kind === "phase");
  const phaseRow = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.reason === "phase-check",
  );
  observe(
    "4",
    "both tasks land without waiting",
    landed.every((s) => s === "integrated") && !taskWaited,
    { landed },
  );
  observe(
    "4",
    "the phase check runs once after the second",
    phaseRuns.length === 1 &&
      phaseRuns[0].commit ===
        store.read().tasks.find((t) => t.id === "t6").integration?.commit,
    { runs: phaseRuns.length, seconds: Math.round((Date.now() - p0) / 1000) },
  );
  observe(
    "4",
    "its failure opens one Needs you item with a Start fix",
    phaseRow.length === 1 &&
      /```untrusted/.test(phaseRow[0].phaseFix?.text ?? ""),
    { title: phaseRow[0]?.title },
  );

  // ---- Leg 5: the MCP step, with a backend restart mid-poll --------------
  const log = path.join(root, "mcp.log");
  writeManifest(manifest("phase", { review: true }));
  pluginChecks.setMapping(options, {
    id: "acme-checks",
    alias: "review",
    command: [
      process.execPath,
      src("test/fixtures/fake-review-mcp.mjs"),
      "--log",
      log,
      "--running-ms",
      String(REVIEW_MS),
    ],
  });
  approve();
  await sleep(2100);
  const base7 = fs.readFileSync(
    path.join(checkout, "src/api/handler.js"),
    "utf8",
  );
  const t7 = await work("t7", {
      "src/api/handler.js": base7.replace("]", ", 'phone']"),
    }),
    t8 = await work("t8", { "schema/api.json": '{"fields": 5}\n' });
  await tick([t7.slot, t8.slot]);
  await answerDecides();
  // A backend that dies mid-poll: drain in a child process, kill it once
  // the first review is open.
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    const { Store } = await import(${JSON.stringify(src("store/store.mjs"))});
    const { Operations } = await import(${JSON.stringify(src("api/operations.mjs"))});
    const { drainCheckRuns } = await import(${JSON.stringify(src("delivery/check-runs.mjs"))});
    const store = new Store(${JSON.stringify(storeFile)});
    new Operations(store, { workspaceRoot: ${JSON.stringify(root)}, pluginSettingsFile: ${JSON.stringify(settingsFile)} });
    await drainCheckRuns(store);
  `,
    ],
    { stdio: "inherit", env: process.env },
  );
  for (let i = 0; i < 600 && !fs.existsSync(log); i++) await sleep(200);
  for (let i = 0; i < 600; i++) {
    if (fs.readFileSync(log, "utf8").includes('"get_review"')) break;
    await sleep(200);
  }
  child.kill("SIGKILL");
  await new Promise((r) => child.on("exit", r));
  observe("5", "the backend was killed mid-poll", true);
  const m0 = Date.now();
  await settle([t7.slot, t8.slot], ["t7", "t8"]);
  const r7 = ranCheck("t7", "parity-review"),
    r8 = ranCheck("t8", "parity-review"),
    review = (run) => run?.checks?.find((c) => c.name === "parity-review");
  const calls = fs
    .readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const starts = calls.filter((c) => c.params?.name === "create_review");
  const tools = [
    ...new Set(calls.map((c) => c.params?.name ?? c.method)),
  ].sort();
  observe(
    "5",
    "field change passes after about 90 s",
    review(r7)?.exitCode === 0 && delivery("t7").state === "integrated",
    {
      durationMs: review(r7)?.durationMs,
      seconds: Math.round((Date.now() - m0) / 1000),
    },
  );
  observe(
    "5",
    "schema change fails, back to its worker, the review's summary its only output",
    review(r8)?.exitCode === 1 &&
      review(r8).tail ===
        "The schema changed: the response field list differs." &&
      delivery("t8").state === "failed",
    { tail: review(r8)?.tail, state: delivery("t8").state },
  );
  observe(
    "5",
    "one create_review per change despite the restart",
    starts.length === 2,
    { starts: starts.length },
  );
  observe(
    "5",
    "no tool but create_review, get_review and tools/list",
    tools.every((t) =>
      [
        "create_review",
        "get_review",
        "initialize",
        "notifications/initialized",
        "tools/list",
      ].includes(t),
    ),
    { tools },
  );

  // ---- Leg 6: change the alias's mapping, one more tick ---------------------
  pluginChecks.setMapping(options, {
    id: "acme-checks",
    alias: "review",
    command: [
      process.execPath,
      src("test/fixtures/fake-review-mcp.mjs"),
      "--log",
      log,
    ],
  });
  await sleep(2100);
  const callsBefore = fs
    .readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean).length;
  const t8b = await work("t8", { "schema/api.json": '{"fields": 6}\n' });
  await settle([t8b.slot], ["t8"]);
  const callsAfter = fs
    .readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean).length;
  observe(
    "6",
    "no MCP step runs until the plugin is approved again",
    callsAfter === callsBefore &&
      !runOf("t8")?.selected?.includes("parity-review") &&
      plugins.inspectPlugins(options)[0].state === "changed",
    { state: plugins.inspectPlugins(options)[0].state },
  );

  // ---- Across every leg: nothing of the plugin in the repository ----------
  git(checkout, "push", "-q", "origin", "--all");
  const history = git(bare, "log", "-p", "--all") + git(bare, "for-each-ref");
  const leaked = [
    "parity.mjs",
    "public API of the service",
    "PARITY_PORT",
    "acme-checks",
    "create_review",
  ].filter((s) => history.includes(s));
  const notes = git(bare, "for-each-ref", "refs/notes");
  observe(
    "all",
    "the bare remote holds nothing of the plugin, no note and no status",
    leaked.length === 0 && notes === "",
    { leaked },
  );
} finally {
  server.close();
  store.close();
  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify({
      summary: {
        observed: results.length,
        failed: failed.length,
        root: keep ? root : "(removed)",
      },
    }),
  );
  if (!keep) fs.rmSync(root, { recursive: true, force: true });
  process.exitCode = failed.length ? 1 : 0;
}
