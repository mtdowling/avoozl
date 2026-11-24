// Content rules (design §4.9, Requirement 40). One matcher for banned terms
// at every boundary where Avoozl writes or approves content.
//
// Two layers: `.avoozl.json` `contentRules.sets` names which rule sets apply,
// where, and with which action; the rules themselves come only from a private
// terms file outside Git or from an approved `rules` plugin. A finding names
// the set, the rule id, the boundary, the target and the line, and never the
// matched text, so receipts, events, decisions, notifications and logs cannot
// repeat a private term.
//
// The plans-repo leak screen, the reply screen and the published-secrets
// screen are the built-in sets at the bottom of this file. They keep today's
// patterns, decoding, boundaries and refusal messages, and nothing in
// configuration reaches them.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MessageChannel,
  type MessagePort,
  Worker,
  receiveMessageOnPort,
} from "node:worker_threads";
import { globalAvoozlConfigPath } from "../settings/layered-config.ts";
import { type Notice, queueNotifications } from "../tick/notifications.ts";
import { PRIVACY_SET, privacyHits, privacyRules } from "./privacy.ts";
import { fail } from "../store/store.ts";
import type { Store } from "../store/store.ts";

// One line of text a write would publish, and where it sits.
export interface ContentLine {
  target: string;
  line: number;
  text: string;
}
// One rule match: the set, rule and place, never the matched text.
export interface Finding {
  set: string;
  rule: string;
  boundary?: string;
  target: string;
  line?: number;
  action: string;
  version?: string;
}
// What check answers.
export interface CheckResult {
  findings: Finding[];
  unavailable: { set: string; reason: string }[];
  allowed?: unknown[];
}
import { personPosting, postedText } from "../github/github-posted.ts";
import { branchRefs } from "../git/git.ts";

// A JSON object.
type Obj = Record<string, unknown>;
// One rule a set matches: its id, its pattern, and its allow patterns.
interface Rule {
  id: string;
  source: string;
  allow?: string[];
}
// A configured rule set, as validateContentRules checks it.
interface RuleSet {
  id: string;
  action: string;
  boundaries: string[] | null;
  repositories: string[] | null;
  plugin: string | null;
  remote: string;
}
// A set with its rules, or why it is unavailable.
type ResolvedSet = Omit<RuleSet, "plugin" | "remote"> & {
  plugin?: string | null;
  remote?: string;
  source: string;
  available: boolean;
  reason?: string;
  termsFrom?: string;
  version?: string;
  ruleCount?: number;
  rules?: Rule[];
};
// The sets one rules plugin supplied, in memory only (R40.9).
interface LoadedPlugin {
  loadedAt: number;
  sets?: Map<string, { version: string; rules: Rule[] }>;
  error?: string;
}
// What one store's content rules read: where, and the plugins' sets.
interface Binding {
  workspaceRoot: string | null;
  configFile: string;
  pluginSettingsFile: string | null;
  timeoutMs: number;
  machine: { hostname: string; username: string } | null;
  plugins: Map<string, LoadedPlugin>;
}
// A rule set a check could not use.
type Unavailable = { set: string; reason: string };
// Where a matched line can be read again on demand.
type LineSource = {
  kind: string;
  path?: string;
  root?: string;
  commit?: string;
  file?: string;
  [key: string]: unknown;
} | null;
// One content_decisions row.
interface Decision {
  id: string;
  kind: string;
  state: string;
  set: string;
  rules?: string[];
  findings?: Omit<Finding, "action">[];
  boundary?: string;
  repository?: string | null;
  target?: string;
  line?: number;
  taskId?: string | null;
  source?: LineSource;
  contentHash?: string;
  reason?: string;
  openedAt?: string;
  [key: string]: unknown;
}
// One content_allowances row: a person's allow once (R40.7).
interface Allowance {
  id: string;
  set: string;
  rule: string;
  target?: string;
  contentHash?: string;
  usedAt?: string | null;
  [key: string]: unknown;
}
// A notice content rules queue, with the target it names.
type ContentNotice = Notice & {
  channel: string;
  title: string;
  text: string;
  target?: string;
};
// What enforce is given: a check's input.
type EnforceInput = Parameters<typeof check>[1];
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const fieldOf = (value: unknown, key: string): unknown =>
  record(value) ? value[key] : undefined;
const fieldsOf = (value: unknown): Obj => (record(value) ? value : {});
// A refusal with its status and what refused it.
const refusal = (message: string, fields: Obj) =>
  Object.assign(Error(message), fields);
// A write content rules refused (enforce in refuse mode): a 422 naming
// the findings and the unavailable sets.
export class ContentRefusal extends Error {
  status = 422;
  findings: Finding[];
  unavailable: Unavailable[];
  constructor(
    message: string,
    findings: Finding[],
    unavailable: Unavailable[],
  ) {
    super(message);
    this.findings = findings;
    this.unavailable = unavailable;
  }
}

// `intake` screens incoming items (design §4.12) and runs only for a set
// that names it, so GitHub intake is unchanged unless the owner asks.
// `proposal` screens retro proposals (design §4.18); every set covers them
// unless it narrows.
// `activity` screens each activity log row (§4.19); a matching row is saved
// redacted, so no decision opens. `notes` screens each task link and note
// when it is saved (§4.16); like `plan`, every set covers it by default.
// A boundary Avoozl no longer checks. A saved set may still list it; it
// matches nothing. `lesson` went with the lessons store (RC30.4).
export const BOUNDARIES = Object.freeze([
  "plan",
  "github",
  "brief",
  "diff",
  "intake",
  "proposal",
  "activity",
]);
const OPT_IN = new Set(["intake"]);
export const ACTIONS = Object.freeze(["block", "report"]);
export const CHECK_TIMEOUT_MS = 2000;
const SET_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// Keys that could hold a rule; `.avoozl.json` never does (R40.1).
const RULE_KEYS = new Set(["terms", "patterns", "rules", "pattern", "regex"]);
const MAX_RULES = 2000;
const MAX_TERMS_BYTES = 1024 * 1024;

const record = (value: unknown): value is Obj =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const sha256 = (text: unknown) =>
  createHash("sha256")
    .update(String(text ?? ""))
    .digest("hex");

// Public rules for text that will be published: secrets and machine paths.
// The release scan (scripts/check/release-scan.ts) and the Onboard flow's leak
// scan of a public repository's specs share them. Private names are never
// written here; they come from a terms file.
export const PUBLISH_RULES = Object.freeze(
  [
    ["secret", "aws-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
    [
      "secret",
      "github-token",
      /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{22,}/,
    ],
    ["secret", "private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["secret", "slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
    ["secret", "api-key", /\bsk-(?:ant|proj)-[A-Za-z0-9_-]{12,}/],
    ["absolute-path", "macos-home", /\/Users\/[A-Za-z0-9._-]+/],
    ["absolute-path", "macos-temp", /\/private\/(?:tmp|var)\//],
    ["absolute-path", "linux-home", /\/home\/[a-z][a-z0-9_-]*\//],
    ["absolute-path", "windows-home", /\b[A-Za-z]:\\+Users\\+/],
  ].map(([category, rule, pattern]) => ({
    category: category as string,
    rule: rule as string,
    pattern: pattern as RegExp,
  })),
);

// ---------------------------------------------------------------------------
// Terms files: `rule: regex` per line, `#` comments, matched per line ignoring
// case. The release scan reads the same format (F67). An allow line cancels
// a false positive on the same line (R40.15): `allow: regex` for every rule
// in the file, `allow <rule>: regex` for one. Problems name a line number,
// never the text on it.

const ALLOW_NAME = /^allow(?:\s+(.*))?$/i;

// {rules: [{line, rule, source}], allows: [{line, rule|null, source}],
// errors: [{line, message}], lines, allowLines} for one terms file's text.
function readTermLines(text: unknown) {
  const rules: { line: number; rule: string; source: string }[] = [],
    allows: { line: number; rule: string | null; source: string }[] = [],
    errors: { line: number; message: string }[] = [];
  let lines = 0,
    allowLines = 0;
  String(text ?? "")
    .split("\n")
    .forEach((raw, i) => {
      const line = raw.trim(),
        n = i + 1;
      if (!line || line.startsWith("#")) return;
      lines += 1;
      const at = line.indexOf(":");
      if (at < 1)
        return errors.push({
          line: n,
          message: "needs a name, a colon, then the word or pattern",
        });
      const name = line.slice(0, at).trim(),
        source = line.slice(at + 1).trim(),
        allow = ALLOW_NAME.exec(name);
      if (allow) allowLines += 1;
      if (!source)
        return errors.push({
          line: n,
          message: allow
            ? "allows nothing: give a word or pattern after the colon"
            : "has a name but nothing to match",
        });
      try {
        new RegExp(source, "i");
      } catch (error) {
        // The engine's message repeats the pattern; keep only its reason.
        const reason = messageOf(error).split(": ").pop();
        return errors.push({
          line: n,
          message: `the ${allow ? "allow " : ""}pattern does not compile (${reason})`,
        });
      }
      if (allow)
        allows.push({ line: n, rule: allow[1]?.trim() || null, source });
      else rules.push({ line: n, rule: name, source });
    });
  const names = new Set(rules.map((r) => r.rule));
  for (const allow of allows)
    if (allow.rule && !names.has(allow.rule))
      errors.push({
        line: allow.line,
        message: "allows a rule this file does not have",
      });
  errors.sort((a, b) => a.line - b.line);
  return { rules, allows, errors, lines, allowLines };
}

// [{category, rule, pattern, allow: [RegExp]}]; throws on the first problem.
export function parseTerms(text: unknown, { category = "private-name" } = {}) {
  const { rules, allows, errors } = readTermLines(text);
  if (errors.length) {
    const [first] = errors;
    throw Error(
      /needs a name/.test(first.message)
        ? `Terms need "rule: regex" (line ${first.line})`
        : `Terms line ${first.line} ${first.message}`,
    );
  }
  return rules.map(({ rule, source }) => ({
    category,
    rule,
    pattern: new RegExp(source, "i"),
    allow: allows
      .filter((a) => !a.rule || a.rule === rule)
      .map((a) => new RegExp(a.source, "i")),
  }));
}

// The rules of `parseTerms` whose pattern matches `line` and no allow
// pattern of that rule does.
export function matchLine<R extends { pattern: RegExp; allow?: RegExp[] }>(
  line: string,
  rules: readonly R[],
) {
  return rules.filter(
    ({ pattern, allow }) =>
      pattern.test(line) && !(allow || []).some((a) => a.test(line)),
  );
}

// Undo the encodings a term can hide behind: percent escapes (repeated, for
// double encoding), numeric HTML entities, backslash escapes and zero-width
// characters (moved from github-plans-repo.mjs, F68).
export function decode(text: unknown) {
  let value = String(text ?? "");
  for (let round = 0; round < 3; round += 1) {
    const next = value
      .replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/&#(x[0-9a-f]{1,6}|[0-9]{1,7});/gi, (match, code: string) => {
        const point =
          code[0]?.toLowerCase() === "x"
            ? parseInt(code.slice(1), 16)
            : Number(code);
        return point <= 0x10ffff ? String.fromCodePoint(point) : match;
      });
    if (next === value) break;
    value = next;
  }
  return value.replace(/[\\\u200b-\u200d\u2060\ufeff]/g, "");
}

// ---------------------------------------------------------------------------
// Matching runs in a worker thread with a time limit: rules come from people
// the machine's owner trusts, but the text is untrusted, and a synchronous
// regex cannot be stopped from the thread running it. The caller blocks on
// an Atomics wait, so every boundary keeps a synchronous check.

const WORKER_SOURCE = `
const { workerData } = require("node:worker_threads");
const flag = new Int32Array(workerData.flag), port = workerData.port;
const compiled = new Map();
const decode = ${decode.toString()};
port.on("message", ({ key, rules, lines }) => {
  let reply;
  try {
    let list = compiled.get(key);
    if (!list) {
      list = rules.map((r) => ({
        set: r.set,
        rule: r.rule,
        re: new RegExp(r.source, "i"),
        allow: (r.allow || []).map((s) => new RegExp(s, "i")),
      }));
      compiled.set(key, list);
    }
    const hits = [], allowed = {};
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i], plain = decode(raw);
      const on = (re) => re.test(raw) || (plain !== raw && re.test(plain));
      for (const r of list)
        if (on(r.re)) {
          if (!r.allow.some(on)) hits.push([i, r.set, r.rule]);
          else {
            const k = r.set + "\\0" + r.rule;
            allowed[k] = (allowed[k] || 0) + 1;
          }
        }
    }
    reply = { hits, allowed };
  } catch (error) {
    reply = { error: String(error && error.message || error) };
  }
  port.postMessage(reply);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
// Ready: the caller starts the match clock only after this.
Atomics.store(flag, 0, 1);
Atomics.notify(flag, 0);
`;

// How long a new worker may take to start. Startup is not matching, so it
// is kept out of the time limit: a loaded host must not fail a check closed.
const START_TIMEOUT_MS = 30_000;

let runner: {
  worker: Worker;
  port: MessagePort;
  flag: Int32Array;
} | null = null;
function startRunner() {
  const flag = new SharedArrayBuffer(4),
    { port1, port2 } = new MessageChannel(),
    worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { flag, port: port2 },
      transferList: [port2],
    });
  worker.unref();
  port1.unref();
  worker.on("error", () => {
    if (runner?.worker === worker) runner = null;
  });
  const view = new Int32Array(flag);
  if (Atomics.wait(view, 0, 0, START_TIMEOUT_MS) === "timed-out") {
    worker.terminate();
    throw refusal("the matching worker did not start", { timeout: true });
  }
  return { worker, port: port1, flag: view };
}

