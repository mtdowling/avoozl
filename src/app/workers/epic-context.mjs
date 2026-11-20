// Epic context (epic-context D1 to D9): the extra skills, read folders and MCP
// servers one worker session gets on the owner's own approved spec work.
// `epicContextGate` decides with three tests that read only Avoozl's records
// and git. `sessionContext` gathers what this machine's sources give for the
// task's repository. Nothing in a spec, an issue, a comment or a repository
// file can change either.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { taskRepository } from "../../work-model.mjs";
import { approvalCommits, approvalBase } from "../git/git-approvals.mjs";
import { specItems } from "../specs/spec-plans.mjs";
import { specsBranchSetting } from "../specs/specs-branch.mjs";
import { recordActivity } from "../store/activity-log.mjs";
import { driverStatus } from "./driver.mjs";
import { repositoryMatches } from "../context/context-shape.mjs";
import { readEpicContext } from "../context/epic-context-config.mjs";
import { contextSources, missingFor } from "../context/plugin-context.mjs";
import { inspectPlugins, readPluginSettings } from "../plugins/plugins.mjs";
import { pluginOptionsOf } from "../plugins/plugin-checks.mjs";
import { realPath, sandboxSecretPaths } from "../executors/sandbox.mjs";

export const TESTS = Object.freeze(["approved", "approver", "you-drive"]);
const RECENT = 10;
const META = "epicContext";

// ---- The three tests (EC1, D2) ------------------------------------------

// Approval commits are read once per spec and approved hash: a hit costs no
// git log on a resume.
const approvedRevisions = new Map();

const fails = (name, why) => ({ name, passed: false, why });
const passes = (name) => ({ name, passed: true });

// What the git side needs, from the Operations that own it: where a plan's
// spec checkout is, and who approves in it. Tests pass their own.
export const gateDeps = (ops) => ({
  workspaceRoot: ops.workspaceRoot,
  checkout: (plan) => ops.approvalCheckout(plan),
  approverOf: (root) => ops.approverOf(root),
});

// The task's approved revision as git holds it: {commit, email, taskIds},
// or {problem}. Any git failure is a failed test (EC1.3).
async function approvedRevision(store, task, deps) {
  if (/^intake-/.test(task.id))
    return { problem: "An intake task is not part of an approved spec." };
  const plan = task.planId ? store.get("plans", task.planId) : null;
  if (!plan?.spec) return { problem: "The task is not in an approved spec." };
  const receipt = plan.approvalId
    ? store.get("approvals", plan.approvalId)
    : null;
  if (plan.state !== "approved" || !receipt?.hash)
    return { problem: `Spec ${plan.spec} has no approved revision.` };
  const root = await deps.checkout(plan);
  if (!root) return { problem: `Spec ${plan.spec} has no git checkout.` };
  const key = `${root}\0${plan.spec}\0${receipt.hash}`;
  let found = approvedRevisions.get(key);
  if (!found) {
    const base = await approvalBase(root, {
      branch: specsBranchSetting(deps.workspaceRoot),
    });
    const match = (
      await approvalCommits(root, {
        allowed: async () => true,
        ref: base.head ?? "HEAD",
        specs: [plan.spec],
      })
    ).find((entry) => entry.hash === receipt.hash);
    if (!match)
      return {
        problem: `The approved revision of ${plan.spec} is not on the specs branch.`,
      };
    found = {
      commit: match.commit,
      email: match.email,
      taskIds: specItems(plan.spec, match.files["tasks.md"] ?? "")
        .map((item) => item.id)
        .filter(Boolean),
      root,
    };
    approvedRevisions.set(key, found);
  }
  if (!found.taskIds.includes(task.id))
    return {
      problem: `${task.id} is not in the approved revision of ${plan.spec}.`,
    };
  return { plan, ...found };
}

