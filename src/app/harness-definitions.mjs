// Harness definition files (R94.1-R94.3, design §4.28). One JSON file per
// agent CLI in the machine config, never in a repository. Commands are argv
// lists with named placeholders; nothing is ever passed through a shell. A
// person approves each file's exact bytes by hash, as with the worktree helper
// (R83.4), and a changed file does not load until its new hash is approved.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fail } from "./store.mjs";

export const HARNESS_DIRECTORY = "harnesses";
export const HARNESS_APPROVALS = "harness-approvals.json";
export const HARNESS_PLACEHOLDERS = Object.freeze([
  "worktree",
  "brief_file",
  "model",
  "session",
  "message_file",
  "permission",
  "tmp",
  "project_cache_dirs",
  "project_allow_commands",
  "budget_usd",
]);
const NAME = /^[a-z][a-z0-9-]{0,60}$/;
const KEYS = new Set([
  "name",
  "start",
  "resume",
  "permission",
  "writeRoots",
  "allow",
  "cost",
  "spendCap",
]);
const SHELLS = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "ksh",
  "csh",
  "tcsh",
  "cmd",
  "powershell",
  "pwsh",
]);
// Text around a placeholder: plain flag and path characters only, so a
// placeholder can never sit inside a shell operator or substitution.
const PLACEHOLDER_NEIGHBOR = /^[A-Za-z0-9_.=:/@+,-]*$/;
// Permission-skipping values. 47.2 adds the per-role permission classes; the
// refusal itself holds from the first loader so no definition can carry one.
const SKIP_VALUES = ["bypassPermissions", "danger-full-access"];

export const harnessDefinitionHash = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function argvValue(value, label, source) {
  if (typeof value !== "string" || !value)
    fail(`${source}: ${label} must be a nonempty string.`);
  for (const skip of SKIP_VALUES)
    if (value.includes(skip))
      fail(`${source}: ${label} holds ${skip}, which skips permissions.`);
  if (value.includes("--dangerously-"))
    fail(`${source}: ${label} is ${value}, which skips permissions.`);
  const parts = value.split(/(\{[^{}]*\})/);
  const named = [];
  parts.forEach((part, index) => {
    if (index % 2) {
      const key = part.slice(1, -1);
      if (!HARNESS_PLACEHOLDERS.includes(key))
        fail(`${source}: ${label} uses unknown placeholder ${part}.`);
      named.push(key);
    } else if (/[{}]/.test(part))
      fail(`${source}: ${label} has a stray brace: ${value}`);
  });
  if (
    named.length &&
    !parts.every((p, i) => i % 2 || PLACEHOLDER_NEIGHBOR.test(p))
  )
    fail(`${source}: ${label} puts a placeholder next to shell text: ${value}`);
  return value;
}

function argv(value, label, source, { command = true } = {}) {
  if (typeof value === "string")
    fail(
      `${source}: ${label} is a shell string; write it as an argv list of strings.`,
    );
  if (!Array.isArray(value) || !value.length)
    fail(`${source}: ${label} must be a nonempty argv list of strings.`);
  if (command && typeof value[0] === "string") {
    const program = value[0];
    if (/\s/.test(program))
      fail(
        `${source}: ${label}[0] holds spaces; write each argument as its own string.`,
      );
    if (program.includes("{"))
      fail(`${source}: ${label}[0] must name the program, not a placeholder.`);
    const base = path.basename(program.replace(/\\/g, "/")).toLowerCase();
    if (SHELLS.has(base.replace(/\.exe$/, "")))
      fail(
        `${source}: ${label} runs a shell (${program}); name the CLI itself.`,
      );
  }
  value.forEach((item, index) => argvValue(item, `${label}[${index}]`, source));
  return Object.freeze([...value]);
}

function words(value, label, source) {
  if (!record(value)) fail(`${source}: ${label} must be an object.`);
  for (const [key, item] of Object.entries(value))
    argvValue(item, `${label}.${key}`, source);
  return Object.freeze({ ...value });
}

