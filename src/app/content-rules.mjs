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
  Worker,
  receiveMessageOnPort,
} from "node:worker_threads";
import { globalAvoozlConfigPath } from "./layered-config.mjs";
import { queueNotifications } from "./notifications.mjs";
import { fail } from "./store.mjs";

// `intake` screens incoming items (design §4.12) and runs only for a set
// that names it, so GitHub intake is unchanged unless the owner asks.
export const BOUNDARIES = Object.freeze([
  "plan",
  "github",
  "brief",
  "diff",
  "intake",
]);
const OPT_IN = new Set(["intake"]);
export const ACTIONS = Object.freeze(["block", "report"]);
export const CHECK_TIMEOUT_MS = 2000;
const SET_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// Keys that could hold a rule; `.avoozl.json` never does (R40.1).
const RULE_KEYS = new Set(["terms", "patterns", "rules", "pattern", "regex"]);
const MAX_RULES = 2000;
const MAX_TERMS_BYTES = 1024 * 1024;

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const sha256 = (text) =>
  createHash("sha256")
    .update(String(text ?? ""))
    .digest("hex");

// Public rules for text that will be published: secrets and machine paths.
// The release scan (scripts/release-scan.mjs) and the Onboard flow's leak
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
  ].map(([category, rule, pattern]) => ({ category, rule, pattern })),
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
function readTermLines(text) {
  const rules = [],
    allows = [],
    errors = [];
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
        const reason = String(error.message).split(": ").pop();
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
export function parseTerms(text, { category = "private-name" } = {}) {
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
export function matchLine(line, rules) {
  return rules.filter(
    ({ pattern, allow }) =>
      pattern.test(line) && !(allow || []).some((a) => a.test(line)),
  );
}

// Undo the encodings a term can hide behind: percent escapes (repeated, for
// double encoding), numeric HTML entities, backslash escapes and zero-width
// characters (moved from github-plans-repo.mjs, F68).
export function decode(text) {
  let value = String(text ?? "");
  for (let round = 0; round < 3; round += 1) {
    const next = value
      .replace(/%([0-9a-f]{2})/gi, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/&#(x[0-9a-f]{1,6}|[0-9]{1,7});/gi, (match, code) => {
        const point =
          code[0].toLowerCase() === "x"
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
`;

let runner = null;
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
  return { worker, port: port1, flag: new Int32Array(flag) };
}

// [{line index, set, rule}] for every rule that matches a line, or throws
// {timeout: true} past the time limit (the worker is then replaced).
export function matchInWorker(rules, lines, options) {
  return matchLinesInWorker(rules, lines, options).hits;
}

// {hits: [{index, set, rule}], allowed: [{set, rule, count}]}: a rule with
// `allow` sources drops a match when one of them matches the same line, and
// only the count is kept (R40.15).
export function matchLinesInWorker(
  rules,
  lines,
  { timeoutMs = CHECK_TIMEOUT_MS } = {},
) {
  if (!rules.length || !lines.length) return { hits: [], allowed: [] };
  runner ||= startRunner();
  const { port, flag } = runner,
    key = sha256(JSON.stringify(rules));
  Atomics.store(flag, 0, 0);
  port.postMessage({ key, rules, lines });
  if (Atomics.wait(flag, 0, 0, timeoutMs) === "timed-out") {
    const stale = runner;
    runner = null;
    stale.worker.terminate();
    const error = Error(
      `matching ran past the ${Math.round(timeoutMs / 100) / 10} s time limit`,
    );
    error.timeout = true;
    throw error;
  }
  const reply = receiveMessageOnPort(port)?.message;
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

function refuseRuleKeys(value, where) {
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

// The validated `contentRules` of a policy: {sets: [{id, action, boundaries,
// repositories, plugin}]}. `pluginIds` and `repositories`, when given, are
// the ids the set may name.
export function validateContentRules(
  value,
  { pluginIds = null, repositories = null } = {},
) {
  if (value === undefined || value === null) return { sets: [] };
  refuseRuleKeys(value, "contentRules");
  if (!record(value)) fail("contentRules must be an object.");
  for (const key of Object.keys(value))
    if (key !== "sets")
      fail(`contentRules.${key} is not a content rules setting.`);
  const list = value.sets ?? [];
  if (!Array.isArray(list)) fail("contentRules.sets must be a list.");
  const seen = new Set();
  const sets = list.map((entry, i) => {
    const where = `contentRules.sets.${i}`;
    if (!record(entry)) fail(`${where} must be an object.`);
    for (const key of Object.keys(entry))
      if (
        !["id", "action", "boundaries", "repositories", "plugin", "remote"].includes(key)
      )
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
    if (!ACTIONS.includes(action))
      fail(`${where}.action must be block or report.`);
    let boundaries = null;
    if (entry.boundaries !== undefined) {
      if (
        !Array.isArray(entry.boundaries) ||
        !entry.boundaries.length ||
        entry.boundaries.some((b) => !BOUNDARIES.includes(b))
      )
        fail(`${where}.boundaries may list only ${BOUNDARIES.join(", ")}.`);
      boundaries = [...new Set(entry.boundaries)];
    }
    let repos = null;
    if (entry.repositories !== undefined) {
      if (
        !Array.isArray(entry.repositories) ||
        !entry.repositories.length ||
        entry.repositories.some((r) => typeof r !== "string" || !r.trim())
      )
        fail(`${where}.repositories must list registered repositories.`);
      if (repositories) {
        const known = new Set([...repositories].map((r) => r.toLowerCase()));
        for (const name of entry.repositories)
          if (!known.has(name.toLowerCase()))
            fail(
              `${where}.repositories names ${name}, which is not a registered repository.`,
            );
      }
      repos = [...entry.repositories];
    }
    if (entry.plugin !== undefined) {
      if (typeof entry.plugin !== "string" || !entry.plugin)
        fail(`${where}.plugin must name a plugins entry.`);
      if (pluginIds && !pluginIds.includes(entry.plugin))
        fail(`${where}.plugin ${entry.plugin} names no plugins entry.`);
    }
    // Remote crews (§4.10, R41.11): a set covering `diff` forbids them by
    // default, because its pre-push hook is installed only on this machine.
    if (entry.remote !== undefined && !["allow", "forbid"].includes(entry.remote))
      fail(`${where}.remote must be allow or forbid.`);
    return {
      id: entry.id,
      action,
      boundaries,
      repositories: repos,
      plugin: entry.plugin ?? null,
      remote:
        entry.remote ??
        (!boundaries || boundaries.includes("diff") ? "forbid" : "allow"),
    };
  });
  return { sets };
}

// The ids `.avoozl.json` plugins entries and machine plugin settings declare.
function declaredPluginIds(policy, settingsFile) {
  const ids = (policy.plugins || []).map((p) => p?.id).filter(Boolean);
  try {
    const machine = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    for (const p of machine.plugins || []) if (p?.id) ids.push(p.id);
  } catch {}
  return ids;
}

// ---------------------------------------------------------------------------
// Terms file location and the Git check (§4.9, F74).

function machineTerms(configFile) {
  try {
    const value = JSON.parse(fs.readFileSync(configFile, "utf8"));
    return record(value?.contentRules?.terms) ? value.contentRules.terms : {};
  } catch {
    return {};
  }
}

const expand = (file, base) =>
  file.startsWith("~/")
    ? path.join(os.homedir(), file.slice(2))
    : path.resolve(base, file);

export function termsFileFor(id, { workspaceRoot, configFile }) {
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
export function gitEnvironment() {
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

export function gitExposure(file) {
  const folder = path.dirname(file),
    run = (args) =>
      execFileSync("git", args, {
        cwd: folder,
        encoding: "utf8",
        env: gitEnvironment(),
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
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

const bound = new WeakMap();

export function bindContentRules(
  store,
  {
    workspaceRoot = null,
    configFile = globalAvoozlConfigPath(),
    pluginSettingsFile = null,
    timeoutMs = CHECK_TIMEOUT_MS,
  } = {},
) {
  const previous = bound.get(store);
  const binding = {
    workspaceRoot,
    configFile,
    pluginSettingsFile,
    timeoutMs,
    // Rule sets a `rules` plugin supplied, in memory only (R40.9):
    // plugin id -> {loadedAt, sets: Map(id -> {version, rules}), error}.
    plugins:
      previous?.workspaceRoot === workspaceRoot ? previous.plugins : new Map(),
  };
  bound.set(store, binding);
  return binding;
}

export function contentBinding(store) {
  return bound.get(store) || null;
}

function readPolicy(workspaceRoot) {
  if (!workspaceRoot) return {};
  try {
    return JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw Error(`.avoozl.json is invalid: ${error.message}`);
  }
}

// Registered repositories a set may name: local projects and GitHub ones.
function registeredRepositories(store, policy) {
  const names = new Set();
  try {
    for (const project of store.list("projects")) {
      names.add(project.id);
      if (project.repository) names.add(project.repository);
    }
    for (const repo of store.list("github_repositories")) names.add(repo.id);
  } catch {}
  for (const id of Object.keys(policy?.github?.repositories || {}))
    names.add(id);
  return names;
}

// Every configured set with its rules, or why it is unavailable. Terms files
// are read on each call, so an added or removed file applies at once.
export function resolveSets(store) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return { sets: [], error: null };
  let policy, rules;
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
          reason: `.avoozl.json contentRules is invalid: ${error.message}`,
        },
      ],
      error: error.message,
    };
  }
  const repositories = registeredRepositories(store, policy);
  const sets = rules.sets.map((set) => {
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
      const supplied = loaded.sets.get(set.id);
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
      return {
        ...located,
        available: false,
        reason: /Invalid regular expression/.test(error.message)
          ? "a rule does not compile"
          : /^Terms /.test(error.message)
            ? error.message
            : error.message.replace(/: .*$/s, ""),
      };
    }
  });
  return { sets, error: null };
}

// What Settings shows: each set, its source kind and availability, never a
// rule. `choices` are what a set may name: registered repositories and
// declared plugins.
export function describeSets(store) {
  const { sets, error } = resolveSets(store);
  return {
    error,
    sets: sets.map(({ rules, ...set }) => set),
    builtins: BUILTIN_SETS.map(({ id, appliesAt }) => ({ id, appliesAt })),
    choices: setChoices(store),
  };
}

function setChoices(store) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return { repositories: [], plugins: [] };
  let policy = {};
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
export function checkTermsText(text) {
  const value = String(text ?? ""),
    errors = [];
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
function termsTarget(store, id) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) fail("Content rules need a workspace.", 409);
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
export function readTermsFile(store, { id } = {}) {
  const { file, from } = termsTarget(store, id),
    binding = contentBinding(store),
    shown =
      from === "machine"
        ? file
        : path.relative(binding.workspaceRoot, file).split(path.sep).join("/");
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
    if (error.code !== "ENOENT") fail("The terms file cannot be read.", 409);
    return { id, file: shown, from, editable: true, exists: false, text: "" };
  }
  return { id, file: shown, from, editable: true, exists: true, text };
}

export function writeTermsFile(store, { id, text } = {}) {
  if (typeof text !== "string") fail("Give the terms file text.");
  const { file, from } = termsTarget(store, id);
  if (from === "machine")
    fail(
      "This set's terms come from a file this machine's settings name. Avoozl writes only .avoozl/local/content-rules.",
      409,
    );
  const checked = checkTermsText(text);
  if (checked.errors.length) {
    const error = Error(
      `Nothing was saved. ${checked.errors
        .map((e) => (e.line ? `Line ${e.line} ${e.message}` : e.message))
        .join("; ")}.`,
    );
    error.status = 422;
    error.errors = checked.errors;
    throw error;
  }
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
      `.${id}.${process.pid}.${Date.now()}.pending`,
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

const covers = (set, boundary, repository) =>
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
function linesOf({ target, text, added }) {
  if (Array.isArray(added))
    return added.map((entry) => ({
      target: entry.target ?? target,
      line: entry.line ?? null,
      text: String(entry.text ?? ""),
    }));
  return String(text ?? "")
    .split("\n")
    .map((line, i) => ({ target, line: i + 1, text: line }));
}

// check({boundary, repository, target, text, added}): findings as {set, rule,
// boundary, target, line, action, version?}, and the covering sets that are
// unavailable as {set, reason}. Never the matched text. Writes nothing.
export function check(store, input) {
  const { boundary, repository = null } = input;
  if (!BOUNDARIES.includes(boundary))
    fail(`Unknown content boundary ${boundary}.`);
  const binding = contentBinding(store),
    { sets } = resolveSets(store),
    applying = sets.filter((set) => covers(set, boundary, repository)),
    unavailable = applying
      .filter((set) => !set.available)
      .map((set) => ({ set: set.id, reason: set.reason })),
    ready = applying.filter((set) => set.available),
    lines = linesOf(input),
    findings = [];
  if (!ready.length || !lines.length) return { findings, unavailable };
  const rules = ready.flatMap((set) =>
    set.rules.map((rule) => ({
      set: set.id,
      rule: rule.id,
      source: rule.source,
      ...(rule.allow ? { allow: rule.allow } : {}),
    })),
  );
  let hits, allowed;
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
        reason: error.timeout ? error.message : "a rule does not compile",
      });
    return { findings, unavailable };
  }
  const byId = new Map(ready.map((set) => [set.id, set])),
    seen = new Set();
  for (const hit of hits) {
    const line = lines[hit.index],
      key = `${hit.set}\0${hit.rule}\0${line.target}\0${line.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const set = byId.get(hit.set);
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
export function contentHash(input) {
  return sha256(
    Array.isArray(input.added)
      ? input.added
          .map((l) => `${l.target ?? ""}\0${l.line ?? ""}\0${l.text}`)
          .join("\n")
      : String(input.text ?? ""),
  );
}

export const findingText = (f) =>
  `${f.set} rule ${f.rule} at ${f.target}${f.line ? ` line ${f.line}` : ""}`;

const decisionId = (set, target) =>
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
  store,
  input,
  { mode = "decide", taskId = null, source = null } = {},
) {
  const result = check(store, input),
    hash = contentHash(input),
    notify = [],
    allowances = store.list("content_allowances").filter((a) => !a.usedAt),
    blocking = [],
    used = [];
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
      for (const decision of store.list("content_decisions"))
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
    const error = Error(
      `Content rules refused this, nothing was written: ${named.join("; ")}. Change the text and try again.`,
    );
    error.status = 422;
    error.findings = blocking;
    error.unavailable = result.unavailable;
    throw error;
  }
  store.transaction(() => {
    const bySet = new Map();
    for (const finding of blocking) {
      const key = decisionId(finding.set, finding.target);
      if (!bySet.has(key)) bySet.set(key, []);
      bySet.get(key).push(finding);
    }
    for (const [id, findings] of bySet) {
      const current = store.get("content_decisions", id),
        first = findings[0];
      const next = {
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
        title: `Content rule ${first.set} blocked a write`,
        text: `${findings.map(findingText).join("; ")} (${input.boundary}). Nothing was written.`,
        resume:
          "Change the content, or allow it once with a reason in the Avoozl page.",
      });
    }
    for (const missing of result.unavailable) {
      const id = "content-unavailable:" + sha256(missing.set).slice(0, 24),
        current = store.get("content_decisions", id);
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
export function settleUnavailable(store) {
  const { sets } = resolveSets(store),
    available = new Set(sets.filter((s) => s.available).map((s) => s.id)),
    named = new Set(sets.map((s) => s.id)),
    at = new Date().toISOString();
  const open = store
    .list("content_decisions")
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
  store,
  { id, reason, rule } = {},
  { operator = "", caller = null } = {},
) {
  if (caller)
    fail(
      "Only a person allows blocked content, from the Avoozl page or the CLI.",
      403,
    );
  if (typeof reason !== "string" || !reason.trim() || reason.length > 2000)
    fail("Give a reason of 1–2000 characters to allow this once.");
  const decision = store.get("content_decisions", id);
  if (!decision) fail("Content decision not found.", 404);
  if (decision.kind !== "match")
    fail("Only a matched write can be allowed once.", 409);
  if (decision.state !== "open")
    fail(`This decision is ${decision.state}.`, 409);
  const rules = rule ? [rule] : decision.rules;
  if (rule && !decision.rules.includes(rule))
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
export function showDecisionLine(store, id) {
  const decision = store.get("content_decisions", id);
  if (!decision) fail("Content decision not found.", 404);
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
        ["show", `${source.commit}:${source.file}`],
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
export function contentItems(store) {
  return {
    decisions: store
      .list("content_decisions")
      .filter((d) => d.state === "open"),
    reports: store.list("content_reports"),
  };
}

// ---------------------------------------------------------------------------
// Rules plugins (§4.9 Rules plugins, R40.9). Called with an open plugin
// session; the sets stay in this process's memory only.

export function checkRuleSets(reply) {
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
export async function loadRulePlugins(store, pluginHost) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return;
  let policy;
  try {
    policy = readPolicy(binding.workspaceRoot);
  } catch {
    return;
  }
  const wanted = [
    ...new Set(
      (Array.isArray(policy?.contentRules?.sets)
        ? policy.contentRules.sets
        : []
      )
        .map((s) => s?.plugin)
        .filter((id) => typeof id === "string"),
    ),
  ];
  for (const id of [...binding.plugins.keys()])
    if (!wanted.includes(id)) binding.plugins.delete(id);
  if (!wanted.length) return;
  if (!pluginHost) {
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
          sets: new Map(reply.sets.map((set) => [set.id, set])),
        });
      } catch (error) {
        binding.plugins.set(id, {
          loadedAt: Date.now(),
          error: String(error?.message || error)
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
export function rulePluginsStale(store, maxAgeMs = 60_000) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return false;
  let policy;
  try {
    policy = readPolicy(binding.workspaceRoot);
  } catch {
    return false;
  }
  const wanted = (
    Array.isArray(policy?.contentRules?.sets) ? policy.contentRules.sets : []
  )
    .map((s) => s?.plugin)
    .filter((id) => typeof id === "string");
  return wanted.some((id) => {
    const loaded = binding.plugins.get(id);
    return !loaded || Date.now() - loaded.loadedAt > maxAgeMs;
  });
}

// ---------------------------------------------------------------------------
// Built-in rule sets (R40.12). Each keeps the patterns, decoding and refusal
// shape of the screen it came from; the old exports wrap these.

const lower = (value) => String(value || "").toLowerCase();
const escapeChar = (char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// builtin:planning-repository (F68): `owner/name` with any whitespace (a line
// break included) allowed between its characters, not inside a longer name.
function planningNamePattern(planningRepository) {
  const chars = [...lower(planningRepository)].map(escapeChar).join("\\s*");
  return new RegExp(`(?<![\\w.-])${chars}(?![\\w-])`, "giu");
}

export function findPlanningLeak(fields, planningRepository) {
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
const REPLY_SECRETS = [
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
const REPLY_PATHS = [
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
const escapeText = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every finding as {kind, line}; never the matched text.
export function screenReply(body, { roots = [] } = {}) {
  const own = [...new Set(roots.filter((root) => root && root.length > 1))].map(
      (root) => [
        "absolute path",
        new RegExp(escapeText(root.replace(/\/$/, ""))),
      ],
    ),
    findings = [];
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
const PUBLISHED_SECRETS = [
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

export function secretReason(text) {
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

const specTarget = (spec, file) => `${spec.name}/${file}`;
// The file on disk, for the matched line on demand: `root` is the
// checkout findSpecFolder found the folder in.
const specSource = (spec, file) =>
  spec.root && spec.folder
    ? { kind: "file", path: path.join(spec.root, spec.folder, file) }
    : null;

// Check every spec file. mode "refuse" throws on the first blocked file
// (a planner's own save); mode "decide" opens decisions and returns
// {ok, notify} (approval).
export function enforceSpec(store, spec, { mode = "refuse" } = {}) {
  const notify = [];
  let ok = true;
  const refusals = [];
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
        if (error.status !== 422) throw error;
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
  if (refusals.length) {
    const error = Error(
      `Content rules refused this, nothing was written: ${refusals
        .flatMap((e) => [
          ...e.findings.map(findingText),
          ...e.unavailable.map((u) => `${u.set} is unavailable (${u.reason})`),
        ])
        .filter((v, i, all) => all.indexOf(v) === i)
        .join("; ")}. Change the text and try again.`,
    );
    error.status = 422;
    error.findings = refusals.flatMap((e) => e.findings);
    throw error;
  }
  return { ok, notify };
}

// `content.match` diagnostics for a read (plan.get, plan.lint, the spec
// list): what approval would block now, allowances counted, nothing used up.
export function specContentDiagnostics(store, spec) {
  if (!contentBinding(store)?.workspaceRoot) return [];
  const allowances = store.list("content_allowances").filter((a) => !a.usedAt),
    diagnostics = [];
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

const gitSync = (root, args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: gitEnvironment(),
    maxBuffer: 1 << 28,
    stdio: ["ignore", "pipe", "ignore"],
  });

// The commit a task's work is measured against: the merge base of `head`
// with the project's integration branch when it exists, else its base.
export function diffBase(project, head) {
  for (const branch of [
    project.integrationBranch,
    project.baseBranch || "main",
  ])
    if (branch)
      try {
        return gitSync(project.root, [
          "merge-base",
          head,
          `refs/heads/${branch}`,
        ]).trim();
      } catch {}
  return null;
}

// [{target: file, line, text}] for each line `head` adds over `base`.
export function addedLines(root, base, head) {
  const out = gitSync(root, [
    "diff",
    "--unified=0",
    "--no-color",
    "--no-ext-diff",
    "--no-renames",
    base ? `${base}..${head}` : head,
  ]);
  const lines = [];
  let file = null,
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

// Check a task's diff: {ok, findings, unavailable, notify}, or a 422 in
// "refuse" mode.
export function enforceDiff(store, { project, head, taskId, mode = "decide" }) {
  const base = diffBase(project, head),
    added = addedLines(project.root, base, head);
  const result = enforce(
    store,
    {
      boundary: "diff",
      repository: project.repository || project.id,
      target: `diff:${taskId}`,
      added,
    },
    {
      mode,
      taskId,
      source: { kind: "commit", root: project.root, commit: head },
    },
  );
  // A finding's own file goes in the decision's source, for the matched
  // line on demand.
  if (!result.ok && mode === "decide") {
    const first = result.findings[0];
    if (first) {
      const id =
          "content:" + sha256(`${first.set}\0diff:${taskId}`).slice(0, 24),
        decision = store.get("content_decisions", id);
      if (decision)
        store.transaction(() =>
          store.put("content_decisions", {
            ...decision,
            line: first.line,
            file: first.target,
            source: {
              kind: "commit",
              root: project.root,
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
export function installPushHook(worktree, { cli, workspaceRoot, taskId }) {
  const gitDir = gitSync(worktree, ["rev-parse", "--absolute-git-dir"]).trim(),
    commonDir = path.resolve(
      worktree,
      gitSync(worktree, ["rev-parse", "--git-common-dir"]).trim(),
    );
  if (gitDir === commonDir)
    fail("The pre-push hook is installed only in a linked worktree.", 409);
  const hooks = path.join(gitDir, "avoozl-hooks"),
    hook = path.join(hooks, "pre-push"),
    quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
  const text = [
    "#!/bin/sh",
    "# Installed by Avoozl for this worktree only: content rules (design 4.9).",
    `exec ${quote(process.execPath)} ${quote(cli)} content check --push --workspace ${quote(workspaceRoot)} --task ${quote(taskId)}`,
    "",
  ].join("\n");
  fs.mkdirSync(hooks, { recursive: true });
  let current = null;
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
export function pushedCommits(stdin) {
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
export function allowWrite(
  store,
  input,
  { taskId = null, source = null } = {},
) {
  if (!contentBinding(store)?.workspaceRoot) return true;
  const result = enforce(store, input, { mode: "decide", taskId, source });
  queueNotifications(store, result.notify);
  return result.ok;
}

// A GitHub client whose text writes pass content rules first (§4.9
// `github`): every issue, comment and discussion write Avoozl makes. A
// block throws 422 with `contentBlocked`, after opening a decision; the
// caller skips that one write and the tick goes on.
const GITHUB_WRITES = {
  createIssue: (args) => ({
    number: null,
    text: [args[1]?.title, args[1]?.body],
  }),
  updateIssue: (args) => ({
    number: args[1],
    text: [args[2]?.title, args[2]?.body],
  }),
  createIssueComment: (args) => ({
    number: args[1],
    text: [args[2]],
    comment: true,
  }),
  updateIssueComment: (args) => ({
    number: null,
    text: [args[2]],
    comment: true,
  }),
  createCommitComment: (args) => ({
    number: null,
    text: [args[2]],
    comment: true,
  }),
  updateCommitComment: (args) => ({
    number: null,
    text: [args[2]],
    comment: true,
  }),
  addDiscussionComment: (args) => ({
    number: null,
    text: [args[1]],
    comment: true,
    discussion: args[0],
  }),
  createPullRequest: (args) => ({
    number: null,
    text: [args[1]?.title, args[1]?.body],
  }),
};

const repositoryOf = (value) =>
  typeof value === "string"
    ? value
    : value?.id ||
      (value?.owner && value?.repo ? `${value.owner}/${value.repo}` : null);

export function githubTarget(method, args) {
  const shape = GITHUB_WRITES[method](args),
    repository = repositoryOf(args[0]),
    body = String(shape.text.at(-1) ?? ""),
    task = /"taskId"\s*:\s*"([^"]+)"/.exec(body)?.[1];
  if (shape.discussion) return `comment:discussion:${shape.discussion}`;
  if (shape.comment)
    return `comment:${repository}:${shape.number ?? args[1] ?? "?"}:${sha256(body.split("\n")[0]).slice(0, 12)}`;
  if (task) return `issue:${repository}:${task}`;
  if (shape.number) return `issue:${repository}#${shape.number}`;
  return `issue:${repository}:new:${sha256(String(shape.text[0] ?? "")).slice(0, 12)}`;
}

const guarded = new WeakSet();
export function guardGitHub(github, store) {
  if (!github || typeof github !== "object" || guarded.has(github))
    return github;
  const proxy = new Proxy(github, {
    get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver);
      if (typeof value !== "function" || !GITHUB_WRITES[name]) return value;
      return function guarded(...args) {
        const shape = GITHUB_WRITES[name](args),
          text = shape.text.filter((t) => typeof t === "string").join("\n"),
          repository = repositoryOf(args[0]);
        if (
          text &&
          !allowWrite(store, {
            boundary: "github",
            repository: name === "addDiscussionComment" ? null : repository,
            target: githubTarget(name, args),
            text,
          })
        ) {
          const error = Error(
            "Content rules blocked this GitHub write; nothing was written. The decision names the rule and line.",
          );
          error.status = 422;
          error.contentBlocked = true;
          return Promise.reject(error);
        }
        return value.apply(this === receiver ? target : this, args);
      };
    },
  });
  guarded.add(proxy);
  return proxy;
}
