// @ts-nocheck: typing debt
// Harness definition files (R94.1-R94.3, design §4.28). One JSON file per
// agent CLI in the machine config, never in a repository. Commands are argv
// lists with named placeholders; nothing is ever passed through a shell. A
// person approves each file's exact bytes by hash, as with the worktree helper
// (R83.4), and a changed file does not load until its new hash is approved.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import { fail } from "../store/store.ts";
import { EXECUTOR_CONTRACT } from "./executors.ts";
import { readMachineEnv } from "./machine-env.ts";
import { cachedProbe, harnessStartProblem } from "./harness-ready.ts";
import { egressProblem } from "./egress-proxy.ts";

const HARNESS_DIRECTORY = "harnesses";
const HARNESS_APPROVALS = "harness-approvals.json";
const HARNESS_PLACEHOLDERS = Object.freeze([
  "worktree",
  "brief_file",
  "model",
  "session",
  // The session ID's UUID alone, for a CLI that takes a session UUID.
  "session_uuid",
  "message_file",
  "permission",
  "tmp",
  "repository_cache_dirs",
  "repository_allow_commands",
  // The MCP config file of a session's epic context (epic-context EC7.1).
  "context_mcp",
  // A lane session's fixed header (simplify §D22).
  "lane_header",
]);
const PERMISSION_CLASSES = EXECUTOR_CONTRACT.permissionClasses;
export const HARNESS_UNCONFINED = "harness-unconfined.json";
const WRITE_ROOTS = ["{worktree}", "{tmp}", "{repository_cache_dirs}"];
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
  // The harness's own config under home that a confined child still reads,
  // such as Claude Code's ~/.claude and ~/.claude.json.
  "reads",
  "resultAllow",
  // The argv a harness adds to load one MCP config file of epic context:
  // {"mcp": [..., "{context_mcp}", ...]} (epic-context EC7.1).
  "context",
  // Where the harness output names the model that served the session
  // (NK5.2): {"from": "output", "field": ...}.
  "servedModel",
  // The role classes a live proof ran this definition in (NK6.2), for the
  // list in Settings › Models; nothing else reads it.
  "proved",
  // Lane sessions (simplify §D22.2): the variable naming the harness's home,
  // which a lane sets to its own folder; the argv that names a session; and
  // the folder under that home that holds the session files.
  "home",
  "label",
  "sessions",
  // The argv that checks the harness can sign in and answer, run once per
  // definition hash and machine.env (harness-probe.ts).
  "probe",
  // Files under home copied into a lane's or probe's own home before each
  // start, such as Claude Code's ~/.claude/settings.json, so its provider
  // settings reach the child.
  "homeFiles",
  // The hosts the session's egress proxy tunnels to (egress-proxy.ts),
  // such as its model's API. Without it the child has no network but its
  // repository's.
  "egress",
  // The argv Avoozl runs outside the sandbox before each start, whose
  // credential_process JSON gives the child short-lived AWS keys.
  "credentialExport",
  // Fixed variables the child gets, such as Codex's SSL_CERT_FILE.
  "setEnv",
]);
export const EXPORTED_AWS_KEYS = Object.freeze([
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
]);
// Files a definition may never copy into a child's home.
const NEVER_COPIED =
  /^~\/(?:\.ssh|\.aws|\.config\/gh|\.kiro|\.netrc|\.git-credentials|Library)(?:\/|$)|auth|credential|token|secret/i;
// A harness home variable: its own *_HOME or *_DIR, never HOME itself.
const HOME_NAME = /^[A-Z][A-Z0-9_]{0,58}_(?:HOME|DIR)$/;
const ROLE_CLASSES = Object.freeze(["read", "write"]);
// Variables a harness may keep to sign in to its own provider. Never a
// GitHub, git, SSH, Kiro Crew or Avoozl name: those stay out of a child.
const KEEP_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const NEVER_KEPT = /^(GH_|GITHUB_|GIT_|SSH_|KIROCREW_|KIRO_|AVOOZL_)/;
const SECRET_LIKE = /(TOKEN|SECRET|PASSW(OR)?D|API_?KEY|CREDENTIAL|AUTH)/i;
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

