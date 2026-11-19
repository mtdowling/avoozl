#!/usr/bin/env node
// Proof nk-p1 (without-kirocrew NK1, NK2, design D2): investigate first with
// no Kiro Crew chat. Two tasks, investigate first on, every role on the
// `process` executor. The tick runs; each worker reports findings and each
// falsifier gives a verdict. A person presses Go ahead on one task and
// Investigate again on the other, which investigates again and then goes
// ahead. Both land. Every session must have executor `process`, and no
// request for `kirocrew` may be written.
//
// The gate lets a sure worker and a sure falsifier go ahead with no person
// (R75.3), and Avoozl has no setting that always asks. So this script's
// backend holds every gate pass for a person, before the tick can send it:
// each round waits for the decision the proof presses. The held rounds are
// listed in the report. Avoozl's own gate is unchanged.
//
// Everything lives under --root: a bare remote, its checkout, an Avoozl
// workspace and an isolated Avoozl config and state home (XDG_CONFIG_HOME,
// XDG_STATE_HOME). As in P59, Claude Code is confined by sandbox-exec and
// reaches only Bedrock through a loopback proxy, so it runs from a terminal
// outside Kiro Crew.
//
//   node scripts/proof-nk-p1-live.mjs --root DIR [--agent claude|fake]
//
// `--agent fake` checks this script's plumbing only and never counts as the
// proof. No real workspace, Avoozl home, Claude Code home or Kiro Crew home
// is read or written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentEnv,
  isolatedMachine,
  isolateHome,
  needSandbox,
  originFile as originText,
  printResult,
  processRepository,
  proofHarness,
  proofRun,
  runBackend,
  scratchRepository,
  startMachine,
  stopMachine,
} from "./live-proofs/machine.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const RUN = proofRun({
  tag: "nk-p1",
  prefix: "NKP1",
  script: SCRIPT,
  proxyPort: 18461,
});
const {
  repo: REPO,
  root: ROOT,
  agent: AGENT,
  harness: HARNESS,
  model: MODEL,
  db: DB,
  paths: P,
  event,
  git,
  cli,
  sleep,
} = RUN;
const TAG = "nkp1";
const PLAN = `${TAG}-plan`;
// The task a person sends ahead, and the one they send back once.
const GO = `${TAG}-go`;
const AGAIN = `${TAG}-again`;
// The file each task must land on origin main, and its exact text.
const WORDS = { [GO]: "alpha", [AGAIN]: "beta" };

// The isolated Avoozl home, set before any Avoozl module loads.
const MACHINE = await isolatedMachine(isolateHome(ROOT));
const originFile = (file) => originText(RUN, file);

const CHECK = `// nk-p1 scratch check: each notes/*.txt holds one lowercase word and a newline.
import fs from "node:fs";
import path from "node:path";
const notes = fs.existsSync("notes") ? fs.readdirSync("notes").filter((n) => n.endsWith(".txt")) : [];
for (const name of notes) {
  const text = fs.readFileSync(path.join("notes", name), "utf8");
  if (!/^[a-z]+\\n$/.test(text)) {
    console.error(\`notes/\${name} must be one lowercase word and a newline\`);
    process.exit(1);
  }
}
console.log("ok");
`;

