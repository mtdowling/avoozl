// The activity log (design §4.19, Requirement 71): one SQLite table of who
// did what, from the page, the CLI, MCP, GitHub and plugin sync.
//
// Every row goes through recordActivity. A row holds IDs and a summary
// Avoozl writes, never a prompt, a rule term, a token, file contents, or an
// issue's title or body. Before it is saved, each field is screened with the
// built-in secret and path screens and the content-rule sets that cover the
// `activity` boundary; a row that matches, or that a set cannot check, is
// saved redacted. The matched text is never stored.
//
// Local actions are recorded from Operations.execute (recordOperation). The
// tick records what changed on GitHub and in plugin sync by diffing a small
// snapshot against the one it saved last time (recordTickActivity).
import { PUBLISH_RULES, check, secretReason } from "./content-rules.mjs";

export const ACTIVITY_SOURCES = Object.freeze([
  "local",
  "github",
  "plugin",
  "mcp",
]);
export const REDACTED_SUMMARY = "Redacted by content rules";
export const DEFAULT_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 365;
export const ACTIVITY_PAGE = 100;
const SUMMARY_LIMIT = 200;
const KIND = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
const TARGET = /^[A-Za-z0-9][A-Za-z0-9._:@/#-]{0,199}$/;
const SNAPSHOT = "activity.snapshot";
const UPGRADE = "activity.upgrade";
const EMPTY = Object.freeze({ tasks: {}, board: {}, labels: {}, items: 0 });
const DAY = 86_400_000;

const text = (value, limit) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : null;

export function ensureActivityTable(store) {
  store.db.exec(
    `CREATE TABLE IF NOT EXISTS activity_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,source TEXT NOT NULL,actor TEXT,kind TEXT NOT NULL,summary TEXT NOT NULL,target_id TEXT,link TEXT,redacted INTEGER NOT NULL DEFAULT 0,key TEXT UNIQUE);
     CREATE INDEX IF NOT EXISTS activity_log_at ON activity_log(at);`,
  );
}

function httpsLink(value) {
  const link = text(value, 500);
  if (!link) return null;
  try {
    return new URL(link).protocol === "https:" ? link : null;
  } catch {
    return null;
  }
}

// Why a field may not be stored, or null. Never the matched text.
function screen(store, values) {
  for (const value of values) {
    if (!value) continue;
    if (secretReason(value)) return "secret";
    if (PUBLISH_RULES.some((rule) => rule.pattern.test(value))) return "secret";
  }
  const lines = values.filter(Boolean).join("\n");
  if (!lines) return null;
  let result;
  try {
    result = check(store, {
      boundary: "activity",
      target: "activity",
      text: lines,
    });
  } catch {
    return "rules";
  }
  return result.findings.length || result.unavailable.length ? "rules" : null;
}

// The one way to add a row. Throws on an unknown source or a malformed
// kind, so a caller's test finds it; returns the stored row, or null when
// the store is read-only or the keyed row is already there.
export function recordActivity(
  store,
  { source, actor, kind, summary, targetId, link, key, at } = {},
) {
  if (!ACTIVITY_SOURCES.includes(source))
    throw Error(
      `Activity source must be one of ${ACTIVITY_SOURCES.join(", ")}.`,
    );
  if (typeof kind !== "string" || kind.length > 64 || !KIND.test(kind))
    throw Error("Activity kind must be a dotted lowercase name.");
  const said = text(summary, SUMMARY_LIMIT);
  if (!said) throw Error("Activity needs a summary.");
  if (store.readOnly) return null;
  ensureActivityTable(store);
  const row = {
    at:
      typeof at === "string" && Number.isFinite(Date.parse(at))
        ? new Date(at).toISOString()
        : new Date().toISOString(),
    source,
    actor: text(actor, 100),
    kind,
    summary: said,
    targetId:
      typeof targetId === "string" && TARGET.test(targetId) ? targetId : null,
    link: httpsLink(link),
    redacted: false,
  };
  if (screen(store, [row.actor, row.summary, row.targetId, row.link])) {
    row.actor = row.targetId = row.link = null;
    row.summary = REDACTED_SUMMARY;
    row.redacted = true;
  }
  const result = store.db
    .prepare(
      "INSERT OR IGNORE INTO activity_log(at,source,actor,kind,summary,target_id,link,redacted,key) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      row.at,
      row.source,
      row.actor,
      row.kind,
      row.summary,
      row.targetId,
      row.link,
      row.redacted ? 1 : 0,
      typeof key === "string" && key ? key.slice(0, 300) : null,
    );
  return result.changes
    ? { seq: Number(result.lastInsertRowid), ...row }
    : null;
}

// For built-in callers: a row that cannot be written never fails the action.
function quietly(store, row) {
  try {
    return recordActivity(store, row);
  } catch {
    return null;
  }
}

const rowOf = (r) => ({
  seq: r.seq,
  at: r.at,
  source: r.source,
  actor: r.actor,
  kind: r.kind,
  summary: r.summary,
  targetId: r.target_id,
  link: r.link,
  redacted: r.redacted === 1,
});

// Newest first, filtered, at most 100 a page, with the values each filter
// can take.
export function listActivity(
  store,
  { source, kind, actor, limit = ACTIVITY_PAGE, offset = 0 } = {},
) {
  const empty = { items: [], total: 0, sources: [], kinds: [], actors: [] };
  try {
    store.db.prepare("SELECT 1 FROM activity_log LIMIT 1").get();
  } catch {
    return empty;
  }
  const where = [],
    args = [];
  for (const [column, value] of [
    ["source", source],
    ["kind", kind],
    ["actor", actor],
  ])
    if (typeof value === "string" && value) {
      where.push(`${column}=?`);
      args.push(value);
    }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "",
    size = Math.max(1, Math.min(Number(limit) || ACTIVITY_PAGE, ACTIVITY_PAGE)),
    skip = Math.max(0, Number(offset) || 0),
    distinct = (column) =>
      store.db
        .prepare(
          `SELECT DISTINCT ${column} AS v FROM activity_log WHERE ${column} IS NOT NULL ORDER BY v`,
        )
        .all()
        .map((r) => r.v);
  return {
    items: store.db
      .prepare(
        `SELECT * FROM activity_log${clause} ORDER BY at DESC, seq DESC LIMIT ? OFFSET ?`,
      )
      .all(...args, size, skip)
      .map(rowOf),
    total: store.db
      .prepare(`SELECT count(*) AS n FROM activity_log${clause}`)
      .get(...args).n,
    sources: distinct("source"),
    kinds: distinct("kind"),
    actors: distinct("actor"),
  };
}

// `activity.retentionDays` from a `.avoozl.json` value, or the default.
export function activityRetention(config) {
  const days = config?.activity?.retentionDays;
  return Number.isInteger(days) && days >= 1 && days <= MAX_RETENTION_DAYS
    ? days
    : DEFAULT_RETENTION_DAYS;
}

export function validateActivitySettings(activity) {
  if (activity === undefined) return;
  if (!activity || typeof activity !== "object" || Array.isArray(activity))
    throw Error("activity must be an object.");
  for (const key of Object.keys(activity))
    if (key !== "retentionDays")
      throw Error(`activity.${key} is not a setting.`);
  const days = activity.retentionDays;
  if (
    days !== undefined &&
    !(Number.isInteger(days) && days >= 1 && days <= MAX_RETENTION_DAYS)
  )
    throw Error(
      `activity.retentionDays must be a whole number of days, 1–${MAX_RETENTION_DAYS}.`,
    );
}

// Delete rows older than the retention. Returns how many went.
export function pruneActivity(
  store,
  { days = DEFAULT_RETENTION_DAYS, now = Date.now() } = {},
) {
  if (store.readOnly) return 0;
  try {
    return Number(
      store.db
        .prepare("DELETE FROM activity_log WHERE at<?")
        .run(new Date(now - days * DAY).toISOString()).changes,
    );
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Local actions (§4.19 What is recorded). Each entry maps a successful
// operation to its kind and a summary built from IDs only; free text a
// person typed (a reason, a title) is never copied.

const idOf = (input) =>
  [input?.id, input?.taskId, input?.planId, input?.stopId].find(
    (value) => typeof value === "string" && value,
  ) ?? null;

const SETTINGS = {
  "configuration.update": "workspace configuration",
  "github.settings.update": "GitHub",
  "flow.settings.update": "Flow",
  "flow.instructions.update": "retro instructions",
  "routing.update": "routing",
  "crews.update": "crews",
  "conversations.settings.update": "conversation",
  "content.sets.update": "content rule set",
  "content.terms.update": "content rule terms",
  "activity.settings.update": "activity",
  "providers.settings.update": "provider",
};

const scopeText = (stop) =>
  !stop
    ? "the workspace"
    : stop.scope === "task"
      ? `task ${stop.taskId}`
      : stop.scope === "repo"
        ? `repository ${stop.repository}`
        : stop.scope === "spec"
          ? `spec ${stop.spec}`
          : "the workspace";

function operationRow(name, input, result) {
  const id = idOf(input);
  if (
    name === "task.start" ||
    name === "run.start" ||
    name === "session.request"
  )
    return { kind: "dispatch", summary: `Dispatched ${id}`, targetId: id };
  if (name === "flow.stop") {
    const stop = result?.stop ?? input;
    return {
      kind: "andon.pull",
      summary: `Pulled the Andon cord for ${scopeText(stop)}`,
      targetId: stop?.scope === "task" ? stop.taskId : null,
    };
  }
  if (name === "flow.resume")
    return {
      kind: "andon.resume",
      summary: `Resumed the Andon cord ${id}`,
      targetId: null,
    };
  if (name === "integration.merge")
    return { kind: "merge", summary: `Merged ${id}`, targetId: id };
  if (name === "task.merge")
    return {
      kind: "merge",
      summary: `Merged duplicates into ${id}`,
      targetId: id,
    };
  if (name === "plan.approve")
    return { kind: "approve", summary: `Approved plan ${id}`, targetId: id };
  for (const thing of ["plan", "task", "run"]) {
    if (name === `${thing}.archive`)
      return {
        kind: "archive",
        summary: `Archived ${thing} ${id}`,
        targetId: id,
      };
    if (name === `${thing}.unarchive`)
      return {
        kind: "unarchive",
        summary: `Unarchived ${thing} ${id}`,
        targetId: id,
      };
  }
  if (["plan.delete", "run.delete", "report.delete"].includes(name))
    return {
      kind: "delete",
      summary: `Deleted ${name.split(".")[0]} ${id}`,
      targetId: id,
    };
  if (name === "plugin.approve")
    return {
      kind: "plugin.approve",
      summary: `Approved plugin ${id}`,
      targetId: id,
    };
  if (name === "delivery.pickAgain")
    return {
      kind: "model.switch",
      summary: `Pick again: ${id}'s next attempt chooses its agent and model`,
      targetId: id,
    };
  // Switch model (§4.20): the queue and the undo; each chat's switch is
  // logged by provider-health.mjs when the backend applies it.
  if (name === "provider.switch") {
    const to = text(input?.to, 100);
    return {
      kind: "model.switch",
      summary: `Switch model: queued ${Number(result?.queued) || 0} running chats to ${to}${input?.alsoNewTasks === true ? ", and new tasks" : ""}`,
    };
  }
  if (name === "provider.health.clear")
    return {
      kind: "model.switch",
      summary: `Undid provider mark ${id}`,
    };
  if (name === "delivery.settings.update") {
    const model = text(input?.delivery?.model, 100);
    return model
      ? { kind: "model.switch", summary: `Writer model set to ${model}` }
      : { kind: "settings.save", summary: "Saved delivery settings" };
  }
  if (name === "task.update") {
    if (input?.status === "deferred")
      return {
        kind: "stop",
        summary: `Stopped ${id} (Deferred)`,
        targetId: id,
      };
    const model = text(input?.model, 100) ?? text(input?.agent, 100);
    if (model)
      return {
        kind: "model.switch",
        summary: `${id} set to ${model}`,
        targetId: id,
      };
    return null;
  }
  if (SETTINGS[name])
    return {
      kind: "settings.save",
      summary: `Saved ${SETTINGS[name]} settings`,
    };
  return null;
}

// One row for a successful operation from the page, the CLI or MCP.
export function recordOperation(
  store,
  name,
  input,
  result,
  { context = {}, operator = "" } = {},
) {
  const row = operationRow(name, input || {}, result);
  if (!row) return null;
  const agent = Boolean(context.caller || context.mcp);
  return quietly(store, {
    ...row,
    source: agent ? "mcp" : "local",
    actor: agent
      ? context.caller
        ? `session:${context.caller.sessionKey || context.caller}`
        : "mcp"
      : operator || (context.local ? "cli" : "dashboard"),
  });
}

// ---------------------------------------------------------------------------
// The tick (§4.19): a small snapshot of what GitHub and plugin sync change,
// diffed against the last tick's. Read with SQL where it can, so a tick with
// no change parses no record.

const pickVerdict = (v) =>
  v && typeof v === "object"
    ? {
        state: v.state ?? null,
        key: v.key ?? v.at ?? null,
        pullRequest: typeof v.pullRequest === "string" ? v.pullRequest : null,
        actor: v.order?.actor ?? v.closer?.actor ?? null,
        reason: v.order?.reason ?? null,
        issue: typeof v.issue === "string" ? v.issue : null,
      }
    : null;

const fields = (list) =>
  (Array.isArray(list) ? list : [])
    .map((c) => (typeof c?.field === "string" ? c.field : null))
    .filter(Boolean)
    .sort();

const json = (value) => {
  try {
    return value == null ? null : JSON.parse(value);
  } catch {
    return null;
  }
};

export function tickSnapshot(store) {
  let data;
  try {
    data = store.read();
  } catch {
    return null;
  }
  const tasks = {};
  for (const task of data.tasks) {
    const github = pickVerdict(task.githubVerdict),
      tracker = pickVerdict(task.trackerVerdict),
      conflicts = fields(task.projectionConflicts),
      trackerConflicts = fields(task.tracker?.conflicts);
    if (github || tracker || conflicts.length || trackerConflicts.length)
      tasks[task.id] = { github, tracker, conflicts, trackerConflicts };
  }
  const all = (sql) => {
    try {
      return store.db.prepare(sql).all();
    } catch {
      return [];
    }
  };
  const board = {};
  for (const r of all(
    "SELECT json_extract(body,'$.taskId') AS task, json_extract(body,'$.paused') AS paused, json_extract(body,'$.ignored') AS ignored, json_extract(body,'$.releaseDraft') AS release FROM receipts WHERE json_extract(body,'$.kind')='project-item'",
  ))
    if (r.task)
      board[r.task] = {
        paused: json(r.paused),
        ignored: json(r.ignored),
        release: r.release == null ? null : String(r.release).slice(0, 200),
      };
  const labels = {};
  for (const r of all(
    "SELECT id, json_extract(body,'$.labelEventId') AS event, json_extract(body,'$.labelActor') AS actor, json_extract(body,'$.rule') AS rule, json_extract(body,'$.action') AS action, json_extract(body,'$.number') AS number, json_extract(body,'$.repository') AS repository, json_extract(body,'$.url') AS url, json_extract(body,'$.taskId') AS task FROM github_issues WHERE json_extract(body,'$.labelEventId') IS NOT NULL",
  ))
    labels[r.id] = {
      event: String(r.event),
      actor: r.actor,
      rule: r.rule,
      action: r.action,
      number: r.number,
      repository: r.repository,
      url: r.url,
      task: r.task,
    };
  const items = all("SELECT max(rowid) AS n FROM incoming_items")[0]?.n ?? 0;
  return { tasks, board, labels, items };
}

// Record what changed between two snapshots. Rows are keyed, so the same
// change seen twice is written once. shortcut: a conflict's key is its
// task, field and values, so the very same conflict coming back within the
// retention window is not recorded again; add a time to the key if that
// matters.
export function recordTickChanges(store, before, after) {
  if (!before || !after) return 0;
  let written = 0;
  const add = (row) => {
    if (quietly(store, row)) written += 1;
  };
  for (const [id, now] of Object.entries(after.tasks)) {
    const was = before.tasks[id] || {},
      g = now.github,
      pg = was.github;
    if (g && (g.state !== pg?.state || g.key !== pg?.key)) {
      const key = `verdict:${id}:${g.state}:${g.key ?? ""}`;
      if (g.state === "verified")
        add({
          source: "github",
          kind: "github.pr-merged",
          summary: `Closing pull request merged for ${id}`,
          targetId: id,
          link: g.pullRequest,
          key,
        });
      else if (g.state === "order")
        add({
          source: "github",
          kind: "github.close",
          actor: g.actor,
          summary: `${g.actor ?? "Someone"} closed ${id}'s issue without merged code (${String(g.reason ?? "closed").toLowerCase()}); dependents released`,
          targetId: id,
          link: g.issue,
          key,
        });
      else if (g.state === "held" && g.actor)
        add({
          source: "github",
          kind: "github.close-held",
          actor: g.actor,
          summary: `${g.actor} closed ${id}'s issue; the close is held for a person`,
          targetId: id,
          key,
        });
    }
    const t = now.tracker,
      pt = was.tracker;
    if (
      t &&
      (t.state !== pt?.state || t.key !== pt?.key) &&
      t.state === "order"
    )
      add({
        source: "plugin",
        kind: "plugin.close",
        actor: t.actor,
        summary: `${id} closed in its tracker (${String(t.reason ?? "closed")})`,
        targetId: id,
        key: `tracker:${id}:${t.state}:${t.key ?? ""}`,
      });
    for (const [list, prior, source, kind] of [
      [now.conflicts, was.conflicts, "github", "github.conflict"],
      [now.trackerConflicts, was.trackerConflicts, "plugin", "plugin.conflict"],
    ])
      for (const field of list)
        if (!(prior || []).includes(field))
          add({
            source,
            kind,
            summary: `${field} on ${id} was changed outside Avoozl`,
            targetId: id,
            key: `${kind}:${id}:${field}:${(prior || []).join(",")}`,
          });
  }
  for (const [id, now] of Object.entries(after.board)) {
    const was = before.board[id] || {};
    if (now.paused && now.paused.at !== was.paused?.at)
      add({
        source: "github",
        kind: "github.board-deferred",
        actor: now.paused.actor,
        summary: `${now.paused.actor ?? "Someone"} moved ${id} to Deferred on the board; no new dispatch`,
        targetId: id,
        key: `board:${id}:paused:${now.paused.at}`,
      });
    else if (!now.paused && was.paused)
      add({
        source: "github",
        kind: "github.board-resumed",
        summary: `${id} moved out of Deferred on the board`,
        targetId: id,
        key: `board:${id}:resumed:${was.paused.at}`,
      });
    if (now.ignored && now.ignored.at !== was.ignored?.at)
      add({
        source: "github",
        kind: "github.board-ignored",
        actor: now.ignored.actor,
        summary: `A board move of ${id} by ${now.ignored.actor ?? "someone"} was ignored: the policy does not allow it`,
        targetId: id,
        key: `board:${id}:ignored:${now.ignored.at}`,
      });
    if (now.release && now.release !== was.release)
      add({
        source: "github",
        kind: "github.release",
        summary: `Release of ${id} changed on the board; a plan change was drafted`,
        targetId: id,
        key: `board:${id}:release:${now.release}`,
      });
  }
  for (const [id, now] of Object.entries(after.labels))
    if (now.event !== before.labels[id]?.event)
      add({
        source: "github",
        kind: "github.label",
        actor: now.actor,
        summary: `${now.actor ?? "Someone"}'s label applied rule ${now.rule ?? "?"} (${now.action ?? "?"}) on ${now.repository}#${now.number}`,
        targetId: now.task ?? null,
        link: now.url,
        key: `label:${id}:${now.event}`,
      });
  if (after.items > before.items)
    for (const r of store.db
      .prepare(
        "SELECT body FROM incoming_items WHERE rowid>? ORDER BY rowid LIMIT 500",
      )
      .all(before.items)) {
      const item = json(r.body);
      if (!item?.id) continue;
      const source =
        item.source === "github"
          ? "github"
          : item.via === "mcp"
            ? "mcp"
            : item.source === "local"
              ? "local"
              : "plugin";
      add({
        source,
        kind: "intake.item",
        summary: `New ${item.record?.kind ?? "item"} ${item.itemId ?? item.id} from ${item.source}`,
        targetId: item.taskId ?? null,
        link: item.source === "github" ? item.record?.url : null,
        key: `intake:${item.id}`,
      });
    }
  return written;
}

// The tick's own step: diff against the last saved snapshot, save the new
// one only when it changed (an idle tick writes nothing), and prune.
// A new workspace starts from an empty snapshot; a database that had state
// before the log existed starts from that state (Store sets the flag).
export function recordTickActivity(store, config) {
  if (store.readOnly) return 0;
  let written = 0;
  try {
    const now = tickSnapshot(store);
    if (now) {
      let before = store.getMeta(SNAPSHOT);
      if (!before && store.getMeta(UPGRADE)) before = now;
      before ||= EMPTY;
      written = recordTickChanges(store, before, now);
      if (JSON.stringify(before) !== JSON.stringify(now))
        store.setMeta(SNAPSHOT, now);
      if (store.getMeta(UPGRADE))
        store.db.prepare("DELETE FROM meta WHERE key=?").run(UPGRADE);
    }
  } catch {}
  pruneActivity(store, { days: activityRetention(config) });
  return written;
}

// A board value Avoozl wrote back (the Wave revert in github-project.mjs).
export function recordRevert(store, { taskId, field }) {
  return quietly(store, {
    source: "github",
    kind: "github.revert",
    summary: `${field} on ${taskId} was set by hand; Avoozl wrote its value back`,
    targetId: taskId,
  });
}