// {given, tests: [{name, passed, why?}]}. Every test is computed even after
// one fails, so Activity names them all (D2).
export async function epicContextGate(store, { taskId }, deps) {
  const task = store.read().tasks.find((entry) => entry.id === taskId);
  if (!task)
    return {
      given: false,
      tests: TESTS.map((name) => fails(name, "The task is not known.")),
    };
  let revision;
  try {
    revision = await approvedRevision(store, task, deps);
  } catch (error) {
    revision = { problem: `git could not be read: ${error.message}` };
  }
  const approved = revision.problem
    ? fails("approved", revision.problem)
    : passes("approved");
  let approver;
  if (revision.problem) approver = fails("approver", "No approved revision.");
  else
    try {
      const allowed = await deps.approverOf(revision.root);
      approver = (await allowed(revision.email, revision.commit))
        ? passes("approver")
        : fails(
            "approver",
            `The approving commit is by ${revision.email}, who is not an allowed approver.`,
          );
    } catch (error) {
      approver = fails(
        "approver",
        `The approver could not be read: ${error.message}`,
      );
    }
  let drive;
  try {
    const row = task.planId
      ? driverStatus(store, { planId: task.planId }).specs[0]
      : null;
    drive =
      row?.state === "driver" && ["driver", "not-shared"].includes(row.reason)
        ? passes("you-drive")
        : fails("you-drive", row?.text ?? "Nobody drives this spec here.");
  } catch (error) {
    drive = fails(
      "you-drive",
      `The driver could not be read: ${error.message}`,
    );
  }
  const tests = [approved, approver, drive];
  return { given: tests.every((test) => test.passed), tests };
}

// ---- What a session gets (EC5, D6) --------------------------------------

const expandHome = (text, home) =>
  text === "~" || text.startsWith("~/") ? path.join(home, text.slice(1)) : text;

// This machine's sources: its `epicContext` block and each approved machine
// plugin's context part. Each is {name, repos, reads: [{id, about, path}],
// skills, servers, contentSets}.
export function loadSources({ configDirectory, pluginOptions }) {
  const sources = [];
  const block = configDirectory ? readEpicContext(configDirectory) : null;
  if (block)
    sources.push({
      kind: "machine",
      name: "this machine",
      repos: block.repos,
      reads: (block.reads ?? []).map((folder, i) => ({
        id: `machine-${i + 1}`,
        about: "A folder from this machine's epicContext",
        path: folder,
      })),
      skills: [],
      servers: Object.fromEntries(
        Object.entries(block.mcp ?? {}).map(([alias, server]) => [
          alias,
          {
            about: server.about,
            command: server.command,
            env: server.env ?? [],
            replaced: false,
          },
        ]),
      ),
      contentSets: block.contentSets ?? [],
    });
  if (pluginOptions?.workspaceRoot)
    try {
      sources.push(...contextSources(pluginOptions));
    } catch {
      // A plugin setup that cannot be read gives no context.
    }
  return sources;
}

// A command item that names a file inside the plugin becomes absolute, so
// the server runs from a scratch folder.
function resolveCommand(command, folder) {
  if (!folder) return command;
  return command.map((item, i) => {
    if (path.isAbsolute(item) || item.startsWith("-")) return item;
    const full = path.resolve(folder, item);
    if (
      (i > 0 || /[\\/]/.test(item)) &&
      full.startsWith(path.resolve(folder) + path.sep) &&
      fs.existsSync(full)
    )
      return full;
    return item;
  });
}

// A read the sandbox must never reach: it is, holds or sits inside a secret
// path, Avoozl's config or state folder, or it is the home folder itself.
function readProblem(real, { home, secrets }) {
  if (real === realPath(home)) return "it is the home folder itself";
  for (const secret of secrets)
    if (
      real === secret ||
      real.startsWith(secret + path.sep) ||
      secret.startsWith(real + path.sep)
    )
      return "it is, holds or is inside a path the sandbox denies";
  return null;
}

