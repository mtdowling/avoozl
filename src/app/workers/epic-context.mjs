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
import { enforce } from "../content/content-rules.mjs";
import { queueNotifications } from "../tick/notifications.mjs";
import { driverStatus } from "./driver.mjs";
import { repositoryMatches } from "../context/context-shape.mjs";
import { readEpicContext } from "../context/epic-context-config.mjs";
import { contextSources, missingFor } from "../context/plugin-context.mjs";
import { inspectPlugins, readPluginSettings } from "../plugins/plugins.mjs";
import { pluginOptionsOf } from "../plugins/plugin-checks.mjs";
import { EPIC_CONTEXT_META as META } from "../context/context-record.mjs";
import { realPath, sandboxSecretPaths } from "../executors/sandbox.mjs";
import {
  actorAllowed,
  readGitHubPolicyOrNull,
} from "../github/github-policy.mjs";

export const TESTS = Object.freeze(["approved", "approver", "you-drive"]);
const RECENT = 10;

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
        plugin: source.kind === "plugin" ? source.id : null,
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
  return approvedSkills(skills, (skill, files) => {
    const target = path.join(folder, skill.name);
    try {
      for (const { rel, bytes } of files) {
        const file = path.join(target, ...rel.split("/"));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes, { mode: 0o444 });
      }
    } catch (error) {
      fs.rmSync(target, { recursive: true, force: true });
      throw error;
    }
    return path.join(target, "SKILL.md");
  });
}

// Each skill whose files all still match the approval, as {name,
// description, path}; `place(skill, files)` makes the skill's folder and
// returns its SKILL.md path. A skill with a changed file is left out.
function approvedSkills(skills, place) {
  const given = [],
    left = [];
  for (const skill of skills)
    try {
      const files = skill.files.map((file) => {
        const bytes = fs.readFileSync(path.join(skill.folder, file.rel));
        if (createHash("sha256").update(bytes).digest("hex") !== file.hash)
          throw Error(`${file.rel} changed after it was approved`);
        return { rel: file.rel, bytes };
      });
      given.push({
        name: skill.name,
        description: skill.description,
        path: place(skill, files),
      });
    } catch (error) {
      left.push({ item: `skill ${skill.name}`, why: error.message });
    }
  return { skills: given, left };
}

// A chat names the approved plugin files where they are: it runs as the
// person and reads what it likes (EC8).
export const checkedSkills = (skills) =>
  approvedSkills(skills, (skill) => path.join(skill.folder, "SKILL.md"));

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
  {
    taskId,
    slot = null,
    resumed = false,
    gate,
    given = null,
    hasSources,
    note = null,
    briefOnly = false,
    attempt = 1,
  },
) {
  const repository = repositoryOf(store, taskId);
  const record = {
    at: new Date().toISOString(),
    taskId,
    slot,
    resumed,
    briefOnly,
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
      summary: `${resumed ? "Resumed" : "Started"} ${taskId}: ${outcome(gate.tests) || "no tests run"}${record.given ? `. Given: ${record.items || "nothing"}` : ""}${record.left.length ? `. Left out: ${record.left.map((l) => `${l.item} (${l.why})`).join(", ")}` : ""}${note ? `. ${note}` : ""}`,
      targetId: taskId,
      // A start is recorded once per attempt, however often the tick plans it.
      ...(resumed
        ? {}
        : { key: `epic-context:${taskId}:${attempt}:${briefOnly}` }),
    });
  return record;
}

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

// ---- A process session (EC6, EC7, D6) ------------------------------------

