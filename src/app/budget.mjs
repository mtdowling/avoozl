// Per-task budgets and usage receipts (design §4.17, Requirement 67).
//
// Kiro Crew's usage read (flow-usage.mjs) stores each turn's raw tokens and
// credits. This module prices them on read from a price table that lives
// only on this machine (`~/.config/avoozl/config.json` key `prices`, every
// saved version kept in SQLite `price_versions`), resolves each task's cap
// from four levels (workspace, repository, spec, task; the most specific key
// wins), and acts at the cap. In `stop` mode nothing new is dispatched for
// the task and each live session gets one stop message; in `warn` mode the
// task is only marked over budget. Avoozl never stops, interrupts or closes
// a session, and a budget never opens a gate: no check, review, approval or
// proof reads this file.
//
// The driver export (§6.10, Phase 26) is not built yet; when it is, it must
// leave `prices` and `price_versions` out like every machine-local setting.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonical, fail } from "./store.mjs";
import { contentBinding } from "./content-rules.mjs";
import { machineFile, writeMachineFile } from "./crews.mjs";
import { listUsage, turnStage } from "./flow-usage.mjs";
import { listSpans } from "./flow.mjs";
import { FINAL_STATUSES, listSessionBindings } from "./session-bindings.mjs";
import { taskRepository, taskRoute } from "../work-model.mjs";

// Fallback caps for turns that cannot be priced (R67.6). Settings: the
// workspace `budget.tokens` and `budget.credits` replace them.
export const DEFAULT_CAPS = Object.freeze({ tokens: 2_000_000, credits: 200 });
export const WARN_AT = 0.8;
// In warn mode, each further half of the cap opens the item again.
export const OVER_STEP = 0.5;
export const MODES = Object.freeze(["stop", "warn"]);
export const BUDGET_KEYS = Object.freeze(["usd", "tokens", "credits"]);
const HOLDS = "budget_holds";
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const MAX_MODELS = 500;
const MAX_USD = 1_000_000;
const STOP_TEXT =
  'Budget reached. Finish the tool call you are in, leave the worktree as it is, report `blocked` with the text "budget", and stop.';
export const BUDGET_REACHED = "budget_reached";

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const round = (n) => Math.round(n * 1e6) / 1e6;
const money = (n) => (n == null ? "no cap" : `$${n.toFixed(2)}`);

// ---------------------------------------------------------------------------
// Validation.

// One level's `budget`: {usd?, tokens?, credits?, mode?}, plus `notify` at
// the workspace. Returns the value, or throws naming the key.
export function budgetInput(value, at = "budget", { workspace = false } = {}) {
  if (value === undefined) return undefined;
  if (!record(value)) fail(`${at} must be an object.`);
  const allowed = [...BUDGET_KEYS, "mode", ...(workspace ? ["notify"] : [])];
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(`${at}.${key} is not a budget setting.`);
  if (
    value.usd !== undefined &&
    (typeof value.usd !== "number" ||
      !Number.isFinite(value.usd) ||
      value.usd <= 0 ||
      value.usd > MAX_USD)
  )
    fail(`${at}.usd must be a dollar amount above 0 and at most ${MAX_USD}.`);
  if (
    value.tokens !== undefined &&
    (!Number.isInteger(value.tokens) || value.tokens <= 0)
  )
    fail(`${at}.tokens must be a whole number above 0.`);
  if (
    value.credits !== undefined &&
    (typeof value.credits !== "number" ||
      !Number.isFinite(value.credits) ||
      value.credits <= 0)
  )
    fail(`${at}.credits must be a number above 0.`);
  if (value.mode !== undefined && !MODES.includes(value.mode))
    fail(`${at}.mode must be "stop" or "warn".`);
  if (value.notify !== undefined && typeof value.notify !== "boolean")
    fail(`${at}.notify must be true or false.`);
  return value;
}

const PRICES_HERE =
  "Prices are kept on this computer only, in ~/.config/avoozl/config.json (Settings › Prices).";

// The budget keys of a tracked `.avoozl.json` (R67.2, R67.5): `prices` is
// refused by name; `budget` and `projects.<id>.budget` must be valid.
export function validateTrackedBudgets(value, file = ".avoozl.json") {
  if (!record(value)) return;
  if (value.prices !== undefined)
    fail(`${file} cannot hold prices. ${PRICES_HERE}`);
  budgetInput(value.budget, "budget", { workspace: true });
  for (const [id, entry] of Object.entries(
    record(value.projects) ? value.projects : {},
  )) {
    if (record(entry) && entry.prices !== undefined)
      fail(`${file} projects.${id} cannot hold prices. ${PRICES_HERE}`);
    if (record(entry)) budgetInput(entry.budget, `projects.${id}.budget`);
  }
}