// {hits: [{index, set, rule}], allowed: [{set, rule, count}]}: a rule with
// `allow` sources drops a match when one of them matches the same line, and
// only the count is kept (R40.15).
function matchLinesInWorker(
  rules: (Omit<Rule, "id"> & { set: string; rule: string })[],
  lines: string[],
  { timeoutMs = CHECK_TIMEOUT_MS } = {},
) {
  if (!rules.length || !lines.length) return { hits: [], allowed: [] };
  const started = (runner ||= startRunner()),
    { port, flag } = started,
    key = sha256(JSON.stringify(rules));
  Atomics.store(flag, 0, 0);
  port.postMessage({ key, rules, lines });
  if (Atomics.wait(flag, 0, 0, timeoutMs) === "timed-out") {
    runner = null;
    started.worker.terminate();
    throw refusal(
      `matching ran past the ${Math.round(timeoutMs / 100) / 10} s time limit`,
      { timeout: true },
    );
  }
  // The worker's reply (WORKER_SOURCE).
  const reply: {
    error?: string;
    hits: [number, string, string][];
    allowed?: Record<string, number>;
  } | null = receiveMessageOnPort(port)?.message;
  if (!reply || reply.error) throw Error(reply?.error || "matching failed");
  return {
    hits: reply.hits.map(([index, set, rule]) => ({ index, set, rule })),
    allowed: Object.entries(reply.allowed || {}).map(([key, count]) => {
      const [set, rule] = key.split("\0");
      return { set, rule, count };
    }),
  };
}

// ---------------------------------------------------------------------------
// Policy: `.avoozl.json` `contentRules` (§4.4, §4.9).

function refuseRuleKeys(value: unknown, where: string): void {
  if (Array.isArray(value))
    return value.forEach((item, i) => refuseRuleKeys(item, `${where}.${i}`));
  if (!record(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (RULE_KEYS.has(key))
      fail(
        `${where}.${key} could hold a rule. Keep rules in a terms file outside Git or in a rules plugin, never in .avoozl.json.`,
      );
    refuseRuleKeys(child, `${where}.${key}`);
  }
}

export const CONTENT_RULES_KEYS = ["sets"];
export const RULE_SET_KEYS = [
  "id",
  "action",
  "boundaries",
  "repositories",
  "plugin",
  "remote",
];

// The validated `contentRules` of a policy: {sets: [{id, action, boundaries,
// repositories, plugin}]}. `pluginIds` and `repositories`, when given, are
// the ids the set may name.
export function validateContentRules(
  value: unknown,
  {
    pluginIds = null,
    repositories = null,
  }: {
    pluginIds?: string[] | null;
    repositories?: Iterable<string> | null;
  } = {},
): { sets: RuleSet[] } {
  if (value === undefined || value === null) return { sets: [] };
  refuseRuleKeys(value, "contentRules");
  if (!record(value)) fail("contentRules must be an object.");
  for (const key of Object.keys(value))
    if (!CONTENT_RULES_KEYS.includes(key))
      fail(`contentRules.${key} is not a content rules setting.`);
  const list = value.sets ?? [];
  if (!Array.isArray(list)) fail("contentRules.sets must be a list.");
  const seen = new Set<string>();
  const sets = list.map((entry, i) => {
    const where = `contentRules.sets.${i}`;
    if (!record(entry)) fail(`${where} must be an object.`);
    for (const key of Object.keys(entry))
      if (!RULE_SET_KEYS.includes(key))
        fail(`${where}.${key} is not a rule set setting.`);
    if (typeof entry.id !== "string" || !entry.id)
      fail(`${where}.id must name the rule set.`);
    if (entry.id.toLowerCase().startsWith("builtin:"))
      fail(
        `${where}.id ${entry.id} is reserved: built-in rule sets cannot be configured.`,
      );
    if (!SET_ID.test(entry.id))
      fail(
        `${where}.id must be lowercase letters, digits, dots, dashes or underscores.`,
      );
    if (seen.has(entry.id)) fail(`Rule set ${entry.id} is named twice.`);
    seen.add(entry.id);
    const action = entry.action ?? "block";
    if (action !== "block" && action !== "report")
      fail(`${where}.action must be block or report.`);
    let boundaries: string[] | null = null;
    if (entry.boundaries !== undefined) {
      if (
        !Array.isArray(entry.boundaries) ||
        !entry.boundaries.length ||
        entry.boundaries.some((b) => !BOUNDARIES.includes(String(b)))
      )
        fail(`${where}.boundaries may list only ${BOUNDARIES.join(", ")}.`);
      boundaries = [...new Set(entry.boundaries.map(String))];
    }
    let repos: string[] | null = null;
    if (entry.repositories !== undefined) {
      if (
        !Array.isArray(entry.repositories) ||
        !entry.repositories.length ||
        entry.repositories.some((r) => typeof r !== "string" || !r.trim())
      )
        fail(`${where}.repositories must list registered repositories.`);
      if (repositories) {
        const known = new Set([...repositories].map((r) => r.toLowerCase()));
        for (const name of entry.repositories.map(String))
          if (!known.has(name.toLowerCase()))
            fail(
              `${where}.repositories names ${name}, which is not a registered repository.`,
            );
      }
      repos = entry.repositories.map(String);
    }
    if (entry.plugin !== undefined) {
      if (typeof entry.plugin !== "string" || !entry.plugin)
        fail(`${where}.plugin must name a plugins entry.`);
      if (pluginIds && !pluginIds.includes(entry.plugin))
        fail(`${where}.plugin ${entry.plugin} names no plugins entry.`);
    }
    // Remote crews (§4.10, R41.11): a set covering `diff` forbids them by
    // default, because its pre-push hook is installed only on this machine.
    const remote = entry.remote;
    if (remote !== undefined && remote !== "allow" && remote !== "forbid")
      fail(`${where}.remote must be allow or forbid.`);
    return {
      id: entry.id,
      action,
      boundaries,
      repositories: repos,
      plugin: typeof entry.plugin === "string" ? entry.plugin : null,
      remote:
        remote ??
        (!boundaries || boundaries.includes("diff") ? "forbid" : "allow"),
    };
  });
  return { sets };
}

// The ids `.avoozl.json` plugins entries and machine plugin settings declare.
function declaredPluginIds(policy: Obj, settingsFile: string) {
  const idsOf = (list: unknown) =>
      (Array.isArray(list) ? list : []).flatMap((p) => {
        const id = fieldOf(p, "id");
        return typeof id === "string" && id ? [id] : [];
      }),
    ids = idsOf(policy.plugins);
  try {
    const machine: unknown = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    ids.push(...idsOf(fieldOf(machine, "plugins")));
  } catch {}
  return ids;
}

// ---------------------------------------------------------------------------
// Terms file location and the Git check (§4.9, F74).

function machineTerms(configFile: string): Obj {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(configFile, "utf8")),
      terms = fieldOf(fieldOf(value, "contentRules"), "terms");
    return record(terms) ? terms : {};
  } catch {
    return {};
  }
}

