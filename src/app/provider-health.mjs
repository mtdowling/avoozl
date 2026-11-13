// Provider health and switching models (design §4.20, Requirement 72).
// Health comes from the reads Avoozl already makes: usage turns
// (flow_usage) and the session rows the timing read fetches. Each provider
// or model reads `ok`, `low` or `out`; new tasks skip weak choices, and the
// backend moves running chats off an `out` model with Kiro Crew's per-chat
// model change, POST /api/chat/slots/<slot>/model (F126: verified from
// source, not called live). Only kinds and times are stored, never row text.
import { createHash, randomUUID } from "node:crypto";
import { fail } from "./store.mjs";
import { machineFile, writeMachineFile } from "./crews.mjs";
import { contentBinding } from "./content-rules.mjs";
import { listUsage } from "./flow-usage.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { recordActivity } from "./activity-log.mjs";

const HEALTH = "provider_health";
const SWITCHES = "provider_switches";
const LEVELS = ["ok", "low", "out"];
export const PROVIDER_DEFAULTS = Object.freeze({ lowPercent: 80 });
// Fixed since 2026-11-13: an error mark clears after 30 minutes, and usage
// is summed over the last 5 hours.
const COOLDOWN_MS = 30 * 60000;
const WINDOW_MS = 5 * 3600000;
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const rank = (level) => Math.max(0, LEVELS.indexOf(level));
const worse = (a, b) => (rank(b) > rank(a) ? b : a);
const NAME = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/;
const iso = (ms) => new Date(ms).toISOString();

function modelName(value, at) {
  if (typeof value !== "string" || !NAME.test(value) || value === "auto")
    fail(`${at} must name a model.`);
  return value;
}

// ------------------------------------------------------------ settings

// Keys the thresholds form used (removed 2026-11-13). The cooldown and the
// window are fixed; providers come from the model ID; the routing agent
// replaces the fallback list.
const OLD_PROVIDER_KEYS = [
  "cooldownMinutes",
  "windowHours",
  "groups",
  "fallback",
];

// Machine-local `providers` (§4.20 Settings): `lowPercent`, and `limits`
// that give usage a percent. Every key is optional.
export function providersInput(value, at = "providers") {
  if (value === undefined || value === null) return {};
  if (!record(value)) fail(`${at} must be an object.`);
  const out = {};
  for (const key of Object.keys(value))
    if (OLD_PROVIDER_KEYS.includes(key))
      fail(
        `${at}.${key} was removed; run node scripts/migrate-routing.mjs <file>.`,
      );
    else if (!["lowPercent", "limits"].includes(key))
      fail(`${at}.${key} is not a provider setting.`);
  if (value.lowPercent !== undefined) {
    if (
      !Number.isInteger(value.lowPercent) ||
      value.lowPercent < 1 ||
      value.lowPercent > 99
    )
      fail(`${at}.lowPercent must be a whole number from 1 to 99.`);
    out.lowPercent = value.lowPercent;
  }
  if (value.limits !== undefined) {
    if (!record(value.limits)) fail(`${at}.limits must be an object.`);
    out.limits = {};
    for (const [key, limit] of Object.entries(value.limits)) {
      modelName(key, `${at}.limits key`);
      if (!record(limit)) fail(`${at}.limits.${key} must be an object.`);
      const entry = {};
      for (const field of Object.keys(limit)) {
        if (!["credits", "tokens"].includes(field))
          fail(`${at}.limits.${key}.${field} must be credits or tokens.`);
        const n = limit[field];
        if (typeof n !== "number" || !Number.isFinite(n) || n <= 0)
          fail(`${at}.limits.${key}.${field} must be a positive number.`);
        entry[field] = n;
      }
      if (!Object.keys(entry).length)
        fail(`${at}.limits.${key} needs credits or tokens.`);
      out.limits[key] = entry;
    }
  }
  return out;
}

const machinePath = (store, options = {}) =>
  options.machineFile ?? contentBinding(store)?.configFile ?? null;