// What the process executor adds to one worker session, or null: the three
// tests ran and passed, a source named the repository, and the content
// rules let the brief section through. `places` are the folders sessionContext
// protects; `harness` is the harness's definition, which says whether it
// loads an MCP config. Records the tests either way when a source names the
// repository (EC9.2). Only the `worker` role gets context (EC5.5).
//   {readable, cleanup, mcp, brief, binding}
export async function processContext(
  store,
  {
    taskId,
    role,
    repository,
    resumed = false,
    slot = null,
    withheld = false,
    attempt = 1,
  },
  { ops, places, definition, folder = os.tmpdir(), chat = false },
) {
  if (role !== "worker" || !ops?.configDirectory) return null;
  const sources = loadSources({
      configDirectory: ops.configDirectory,
      pluginOptions: ops.pluginOptions,
    }),
    named = sources.some((source) =>
      repositoryMatches(source.repos, {
        github: repository?.github ?? null,
        id: repository?.id ?? null,
      }),
    );
  if (!named) return null;
  // A follow-up that must not hold context (EC1.7) runs no gate.
  const gate = withheld
    ? { given: false, tests: [] }
    : await epicContextGate(store, { taskId }, gateDeps(ops));
  let given = null,
    request = null,
    brief = "",
    note = withheld
      ? "context withheld: text from a login that does not count reached the session"
      : null;
  if (gate.given) {
    given = sessionContext(sources, repository, places);
    // A chat has no per-session MCP setting; a harness without context.mcp
    // loads no config file (EC7.1, EC8.1).
    if (
      (chat || !definition?.context?.mcp) &&
      Object.keys(given.servers).length
    ) {
      for (const alias of Object.keys(given.servers))
        given.left.push({
          item: `mcp ${alias}`,
          why: chat
            ? "a chat takes no MCP servers"
            : "the harness has no context.mcp",
        });
      given.servers = {};
    }
    const skillsFolder =
      !chat && given.skills.length
        ? fs.mkdtempSync(path.join(folder, "avoozl-context-"))
        : null;
    if (given.skills.length) {
      const placed = skillsFolder
        ? copySkills(given.skills, skillsFolder)
        : checkedSkills(given.skills);
      given.left.push(...placed.left);
      given.skills = placed.skills;
    }
    brief = contextBrief(given);
    // The brief section passes the repository's rules and the giving
    // sources' sets before the session sees it (EC9.3).
    const screened = brief
      ? enforce(
          store,
          {
            boundary: "brief",
            repository: repository?.github || repository?.id || null,
            target: `brief:${taskId}:context`,
            text: brief,
            contextSets: given.contentSets,
          },
          { mode: "decide", taskId },
        )
      : { ok: true, notify: [] };
    queueNotifications(store, screened.notify);
    if (!screened.ok) {
      note = "content rules blocked the context brief";
      if (skillsFolder)
        fs.rmSync(skillsFolder, { recursive: true, force: true });
      given = { ...given, skills: [], reads: [], servers: {}, left: [] };
      brief = "";
      gate.given = false;
    } else if (brief && !chat)
      request = {
        readable: [
          ...given.reads.map((read) => read.path),
          ...(skillsFolder ? [realPath(skillsFolder)] : []),
        ],
        cleanup: skillsFolder ? [skillsFolder] : [],
        mcp: Object.fromEntries(
          Object.entries(given.servers).map(([alias, server]) => [
            alias,
            { command: server.command, env: server.env, plugin: server.plugin },
          ]),
        ),
      };
  }
  const record = recordContext(store, {
    taskId,
    slot,
    resumed,
    gate,
    given,
    hasSources: true,
    note,
    briefOnly: chat,
    attempt,
  });
  if (chat) return { request: null, brief, record };
  if (!request) return { request: null, brief: "", record };
  return {
    request,
    brief,
    record,
    binding: {
      sources: record.sources,
      items: record.items,
      tests: record.tests,
    },
  };
}

// The "Epic context" section of a Kiro Crew chat worker's brief, or "" (EC8,
// D7): the skills and reads, no MCP server, and nothing the chat is held to.
// Run by the tick before the start request is stored.
export async function chatBrief(store, ops, { task: taskId, role, attempt }) {
  if (!ops) return "";
  const given = await processContext(
    store,
    { taskId, role, repository: repositoryOf(store, taskId), attempt },
    {
      ops,
      chat: true,
      places: {
        home: os.homedir(),
        env: process.env,
        configDirectory: ops.configDirectory,
        stateDirectory: ops.stateDirectory ?? null,
        workspaceRoots: [],
      },
    },
  );
  return given?.brief ?? "";
}

// Whether `login` counts under the repository's `allowedActors` and
// `minimumPermission` (EC1.7), as the review gate reads them: a repository the
// policy does not name needs write permission.
export async function authorCounts(ops, repository, login) {
  const name = repository?.github ?? null,
    policy = readGitHubPolicyOrNull(ops.workspaceRoot),
    entry = Object.entries(policy?.repositories ?? {}).find(
      ([id]) => name && id.toLowerCase() === name.toLowerCase(),
    )?.[1] ?? { allowedActors: [], minimumPermission: "write" };
  let held = null;
  if (entry.minimumPermission && name)
    try {
      held = (await ops.github?.permission(name, login))?.permission ?? null;
    } catch {
      held = null;
    }
  return actorAllowed(entry, login, held).allowed;
}
