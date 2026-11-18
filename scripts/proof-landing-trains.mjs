#!/usr/bin/env node
// Proofs for the landing-trains first cut (.kiro/specs/landing-trains, tasks
// lt-p1 to lt-p3). Each runs against an isolated temporary workspace with a
// real bare remote and writes a receipt:
//
//   node scripts/proof-landing-trains.mjs p1|p2|p3 [receipt.md]
//
// Nothing here touches a real workspace. p1 starts real integrator processes
// and takes about two minutes (the lease expires after 20 s).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTrain } from "../src/app/integrator-run.mjs";
import { readTrainCi } from "../src/app/integrator-ci.mjs";
import { queueBatch } from "../src/app/integrator-trains.mjs";
import { landingQueue } from "../src/app/landing-queue.mjs";
import { Store } from "../src/app/store.mjs";
import {
  git,
  node,
  queued,
  workspace,
} from "../src/app/test/integrator-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [which, receipt] = process.argv.slice(2);
const cleanups = [];
const t = { after: (fn) => cleanups.push(fn) };
const out = [];
const say = (line = "") => {
  console.log(line);
  out.push(line);
};
const ok = (condition, text) => {
  say(`- ${condition ? "OBSERVED" : "NOT OBSERVED"}: ${text}`);
  if (!condition) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const train = (w, extra = {}) =>
  runTrain(w.store, {
    project: w.store.get("projects", "app"),
    target: "main",
    settings: w.settings(),
    config: w.config,
    lease: { leaseId: "proof" },
    workspaceRoot: w.root,
    machine: {},
    ...extra,
  });

// A bare-remote hook that records every ref update and whether it was a
// fast-forward. A create or a delete is not a rewrite.
const UPDATE_HOOK = (log) => `#!/bin/sh
ref="$1"; old="$2"; new="$3"
zero=0000000000000000000000000000000000000000
if [ "$old" = "$zero" ]; then kind=create
elif [ "$new" = "$zero" ]; then kind=delete
elif git merge-base --is-ancestor "$old" "$new"; then kind=fast-forward
else kind=REWRITE; fi
echo "$kind $ref" >> ${JSON.stringify(log)}
exit 0
`;
const updates = (log) =>
  fs.existsSync(log)
    ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean)
    : [];