export function readProviders(store, options = {}) {
  const file = machinePath(store, options);
  if (!file) return { settings: {}, hash: null, file: null };
  const { value, hash } = machineFile(file);
  return { settings: providersInput(value.providers), hash, file };
}

export function updateProviders(store, input = {}, options = {}) {
  const file = machinePath(store, options);
  if (!file) fail("This workspace has no machine settings file.", 409);
  const providers = providersInput(input.providers);
  const written = writeMachineFile(
    file,
    (value) => {
      if (Object.keys(providers).length) value.providers = providers;
      else delete value.providers;
    },
    input.expectedHash,
  );
  return { hash: written.hash, providers };
}

// `.avoozl.json` must not hold this machine's limits (R72.17).
export function refuseTrackedProviders(config) {
  if (record(config) && config.providers !== undefined)
    fail(
      "providers is this machine's setting: put it in ~/.config/avoozl/config.json, not .avoozl.json.",
    );
}

// --------------------------------------------------------------- health

// A model's provider (R72.1): its ID up to the first `-`, `/`, `.` or `:`.
// `auto` and no model have none.
export function providerOf(model) {
  if (typeof model !== "string" || !model || model === "auto") return null;
  return model.split(/[-/.:]/)[0].toLowerCase() || null;
}

const applies = (mark, model, provider) =>
  (mark.scope === "model" && mark.name === model) ||
  (mark.scope === "provider" && mark.name === provider) ||
  (mark.scope === "key" && (mark.name === model || mark.name === provider));

// An error mark past its cooldown no longer counts, even before the backend
// pass deletes it (R72.4).
const active = (mark, now) =>
  mark.source !== "error" || !mark.until || Date.parse(mark.until) >= now;

export function listMarks(store) {
  try {
    return store.list(HEALTH);
  } catch {
    return [];
  }
}

// Everything routing and switching need to judge a model. Reads only.
export function healthContext(store, options = {}) {
  const settings =
      options.settings ?? readProviders(store, options).settings ?? {},
    now = options.now ?? Date.now(),
    marks = (options.marks ?? listMarks(store)).filter((m) => active(m, now));
  const marksFor = (model) => {
    const provider = providerOf(model, settings);
    return marks.filter((m) => applies(m, model, provider));
  };
  const level = (model) =>
    !model || model === "auto"
      ? "ok"
      : marksFor(model).reduce((l, m) => worse(l, m.level), "ok");
  return {
    settings,
    now,
    marks,
    level,
    providerOf,
    // A person's replacement for a model they marked out (R72.13).
    replacement: (model) =>
      marksFor(model).find((m) => m.source === "person" && m.to)?.to ?? null,
    empty: marks.length === 0,
  };
}

// Usage in the last 5 hours, read live (R72.2): one row per provider seen
// in the window and per limit key, with its percent of the limit when one
// is set. [{key, credits, tokens, percent|null, limit|null}].
export function usageReport(store, options = {}) {
  const settings = options.settings ?? readProviders(store, options).settings,
    now = options.now ?? Date.now(),
    since = iso(now - WINDOW_MS),
    turns = (options.turns ?? listUsage(store)).filter((t) => t.ts >= since),
    limits = settings.limits || {},
    keys = [
      ...new Set([
        ...Object.keys(limits),
        ...turns.map((t) => providerOf(t.model)).filter(Boolean),
      ]),
    ];
  return keys.map((key) => {
    let credits = 0,
      tokens = 0;
    for (const t of turns)
      if (t.model === key || providerOf(t.model) === key) {
        credits += t.credits || 0;
        tokens += (t.input || 0) + (t.output || 0);
      }
    const limit = limits[key] ?? null,
      percent = limit
        ? Math.max(
            limit.credits ? (100 * credits) / limit.credits : 0,
            limit.tokens ? (100 * tokens) / limit.tokens : 0,
          )
        : null;
    return {
      key,
      credits,
      tokens,
      limit,
      percent: percent === null ? null : Math.round(percent),
    };
  });
}