const expand = (file: string, base: string) =>
  file.startsWith("~/")
    ? path.join(os.homedir(), file.slice(2))
    : path.resolve(base, file);

function termsFileFor(
  id: string,
  { workspaceRoot, configFile }: Pick<Binding, "workspaceRoot" | "configFile">,
) {
  const named = machineTerms(configFile)[id];
  if (typeof named === "string" && named.trim())
    return {
      file: expand(named.trim(), path.dirname(configFile)),
      from: "machine",
    };
  return {
    file: workspaceRoot
      ? path.join(
          workspaceRoot,
          ".avoozl",
          "local",
          "content-rules",
          `${id}.txt`,
        )
      : null,
    from: "workspace",
  };
}

// Why Git could publish this file, or null. A file Git tracks, or one inside
// a work tree that Git does not ignore, is refused (R40.2).
// Git run inside a hook inherits GIT_DIR and friends, which would point every
// command at the pushing repository; each command here names its own folder.
function gitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_PREFIX",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ])
    delete env[name];
  return env;
}

export function gitExposure(file: string) {
  const folder = path.dirname(file),
    run = (args: string[]) =>
      execFileSync("git", args, {
        cwd: folder,
        encoding: "utf8",
        env: gitEnvironment(),
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
  // Git finds a work tree through a `.git` in the folder or one above it,
  // from the folder's real path. With none, Git would answer "not inside",
  // so no Git process is started: this check runs on every guarded write.
  let up: string;
  try {
    up = fs.realpathSync(folder);
  } catch {
    return null;
  }
  while (!fs.existsSync(path.join(up, ".git"))) {
    if (path.dirname(up) === up) return null;
    up = path.dirname(up);
  }
  let inside = false;
  try {
    inside = run(["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return null;
  }
  if (!inside) return null;
  const name = path.basename(file);
  try {
    if (run(["ls-files", "--", name])) return "Git tracks it";
  } catch {}
  try {
    run(["check-ignore", "-q", "--", name]);
    return null;
  } catch {
    return "it sits in a Git repository and is not ignored";
  }
}

// ---------------------------------------------------------------------------
// The guard: one per store, bound by whoever opened it with a workspace.

const bound = new WeakMap<object, Binding>();

export function bindContentRules(
  store: object,
  {
    workspaceRoot = null,
    configFile = globalAvoozlConfigPath(),
    pluginSettingsFile = null,
    timeoutMs = CHECK_TIMEOUT_MS,
    // {hostname, username} in place of this machine's own (tests only).
    machine = null,
  }: {
    workspaceRoot?: string | null;
    configFile?: string;
    pluginSettingsFile?: string | null;
    timeoutMs?: number;
    machine?: { hostname: string; username: string } | null;
  } = {},
) {
  const previous = bound.get(store);
  const binding: Binding = {
    workspaceRoot,
    configFile,
    pluginSettingsFile,
    timeoutMs,
    machine,
    // Rule sets a `rules` plugin supplied, in memory only (R40.9):
    // plugin id -> {loadedAt, sets: Map(id -> {version, rules}), error}.
    plugins:
      previous?.workspaceRoot === workspaceRoot ? previous.plugins : new Map(),
  };
  bound.set(store, binding);
  return binding;
}

export function contentBinding(store: object): Binding | null {
  return bound.get(store) || null;
}

function readPolicy(workspaceRoot: string | null): Obj {
  if (!workspaceRoot) return {};
  try {
    const value: unknown = JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8"),
    );
    return record(value) ? value : {};
  } catch (error) {
    if (fieldOf(error, "code") === "ENOENT") return {};
    throw Error(`.avoozl.json is invalid: ${messageOf(error)}`);
  }
}

// Registered repositories a set may name: local repositories and GitHub ones.
function registeredRepositories(store: Store, policy: Obj) {
  const names = new Set<string>();
  try {
    for (const repository of store.list<{ id: string; github?: string | null }>(
      "repositories",
    )) {
      names.add(repository.id);
      if (repository.github) names.add(repository.github);
    }
    for (const repo of store.list<{ id: string }>("github_repositories"))
      names.add(repo.id);
  } catch {}
  const listed = fieldOf(policy.github, "repositories");
  for (const id of Object.keys(record(listed) ? listed : {})) names.add(id);
  return names;
}

// Every configured set with its rules, or why it is unavailable. Terms files
// are read on each call, so an added or removed file applies at once.
function resolveSets(store: Store): {
  sets: ResolvedSet[];
  error: string | null;
} {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return { sets: [], error: null };
  let policy: Obj, rules: { sets: RuleSet[] };
  try {
    policy = readPolicy(binding.workspaceRoot);
    rules = validateContentRules(policy.contentRules, {
      pluginIds: declaredPluginIds(
        policy,
        binding.pluginSettingsFile ||
          path.join(path.dirname(binding.configFile), "plugins.json"),
      ),
    });
  } catch (error) {
    // Invalid policy: nothing is known to be safe, so every boundary fails
    // closed under one pseudo-set until the file is fixed.
    return {
      sets: [
        {
          id: "contentRules",
          action: "block",
          boundaries: null,
          repositories: null,
          source: "policy",
          available: false,
          reason: `.avoozl.json contentRules is invalid: ${messageOf(error)}`,
        },
      ],
      error: messageOf(error),
    };
  }
  const repositories = registeredRepositories(store, policy);
  const sets = rules.sets.map((set): ResolvedSet => {
    const base = { ...set, source: set.plugin ? "plugin" : "file" };
    const unknown = (set.repositories || []).find(
      (name) =>
        ![...repositories].some((r) => r.toLowerCase() === name.toLowerCase()),
    );
    if (unknown)
      return {
        ...base,
        available: false,
        reason: `it names ${unknown}, which is not a registered repository`,
      };
    if (set.plugin) {
      const loaded = binding.plugins.get(set.plugin);
      if (!loaded)
        return {
          ...base,
          available: false,
          reason: `rules plugin ${set.plugin} is not loaded`,
        };
      if (loaded.error)
        return {
          ...base,
          available: false,
          reason: `rules plugin ${set.plugin} ${loaded.error}`,
        };
      const supplied = loaded.sets?.get(set.id);
      if (!supplied)
        return {
          ...base,
          available: false,
          reason: `rules plugin ${set.plugin} supplies no set ${set.id}`,
        };
      return {
        ...base,
        available: true,
        version: supplied.version,
        ruleCount: supplied.rules.length,
        rules: supplied.rules,
      };
    }
    const { file, from } = termsFileFor(set.id, binding);
    const located = { ...base, termsFrom: from };
    if (!file || !fs.existsSync(file))
      return {
        ...located,
        available: false,
        reason:
          from === "machine"
            ? "the terms file named in this machine's settings is missing"
            : `no terms file at .avoozl/local/content-rules/${set.id}.txt`,
      };
    const exposure = gitExposure(file);
    if (exposure)
      return {
        ...located,
        available: false,
        reason: `the terms file is refused: ${exposure}`,
      };
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_TERMS_BYTES)
        throw Error("the terms file is over 1 MB");
      const text = fs.readFileSync(file, "utf8");
      if (readTermLines(text).lines > MAX_RULES)
        throw Error(`the terms file has more than ${MAX_RULES} rules`);
      const parsed = parseTerms(text);
      return {
        ...located,
        available: true,
        ruleCount: parsed.length,
        rules: parsed.map((r) => ({
          id: r.rule,
          source: r.pattern.source,
          ...(r.allow.length ? { allow: r.allow.map((a) => a.source) } : {}),
        })),
      };
    } catch (error) {
      // The message names the line that failed, never its text.
      const message = messageOf(error);
      return {
        ...located,
        available: false,
        reason: /Invalid regular expression/.test(message)
          ? "a rule does not compile"
          : /^Terms /.test(message)
            ? message
            : message.replace(/: .*$/s, ""),
      };
    }
  });
  return { sets, error: null };
}

// What Settings shows: each set, its source kind and availability, never a
// rule. `choices` are what a set may name: registered repositories and
// declared plugins.
export function describeSets(store: Store) {
  const { sets, error } = resolveSets(store);
  return {
    error,
    sets: sets.map(({ rules, ...set }) => set),
    builtins: BUILTIN_SETS.map(({ id, appliesAt }) => ({ id, appliesAt })),
    choices: setChoices(store),
  };
}

function setChoices(store: Store) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return { repositories: [], plugins: [] };
  let policy: Obj = {};
  try {
    policy = readPolicy(binding.workspaceRoot);
  } catch {}
  return {
    repositories: [...registeredRepositories(store, policy)].sort(),
    plugins: [
      ...new Set(
        declaredPluginIds(
          policy,
          binding.pluginSettingsFile ||
            path.join(path.dirname(binding.configFile), "plugins.json"),
        ),
      ),
    ].sort(),
  };
}

// ---------------------------------------------------------------------------
// Editing a set's terms file from Settings (a person only; operations.mjs
// refuses sessions). Only `.avoozl/local/content-rules/<id>.txt` is written,
// owner-only. Problems name a line number, never the text on it.

// Each problem in a terms file as {line, message}, the rule count, and the
// allow line count.
export function checkTermsText(text: unknown) {
  const value = String(text ?? ""),
    errors: { line: number | null; message: string }[] = [];
  if (Buffer.byteLength(value) > MAX_TERMS_BYTES)
    errors.push({ line: null, message: "The terms file is over 1 MB." });
  const read = readTermLines(value);
  errors.push(...read.errors);
  if (read.lines > MAX_RULES)
    errors.push({ line: null, message: `More than ${MAX_RULES} rules.` });
  return {
    rules: read.lines - read.allowLines,
    allows: read.allowLines,
    errors,
  };
}

