#!/usr/bin/env node
// The owner's run of the open machine-server proofs (machine-server
// tasks.md): ms-p2 and ms-p3, which also cover nk-p2, from the owner's own
// terminal, outside Kiro Crew. It runs what a script can run, stops with
// numbered steps where only a person can act, checks the expected result
// itself where it can, and writes one draft receipt per proof under
// docs/evidence/.
//
//   node scripts/proofs/run-ms-owner-proofs.mjs --github-claude OWNER/SCRATCH1 --github-codex OWNER/SCRATCH2
//   node scripts/proofs/run-ms-owner-proofs.mjs --only ms-p3
//   node scripts/proofs/run-ms-owner-proofs.mjs --dry-run
//
// Everything lives under one root it prints (--root, else a new temporary
// folder). Run it again with the same --root to go on where it stopped. The
// only GitHub writes go to the two empty scratch repositories the flags name.
// --dry-run prints the plan without calling a model.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { claudeBinaries, realCodex } from "./real-claude.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const ROLES_SCRIPT = path.join(
  REPO,
  "scripts",
  "proofs",
  "proof-ms-roles-live.mjs",
);
const SELF = "scripts/proofs/run-ms-owner-proofs.mjs";

// The order they run in: ms-p3 builds on what ms-p2 shows.
export const PROOF_IDS = Object.freeze(["ms-p2", "ms-p3"]);
const SCRATCH_WORD = /(scratch|throwaway|sandbox|proof|test)/i;

// ---- Options -------------------------------------------------------------------

// Why `repo` cannot be a scratch repository for a run, or null when it can.
// Live, the run also refuses one that has any commit (emptyRepoProblem).
export function scratchRepoProblem(repo) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo ?? ""))
    return `${repo} is not OWNER/NAME.`;
  const [owner, name] = repo.split("/");
  if (owner.toLowerCase() === "nupp-lang")
    return `${repo} belongs to nupp-lang. Use a scratch repository of your own.`;
  if (!SCRATCH_WORD.test(name))
    return `${repo} does not look like a scratch repository. Its name must contain scratch, throwaway, sandbox, proof or test.`;
  return null;
}

export function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: "string" },
      only: { type: "string", multiple: true },
      "dry-run": { type: "boolean", default: false },
      "github-claude": { type: "string" },
      "github-codex": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  const only = (values.only ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  for (const id of only) {
    if (!PROOF_IDS.includes(id))
      throw Error(`--only takes ${PROOF_IDS.join(", ")}, not ${id}.`);
  }
  const github = {
    claude: values["github-claude"] ?? null,
    codex: values["github-codex"] ?? null,
  };
  for (const [flag, repo] of Object.entries(github)) {
    const problem = repo && scratchRepoProblem(repo);
    if (problem) throw Error(`--github-${flag}: ${problem}`);
  }
  if (github.claude && github.claude === github.codex)
    throw Error(
      "--github-claude and --github-codex must name two repositories: each run leaves a red main behind.",
    );
  const proofs = only.length
    ? PROOF_IDS.filter((id) => only.includes(id))
    : [...PROOF_IDS];
  const dryRun = values["dry-run"];
  if (!dryRun && !values.help)
    for (const [id, flag] of [
      ["ms-p2", "claude"],
      ["ms-p3", "codex"],
    ])
      if (proofs.includes(id) && !github[flag])
        throw Error(
          `${id} needs --github-${flag} OWNER/NAME: an empty scratch repository for its pull request and issue. Make one with: gh repo create OWNER/avoozl-${id}-scratch --private`,
        );
  return {
    root: values.root ? path.resolve(values.root) : null,
    proofs,
    dryRun,
    github,
    help: values.help,
  };
}

// ---- Small helpers ---------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const say = (line = "") => console.log(line);

export function findOnPath(name, searchPath = process.env.PATH ?? "") {
  for (const dir of searchPath.split(path.delimiter).filter(Boolean)) {
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch {}
  }
  return null;
}

const version = (binary) => {
  if (!binary) return "not found";
  const run = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  return (run.stdout || run.stderr || "").trim().split("\n")[0] || "unknown";
};

let terminal = null;
async function prompt(question) {
  terminal ??= readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return (await terminal.question(question)).trim();
}