// Writes after a usage read (R72.2): one `usage` mark per limit key at or
// over the low line, cleared when the window drops below it. Error marks
// past their cooldown or followed by a turn on the model go too (R72.4).
export function refreshHealth(store, options = {}) {
  const settings = options.settings ?? readProviders(store, options).settings,
    now = options.now ?? Date.now(),
    lowPercent = settings.lowPercent ?? PROVIDER_DEFAULTS.lowPercent,
    turns = listUsage(store),
    marks = listMarks(store),
    changes = [];
  store.transaction(() => {
    for (const row of usageReport(store, { settings, now, turns })) {
      if (!row.limit) continue;
      const { key, percent } = row,
        level = percent >= 100 ? "out" : percent >= lowPercent ? "low" : "ok",
        id = `usage:key:${key}`,
        current = marks.find((m) => m.id === id);
      if (level === "ok") {
        if (current) {
          store.remove(HEALTH, id);
          changes.push({ id, level: "ok" });
        }
        continue;
      }
      if (current?.level === level && current.percent === percent) continue;
      store.put(HEALTH, {
        id,
        scope: "key",
        name: key,
        level,
        source: "usage",
        kind:
          row.limit.credits && row.credits >= row.limit.credits
            ? "credits"
            : "usage",
        percent,
        since: current?.since ?? iso(now),
      });
      if (current?.level !== level) changes.push({ id, level });
    }
    for (const mark of marks) {
      if (mark.source !== "error") continue;
      const later = turns.some(
        (t) =>
          t.ts > mark.lastErrorAt &&
          (mark.scope === "model"
            ? t.model === mark.name
            : providerOf(t.model, settings) === mark.name),
      );
      if (later || Date.parse(mark.until) < now) {
        store.remove(HEALTH, mark.id);
        changes.push({ id: mark.id, level: "ok" });
      }
    }
  });
  return { changes };
}

// One session row's provider error (F127), or null. Kind first, then a
// few words of the text; the text itself is never kept.
export function errorKind(row) {
  if (row?.role !== "error") return null;
  const kind = row.meta?.kind;
  if (kind === "usage_limit") return "credits";
  if (kind === "model_unavailable") return "rate";
  const text = String(row.content ?? row.text ?? "").slice(0, 4000);
  if (/out of credits|insufficient credits|usage limit|quota/i.test(text))
    return "credits";
  if (/\b429\b|rate[ -]?limit|too many requests|throttl/i.test(text))
    return "rate";
  return null;
}

// Mark health from one session's new rows (R72.3). Out of credits marks the
// provider; a rate limit marks the model low, and a second one inside its
// cooldown marks it out. A session on `auto` marks nothing.
export function ingestProviderErrors(store, binding, rows, options = {}) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const errors = rows
    .map((row) => ({ kind: errorKind(row), at: row?.ts }))
    .filter((e) => e.kind && typeof e.at === "string" && e.at);
  if (!errors.length) return 0;
  const settings = options.settings ?? readProviders(store, options).settings,
    cooldown = COOLDOWN_MS,
    model = binding.served?.model || binding.model || null,
    provider = providerOf(model, settings);
  if (!provider) return 0;
  let marked = 0;
  store.transaction(() => {
    for (const { kind, at } of errors.sort((a, b) => (a.at < b.at ? -1 : 1))) {
      const scope = kind === "credits" ? "provider" : "model",
        name = scope === "provider" ? provider : model,
        id = `error:${scope}:${name}`,
        current = store.get(HEALTH, id);
      if (current && current.lastErrorAt >= at) continue;
      const repeat =
        current?.level === "low" && Date.parse(current.until) >= Date.parse(at);
      store.put(HEALTH, {
        id,
        scope,
        name,
        level: kind === "credits" || repeat ? "out" : "low",
        source: "error",
        kind: kind === "credits" ? "credits" : "rate-limit",
        since: current?.since ?? at,
        lastErrorAt: at,
        until: iso(Date.parse(at) + cooldown),
        slot: binding.slot,
      });
      marked += 1;
    }
  });
  return marked;
}

