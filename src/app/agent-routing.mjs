import { fail } from "./store.mjs";
import { workflowCategory } from "./agent-instructions.mjs";

export const AGENT_ROUTING_DEFAULTS = Object.freeze({
  enabled: false,
  fallback: Object.freeze({
    agentProfile: null,
    model: null,
  }),
  rules: Object.freeze([]),
});

function choice(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !value.trim())
    fail(`${label} must be text or null.`);
  return value.trim();
}

function stringList(value, label) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    fail(`${label} must be a list of names.`);
  return [...new Set(value.map((item) => item.trim()))].sort();
}

function percentage(value, label) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 100)
    fail(`${label} must be between 0 and 100.`);
  return value;
}

export function normalizeAgentRouting(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Conversation routing must contain a JSON object.");
  for (const key of Object.keys(value))
    if (!["enabled", "fallback", "rules"].includes(key))
      fail(`Unknown conversation routing setting ${key}.`);
  const fallback = value.fallback || {};
  if (!fallback || typeof fallback !== "object" || Array.isArray(fallback))
    fail("Conversation routing fallback must contain a JSON object.");
  for (const key of Object.keys(fallback))
    if (!["agentProfile", "model"].includes(key))
      fail(`Unknown conversation routing fallback setting ${key}.`);
  const rules = value.rules ?? [];
  if (!Array.isArray(rules))
    fail("Conversation routing rules must contain a list.");
  const ids = new Set();
  return {
    enabled: value.enabled === true,
    fallback: {
      agentProfile: choice(
        fallback.agentProfile,
        "Routing fallback agent profile",
      ),
      model: choice(fallback.model, "Routing fallback model"),
    },
    rules: rules
      .map((rule, index) => {
        if (!rule || typeof rule !== "object" || Array.isArray(rule))
          fail(`Conversation routing rule ${index + 1} must be an object.`);
        for (const key of Object.keys(rule))
          if (
            ![
              "id",
              "priority",
              "categories",
              "scopes",
              "risks",
              "contextRemainingAtMost",
              "agentProfile",
              "model",
            ].includes(key)
          )
            fail(`Unknown conversation routing rule setting ${key}.`);
        const id = choice(rule.id, `Conversation routing rule ${index + 1} ID`);
        if (!/^[a-z][a-z0-9-]{1,60}$/.test(id || ""))
          fail(`Conversation routing rule ${index + 1} has an invalid ID.`);
        if (ids.has(id)) fail(`Duplicate conversation routing rule ${id}.`);
        ids.add(id);
        const priority = rule.priority ?? 0;
        if (!Number.isInteger(priority) || priority < -1000 || priority > 1000)
          fail(`Conversation routing rule ${id} priority must be an integer.`);
        const agentProfile = choice(
            rule.agentProfile,
            `Conversation routing rule ${id} agent profile`,
          ),
          model = choice(rule.model, `Conversation routing rule ${id} model`);
        if (!agentProfile && !model)
          fail(
            `Conversation routing rule ${id} must choose an agent profile or model.`,
          );
        return {
          id,
          priority,
          categories: stringList(
            rule.categories,
            `Conversation routing rule ${id} categories`,
          ),
          scopes: stringList(
            rule.scopes,
            `Conversation routing rule ${id} scopes`,
          ),
          risks: stringList(
            rule.risks,
            `Conversation routing rule ${id} risks`,
          ),
          contextRemainingAtMost: percentage(
            rule.contextRemainingAtMost,
            `Conversation routing rule ${id} context remaining threshold`,
          ),
          agentProfile,
          model,
        };
      })
      .sort(
        (left, right) =>
          right.priority - left.priority || left.id.localeCompare(right.id),
      ),
  };
}

function taskRisk(task) {
  const tag = task?.tags?.find((value) =>
    /^risk:(low|medium|high)$/i.test(value),
  );
  return tag ? tag.slice(5).toLowerCase() : "unspecified";
}