async function yes(question) {
  return /^y(es)?$/i.test(await prompt(`${question} [y/N] `));
}

async function waitFor(check, minutes, everyMs = 5000) {
  const end = Date.now() + minutes * 60_000;
  for (;;) {
    const found = await check();
    if (found || Date.now() > end) return found;
    await sleep(everyMs);
  }
}

const cell = (value) =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s*\n\s*/g, " ");

// Why the scratch repository cannot take a run now, or null: it must exist
// and have no commit, so nothing anyone keeps is in it.
function emptyRepoProblem(repo) {
  const run = spawnSync("gh", ["api", `repos/${repo}/commits?per_page=1`], {
    encoding: "utf8",
  });
  if (run.status === 0)
    return `${repo} has commits. Each run needs an empty scratch repository: gh repo create ${repo}-2 --private`;
  if (/empty|409/i.test(`${run.stdout}${run.stderr}`)) return null;
  return `gh could not read ${repo}: ${run.stderr.trim()}`;
}

// ---- One proof's record -----------------------------------------------------

class Proof {
  constructor(run, id, title, receipt) {
    Object.assign(this, { run, id, title, receipt });
    this.dir = path.join(run.root, id);
    fs.mkdirSync(this.dir, { recursive: true });
    this.progressFile = path.join(this.dir, "progress.json");
    this.progress = fs.existsSync(this.progressFile)
      ? JSON.parse(fs.readFileSync(this.progressFile, "utf8"))
      : { steps: [] };
    this.notes = [];
  }

  save() {
    fs.writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2));
  }

  // One step: say what it is, let a person act, run the script's part, and
  // record the result. A step done in an earlier run is not run again.
  async step(id, title, { person = [], run, pause = true } = {}) {
    const done = this.progress.steps.find((step) => step.id === id);
    if (done) {
      say(
        `[${this.id}] ${id} done earlier: ${done.ok ? "ok" : "FAIL"} ${done.detail ?? ""}`,
      );
      return done;
    }
    say();
    say(`[${this.id}] ${id}: ${title}`);
    if (this.run.dryRun) {
      person.forEach((line, index) => say(`  ${index + 1}. ${line}`));
      const entry = { id, title, ok: null, detail: "dry run: not run" };
      this.progress.steps.push(entry);
      return entry;
    }
    if (person.length) {
      say("  Your turn:");
      person.forEach((line, index) => say(`  ${index + 1}. ${line}`));
      if (pause) await prompt("  Press Enter when that is done. ");
    }
    let result = { ok: true };
    try {
      result = (await run?.()) ?? { ok: true };
    } catch (error) {
      result = { ok: false, detail: String(error.message).slice(0, 600) };
    }
    const entry = { id, title, ok: result.ok, detail: result.detail ?? "" };
    say(`  -> ${entry.ok ? "ok" : "FAIL"} ${entry.detail}`);
    this.progress.steps.push(entry);
    this.save();
    return entry;
  }
}

// ---- ms-p2 and ms-p3: every role on one harness --------------------------------

