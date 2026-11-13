// Incoming items (design §4.12, Requirement 50): work that comes in from
// GitHub, a tracker plugin's `poll`, or an MCP caller, kept as one record in
// SQLite and run through one pipeline: check, dedup, content rules (the
// `intake` boundary), trigger match, then the matched action or the Intake
// list. GitHub keeps its own intake (github-sync.mjs) and Untriaged read
// (untriaged.mjs); both write their items here too, as source `github`.
//
// Who counts: GitHub's rules stay as they are. A plugin states the actor and
// that actor's standing, and `actorAllowed` checks it against the source's
// settings. An MCP caller is the local owner with no outside actor Avoozl
// can verify, so its items meet only `pause` and `quarantine` rules; a
// person starts work with Plan this or Deliver this.
//
// Avoozl writes nothing back to a non-GitHub source in this phase.
import fs from "node:fs";
import path from "node:path";
import { digest } from "../model.mjs";
import { captureTask } from "../capture.mjs";
import { ContractError, incomingItem } from "./plugin-contract.mjs";
import {
  DEFAULT_PERMISSION,
  PERMISSIONS,
  actorAllowed,
  matchingRules,
  priorityRank,
} from "./github-policy.mjs";
import { enforce, findingText } from "./content-rules.mjs";
import { PluginUnavailable } from "./plugin-session.mjs";
import { declaredPlugins, readPluginSettings } from "./plugins.mjs";
import { workspaceRepositories } from "./workspace-repositories.mjs";
import { canonical, fail } from "./store.mjs";
import { CODE_REVIEW_SAGE_PATH } from "./untriaged.mjs";
import { listIdeas } from "./ideas.mjs";

// `retro` holds the skill changes a person approved from a retrospective
// (design §4.18).
export const RESERVED_SOURCES = Object.freeze(["github", "local", "retro"]);
export const POLL_LIMIT = 500;
export const SUBMIT_LIMIT = 100;
export const KEEP_CLOSED_MS = 30 * 24 * 60 * 60 * 1000;
export const WAITING_REASON = "Waiting on the author";
const SOURCE_ID = /^[a-z][a-z0-9-]{0,60}$/;
const PLUGIN_ID = /^[a-z][a-z0-9-]{0,60}$/;
const SOURCE_KEYS = [
  "via",
  "repository",
  "labelFields",
  "assigneeField",
  "allowedActors",
  "minimumPermission",
];
// GitHub intake's order (github-sync.mjs PRECEDENCE).
const PRECEDENCE = ["quarantine", "pause", "deliver", "execute", "plan"];
const STOPPING = new Set(["pause", "quarantine"]);
const STARTING = new Set(["deliver", "execute", "plan", "respond"]);
const HISTORY = 20;
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const lower = (value) => String(value).toLocaleLowerCase();

export const itemKey = (source, id) => `${source}\0${id}`;
export const intakeTaskId = (source, id) =>
  "intake-" + digest(itemKey(source, id)).slice(0, 16);

// ---------------------------------------------------------------------------
// Sources (R50.6): declared under `intake.sources` in `.avoozl.json` or in
// this machine's plugins.json, like `plugins` entries.

function names(value, where) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((v) => typeof v !== "string" || !v.trim() || v.length > 200)
  )
    fail(`${where} must be a list of names.`);
  return value;
}

export function validateSource(id, value, where = `intake.sources.${id}`) {
  if (typeof id !== "string" || !SOURCE_ID.test(id))
    fail(`${where} needs a lowercase source id.`);
  if (RESERVED_SOURCES.includes(id))
    fail(`${where}: ${id} is built in and cannot be declared.`);
  if (!record(value)) fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!SOURCE_KEYS.includes(key))
      fail(`${where}.${key} is not an intake source setting.`);
  const via = value.via;
  if (
    typeof via !== "string" ||
    !(
      via === "mcp" ||
      (via.startsWith("plugin:") && PLUGIN_ID.test(via.slice(7)))
    )
  )
    fail(`${where}.via must be plugin:<id> or mcp.`);
  if (typeof value.repository !== "string" || !value.repository.trim())
    fail(`${where}.repository must name a registered repository.`);
  const labelFields = names(value.labelFields, `${where}.labelFields`);
  if (
    value.assigneeField !== undefined &&
    (typeof value.assigneeField !== "string" || !value.assigneeField.trim())
  )
    fail(`${where}.assigneeField must name one field.`);
  const allowedActors = names(value.allowedActors, `${where}.allowedActors`);
  if (
    value.minimumPermission !== undefined &&
    !PERMISSIONS.includes(value.minimumPermission)
  )
    fail(
      `${where}.minimumPermission must be one of ${PERMISSIONS.join(", ")}.`,
    );
  return {
    id,
    via,
    plugin: via === "mcp" ? null : via.slice(7),
    repository: value.repository,
    labelFields,
    assigneeField: value.assigneeField ?? null,
    allowedActors,
    // A source that names nobody defaults to people with write standing,
    // like a GitHub repository (R10.2).
    minimumPermission:
      value.minimumPermission ??
      (allowedActors.length ? null : DEFAULT_PERMISSION),
  };
}

// What each source holds, for Settings: items, how many are untriaged, and
// when the newest one first came in. Reads only.
export function sourceCounts(store) {
  const counts = new Map();
  for (const row of itemRows(store)) {
    if (!row.record || row.record.kind === "idea") continue;
    const count = counts.get(row.source) ?? {
      total: 0,
      untriaged: 0,
      lastAt: null,
    };
    count.total += 1;
    if (row.route?.state === "untriaged" && !row.taskId) count.untriaged += 1;
    if (row.firstSeenAt && !(count.lastAt >= row.firstSeenAt))
      count.lastAt = row.firstSeenAt;
    counts.set(row.source, count);
  }
  return counts;
}