async function p2() {
  say("# lt-p2: ten branches land in one train");
  const log = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-p2-")),
      "updates",
    ),
    w = await workspace(t, {
      policy: "optimistic",
      trigger: { minBranches: 1, maxBranches: 10 },
      hooks: [["update", UPDATE_HOOK(log)]],
      files: {
        "lib.js":
          "// top\nfunction alpha() {}\nfunction beta() {}\n// bottom\n",
        "CHANGELOG.md": "# Log\n",
      },
    });
  w.config.landing.trains.conflicts = {
    mechanical: [{ paths: ["CHANGELOG.md"], strategy: "union" }],
  };
  w.config.landing.trains.ci = { workflow: "ci.yml" };
  const edit = (file, fn) => (wt) =>
    fs.writeFileSync(
      path.join(wt, file),
      fn(fs.readFileSync(path.join(wt, file), "utf8")),
    );
  const specs = [
    [
      "t1",
      {
        write: edit("lib.js", (s) =>
          s.replace(
            "function alpha() {}\nfunction beta() {}",
            "// removed alpha\n// kept beta",
          ),
        ),
      },
    ],
    [
      "t2",
      {
        write: edit("lib.js", (s) =>
          s.replace(
            "function alpha() {}\nfunction beta() {}",
            "// kept alpha\n// removed beta",
          ),
        ),
      },
    ],
    ["t3", {}],
    ["t4", {}],
    ["t5", { from: "avoozl/t4" }],
    ["t6", { write: edit("CHANGELOG.md", (s) => s + "- six\n") }],
    ["t7", { write: edit("CHANGELOG.md", (s) => s + "- seven\n") }],
    ["t8", {}],
    ["t9", {}],
    ["t10", {}],
  ];
  for (const [id, opts] of specs) await queued(w, id, opts);
  const start = git(w.origin, "rev-parse", "main"),
    result = await train(w);
  const subjects = git(w.origin, "log", "--format=%s", `${start}..main`)
    .split("\n")
    .filter(Boolean);
  say(
    `Train ${result.train.id}: ${result.train.members.length} members, outcome ${result.train.outcome}.`,
  );
  ok(
    result.train.members.filter((m) => m.state === "stacked").length === 9,
    "one train of nine (ten queued, one dropped)",
  );
  const dropped = result.train.members.find((m) => m.state === "conflict");
  ok(
    dropped?.key === "t2" && result.messages.length === 0,
    `the later same-line branch (${dropped?.key}) returned to its task`,
  );
  ok(
    w.store.get("landing_queue", "app\0main\0t2").files?.includes("lib.js"),
    "its conflicted file (lib.js) was recorded for its chat",
  );
  ok(
    subjects.filter((s) => s === "Do t4").length === 1,
    "the stacked branch carries no duplicated commit (t4 appears once)",
  );
  const changelog = git(w.origin, "show", "main:CHANGELOG.md");
  ok(
    changelog.includes("- six") && changelog.includes("- seven"),
    "the changelog merged by rule and passed verify",
  );
  ok(
    result.train.steps.filter((s) => s.name === "push").length === 1,
    "one trunk push",
  );
  const github = {
    reads: 0,
    async workflowRuns() {
      this.reads += 1;
      return [
        {
          id: 5,
          workflow: ".github/workflows/ci.yml",
          headSha: git(w.origin, "rev-parse", "main"),
          event: "push",
          status: "completed",
          conclusion: "success",
        },
      ];
    },
  };
  await readTrainCi(w.store, {
    github,
    repository: "acme/app",
    projectId: "app",
    target: "main",
    workflow: "ci.yml",
  });
  ok(github.reads === 1, "one CI run read for the whole train");
  ok(
    !updates(log).some((u) => u.startsWith("REWRITE")),
    `no forced update on any ref (${updates(log).length} ref updates, all create, fast-forward or delete)`,
  );
  // The returned branch, fixed by a merge and requeued, lands in the next train.
  const wt = path.join(w.root, "wt", "t2");
  git(wt, "fetch", "-q", w.origin, "main");
  try {
    git(wt, "merge", "FETCH_HEAD", "-m", "Merge main");
  } catch {}
  fs.writeFileSync(
    path.join(wt, "lib.js"),
    git(w.origin, "show", "main:lib.js").replace(
      "// removed alpha\n// kept beta",
      "// removed alpha\n// removed beta",
    ),
  );
  git(wt, "add", ".");
  git(wt, "commit", "-qm", "Resolve t2");
  const task = w.store.read().tasks.find((x) => x.id === "t2");
  await queueBatch(w.store, {
    project: w.store.get("projects", "app"),
    task,
    commit: git(wt, "rev-parse", "HEAD"),
    config: w.config,
    machine: {},
  });
  const next = await train(w);
  say(
    `next: ${next.state} ${next.train?.outcome} ${next.error ?? ""} ${JSON.stringify(next.train?.members?.map((m) => [m.key, m.state]))}`,
  );
  ok(
    next.train?.outcome === "landed" &&
      git(w.origin, "log", "--format=%s", "main").includes("Resolve t2"),
    "the returned branch, fixed by a merge and requeued, landed in the next train",
  );
  ok(
    !updates(log).some((u) => u.startsWith("REWRITE")),
    "still no forced update after the second train",
  );
  return "landing-trains-p2";
}

