// Build receipts (RC32, design D37): what `bin/build-receipt` writes around a
// build or test command. One JSON line per run. Nothing here may change the
// command's output or exit code.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const RECEIPT_VERSION = 1;
// What the parser sees of the output, so a long build cannot fill memory.
export const OUTPUT_KEEP = 256 * 1024;
export const PARSER_TIMEOUT_MS = 10_000;
export const RECEIPT_FILE = "build-receipt.jsonl";

// `[--issue N] [--target T] [--task ID] [--attempt N] [--phase P] [--file F] -- command args...`
export function parseArguments(argv) {
  const out = { command: [] },
    split = argv.indexOf("--"),
    head = split < 0 ? argv : argv.slice(0, split);
  if (split >= 0) out.command = argv.slice(split + 1);
  for (let i = 0; i < head.length; i += 2) {
    const flag = head[i],
      value = head[i + 1];
    if (flag === "--issue") out.issue = value;
    else if (flag === "--target") out.target = value;
    else if (flag === "--task") out.task = value;
    else if (flag === "--attempt") out.attempt = value;
    else if (flag === "--phase") out.phase = value;
    else if (flag === "--file") out.file = value;
    else throw new Error(`Unknown option ${flag}.`);
  }
  return out;
}

// The repository's `receipts` setting from `.avoozl.json` in `cwd`, or {}.
export function receiptSettings(cwd) {
  try {
    const value = JSON.parse(
      fs.readFileSync(path.join(cwd, ".avoozl.json"), "utf8"),
    ).receipts;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const shell = (text, options = {}) =>
  spawnSync(text, { shell: true, encoding: "utf8", ...options });

// `warm` when the repository's check command exits 0, `cold` when it exits
// non-zero, `unknown` with no check or one that cannot run.
export function startOf(check, cwd, run = shell) {
  if (!check) return "unknown";
  const result = run(check, { cwd, stdio: "ignore" });
  if (result.error || result.status === null) return "unknown";
  return result.status === 0 ? "warm" : "cold";
}

// The parser reads the output on standard input and prints a JSON object of
// numbers. Anything else, or any failure, gives {}.
export function countersOf(parser, output, cwd, run = shell) {
  if (!parser) return {};
  try {
    const result = run(parser, {
      cwd,
      input: output,
      timeout: PARSER_TIMEOUT_MS,
    });
    if (result.error || result.status !== 0) return {};
    const value = JSON.parse(result.stdout);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, n]) => key.length <= 64 && Number.isFinite(n))
        .slice(0, 16),
    );
  } catch {
    return {};
  }
}

function commitOf(cwd) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

const taskOf = (value) => (value ? String(value).slice(0, 80) : null);
const attemptOf = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
};
const phaseOf = (value, command) => String(value || command).slice(0, 80);

// One receipt as the object it is written from.
export function buildReceipt({
  issue,
  task,
  attempt,
  phase,
  commit,
  command,
  target,
  start,
  ms,
  exit,
  counters,
  at,
}) {
  const number = Number(issue);
  return {
    v: RECEIPT_VERSION,
    issue: Number.isSafeInteger(number) && number > 0 ? number : null,
    task: taskOf(task),
    attempt: attemptOf(attempt),
    phase: phaseOf(phase, command),
    commit: commit ?? null,
    // Capped so one line stays far under the 2 KB CI summary limit.
    command: String(command).slice(0, 200),
    target: String(target).slice(0, 80),
    start,
    ms: Math.round(ms),
    exit,
    counters: counters ?? {},
    at,
  };
}

// Runs the command with its own output and exit code, then writes the
// receipt. Returns the exit code to exit with.
export async function wrap(
  argv,
  {
    env = process.env,
    cwd = process.cwd(),
    out = process.stdout,
    err = process.stderr,
    now = () => new Date(),
  } = {},
) {
  const options = parseArguments(argv);
  if (!options.command.length)
    throw new Error(
      "Usage: build-receipt [--issue N] [--target T] [--task ID] [--attempt N] [--phase P] [--file F] -- <command...>",
    );
  const settings = receiptSettings(cwd),
    start = startOf(settings.warmCheck, cwd),
    began = performance.now();
  let kept = "";
  const keep = (chunk) => {
    kept = (kept + chunk.toString()).slice(-OUTPUT_KEEP);
  };
  const exit = await new Promise((resolve) => {
    const child = spawn(options.command[0], options.command.slice(1), {
      cwd,
      env,
      shell: process.platform === "win32",
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      keep(chunk);
      out.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      keep(chunk);
      err.write(chunk);
    });
    child.on("error", (error) => {
      err.write(`${error.message}\n`);
      resolve(127);
    });
    child.on("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  const ms = performance.now() - began;
  try {
    const receipt = buildReceipt({
      issue: options.issue ?? env.AVOOZL_ISSUE,
      task: options.task ?? env.AVOOZL_TASK,
      attempt: options.attempt ?? env.AVOOZL_ATTEMPT ?? env.GITHUB_RUN_ATTEMPT,
      phase: options.phase,
      commit: commitOf(cwd),
      command: options.command.join(" "),
      target:
        options.target ??
        env.AVOOZL_TARGET ??
        `${process.platform}-${process.arch}/node${process.versions.node.split(".")[0]}`,
      start,
      ms,
      exit,
      counters: countersOf(settings.parser, kept, cwd),
      at: now().toISOString(),
    });
    const file = path.resolve(
      cwd,
      options.file ?? env.AVOOZL_RECEIPT_FILE ?? RECEIPT_FILE,
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(receipt) + "\n");
  } catch {
    // A receipt that cannot be written never changes the command's result.
  }
  return exit;
}

// One receipt line read back from an artifact: the fields it must have, or
// null. A version 1 line without task, attempt or phase still parses.
function parseLine(text) {
  try {
    const value = JSON.parse(text);
    if (
      value?.v !== RECEIPT_VERSION ||
      typeof value.command !== "string" ||
      !Number.isFinite(value.ms)
    )
      return null;
    return {
      v: value.v,
      issue: Number.isSafeInteger(value.issue) ? value.issue : null,
      task: taskOf(value.task),
      attempt: attemptOf(value.attempt),
      phase: phaseOf(value.phase, value.command),
      commit: typeof value.commit === "string" ? value.commit : null,
      command: value.command.slice(0, 200),
      target: String(value.target ?? "").slice(0, 80),
      start: ["cold", "warm"].includes(value.start) ? value.start : "unknown",
      ms: value.ms,
      exit: Number.isFinite(value.exit) ? value.exit : null,
      counters: Object.fromEntries(
        Object.entries(value.counters ?? {})
          .filter(([key, n]) => Number.isFinite(n) && key.length <= 64)
          .slice(0, 16),
      ),
      at: typeof value.at === "string" ? value.at : null,
    };
  } catch {
    return null;
  }
}

// Every line of a receipt file, in order, and how many lines were skipped.
export function parseReceipts(text) {
  const records = [];
  let skipped = 0;
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    const record = parseLine(line);
    if (record) records.push(record);
    else skipped += 1;
  }
  return { records, skipped };
}

// The last record of a receipt file, or null.
export const parseReceipt = (text) =>
  parseReceipts(text).records.at(-1) ?? null;