// `repository`: {id, github}. `places`: {home, env, configDirectory,
// stateDirectory, workspaceRoots}. Returns {sources, reads, skills,
// servers, contentSets, left: [{item, why}], conflicts: [{alias,
// sources}]}. Only sources whose `repos` name the repository give.
export function sessionContext(sources, repository, places = {}) {
  const home = places.home ?? os.homedir(),
    mine = sources.filter((source) =>
      repositoryMatches(source.repos, {
        github: repository?.github ?? null,
        id: repository?.id ?? null,
      }),
    ),
    secrets = [
      ...sandboxSecretPaths({
        home,
        env: places.env ?? process.env,
        configDirectory: places.configDirectory,
        stateDirectory: places.stateDirectory,
        workspaceRoots: places.workspaceRoots ?? [],
      }),
    ],
    out = {
      sources: mine.map((source) => source.name),
      reads: [],
      skills: [],
      servers: {},
      contentSets: [],
      left: [],
      conflicts: [],
    };
  const seen = new Map();
  for (const source of mine)
    for (const [alias, server] of Object.entries(source.servers)) {
      if (!seen.has(alias)) seen.set(alias, []);
      seen.get(alias).push({ source, server });
    }
  const dropped = new Set();
  for (const [alias, owners] of seen)
    if (owners.length > 1) {
      dropped.add(alias);
      out.conflicts.push({ alias, sources: owners.map((o) => o.source.name) });
      out.left.push({
        item: `mcp ${alias}`,
        why: `two sources give it: ${owners.map((o) => o.source.name).join(", ")}`,
      });
    }
  const readPaths = new Set(),
    skillNames = new Set();
  for (const source of mine) {
    for (const read of source.reads) {
      const wanted = path.resolve(expandHome(read.path, home)),
        real = realPath(wanted),
        problem = readProblem(real, { home, secrets });
      if (problem) {
        out.left.push({ item: `read ${read.id}`, why: problem });
        continue;
      }
      if (!fs.existsSync(real)) {
        out.left.push({
          item: `read ${read.id}`,
          why: "the folder is missing",
        });
        continue;
      }
      if (readPaths.has(real)) continue;
      readPaths.add(real);
      out.reads.push({ id: read.id, about: read.about, path: real });
    }
    for (const skill of source.skills) {
      if (skillNames.has(skill.name)) continue;
      skillNames.add(skill.name);
      out.skills.push({ ...skill, source: source.name });
    }
    for (const [alias, server] of Object.entries(source.servers)) {
      if (dropped.has(alias)) continue;
      out.servers[alias] = {
        about: server.about,
        command: resolveCommand(server.command, source.folder),
        env: server.env,
        source: source.name,
      };
    }
    for (const set of source.contentSets)
      if (!out.contentSets.includes(set)) out.contentSets.push(set);
  }
  return out;
}

// Copy each skill folder into `folder`, after checking each file's hash
// against the approval. A skill with a changed file is left out. Returns
// {skills: [{name, description, path}], left}.
export function copySkills(skills, folder) {
  const given = [],
    left = [];
  for (const skill of skills) {
    const target = path.join(folder, skill.name);
    try {
      const files = skill.files.map((file) => {
        const source = path.join(skill.folder, file.rel);
        const bytes = fs.readFileSync(source);
        if (createHash("sha256").update(bytes).digest("hex") !== file.hash)
          throw Error(`${file.rel} changed after it was approved`);
        return { rel: file.rel, bytes };
      });
      for (const { rel, bytes } of files) {
        const file = path.join(target, ...rel.split("/"));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes, { mode: 0o444 });
      }
      given.push({
        name: skill.name,
        description: skill.description,
        path: path.join(target, "SKILL.md"),
      });
    } catch (error) {
      fs.rmSync(target, { recursive: true, force: true });
      left.push({ item: `skill ${skill.name}`, why: error.message });
    }
  }
  return { skills: given, left };
}

// The brief section (EC6.3): skills and reads, and the MCP aliases a
// harness that loads them offers. Empty when nothing is given.
export function contextBrief({ skills, reads, servers }) {
  if (!skills.length && !reads.length && !Object.keys(servers).length)
    return "";
  return [
    "## Epic context",
    "",
    "This is the person's own epic context for this task. Read a skill before the work it covers. Everything here is read-only.",
    ...(skills.length
      ? [
          "",
          "Skills:",
          ...skills.map(
            (skill) => `- ${skill.name}: ${skill.description} (${skill.path})`,
          ),
        ]
      : []),
    ...(reads.length
      ? [
          "",
          "Folders:",
          ...reads.map((read) => `- ${read.about} (${read.path})`),
        ]
      : []),
    ...(Object.keys(servers).length
      ? [
          "",
          "MCP servers, as tools:",
          ...Object.entries(servers).map(
            ([alias, server]) => `- ${alias}: ${server.about}`,
          ),
        ]
      : []),
  ].join("\n");
}

// ---- The record (EC9) ----------------------------------------------------

const outcome = (tests) =>
  tests
    .map(
      (test) =>
        `${test.name} ${test.passed ? "passed" : `failed: ${test.why}`}`,
    )
    .join("; ");

