// Placement settings and hard checks (design §4.10, R41, R53). Off by
// default: every session runs on `local`, as before. On, one routing prompt
// tells the routing agent how to choose; the hard checks here decide what it
// may choose from. Everything here is pure: callers pass crews and facts.
import { fail } from "./store.mjs";
import { isCrewId, LOCAL, tagError } from "./crews.mjs";
import { refuseTrackedProviders } from "./provider-health.mjs";

export const PLACED_ROLES = Object.freeze(["worker", "checks", "reviewer"]);
export const ROUTER_TIMEOUT_SECONDS = 90;
export const PROMPT_LIMIT = 4000;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
// Keys the rule-based routing used (removed 2026-11-13). A file that still
// holds one is refused with the one-time migration's name.
export const OLD_ROUTING_KEYS = Object.freeze(["rules", "pick", "router"]);
export const MIGRATE =
  "node scripts/migrate-routing.mjs <file> (rules, presets and the router became one routing prompt)";

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// The placed role for a binding role: worker, checks, reviewer, or null for
// roles that always stay local (planner, critic, responder, retro, …).
export function placedRole(role) {
  if (role === "worker") return "worker";
  if (role === "verifier") return "checks";
  if (typeof role === "string" && role.startsWith("review:")) return "reviewer";
  return null;
}

// ---------------------------------------------------------------------------
// Validation. Every bad key is named in one error (P33 action 6).

// A manifest task's `session` (R53.1): a pin that wins over the routing
// prompt. {agent?, model?, crew?}. Throws.
export function validateSession(value, at = "session") {
  const errors = [];
  if (!record(value)) fail(`${at} must be an object.`);
  for (const key of Object.keys(value))
    if (key === "choices")
      errors.push(
        `${at}.choices was removed: pin one model, or let the routing prompt spread tasks.`,
      );
    else if (!["agent", "model", "crew"].includes(key))
      errors.push(`${at}.${key} is not a session setting.`);
  for (const key of ["agent", "model"])
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || !NAME.test(value[key]))
    )
      errors.push(
        `${at}.${key} must be ${key === "agent" ? "an agent" : "a model"} name.`,
      );
  if (value.crew !== undefined && !isCrewId(value.crew))
    errors.push(`${at}.crew must be a crew id.`);
  if (errors.length) fail(errors.join(" "));
  return value;
}

// A manifest task's `needs` (R41.2): crew tags its work requires, such as
// os:windows or tools:docker. Throws.
export function validateNeeds(value, at = "needs") {
  if (!Array.isArray(value) || value.length > 20)
    fail(`${at} must be a list of at most 20 crew tags.`);
  const errors = value
    .map((tag, i) => tagError(tag, `${at}[${i}]`))
    .filter(Boolean);
  if (errors.length) fail(errors.join(" "));
  return value;
}

// `routing` from one source. Only this machine's settings hold the prompt
// (R41.7): it may name private machines. A tracked file holds no routing
// key of its own. Returns the value; throws one error naming each bad key.
export function validateRouting(
  value,
  { at = "routing", tracked = true } = {},
) {
  if (value === undefined || value === null) return null;
  if (!record(value)) fail(`${at} must be an object.`);
  const errors = [];
  const old = Object.keys(value).filter((k) => OLD_ROUTING_KEYS.includes(k));
  if (old.length)
    errors.push(`${at}.${old.join(", ")}: old routing keys; run ${MIGRATE}.`);
  for (const key of Object.keys(value)) {
    if (OLD_ROUTING_KEYS.includes(key)) continue;
    if (tracked)
      errors.push(
        ["enabled", "prompt", "model"].includes(key)
          ? `${at}.${key} may live only in this machine's settings, never in a tracked .avoozl.json.`
          : `${at}.${key} is not a routing setting.`,
      );
    else if (!["enabled", "prompt", "model"].includes(key))
      errors.push(`${at}.${key} is not a routing setting.`);
  }
  if (!tracked) {
    if (value.enabled !== undefined && typeof value.enabled !== "boolean")
      errors.push(`${at}.enabled must be true or false.`);
    if (
      value.prompt !== undefined &&
      (typeof value.prompt !== "string" ||
        value.prompt.length > PROMPT_LIMIT ||
        /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value.prompt))
    )
      errors.push(
        `${at}.prompt must be at most ${PROMPT_LIMIT} printable characters.`,
      );
    if (
      value.model !== undefined &&
      value.model !== null &&
      (typeof value.model !== "string" || !NAME.test(value.model))
    )
      errors.push(`${at}.model must be a model name.`);
  }
  if (errors.length) fail(errors.join(" "));
  return value;
}

