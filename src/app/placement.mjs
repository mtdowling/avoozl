// Crew placement and per-session agent and model (design §4.10, R41, R53).
// The route says what does the work; placement says which crew runs a
// session Avoozl opens itself, and `session` which agent and model it runs.
// Everything here is pure: callers pass rules, crews, and what is running.
import { fail } from "./store.mjs";
import { isCrewId, LOCAL, tagError } from "./crews.mjs";
import { isSource, pluginId } from "../work-model.mjs";
import { healthyChoices, refuseTrackedProviders } from "./provider-health.mjs";

export const PLACED_ROLES = Object.freeze(["worker", "checks", "reviewer"]);
export const PRESETS = Object.freeze({
  balanced: {
    slots: 1,
    memory: 1,
    disk: 0.5,
    load: 1,
    avoozl: 0.5,
    local: 0.25,
  },
  "keep-local": {
    slots: 1,
    memory: 1,
    disk: 0.5,
    load: 1,
    avoozl: 0.5,
    local: 10,
  },
  "spread-out": {
    slots: 2,
    memory: 1,
    disk: 0.5,
    load: 1,
    avoozl: 2,
    local: 0,
  },
});
export const WEIGHT_KEYS = Object.keys(PRESETS.balanced);
export const ROUTER_TIMEOUT_SECONDS = 90;
const RULE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const AGENT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const WHEN_KEYS = [
  "labels",
  "kinds",
  "roles",
  "repositories",
  "categories",
  "paths",
];
const RULE_KEYS = [
  "id",
  "when",
  "route",
  "on",
  "requireTags",
  "forbidTags",
  "keepLocal",
  "session",
];

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

function sessionErrors(value, at, errors) {
  if (!record(value)) return errors.push(`${at} must be an object.`);
  const keys = Object.keys(value);
  if ("choices" in value) {
    for (const key of keys)
      if (key !== "choices")
        errors.push(`${at}.${key}: use choices alone, or agent and model.`);
    if (
      !Array.isArray(value.choices) ||
      value.choices.length < 1 ||
      value.choices.length > 10
    )
      errors.push(`${at}.choices must list 1–10 choices.`);
    (Array.isArray(value.choices) ? value.choices : []).forEach((choice, i) => {
      const where = `${at}.choices[${i}]`;
      if (!record(choice)) return errors.push(`${where} must be an object.`);
      for (const key of Object.keys(choice))
        if (!["agent", "model", "weight"].includes(key))
          errors.push(`${where}.${key} is not a choice setting.`);
      nameErrors(choice, where, errors);
      if (
        choice.weight !== undefined &&
        (!Number.isInteger(choice.weight) ||
          choice.weight < 1 ||
          choice.weight > 100)
      )
        errors.push(`${where}.weight must be a whole number 1–100.`);
    });
    return;
  }
  for (const key of keys)
    if (!["agent", "model"].includes(key))
      errors.push(`${at}.${key} is not a session setting.`);
  nameErrors(value, at, errors);
}

function nameErrors(value, at, errors) {
  if (
    value.agent !== undefined &&
    (typeof value.agent !== "string" || !AGENT.test(value.agent))
  )
    errors.push(`${at}.agent must be an agent name.`);
  if (
    value.model !== undefined &&
    (typeof value.model !== "string" || !MODEL.test(value.model))
  )
    errors.push(`${at}.model must be a model name.`);
}

// A manifest task's `session` (R53.1). Throws.
export function validateSession(value, at = "session") {
  const errors = [];
  sessionErrors(value, at, errors);
  if (errors.length) fail(errors.join(" "));
  return value;
}

function listOfStrings(value, at, errors, max = 50) {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((x) => typeof x !== "string" || !x || x.length > 200)
  )
    errors.push(`${at} must be a list of at most ${max} names.`);
}