async function rolesProof(proof, { harness, github, probes }) {
  const runRoot = path.join(proof.dir, "run");
  const report = path.join(runRoot, "report.json");
  const args = [
    ROLES_SCRIPT,
    "--root",
    runRoot,
    "--github",
    github ?? "OWNER/SCRATCH",
    "--harness",
    harness,
    ...(probes ? ["--probes"] : []),
  ];
  await proof.step(
    "front-end",
    "No Kiro Crew, Claude Code or other front end runs",
    {
      person: [
        "Quit Kiro Crew and close every Claude Code and Codex session. The run starts its own agents; nothing else may run.",
      ],
      run: () => {
        const ps = spawnSync("ps", ["-axo", "command="], {
          encoding: "utf8",
        }).stdout.split("\n");
        const open = ps.filter(
          (line) =>
            /kirocrew[^/]*\s+gateway|Kiro Crew\.app\/Contents\/MacOS/.test(
              line,
            ) ||
            /(^|\/)(claude|codex)(\s|$)(?!.*\s-p(\s|$))(?!.*\s(exec|--version))/.test(
              line,
            ),
        );
        return {
          ok: !open.length,
          detail: open.length
            ? `still running: ${open.slice(0, 3).join("; ").slice(0, 300)}`
            : "none running",
        };
      },
    },
  );
  await proof.step(
    "roles",
    `node ${path.relative(REPO, ROLES_SCRIPT)} --harness ${harness}${probes ? " --probes" : ""}`,
    {
      run: () => {
        if (!fs.existsSync(report)) {
          const problem = emptyRepoProblem(github);
          if (problem) return { ok: false, detail: problem };
          spawnSync(process.execPath, args, {
            stdio: "inherit",
            env: isolationFreeEnv(),
            cwd: REPO,
          });
        }
        if (!fs.existsSync(report))
          return {
            ok: false,
            detail: `No report: see ${path.join(runRoot, "events.jsonl")}`,
          };
        const found = JSON.parse(fs.readFileSync(report, "utf8"));
        proof.notes.push(
          `Harness version: ${found.version}. Avoozl ${found.avoozl}.`,
          "",
          "| Row | Result | Note |",
          "| --- | --- | --- |",
          ...found.rows.map(
            (row) =>
              `| ${cell(row.id)} | ${cell(row.state)} | ${cell(row.note)} |`,
          ),
          "",
          "Expected items:",
          "",
          ...Object.entries(found.expected).map(
            ([item, ok]) => `- ${ok ? "ok" : "FAIL"}: ${item}`,
          ),
        );
        return {
          ok: found.pass,
          detail: `${found.rows.filter((row) => row.state === "ok").length}/${found.rows.length} rows ok; report ${report}`,
        };
      },
    },
  );
  if (probes)
    await proof.step("probe-log", "Read Codex's transcript and the probe log", {
      person: [
        `Read the child logs under ${path.join(runRoot, "home", "state", "avoozl", "supervisor", "children")} and the "probes" line in ${path.join(runRoot, "events.jsonl")}.`,
      ],
      run: async () => ({
        ok: await yes("  Was every probe refused, each with its error text?"),
      }),
    });
  if (harness === "codex")
    await proof.step("proved", "codex.json's proved matches the receipt", {
      run: () => {
        const proved = JSON.parse(
          fs.readFileSync(
            path.join(REPO, "examples", "harnesses", "codex.json"),
            "utf8",
          ),
        ).proved;
        return {
          ok: true,
          detail: `examples/harnesses/codex.json proved is ${JSON.stringify(proved)}. Set it to the permission classes whose rows passed, in the receipt's commit.`,
        };
      },
    });
}

// The owner's environment for the roles script, which makes its own home.
function isolationFreeEnv() {
  const env = {};
  for (const [name, value] of Object.entries(process.env))
    if (!/^(KIROCREW_|AVOOZL_|KIRO_SESSION_ID$)/.test(name)) env[name] = value;
  return env;
}

// ---- The run -------------------------------------------------------------------------

const PROOFS = {
  "ms-p2": {
    title: "every role on Claude Code with no front end",
    receipt: "ms-p2-claude-code",
    go: (proof, run) =>
      rolesProof(proof, { harness: "claude-code", github: run.github.claude }),
  },
  "ms-p3": {
    title: "every role on Codex, and the sandbox contains it",
    receipt: `ms-p3-codex-${platformName()}`,
    go: (proof, run) =>
      rolesProof(proof, {
        harness: "codex",
        github: run.github.codex,
        probes: true,
      }),
  },
};

function platformName() {
  return (
    { darwin: "macos", linux: "linux", win32: "windows" }[process.platform] ??
    process.platform
  );
}

function writeReceipt(proof, run) {
  const steps = proof.progress.steps;
  const verdict = run.dryRun
    ? "DRY RUN"
    : steps.length && steps.every((step) => step.ok)
      ? "PASS"
      : "FAIL";
  const dir = run.dryRun
    ? path.join(run.root, "evidence-dry-run")
    : path.join(REPO, "docs", "evidence");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${proof.receipt}.md`);
  const text = [
    `# Proof ${proof.id}: ${proof.title}`,
    "",
    `A draft written by \`${SELF}\`. Read it and correct what the run got wrong before you commit it.`,
    "",
    `- Result: ${verdict}`,
    `- Run: ${new Date().toISOString()} on ${platformName()}, Avoozl ${git(REPO, "rev-parse", "--short", "HEAD")}`,
    `- Claude Code: ${run.tools.claudeVersion}; Codex: ${run.tools.codexVersion}`,
    "",
    "| Step | Result | Detail |",
    "| --- | --- | --- |",
    ...steps.map(
      (step) =>
        `| ${cell(`${step.id} ${step.title}`)} | ${step.ok === null ? "not run" : step.ok ? "ok" : "FAIL"} | ${cell(step.detail)} |`,
    ),
    "",
    ...(proof.notes.length ? [...proof.notes, ""] : []),
  ].join("\n");
  fs.writeFileSync(file, text);
  return { verdict, file };
}