// GitHub's read of each repository (untriaged.mjs), for Settings.
export function githubReads(store) {
  let rows = [];
  try {
    rows = store.list("intake_sources");
  } catch {
    // An older read-only database has no table yet.
  }
  return rows
    .filter((row) => row.source === "github" && row.repository)
    .map((row) => ({
      repository: row.repository,
      checkedAt: row.checkedAt ?? null,
      error: row.error ?? null,
    }));
}

// The `intake` block's shape, for the tick's policy check.
export function validateIntake(value, where = "intake") {
  if (value === undefined) return { sources: {} };
  if (!record(value)) fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (key !== "sources") fail(`${where}.${key} is not an intake setting.`);
  const sources = value.sources ?? {};
  if (!record(sources)) fail(`${where}.sources must be an object.`);
  return {
    sources: Object.fromEntries(
      Object.entries(sources).map(([id, entry]) => [
        id,
        validateSource(id, entry, `${where}.sources.${id}`),
      ]),
    ),
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw Error(`${path.basename(file)} is invalid: ${error.message}`);
  }
}

// Every declared source with where it came from and, when it cannot be
// used, why. `store` resolves the repository; without one it is not checked.
export function declaredSources({ workspaceRoot, settingsFile }, store = null) {
  const found = [];
  const add = (block, scope) => {
    if (block === undefined) return;
    const sources =
      record(block) && record(block.sources) ? block.sources : null;
    if (!sources) {
      found.push({
        id: null,
        scope,
        entry: block,
        error: "intake.sources must be an object.",
      });
      return;
    }
    for (const [id, entry] of Object.entries(sources)) {
      let source = null,
        error = null;
      try {
        source = validateSource(id, entry);
      } catch (refused) {
        error = refused.message;
      }
      found.push({ id, scope, entry, source, error });
    }
  };
  try {
    if (workspaceRoot)
      add(
        readJson(path.join(workspaceRoot, ".avoozl.json")).intake,
        "repository",
      );
  } catch (error) {
    found.push({
      id: null,
      scope: "repository",
      entry: null,
      error: error.message,
    });
  }
  if (settingsFile) add(readPluginSettings(settingsFile).intake, "machine");
  const counts = new Map();
  for (const row of found)
    if (row.id) counts.set(row.id, (counts.get(row.id) || 0) + 1);
  let plugins = null;
  const pluginIds = () =>
    (plugins ??= new Set(
      declaredPlugins({ workspaceRoot, settingsFile })
        .filter((p) => !p.error)
        .map((p) => p.entry.id),
    ));
  const repositories = store ? workspaceRepositories(store) : null;
  for (const row of found) {
    if (row.error || !row.source) continue;
    if (counts.get(row.id) > 1)
      row.error = `Intake source ${row.id} is declared more than once across .avoozl.json and this machine's settings.`;
    else if (row.source.plugin && !pluginIds().has(row.source.plugin))
      row.error = `Intake source ${row.id} names plugin ${row.source.plugin}, which no plugins entry declares.`;
    else if (repositories) {
      const repository = repositories.find(
        (entry) =>
          entry.id === row.source.repository ||
          (entry.github &&
            lower(entry.github) === lower(row.source.repository)),
      );
      if (!repository)
        row.error = `Intake source ${row.id} names repository ${row.source.repository}, which is not registered.`;
      else
        row.source = {
          ...row.source,
          project: repository.localCheckout ? repository.id : null,
          github: repository.github || null,
        };
    }
  }
  return found;
}

// Usable sources by id.
export function sourceMap(options, store) {
  return new Map(
    declaredSources(options, store)
      .filter((row) => !row.error && row.source)
      .map((row) => [row.id, row.source]),
  );
}

// Settings: add or remove a source in this machine's settings or in
// `.avoozl.json`. A repository save needs `confirmPublic`, because a source's
// id and plugin may be private names (R50.6).
export function editSource(
  options,
  {
    scope = "machine",
    id,
    entry = null,
    remove = false,
    confirmPublic = false,
  },
) {
  if (!["machine", "repository"].includes(scope))
    fail('Choose scope "machine" or "repository".');
  if (!remove) validateSource(id, entry);
  else if (typeof id !== "string" || !id) fail("Name the source to remove.");
  if (scope === "repository" && !remove && !confirmPublic) {
    const error = Error(
      "Avoozl cannot tell whether this repository is private. Its .avoozl.json may publish this source's id and plugin. Declare it on this machine instead, or confirm.",
    );
    error.status = 409;
    error.code = "intake-public-repository";
    throw error;
  }
  const existing = declaredSources(options).filter((row) => row.id === id);
  if (!remove && existing.length)
    fail(`Intake source ${id} is already declared.`, 409);
  if (remove && !existing.some((row) => row.scope === scope))
    fail(`Intake source ${id} is not declared there.`, 404);
  const edit = (value) => {
    const intake = record(value.intake) ? value.intake : {},
      sources = { ...(record(intake.sources) ? intake.sources : {}) };
    if (remove) delete sources[id];
    else sources[id] = entry;
    if (Object.keys(sources).length) value.intake = { ...intake, sources };
    else delete value.intake;
    return value;
  };
  const file =
    scope === "machine"
      ? options.settingsFile
      : path.join(options.workspaceRoot, ".avoozl.json");
  const before =
      scope === "machine" ? readJson(file) : { version: 1, ...readJson(file) },
    after = edit(before);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(after, null, 2) + "\n", {
    mode: scope === "machine" ? 0o600 : 0o644,
  });
  fs.renameSync(temporary, file);
  return declaredSources(options);
}