// The configured set `id` whose rules come from a terms file, and that file.
function termsTarget(store: Store, id: unknown) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot)
    return fail("Content rules need a workspace.", 409);
  if (typeof id !== "string" || !SET_ID.test(id)) fail("Name a rule set.");
  const { sets, error } = resolveSets(store);
  if (error) fail(`.avoozl.json contentRules is invalid: ${error}`, 409);
  const set = sets.find((s) => s.id === id);
  if (!set) fail(`Rule set ${id} is not in .avoozl.json.`, 404);
  if (set.plugin)
    fail(`Rule set ${id} gets its rules from the plugin ${set.plugin}.`, 409);
  return { set, ...termsFileFor(id, binding) };
}

// {id, file, from, editable, exists, text}. A file this machine's settings
// name is read only here: Avoozl writes only its own folder.
export function readTermsFile(store: Store, { id }: { id?: unknown } = {}) {
  const { file: target, from } = termsTarget(store, id),
    file = target ?? "",
    root = contentBinding(store)?.workspaceRoot ?? "",
    shown =
      from === "machine"
        ? file
        : path.relative(root, file).split(path.sep).join("/");
  if (from === "machine")
    return {
      id,
      file: shown,
      from,
      editable: false,
      exists: fs.existsSync(file),
      text: null,
      reason:
        "This set's terms come from a file this machine's settings name. Edit that file.",
    };
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (fieldOf(error, "code") !== "ENOENT")
      fail("The terms file cannot be read.", 409);
    return { id, file: shown, from, editable: true, exists: false, text: "" };
  }
  return { id, file: shown, from, editable: true, exists: true, text };
}

export function writeTermsFile(
  store: Store,
  { id, text }: { id?: unknown; text?: unknown } = {},
) {
  if (typeof text !== "string") fail("Give the terms file text.");
  const { file: target, from } = termsTarget(store, id),
    file = target ?? fail("Content rules need a workspace.", 409);
  if (from === "machine")
    fail(
      "This set's terms come from a file this machine's settings name. Avoozl writes only .avoozl/local/content-rules.",
      409,
    );
  const checked = checkTermsText(text);
  if (checked.errors.length)
    throw refusal(
      `Nothing was saved. ${checked.errors
        .map((e) => (e.line ? `Line ${e.line} ${e.message}` : e.message))
        .join("; ")}.`,
      { status: 422, errors: checked.errors },
    );
  const folder = path.dirname(file);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  fs.chmodSync(folder, 0o700);
  const exposure = gitExposure(file);
  if (exposure)
    fail(
      `Nothing was saved: Git could publish the terms file (${exposure}). Ignore .avoozl/local in Git first.`,
      409,
    );
  const body = text.endsWith("\n") || !text ? text : text + "\n",
    pending = path.join(
      folder,
      `.${String(id)}.${process.pid}.${Date.now()}.pending`,
    );
  const descriptor = fs.openSync(pending, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, body);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    fs.renameSync(pending, file);
  } catch (error) {
    try {
      fs.closeSync(descriptor);
    } catch {}
    fs.rmSync(pending, { force: true });
    throw error;
  }
  fs.chmodSync(file, 0o600);
  store.event(null, "content.terms.saved", {
    set: id,
    rules: checked.rules,
    ...(checked.allows ? { allows: checked.allows } : {}),
  });
  return { id, rules: checked.rules, allows: checked.allows, saved: true };
}

// The boundaries a giving epic-context source's `contentSets` add to a task's
// own sets (epic-context EC9.3).
const CONTEXT_BOUNDARIES = new Set(["diff", "github", "brief"]);

// The rule set IDs the task's last epic-context session was given.
const taskContentSets = (store: Store, taskId: string | null): string[] => {
  const last = taskId
    ? store.getMeta<{
        tasks?: Record<string, { given?: boolean; contentSets?: string[] }>;
      }>("epicContext")?.tasks?.[taskId]
    : null;
  return last?.given ? (last.contentSets ?? []) : [];
};

export const covers = (
  set: Pick<RuleSet, "boundaries" | "repositories">,
  boundary: string,
  repository: unknown,
) =>
  (set.boundaries
    ? set.boundaries.includes(boundary)
    : !OPT_IN.has(boundary)) &&
  (!set.repositories ||
    !repository ||
    set.repositories.some(
      (name) => name.toLowerCase() === String(repository).toLowerCase(),
    ));

// Lines to check: `text` (each line of it, target `target`), or `added`:
// [{target, line, text}] for diff lines.
function linesOf({
  target,
  text,
  added,
}: {
  target?: string;
  text?: unknown;
  added?: { target?: string; line?: number | null; text?: unknown }[];
}) {
  if (Array.isArray(added))
    return added.map((entry) => ({
      target: entry.target ?? target ?? "",
      line: entry.line ?? undefined,
      text: String(entry.text ?? ""),
    }));
  return String(text ?? "")
    .split("\n")
    .map((line, i) => ({ target: target ?? "", line: i + 1, text: line }));
}

// builtin:privacy (privacy.mjs, R102.18): always on at the boundaries that
// leave this machine. GitHub text gets every rule; a pushed diff's commit
// messages and ref names (targets `commit:` and `ref:`) do too, and its
// added lines get the code scope.
const PRIVATE_BOUNDARIES = new Set(["github", "diff"]);
function privacyFindings(
  binding: Binding | null,
  boundary: string,
  lines: { target: string; line?: number; text: string }[],
): Finding[] {
  if (!PRIVATE_BOUNDARIES.has(boundary) || !lines.length) return [];
  const options = {
      machine: binding?.machine ?? null,
      configFile: binding?.configFile ?? globalAvoozlConfigPath(),
    },
    text = privacyRules({ ...options, scope: "text" }),
    code = privacyRules({ ...options, scope: "code" }),
    prose = (line: { target: string }) =>
      boundary === "github" || /^(?:commit|ref):/.test(String(line.target)),
    findings: Finding[] = [];
  for (const [rules, picked] of [
    [text, lines.filter(prose)],
    [code, lines.filter((line) => !prose(line))],
  ] as const)
    for (const hit of privacyHits(
      picked.map((l) => l.text),
      rules,
      decode,
    )) {
      const line = picked[hit.index];
      if (line)
        findings.push({
          set: PRIVACY_SET,
          rule: hit.rule,
          boundary,
          target: line.target,
          line: line.line,
          action: "block",
        });
    }
  return findings;
}