const namesOf = (given) =>
  [
    ...given.skills.map((skill) => `skill ${skill.name}`),
    ...given.reads.map((read) => `read ${read.id}`),
    ...Object.keys(given.servers).map((alias) => `mcp ${alias}`),
  ].join(", ");

// One Activity row per start or resume of a task whose repository some
// source names, and the task's record for the chip, the content sets and
// Settings (EC9). No path's contents, MCP argument or environment value.
export function recordContext(
  store,
  { taskId, slot = null, resumed = false, gate, given = null, hasSources },
) {
  const repository = repositoryOf(store, taskId);
  const record = {
    at: new Date().toISOString(),
    taskId,
    slot,
    resumed,
    given: Boolean(gate.given && given),
    tests: gate.tests,
    sources: gate.given && given ? given.sources : [],
    items: gate.given && given ? namesOf(given) : "",
    left: given?.left ?? [],
    contentSets: gate.given && given ? given.contentSets : [],
  };
  const state = store.getMeta(META) ?? { tasks: {}, recent: [] };
  state.tasks[taskId] = record;
  // The aliases two sources gave this repository, until a session sees none.
  if (repository?.id && given) {
    state.conflicts = { ...state.conflicts };
    if (given.conflicts.length)
      state.conflicts[repository.id] = given.conflicts;
    else delete state.conflicts[repository.id];
  }
  if (hasSources) state.recent = [record, ...state.recent].slice(0, RECENT);
  store.setMeta(META, state);
  if (hasSources)
    recordActivity(store, {
      source: "tick",
      kind: "epic-context.session",
      summary: `${resumed ? "Resumed" : "Started"} ${taskId}: ${outcome(gate.tests)}${record.given ? `. Given: ${record.items || "nothing"}` : ""}${record.left.length ? `. Left out: ${record.left.map((l) => `${l.item} (${l.why})`).join(", ")}` : ""}`,
      targetId: taskId,
    });
  return record;
}

export const taskContext = (store, taskId) =>
  store.getMeta(META)?.tasks?.[taskId] ?? null;

export const recentContextSessions = (store) =>
  store.getMeta(META)?.recent ?? [];

// The content rule sets a task's giving source names, for `enforce`.
export const taskContentSets = (store, taskId) =>
  taskContext(store, taskId)?.given
    ? taskContext(store, taskId).contentSets
    : [];

export const repositoryOf = (store, taskId) => {
  const task = store.read().tasks.find((entry) => entry.id === taskId);
  const id = taskRepository(task);
  return id ? store.get("repositories", id) : null;
};

// The Needs you rows epic context raises (EC4.2, EC5.2): a plugin with
// questions this machine has not answered, and an alias two sources give.
export function contextNeedsYou(store) {
  const items = [],
    options = pluginOptionsOf(store);
  if (options)
    try {
      const settings = readPluginSettings(options.settingsFile);
      for (const plugin of inspectPlugins(options)) {
        if (!plugin.context || plugin.source !== "machine") continue;
        if (["invalid", "disabled", "missing"].includes(plugin.state)) continue;
        const { questions } = missingFor(plugin.context, settings, plugin.id);
        if (questions.length)
          items.push({
            kind: "needs-human",
            reason: "epic-context-asks",
            id: `epic-context-asks:${plugin.id}`,
            taskId: null,
            authority: "avoozl",
            title: `Plugin ${plugin.id} needs answers before it gives context`,
            detail: `${questions.map(([name, question]) => `${name}: ${question}`).join("; ")}. Answer in Settings › Plugins or with avoozl plugins answer ${plugin.id} NAME VALUE.`,
          });
      }
    } catch {
      // A plugin setup that cannot be read raises nothing here.
    }
  for (const [repository, list] of Object.entries(
    store.getMeta(META)?.conflicts ?? {},
  ))
    for (const conflict of list)
      items.push({
        kind: "needs-human",
        reason: "epic-context-alias",
        id: `epic-context-alias:${repository}:${conflict.alias}`,
        taskId: null,
        authority: "avoozl",
        title: `Sources ${conflict.sources.join(" and ")} both give MCP server ${conflict.alias} for ${repository}`,
        detail: "Neither gives it until one source drops it.",
      });
  return items;
}