// ---------------------------------------------------------------------------
// Rows. `incoming_items` holds one row per source and id; `intake_sources`
// one per source (a GitHub repository's Untriaged read is `github:<repo>`).
// A row is written only when it changed, so a quiet tick writes nothing.

const hashOf = (value) => digest(canonical(value));

function putIfChanged(store, table, row) {
  const current = store.get(table, row.id);
  if (current && canonical(current) === canonical(row)) return false;
  store.transaction(() => store.put(table, row));
  return true;
}

export function sourceRow(store, id) {
  try {
    return store.get("intake_sources", id);
  } catch {
    return null;
  }
}

export function saveSourceRow(store, row) {
  return putIfChanged(store, "intake_sources", row);
}

export function itemRows(store) {
  try {
    return store.list("incoming_items");
  } catch {
    // An older read-only database has no table yet.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Matching.

// The labels and assignees rules see: the item's own, plus `<field>:<value>`
// labels from `labelFields` and an assignee from `assigneeField` (R50.11).
export function matchView(item, source) {
  const labels = [...item.labels],
    assignees = [...item.assignees];
  for (const field of source?.labelFields || []) {
    const value = item.fields?.[field];
    if (value !== undefined && value !== null && value !== "")
      labels.push(`${field}:${value}`);
  }
  const owner = source?.assigneeField
    ? item.fields?.[source.assigneeField]
    : null;
  if (typeof owner === "string" && owner && !assignees.includes(owner))
    assignees.push(owner);
  return { labels, assignees };
}

// Each rule for this source that holds on the item, with whether it counts.
export function judgeItem(
  item,
  source,
  repository,
  { mcp = false, actorCapable = false } = {},
) {
  const view = matchView(item, source),
    rules = (repository?.sourceRules || []).filter(
      (rule) => rule.source === source.id,
    ),
    matches = matchingRules(
      { ...repository, rules },
      {
        labels: view.labels.map((name) => ({ name })),
        assignees: view.assignees.map((login) => ({ login })),
        user: item.author ? { login: item.author } : null,
      },
      [],
    );
  return matches.map((match) => {
    const base = {
      rule: match.rule,
      action: match.action,
      eventId: item.trigger?.eventId || "",
      actor: item.trigger?.actor || "",
      at: item.trigger?.at || "",
      permission: item.trigger?.permission || null,
    };
    // A review is someone else's code: it never becomes a delivery (R50.19).
    if (item.kind === "review" && STARTING.has(match.action))
      return {
        ...base,
        allowed: false,
        reason: "A review item never starts delivery or planning.",
      };
    if (mcp)
      return STOPPING.has(match.action)
        ? { ...base, allowed: true, reason: "" }
        : {
            ...base,
            allowed: false,
            reason:
              "An MCP caller's item meets only pause and quarantine rules; a person starts work with Plan this or Deliver this.",
          };
    if (!actorCapable)
      return {
        ...base,
        allowed: false,
        reason: `Plugin ${source.plugin} cannot say who acted (no actor capability).`,
      };
    return { ...base, ...actorAllowed(source, base.actor, base.permission) };
  });
}

// ---------------------------------------------------------------------------
// Tasks.

function ensureInbox(data) {
  if (!data.tracks.some((track) => track.id === "catalog"))
    data.tracks.push({ id: "catalog", label: "General" });
}

// A pack's waitingLabels and priorityLabels (R55, owner request): a waiting
// label holds the task with "Waiting on the author"; the priority list sets
// its order inside Ready and Up next, never its lane. Absent: no change.
export function labelEffects(repository, labels) {
  const have = new Set((labels || []).map(lower)),
    waiting = (repository?.waitingLabels || []).some((label) =>
      have.has(lower(label)),
    ),
    priority = repository?.priority || [];
  return {
    waiting,
    labelRank: priority.length ? priorityRank(priority, labels) : null,
  };
}

function setLabelEffects(task, repository, labels) {
  const { waiting, labelRank } = labelEffects(repository, labels);
  if (labelRank === null) delete task.labelRank;
  else task.labelRank = labelRank;
  return waiting;
}

function leafFor(row, source, how) {
  const item = row.record,
    now = new Date().toISOString();
  return {
    id: intakeTaskId(item.source, item.id),
    title: item.title,
    summary: item.body || item.title,
    acceptance: [`The request in ${item.link} is done.`],
    checks: [],
    status: "planned",
    scope: "runtime",
    kind: "leaf",
    authority: "local",
    repository: source.project,
    track: "catalog",
    tags: ["intake", `source:${item.source}`],
    // Pinned to this snapshot of the item (R50.15, R12).
    approvedSource: { hash: digest(item.body || ""), text: item.body || "" },
    needsReview: false,
    createdAt: now,
    updatedAt: now,
    intake: intakeLink(row, how),
  };
}

function intakeLink(row, how) {
  const item = row.record;
  return {
    source: item.source,
    id: item.id,
    link: item.link,
    kind: item.kind,
    labels: item.labels,
    snapshotHash: digest(item.body || ""),
    snapshotTitle: item.title,
    rule: how.rule ?? null,
    actor: how.actor ?? null,
    eventId: how.eventId ?? null,
    by: how.by ?? "rule",
  };
}

function setDispatch(task, ready, state, reason) {
  task.dispatch = { ...(task.dispatch || {}), ready, state, reason };
}

// A leaf for the item, or an inbox task for the planner (task.capture).
function startTask(store, row, source, action, how) {
  const taskId = intakeTaskId(row.source, row.itemId);
  let created = null;
  store.mutate(`Take in ${row.source} ${row.itemId}`, (data) => {
    ensureInbox(data);
    const existing = data.tasks.find((task) => task.id === taskId);
    if (existing) {
      created = existing.id;
      return;
    }
    if (action === "plan") {
      const item = row.record,
        { task } = captureTask(data, {
          prompt: `${item.title}\n\n${item.link}\n\n${item.body || ""}`
            .trim()
            .slice(0, 20000),
          submissionId: taskId,
          distinctReason: `Intake item ${item.source} ${item.id}`,
        });
      // Its own id, so the item ties to it however it was captured.
      task.id = taskId;
      task.intake = intakeLink(row, how);
      created = task.id;
      return;
    }
    const task = leafFor(row, source, how),
      waiting = setLabelEffects(
        task,
        source.policy,
        matchView(row.record, source).labels,
      );
    if (waiting) setDispatch(task, false, "waiting", WAITING_REASON);
    else setDispatch(task, true, "authorized", how.reason || "");
    data.tasks.push(task);
    created = task.id;
  });
  return created;
}

function patchTask(store, taskId, summary, fn) {
  const current = store.read().tasks.find((task) => task.id === taskId);
  if (!current) return false;
  const next = structuredClone(current);
  fn(next);
  if (canonical(next) === canonical(current)) return false;
  store.mutate(summary, (data) => {
    data.tasks[data.tasks.findIndex((task) => task.id === taskId)] = next;
  });
  return true;
}

// A close at the source, judged by the allowed-close rule (R33.8-33.10): an
// allowed actor's close is an order that releases dependents and never
// counts as verified; anyone else, an unknown actor or an MCP caller holds
// the dependents with a decision. Avoozl never reopens the item.
function judgeClose(task, item, source, { mcp, actorCapable }, notify) {
  const key = `${item.closedBy ?? ""}@${item.closedAt ?? ""}`;
  if (item.state === "open") {
    if (task.intakeVerdict?.state === "order") delete task.intakeVerdict;
    if (task.intakeHold) {
      if (task.decision === task.intakeHold.decision) delete task.decision;
      delete task.intakeHold;
    }
    return;
  }
  if (task.intakeVerdict?.state === "order" || task.intakeHold?.key === key)
    return;
  const standing =
      item.trigger?.actor === item.closedBy ? item.trigger?.permission : null,
    check =
      mcp || !actorCapable || !item.closedBy
        ? { allowed: false }
        : actorAllowed(source, item.closedBy, standing);
  if (check.allowed) {
    task.intakeVerdict = {
      state: "order",
      order: {
        actor: item.closedBy,
        reason:
          item.closeReason === "not_planned" ? "not planned" : "completed",
        closedAt: item.closedAt || new Date().toISOString(),
      },
      issue: item.link,
      at: new Date().toISOString(),
    };
    delete task.intakeHold;
    return;
  }
  const who = mcp
      ? "an MCP caller"
      : item.closedBy && actorCapable
        ? item.closedBy
        : "someone the source cannot name",
    text = `${task.id}'s item ${item.link} was closed in source ${item.source} by ${who}, whom the source's settings do not allow. Its dependents wait. Avoozl did not reopen it.`;
  task.decision = text;
  task.intakeHold = { key, actor: item.closedBy ?? null, decision: text };
  notify.push({
    channel: "decision",
    task: task.id,
    title: `${task.id}'s item was closed in ${item.source} by someone not allowed`,
    text,
  });
}

// ---------------------------------------------------------------------------
// The pipeline.

function remember(row, entry) {
  row.history = [...(row.history || []), entry].slice(-HISTORY);
}

function screenText(item) {
  return [
    item.title,
    item.body,
    item.labels.join(" "),
    ...Object.entries(item.fields || {}).map(([k, v]) => `${k}: ${v}`),
  ]
    .filter(Boolean)
    .join("\n");
}

// One checked item through dedup, content rules, matching and action.
// `context`: {mcp, actorCapable, now}. Returns {result, route, taskId,
// notify}.
export function takeItem(store, source, item, context = {}) {
  const now = context.now ?? new Date().toISOString(),
    key = itemKey(source.id, item.id),
    stored = store.get("incoming_items", key),
    record = { source: source.id, ...item },
    // An MCP caller's author and trigger are its claims, never an actor.
    claims = context.mcp
      ? { author: item.author, trigger: item.trigger }
      : null;
  if (context.mcp) {
    record.trigger = null;
  }
  const hash = hashOf(record),
    notify = [];
  if (stored?.hash === hash)
    return {
      id: item.id,
      result: "unchanged",
      route: stored.route,
      taskId: stored.taskId ?? null,
      notify,
    };
  if (stored && String(item.updatedAt) < String(stored.record.updatedAt))
    return {
      id: item.id,
      result: "stale",
      reason: `updatedAt ${item.updatedAt} is older than the stored ${stored.record.updatedAt}.`,
      route: stored.route,
      taskId: stored.taskId ?? null,
      notify,
    };
  const row = {
    id: key,
    source: source.id,
    itemId: item.id,
    record,
    hash,
    via: context.mcp ? "mcp" : source.via,
    ...(claims ? { claims } : {}),
    firstSeenAt: stored?.firstSeenAt ?? now,
    seenAt: now,
    taskId: stored?.taskId ?? null,
    route: stored?.route ?? null,
    findings: stored?.findings ?? [],
    history: stored?.history ?? [],
  };
  const repository = source.policy;
  // Content rules at intake (R50.10), off unless a set names the boundary.
  const screened = enforce(
    store,
    {
      boundary: "intake",
      repository: source.github || source.repository,
      target: `intake:${source.id}/${item.id}`,
      text: screenText(record),
    },
    {
      mode: "decide",
      source: { kind: "intake", source: source.id, id: item.id },
    },
  );
  notify.push(...screened.notify);
  let route;
  if (!screened.ok) {
    const named = [
      ...screened.findings.map(findingText),
      ...screened.unavailable.map((u) => `${u.set} is unavailable`),
    ];
    row.findings = screened.findings.map(({ set, rule }) => ({ set, rule }));
    route = {
      state: "quarantined",
      rule: null,
      action: "quarantine",
      reason: `Content rules held this item: ${named.join("; ")}.`,
    };
  } else {
    row.findings = [];
    const matches = judgeItem(record, source, repository, context),
      allowed = matches.filter((match) => match.allowed),
      primary = PRECEDENCE.map((action) =>
        allowed.find((match) => match.action === action),
      ).find(Boolean),
      refused = matches.find((match) => !match.allowed);
    route = primary
      ? {
          state:
            primary.action === "pause"
              ? "paused"
              : primary.action === "quarantine"
                ? "quarantined"
                : primary.action === "plan"
                  ? "planned"
                  : "delivered",
          rule: primary.rule,
          action: primary.action,
          actor: primary.actor || null,
          eventId: primary.eventId || null,
          reason: `Rule ${primary.rule} ${primary.action}s this item.`,
        }
      : {
          state: "untriaged",
          rule: refused?.rule ?? null,
          action: null,
          reason: refused?.reason ?? "",
        };
  }
  if (record.state === "closed")
    route = {
      ...route,
      closedAt: record.closedAt || stored?.route?.closedAt || now,
    };
  // A person's Deliver this or Plan this keeps the item tied.
  if (
    row.taskId &&
    stored?.route?.by === "person" &&
    route.state === "untriaged"
  )
    route = { ...stored.route, reason: stored.route.reason };
  let taskId = row.taskId;
  const startable =
    ["delivered", "planned"].includes(route.state) && record.state === "open";
  if (!taskId && startable) {
    taskId = startTask(store, row, source, route.action, {
      rule: route.rule,
      actor: route.actor,
      eventId: route.eventId,
      reason: route.reason,
    });
  } else if (taskId) {
    patchTask(store, taskId, `Update ${taskId} from ${source.id}`, (task) => {
      const view = matchView(record, source);
      if (task.intake) task.intake.labels = record.labels;
      const waiting = setLabelEffects(task, repository, view.labels);
      const snapshot = task.intake?.snapshotHash,
        bodyHash = digest(record.body || ""),
        // The title is frozen with the body; a task from before this takes
        // the title last stored for the item as its snapshot.
        snapshotTitle = task.intake
          ? (task.intake.snapshotTitle ?? stored?.record?.title ?? record.title)
          : record.title,
        retriggered =
          route.eventId &&
          task.intake?.eventId &&
          route.eventId !== task.intake.eventId;
      if (!task.intake || retriggered || snapshotTitle === record.title)
        task.title = record.title;
      if (["paused", "quarantined"].includes(route.state))
        setDispatch(task, false, route.state, route.reason);
      else if (route.state === "untriaged" && task.intake?.by !== "person")
        setDispatch(
          task,
          false,
          "withdrawn",
          route.reason ||
            "No rule matches this item for an allowed actor any more.",
        );
      else if (!retriggered && snapshotTitle !== record.title)
        setDispatch(
          task,
          false,
          "quarantined",
          "The item's title changed after its trigger snapshot. An allowed actor re-triggers it, or a person confirms the new text (intake.confirm).",
        );
      else if (snapshot && snapshot !== bodyHash && !retriggered)
        setDispatch(
          task,
          false,
          "quarantined",
          "The item's body changed after its trigger snapshot. An allowed actor re-triggers it, or a person confirms the new text (intake.confirm).",
        );
      else if (waiting) setDispatch(task, false, "waiting", WAITING_REASON);
      else {
        if (retriggered) {
          task.intake.snapshotHash = bodyHash;
          task.intake.snapshotTitle = record.title;
          task.intake.eventId = route.eventId;
          task.approvedSource = { hash: bodyHash, text: record.body || "" };
        }
        setDispatch(task, true, "authorized", route.reason);
      }
      judgeClose(task, record, source, context, notify);
    });
  }
  row.taskId = taskId ?? null;
  row.route = { ...route, at: now };
  const result = stored ? "updated" : "created";
  remember(row, { at: now, result, state: route.state });
  store.transaction(() => store.put("incoming_items", row));
  return { id: item.id, result, route: row.route, taskId: row.taskId, notify };
}

// The repository policy rules apply from: the GitHub policy entry for the
// source's repository, by its GitHub name or id.
export function withPolicy(source, githubPolicy) {
  const repositories = githubPolicy?.repositories || {},
    name = Object.keys(repositories).find(
      (key) => lower(key) === lower(source.github || source.repository),
    );
  return { ...source, policy: name ? repositories[name] : null };
}

// intake.submit (R50.8): 1-100 items to a source whose `via` is `mcp`.
export function submitItems(store, sources, githubPolicy, input = {}) {
  const id = input.source;
  if (typeof id !== "string" || !id)
    fail("Name the source the items come from.");
  if (RESERVED_SOURCES.includes(id))
    fail(
      `Source ${id} is built in; only an mcp source takes items this way.`,
      403,
    );
  const source = sources.get(id);
  if (!source)
    fail(
      `Source ${id} is not declared, or cannot be used. Declare it with via mcp first.`,
      404,
    );
  if (source.via !== "mcp")
    fail(
      `Source ${id} is read through plugin ${source.plugin}; only an mcp source takes items this way.`,
      403,
    );
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > SUBMIT_LIMIT
  )
    fail(`Send 1-${SUBMIT_LIMIT} items.`);
  const bound = withPolicy(source, githubPolicy),
    results = [],
    notify = [];
  input.items.forEach((raw, index) => {
    let item;
    try {
      item = incomingItem(raw, `item ${index}`);
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      results.push({
        index,
        id: typeof raw?.id === "string" ? raw.id.slice(0, 200) : null,
        result: "refused",
        reason: error.message,
      });
      return;
    }
    const taken = takeItem(store, bound, item, { mcp: true });
    notify.push(...taken.notify);
    const { notify: _, ...result } = taken;
    results.push({ index, ...result });
  });
  return { source: id, results, notify };
}

// The tick's poll of each plugin source (R50.7): at most once per source per
// tick, the cursor stored only after every item is handled.
export async function pollSources(
  store,
  session,
  sources,
  githubPolicy,
  { now = new Date().toISOString() } = {},
) {
  const notify = [],
    report = [];
  for (const source of sources.values()) {
    if (!source.plugin) continue;
    const id = `source:${source.id}`,
      before = sourceRow(store, id) ?? {
        id,
        source: source.id,
        cursor: null,
        readAt: null,
        more: false,
        error: null,
        refused: [],
      };
    const fail = (error) => {
      saveSourceRow(store, { ...before, error, failedAt: now });
      report.push({ source: source.id, error });
    };
    const status = await session.use(source.plugin, "tracker");
    if (!status.ok) {
      fail(`Plugin ${source.plugin} is unavailable: ${status.reason}`);
      continue;
    }
    const capabilities =
      session.describe(source.plugin, "tracker")?.capabilities || [];
    if (!capabilities.includes("poll")) {
      fail(`Plugin ${source.plugin} does not declare the poll capability.`);
      continue;
    }
    let reply;
    try {
      reply = await session.call(source.plugin, "tracker", "poll", {
        cursor: before.cursor,
        limit: POLL_LIMIT,
      });
    } catch (error) {
      fail(
        error instanceof PluginUnavailable
          ? error.message
          : `Plugin ${source.plugin} poll failed: ${error.message}`,
      );
      continue;
    }
    const bound = withPolicy(source, githubPolicy),
      actorCapable = capabilities.includes("actor"),
      counts = {};
    for (const item of reply.items) {
      const taken = takeItem(store, bound, item, { actorCapable, now });
      notify.push(...taken.notify);
      counts[taken.result] = (counts[taken.result] || 0) + 1;
    }
    const changed =
      reply.items.length > 0 || reply.cursor !== before.cursor || before.error;
    saveSourceRow(store, {
      ...before,
      cursor: reply.cursor ?? before.cursor,
      more: reply.more,
      error: null,
      failedAt: null,
      readAt: changed ? now : before.readAt,
      refused: reply.refused,
    });
    report.push({
      source: source.id,
      items: reply.items.length,
      refused: reply.refused.length,
      ...counts,
    });
  }
  return { notify, report };
}

// A closed item tied to no task is deleted 30 days after it closed; an item
// tied to a task stays while the task does (R50.21).
export function purgeClosed(store, now = Date.now()) {
  const tasks = new Set(store.read().tasks.map((task) => task.id)),
    gone = itemRows(store).filter(
      (row) =>
        row.record?.state === "closed" &&
        row.record.kind !== "idea" &&
        !(row.taskId && tasks.has(row.taskId)) &&
        now -
          Date.parse(row.route?.closedAt || row.record.closedAt || row.seenAt) >
          KEEP_CLOSED_MS,
    );
  if (gone.length)
    store.transaction(() => {
      for (const row of gone) store.remove("incoming_items", row.id);
    });
  return gone.length;
}

// ---------------------------------------------------------------------------
// Reads.

function summary(row) {
  const item = row.record;
  return {
    source: row.source,
    id: row.itemId,
    link: item.link,
    kind: item.kind,
    title: item.title,
    labels: item.labels,
    author: item.author ?? row.claims?.author ?? null,
    assignees: item.assignees,
    state: item.state,
    updatedAt: item.updatedAt,
    firstSeenAt: row.firstSeenAt,
    via: row.via ?? null,
    route: row.route,
    taskId: row.taskId ?? null,
    ...(item.kind === "idea"
      ? {
          notes: item.notes?.length ?? 0,
          links: item.links?.length ?? 0,
          graduated: item.graduated ?? null,
        }
      : {}),
  };
}

const KINDS = ["issue", "pr", "review", "ticket", "idea"];
// Ideas (ideas.mjs) are open, archived or graduated; never closed.
const STATES = ["open", "closed", "archived", "graduated"];

// intake.list: filters source, kind, state, untriaged; 100 per page.
export function listItems(store, input = {}) {
  if (input.kind !== undefined && !KINDS.includes(input.kind))
    fail(`kind must be one of ${KINDS.join(", ")}.`);
  if (input.state !== undefined && !STATES.includes(input.state))
    fail(`state must be one of ${STATES.join(", ")}.`);
  const offset =
      Number.isSafeInteger(input.offset) && input.offset >= 0
        ? input.offset
        : 0,
    rows = itemRows(store)
      .filter((row) => row.record)
      .filter((row) => !input.source || row.source === input.source)
      .filter((row) => !input.kind || row.record.kind === input.kind)
      .filter((row) => !input.state || row.record.state === input.state)
      .filter(
        (row) =>
          input.untriaged === undefined ||
          (row.route?.state === "untriaged" && !row.taskId) ===
            (input.untriaged === true),
      )
      .sort((a, b) =>
        String(b.record.updatedAt).localeCompare(String(a.record.updatedAt)),
      );
  return {
    total: rows.length,
    offset,
    items: rows.slice(offset, offset + 100).map(summary),
    next: offset + 100 < rows.length ? offset + 100 : null,
  };
}

// intake.view: one item with its route, findings and history.
export function viewItem(store, input = {}) {
  if (typeof input.source !== "string" || typeof input.id !== "string")
    fail("Name the item's source and id.");
  const row = store.get("incoming_items", itemKey(input.source, input.id));
  if (!row?.record)
    fail(`No item ${input.id} from source ${input.source}.`, 404);
  return {
    ...summary(row),
    body: row.record.body,
    fields: row.record.fields,
    trigger: row.record.trigger ?? null,
    claims: row.claims ?? null,
    findings: row.findings ?? [],
    history: row.history ?? [],
    snapshotHash: snapshotDigest(row.record),
    ...(row.record.kind === "idea"
      ? { notes: row.record.notes, links: row.record.links }
      : {}),
  };
}

// The text a person confirms: the item's title and body as they read them.
export const snapshotDigest = (item) =>
  digest(`${item.title}\n\n${item.body || ""}`);

// intake.confirm (R50.17): a person confirms the changed title and body of
// an item whose task is held for it, naming the snapshotHash intake.view
// showed. The task's snapshot moves to that text and it may run again. The
// caller refuses a session or MCP with 403.
export function confirmSnapshot(store, { source, id, hash } = {}) {
  if (typeof source !== "string" || typeof id !== "string")
    fail("Name the item's source and id.");
  const row = store.get("incoming_items", itemKey(source, id));
  if (!row?.record) fail(`No item ${id} from source ${source}.`, 404);
  const task =
    row.taskId && store.read().tasks.find((entry) => entry.id === row.taskId);
  if (!task?.intake || task.dispatch?.state !== "quarantined")
    fail(`${id}'s task is not held for changed text.`, 409);
  if (hash !== snapshotDigest(row.record))
    fail(
      `${id} changed since you read it. Read it again with intake.view, then confirm.`,
      409,
    );
  const item = row.record,
    at = new Date().toISOString();
  patchTask(
    store,
    task.id,
    `Confirm the new text of ${source} ${id}`,
    (next) => {
      next.title = item.title;
      next.intake.snapshotHash = digest(item.body || "");
      next.intake.snapshotTitle = item.title;
      next.intake.confirmedHash = hash;
      next.intake.confirmedAt = at;
      next.approvedSource = {
        hash: next.intake.snapshotHash,
        text: item.body || "",
      };
      setDispatch(next, true, "authorized", "A person confirmed the new text.");
    },
  );
  return { source, id, taskId: task.id, confirmedAt: at };
}

// Plan this and Deliver this (R50.15): a person's start for a non-GitHub
// item. The caller refuses a session or MCP with 403.
export function startByPerson(
  store,
  sources,
  githubPolicy,
  { source: id, id: itemId, action } = {},
) {
  if (!["deliver", "plan"].includes(action)) fail("Choose deliver or plan.");
  if (id === "github")
    fail(
      "A GitHub item starts through its trigger labels or Issue Radar.",
      409,
    );
  if (id === "local")
    fail("An idea never runs work. Use Make it a spec instead.", 409);
  const source = sources.get(id);
  if (!source) fail(`Source ${id} is not declared, or cannot be used.`, 404);
  const row = store.get("incoming_items", itemKey(id, itemId));
  if (!row?.record) fail(`No item ${itemId} from source ${id}.`, 404);
  if (row.record.kind === "review")
    fail("A review item goes to Code review, never to delivery.", 409);
  if (row.record.state !== "open")
    fail(`${itemId} is closed at its source.`, 409);
  if (row.taskId && store.read().tasks.some((task) => task.id === row.taskId))
    fail(`${itemId} is already tied to task ${row.taskId}.`, 409);
  const bound = withPolicy(source, githubPolicy);
  if (action === "deliver" && !bound.project)
    fail(
      `Repository ${source.repository} has no local checkout, so Avoozl cannot code it.`,
      409,
    );
  const reason = `${action === "deliver" ? "Delivered" : "Sent to planning"} by a person from the Intake tab.`,
    taskId = startTask(store, row, bound, action, { by: "person", reason });
  const next = {
    ...row,
    taskId,
    route: {
      state: action === "deliver" ? "delivered" : "planned",
      rule: null,
      action,
      by: "person",
      reason,
      at: new Date().toISOString(),
    },
  };
  remember(next, {
    at: next.route.at,
    result: action,
    state: next.route.state,
  });
  store.transaction(() => store.put("incoming_items", next));
  return { source: id, id: itemId, taskId, route: next.route };
}

// A repository skill change a person approved from a retrospective (R68.10):
// an incoming item with source `retro` whose snapshot is the diff, then one
// leaf through the same path as Deliver this. Returns the task ID.
export function deliverRetroSkill(
  store,
  githubPolicy,
  { retro, proposal, repository, file, diff, summary },
) {
  const project = store.get("projects", repository);
  if (!project?.root)
    fail(
      `Repository ${repository} has no local checkout, so Avoozl cannot code it.`,
      409,
    );
  const now = new Date().toISOString(),
    item = {
      source: "retro",
      id: `${retro}-${proposal}`,
      title: `Apply a retro skill change to ${file}`.slice(0, 200),
      body: [
        String(summary || "").slice(0, 1000),
        `Apply this unified diff to ${file}, and change nothing else:`,
        "```diff",
        diff,
        "```",
      ].join("\n\n"),
      link: `avoozl:retro/${retro}/${proposal}`,
      kind: "task",
      labels: [],
      author: null,
      assignees: [],
      state: "open",
      closeReason: null,
      closedBy: null,
      closedAt: null,
      updatedAt: now,
      trigger: null,
    },
    key = itemKey("retro", item.id);
  if (store.get("incoming_items", key)?.taskId)
    fail(
      `This change already has task ${store.get("incoming_items", key).taskId}.`,
      409,
    );
  const row = {
    id: key,
    source: "retro",
    itemId: item.id,
    record: item,
    hash: hashOf(item),
    via: "retro",
    firstSeenAt: now,
    seenAt: now,
    taskId: null,
    route: null,
    findings: [],
    history: [],
  };
  store.transaction(() => store.put("incoming_items", row));
  const bound = withPolicy(
      {
        id: "retro",
        repository,
        project: project.id,
        github: project.github || null,
      },
      githubPolicy,
    ),
    reason = "A person approved this skill change from a retrospective.",
    taskId = startTask(store, row, bound, "deliver", { by: "person", reason });
  const next = {
    ...row,
    taskId,
    route: {
      state: "delivered",
      rule: null,
      action: "deliver",
      by: "person",
      reason,
      at: now,
    },
  };
  remember(next, { at: now, result: "deliver", state: "delivered" });
  store.transaction(() => store.put("incoming_items", next));
  return taskId;
}

// ---------------------------------------------------------------------------
// GitHub on the record (R50.4).

// The item a GitHub issue intake read (github-sync.mjs) is, written only
// when it changed, inside the caller's transaction. Returns the item key
// the `github_issues` row points at.
export function mirrorGitHubIssue(store, repository, issue, issueRecord) {
  const id = `${repository}#${issue.number}`,
    key = itemKey("github", id),
    stored = store.get("incoming_items", key),
    item = {
      source: "github",
      id,
      link: issue.html_url,
      kind: "issue",
      title: String(issue.title ?? ""),
      body: String(issue.body ?? ""),
      labels: (issue.labels || [])
        .map((label) => (typeof label === "string" ? label : label?.name))
        .filter(Boolean),
      author: issue.user?.login ?? null,
      assignees: (issue.assignees || []).map((entry) => entry.login),
      state: issue.state === "closed" ? "closed" : "open",
      updatedAt: issue.updated_at ?? stored?.record?.updatedAt ?? "",
      fields: {},
      trigger: issueRecord.labelEventId
        ? {
            actor: issueRecord.labelActor || null,
            permission: issueRecord.permission || null,
            eventId: issueRecord.labelEventId,
            at: issueRecord.labelAt || null,
          }
        : null,
    };
  const row = {
    ...(stored || {
      id: key,
      source: "github",
      itemId: id,
      firstSeenAt: new Date().toISOString(),
      findings: [],
      history: [],
    }),
    record: item,
    hash: hashOf(item),
    synced: true,
    taskId: issueRecord.taskId ?? null,
    route: {
      state: issueRecord.state,
      rule: issueRecord.rule ?? null,
      action: issueRecord.action ?? null,
      reason: issueRecord.reason ?? "",
    },
  };
  // The caller's transaction holds this write with its github_issues row.
  if (
    !stored ||
    canonical({ ...stored, seenAt: null }) !==
      canonical({ ...row, seenAt: null })
  )
    store.put("incoming_items", { ...row, seenAt: new Date().toISOString() });
  return key;
}

// The Intake tab (§8.5, R50.16): GitHub's Untriaged list (`untriaged.view`,
// unchanged), plus the untriaged items of every other declared source, with
// the source on each row. It shows in Local only mode too when a non-GitHub
// source is declared, with only those sources.
export function intakeTab(view, store, declared) {
  const usable = declared.filter((row) => !row.error && row.source),
    bySource = new Map(usable.map((row) => [row.id, row.source])),
    tasks = new Set(store.read().tasks.map((task) => task.id)),
    others = itemRows(store)
      .filter(
        (row) =>
          row.source !== "github" &&
          bySource.has(row.source) &&
          row.record?.state === "open" &&
          row.route?.state === "untriaged" &&
          !(row.taskId && tasks.has(row.taskId)),
      )
      .map((row) => {
        const item = row.record,
          name = `${row.source} ${item.id}`;
        return {
          source: row.source,
          id: item.id,
          kind: item.kind,
          number: null,
          title: item.title,
          url: item.link,
          repository: bySource.get(row.source).repository,
          author: item.author ?? row.claims?.author ?? null,
          createdAt: row.firstSeenAt,
          labels: item.labels,
          assignees: item.assignees,
          comments: 0,
          via: row.via ?? null,
          reason: row.route?.reason || null,
          links: {
            github: null,
            item: item.link,
            issueRadar: null,
            // A review goes to Code Review Sage's page until MC-15.
            review:
              item.kind === "review"
                ? {
                    url: CODE_REVIEW_SAGE_PATH,
                    exact: false,
                    tooltip: `Code Review Sage can't open one item from a link yet, so this opens its page. Review ${name} there.`,
                  }
                : null,
          },
          // A person's Plan this and Deliver this (R50.15).
          start: {
            plan: item.kind !== "review",
            deliver:
              item.kind !== "review" &&
              Boolean(bySource.get(row.source).project),
          },
        };
      });
  const items = [
    ...view.items.map((item) => ({
      ...item,
      source: "github",
      id: `${item.repository}#${item.number}`,
    })),
    ...others,
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    ...view,
    enabled: view.enabled || usable.length > 0,
    total: items.length,
    items,
    // Ideas never count as untriaged (R63.6); the tab lists them apart.
    ideas: listIdeas(store),
    repositories: view.repositories.map((row) => ({
      ...row,
      source: "github",
    })),
    sources: [
      ...(view.enabled
        ? [
            {
              id: "github",
              via: "github",
              repository: null,
              error: null,
              checkedAt: null,
            },
          ]
        : []),
      ...declared
        .filter((row) => row.id)
        .map((row) => {
          const state = sourceRow(store, `source:${row.id}`);
          return {
            id: row.id,
            via: row.source?.via ?? row.entry?.via ?? null,
            repository: row.source?.repository ?? null,
            scope: row.scope,
            error: row.error ?? state?.error ?? null,
            checkedAt: state?.readAt ?? null,
            more: state?.more === true,
            refused: state?.refused?.length ?? 0,
          };
        }),
    ],
  };
}