async function main() {
  let run;
  try {
    run = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(64);
  }
  if (run.help) {
    say(
      `Usage: node ${SELF} [--root DIR] [--only ID[,ID]] [--dry-run] --github-claude OWNER/SCRATCH --github-codex OWNER/SCRATCH`,
    );
    say(`Proofs, in order: ${PROOF_IDS.join(", ")}.`);
    return;
  }
  run.root ??= fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-ms-proofs-"));
  fs.mkdirSync(run.root, { recursive: true });
  run.root = fs.realpathSync.native(run.root);
  const home = os.homedir();
  const onPath = { claude: findOnPath("claude"), codex: findOnPath("codex") };
  const claude = claudeBinaries({
    named: process.env.MSR_CLAUDE || null,
    onPath: onPath.claude,
    home,
  });
  run.tools = {
    claude: claude.exportWith,
    claudeChild: claude.child,
    codex:
      process.env.MSR_CODEX || realCodex(onPath.codex, home) || onPath.codex,
  };
  run.tools.claudeVersion = version(run.tools.claudeChild || run.tools.claude);
  run.tools.codexVersion = version(run.tools.codex);
  say(`Root: ${run.root}`);
  say(
    `claude: ${onPath.claude ?? "not on PATH"} (child runs ${run.tools.claudeChild ?? "none found"}): ${run.tools.claudeVersion}`,
  );
  say(
    `codex: ${onPath.codex ?? "not on PATH"} (child runs ${run.tools.codex ?? "none found"}): ${run.tools.codexVersion}`,
  );
  say(
    `Proofs: ${run.proofs.join(", ")}${run.dryRun ? " (dry run: no model)" : ""}`,
  );
  if (!run.dryRun) {
    const { sandboxKind } = await import("../../src/app/executors/sandbox.mjs");
    const problems = [
      !sandboxKind() &&
        "No sandbox here (inside another sandbox?). Run this from your own Terminal, outside Kiro Crew.",
      !run.tools.claudeChild &&
        "No real Claude Code binary found. Name it with MSR_CLAUDE.",
      run.proofs.includes("ms-p3") &&
        !run.tools.codex &&
        "No codex found. Name it with MSR_CODEX.",
      !findOnPath("gh") && "gh is not on PATH.",
    ].filter(Boolean);
    if (problems.length) {
      for (const problem of problems) console.error(problem);
      process.exit(1);
    }
  }
  const results = [];
  for (const id of run.proofs) {
    const { title, receipt, go } = PROOFS[id];
    const proof = new Proof(run, id, title, receipt);
    say();
    say(`==== ${id}: ${title} (${proof.dir})`);
    if (run.dryRun)
      say(
        `  would run: node ${path.relative(REPO, ROLES_SCRIPT)} --root ${path.join(proof.dir, "run")} --github ${id === "ms-p2" ? (run.github.claude ?? "OWNER/SCRATCH") : (run.github.codex ?? "OWNER/SCRATCH")} --harness ${id === "ms-p2" ? "claude-code" : "codex --probes"}`,
      );
    try {
      await go(proof, run);
    } catch (error) {
      say(`  ${id} stopped: ${error.message}`);
      proof.progress.steps.push({
        id: "setup",
        title: "The run could not go on",
        ok: false,
        detail: String(error.message).slice(0, 600),
      });
    }
    results.push({ id, ...writeReceipt(proof, run) });
  }
  terminal?.close();
  say();
  for (const result of results)
    say(`${result.id} ${result.verdict} ${result.file}`);
  if (!run.dryRun && run.proofs.includes("ms-p3"))
    say(
      `ms-p3 also needs a run on ${process.platform === "linux" ? "macOS" : "Linux"}: run this script there.`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
)
  await main();