// check({boundary, repository, target, text, added}): findings as {set, rule,
// boundary, target, line, action, version?}, and the covering sets that are
// unavailable as {set, reason}. Never the matched text. Writes nothing.
export function check(
  store: Store,
  input: {
    boundary: string;
    repository?: string | null;
    target?: string;
    added?: ContentLine[];
    text?: string;
    contextSets?: string[];
    [key: string]: unknown;
  },
): CheckResult {
  const { boundary, repository = null } = input;
  if (!BOUNDARIES.includes(boundary))
    fail(`Unknown content boundary ${boundary}.`);
  const binding = contentBinding(store),
    { sets } = resolveSets(store),
    named = CONTEXT_BOUNDARIES.has(boundary) ? (input.contextSets ?? []) : [],
    applying = sets.filter(
      (set) => covers(set, boundary, repository) || named.includes(set.id),
    ),
    unavailable: Unavailable[] = [
      ...applying
        .filter((set) => !set.available)
        .map((set) => ({ set: set.id, reason: String(set.reason) })),
      // A named set this machine does not have blocks as a missing terms
      // file does.
      ...named
        .filter((id) => !sets.some((set) => set.id === id))
        .map((id) => ({
          set: id,
          reason: "this machine has no rule set with that ID",
        })),
    ],
    ready = applying.filter((set) => set.available),
    lines = linesOf(input),
    findings = privacyFindings(binding, boundary, lines);
  if (!ready.length || !lines.length) return { findings, unavailable };
  const rules = ready.flatMap((set) =>
    (set.rules ?? []).map((rule) => ({
      set: set.id,
      rule: rule.id,
      source: rule.source,
      ...(rule.allow ? { allow: rule.allow } : {}),
    })),
  );
  let hits: { index: number; set: string; rule: string }[],
    allowed: { set: string; rule: string; count: number }[];
  try {
    ({ hits, allowed } = matchLinesInWorker(
      rules,
      lines.map((l) => l.text),
      { timeoutMs: binding?.timeoutMs ?? CHECK_TIMEOUT_MS },
    ));
  } catch (error) {
    // A timeout or a rule that fails makes every set in this check
    // unavailable for it: it fails closed (R40.11).
    for (const set of ready)
      unavailable.push({
        set: set.id,
        reason: fieldOf(error, "timeout")
          ? messageOf(error)
          : "a rule does not compile",
      });
    return { findings, unavailable };
  }
  const byId = new Map(ready.map((set) => [set.id, set])),
    seen = new Set();
  for (const hit of hits) {
    const line = lines[hit.index],
      set = byId.get(hit.set);
    if (!line || !set) continue;
    const key = `${hit.set}\0${hit.rule}\0${line.target}\0${line.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      set: hit.set,
      rule: hit.rule,
      boundary,
      target: line.target,
      line: line.line,
      action: set.action,
      ...(set.version ? { version: set.version } : {}),
    });
  }
  // Matches an allow line cancelled: a count per set and rule, never a
  // finding (R40.15).
  return allowed.length
    ? { findings, unavailable, allowed }
    : { findings, unavailable };
}

// The content an allowance binds to: the exact text, or the added lines.
export function contentHash(input: {
  added?: { target?: string; line?: number | null; text?: unknown }[];
  text?: unknown;
}) {
  return sha256(
    Array.isArray(input.added)
      ? input.added
          .map((l) => `${l.target ?? ""}\0${l.line ?? ""}\0${l.text}`)
          .join("\n")
      : String(input.text ?? ""),
  );
}

export const findingText = (f: Finding) =>
  `${f.set} rule ${f.rule} at ${f.target}${f.line ? ` line ${f.line}` : ""}`;

const decisionId = (set: string, target: string) =>
  "content:" + sha256(`${set}\0${target}`).slice(0, 24);

// enforce(input, {mode, taskId, source}): check, then act on the result.
//   mode "refuse": an agent's own call; a block throws 422 naming the
//     findings, records a `content.refused` event, opens no decision.
//   mode "decide": Avoozl's own write; a block opens one decision per set
//     and target and returns {ok: false}.
// `report` findings are recorded for the Delivery view with one
// notification. An allowance for the exact content passes its rule once and
// is used up. Returns {ok, findings, unavailable, notify}.
export function enforce(
  store: Store,
  input: EnforceInput,
  {
    mode = "decide",
    taskId = null,
    source = null,
  }: { mode?: string; taskId?: string | null; source?: LineSource } = {},
) {
  const result = check(store, {
      ...input,
      contextSets: input.contextSets ?? taskContentSets(store, taskId),
    }),
    hash = contentHash(input),
    notify: ContentNotice[] = [],
    allowances = store
      .list<Allowance>("content_allowances")
      .filter((a) => !a.usedAt),
    blocking: Finding[] = [],
    used: Allowance[] = [];
  for (const finding of result.findings) {
    if (finding.action === "report") continue;
    const allowance = allowances.find(
      (a) =>
        a.set === finding.set &&
        a.rule === finding.rule &&
        a.target === finding.target &&
        a.contentHash === hash &&
        !used.includes(a),
    );
    if (allowance) used.push(allowance);
    else blocking.push(finding);
  }
  const at = new Date().toISOString();
  const blocked = blocking.length > 0 || result.unavailable.length > 0;
  if (!blocked) {
    store.transaction(() => {
      for (const allowance of used)
        store.put("content_allowances", { ...allowance, usedAt: at });
      for (const finding of result.findings.filter(
        (f) => f.action === "report",
      )) {
        const id =
          "report:" +
          sha256(
            `${finding.set}\0${finding.rule}\0${finding.target}\0${finding.line}\0${hash}`,
          ).slice(0, 24);
        if (store.get("content_reports", id)) continue;
        store.put("content_reports", {
          id,
          ...finding,
          taskId,
          contentHash: hash,
          at,
        });
        // One notification per set and target, however many lines matched.
        const title = `Content rule ${finding.set} reported a match`;
        if (
          notify.some((n) => n.title === title && n.target === finding.target)
        )
          continue;
        notify.push({
          channel: "decision",
          ...(taskId ? { task: taskId } : {}),
          target: finding.target,
          title,
          text: `${findingText(finding)} (${finding.boundary}). The content was written; the set's action is report.`,
          resume: "Open the Delivery view to review it.",
        });
      }
      // A clean write settles that target's open decisions.
      for (const decision of store.list<Decision>("content_decisions"))
        if (
          decision.state === "open" &&
          decision.kind === "match" &&
          decision.target === input.target &&
          decision.boundary === input.boundary
        )
          store.put("content_decisions", {
            ...decision,
            state: "cleared",
            clearedAt: at,
          });
    });
    return { ok: true, ...result, notify };
  }
  if (mode === "refuse") {
    store.event(null, "content.refused", {
      boundary: input.boundary,
      target: input.target ?? null,
      taskId,
      findings: blocking,
      unavailable: result.unavailable,
    });
    const named = [
      ...blocking.map(findingText),
      ...result.unavailable.map((u) => `${u.set} is unavailable (${u.reason})`),
    ];
    throw new ContentRefusal(
      `Content rules refused this, nothing was written: ${named.join("; ")}. Change the text and try again.`,
      blocking,
      result.unavailable,
    );
  }
  store.transaction(() => {
    const bySet = new Map<string, Finding[]>();
    for (const finding of blocking) {
      const key = decisionId(finding.set, finding.target);
      bySet.set(key, [...(bySet.get(key) ?? []), finding]);
    }
    for (const [id, findings] of bySet) {
      const current = store.get<Decision>("content_decisions", id),
        first = findings[0];
      if (!first) continue;
      const next: Decision = {
        id,
        kind: "match",
        state: "open",
        set: first.set,
        rules: [...new Set(findings.map((f) => f.rule))],
        findings: findings.map(({ action, ...f }) => f),
        boundary: input.boundary,
        repository: input.repository ?? null,
        target: first.target,
        line: first.line,
        taskId,
        source,
        contentHash: hash,
        openedAt: current?.state === "open" ? current.openedAt : at,
      };
      if (
        current?.state === "open" &&
        current.contentHash === hash &&
        JSON.stringify(current.findings) === JSON.stringify(next.findings)
      )
        continue;
      store.put("content_decisions", next);
      notify.push({
        channel: "decision",
        ...(taskId ? { task: taskId } : {}),
        record: id,
        title: `Content rule ${first.set} blocked a write`,
        text: `${findings.map(findingText).join("; ")} (${input.boundary}). Nothing was written.`,
        resume:
          "Change the content, or allow it once with a reason in the Avoozl page.",
      });
    }
    for (const missing of result.unavailable) {
      const id = "content-unavailable:" + sha256(missing.set).slice(0, 24),
        current = store.get<Decision>("content_decisions", id);
      if (current?.state === "open" && current.reason === missing.reason)
        continue;
      store.put("content_decisions", {
        id,
        kind: "unavailable",
        state: "open",
        set: missing.set,
        reason: missing.reason,
        boundary: input.boundary,
        openedAt: at,
      });
      notify.push({
        channel: "decision",
        record: id,
        title: `Content rule set ${missing.set} is unavailable`,
        text: `Avoozl writes nothing the set covers until it is available again: ${missing.reason}.`,
        resume:
          "Add or fix the set's terms file or plugin; the next tick checks again.",
      });
    }
  });
  return {
    ok: false,
    findings: blocking,
    unavailable: result.unavailable,
    notify,
  };
}

// Close unavailable-set decisions whose set is available again.
export function settleUnavailable(store: Store) {
  const { sets } = resolveSets(store),
    available = new Set(sets.filter((s) => s.available).map((s) => s.id)),
    named = new Set(sets.map((s) => s.id)),
    at = new Date().toISOString();
  const open = store
    .list<Decision>("content_decisions")
    .filter((d) => d.kind === "unavailable" && d.state === "open");
  if (!open.length) return;
  store.transaction(() => {
    for (const decision of open)
      if (available.has(decision.set) || !named.has(decision.set))
        store.put("content_decisions", {
          ...decision,
          state: "cleared",
          clearedAt: at,
        });
  });
}

// Allow once (R40.7): only a person, from the app page or the CLI. Records
// who, why and when, bound to the rule, the target and the content hash.
export function allowOnce(
  store: Store,
  { id, reason, rule }: { id?: unknown; reason?: unknown; rule?: unknown } = {},
  {
    operator = "",
    caller = null,
  }: { operator?: string; caller?: unknown } = {},
) {
  if (caller)
    fail(
      "Only a person allows blocked content, from the Avoozl page or the CLI.",
      403,
    );
  if (typeof reason !== "string" || !reason.trim() || reason.length > 2000)
    fail("Give a reason of 1–2000 characters to allow this once.");
  const decision = store.get<Decision>("content_decisions", id);
  if (!decision) return fail("Content decision not found.", 404);
  if (decision.kind !== "match")
    fail("Only a matched write can be allowed once.", 409);
  if (decision.state !== "open")
    fail(`This decision is ${decision.state}.`, 409);
  const matched = decision.rules ?? [],
    rules = rule ? [String(rule)] : matched;
  if (rule && !matched.includes(String(rule)))
    fail("That rule did not match here.", 409);
  const at = new Date().toISOString();
  return store.transaction(() => {
    const allowances = rules.map((name) => {
      const allowance = {
        id:
          "allow:" +
          sha256(
            `${decision.id}\0${name}\0${decision.contentHash}\0${at}`,
          ).slice(0, 24),
        decision: decision.id,
        set: decision.set,
        rule: name,
        boundary: decision.boundary,
        target: decision.target,
        contentHash: decision.contentHash,
        by: operator || "person",
        reason: reason.trim(),
        at,
        usedAt: null,
      };
      store.put("content_allowances", allowance);
      return allowance;
    });
    const next = {
      ...decision,
      state: "allowed",
      allowedAt: at,
      allowedBy: operator || "person",
    };
    store.put("content_decisions", next);
    store.event(null, "content.allowed", {
      decision: decision.id,
      set: decision.set,
      rules,
      target: decision.target,
      contentHash: decision.contentHash,
      by: operator || "person",
    });
    return { decision: next, allowances };
  });
}