// A person's mark (R72.13) and its undo (R72.4).
function markByPerson(store, { scope, name, to, by, now }) {
  store.put(HEALTH, {
    id: `person:${scope}:${name}`,
    scope,
    name,
    level: "out",
    source: "person",
    kind: "person",
    to,
    by,
    since: iso(now),
  });
}

export function clearMark(store, input = {}) {
  const id = typeof input.id === "string" ? input.id : "";
  const mark = id && store.get(HEALTH, id);
  if (!mark) fail("No such health mark.", 404);
  store.transaction(() => store.remove(HEALTH, id));
  return { cleared: id };
}

// -------------------------------------------------------------- switches

// The activity log hook (R72.10): one `model.switch` row per finished
// switch record, keyed by its ID so a record is logged once. A log that
// cannot be written never loses the switch record itself.
const SWITCH_WORDS = {
  switched: (e) =>
    `Switched ${e.taskId}'s ${e.role} chat from ${e.from} to ${e.to}`,
  deferred: (e) =>
    `Switching ${e.taskId}'s ${e.role} chat from ${e.from} to ${e.to} at its next turn`,
  refused: (e) =>
    `Kiro Crew refused to switch ${e.taskId}'s ${e.role} chat from ${e.from} to ${e.to}`,
  "no target": (e) =>
    `${e.taskId}'s ${e.role} chat stayed on ${e.from}: no healthy model`,
  skipped: (e) => `Skipped switching ${e.taskId}: the chat ended or moved`,
};

export function onSwitchRecorded(store, entry) {
  const words = SWITCH_WORDS[entry.result];
  if (!words) return;
  try {
    recordActivity(store, {
      source: "local",
      actor: entry.by === "auto" ? "avoozl" : entry.by,
      kind: "model.switch",
      summary: words(entry),
      targetId: entry.taskId,
      key: `provider-switch:${entry.id}`,
      at: entry.at,
    });
  } catch {}
}

export function listSwitches(store) {
  try {
    return store
      .list(SWITCHES)
      .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  } catch {
    return [];
  }
}

function putSwitch(store, entry) {
  store.put(SWITCHES, entry);
  if (entry.state !== "pending") onSwitchRecorded(store, entry);
  return entry;
}

const writerOf = (store, binding) =>
  listSessionBindings(store)
    .filter(
      (b) =>
        b.taskId === binding.taskId &&
        b.role === "worker" &&
        b.report?.kind === "done",
    )
    .sort((a, b) => b.attempt - a.attempt)[0] ?? null;

// Every model a session ran on: its first, then each switch (R72.11).
export const modelsOf = (binding) =>
  [
    binding?.switches?.[0]?.from ?? binding?.model,
    ...(binding?.switches || []).map((s) => s.to),
    binding?.model,
  ].filter((m, i, all) => m && all.indexOf(m) === i);

// Models a session must not be moved to (R72.9): a writer never takes a
// review role's model, and a review role whose distinctFrom is `model`
// never takes one the writer ran on.
function forbidden(store, binding, reviewRoles) {
  if (binding.role === "worker")
    return reviewRoles
      .filter((r) => r.distinctFrom === "model" && r.model)
      .map((r) => r.model);
  const id = String(binding.role || "").startsWith("review:")
      ? binding.role.slice(7)
      : null,
    role = id && reviewRoles.find((r) => r.id === id);
  return role?.distinctFrom === "model"
    ? modelsOf(writerOf(store, binding))
    : [];
}