// A spec manifest's top level (R67.2, R67.5).
export function validateManifestBudget(manifest) {
  if (!record(manifest)) return undefined;
  if (manifest.prices !== undefined)
    fail(`avoozl/manifest.json cannot hold prices. ${PRICES_HERE}`);
  return budgetInput(manifest.budget, "budget");
}

// The price table (R67.2): {creditUsd?, models: {id: {inputPerMTokUsd,
// outputPerMTokUsd}}}. A new table is empty; Avoozl ships no prices.
export function pricesInput(value) {
  if (value === undefined || value === null) return { models: {} };
  if (!record(value)) fail("prices must be an object.");
  for (const key of Object.keys(value))
    if (!["version", "creditUsd", "models"].includes(key))
      fail(`prices.${key} is not a price setting.`);
  const price = (n, at) => {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_USD)
      fail(`${at} must be a dollar amount of 0 or more.`);
    return n;
  };
  const out = { models: {} };
  if (value.creditUsd !== undefined && value.creditUsd !== null)
    out.creditUsd = price(value.creditUsd, "prices.creditUsd");
  const models = value.models ?? {};
  if (!record(models)) fail("prices.models must be an object.");
  if (Object.keys(models).length > MAX_MODELS)
    fail(`prices.models holds at most ${MAX_MODELS} models.`);
  for (const [id, entry] of Object.entries(models)) {
    if (!MODEL.test(id)) fail(`prices.models.${id} is not a model ID.`);
    if (!record(entry)) fail(`prices.models.${id} must be an object.`);
    for (const key of Object.keys(entry))
      if (!["inputPerMTokUsd", "outputPerMTokUsd"].includes(key))
        fail(`prices.models.${id}.${key} is not a price setting.`);
    out.models[id] = {
      inputPerMTokUsd: price(
        entry.inputPerMTokUsd,
        `prices.models.${id}.inputPerMTokUsd`,
      ),
      outputPerMTokUsd: price(
        entry.outputPerMTokUsd,
        `prices.models.${id}.outputPerMTokUsd`,
      ),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The price table and its versions.

const machinePath = (store, options = {}) =>
  options.machineFile ?? contentBinding(store)?.configFile ?? null;

const tableHash = (table) =>
  createHash("sha256")
    .update(
      canonical({ creditUsd: table.creditUsd ?? null, models: table.models }),
    )
    .digest("hex");

function versionRow(store, version) {
  const row = store.db
    .prepare("SELECT * FROM price_versions WHERE version=?")
    .get(version);
  return row
    ? {
        version: row.version,
        sha256: row.sha256,
        savedAt: row.saved_at,
        table: JSON.parse(row.table_json),
      }
    : null;
}

// The current table on this machine: {version, sha256, creditUsd, models,
// savedAt, hash}. A missing file or key is the empty table, version 0. A
// broken table prices nothing and says why.
export function readPrices(store, options = {}) {
  const file = machinePath(store, options);
  let value = {},
    hash = null,
    error = null;
  if (file)
    try {
      ({ value, hash } = machineFile(file));
    } catch (e) {
      error = e.message;
    }
  let table = { models: {} };
  try {
    table = pricesInput(value?.prices);
  } catch (e) {
    error = e.message;
  }
  const version = Number.isInteger(value?.prices?.version)
      ? value.prices.version
      : 0,
    sha256 = tableHash(table),
    saved = version ? versionRow(store, version) : null;
  return {
    version,
    sha256,
    ...table,
    savedAt: saved?.sha256 === sha256 ? saved.savedAt : null,
    hash,
    file,
    ...(error ? { error } : {}),
  };
}

// prices.save (a person only): the next version, its sha256, and a row in
// price_versions so an old receipt can name the prices it used (R67.3).
export function savePrices(store, input = {}, options = {}) {
  const file = machinePath(store, options);
  if (!file) fail("This workspace has no machine settings file.", 409);
  const table = pricesInput({
    creditUsd: input.creditUsd,
    models: input.models ?? {},
  });
  const current = readPrices(store, options),
    last =
      store.db.prepare("SELECT MAX(version) AS v FROM price_versions").get()
        ?.v ?? 0,
    version = Math.max(current.version, last) + 1,
    sha256 = tableHash(table),
    savedAt = new Date().toISOString();
  const written = writeMachineFile(
    file,
    (value) => {
      value.prices = { version, ...table };
    },
    input.expectedHash,
  );
  store.db
    .prepare("INSERT INTO price_versions VALUES (?,?,?,?)")
    .run(version, sha256, savedAt, JSON.stringify(table));
  return { version, sha256, savedAt, ...table, hash: written.hash };
}

// A table by version: the current one, or a saved row.
function tableAt(store, prices, version) {
  if (version == null || version === prices.version) return prices;
  const row = versionRow(store, version);
  return row ? { version, sha256: row.sha256, ...row.table } : null;
}

// Dollars for one turn, or null when it cannot be priced (R67.4): credits
// first when a credit price is set, then tokens at the model's prices.
export function priceTurn(turn, table) {
  if (turn.credits > 0 && typeof table.creditUsd === "number")
    return turn.credits * table.creditUsd;
  const model = turn.model ? table.models?.[turn.model] : null;
  if (model && (turn.input > 0 || turn.output > 0))
    return (
      (turn.input * model.inputPerMTokUsd) / 1e6 +
      (turn.output * model.outputPerMTokUsd) / 1e6
    );
  return null;
}

// ---------------------------------------------------------------------------
// Caps.

// The tracked `.avoozl.json`, or {} when there is none.
export function trackedConfig(store) {
  const root = contentBinding(store)?.workspaceRoot;
  if (!root) return {};
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"));
  } catch {
    return {};
  }
}

export function listRaises(store, taskId = null) {
  const rows = taskId
    ? store.db
        .prepare(
          "SELECT * FROM budget_raises WHERE task_id=? ORDER BY at, rowid",
        )
        .all(taskId)
    : store.db.prepare("SELECT * FROM budget_raises ORDER BY at, rowid").all();
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    by: row.by,
    at: row.at,
    from: row.from_json ? JSON.parse(row.from_json) : null,
    to: JSON.parse(row.to_json),
    priceVersion: row.price_version,
  }));
}