// One validated harness definition; a loaded one also carries its hash.
export interface HarnessDefinition {
  name: string;
  start: readonly string[];
  resume: readonly string[];
  permission: Readonly<Record<string, string>>;
  writeRoots?: readonly string[];
  allow?: readonly string[];
  resultAllow?: readonly string[];
  context?: { mcp: readonly string[] };
  proved?: string[];
  model?: readonly string[];
  promptFrom?: "stdin" | "file";
  keepEnv?: readonly string[];
  tmpEnv?: readonly string[];
  reads?: readonly string[];
  probe?: readonly string[];
  credentialExport?: readonly string[];
  egress?: readonly string[];
  setEnv?: Readonly<Record<string, string>>;
  homeFiles?: readonly string[];
  home?: string;
  label?: readonly string[];
  sessions?: string;
  attach?: readonly string[];
  servedModel?: { from: "output"; field: string };
  cost?: Readonly<Record<string, string>>;
  hash?: string;
}

// Validate one parsed definition. `source` names the file in every refusal.
export function parseHarnessDefinition(
  value: unknown,
  { source = "harness" } = {},
): Readonly<HarnessDefinition> {
  if (!record(value)) fail(`${source} must hold a JSON object.`);
  for (const key of Object.keys(value))
    if (!KEYS.has(key)) fail(`${source}: unknown key ${key}.`);
  if (typeof value.name !== "string" || !NAME.test(value.name))
    fail(
      `${source}: name must start with a lowercase letter and use only lowercase letters, numbers and hyphens.`,
    );
  // R94.4d, MS7.1: a class may turn the harness's own sandbox off, which
  // confineChild then runs only inside Avoozl's sandbox, with write roots.
  const innerOff = record(value.permission)
    ? Object.keys(value.permission).filter(
        (key) => value.permission[key] === INNER_SANDBOX_OFF,
      )
    : [];
  const permission = innerOff.length
    ? Object.freeze({
        ...words(
          {
            ...value.permission,
            ...Object.fromEntries(innerOff.map((key) => [key, "placeholder"])),
          },
          "permission",
          source,
        ),
        ...Object.fromEntries(innerOff.map((key) => [key, INNER_SANDBOX_OFF])),
      })
    : words(value.permission, "permission", source);
  if (innerOff.length && value.writeRoots === undefined)
    fail(
      `${source}: permission.${innerOff[0]} is ${INNER_SANDBOX_OFF}, so writeRoots must name where Avoozl's sandbox lets it write.`,
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
  // `--allowedTools Edit(/{worktree}/.avoozl/result.json)`.
  for (const key of ["writeRoots", "allow", "resultAllow"])
    if (value[key] !== undefined)
      definition[key] = argv(value[key], key, source, { command: false });
  if (value.context !== undefined) {
    if (!record(value.context) || Object.keys(value.context).join() !== "mcp")
      fail(`${source}: context must be {"mcp": [argv]}.`);
    const mcp = argv(value.context.mcp, "context.mcp", source, {
      command: false,
    });
    if (!mcp.some((item) => item.includes("{context_mcp}")))
      fail(`${source}: context.mcp must name {context_mcp}.`);
    definition.context = Object.freeze({ mcp });
  }
  if (value.proved !== undefined) {
    if (
      !Array.isArray(value.proved) ||
      value.proved.some((item) => !ROLE_CLASSES.includes(item)) ||
      new Set(value.proved).size !== value.proved.length
    )
      fail(`${source}: proved lists role classes, read or write, once each.`);
    definition.proved = [...value.proved];
  }
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
  if (value.reads !== undefined) {
    if (
      !Array.isArray(value.reads) ||
      value.reads.length > 20 ||
      value.reads.some(
        (item) =>
          typeof item !== "string" ||
          !/^~\/[^/]/.test(item) ||
          item.split("/").some((part) => part === ".." || part === "."),
      )
    )
      fail(
        `${source}: reads must be paths under home written as ~/..., such as ~/.claude.`,
      );
    definition.reads = Object.freeze([...value.reads]);
  }
  for (const key of ["probe", "credentialExport"])
    if (value[key] !== undefined) {
      definition[key] = argv(value[key], key, source);
      if (definition[key].some((item) => item.includes("{")))
        fail(`${source}: ${key} takes no placeholders.`);
    }
  if (value.egress !== undefined) {
    const problem = egressProblem(value.egress);
    if (problem) fail(`${source}: ${problem}`);
    definition.egress = Object.freeze(value.egress.map((h) => h.toLowerCase()));
  }
  if (value.setEnv !== undefined) {
    if (
      !record(value.setEnv) ||
      Object.entries(value.setEnv).some(
        ([key, item]) =>
          !KEEP_NAME.test(key) ||
          NEVER_KEPT.test(key) ||
          SECRET_LIKE.test(key) ||
          /^(PATH|HOME|HTTPS?_PROXY|NO_PROXY)$/i.test(key) ||
          key.startsWith("AWS_") ||
          typeof item !== "string" ||
          item.length > 1024,
      )
    )
      fail(
        `${source}: setEnv maps plain variable names to fixed text, such as {"SSL_CERT_FILE": "/etc/ssl/cert.pem"}; never a secret, PATH, HOME, a proxy or an AWS name.`,
      );
    definition.setEnv = Object.freeze({ ...value.setEnv });
  }
  if (value.homeFiles !== undefined) {
    if (
      !Array.isArray(value.homeFiles) ||
      value.homeFiles.length > 20 ||
      value.homeFiles.some(
        (item) =>
          typeof item !== "string" ||
          !/^~\/[^/]/.test(item) ||
          item.split("/").some((part) => part === ".." || part === ".") ||
          NEVER_COPIED.test(item),
      )
    )
      fail(
        `${source}: homeFiles must be config files under home written as ~/..., such as ~/.claude/settings.json, and never a credential.`,
      );
    if (value.home === undefined)
      fail(`${source}: homeFiles needs home, the folder they are copied to.`);
    definition.homeFiles = Object.freeze([...value.homeFiles]);
  }
  if (value.home !== undefined) {
    if (
      typeof value.home !== "string" ||
      !HOME_NAME.test(value.home) ||
      NEVER_KEPT.test(value.home)
    )
      fail(
        `${source}: home must name the harness's own home variable, such as CLAUDE_CONFIG_DIR or CODEX_HOME.`,
      );
    definition.home = value.home;
  }
  if (value.label !== undefined) {
    definition.label = argv(value.label, "label", source, { command: false });
    if (!definition.label.some((item) => item.includes("{lane_header}")))
      fail(`${source}: label must name {lane_header}.`);
  }
  if (value.sessions !== undefined) {
    if (
      typeof value.sessions !== "string" ||
      !/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(value.sessions)
    )
      fail(
        `${source}: sessions must be one folder name under the home, such as projects.`,
      );
    if (!definition.home)
      fail(`${source}: sessions needs home, the folder it sits in.`);
    definition.sessions = value.sessions;
  }
  // What a person runs in the worktree to join the session (R98.1); In
  // flight shows it to copy. Avoozl never runs it.
  if (value.attach !== undefined)
    definition.attach = argv(value.attach, "attach", source);
  if (value.servedModel !== undefined) {
    const served = value.servedModel;
    if (
      !served ||
      typeof served !== "object" ||
      Array.isArray(served) ||
      Object.keys(served).sort().join() !== "field,from" ||
      served.from !== "output" ||
      typeof served.field !== "string" ||
      !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(served.field)
    )
      fail(`${source}: servedModel must be {"from": "output", "field": ...}.`);
    definition.servedModel = { from: "output", field: served.field };
  }
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

// The file must exist as a regular file, never a symlink.
function requireRegularFile(file) {
  if (!fs.existsSync(file)) fail(`No harness definition at ${file}.`, 404);
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile())
    fail(`${file} must be a regular file and cannot be a symlink.`);
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
export function loadHarnessDefinition({
  configDirectory,
  name,
}: {
  configDirectory: string;
  name: string;
}): Readonly<HarnessDefinition & { hash: string }> {
  const file = harnessFile(configDirectory, name);
  requireRegularFile(file);
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
// file's name, whether its exact bytes are approved, and whether it can take
// a model (`model` is set). Reads only; a bad file still lists, and is
// refused when a session loads it.
// Why a definition cannot run a read-only role, or null (NK6.1). A read-only
// child writes its result file, and an output file, only where the
// definition's `resultAllow` lets its harness; one with none would fail on
// its first run.
// A read class with the harness's own sandbox off needs none: only Avoozl's
// sandbox limits it, and its write roots hold the result folder (MS7.1).
export function readRoleProblem(definition) {
  return definition?.resultAllow ||
    definition?.permission?.read === INNER_SANDBOX_OFF
    ? null
    : `${definition?.name ?? "This harness"} names no resultAllow, so a read-only session cannot write its result file.`;
}

function startProblemOf(value, configDirectory, probe) {
  let machineEnv = {};
  try {
    machineEnv = readMachineEnv(configDirectory);
  } catch (error) {
    return error.message;
  }
  return harnessStartProblem(value, { machineEnv, probe });
}

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
    .map((name) => {
      const bytes = fs.readFileSync(path.join(directory, `${name}.json`));
      let value = null;
      try {
        value = JSON.parse(bytes.toString("utf8"));
      } catch {
        // A bad file lists without a model; a session refuses it.
      }
      const hash = harnessDefinitionHash(bytes);
      // Read from the cache only: a probe is a model call, run only when a
      // person asks (harness.probe).
      const probe = cachedProbe(configDirectory, name, hash);
      return {
        name,
        path: path.join(directory, `${name}.json`),
        hash,
        approved: approvals[name] === hash,
        changed: Boolean(approvals[name]) && approvals[name] !== hash,
        model: value?.model !== undefined,
        readRoles: readRoleProblem({ name, resultAllow: value?.resultAllow }),
        // Why it cannot start on this machine's server, or null (MS5.3).
        startProblem: startProblemOf(value, configDirectory, probe),
        // Whether it names a probe, and the last answer at this hash.
        probes: Array.isArray(value?.probe),
        probe,
        proved: Array.isArray(value?.proved)
          ? value.proved.filter((item) => ROLE_CLASSES.includes(item))
          : [],
      };
    });
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

// A person's approval of one file as it is now: the hash is read here, so
// the caller shows the name, path and hash it approved.
export function approveHarnessByName({ configDirectory, name }) {
  const file = harnessFile(configDirectory, name);
  requireRegularFile(file);
  const hash = harnessDefinitionHash(fs.readFileSync(file));
  approveHarnessDefinition({ configDirectory, name, hash });
  return { name, path: file, hash, approved: true };
}

// Fill a validated argv list. Every placeholder used must have a value;
// a list value (cache dirs, allow commands) expands to one argument per
// item, keeping the text around it (`Bash({repository_allow_commands}:*)`), and
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

// A repository's cache directories (`sandbox.writeRoots`, R94.4): absolute,
// never the filesystem root, the home folder or one above it, and never
// over the git directory, which the child must not reach (R94.4a).
export function sandboxWriteRoots(
  value: unknown,
  {
    gitCommonDir,
    home = os.homedir(),
  }: { gitCommonDir?: string; home?: string } = {},
): string[] {
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

// What one session may do (R94.4, R94.5): the definition's value for the
// permission class, and the folders a write class may write. A read class
// writes only its temp and result folders. A write class writes the task folder, the temp folder and
// the repository's cache folders; a harness with no way to confine writes runs
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
  }: {
    permissionClass: string;
    worktree?: string;
    tmp?: string;
    cacheDirs?: unknown;
    gitCommonDir?: string;
    configDirectory?: string;
  },
) {
  if (!PERMISSION_CLASSES.includes(permissionClass))
    fail(`Permission class must be ${PERMISSION_CLASSES.join(" or ")}.`);
  const permission = definition.permission[permissionClass];
  // A read class writes only its own temp folder, its result folder
  // (R96.1) and the harness's own cache folders named in repository config
  // (Claude Code's config folder, P59), never the task folder itself.
  if (permissionClass === "read") {
    const task =
      typeof worktree === "string" && path.isAbsolute(worktree)
        ? path.resolve(worktree)
        : null;
    const caches = sandboxWriteRoots(cacheDirs, { gitCommonDir });
    for (const root of caches)
      if (task && overlaps(root, task))
        fail(
          `Cache folder ${root} overlaps the task folder, so a read-only session cannot have it.`,
        );
    return {
      permissionClass,
      permission,
      writeRoots: [
        ...(typeof tmp === "string" && path.isAbsolute(tmp)
          ? [path.resolve(tmp)]
          : []),
        ...(task ? [path.join(task, ".avoozl")] : []),
        ...caches,
      ],
    };
  }
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
  // No write root may hold a git directory (NK5.5): a checkout's own, or
  // one nested at its top, as a scratch folder over a clone would.
  for (const root of roots)
    if (
      fs
        .statSync(path.join(root, ".git"), { throwIfNoEntry: false })
        ?.isDirectory()
    )
      fail(`Write root ${root} holds a git directory.`);
  if (gitCommonDir)
    for (const root of roots)
      if (overlaps(root, path.resolve(gitCommonDir)))
        fail(`Write root ${root} overlaps the git directory.`);
  const values = {
    worktree: roots[0],
    tmp: roots[1],
    repository_cache_dirs: sandboxWriteRoots(cacheDirs, { gitCommonDir }),
  };
  return {
    permissionClass,
    permission,
    writeRoots: fillHarnessArgv(definition.writeRoots, values),
  };
}

// The home paths a confined child of this harness may read (its own
// config), resolved against `home`.
export const harnessReads = (definition, home = os.homedir()) =>
  (definition?.reads ?? []).map((item) => path.join(home, item.slice(2)));

// The harness reads a confined child gets past the secret denial, read only:
// the AWS config folder alone, for a harness that signs in to a cloud
// provider with the person's AWS profile (~/.aws in its reads).
export const harnessSecretReads = (definition, home = os.homedir()) => {
  const aws = path.join(home, ".aws");
  return harnessReads(definition, home).filter(
    (file) =>
      (file === aws || file.startsWith(aws + path.sep)) && fs.existsSync(file),
  );
};

// Copy the definition's homeFiles into `harnessHome`, the lane's or probe's
// own home, so the child's provider settings (Claude Code's settings.json,
// Codex's config.toml) are those of the person's home. A missing file is
// skipped; each start copies again, so an edit reaches the next session.
export function seedHarnessHome(definition, harnessHome, home = os.homedir()) {
  for (const item of definition?.homeFiles ?? []) {
    const from = path.join(home, item.slice(2));
    if (!fs.statSync(from, { throwIfNoEntry: false })?.isFile()) continue;
    const to = path.join(harnessHome, path.basename(from));
    const text = fs.readFileSync(from, "utf8");
    fs.writeFileSync(
      to,
      definition.credentialExport ? withoutCredentialHelpers(to, text) : text,
      { mode: 0o600 },
    );
    fs.chmodSync(to, 0o600);
  }
}

// With `credentialExport`, Avoozl gives the child its keys, so the copy
// drops the harness's own credential helper, which cannot reach its sign-in
// from the sandbox: Claude Code's `awsCredentialExport` and Codex's
// `[...credential_export]` tables.
// shortcut: these two shapes only; add a harness's own when one appears.
function withoutCredentialHelpers(file, text) {
  if (file.endsWith(".json"))
    try {
      const { awsCredentialExport, ...rest } = JSON.parse(text);
      void awsCredentialExport;
      return JSON.stringify(rest, null, 2) + "\n";
    } catch {
      return text;
    }
  if (!file.endsWith(".toml")) return text;
  let skip = false;
  return text
    .split("\n")
    .filter((line) => {
      if (/^\s*\[/.test(line))
        skip = /credential_export\]\s*(#.*)?$/.test(line.trim());
      return !skip;
    })
    .join("\n");
}
