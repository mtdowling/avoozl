// Harness definition files (R94.1-R94.3, design §4.28). One JSON file per
// agent CLI in the machine config, never in a repository. Commands are argv
// lists with named placeholders; nothing is ever passed through a shell. A
// person approves each file's exact bytes by hash, as with the worktree helper
// (R83.4), and a changed file does not load until its new hash is approved.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import { fail } from "./store.mjs";
import { EXECUTOR_CONTRACT } from "./executors.mjs";
import { recordActivity } from "./activity-log.mjs";

export const HARNESS_DIRECTORY = "harnesses";
export const HARNESS_APPROVALS = "harness-approvals.json";
export const HARNESS_PLACEHOLDERS = Object.freeze([
  "worktree",
  "brief_file",
  "model",
  "session",
  // The session ID's UUID alone, for a CLI that takes a session UUID.
  "session_uuid",
  "message_file",
  "permission",
  "tmp",
  "project_cache_dirs",
  "project_allow_commands",
]);
export const PERMISSION_CLASSES = EXECUTOR_CONTRACT.permissionClasses;
export const HARNESS_UNCONFINED = "harness-unconfined.json";
const WRITE_ROOTS = ["{worktree}", "{tmp}", "{project_cache_dirs}"];
const NAME = /^[a-z][a-z0-9-]{0,60}$/;
const KEYS = new Set([
  "name",
  "start",
  "resume",
  "permission",
  "writeRoots",
  "allow",
  "cost",
  // Removed 2026-11-17 with budgets: skipped silently so an old definition
  // loads.
  "spendCap",
  "attach",
  "model",
  "promptFrom",
  "keepEnv",
  "tmpEnv",
  "resultAllow",
]);
// Variables a harness may keep to sign in to its own provider. Never a
// GitHub, git, SSH, Kiro Crew or Avoozl name: those stay out of a child.
const KEEP_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const NEVER_KEPT =
  /^(GH_|GITHUB_|GIT_|SSH_|KIROCREW_|KIRO_|AVOOZL_|AICOMMANDER_|NUPP_WORKSPACE)/;
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
// Parentheses are kept for tool patterns such as `Bash({command})`, and `*`
// for a prefix rule such as Claude Code's `Bash({command}:*)`; no shell ever
// reads an argv, and `$` and backticks stay refused.
const PLACEHOLDER_NEIGHBOR = /^[A-Za-z0-9_.=:/@+,()*-]*$/;
// Permission-skipping values. 47.2 adds the per-role permission classes; the
// refusal itself holds from the first loader so no definition can carry one.
const SKIP_VALUES = ["bypassPermissions", "danger-full-access"];
// The one exception (R94.4d): `permission.write` may be exactly this value,
// a harness's "no inner sandbox", for a CLI whose own sandbox cannot nest
// inside Avoozl's (Codex on macOS). confineChild then runs it only inside
// Avoozl's sandbox, with write roots, and refuses it everywhere else.
export const INNER_SANDBOX_OFF = "danger-full-access";

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
  const innerSandboxOff =
    record(value.permission) && value.permission.write === INNER_SANDBOX_OFF;
  const permission = innerSandboxOff
    ? Object.freeze({
        ...words(
          { ...value.permission, write: "placeholder" },
          "permission",
          source,
        ),
        write: INNER_SANDBOX_OFF,
      })
    : words(value.permission, "permission", source);
  if (innerSandboxOff && value.writeRoots === undefined)
    fail(
      `${source}: permission.write is ${INNER_SANDBOX_OFF}, so writeRoots must name where Avoozl's sandbox lets it write.`,
    );
  for (const key of Object.keys(permission))
    if (!PERMISSION_CLASSES.includes(key))
      fail(
        `${source}: permission.${key} is not a permission class (${PERMISSION_CLASSES.join(", ")}).`,
      );
  for (const role of PERMISSION_CLASSES)
    if (permission[role] === undefined)
      fail(`${source}: permission.${role} is required.`);
  const definition = {
    name: value.name,
    start: argv(value.start, "start", source),
    resume: argv(value.resume, "resume", source),
    permission,
  };
  // `resultAllow`: what a read-only session adds so its harness lets it
  // write its result file and nothing else (R96.1), such as Claude Code's
  // `--allowedTools Edit(.avoozl/result.json)`.
  for (const key of ["writeRoots", "allow", "resultAllow"])
    if (value[key] !== undefined)
      definition[key] = argv(value[key], key, source, { command: false });
  // A definition names where the CLI may write only by these placeholders,
  // so it can never widen the roots with a path of its own (R94.4).
  if (definition.writeRoots) {
    for (const [index, item] of definition.writeRoots.entries())
      if (!WRITE_ROOTS.includes(item))
        fail(
          `${source}: writeRoots[${index}] must be one of ${WRITE_ROOTS.join(", ")}.`,
        );
    if (!definition.writeRoots.includes("{worktree}"))
      fail(`${source}: writeRoots must include {worktree}.`);
  }
  // How to pass a model, appended only when a session names one (R94.1).
  if (value.model !== undefined)
    definition.model = argv(value.model, "model", source, { command: false });
  // "stdin": the brief (start) or message (resume) file is the child's
  // standard input. "file" (the default): argv names the file.
  if (value.promptFrom !== undefined) {
    if (!["stdin", "file"].includes(value.promptFrom))
      fail(`${source}: promptFrom must be "stdin" or "file".`);
    definition.promptFrom = value.promptFrom;
  }
  if (value.keepEnv !== undefined) {
    if (!Array.isArray(value.keepEnv))
      fail(`${source}: keepEnv must be a list of variable names.`);
    for (const name of value.keepEnv)
      if (
        typeof name !== "string" ||
        !KEEP_NAME.test(name) ||
        NEVER_KEPT.test(name)
      )
        fail(
          `${source}: keepEnv holds ${JSON.stringify(name)}; name only the harness's own sign-in variables.`,
        );
    definition.keepEnv = Object.freeze([...value.keepEnv]);
  }
  // Variables the supervisor sets to the session's own temp folder, besides
  // TMPDIR: a CLI that keeps its scratch files elsewhere by default (Claude
  // Code's Bash tool uses /tmp/claude-<uid>) would write outside its roots.
  if (value.tmpEnv !== undefined) {
    if (!Array.isArray(value.tmpEnv))
      fail(`${source}: tmpEnv must be a list of variable names.`);
    for (const name of value.tmpEnv)
      if (
        typeof name !== "string" ||
        !KEEP_NAME.test(name) ||
        NEVER_KEPT.test(name) ||
        /^(PATH|HOME)$/.test(name)
      )
        fail(
          `${source}: tmpEnv holds ${JSON.stringify(name)}; name only the CLI's own temp-folder variables.`,
        );
    definition.tmpEnv = Object.freeze([...value.tmpEnv]);
  }
  // What a person runs in the worktree to join the session (R98.1); In
  // flight shows it to copy. Avoozl never runs it.
  if (value.attach !== undefined)
    definition.attach = argv(value.attach, "attach", source);
  if (value.cost !== undefined) {
    const cost = words(value.cost, "cost", source);
    const field = { output: "field", file: "path" }[cost.from];
    // `per`: "run" (the default) when each run reports its own cost, so runs
    // are summed; "session" when it reports the session's running total, as
    // Claude Code does on a resume (P60), so the last value is the cost.
    const keys = Object.keys(cost).filter((key) => key !== "per");
    if (
      !field ||
      keys.join() !== `from,${field}` ||
      (cost.per !== undefined && !["run", "session"].includes(cost.per)) ||
      (cost.per !== undefined && cost.from !== "output")
    )
      fail(
        `${source}: cost must be {"from": "output", "field": ..., "per"?: "run" | "session"} or {"from": "file", "path": ...}.`,
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

// The definitions in this machine's config, for Settings › Models: each
// file's name and whether its exact bytes are approved. Reads only; a bad
// file still lists, and is refused when a session loads it.
export function listHarnessDefinitions(configDirectory) {
  if (typeof configDirectory !== "string" || !configDirectory) return [];
  const directory = path.join(path.resolve(configDirectory), HARNESS_DIRECTORY);
  if (!fs.existsSync(directory)) return [];
  const approvals = readApprovals(configDirectory);
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .filter((name) => NAME.test(name))
    .sort()
    .map((name) => ({
      name,
      approved:
        approvals[name] ===
        harnessDefinitionHash(
          fs.readFileSync(path.join(directory, `${name}.json`)),
        ),
    }));
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
// a list value (cache dirs, allow commands) expands to one argument per
// item, keeping the text around it (`Bash({project_allow_commands}:*)`), and
// is refused next to a second placeholder.
export function fillHarnessArgv(list, values) {
  return list.flatMap((item) => {
    const one = /^([^{}]*)\{([a-z_]+)\}([^{}]*)$/.exec(item);
    if (one && Array.isArray(values[one[2]]))
      return values[one[2]].map((value) => one[1] + String(value) + one[3]);
    return [
      item.replace(/\{([a-z_]+)\}/g, (_, key) => {
        const value = values[key];
        if (value === undefined || value === null)
          fail(`No value for placeholder {${key}}.`);
        if (Array.isArray(value))
          fail(
            `Placeholder {${key}} holds a list and cannot share an argument with another placeholder.`,
          );
        return String(value);
      }),
    ];
  });
}

const overlaps = (a, b) =>
  a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);

// A project's cache directories (`sandbox.writeRoots`, R94.4): absolute,
// never the filesystem root, the home folder or one above it, and never
// over the git directory, which the child must not reach (R94.4a).
export function sandboxWriteRoots(
  value,
  { gitCommonDir, home = os.homedir() } = {},
) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    fail("sandbox.writeRoots must be a list of absolute folder paths.");
  return value.map((item) => {
    if (!path.isAbsolute(item))
      fail(`sandbox.writeRoots holds ${item}; write an absolute path.`);
    const root = path.resolve(item);
    if (path.dirname(root) === root)
      fail(`sandbox.writeRoots holds the filesystem root ${root}.`);
    if (
      root === path.resolve(home) ||
      path.resolve(home).startsWith(root + path.sep)
    )
      fail(`sandbox.writeRoots holds ${root}, which holds the home folder.`);
    if (gitCommonDir && overlaps(root, path.resolve(gitCommonDir)))
      fail(
        `sandbox.writeRoots holds ${root}, which overlaps the git directory.`,
      );
    return root;
  });
}

function readUnconfined(configDirectory) {
  const file = path.join(path.resolve(configDirectory), HARNESS_UNCONFINED);
  if (!fs.existsSync(file)) return {};
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!record(value)) fail(`${file} must hold a JSON object.`);
  return value;
}