const holdOf = (store, taskId) => store.get(HOLDS, taskId);

// The cap of one task (R67.5, R67.6): each key from the most specific level
// that sets it; an Intake grant only fills a dollar cap nobody set and then
// forces stop mode; raises override; tokens and credits fall back to the
// workspace's or the defaults. Levels are reported per key.
export function resolveCap(store, task, tracked = trackedConfig(store)) {
  const repo = taskRepository(task),
    levels = [
      ["workspace", tracked?.budget],
      ["repository", tracked?.projects?.[repo]?.budget],
      ["spec", task?.specBudget],
      ["task", task?.budget],
    ],
    cap = { usd: null, tokens: null, credits: null, mode: "stop" },
    from = {};
  for (const [level, value] of levels) {
    if (!record(value)) continue;
    for (const key of [...BUDGET_KEYS, "mode"])
      if (value[key] !== undefined) {
        cap[key] = value[key];
        from[key] = level;
      }
  }
  let granted = false;
  const grant = task?.intakeBudget;
  if (record(grant) && typeof grant.usd === "number" && cap.usd === null) {
    cap.usd = grant.usd;
    from.usd = "grant";
    granted = true;
  }
  for (const raise of listRaises(store, task.id))
    for (const key of BUDGET_KEYS)
      if (raise.to?.[key] !== undefined) {
        cap[key] = raise.to[key];
        from[key] = "raise";
      }
  for (const key of ["tokens", "credits"])
    if (cap[key] === null) {
      cap[key] = DEFAULT_CAPS[key];
      from[key] = "default";
    }
  // Someone else's money is always a hard cap.
  if (granted) {
    cap.mode = "stop";
    from.mode = "grant";
  }
  if (holdOf(store, task.id)?.switchedToStop) {
    cap.mode = "stop";
    from.mode = "switched";
  }
  return {
    ...cap,
    level: from.usd || (cap.usd === null ? null : "default"),
    levels: from,
    granted,
  };
}

// ---------------------------------------------------------------------------
// Spend.

const slotKey = (slot) =>
  typeof slot === "string" && slot.startsWith("dashboard:")
    ? slot.slice("dashboard:".length)
    : slot;

// Every priced turn, shared out to tasks: a batch binding's turns go in
// equal parts to each task in the batch, marked shared (R67.7).
// Planner, critic, retro, router and code review chats are not a task's
// work and have no cap; Flow shows them under "no task".
const UNCAPPED = new Set(["planner", "retro", "router", "pr-review"]);
const capped = (b) => !UNCAPPED.has(b?.role);

function turnsByTask(store, bindings) {
  const bySlot = new Map(bindings.map((b) => [b.slot, b])),
    map = new Map();
  for (const turn of listUsage(store)) {
    if (UNCAPPED.has(turn.role)) continue;
    const binding = bySlot.get(turn.slot),
      members = binding?.batch?.tasks?.length ? binding.batch.tasks : null,
      share = members ? 1 / members.length : 1;
    for (const id of members || [turn.task_id]) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ ...turn, share, shared: Boolean(members) });
    }
  }
  return map;
}

const zero = () => ({
  input: 0,
  output: 0,
  credits: 0,
  usd: 0,
  unpricedTurns: 0,
  unpricedTokens: 0,
  unpricedCredits: 0,
  turns: 0,
});