// Validate one parsed definition. `source` names the file in every refusal.
export function parseHarnessDefinition(value, { source = "harness" } = {}) {
  if (!record(value)) fail(`${source} must hold a JSON object.`);
  for (const key of Object.keys(value))
    if (!KEYS.has(key)) fail(`${source}: unknown key ${key}.`);
  if (typeof value.name !== "string" || !NAME.test(value.name))
    fail(
      `${source}: name must start with a lowercase letter and use only lowercase letters, numbers and hyphens.`,
    );
  const permission = words(value.permission, "permission", source);
  for (const role of ["write", "read"])
    if (permission[role] === undefined)
      fail(`${source}: permission.${role} is required.`);
  const definition = {
    name: value.name,
    start: argv(value.start, "start", source),
    resume: argv(value.resume, "resume", source),
    permission,
  };
  for (const key of ["writeRoots", "allow"])
    if (value[key] !== undefined)
      definition[key] = argv(value[key], key, source, { command: false });
  if (value.spendCap !== undefined)
    definition.spendCap = argv(value.spendCap, "spendCap", source, {
      command: false,
    });
  if (value.cost !== undefined) {
    const cost = words(value.cost, "cost", source);
    const field = { output: "field", file: "path" }[cost.from];
    if (!field || Object.keys(cost).join() !== `from,${field}`)
      fail(
        `${source}: cost must be {"from": "output", "field": ...} or {"from": "file", "path": ...}.`,
      );
    definition.cost = cost;
  }
  return Object.freeze(definition);
}

function insideRepository(directory) {
  for (let at = path.resolve(directory); ; at = path.dirname(at)) {
    if (fs.existsSync(path.join(at, ".git"))) return at;
    if (path.dirname(at) === at) return null;
  }
}

function harnessFile(configDirectory, name) {
  if (typeof configDirectory !== "string" || !configDirectory)
    fail("The machine config directory is required to load a harness.");
  if (typeof name !== "string" || !NAME.test(name))
    fail(`Harness name ${JSON.stringify(name)} is not valid.`);
  const directory = path.join(path.resolve(configDirectory), HARNESS_DIRECTORY);
  const repository = insideRepository(directory);
  if (repository)
    fail(
      `Harness definitions live in the machine config, never in a repository; ${directory} is inside ${repository}.`,
    );
  return path.join(directory, name + ".json");
}

function readApprovals(configDirectory) {
  const file = path.join(path.resolve(configDirectory), HARNESS_APPROVALS);
  if (!fs.existsSync(file)) return {};
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!record(value)) fail(`${file} must hold a JSON object.`);
  return value;
}

// Load and check one definition: a regular file, approved at its exact
// hash, valid as a definition. Every refusal names the file.
export function loadHarnessDefinition({ configDirectory, name }) {
  const file = harnessFile(configDirectory, name);
  if (!fs.existsSync(file)) fail(`No harness definition at ${file}.`, 404);
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile())
    fail(`${file} must be a regular file and cannot be a symlink.`);
  const bytes = fs.readFileSync(file);
  const seen = harnessDefinitionHash(bytes);
  const approved = readApprovals(configDirectory)[name];
  if (approved !== seen)
    fail(
      `${file} decides what runs unattended. Read it, then approve this exact ` +
        `version (hash ${seen}) for harness ${name}` +
        (approved ? " (the approved version differs)." : "."),
      409,
    );
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }
  const definition = parseHarnessDefinition(value, { source: file });
  if (definition.name !== name)
    fail(`${file}: name is ${definition.name}, but the file is named ${name}.`);
  return Object.freeze({ ...definition, hash: seen });
}

// Record a person's approval of one exact hash. Callers enforce that a
// person, not an agent, asked for it.
export function approveHarnessDefinition({ configDirectory, name, hash }) {
  harnessFile(configDirectory, name);
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash))
    fail("A harness approval must be the file's SHA-256 hash.");
  const approvals = { ...readApprovals(configDirectory), [name]: hash };
  const file = path.join(path.resolve(configDirectory), HARNESS_APPROVALS);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(approvals, null, 2) + "\n");
  fs.renameSync(temporary, file);
  return approvals;
}

// Fill a validated argv list. Every placeholder used must have a value;
// list values (cache dirs, allow commands) expand to one argument each when
// they fill a whole argument, and are refused inside one.
export function fillHarnessArgv(list, values) {
  return list.flatMap((item) => {
    const whole = /^\{([a-z_]+)\}$/.exec(item);
    if (whole && Array.isArray(values[whole[1]]))
      return values[whole[1]].map(String);
    return [
      item.replace(/\{([a-z_]+)\}/g, (_, key) => {
        const value = values[key];
        if (value === undefined || value === null)
          fail(`No value for placeholder {${key}}.`);
        if (Array.isArray(value))
          fail(
            `Placeholder {${key}} holds a list and must fill a whole argument.`,
          );
        return String(value);
      }),
    ];
  });
}