// The per-machine opt-in for a harness that cannot confine writes (R94.5).
// Person only: refused for any other actor and inside a worker child, and
// recorded in Activity. It names the approved hash, so a changed file needs
// a new opt-in. shortcut: callers pass the actor; once an operation exposes
// this, list it in PERSON_ONLY (mcp-policy.mjs) so MCP can never reach it.
export function allowUnconfinedWrites({
  store,
  configDirectory,
  name,
  hash,
  actor,
  env = process.env,
}) {
  if (actor !== "person" || env.AVOOZL_CHILD)
    fail(
      "Only a person lets a harness write outside the task folder on this machine.",
      403,
    );
  if (!store) fail("Recording the opt-in in Activity needs the store.");
  const definition = loadHarnessDefinition({ configDirectory, name });
  if (definition.hash !== hash)
    fail(
      `Harness ${name} is approved at ${definition.hash}, not ${hash}.`,
      409,
    );
  const allowed = { ...readUnconfined(configDirectory), [name]: hash };
  const file = path.join(path.resolve(configDirectory), HARNESS_UNCONFINED);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(allowed, null, 2) + "\n");
  fs.renameSync(temporary, file);
  recordActivity(store, {
    source: "local",
    actor: "person",
    kind: "harness.unconfined.allow",
    summary: `Let harness ${name} write outside the task folder on this machine (hash ${hash.slice(0, 12)}).`,
    targetId: name,
  });
  return allowed;
}