function addTurn(row, turn, usd) {
  row.input += turn.input * turn.share;
  row.output += turn.output * turn.share;
  row.credits += turn.credits * turn.share;
  row.turns += turn.share;
  if (usd === null) {
    row.unpricedTurns += turn.share;
    row.unpricedTokens += (turn.input + turn.output) * turn.share;
    row.unpricedCredits += turn.credits * turn.share;
  } else row.usd += usd * turn.share;
}

const tidy = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "number" ? round(v) : v,
    ]),
  );

// Why some of a task's spend cannot be read (R67.14).
function missingFor(store, task, bindings) {
  const own = bindings.filter(
      (b) =>
        capped(b) &&
        (b.taskId === task.id || b.batch?.tasks?.includes(task.id)),
    ),
    missing = [];
  if (!own.length && taskRoute(task) !== "local")
    missing.push({ slot: null, reason: "not-run-by-avoozl" });
  for (const b of own) {
    if (b.crew && b.crew !== "local")
      missing.push({ slot: b.slot, reason: "remote" });
    else if (b.source !== "tick")
      missing.push({
        slot: b.slot,
        reason: b.source === "conductor" ? "crew-mode" : "not-opened-by-tick",
      });
    else {
      const read = store.getMeta("flow.usage.read." + b.slot);
      if (read && !read.ok)
        missing.push({
          slot: b.slot,
          reason: "read-failed",
          since: read.failedAt ?? null,
          lastReadAt: read.at ?? null,
        });
    }
  }
  return missing;
}

// One task's spend and its parts, from the current price table.
function spendOf(store, task, turns, prices, spans) {
  const total = zero(),
    byStage = new Map(),
    byModel = new Map(),
    byAttempt = new Map(),
    unpricedModels = new Set();
  let shared = false;
  for (const turn of turns) {
    const usd = priceTurn(turn, prices);
    if (usd === null) unpricedModels.add(turn.model || "unknown");
    if (turn.shared) shared = true;
    addTurn(total, turn, usd);
    for (const [map, key] of [
      [byStage, turnStage(spans, turn)],
      [byModel, turn.model || "unknown"],
      [byAttempt, `${turn.role || "worker"} ${turn.attempt ?? 1}`],
    ]) {
      if (!map.has(key))
        map.set(key, { key, ...zero(), priced: true, shared: false });
      const row = map.get(key);
      addTurn(row, turn, usd);
      if (usd === null) row.priced = false;
      if (turn.shared) row.shared = true;
    }
  }
  const rows = (map, name) =>
    [...map.values()].map(({ key, ...row }) => ({ [name]: key, ...tidy(row) }));
  return {
    total: tidy(total),
    byStage: rows(byStage, "stage"),
    byModel: rows(byModel, "model"),
    byAttempt: rows(byAttempt, "attempt"),
    unpricedModels: [...unpricedModels],
    shared,
  };
}

// How far spend is through the cap: the largest of dollars against the
// dollar cap, unpriced tokens against the token cap and unpriced credits
// against the credit cap (R67.6). Priced turns count only against dollars.
function ratioOf(total, cap) {
  const parts = [];
  if (cap.usd) parts.push(["usd", total.usd / cap.usd]);
  if (cap.tokens) parts.push(["tokens", total.unpricedTokens / cap.tokens]);
  if (cap.credits) parts.push(["credits", total.unpricedCredits / cap.credits]);
  const [key, ratio] = parts.sort((a, b) => b[1] - a[1])[0] || [null, 0];
  return { key, ratio };
}

// A batch has the sum of its tasks' caps (R67.7), checked on the sum of
// their spend.
function sumCaps(caps) {
  const out = { usd: 0, tokens: 0, credits: 0 };
  for (const cap of caps)
    for (const key of BUDGET_KEYS)
      out[key] =
        out[key] === null || cap[key] === null ? null : out[key] + cap[key];
  return out;
}