// `routing` from one source. `tracked` is a file in a repository: it may not
// pin a crew or hold router instructions (R41.2, R41.7). `pluginIds` are the
// loaded route plugins a rule may name. Returns the value; throws one error
// naming each bad key.
export function validateRouting(
  value,
  { at = "routing", tracked = true, pluginIds = null } = {},
) {
  if (value === undefined) return null;
  const errors = [];
  if (!record(value)) fail(`${at} must be an object.`);
  for (const key of Object.keys(value))
    if (!["rules", "pick", "router", "remoteRelay"].includes(key))
      errors.push(`${at}.${key} is not a routing setting.`);
  // The Remote relay (R41.16) is one setting per workspace, in its tracked
  // .avoozl.json; a repository or this machine cannot turn it on.
  if (value.remoteRelay !== undefined) {
    if (!tracked || at !== "routing")
      errors.push(
        `${at}.remoteRelay is a workspace setting; set routing.remoteRelay in the workspace's .avoozl.json.`,
      );
    else if (!["off", "on"].includes(value.remoteRelay))
      errors.push(`${at}.remoteRelay must be off or on.`);
  }
  const seen = new Set();
  if (
    value.rules !== undefined &&
    (!Array.isArray(value.rules) || value.rules.length > 100)
  )
    errors.push(`${at}.rules must be a list of at most 100 rules.`);
  (Array.isArray(value.rules) ? value.rules : []).forEach((rule, i) => {
    const where = `${at}.rules[${i}]`;
    if (!record(rule)) return errors.push(`${where} must be an object.`);
    for (const key of Object.keys(rule))
      if (!RULE_KEYS.includes(key))
        errors.push(`${where}.${key} is not a rule setting.`);
    if (typeof rule.id !== "string" || !RULE_ID.test(rule.id))
      errors.push(
        `${where}.id is required: lowercase letters, digits, or '-'.`,
      );
    else if (seen.has(rule.id))
      errors.push(`${where}.id ${rule.id} is repeated.`);
    else seen.add(rule.id);
    if (rule.when !== undefined) {
      if (!record(rule.when)) errors.push(`${where}.when must be an object.`);
      else
        for (const [key, list] of Object.entries(rule.when)) {
          if (!WHEN_KEYS.includes(key)) {
            errors.push(`${where}.when.${key} is not a match key.`);
            continue;
          }
          listOfStrings(list, `${where}.when.${key}`, errors);
          if (key === "roles" && Array.isArray(list))
            for (const role of list)
              if (!PLACED_ROLES.includes(role))
                errors.push(
                  `${where}.when.roles: ${role} is not worker, checks, or reviewer.`,
                );
        }
    }
    if (rule.route !== undefined) {
      if (!isSource(rule.route))
        errors.push(`${where}.route must be local, github, or plugin:<id>.`);
      else if (
        pluginIds &&
        pluginId(rule.route) &&
        !pluginIds.includes(pluginId(rule.route))
      )
        errors.push(
          `${where}.route names plugin ${pluginId(rule.route)}, which is not loaded.`,
        );
    }
    if (rule.on !== undefined) {
      if (typeof rule.on !== "string" || !rule.on)
        errors.push(
          `${where}.on must be local, any, tags:<tag>,…, or a crew id.`,
        );
      else if (rule.on.startsWith("tags:")) {
        const tags = rule.on.slice(5).split(",").filter(Boolean);
        if (!tags.length) errors.push(`${where}.on names no tags.`);
        tags.forEach((tag) => {
          const error = tagError(tag, `${where}.on`);
          if (error) errors.push(error);
        });
      } else if (!["local", "any"].includes(rule.on)) {
        if (tracked)
          errors.push(
            `${where}.on names crew ${rule.on}; pin a crew only in this machine's settings, so no machine name lands in a repository.`,
          );
        else if (!isCrewId(rule.on))
          errors.push(`${where}.on is not a crew id.`);
      }
    }
    for (const key of ["requireTags", "forbidTags"])
      if (rule[key] !== undefined) {
        if (!Array.isArray(rule[key]) || rule[key].length > 20)
          errors.push(`${where}.${key} must be a list of tags.`);
        else
          rule[key].forEach((tag, j) => {
            const error = tagError(tag, `${where}.${key}[${j}]`);
            if (error) errors.push(error);
          });
      }
    if (rule.keepLocal !== undefined && typeof rule.keepLocal !== "boolean")
      errors.push(`${where}.keepLocal must be true or false.`);
    if (rule.session !== undefined)
      sessionErrors(rule.session, `${where}.session`, errors);
  });
  if (value.pick !== undefined) {
    const pick = value.pick;
    if (!record(pick)) errors.push(`${at}.pick must be an object.`);
    else {
      for (const key of Object.keys(pick))
        if (!["preset", "weights"].includes(key))
          errors.push(`${at}.pick.${key} is not a smart pick setting.`);
      if (pick.preset !== undefined && !(pick.preset in PRESETS))
        errors.push(
          `${at}.pick.preset must be ${Object.keys(PRESETS).join(", ")}.`,
        );
      if (pick.weights !== undefined) {
        if (!record(pick.weights))
          errors.push(`${at}.pick.weights must be an object.`);
        else
          for (const [key, n] of Object.entries(pick.weights))
            if (!WEIGHT_KEYS.includes(key))
              errors.push(`${at}.pick.weights.${key} is not a weight.`);
            else if (
              typeof n !== "number" ||
              !Number.isFinite(n) ||
              n < 0 ||
              n > 100
            )
              errors.push(`${at}.pick.weights.${key} must be a number 0–100.`);
      }
    }
  }
  if (value.router !== undefined) {
    const router = value.router;
    if (!record(router)) errors.push(`${at}.router must be an object.`);
    else {
      for (const key of Object.keys(router))
        if (
          !["enabled", "model", "timeoutSeconds", "instructions"].includes(key)
        )
          errors.push(`${at}.router.${key} is not a router setting.`);
      if (router.enabled !== undefined && typeof router.enabled !== "boolean")
        errors.push(`${at}.router.enabled must be true or false.`);
      if (
        router.model !== undefined &&
        router.model !== null &&
        (typeof router.model !== "string" || !MODEL.test(router.model))
      )
        errors.push(`${at}.router.model must be a model name.`);
      if (
        router.timeoutSeconds !== undefined &&
        (!Number.isInteger(router.timeoutSeconds) ||
          router.timeoutSeconds < 10 ||
          router.timeoutSeconds > 600)
      )
        errors.push(
          `${at}.router.timeoutSeconds must be a whole number 10–600.`,
        );
      if (router.instructions !== undefined) {
        if (tracked)
          errors.push(
            `${at}.router.instructions may live only in this machine's settings, never in a tracked .avoozl.json.`,
          );
        else if (
          typeof router.instructions !== "string" ||
          router.instructions.length > 4000 ||
          /[\u0000-\u0008\u000b-\u001f\u007f]/.test(router.instructions)
        )
          errors.push(
            `${at}.router.instructions must be at most 4000 printable characters.`,
          );
      }
    }
  }
  if (errors.length) fail(errors.join(" "));
  return value;
}