// The tracked file's routing: no `routing`, no `projects.<id>.routing`, no
// `providers`. Throws.
export function validateTrackedRouting(config) {
  refuseTrackedProviders(config);
  validateRouting(config?.routing, { at: "routing", tracked: true });
  for (const [id, project] of Object.entries(
    record(config?.projects) ? config.projects : {},
  ))
    if (record(project) && project.routing !== undefined)
      fail(`projects.${id}.routing: old routing keys; run ${MIGRATE}.`);
}

// This machine's routing settings, with defaults. Off unless turned on, and
// on only with a prompt to follow.
export function routingConfig({ machine = {} } = {}) {
  const own = machine.routing || {},
    prompt = typeof own.prompt === "string" ? own.prompt : "";
  return {
    enabled: own.enabled === true && prompt.trim().length > 0,
    switchedOn: own.enabled === true,
    prompt,
    model: own.model ?? null,
    timeoutSeconds: ROUTER_TIMEOUT_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Facts about one task, given to the routing agent as data.

// What one task offers: labels (issue labels for GitHub tasks, manifest
// labels for local ones), its type word, repository, plan category, paths,
// and the crew tags it needs.
export function subjectOf(task, data, role) {
  const document = data?.documents?.[task.contextDocuments?.[0]];
  return {
    labels: [
      ...new Set([
        ...(task.labels || []),
        ...(task.github?.labels || []).map((l) => l?.name ?? l),
      ]),
    ],
    kind: task.type || task.kind || "leaf",
    role,
    repository: task.repository ?? task.projectId ?? null,
    category: document?.plan?.category ?? null,
    paths: task.paths || [],
    needs: task.needs || [],
  };
}

// ---------------------------------------------------------------------------
// Hard checks (§4.10). They run before the routing agent, so it can only
// choose among crews and models that passed. Each check removes; nothing
// here widens.

// `crews` from listCrews. `checks`: {role, pin, needs, agent,
// remoteDispatch, canOpenRemote, contentForbids, fetchable(crew) ->
// null|reason}. Returns
// {allowed: [crew ids], removed: [{crew, by}], busy: [crew ids]}: `removed`
// failed a check that does not pass by waiting; `busy` would take the
// session once a chat frees or a fresh reading arrives.
export function crewChecks(crews, checks = {}) {
  const removed = [],
    busy = [],
    allowed = [];
  for (const crew of crews) {
    const local = crew.id === LOCAL,
      why = staticWhy(crew, local, checks);
    if (why) removed.push({ crew: crew.id, by: why });
    else if (!crew.available) {
      busy.push(crew.id);
      removed.push({ crew: crew.id, by: crew.why });
    } else allowed.push(crew.id);
  }
  return { allowed, removed, busy };
}

function staticWhy(crew, local, checks) {
  if (checks.pin && checks.pin !== crew.id)
    return `the task pins crew ${checks.pin}`;
  // Checks and review sessions run where the commit is (§4.10).
  if (!local && checks.role && checks.role !== "worker")
    return "checks and reviews run on this machine, where the commit is";
  const missing = (checks.needs || []).filter((t) => !crew.tags.includes(t));
  if (missing.length) return `lacks ${missing.join(", ")}`;
  if (checks.agent && crew.agents && !crew.agents.includes(checks.agent))
    return "agent not installed";
  if (local) return null;
  if (!checks.remoteDispatch) return "Kiro Crew's remote dispatch is off";
  if (crew.ready === false)
    return "would stall on tool approvals (approvals are not automatic)";
  if (crew.ready !== true) return "approval mode unknown";
  if (checks.contentForbids)
    return `content rule set ${checks.contentForbids} forbids remote crews`;
  const fetch = checks.fetchable?.(crew);
  if (fetch) return fetch;
  if (checks.canOpenRemote === false)
    return "remote placement waits on Kiro Crew (MC-10)";
  return null;
}

// The models a worker may run on: the pin alone, else the default and the
// models Kiro Crew lists, minus `out` ones and a review role's model
// (R53.7, R72.5). `low` stays: it is a fact the prompt weighs. Returns
// {models: [names, null for the default], removed: [{model, by}]}.
export function modelChecks({
  pin = null,
  fallback = null,
  listed = [],
  health = null,
  skipModels = [],
}) {
  const removed = [],
    out = (m) => Boolean(m && health && health.level(m) === "out");
  const candidates = pin
    ? [pin]
    : [fallback, ...listed].filter(
        (m, i, all) => all.indexOf(m) === i && m !== "auto",
      );
  const models = [];
  for (const model of candidates) {
    if (out(model)) {
      removed.push({ model, by: `${model} is out` });
      // A person's Switch model with Also new tasks names the replacement.
      const to = health.replacement?.(model);
      if (to && !out(to) && !skipModels.includes(to) && !models.includes(to))
        models.push(to);
    } else if (model && skipModels.includes(model))
      removed.push({ model, by: `${model} is a review role's model` });
    else if (!models.includes(model)) models.push(model);
  }
  return { models, removed };
}

export const sameCrew = (a, b) => (a || LOCAL) === (b || LOCAL);