// Everything the budget knows about every task with turns, a hold, or a
// raise: {taskId: status}. Reads only.
export function budgetStatuses(store, data = store.read(), options = {}) {
  const tracked = options.tracked ?? trackedConfig(store),
    prices = options.prices ?? readPrices(store, options),
    bindings = listSessionBindings(store),
    spans = listSpans(store),
    turns = turnsByTask(store, bindings),
    byId = new Map(data.tasks.map((t) => [t.id, t])),
    ids = new Set([
      ...turns.keys(),
      ...bindings
        .filter(capped)
        .flatMap((b) => [b.taskId, ...(b.batch?.tasks || [])]),
      ...store.list(HOLDS).map((h) => h.taskId),
      ...listRaises(store).map((r) => r.taskId),
      ...(options.only || []),
    ]),
    out = new Map();
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) continue;
    const cap = resolveCap(store, task, tracked),
      spend = spendOf(store, task, turns.get(id) || [], prices, spans),
      missing = missingFor(store, task, bindings);
    out.set(id, {
      taskId: id,
      task,
      cap,
      spend,
      missing,
      ...ratioOf(spend.total, cap),
    });
  }
  // Batches: one group per batch binding; each member is checked on the
  // group's sum.
  for (const b of bindings) {
    const members = b.batch?.tasks?.filter((id) => out.has(id));
    if (!members || members.length < 2) continue;
    const caps = members.map((id) => out.get(id).cap),
      cap = {
        ...sumCaps(caps),
        mode: caps.some((c) => c.mode === "stop") ? "stop" : "warn",
      },
      total = zero();
    for (const id of members)
      for (const key of Object.keys(total))
        total[key] += out.get(id).spend.total[key];
    const group = {
      id: b.batch.id,
      tasks: members,
      cap,
      total: tidy(total),
      ...ratioOf(total, cap),
    };
    for (const id of members) {
      const s = out.get(id);
      s.batch = group;
      s.ratio = group.ratio;
      s.key = group.key;
      s.cap = { ...s.cap, mode: cap.mode };
    }
  }
  for (const s of out.values()) {
    s.reached = s.ratio >= 1;
    s.warning = s.ratio >= WARN_AT;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Holds: the stop, the pause, the warn-mode over-budget item.

const liveSlots = (bindings, taskId) =>
  bindings
    .filter(
      (b) =>
        (b.taskId === taskId || b.batch?.tasks?.includes(taskId)) &&
        !FINAL_STATUSES.has(b.status) &&
        b.status !== "gone",
    )
    .map((b) => b.slot);

const emptyHold = (taskId) => ({
  id: taskId,
  taskId,
  state: null,
  stops: [],
  messages: [],
  acknowledgedStep: -1,
  over: null,
  unpricedWarned: [],
  unknownWarned: false,
  warnedAt: null,
});

// Tasks whose budget holds new dispatch: an open stop or a pressed Stop.
export function budgetHeldTaskIds(store) {
  return new Set(
    store
      .list(HOLDS)
      .filter((h) => h.state === "open" || h.state === "paused")
      .map((h) => h.taskId),
  );
}

export const budgetPausedTaskIds = (store) =>
  new Set(
    store
      .list(HOLDS)
      .filter((h) => h.state === "paused")
      .map((h) => h.taskId),
  );

// Slots a budget stop asked to stop: their blocked report or end does not
// cost the task an attempt (R67.9).
export function budgetStopSlots(store) {
  const slots = new Map();
  for (const h of store.list(HOLDS))
    for (const stop of h.stops || [])
      for (const slot of stop.slots || []) slots.set(slotKey(slot), h);
  return slots;
}

// The MCP answer for a session bound to a held task (R67.8 step 4).
export function budgetRefusal(store, slot) {
  if (!slot) return null;
  const held = budgetHeldTaskIds(store);
  if (!held.size) return null;
  const binding = listSessionBindings(store).find(
    (b) => slotKey(b.slot) === slot,
  );
  if (!binding) return null;
  const ids = [binding.taskId, ...(binding.batch?.tasks || [])];
  return ids.some((id) => held.has(id))
    ? `${BUDGET_REACHED}: ${STOP_TEXT}`
    : null;
}

// The check after each usage read and before each tick's dispatch (R67.8):
// records stops and over-budget steps, and returns the stop and go-on
// messages and the notices due. Only the script cron (`script`) carries out
// messages and notices, so only it marks them sent. Never closes a session.
export function budgetStep(store, data = store.read(), options = {}) {
  const { script = false, now = Date.now() } = options,
    at = new Date(now).toISOString(),
    tracked = options.tracked ?? trackedConfig(store),
    prices = readPrices(store, options),
    statuses = budgetStatuses(store, data, { ...options, tracked, prices }),
    bindings = listSessionBindings(store),
    notifyOver = tracked?.budget?.notify === true,
    messages = [],
    notify = [];
  for (const s of statuses.values()) {
    const before = holdOf(store, s.taskId),
      hold = structuredClone(before || emptyHold(s.taskId)),
      id = s.taskId;
    if (s.warning && !hold.warnedAt) hold.warnedAt = at;
    // Unpriced models warn once per task and model (R67.6).
    for (const model of s.spend.unpricedModels)
      if (!hold.unpricedWarned.includes(model)) {
        hold.unpricedWarned.push(model);
        hold.unpricedPending = [...(hold.unpricedPending || []), model];
      }
    // Unknown spend warns once and never stops (R67.14).
    if (s.missing.length && !hold.unknownWarned) {
      hold.unknownWarned = true;
      hold.unknownPending = true;
    }
    if (
      s.reached &&
      s.cap.mode === "stop" &&
      !["open", "paused"].includes(hold.state)
    ) {
      const slots = liveSlots(bindings, id);
      hold.state = "open";
      hold.stops.push({
        at,
        key: s.key,
        usd: s.spend.total.usd,
        tokens: s.spend.total.unpricedTokens,
        credits: s.spend.total.unpricedCredits,
        cap: { usd: s.cap.usd, tokens: s.cap.tokens, credits: s.cap.credits },
        level: s.cap.level,
        priceVersion: prices.version,
        overrun:
          s.key === "usd" && s.cap.usd
            ? round(Math.max(0, s.spend.total.usd - s.cap.usd))
            : null,
        ...(s.batch ? { batch: s.batch.id } : {}),
        slots,
      });
      hold.notifyPending = true;
      for (const slot of slots)
        if (
          !hold.messages.some(
            (m) =>
              m.slot === slot &&
              m.kind === "stop" &&
              m.stop === hold.stops.length,
          )
        )
          hold.messages.push({
            slot,
            kind: "stop",
            stop: hold.stops.length,
            sent: null,
          });
    }
    if (s.reached && s.cap.mode === "warn") {
      const step = Math.floor((s.ratio - 1) / OVER_STEP + 1e-9);
      if (hold.over?.step !== step) {
        hold.over = {
          step,
          at,
          usd: s.spend.total.usd,
          cap: s.cap.usd,
          key: s.key,
          ratio: round(s.ratio),
          priceVersion: prices.version,
        };
        if (step > hold.acknowledgedStep && notifyOver)
          hold.overNotifyPending = true;
      }
    }
    if (!s.reached && hold.over && hold.state === null) hold.over = null;
    if (script) {
      for (const m of hold.messages)
        if (!m.sent) {
          if (liveSlots(bindings, id).includes(m.slot))
            messages.push({
              slot: m.slot,
              task: id,
              budget: m.kind,
              text:
                m.kind === "stop" ? `Avoozl task ${id}: ${STOP_TEXT}` : m.text,
            });
          m.sent = at;
        }
      const title = s.task.title || id;
      if (hold.notifyPending) {
        const stop = hold.stops.at(-1);
        notify.push({
          channel: "decision",
          task: id,
          title: `Budget reached on ${id}`,
          text: `${title}: ${capText(stop)}. No new session starts for it.`,
          resume: "Raise budget or press Stop on the task in Avoozl.",
        });
        hold.notifyPending = false;
      }
      if (hold.overNotifyPending) {
        notify.push({
          channel: "decision",
          task: id,
          title: `Over budget: ${id}`,
          text: `${title}: ${money(hold.over.usd)} of ${money(hold.over.cap)}. It keeps running (warn mode).`,
          resume:
            "Acknowledge, raise the budget, or switch it to stop in Avoozl.",
        });
        hold.overNotifyPending = false;
      }
      for (const model of hold.unpricedPending || [])
        notify.push({
          channel: "failure",
          task: id,
          title: `${id} used a model with no price`,
          text: `Turns on ${model} count against the token and credit caps instead of dollars. Add its price in Settings › Prices.`,
        });
      hold.unpricedPending = [];
      if (hold.unknownPending)
        notify.push({
          channel: "failure",
          task: id,
          title: `Spend unknown on ${id}`,
          text: `Avoozl cannot read some of this task's usage (${[...new Set(s.missing.map((m) => m.reason))].join(", ")}). The budget does not stop it for that.`,
        });
      hold.unknownPending = false;
    }
    if (JSON.stringify(hold) !== JSON.stringify(before || emptyHold(id)))
      store.transaction(() => store.put(HOLDS, hold));
  }
  return { messages, notify, statuses };
}

function capText(stop) {
  if (!stop) return "budget reached";
  if (stop.key === "tokens")
    return `${Math.round(stop.tokens)} unpriced tokens of ${stop.cap.tokens}`;
  if (stop.key === "credits")
    return `${round(stop.credits)} unpriced credits of ${stop.cap.credits}`;
  return `${money(stop.usd)} of ${money(stop.cap.usd)}`;
}

// ---------------------------------------------------------------------------
// A person's actions (R67.9). Callers check that a person made the call.

function heldTask(store, taskId) {
  const task = store.read().tasks.find((t) => t.id === taskId);
  if (!task) fail(`Task ${taskId} does not exist.`, 404);
  return task;
}

// Raise budget: a new cap, recorded with who, from, to, when and the price
// version; a live session gets one go-on message, else the next attempt
// starts as usual.
export function raiseBudget(store, input = {}, { by, options = {} } = {}) {
  const task = heldTask(store, input.taskId),
    to = {};
  for (const key of BUDGET_KEYS)
    if (input[key] !== undefined) to[key] = input[key];
  if (!Object.keys(to).length)
    fail("Give the new cap: usd, tokens or credits.");
  budgetInput(to, "the new cap");
  const cap = resolveCap(store, task),
    from = Object.fromEntries(Object.keys(to).map((k) => [k, cap[k]])),
    prices = readPrices(store, options),
    at = new Date().toISOString(),
    raise = {
      id: randomUUID(),
      taskId: task.id,
      by,
      at,
      from,
      to,
      priceVersion: prices.version,
    },
    bindings = listSessionBindings(store);
  store.transaction(() => {
    store.db
      .prepare("INSERT INTO budget_raises VALUES (?,?,?,?,?,?,?)")
      .run(
        raise.id,
        task.id,
        by,
        at,
        JSON.stringify(from),
        JSON.stringify(to),
        prices.version,
      );
    const hold = holdOf(store, task.id) || emptyHold(task.id);
    const wasHeld = hold.state === "open" || hold.state === "paused";
    hold.state = null;
    hold.over = null;
    hold.acknowledgedStep = -1;
    hold.raises = [
      ...(hold.raises || []),
      { at, by, usd: cap.usd, priceVersion: prices.version },
    ];
    if (wasHeld)
      for (const slot of liveSlots(bindings, task.id))
        hold.messages.push({
          slot,
          kind: "go-on",
          text: `Avoozl task ${task.id}: Budget raised to ${to.usd !== undefined ? money(to.usd) : "a new cap"}; go on.`,
          sent: null,
        });
    store.put(HOLDS, hold);
  });
  return { raise, cap: resolveCap(store, task) };
}

// Stop: the task pauses the way a Deferred card does; its session and
// worktree are left alone and its dependents wait.
export function stopBudget(store, input = {}, { by } = {}) {
  const task = heldTask(store, input.taskId),
    hold = holdOf(store, task.id);
  if (!hold || (!["open", "paused"].includes(hold.state) && !hold.over))
    fail(`${task.id} has not reached its budget.`, 409);
  const next = {
    ...hold,
    state: "paused",
    stoppedBy: { by, at: new Date().toISOString() },
  };
  store.transaction(() => store.put(HOLDS, next));
  return { hold: next };
}

// Warn mode: Acknowledge clears the item until spend passes the next step.
export function acknowledgeBudget(store, input = {}, { by } = {}) {
  const task = heldTask(store, input.taskId),
    hold = holdOf(store, task.id);
  if (!hold?.over) fail(`${task.id} is not over budget.`, 409);
  const next = {
    ...hold,
    acknowledgedStep: hold.over.step,
    acknowledged: { by, at: new Date().toISOString(), step: hold.over.step },
  };
  store.transaction(() => store.put(HOLDS, next));
  return { hold: next };
}

// Warn mode: Switch to stop. The next check stops it, now if it is over.
export function switchBudgetToStop(
  store,
  input = {},
  { by, options = {} } = {},
) {
  const task = heldTask(store, input.taskId),
    hold = holdOf(store, task.id) || emptyHold(task.id);
  store.transaction(() =>
    store.put(HOLDS, {
      ...hold,
      switchedToStop: { by, at: new Date().toISOString() },
    }),
  );
  budgetStep(store, store.read(), { ...options, only: [task.id] });
  return { hold: holdOf(store, task.id), cap: resolveCap(store, task) };
}

// ---------------------------------------------------------------------------
// Views.

// The chip and Needs you state of one task, for the page.
function summary(s, hold) {
  const over = hold?.over && hold.state === null ? hold.over : null;
  return {
    taskId: s.taskId,
    spent: s.spend.total.usd,
    tokens: round(s.spend.total.input + s.spend.total.output),
    credits: s.spend.total.credits,
    unpricedTurns: s.spend.total.unpricedTurns,
    cap: {
      usd: s.cap.usd,
      tokens: s.cap.tokens,
      credits: s.cap.credits,
      mode: s.cap.mode,
      level: s.cap.level,
    },
    ratio: round(s.ratio),
    stopKey: hold?.stops?.at(-1)?.key ?? s.key,
    warning: s.warning,
    reached: s.reached,
    state: hold?.state ?? null,
    over: over
      ? { ...over, open: over.step > (hold.acknowledgedStep ?? -1) }
      : null,
    unknown: s.missing.length
      ? [...new Set(s.missing.map((m) => m.reason))]
      : [],
    unpricedModels: s.spend.unpricedModels,
    ...(s.batch ? { batch: s.batch.id } : {}),
  };
}

// budget.view: every task's chip, the open budget items, and the count of
// over-budget tasks for the Dashboard.
export function budgetView(store, data = store.read(), options = {}) {
  const statuses = budgetStatuses(store, data, options),
    tasks = [...statuses.values()].map((s) =>
      summary(s, holdOf(store, s.taskId)),
    );
  return {
    tasks,
    overBudget: tasks.filter((t) => t.reached).length,
    stopped: tasks.filter((t) => t.state === "open").length,
    paused: tasks.filter((t) => t.state === "paused").length,
  };
}

export function budgetSummaries(store, data = store.read(), options = {}) {
  try {
    return new Map(
      budgetView(store, data, options).tasks.map((t) => [t.taskId, t]),
    );
  } catch {
    return new Map();
  }
}

// budget.receipt (R67.11, R67.12): counts, dollars, model IDs, stage names
// and times only; no prompts, transcript text or tool output.
export function budgetReceipt(
  store,
  data = store.read(),
  taskId,
  options = {},
) {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) fail(`Task ${taskId} does not exist.`, 404);
  const prices = readPrices(store, options),
    s = budgetStatuses(store, data, {
      ...options,
      prices,
      only: [task.id],
    }).get(task.id),
    hold = holdOf(store, task.id),
    sum = summary(s, hold),
    reads = listSessionBindings(store)
      .filter((b) => b.taskId === task.id || b.batch?.tasks?.includes(task.id))
      .map((b) => store.getMeta("flow.usage.read." + b.slot)?.at)
      .filter(Boolean)
      .sort();
  return {
    taskId: task.id,
    spec: task.spec || task.planId || null,
    repository: taskRepository(task),
    complete: s.missing.length === 0,
    missing: s.missing,
    cap: {
      usd: s.cap.usd,
      tokens: s.cap.tokens,
      credits: s.cap.credits,
      mode: s.cap.mode,
      level: s.cap.level,
      levels: s.cap.levels,
      ...(s.batch
        ? { batch: { id: s.batch.id, tasks: s.batch.tasks, ...s.batch.cap } }
        : {}),
    },
    raises: listRaises(store, task.id).map(
      ({ by, at, from, to, priceVersion }) => {
        const then = tableAt(store, prices, priceVersion);
        return {
          by,
          at,
          from,
          to,
          priceVersion,
          ...(then ? {} : { priceMissing: true }),
        };
      },
    ),
    price: { version: prices.version, sha256: prices.sha256 },
    stops: (hold?.stops || []).map(({ slots, ...stop }) => stop),
    warning: {
      at80: sum.warning,
      ratio: sum.ratio,
      since: hold?.warnedAt ?? null,
    },
    over: sum.over,
    state: sum.state,
    totals: {
      input: s.spend.total.input,
      output: s.spend.total.output,
      credits: s.spend.total.credits,
      usd: s.spend.total.usd,
      unpricedTurns: s.spend.total.unpricedTurns,
    },
    overrun: s.cap.usd
      ? round(Math.max(0, s.spend.total.usd - s.cap.usd))
      : null,
    shared: s.spend.shared,
    byStage: s.spend.byStage.map(line),
    byModel: s.spend.byModel.map(line),
    byAttempt: s.spend.byAttempt.map(line),
    readAt: reads.at(-1) ?? null,
  };
}