// The tracked file's routing: the workspace's `routing` and each
// repository's `projects.<id>.routing`. Throws.
export function validateTrackedRouting(config, options = {}) {
  refuseTrackedProviders(config);
  validateRouting(config?.routing, {
    ...options,
    at: "routing",
    tracked: true,
  });
  for (const [id, project] of Object.entries(
    record(config?.projects) ? config.projects : {},
  ))
    if (record(project) && project.routing !== undefined)
      validateRouting(project.routing, {
        ...options,
        at: `projects.${id}.routing`,
        tracked: true,
      });
}

// The rules in checking order: workspace, then each repository's (for its
// own tasks only), then this machine's (§4.10 Rules), each with its source.
// `pick` and `router` come from this machine first, then the workspace.
export function routingConfig({ workspace = {}, machine = {} } = {}) {
  const rules = [
    ...(workspace.routing?.rules || []).map((rule) => ({
      ...rule,
      source: "workspace",
    })),
  ];
  for (const [id, project] of Object.entries(
    record(workspace.projects) ? workspace.projects : {},
  ))
    for (const rule of project?.routing?.rules || [])
      rules.push({ ...rule, source: "repository", repository: id });
  rules.push(
    ...(machine.routing?.rules || []).map((rule) => ({
      ...rule,
      source: "machine",
    })),
  );
  const pick = machine.routing?.pick || workspace.routing?.pick || {},
    router = {
      enabled: false,
      model: null,
      timeoutSeconds: ROUTER_TIMEOUT_SECONDS,
      ...(workspace.routing?.router || {}),
      ...(machine.routing?.router || {}),
    };
  return {
    rules,
    pick,
    weights: weightsOf(pick),
    router,
    // Off unless the workspace turns it on (R41.16).
    remoteRelay: workspace.routing?.remoteRelay === "on" ? "on" : "off",
    // Any rule at all, from any source, opts this workspace in (R41.3).
    active: rules.length > 0,
  };
}