// The fake agent (plumbing only). A worker writes findings first and code
// on Go ahead; a falsifier gives a verdict. Both are sure, so the gate
// would pass on its own, as it did for Claude Code: the hold must catch it.
const FAKE_AGENT = `import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
const write = (value) => { fs.mkdirSync(".avoozl", { recursive: true }); fs.writeFileSync(".avoozl/result.json", JSON.stringify(value)); };
const findings = { read: "check.mjs and notes/", cause: "notes/ has no file yet", plan: "add the one note file", check: "node check.mjs prints ok", confidence: "high" };
if (/You are an Avoozl Falsifier/.test(text)) write({ state: "done", report: { verdict: "stands", evidence: "check.mjs reads every notes/*.txt.", confidence: "high" } });
else if (/^Go ahead/.test(text)) {
  const task = /^Go ahead on Avoozl task (\\S+)\\./.exec(text)?.[1];
  const word = ${JSON.stringify(WORDS)}[task] ?? "one";
  fs.mkdirSync("notes", { recursive: true });
  fs.writeFileSync("notes/" + word + ".txt", word.replace(/[^a-z]/g, "") + "\\n");
  write({ state: "done", text: "Wrote the note." });
} else if (/"state": "findings"/.test(text) || /^Investigate again/.test(text)) write({ state: "findings", report: findings });
`;

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; nk-p1 runs once on a fresh root.`);
  for (const dir of [ROOT, P.wt, P.claudeConfig])
    fs.mkdirSync(dir, { recursive: true });
  event("setup.start", {
    root: ROOT,
    agent: AGENT,
    repo: git(REPO, "rev-parse", "HEAD"),
    avoozlHome: MACHINE.configDirectory,
  });
  scratchRepository(RUN, {
    name: "nk-p1 Scratch",
    email: "nkp1@example.invalid",
    files: { "README.md": "nk-p1 scratch repository.\n", "check.mjs": CHECK },
    message: "Start the nk-p1 scratch repository",
  });

  cli("init", P.ws, "--name", "nk-p1");
  cli("workspace", "add", TAG, "--root", P.ws);
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  config.delivery = {
    ...(config.delivery || {}),
    retries: 1,
    // Investigate first on every task (R75), with the falsifier's verdict
    // needing a person unless both are sure.
    investigate: { mode: "all", minConfidence: "high" },
  };
  config.lanes = { local: 2 };
  // Every role on this machine's harness (Settings › Models, R98.6).
  const { ROLES } = await import("../src/app/chat-models.mjs");
  config.roles = Object.fromEntries(
    ROLES.map((role) => [role, { harness: HARNESS }]),
  );
  config.roles.worker.model = MODEL;
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

  await proofHarness(RUN, MACHINE, FAKE_AGENT);

  const { Store } = await import("../src/app/store.mjs");
  const { digest } = await import("../src/model.mjs");
  const { takeOverSpec } = await import("../src/app/spec-takeover.mjs");
  const store = new Store(DB);
  try {
    const task = (id, word) => ({
      id,
      title: `Write notes/${word}.txt`,
      kind: "leaf",
      scope: TAG,
      status: "planned",
      epic: TAG,
      track: TAG,
      tags: [],
      acceptance: [
        `Create notes/${word}.txt containing the word ${word} and a newline, and nothing else.`,
        "Run `node check.mjs` before you finish; it must print ok.",
      ],
      checks: ["node check.mjs"],
      repository: "app",
      planId: PLAN,
    });
    store.importSnapshot({
      ...store.read(),
      tasks: [task(GO, WORDS[GO]), task(AGAIN, WORDS[AGAIN])],
      edges: [],
    });
    store.put("repositories", processRepository(RUN, ["node", "check.mjs"]));
    // Installed approved, as P59's: this isolated workspace's approval is
    // the operator's run.
    store.put("plans", {
      id: PLAN,
      kind: "plan",
      spec: PLAN,
      title: "nk-p1 investigate first",
      hash: digest(`plan ${PLAN}`),
      revision: 1,
      state: "approved",
    });
    store.put("receipts", {
      id: `spec-journal:${PLAN}`,
      kind: "spec-journal",
      planId: PLAN,
      home: "local",
    });
    await takeOverSpec(store, { workspaceRoot: P.ws, actor: "Operator" }, PLAN);
  } finally {
    store.close();
  }
  event("setup.done");
}

// The headless tick a machine with no Kiro Crew runs: the tick, the drain
// of `process` requests, the checks, and the messages the tick owes its
// children (Go ahead, Investigate again).
const backend = (seconds) =>
  runBackend(RUN, MACHINE, {
    seconds,
    env: agentEnv(RUN),
    between(store, log) {
      for (const held of holdForPerson(store))
        log(`held gate pass for ${held.task} round ${held.round}`);
    },
  });

// A gate pass (both sure, the findings stand) turns back into a decision a
// person makes. Only the drain records a falsifier's reply and only the
// tick sends Go ahead, and this runs between them, so no pass is sent.
function holdForPerson(store) {
  return store.transaction(() => {
    const held = [];
    for (const row of store.list("task_investigations")) {
      if (row.state !== "go" || row.decidedBy !== "gate" || row.message?.sentAt)
        continue;
      const { message, decidedBy, gateAt, ...rest } = row;
      store.put("task_investigations", { ...rest, state: "needs-you" });
      held.push({ task: row.taskId, round: row.rounds.at(-1).n, gateAt });
    }
    if (held.length)
      store.setMeta("nkp1.held", [
        ...(store.getMeta("nkp1.held") ?? []),
        ...held,
      ]);
    return held;
  });
}

async function snapshotState() {
  const { Store } = await import("../src/app/store.mjs");
  const store = new Store(DB);
  try {
    const of = (id) => {
      const row = store.get("task_investigations", id);
      return {
        state: row?.state ?? null,
        rounds: (row?.rounds ?? []).map((round) => ({
          n: round.n,
          findings: Boolean(round.findings),
          verdict: round.reply?.verdict ?? null,
          decision: round.decision ?? null,
        })),
        delivery: store.get("task_deliveries", id)?.state ?? null,
        onOrigin: originFile(`notes/${WORDS[id]}.txt`),
      };
    };
    return {
      tasks: { [GO]: of(GO), [AGAIN]: of(AGAIN) },
      bindings: store.list("session_bindings").map((b) => ({
        slot: b.slot,
        task: b.taskId,
        role: b.role,
        executor: b.executor ?? "kirocrew",
        status: b.status,
      })),
      requests: store.list("session_requests").map((r) => ({
        kind: r.kind,
        role: r.request?.role ?? null,
        executor: r.executor,
        state: r.state,
      })),
      decided: store.getMeta("nkp1.decided") ?? {},
      held: store.getMeta("nkp1.held") ?? [],
    };
  } finally {
    store.close();
  }
}

// What a person presses in Needs you: Go ahead on one task; Investigate
// again once on the other, then Go ahead.
async function decide(state) {
  const { Store } = await import("../src/app/store.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const store = new Store(DB);
  try {
    const ops = new Operations(store, { workspaceRoot: P.ws });
    const decided = store.getMeta("nkp1.decided") ?? {};
    for (const id of [GO, AGAIN]) {
      if (state.tasks[id].state !== "needs-you") continue;
      const action = id === AGAIN && !decided[id] ? "again" : "go";
      await ops.execute(
        "investigation.decide",
        { taskId: id, action },
        undefined,
        { local: true },
      );
      decided[id] = [...(decided[id] ?? []), action];
      store.setMeta("nkp1.decided", decided);
      event("decide", { task: id, action });
    }
  } finally {
    store.close();
  }
}

function verdict(state) {
  const go = state.tasks[GO],
    again = state.tasks[AGAIN];
  const expected = {
    "1 each worker reported findings and each falsifier a verdict": [
      go,
      again,
    ].every(
      (t) => t.rounds.length && t.rounds.every((r) => r.findings && r.verdict),
    ),
    "2a the Go ahead task landed its file on origin after one Go ahead":
      go.delivery === "integrated" &&
      go.onOrigin === `${WORDS[GO]}\n` &&
      (state.decided[GO] ?? []).join() === "go" &&
      go.rounds.map((r) => r.decision).join() === "go",
    "2b the other investigated again, then landed its file on origin":
      again.delivery === "integrated" &&
      again.onOrigin === `${WORDS[AGAIN]}\n` &&
      again.rounds.length >= 2 &&
      (state.decided[AGAIN] ?? []).join() === "again,go" &&
      again.rounds.map((r) => r.decision).join() === "again,go",
    "3a every session ran on process":
      state.bindings.length > 0 &&
      state.bindings.every((b) => b.executor === "process"),
    "3b no kirocrew request was written": state.requests.every(
      (r) => r.executor !== "kirocrew",
    ),
  };
  return { pass: Object.values(expected).every(Boolean), expected };
}

async function prove() {
  await needSandbox(RUN, "nk-p1");
  await setup();
  const { backend: backendProcess, proxy } = await startMachine(
    RUN,
    SCRIPT,
    90 * 60,
  );
  let state;
  try {
    const end = Date.now() + (AGENT === "fake" ? 5 : 80) * 60_000;
    for (;;) {
      state = await snapshotState();
      await decide(state);
      if (verdict(state).pass || Date.now() > end) break;
      if (Object.values(state.tasks).every((t) => t.delivery === "integrated"))
        break;
      await sleep(5000);
    }
  } finally {
    await stopMachine({
      root: ROOT,
      backend: backendProcess,
      proxy,
      stateDirectory: MACHINE.stateDirectory,
    });
    state = await snapshotState();
    const result = {
      agent: AGENT,
      repo: git(REPO, "rev-parse", "HEAD"),
      ...verdict(state),
      state,
    };
    fs.writeFileSync(P.report, JSON.stringify(result, null, 2));
    event("report", {
      file: P.report,
      pass: result.pass,
      expected: result.expected,
    });
    printResult(RUN, "nk-p1", result.pass);
  }
}

if (RUN.command === "backend") await backend(RUN.backendFor);
else if (RUN.command === "prove") await prove();
else throw Error("Run with no command, or `backend`.");