const line = ({ unpricedTokens, unpricedCredits, unpricedTurns, ...row }) => ({
  ...row,
  ...(unpricedTurns ? { unpricedTurns } : {}),
});

// The retro's view (R67.13): finished tasks' totals by stage and model.
export function retroReceipts(store, data, taskIds, options = {}) {
  const statuses = budgetStatuses(store, data, { ...options, only: taskIds });
  return taskIds
    .map((id) => statuses.get(id))
    .filter(Boolean)
    .map((s) => ({
      task: s.taskId,
      usd: s.spend.total.usd,
      input: s.spend.total.input,
      output: s.spend.total.output,
      credits: s.spend.total.credits,
      byStage: s.spend.byStage.map(
        ({ stage, usd, input, output, credits }) => ({
          stage,
          usd,
          input,
          output,
          credits,
        }),
      ),
      byModel: s.spend.byModel.map(
        ({ model, usd, input, output, credits }) => ({
          model,
          usd,
          input,
          output,
          credits,
        }),
      ),
      overBudget: s.reached,
      mode: s.cap.mode,
    }));
}

// Settings › Prices: the table, its version, and the models seen in usage,
// each with whether it has a price.
export function pricesView(store, options = {}) {
  const prices = readPrices(store, options),
    seen = new Map();
  for (const turn of listUsage(store)) {
    const id = turn.model || "unknown",
      row = seen.get(id) || { model: id, turns: 0, unpricedTurns: 0 };
    row.turns += 1;
    if (priceTurn(turn, prices) === null) row.unpricedTurns += 1;
    seen.set(id, row);
  }
  return {
    version: prices.version,
    sha256: prices.sha256,
    savedAt: prices.savedAt,
    hash: prices.hash,
    creditUsd: prices.creditUsd ?? null,
    models: prices.models,
    seen: [...seen.values()],
    ...(prices.error ? { error: prices.error } : {}),
  };
}