// The healthy model a chat moves to (R72.9), or null.
export function switchTarget(store, binding, health, options = {}) {
  const blocked = new Set([
      ...forbidden(store, binding, options.reviewRoles || []),
      binding.model,
    ]),
    candidates = [
      health.replacement(binding.model),
      ...(options.choices || []),
    ].filter((m, i, all) => m && all.indexOf(m) === i && !blocked.has(m));
  return (
    candidates.find((m) => health.level(m) === "ok") ??
    candidates.find((m) => health.level(m) === "low") ??
    null
  );
}

// A function that lists the models Kiro Crew offers (GET /api/models,
// F128, granted in app.json), or null without a gateway client.
export function gatewayModelList(client) {
  if (!client) return null;
  return async () => {
    const response = await client.call("/api/models", { method: "GET" });
    if (!response.ok)
      throw Error(`Kiro Crew refused the model list (${response.status}).`);
    const body = await response.json();
    return Array.isArray(body)
      ? body
      : Array.isArray(body?.models)
        ? body.models
        : [];
  };
}

// A function that asks Kiro Crew to change one chat's model (F126), or null
// without a gateway client. Answers {status, ok, deferred}.
export function gatewayModelSwitcher(client) {
  if (!client) return null;
  return async (slot, model) => {
    const response = await client.call(
      `/api/chat/slots/${encodeURIComponent(slot)}/model`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model }),
      },
    );
    let body = null;
    try {
      body = await response.json();
    } catch {}
    return {
      status: response.status,
      ok: response.ok && body?.ok !== false,
      deferred: body?.deferred === true,
    };
  };
}

const liveTick = (b) =>
  b.source === "tick" &&
  !["closed", "lost", "gone"].includes(b.status) &&
  !["done", "blocked"].includes(b.report?.kind);

// The backend pass (R72.8–R72.10, R72.14): apply a person's pending
// switches, then move every live chat Avoozl opened off an `out` model.
// `choicesFor(binding)` gives the task's own models in order. Never stops,
// restarts or closes a session.
export async function applySwitches(store, switcher, options = {}) {
  const health = options.health ?? healthContext(store, options),
    reviewRoles = options.reviewRoles ?? (() => []),
    now = options.now ?? Date.now(),
    results = [];
  if (!switcher) return results;
  const pending = listSwitches(store).filter((s) => s.state === "pending");
  const run = async (binding, entry) => {
    let answer;
    try {
      answer = await switcher(binding.slot, entry.to);
    } catch (error) {
      answer = { ok: false, status: 0, error: error.message };
    }
    const at = iso(now),
      result = answer.ok
        ? answer.deferred
          ? "deferred"
          : "switched"
        : "refused";
    store.transaction(() => {
      const current = store.get("session_bindings", binding.slot) || binding;
      store.put(
        "session_bindings",
        answer.ok
          ? {
              ...current,
              model: entry.to,
              switches: [
                ...(current.switches || []),
                { from: entry.from, to: entry.to, at, by: entry.by },
              ],
            }
          : {
              ...current,
              switchRefused: [...(current.switchRefused || []), entry.from],
            },
      );
      results.push(
        putSwitch(store, {
          ...entry,
          state: "done",
          result,
          status: answer.status ?? null,
          at,
        }),
      );
    });
  };
  const bindings = new Map(listSessionBindings(store).map((b) => [b.slot, b]));
  for (const entry of pending) {
    const binding = bindings.get(entry.slot);
    if (!binding || !liveTick(binding) || binding.model !== entry.from) {
      results.push(
        putSwitch(store, {
          ...entry,
          state: "done",
          result: "skipped",
          at: iso(now),
        }),
      );
      continue;
    }
    await run(binding, entry);
  }
  for (const binding of listSessionBindings(store)) {
    const from = binding.model;
    if (
      !liveTick(binding) ||
      !from ||
      health.level(from) !== "out" ||
      (binding.switchRefused || []).includes(from)
    )
      continue;
    const to = switchTarget(store, binding, health, {
        reviewRoles: reviewRoles(binding),
        choices: options.choicesFor?.(binding) ?? [],
      }),
      base = {
        slot: binding.slot,
        taskId: binding.taskId,
        role: binding.role,
        from,
        by: "auto",
        reason: `${from} is out`,
      };
    if (!to) {
      const id = `auto:${binding.slot}:${from}:no-target`;
      if (!store.get(SWITCHES, id))
        results.push(
          putSwitch(store, {
            ...base,
            id,
            to: null,
            state: "done",
            result: "no target",
            at: iso(now),
          }),
        );
      continue;
    }
    await run(binding, { ...base, id: randomUUID(), to });
  }
  return results;
}