function matches(rule, signals) {
  if (
    rule.categories.length &&
    !rule.categories.includes(signals.workflowCategory)
  )
    return false;
  if (rule.scopes.length && !rule.scopes.includes(signals.scope)) return false;
  if (rule.risks.length && !rule.risks.includes(signals.risk)) return false;
  if (
    rule.contextRemainingAtMost !== null &&
    (signals.contextRemainingPercent === null ||
      signals.contextRemainingPercent > rule.contextRemainingAtMost)
  )
    return false;
  return true;
}

export function openHandsRoutingAvailability(listing) {
  if (!listing || typeof listing !== "object" || Array.isArray(listing))
    return {
      provider: "openhands",
      state: "unavailable",
      reason: "OpenHands did not return an agent profile catalog.",
      agentProfiles: [],
    };
  return {
    provider: "openhands",
    state: "reported",
    agentProfiles: (listing.profiles || [])
      .flatMap((profile) => [profile.id, profile.name])
      .filter(Boolean),
    modelCatalog:
      "OpenHands agent profiles are reported. Model availability remains provider-validated because this catalog is not a complete model entitlement list.",
  };
}

function routeAvailability(route, availability) {
  if (!availability)
    return {
      state: "unknown",
      reason: "No provider profile catalog was read for this preview.",
    };
  if (availability.state !== "reported")
    return {
      state: availability.state || "unavailable",
      reason:
        availability.reason ||
        "The provider profile catalog could not be read.",
    };
  if (
    route?.agentProfile &&
    !availability.agentProfiles?.includes(route.agentProfile)
  )
    return {
      state: "agent-profile-not-found",
      reason: `OpenHands did not advertise agent profile ${route.agentProfile}.`,
    };
  return {
    state: "profile-confirmed",
    reason:
      availability.modelCatalog ||
      "The agent profile was advertised. The provider validates model access when the run starts.",
  };
}

export function selectAgentRoute({
  settings,
  input = {},
  task = null,
  parent = null,
  availability = null,
} = {}) {
  const routing = normalizeAgentRouting(settings || AGENT_ROUTING_DEFAULTS),
    reportedContextRemaining =
      input.contextRemainingPercent ?? parent?.contextRemainingPercent ?? null,
    contextRemainingPercent = Number.isFinite(reportedContextRemaining)
      ? Math.max(0, Math.min(100, reportedContextRemaining))
      : null,
    signals = {
      workflowCategory: input.driver ? "chat.project" : workflowCategory(input),
      scope: task?.scope || "unscoped",
      risk: taskRisk(task),
      contextRemainingPercent,
      contextTelemetry:
        contextRemainingPercent === null ? "unavailable" : "reported",
    },
    explicit = {
      agentProfile: choice(input.agentProfile, "Agent profile"),
      model: choice(input.model, "Model"),
    };
  const rejectedRuleIds = [];
  let matchedRule = null;
  if (routing.enabled)
    matchedRule =
      routing.rules.find((rule) => {
        if (!matches(rule, signals)) return false;
        if (
          availability?.state === "reported" &&
          routeAvailability(rule, availability).state ===
            "agent-profile-not-found"
        ) {
          rejectedRuleIds.push(rule.id);
          return false;
        }
        return true;
      }) || null;
  const fallbackAvailability = routeAvailability(
      routing.fallback,
      availability,
    ),
    fallbackUsable = fallbackAvailability.state !== "agent-profile-not-found",
    policy =
      matchedRule ||
      (routing.enabled && fallbackUsable ? routing.fallback : null),
    selected = {
      agentProfile:
        explicit.agentProfile ||
        policy?.agentProfile ||
        parent?.agentProfile ||
        null,
      model:
        explicit.model ||
        policy?.model ||
        parent?.requestedModel ||
        parent?.model ||
        null,
    };
  return {
    enabled: routing.enabled,
    source:
      explicit.agentProfile || explicit.model
        ? "explicit-override"
        : matchedRule
          ? "policy-rule"
          : routing.enabled &&
              fallbackUsable &&
              (routing.fallback.agentProfile || routing.fallback.model)
            ? "policy-fallback"
            : parent && (parent.agentProfile || parent.model)
              ? "parent-inheritance"
              : "openhands-default",
    ruleId: matchedRule?.id || null,
    rejectedRuleIds,
    overrides: explicit,
    selected,
    signals,
    availability: routeAvailability(selected, availability),
  };
}