// The matched line, read again from its source on demand and never stored.
export function showDecisionLine(store: Store, id: unknown) {
  const decision = store.get<Decision>("content_decisions", id);
  if (!decision) return fail("Content decision not found.", 404);
  const source = decision.source;
  try {
    if (source?.kind === "file" && source.path) {
      const lines = fs.readFileSync(source.path, "utf8").split("\n");
      return {
        id,
        line: decision.line,
        text: lines[(decision.line || 1) - 1] ?? null,
      };
    }
    if (
      source?.kind === "commit" &&
      source.root &&
      source.commit &&
      source.file
    ) {
      const text = execFileSync(
        "git",
        ["show", `${revision(source.commit)}:${source.file}`],
        {
          cwd: source.root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      return {
        id,
        line: decision.line,
        text: text.split("\n")[(decision.line || 1) - 1] ?? null,
      };
    }
  } catch {}
  return {
    id,
    line: decision.line ?? null,
    text: null,
    reason: "The source cannot be read again.",
  };
}

// Open decisions and report findings, for the Conflicts and Delivery views.
export function contentItems(store: Store) {
  return {
    decisions: store
      .list<Decision>("content_decisions")
      .filter((d) => d.state === "open"),
    reports: store.list("content_reports"),
  };
}

// ---------------------------------------------------------------------------
// Rules plugins (§4.9 Rules plugins, R40.9). Called with an open plugin
// session; the sets stay in this process's memory only.

export function checkRuleSets(
  reply: unknown,
): { id: string; version: string; rules: Rule[] }[] {
  if (!record(reply) || !Array.isArray(reply.sets) || reply.sets.length > 100)
    throw Error("ruleSets reply must be {sets: [...]} with at most 100 sets.");
  return reply.sets.map((set, i) => {
    if (!record(set) || typeof set.id !== "string" || !SET_ID.test(set.id))
      throw Error(`ruleSets set ${i} needs a lowercase id.`);
    if (
      typeof set.version !== "string" ||
      !set.version ||
      set.version.length > 64
    )
      throw Error(`ruleSets set ${set.id} needs a version.`);
    if (!Array.isArray(set.rules) || set.rules.length > MAX_RULES)
      throw Error(`ruleSets set ${set.id} rules must be a list.`);
    // Allow lines belong to the owner's own terms files (R40.15). A plugin
    // writes its exception into the pattern; ignoring the key would look
    // like an exception that is not there.
    if (
      set.allow !== undefined ||
      set.rules.some((rule) => record(rule) && rule.allow !== undefined)
    )
      throw Error(
        `ruleSets set ${set.id} returns allow patterns, which rules plugins cannot. Write the exception into the rule's pattern.`,
      );
    return {
      id: set.id,
      version: set.version,
      rules: set.rules.map((rule, j) => {
        if (
          !record(rule) ||
          typeof rule.id !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(rule.id) ||
          typeof rule.pattern !== "string" ||
          !rule.pattern ||
          rule.pattern.length > 2000
        )
          throw Error(
            `ruleSets set ${set.id} rule ${j} must be {id, pattern}.`,
          );
        new RegExp(rule.pattern, "i");
        return { id: rule.id, source: rule.pattern };
      }),
    };
  });
}

// Load every rules plugin a configured set names, through `session`
// (plugin-session.mjs) or `open()` that returns one. A failure keeps only
// that plugin's sets unavailable.
// The rules plugins a policy's sets name.
const wantedPlugins = (policy: Obj): string[] => {
  const sets = fieldOf(policy.contentRules, "sets");
  return (Array.isArray(sets) ? sets : []).flatMap((s) => {
    const id = fieldOf(s, "plugin");
    return typeof id === "string" ? [id] : [];
  });
};

// The sets of a ruleSets reply the plugin session already checked
// (plugin-contract.ts): {sets: [{id, version, rules: [{id, source}]}]}.
const checkedSets = (reply: unknown) => {
  const sets = fieldOf(reply, "sets"),
    text = (value: unknown) => (typeof value === "string" ? value : null);
  return (Array.isArray(sets) ? sets : []).flatMap((set) => {
    const id = text(fieldOf(set, "id")),
      rules = fieldOf(set, "rules");
    if (!id) return [];
    return [
      {
        id,
        version: String(fieldOf(set, "version") ?? ""),
        rules: (Array.isArray(rules) ? rules : []).flatMap((rule) => {
          const ruleId = text(fieldOf(rule, "id")),
            source = text(fieldOf(rule, "source"));
          return ruleId && source ? [{ id: ruleId, source }] : [];
        }),
      },
    ];
  });
};
// A plugin host (plugins.ts pluginHost): open() starts one session.
interface RuleHost {
  open(): {
    call(
      id: string,
      kind: string,
      method: string,
      params: unknown,
    ): Promise<unknown>;
    close?(): Promise<unknown>;
  };
}
const isHost = (value: unknown): value is RuleHost =>
  typeof fieldOf(value, "open") === "function";

export async function loadRulePlugins(store: Store, pluginHost: unknown) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return;
  let policy: Obj;
  try {
    policy = readPolicy(binding.workspaceRoot);
  } catch {
    return;
  }
  const wanted = [...new Set(wantedPlugins(policy))];
  for (const id of [...binding.plugins.keys()])
    if (!wanted.includes(id)) binding.plugins.delete(id);
  if (!wanted.length) return;
  if (!isHost(pluginHost)) {
    for (const id of wanted)
      binding.plugins.set(id, {
        loadedAt: Date.now(),
        error: "cannot load: no plugin host",
      });
    return;
  }
  const session = pluginHost.open();
  try {
    for (const id of wanted) {
      try {
        const reply = await session.call(id, "rules", "ruleSets", {});
        binding.plugins.set(id, {
          loadedAt: Date.now(),
          // Checked against the contract by the plugin session.
          sets: new Map(checkedSets(reply).map((set) => [set.id, set])),
        });
      } catch (error) {
        binding.plugins.set(id, {
          loadedAt: Date.now(),
          error: messageOf(error)
            .replace(/^Plugin \S+ /, "")
            .slice(0, 300),
        });
      }
    }
  } finally {
    await session.close?.();
  }
}

// Plugins whose sets are older than `maxAgeMs`, or not loaded yet.
export function rulePluginsStale(store: Store, maxAgeMs = 60_000) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return false;
  let policy: Obj;
  try {
    policy = readPolicy(binding.workspaceRoot);
  } catch {
    return false;
  }
  return wantedPlugins(policy).some((id) => {
    const loaded = binding.plugins.get(id);
    return !loaded || Date.now() - loaded.loadedAt > maxAgeMs;
  });
}

// ---------------------------------------------------------------------------
// Built-in rule sets (R40.12). Each keeps the patterns, decoding and refusal
// shape of the screen it came from; the old exports wrap these.

const lower = (value: unknown) => String(value || "").toLowerCase();
const escapeChar = (char: string) =>
  char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// builtin:planning-repository (F68): `owner/name` with any whitespace (a line
// break included) allowed between its characters, not inside a longer name.
function planningNamePattern(planningRepository: string) {
  const chars = [...lower(planningRepository)].map(escapeChar).join("\\s*");
  return new RegExp(`(?<![\\w.-])${chars}(?![\\w-])`, "giu");
}

export function findPlanningLeak(
  fields: Iterable<readonly [string, unknown]>,
  planningRepository: string | null | undefined,
) {
  if (!planningRepository) return null;
  const pattern = planningNamePattern(planningRepository);
  for (const [field, text] of fields) {
    const value = decode(text);
    for (const match of value.matchAll(pattern)) {
      const before = value.slice(0, match.index).replace(/\s+$/, ""),
        after = value.slice(match.index + match[0].length);
      return {
        field,
        form: /github\.com\s*\/$/i.test(before)
          ? "URL"
          : /^\s*#/.test(after)
            ? "owner/name#"
            : "owner/name",
      };
    }
  }
  return null;
}