// ------------------------------------------------------- manual switches

// The live chats a manual switch reaches (R72.12): {chats, skipped, hash}.
export function switchPreview(store, input = {}, options = {}) {
  const from = record(input.from) ? input.from : fail("Choose From.");
  const to = modelName(input.to, "To");
  const settings = options.settings ?? readProviders(store, options).settings,
    reviewRoles = options.reviewRoles ?? (() => []);
  let match;
  if (typeof from.provider === "string" && from.provider)
    match = (b) => providerOf(b.model, settings) === from.provider;
  else if (typeof from.model === "string" && from.model)
    match = (b) => b.model === from.model;
  else if (
    Array.isArray(from.tasks) &&
    from.tasks.length &&
    from.tasks.length <= 200 &&
    from.tasks.every((t) => typeof t === "string")
  )
    match = (b) => from.tasks.includes(b.taskId);
  else fail("From is a provider, a model, or a list of tasks.");
  const chats = [],
    skipped = [];
  for (const b of listSessionBindings(store)) {
    if (!liveTick(b) || !match(b)) continue;
    const row = {
      slot: b.slot,
      taskId: b.taskId,
      role: b.role,
      model: b.model ?? null,
    };
    if (!b.model) skipped.push({ ...row, why: "runs on auto" });
    else if (b.model === to) skipped.push({ ...row, why: `already on ${to}` });
    else if (forbidden(store, b, reviewRoles(b)).includes(to))
      skipped.push({
        ...row,
        why:
          b.role === "worker"
            ? `${to} is a review role's model`
            : `the writer ran on ${to}`,
      });
    else chats.push(row);
  }
  chats.sort((a, b) => a.slot.localeCompare(b.slot));
  const hash = createHash("sha256")
    .update(JSON.stringify({ from, to, chats }))
    .digest("hex");
  return { from, to, chats, skipped, previewHash: hash };
}

// A person's switch (R72.13, R72.14): one pending record per chat, applied
// by the backend pass; with alsoNewTasks, the From marked out until undone.
export function queueSwitch(store, input = {}, options = {}) {
  const preview = switchPreview(store, input, options),
    now = options.now ?? Date.now(),
    by = options.by || "person";
  if (input.previewHash !== preview.previewHash)
    fail("The running chats changed since the preview; preview again.", 409);
  const settings = options.settings ?? readProviders(store, options).settings;
  const queued = [];
  store.transaction(() => {
    for (const chat of preview.chats)
      queued.push(
        putSwitch(store, {
          id: randomUUID(),
          slot: chat.slot,
          taskId: chat.taskId,
          role: chat.role,
          from: chat.model,
          to: preview.to,
          by,
          reason: "Switch model",
          state: "pending",
          at: iso(now),
        }),
      );
    if (input.alsoNewTasks === true) {
      const marks = preview.from.provider
        ? [{ scope: "provider", name: preview.from.provider }]
        : preview.from.model
          ? [{ scope: "model", name: preview.from.model }]
          : [
              ...new Set(
                [...preview.chats, ...preview.skipped]
                  .map((c) => c.model)
                  .filter((m) => m && m !== preview.to),
              ),
            ].map((name) => ({ scope: "model", name }));
      for (const mark of marks)
        if (
          mark.scope !== "provider" ||
          mark.name !== providerOf(preview.to, settings)
        )
          markByPerson(store, { ...mark, to: preview.to, by, now });
    }
  });
  return { queued: queued.length, switches: queued, to: preview.to };
}