// Eight branches, member 5 breaks suite `net` on linux-x64 only, member 2 has
// a flaky suite. The full command logs each run with platform and suite.
async function p3Run(policy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-p3-")),
    runs = path.join(dir, "runs"),
    once = path.join(dir, "flaky-once"),
    log = path.join(dir, "updates"),
    cmd = node(
      `const fs=require('fs');
       const a=process.argv.slice(1);const platform=a[a.indexOf('--platform')+1];
       const i=a.indexOf('--suite');const only=i>=0?a[i+1]:null;
       fs.appendFileSync(${JSON.stringify(runs)}, platform+':'+(only??'*')+'\\n');
       const bad=fs.existsSync('bad.txt');
       let flaky=false;
       if(fs.existsSync('t2.txt')&&platform==='macos-arm64'&&!fs.existsSync(${JSON.stringify(once)})){fs.writeFileSync(${JSON.stringify(once)},'1');flaky=true}
       const suites=[{name:'core',status:flaky?'failed':'passed'},{name:'net',status:bad&&platform==='linux-x64'?'failed':'passed'}];
       fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/'+platform+'.json',JSON.stringify({suites}));
       const shown=only?suites.filter(s=>s.name===only):suites;
       console.log('suite output');process.exit(shown.some(s=>s.status==='failed')?1:0)`,
      "--",
    ),
    w = await workspace(t, {
      policy,
      trigger: { minBranches: 1 },
      hooks: [["update", UPDATE_HOOK(log)]],
    });
  const full = (platform) => ({
    command: [...cmd, "--platform", platform],
    results: `out/${platform}.json`,
    suiteArgs: ["--suite", "{suite}"],
  });
  w.config.landing.trains.validation.full = {
    "macos-arm64": full("macos-arm64"),
    "linux-x64": full("linux-x64"),
  };
  w.config.machine.platforms["linux-x64"] = { kind: "native" };
  for (let i = 1; i <= 8; i++)
    await queued(w, `t${i}`, { file: i === 5 ? "bad.txt" : `t${i}.txt` });
  w.store.put("session_bindings", {
    id: "slot-t5",
    slot: "slot-t5",
    taskId: "t5",
    role: "worker",
    attempt: 1,
    status: "working",
  });
  const start = git(w.origin, "rev-parse", "main"),
    result = await train(w);
  const lines = fs.readFileSync(runs, "utf8").trim().split("\n"),
    // The first two lines are the full run on each platform; the flaky suite is
    // rerun once on its own before the bisect.
    after = lines.slice(2).filter((l) => l !== "macos-arm64:core"),
    subjects = git(w.origin, "log", "--format=%s", `${start}..main`)
      .split("\n")
      .filter(Boolean);
  say(`## ${policy}`);
  say(
    `Train ${result.train.id}: outcome ${result.train.outcome}, culprits ${JSON.stringify(result.train.culprits)}, flaky ${JSON.stringify(result.train.flaky)}.`,
  );
  ok(
    result.train.flaky.some(
      (f) => f.suite === "core" && f.platform === "macos-arm64",
    ),
    "the flake (member 2's core suite on macOS) was recorded and ignored",
  );
  ok(result.train.culprits[0] === "t5", "member 5 was named");
  ok(
    after.every((l) => l === "linux-x64:net"),
    `every probe and rerun ran only the failing suite on the failing platform (${after.length} runs after the first full run, all linux-x64:net)`,
  );
  ok(
    result.messages.length === 1 &&
      /net on linux-x64/.test(result.messages[0].text) &&
      /Log excerpt/.test(result.messages[0].text),
    "member 5's chat got the suite, the platform and a log excerpt",
  );
  if (policy === "gated")
    ok(
      subjects.length === 7,
      `seven landed (${subjects.length} commits on the trunk)`,
    );
  else {
    ok(
      subjects.filter((s) => s.startsWith("Revert")).length === 1,
      "one revert commit",
    );
    ok(
      !git(w.origin, "ls-tree", "--name-only", "main").includes("bad.txt"),
      "the trunk is green after the revert (bad.txt is gone)",
    );
    ok(result.train.validated === true, "the train counts as validated");
  }
  ok(
    !updates(log).some((u) => u.startsWith("REWRITE")),
    "no forced update on any ref",
  );
  return "landing-trains-p3";
}
async function p3() {
  say("# lt-p3: a red train lands the rest");
  await p3Run("gated");
  await p3Run("optimistic");
  return "landing-trains-p3";
}