// builtin:reply-safety (F69). Secrets: provider token formats, key blocks,
// credential assignments, and credentials in URLs. Paths: absolute paths
// under machine roots, Windows drive and UNC paths, home-relative paths, and
// this machine's own roots. Code fences are not exempt.
const REPLY_SECRETS: [string, RegExp][] = [
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["GitHub token", /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["private key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/],
  ["Slack token", /\bxox[abeprs]-[A-Za-z0-9-]{10,}/],
  ["API key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}/],
  [
    "JSON web token",
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  ],
  ["bearer token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i],
  ["URL with credentials", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i],
  [
    "credential assignment",
    /\b[A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?[^\s"'<>]{8,}/i,
  ],
];
// A leading character that makes a slash part of a URL or a relative path.
const PATH_START = String.raw`(?<![\w.:/~$%-])`;
const REPLY_PATHS: [string, RegExp][] = [
  [
    "absolute path",
    new RegExp(
      PATH_START +
        String.raw`/(?:Users|home|root|private|tmp|var|etc|opt|Volumes|mnt|srv|workplace|local)/\S*`,
    ),
  ],
  ["Windows path", /(?<![\w])[A-Za-z]:\\[^\s]*|\\\\[\w.-]+\\[^\s]+/],
  ["home-relative path", new RegExp(PATH_START + String.raw`~[\w.-]*/\S*`)],
  ["home-relative path", /\$\{?HOME\}?[\\/]|%USERPROFILE%|%HOMEPATH%/i],
];
const escapeText = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every finding as {kind, line}; never the matched text.
export function screenReply(
  body: unknown,
  { roots = [] }: { roots?: (string | null | undefined)[] } = {},
) {
  const own = [
      ...new Set(
        roots.filter((root): root is string =>
          Boolean(root && root.length > 1),
        ),
      ),
    ].map((root): [string, RegExp] => [
      "absolute path",
      new RegExp(escapeText(root.replace(/\/$/, ""))),
    ]),
    findings: { kind: string; line: number }[] = [];
  for (const [index, line] of String(body).split("\n").entries())
    for (const [kind, pattern] of [...REPLY_SECRETS, ...REPLY_PATHS, ...own])
      if (
        pattern.test(line) &&
        !findings.some((f) => f.kind === kind && f.line === index + 1)
      )
        findings.push({ kind, line: index + 1 });
  return findings;
}

// builtin:published-secrets (F70): markers, workspace publications and
// broad-issue previews. Returns the reason or null.
const PUBLISHED_SECRETS: [string, RegExp][] = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i],
  [
    "provider or GitHub token",
    /\b(?:github_pat_|gh[pousr]_|sk-ant-|sk-proj-|xox[baprs]-)[A-Za-z0-9_-]{12,}/,
  ],
  [
    "credential assignment",
    /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[^\s"'`]{8,}/i,
  ],
  ["authorization header", /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+\S+/i],
  ["credential-bearing URL", /https?:\/\/[^/\s:@]+:[^/\s@]+@/i],
  [
    "absolute user path",
    /(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/,
  ],
];

export function secretReason(text: string) {
  for (const [reason, pattern] of PUBLISHED_SECRETS)
    if (pattern.test(text)) return reason;
  for (const token of text.match(/[A-Za-z0-9+/=_-]{48,}/g) || []) {
    if (/^[a-f0-9]{64}$/i.test(token)) continue;
    const classes = [
      /[a-z]/.test(token),
      /[A-Z]/.test(token),
      /\d/.test(token),
      /[+/=_-]/.test(token),
    ].filter(Boolean).length;
    if (classes >= 3) return "high-entropy value";
  }
  return null;
}

// The built-in sets: always on, never configurable, at today's boundaries.
export const BUILTIN_SETS = Object.freeze([
  {
    id: "builtin:planning-repository",
    appliesAt:
      "linked branches, steering, briefs and pull requests (plans-repo mode)",
    screen: findPlanningLeak,
  },
  {
    id: "builtin:reply-safety",
    appliesAt: "responder replies",
    screen: screenReply,
  },
  {
    id: "builtin:published-secrets",
    appliesAt: "markers, workspace publications and broad-issue previews",
    screen: secretReason,
  },
]);

// ---------------------------------------------------------------------------
// Plan boundary helpers (§4.9 Boundaries, `plan`).

// A spec folder, as enforceSpec reads it.
interface SpecFiles {
  name: string;
  root?: string | null;
  folder?: string | null;
  files?: Record<string, string>;
}
const specTarget = (spec: SpecFiles, file: string) => `${spec.name}/${file}`;
// The file on disk, for the matched line on demand: `root` is the
// checkout findSpecFolder found the folder in.
const specSource = (spec: SpecFiles, file: string): LineSource =>
  spec.root && spec.folder
    ? { kind: "file", path: path.join(spec.root, spec.folder, file) }
    : null;

// Check every spec file. mode "refuse" throws on the first blocked file
// (a planner's own save); mode "decide" opens decisions and returns
// {ok, notify} (approval).
export function enforceSpec(
  store: Store,
  spec: SpecFiles,
  { mode = "refuse" } = {},
) {
  const notify: ContentNotice[] = [];
  let ok = true;
  const refusals: { findings: Finding[]; unavailable: Unavailable[] }[] = [];
  for (const [file, text] of Object.entries(spec.files || {})) {
    const input = {
      boundary: "plan",
      repository: null,
      target: specTarget(spec, file),
      text,
    };
    if (mode === "refuse") {
      try {
        const result = enforce(store, input, {
          mode,
          source: specSource(spec, file),
        });
        notify.push(...result.notify);
      } catch (error) {
        if (!(error instanceof ContentRefusal)) throw error;
        refusals.push(error);
      }
      continue;
    }
    const result = enforce(store, input, {
      mode,
      source: specSource(spec, file),
    });
    notify.push(...result.notify);
    if (!result.ok) ok = false;
  }
  if (refusals.length)
    throw new ContentRefusal(
      `Content rules refused this, nothing was written: ${refusals
        .flatMap((e) => [
          ...e.findings.map(findingText),
          ...e.unavailable.map((u) => `${u.set} is unavailable (${u.reason})`),
        ])
        .filter((v, i, all) => all.indexOf(v) === i)
        .join("; ")}. Change the text and try again.`,
      refusals.flatMap((e) => e.findings),
      [],
    );
  return { ok, notify };
}

// `content.match` diagnostics for a read (plan.get, plan.lint, the spec
// list): what approval would block now, allowances counted, nothing used up.
export function specContentDiagnostics(store: Store, spec: SpecFiles) {
  if (!contentBinding(store)?.workspaceRoot) return [];
  const allowances = store
      .list<Allowance>("content_allowances")
      .filter((a) => !a.usedAt),
    diagnostics: {
      id: string;
      code: string;
      severity: string;
      message: string;
      file: string;
      lineStart?: number;
      lineEnd?: number;
      set: string;
      rule?: string;
    }[] = [];
  for (const [file, text] of Object.entries(spec.files || {})) {
    const target = specTarget(spec, file),
      { findings, unavailable } = check(store, {
        boundary: "plan",
        target,
        text,
      }),
      hash = sha256(text);
    for (const finding of findings) {
      if (finding.action === "report") continue;
      if (
        allowances.some(
          (a) =>
            a.set === finding.set &&
            a.rule === finding.rule &&
            a.target === target &&
            a.contentHash === hash,
        )
      )
        continue;
      diagnostics.push({
        id: `content.match:${file}:${finding.line}:${finding.set}:${finding.rule}`,
        code: "content.match",
        severity: "error",
        message: `Content rule ${finding.set} rule ${finding.rule} matches ${file} line ${finding.line}. Change the line, or allow it once with a reason.`,
        file,
        lineStart: finding.line,
        lineEnd: finding.line,
        set: finding.set,
        rule: finding.rule,
      });
    }
    for (const missing of unavailable)
      diagnostics.push({
        id: `content.unavailable:${file}:${missing.set}`,
        code: "content.unavailable",
        severity: "error",
        message: `Content rule set ${missing.set} is unavailable (${missing.reason}); nothing it covers can be approved.`,
        file,
        lineStart: 1,
        lineEnd: 1,
        set: missing.set,
      });
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------
// Diff boundary helpers (§4.9 `diff`). Only added lines are checked, so a
// line already in the base never blocks new work.

const gitSync = (root: string, args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: gitEnvironment(),
    maxBuffer: 1 << 28,
    stdio: ["ignore", "pipe", "ignore"],
  });

// A revision that reaches git as a positional argument. A caller (a pushed
// line, an MCP content check) names it, so a leading dash would be read as
// an option: `--output=FILE` makes git diff write over FILE.
export function revision(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.startsWith("-") ||
    /[\0-\x20\x7f]/.test(value)
  )
    fail("Name a commit or branch, not an option.", 400);
  return value;
}

// The commit a task's work is measured against: the merge base of `head`
// with the repository's integration branch when it exists, else its base.
export function diffBase(
  repository: {
    root: string;
    integrationBranch?: unknown;
    baseBranch?: unknown;
  },
  head: string,
) {
  revision(head);
  // The base may exist only as the remote's tracking copy (git.mjs).
  for (const ref of [
    ...(repository.integrationBranch
      ? [`refs/heads/${repository.integrationBranch}`]
      : []),
    ...branchRefs(String(repository.baseBranch || "main")),
  ])
    try {
      return gitSync(repository.root, ["merge-base", head, ref]).trim();
    } catch {}
  return null;
}

// [{target: file, line, text}] for each line `head` adds over `base`.
export function addedLines(root: string, base: string | null, head: string) {
  revision(head);
  if (base) revision(base);
  const out = gitSync(root, [
    "diff",
    "--unified=0",
    "--no-color",
    "--no-ext-diff",
    "--no-renames",
    base ? `${base}..${head}` : head,
  ]);
  const lines: ContentLine[] = [];
  let file: string | null = null,
    next = 0;
  for (const line of out.split("\n")) {
    if (line.startsWith("+++ ")) {
      file =
        line === "+++ /dev/null" ? null : line.replace(/^\+\+\+ (b\/)?/, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      next = Number(hunk[1]);
      continue;
    }
    if (file && line.startsWith("+")) {
      lines.push({ target: file, line: next, text: line.slice(1) });
      next += 1;
    }
  }
  return lines;
}

// [{target: "commit:<sha>", line, text}] for each line of each commit
// message `head` adds over `base` (only `head` itself without a base).
function commitMessageLines(root: string, base: string | null, head: string) {
  revision(head);
  if (base) revision(base);
  const out = gitSync(root, [
    "log",
    "--format=%H%x00%B%x1e",
    ...(base ? [`${base}..${head}`] : ["-1", head]),
  ]);
  return out
    .split("\x1e")
    .map((entry) => entry.replace(/^\n/, ""))
    .filter(Boolean)
    .flatMap((entry) => {
      const [sha, body = ""] = entry.split("\0");
      return body
        .replace(/\n+$/, "")
        .split("\n")
        .map((text, i) => ({
          target: `commit:${String(sha).slice(0, 12)}`,
          line: i + 1,
          text,
        }));
    });
}

// The branch checked out at `root`, or null when HEAD is detached.
function currentBranch(root: string) {
  try {
    return gitSync(root, ["symbolic-ref", "--quiet", "HEAD"]).trim() || null;
  } catch {
    return null;
  }
}

// Added lines of one file's unified diff patch.
export function patchAdded(file: string, patch: unknown) {
  const lines: ContentLine[] = [];
  let next = 0;
  for (const line of String(patch || "").split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) next = Number(hunk[1]);
    else if (line.startsWith("+"))
      lines.push({ target: file, line: next++, text: line.slice(1) });
    else if (!line.startsWith("-")) next += 1;
  }
  return lines;
}

// The lines an outgoing range publishes: added lines, commit messages and
// ref names (R87.9, R102.7).
export function pushLines(
  root: string,
  base: string | null,
  head: string,
  refs: (string | null | undefined)[],
): ContentLine[] {
  return [
    ...addedLines(root, base, head),
    ...commitMessageLines(root, base, head),
    ...[...new Set(refs.filter(Boolean))].map((name, i) => ({
      target: `ref:${i + 1}`,
      line: 1,
      text: String(name).replace(/^refs\/heads\//, ""),
    })),
  ];
}

// Check a task's outgoing range with content rules and the privacy scan.
// `refs` names the pushed refs; unset, the branch checked out at the root.
// {ok, findings, unavailable, notify}, or a 422 in "refuse" mode.
export function enforceDiff(
  store: Store,
  {
    repository,
    head,
    taskId,
    mode = "decide",
    refs,
  }: {
    repository: {
      root: string;
      id?: string;
      github?: string | null;
      integrationBranch?: unknown;
      baseBranch?: unknown;
    };
    head: string;
    taskId?: string;
    mode?: string;
    refs?: string[];
  },
) {
  const base = diffBase(repository, head),
    added = pushLines(
      repository.root,
      base,
      head,
      refs ?? [currentBranch(repository.root)],
    );
  const result = enforce(
    store,
    {
      boundary: "diff",
      repository: repository.github || repository.id || null,
      target: `diff:${taskId}`,
      added,
    },
    {
      mode,
      taskId: taskId ?? null,
      source: { kind: "commit", root: repository.root, commit: head },
    },
  );
  // A finding's own file goes in the decision's source, for the matched
  // line on demand.
  if (!result.ok && mode === "decide") {
    const first = result.findings.find(
      (f) => !/^(?:commit|ref):/.test(f.target),
    );
    if (first) {
      const id =
          "content:" + sha256(`${first.set}\0diff:${taskId}`).slice(0, 24),
        decision = store.get<Decision>("content_decisions", id);
      if (decision)
        store.transaction(() =>
          store.put("content_decisions", {
            ...decision,
            line: first.line,
            file: first.target,
            source: {
              kind: "commit",
              root: repository.root,
              commit: head,
              file: first.target,
            },
          }),
        );
    }
  }
  return result;
}

// The pre-push hook (§4.9): installed for one linked worktree only. Git
// runs hooks from the common hooks folder unless `core.hooksPath` is set;
// with `extensions.worktreeConfig` on, `git config --worktree` sets it for
// that worktree alone, so the main checkout's hooks are never touched
// (settles the Inferred note in §4.9; content-rules tests check it).
export function installPushHook(
  worktree: string,
  {
    cli,
    workspaceRoot,
    taskId,
  }: { cli: string; workspaceRoot: string; taskId: string },
) {
  // Git resolves symlinks in --absolute-git-dir but not in a relative
  // --git-common-dir, so compare real paths (a symlinked home or TMPDIR).
  const gitDir = gitSync(worktree, ["rev-parse", "--absolute-git-dir"]).trim(),
    commonDir = fs.realpathSync.native(
      path.resolve(
        worktree,
        gitSync(worktree, ["rev-parse", "--git-common-dir"]).trim(),
      ),
    );
  if (fs.realpathSync.native(gitDir) === commonDir)
    fail("The pre-push hook is installed only in a linked worktree.", 409);
  const hooks = path.join(gitDir, "avoozl-hooks"),
    hook = path.join(hooks, "pre-push"),
    quote = (value: unknown) => `'${String(value).replace(/'/g, `'\\''`)}'`;
  const text = [
    "#!/bin/sh",
    "# Installed by Avoozl for this worktree only: content rules (design 4.9).",
    `exec ${quote(process.execPath)} ${quote(cli)} content check --push --workspace ${quote(workspaceRoot)} --task ${quote(taskId)}`,
    "",
  ].join("\n");
  fs.mkdirSync(hooks, { recursive: true });
  let current: string | null = null;
  try {
    current = fs.readFileSync(hook, "utf8");
  } catch {}
  if (current !== text) fs.writeFileSync(hook, text, { mode: 0o755 });
  fs.chmodSync(hook, 0o755);
  let enabled = "";
  try {
    enabled = gitSync(worktree, [
      "config",
      "--get",
      "extensions.worktreeConfig",
    ]).trim();
  } catch {}
  if (enabled !== "true")
    gitSync(worktree, ["config", "extensions.worktreeConfig", "true"]);
  let set = "";
  try {
    set = gitSync(worktree, [
      "config",
      "--worktree",
      "--get",
      "core.hooksPath",
    ]).trim();
  } catch {}
  if (set !== hooks)
    gitSync(worktree, ["config", "--worktree", "core.hooksPath", hooks]);
  return { hook, hooksPath: hooks };
}

// Parse pre-push stdin: `<local ref> <local sha> <remote ref> <remote sha>`.
export function pushedCommits(stdin: unknown) {
  return String(stdin || "")
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 4 && !/^0+$/.test(parts[1]))
    .map(([localRef, local, remoteRef, remote]) => ({
      localRef,
      local,
      remoteRef,
      remote: /^0+$/.test(remote) ? null : remote,
    }));
}

// Avoozl's own write at a boundary (§4.9): true when it may go ahead. A
// block opens a decision and queues its notification; nothing is written.
function allowWrite(store: Store, input: EnforceInput) {
  if (
    !contentBinding(store)?.workspaceRoot &&
    !PRIVATE_BOUNDARIES.has(input.boundary)
  )
    return true;
  const result = enforce(store, input, { mode: "decide" });
  queueNotifications(store, result.notify);
  return result.ok;
}

// A GitHub client whose text writes pass content rules first (§4.9
// `github`): every issue, comment and discussion write Avoozl makes. A
// block throws 422 with `contentBlocked`, after opening a decision; the
// caller skips that one write and the tick goes on.
// What one GitHub write publishes, and how its target is named.
interface WriteShape {
  number?: unknown;
  text: unknown[];
  extra?: unknown[];
  comment?: boolean;
  discussion?: unknown;
  target?: string;
}
const GITHUB_WRITES: Record<string, (args: unknown[]) => WriteShape> = {
  createIssue: (args: unknown[]) => ({
    number: null,
    text: [fieldOf(args[1], "title"), fieldOf(args[1], "body")],
  }),
  updateIssue: (args: unknown[]) => ({
    number: args[1],
    text: [fieldOf(args[2], "title"), fieldOf(args[2], "body")],
  }),
  createIssueComment: (args: unknown[]) => ({
    number: args[1],
    text: [args[2]],
    comment: true,
  }),
  updateIssueComment: (args: unknown[]) => ({
    number: null,
    text: [args[2]],
    comment: true,
  }),
  createCommitComment: (args: unknown[]) => ({
    number: null,
    text: [args[2]],
    comment: true,
  }),
  updateCommitComment: (args: unknown[]) => ({
    number: null,
    text: [args[2]],
    comment: true,
  }),
  addDiscussionComment: (args: unknown[]) => ({
    number: null,
    text: [args[1]],
    comment: true,
    discussion: args[0],
  }),
  createPullRequest: (args: unknown[]) => ({
    number: null,
    text: [fieldOf(args[1], "title"), fieldOf(args[1], "body")],
    extra: [fieldOf(args[1], "head"), fieldOf(args[1], "base")],
  }),
  // Writes whose only text is a ref name, a commit message or a check
  // summary (R102.7). The target names a hash, never the text.
  createBranch: (args: unknown[]) => ({
    text: [],
    extra: [args[1]],
    target: `ref:${repositoryOf(args[0])}:${sha256(args[1]).slice(0, 12)}`,
  }),
  createLinkedBranch: (args: unknown[]) => ({
    text: [],
    extra: [fieldOf(args[0], "name")],
    target: `ref:linked:${sha256(fieldOf(args[0], "name")).slice(0, 12)}`,
  }),
  // A lease, release or takeover commit (workflow rule 15): its message.
  createCommit: (args: unknown[]) => ({
    text: [],
    extra: [fieldOf(args[1], "message")],
    target: `commit:${repositoryOf(args[0])}:${sha256(fieldOf(args[1], "message")).slice(0, 12)}`,
  }),
  mergeBranch: (args: unknown[]) => ({
    text: [],
    extra: [
      fieldOf(args[1], "message"),
      fieldOf(args[1], "head"),
      fieldOf(args[1], "base"),
    ],
    target: `merge:${repositoryOf(args[0])}:${sha256(fieldOf(args[1], "message")).slice(0, 12)}`,
  }),
};

// The writes whose text is a post: each gets broken mentions and the
// posted marker (github-posted.mjs) before content rules read it, unless a
// person's own operation writes it.
const POSTS: Record<string, (args: unknown[]) => unknown[]> = {
  createIssueComment: (args: unknown[]) => [
    args[0],
    args[1],
    postedText(args[2]),
  ],
  updateIssueComment: (args: unknown[]) => [
    args[0],
    args[1],
    postedText(args[2]),
  ],
  createCommitComment: (args: unknown[]) => [
    args[0],
    args[1],
    postedText(args[2]),
  ],
  updateCommitComment: (args: unknown[]) => [
    args[0],
    args[1],
    postedText(args[2]),
  ],
  addDiscussionComment: (args: unknown[]) => [args[0], postedText(args[1])],
  createPullRequest: (args: unknown[]) => [
    args[0],
    { ...fieldsOf(args[1]), body: postedText(fieldOf(args[1], "body")) },
  ],
};

const repositoryOf = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  const id = fieldOf(value, "id"),
    owner = fieldOf(value, "owner"),
    repo = fieldOf(value, "repo");
  return id
    ? String(id)
    : owner && repo
      ? `${String(owner)}/${String(repo)}`
      : null;
};

function githubTarget(shape: WriteShape, args: unknown[]) {
  const repository = repositoryOf(args[0]),
    body = String(shape.text.at(-1) ?? ""),
    task = /"taskId"\s*:\s*"([^"]+)"/.exec(body)?.[1];
  if (shape.target) return shape.target;
  if (shape.discussion) return `comment:discussion:${shape.discussion}`;
  if (shape.comment)
    return `comment:${repository}:${shape.number ?? args[1] ?? "?"}:${sha256(body.split("\n")[0]).slice(0, 12)}`;
  if (task) return `issue:${repository}:${task}`;
  if (shape.number) return `issue:${repository}#${shape.number}`;
  return `issue:${repository}:new:${sha256(String(shape.text[0] ?? "")).slice(0, 12)}`;
}

const guarded = new WeakSet<object>();
export function guardGitHub<T>(github: T, store: Store): T {
  if (!github || typeof github !== "object" || guarded.has(github))
    return github;
  const proxy = new Proxy(github, {
    get(target, name, receiver) {
      const value: unknown = Reflect.get(target, name, receiver),
        write = typeof name === "string" ? GITHUB_WRITES[name] : undefined;
      if (typeof value !== "function" || !write) return value;
      return function guarded(this: unknown, ...given: unknown[]) {
        const post = typeof name === "string" ? POSTS[name] : undefined,
          head = (!personPosting() && post?.(given)) || [],
          args = [...head, ...given.slice(head.length)],
          shape = write(args),
          text = [...shape.text, ...(shape.extra || [])]
            .filter((t) => typeof t === "string")
            .join("\n"),
          repository = repositoryOf(args[0]);
        if (
          text &&
          !allowWrite(store, {
            boundary: "github",
            repository: name === "addDiscussionComment" ? null : repository,
            target: githubTarget(shape, args),
            text,
          })
        )
          return Promise.reject(
            refusal(
              "Content rules blocked this GitHub write; nothing was written. The decision names the rule and line.",
              { status: 422, contentBlocked: true },
            ),
          );
        // A client derived from the proxy (a counting client) keeps
        // its own `this`, so its request override still counts the write.
        return value.apply(this === proxy ? target : this, args);
      };
    },
  });
  guarded.add(proxy);
  return proxy;
}