// ------------------------------------------------------------------ views

// Provider facts, read live (R72.1, R72.2): one row per provider or model
// that has usage, a limit or a mark, with its level, percent used and one
// line the routing agent reads, such as "claude: 85% used, low". `models`
// adds the providers of models Kiro Crew lists.
export function providerFacts(store, health, options = {}) {
  const usage = usageReport(store, { ...options, settings: health.settings }),
    keys = [
      ...new Set([
        ...usage.map((u) => u.key),
        ...health.marks.map((m) => m.name),
        ...(options.models || []).map((m) => providerOf(m)).filter(Boolean),
      ]),
    ].sort();
  return keys.map((key) => {
    const row = usage.find((u) => u.key === key),
      level = health.level(key),
      marks = health.marks.filter((m) => m.name === key),
      why = marks.find((m) => m.level === level)?.kind ?? null,
      used =
        row?.percent != null
          ? `${row.percent}% used`
          : row
            ? `${Math.round(row.credits * 10) / 10} credits, ${row.tokens} tokens in 5 h`
            : null;
    return {
      provider: key,
      level,
      percent: row?.percent ?? null,
      credits: row?.credits ?? 0,
      tokens: row?.tokens ?? 0,
      limit: row?.limit ?? null,
      why,
      line: [`${key}: ${used ?? "no usage"}`, level]
        .concat(why && level !== "ok" ? [why] : [])
        .join(", "),
    };
  });
}

export function providersView(store, options = {}) {
  const { settings, hash } = readProviders(store, options),
    health = healthContext(store, { ...options, settings });
  return {
    settings,
    hash,
    defaults: PROVIDER_DEFAULTS,
    providers: providerFacts(store, health, options),
    marks: health.marks.map((m) => ({ ...m })),
    switches: listSwitches(store).slice(0, 50),
    chats: listSessionBindings(store)
      .filter(liveTick)
      .map((b) => ({
        slot: b.slot,
        taskId: b.taskId,
        role: b.role,
        model: b.model ?? null,
        provider: providerOf(b.model, settings),
        level: health.level(b.model),
      })),
  };
}

// Needs you (R72.16): one item per `out` mark, gone when it clears.
export function providerOutItems(store, options = {}) {
  let health;
  try {
    health = healthContext(store, options);
  } catch {
    return [];
  }
  const switches = listSwitches(store);
  return health.marks
    .filter((m) => m.level === "out")
    .map((mark) => {
      const moved = switches.filter(
          (s) =>
            ["switched", "deferred"].includes(s.result) &&
            s.at >= mark.since &&
            applies(mark, s.from, providerOf(s.from, health.settings)),
        ),
        stuck = switches.filter(
          (s) =>
            s.result === "no target" &&
            applies(mark, s.from, providerOf(s.from, health.settings)),
        ),
        targets = [...new Set(moved.map((s) => s.to))];
      const why =
        mark.source === "person"
          ? `Marked out by ${mark.by || "a person"}; new tasks use ${mark.to}. Undo it in Settings › Routing.`
          : mark.source === "usage"
            ? `It used ${mark.percent}% of its limit in the window.`
            : mark.kind === "credits"
              ? "A chat ran out of credits."
              : "Chats hit rate limits.";
      return {
        kind: "provider-out",
        id: mark.id,
        taskId: null,
        title: `${mark.scope === "model" ? "Model" : "Provider"} ${mark.name} is out`,
        detail: [
          why,
          moved.length
            ? `Switched ${moved.length} running chat${moved.length === 1 ? "" : "s"} to ${targets.join(", ")}.`
            : null,
          stuck.length
            ? `${stuck.length} chat${stuck.length === 1 ? "" : "s"} stayed on it: no healthy model to switch to.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        source: mark.source,
        openedAt: mark.since,
      };
    });
}