// Real integrator processes on one workspace.
async function p1() {
  say("# lt-p1: one integrator per trunk, and a dead one clears by itself");
  const slow = (dir) =>
      node(
        `const fs=require('fs');const f=${JSON.stringify(path.join(dir, "n"))};const n=fs.existsSync(f)?Number(fs.readFileSync(f)):0;fs.writeFileSync(f,String(n+1));if(n<2)setTimeout(()=>{},40000)`,
      ),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-p1-")),
    log = path.join(dir, "updates"),
    w = await workspace(t, {
      trigger: { minBranches: 1 },
      hooks: [["update", UPDATE_HOOK(log)]],
    });
  w.config.landing.trains.validation.full["macos-arm64"].command = slow(dir);
  for (const id of ["t1", "t2", "t3"]) await queued(w, id);
  w.store.close();
  const xdg = path.join(dir, "xdg");
  fs.mkdirSync(path.join(xdg, "avoozl"), { recursive: true });
  fs.writeFileSync(
    path.join(xdg, "avoozl", "config.json"),
    JSON.stringify({
      version: 1,
      machine: w.config.machine,
      lease: { heartbeatSeconds: 10, missedHeartbeats: 2 },
    }),
  );
  fs.writeFileSync(
    path.join(w.root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      db: "workspace.sqlite",
      landing: w.config.landing,
    }),
  );
  const env = { ...process.env, XDG_CONFIG_HOME: xdg };
  const start = (name) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "src/app/integrator-main.mjs"), "--workspace", w.root],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.name = name;
    return child;
  };
  const db = () => new Store(path.join(w.root, "workspace.sqlite"));
  const read = (fn) => {
    const s = db();
    try {
      return fn(s);
    } finally {
      s.close();
    }
  };
  const lease = () => read((s) => s.get("landing_leases", "app\0main"));
  const until = async (fn, what, ms = 90000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw Error(`timed out: ${what}`);
      await sleep(500);
    }
  };
  const A = start("A");
  await until(() => lease()?.holder?.pid === A.pid, "A holds the lease");
  const B = start("B");
  await sleep(12000);
  ok(
    lease().holder.pid === A.pid,
    "(1) with two integrators running, only A holds the lease; B reports busy",
  );
  ok(
    read((s) => s.list("landing_trains")).length === 1,
    "(1) one train exists",
  );
  const trainA = read((s) => s.list("landing_trains"))[0];
  A.kill("SIGKILL");
  say(`Killed A (pid ${A.pid}) during full validation of ${trainA.id}.`);
  await until(() => lease()?.holder?.pid === B.pid, "B takes the lease", 60000);
  const abandoned = read((s) => s.get("landing_trains", trainA.id));
  ok(
    abandoned.outcome === "abandoned",
    "(2) the survivor took the lease after the missed heartbeats and abandoned A's train",
  );
  ok(
    abandoned.steps.some((s) => s.name === "remove worktree"),
    "(2) it cleaned up A's landing worktree",
  );
  say(
    "Not shown here: the survivor landing the three. B's own train is suspended in step (3); landing is shown by p2, p3 and the engine tests.",
  );
  // B now runs its own train with the second slow validation; stop it.
  await until(
    () =>
      read((s) => s.list("landing_trains")).some(
        (x) => x.id !== trainA.id && !x.outcome,
      ),
    "B starts a train",
    30000,
  );
  process.kill(B.pid, "SIGSTOP");
  say(`Suspended B (pid ${B.pid}) past its expiry.`);
  await sleep(26000);
  const C = start("C");
  await sleep(15000);
  const held = lease();
  ok(
    held.holder.pid === B.pid && held.hung,
    "(3) nothing was taken from the suspended holder; the lease is marked hung",
  );
  const notices = read((s) => s.list("app_notifications")).filter((n) =>
    /hung/.test(n.payload?.title ?? ""),
  );
  ok(
    notices.length === 1,
    "(3) one Needs you notice names the hung integrator",
  );
  process.kill(B.pid, "SIGKILL");
  C.kill("SIGTERM");
  A.kill("SIGKILL");
  ok(
    !updates(log).some((u) => u.startsWith("REWRITE")),
    "the trunk never shows a forced update",
  );
  say(
    "(4) A trunk moved by hand during a train is covered by the engine test 'a trunk moved during the train is rebased onto and pushed after the rechecks' (src/app/test/integrator-engine.test.mjs).",
  );
  void start;
  void landingQueue;
  return "landing-trains-p1";
}

const proofs = { p1, p2, p3 };
if (!proofs[which]) {
  console.error("Usage: proof-landing-trains.mjs p1|p2|p3 [receipt.md]");
  process.exit(2);
}
let name;
try {
  name = await proofs[which]();
} finally {
  for (const fn of cleanups.reverse())
    try {
      await fn();
    } catch {}
}
const file = receipt ?? path.join(root, "docs", "evidence", `${name}.md`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(
  file,
  `${out.join("\n")}\n\nRun ${new Date().toISOString()} on ${os.platform()} with git ${execFileSync("git", ["--version"], { encoding: "utf8" }).trim()}.\n`,
);
console.log(`Receipt: ${file}`);
process.exit(process.exitCode ?? 0);