// What one session may do (R94.4, R94.5): the definition's value for the
// permission class, and the folders a write class may write. A read class
// writes only its temp and result folders. A write class writes the task folder, the temp folder and
// the project's cache folders; a harness with no way to confine writes runs
// a write class only with this machine's opt-in at its current hash.
export function harnessPermission(
  definition,
  {
    permissionClass,
    worktree,
    tmp,
    cacheDirs = [],
    gitCommonDir,
    configDirectory,
  },
) {
  if (!PERMISSION_CLASSES.includes(permissionClass))
    fail(`Permission class must be ${PERMISSION_CLASSES.join(" or ")}.`);
  const permission = definition.permission[permissionClass];
  // A read class writes only its own temp folder and its result folder
  // (R96.1), never the task folder itself.
  if (permissionClass === "read")
    return {
      permissionClass,
      permission,
      writeRoots: [
        ...(typeof tmp === "string" && path.isAbsolute(tmp)
          ? [path.resolve(tmp)]
          : []),
        ...(typeof worktree === "string" && path.isAbsolute(worktree)
          ? [path.join(path.resolve(worktree), ".avoozl")]
          : []),
      ],
    };
  if (typeof worktree !== "string" || !path.isAbsolute(worktree))
    fail("A write session needs the task folder as an absolute path.");
  // The session's own temp folder, never the shared one, which may hold
  // other checkouts and their git directories.
  if (typeof tmp !== "string" || !path.isAbsolute(tmp))
    fail("A write session needs its own temp folder as an absolute path.");
  if (!definition.writeRoots) {
    const allowed =
      configDirectory && readUnconfined(configDirectory)[definition.name];
    if (!allowed || allowed !== definition.hash)
      fail(
        `Harness ${definition.name} cannot keep writes in the task folder, so it runs read-only roles only. A person can allow it for write roles on this machine.`,
        409,
      );
    return { permissionClass, permission, writeRoots: null, unconfined: true };
  }
  const roots = [path.resolve(worktree), path.resolve(tmp)];
  if (gitCommonDir)
    for (const root of roots)
      if (overlaps(root, path.resolve(gitCommonDir)))
        fail(`Write root ${root} overlaps the git directory.`);
  const values = {
    worktree: roots[0],
    tmp: roots[1],
    project_cache_dirs: sandboxWriteRoots(cacheDirs, { gitCommonDir }),
  };
  return {
    permissionClass,
    permission,
    writeRoots: fillHarnessArgv(definition.writeRoots, values),
  };
}