export function weightsOf(pick = {}) {
  return { ...PRESETS[pick.preset || "balanced"], ...(pick.weights || {}) };
}

// The preset a weight set equals, else "custom".
export function presetOf(pick = {}) {
  if (!pick.weights) return pick.preset || "balanced";
  const weights = weightsOf(pick);
  return (
    Object.entries(PRESETS).find(([, w]) =>
      WEIGHT_KEYS.every((k) => w[k] === weights[k]),
    )?.[0] ?? "custom"
  );
}

// ---------------------------------------------------------------------------
// Matching.

// A minimal glob: `**` any path, `*` any part of one segment, `?` one char.
export function globMatch(glob, file) {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      pattern += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") pattern += "[^/]*";
    else if (c === "?") pattern += "[^/]";
    else pattern += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`).test(file);
}

// Does `rule` match one session? `subject`: {labels, kind, role,
// repository, category, paths}. All listed keys must match (§4.10).
export function ruleMatches(rule, subject) {
  if (rule.source === "repository" && rule.repository !== subject.repository)
    return false;
  const when = rule.when || {},
    any = (list, value) => list.some((x) => x === value);
  if (
    when.labels &&
    !when.labels.some((l) => (subject.labels || []).includes(l))
  )
    return false;
  if (when.kinds && !any(when.kinds, subject.kind)) return false;
  if (when.roles && !any(when.roles, subject.role)) return false;
  if (when.repositories && !any(when.repositories, subject.repository))
    return false;
  if (
    when.categories &&
    !(subject.category && any(when.categories, subject.category))
  )
    return false;
  if (
    when.paths &&
    !(subject.paths || []).some((file) =>
      when.paths.some((g) => globMatch(g, file)),
    )
  )
    return false;
  return true;
}

// What one task offers rules to match on. `kinds` match the manifest
// task's `type` (a word such as "test"), else its work-model kind; labels are issue labels for GitHub tasks, manifest
// labels for local ones; the category comes from the plan's front-matter only.
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
  };
}

// ---------------------------------------------------------------------------
// Evaluation (§4.10 steps 1–4).

const hasTag = (crew, tag) => crew.tags.includes(tag);

// `checks`: {remoteDispatch, fetchable(crew) -> null|reason,
// contentForbids -> null|set id}. Returns {allowed: [crew ids], removed:
// [{crew, by}], route, applied: [rule ids], pin}.
export function evaluatePlacement(subject, rules, crews, checks = {}) {
  const matching = rules.filter((rule) => ruleMatches(rule, subject)),
    byId = new Map(crews.map((c) => [c.id, c])),
    removed = new Map(),
    remove = (id, by) => {
      if (!removed.has(id)) removed.set(id, by);
    };
  let allowed = new Set([LOCAL]),
    pin = null;
  // Step 1: each matching rule's `on` widens; the first pin replaces.
  for (const rule of matching) {
    const on = rule.on || "local";
    if (on === "local") continue;
    if (on === "any") for (const c of crews) allowed.add(c.id);
    else if (on.startsWith("tags:")) {
      const tags = on.slice(5).split(",").filter(Boolean);
      for (const c of crews)
        if (tags.every((t) => hasTag(c, t))) allowed.add(c.id);
    } else if (!pin) pin = rule;
  }
  if (pin) {
    allowed = new Set(byId.has(pin.on) ? [pin.on] : []);
    if (!byId.has(pin.on))
      remove(pin.on, `rule ${pin.id} pins a crew that is not connected`);
  }
  for (const c of crews)
    if (!allowed.has(c.id))
      remove(c.id, "no matching rule allows it (the default is local)");
  // Step 2: constraints from every matching rule only remove.
  for (const rule of matching) {
    for (const tag of rule.forbidTags || [])
      for (const id of allowed)
        if (hasTag(byId.get(id), tag)) {
          allowed.delete(id);
          remove(id, `rule ${rule.id} forbids ${tag}`);
        }
    for (const tag of rule.requireTags || [])
      for (const id of allowed)
        if (!hasTag(byId.get(id), tag)) {
          allowed.delete(id);
          remove(id, `rule ${rule.id} requires ${tag}`);
        }
  }
  const keep = matching.find((rule) => rule.keepLocal);
  if (keep)
    for (const id of allowed)
      if (id !== LOCAL) {
        allowed.delete(id);
        remove(id, `rule ${keep.id} keeps it local`);
      }
  // Step 3: content rules, fetchability, the remote dispatch switch.
  for (const id of [...allowed]) {
    const crew = byId.get(id);
    if (crew.trust === "local") continue;
    let why = null;
    if (!checks.remoteDispatch) why = "Kiro Crew's remote dispatch is off";
    else if (checks.contentForbids)
      why = `content rule set ${checks.contentForbids} forbids remote crews`;
    else why = checks.fetchable?.(crew) ?? null;
    if (why) {
      allowed.delete(id);
      remove(id, why);
    }
  }
  const route =
    subject.route ??
    matching.find((rule) => rule.route)?.route ??
    subject.defaultRoute ??
    "local";
  return {
    allowed: crews.filter((c) => allowed.has(c.id)).map((c) => c.id),
    removed: [...removed].map(([crew, by]) => ({ crew, by })),
    route,
    applied: matching.map((rule) => rule.id),
    pin: pin?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Scorer.

export function scoreCrew(crew, weights, reserved = 0) {
  const running = crew.running + reserved,
    free = Math.max(0, crew.chatLimit - running),
    r = crew.reading || {};
  return (
    weights.slots * (crew.chatLimit ? free / crew.chatLimit : 0) +
    weights.memory * Math.min((r.memFreeGb ?? 0) / 16, 1) +
    weights.disk * Math.min((r.diskFreeGb ?? 0) / 100, 1) +
    weights.load * (1 - (r.loadPerCpu ?? 1)) -
    weights.avoozl * running +
    weights.local * (crew.id === LOCAL ? 1 : 0)
  );
}

// The crew with the highest score among `allowed` that has room, or null
// when every allowed crew is unavailable (the task waits without a
// decision). Ties go to local, then crew id. `reserved` maps crew id to the
// slots this tick already took.
export function pickCrew(allowed, crews, weights, reserved = new Map()) {
  // A reservation can fill a crew that was available at the start.
  const room = (c) =>
    c.available && c.running + (reserved.get(c.id) || 0) < c.chatLimit;
  const candidates = crews
    .filter((c) => allowed.includes(c.id) && room(c))
    .map((c) => ({
      crew: c,
      score: scoreCrew(c, weights, reserved.get(c.id) || 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.crew.id === LOCAL ? -1 : b.crew.id === LOCAL ? 1 : 0) ||
        a.crew.id.localeCompare(b.crew.id),
    );
  return candidates[0]
    ? { crew: candidates[0].crew, score: candidates[0].score }
    : null;
}

// ---------------------------------------------------------------------------
// Agent and model per session (R53).

const sessionApplies = (rule, role) =>
  rule.session &&
  (rule.when?.roles ? rule.when.roles.includes(role) : role === "worker");

export const choiceKey = (choice) =>
  `${choice.agent || ""}\u0000${choice.model || ""}`;

// Where a session's agent and model come from: the manifest's `session`
// for a writer, else the first matching rule's (R53.2). {source, from}.
export function sessionSource({ task, role, rules = [], subject }) {
  if (role === "worker" && task.session)
    return { source: task.session, from: "manifest" };
  const rule = rules.find(
    (r) => sessionApplies(r, role) && ruleMatches(r, subject),
  );
  return rule
    ? { source: rule.session, from: "rule " + rule.id }
    : { source: null, from: null };
}

// The session for one task and role, before crews lacking the agent are
// ruled out. `defaults`: {agent, model, source} from repository or
// workspace delivery settings (R53.3). `running` and `reserved` map
// choiceKey to counts. `kept`: the last attempt's {agent, model} (R53.6).
// `skipModels`: models a `distinctFrom: model` review role uses (R53.7).
// `agentAvailable(agent)`: false when no allowed crew has the agent.
// Returns {agent, model, reason, from, choice} or {wait, reason, rule}.
export function chooseSession({
  task,
  role,
  rules = [],
  subject,
  defaults = {},
  running = new Map(),
  reserved = new Map(),
  kept = null,
  skipModels = [],
  agentAvailable = () => true,
  rank = null,
  health = null,
}) {
  const { source, from } = sessionSource({ task, role, rules, subject });
  if (!source) {
    const fallback = {
      agent: defaults.agent ?? null,
      model: defaults.model ?? null,
      from: defaults.source || "default",
      reason: defaults.source || "default",
    };
    // Provider health (R72.5, R72.6): the default is one choice, left only
    // when it is out.
    const healthy = healthyChoices([{ ...fallback, weight: 1 }], health, {
      skipModels: role === "worker" ? skipModels : [],
    });
    if (healthy.wait)
      return {
        wait: true,
        health: true,
        from: fallback.from,
        reason: `${fallback.from}: ${healthy.reason}`,
      };
    return healthy.fallback || healthy.note
      ? {
          ...fallback,
          model: healthy.pool[0].model,
          reason: fallback.reason + healthy.note,
        }
      : fallback;
  }
  const choices = source.choices
    ? source.choices.map((c) => ({ ...c, weight: c.weight ?? 1 }))
    : [{ agent: source.agent, model: source.model, weight: 1 }];
  const fill = (c) => ({
    agent: c.agent ?? defaults.agent ?? null,
    model: c.model ?? defaults.model ?? null,
    weight: c.weight,
  });
  const writer = role === "worker",
    allowed = choices
      .map(fill)
      .filter((c) => !(writer && c.model && skipModels.includes(c.model)))
      .filter((c) => agentAvailable(c.agent));
  // Retries keep the last pick while it is still a choice and not out (R53.6, R72.6).
  if (kept) {
    const same = allowed.find(
      (c) => c.agent === kept.agent && c.model === kept.model,
    );
    if (same && !(health && same.model && health.level(same.model) === "out"))
      return { ...same, from, reason: `${from}, kept from the last attempt` };
  }
  const keptOut =
    kept && health && kept.model && health.level(kept.model) === "out"
      ? `, the kept model ${kept.model} is out`
      : "";
  const healthy = allowed.length
    ? healthyChoices(allowed, health, { skipModels: writer ? skipModels : [] })
    : { pool: [], note: "" };
  if (healthy.wait)
    return {
      wait: true,
      health: true,
      from,
      reason: `${from}: ${healthy.reason}`,
    };
  const usable = healthy.pool,
    healthNote = keptOut + healthy.note;
  if (!usable.length) {
    const skipped =
      writer && choices.map(fill).some((c) => skipModels.includes(c.model));
    return {
      wait: true,
      from,
      reason: skipped
        ? `${from} leaves no writer model apart from a review role's model`
        : `${from}: agent not installed on any allowed crew`,
      distinct: skipped,
    };
  }
  // The binding says why a retry did not keep its pick (R53.6).
  const removedNote =
    (kept && !keptOut ? ", the kept choice was removed" : "") + healthNote;
  if (usable.length === 1)
    return { ...usable[0], from, reason: from + removedNote };
  // The router may rank the choices (R53.5); a pick outside the list falls back.
  if (rank) {
    const picked = rank(usable);
    if (picked && usable.some((c) => choiceKey(c) === choiceKey(picked.choice)))
      return {
        ...usable.find((c) => choiceKey(c) === choiceKey(picked.choice)),
        from,
        reason: `${from}, router: ${picked.reason}${removedNote}`,
      };
  }
  let best = null;
  usable.forEach((c, i) => {
    const key = choiceKey(c),
      load = ((running.get(key) || 0) + (reserved.get(key) || 0)) / c.weight;
    if (!best || load < best.load) best = { c, load, i };
  });
  return {
    ...best.c,
    from,
    reason: `${from}, choice ${best.i + 1} of ${usable.length} (weight ${best.c.weight})${removedNote}`,
  };
}
