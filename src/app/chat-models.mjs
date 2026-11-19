// The models of Avoozl's own chats (Settings › Models): the planner, the
// retro, review drafts and plan reviewer. Saved as `models` in .avoozl.json;
// a role left out, or "auto", runs on its agent's own model, except the plan
// reviewer stays unset and skips review. Issue Radar crews pick their own
// model, and Avoozl moves no running chat to another one.
import { fail } from "./store.mjs";

export const MODEL_ROLES = Object.freeze([
  "planner",
  "planReviewer",
  "retro",
  "reviewDraft",
]);
// The dispatch role each saved role names (tick.mjs).
export const DISPATCH_ROLE = Object.freeze({
  planner: "planner",
  "plan-review": "planReviewer",
  retro: "retro",
  "review-draft": "reviewDraft",
});
const MODEL = /^(?:auto|[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})$/;
const record = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export const PLAN_REVIEW_KEYS = Object.freeze(["mode", "rounds"]);

// Effective cross-model review settings. Auto without a named reviewer
// skips the review; it never falls back to the writer's model.
export function validatePlanReview(value, where = "planReview") {
  if (value === undefined) return { mode: "auto", rounds: 1 };
  if (!record(value)) fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!PLAN_REVIEW_KEYS.includes(key))
      fail(`${where}.${key} is not a setting; use mode or rounds.`);
  const mode = value.mode === undefined ? "auto" : value.mode,
    rounds = value.rounds === undefined ? 1 : value.rounds;
  if (!["auto", "ask", "off"].includes(mode))
    fail(`${where}.mode must be auto, ask or off.`);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 3)
    fail(`${where}.rounds must be an integer from 1 to 3.`);
  return { mode, rounds };
}

// The model a role's chat opens on, or null for the agent's own.
export function chatModel(config, role) {
  const model = resolveRoles(config)[role]?.model;
  return typeof model === "string" && model !== "auto" && MODEL.test(model)
    ? model
    : null;
}

// Settings › Models also picks the harness each role runs on (R98.3),
// saved as `harnesses` in .avoozl.json: `kirocrew` for a Kiro Crew chat, or
// a harness definition's name for a supervisor child. A role left out, or
// "auto", runs on its project's executor. A task's `session.harness` pin
// wins over both (R98.4).
export const KIROCREW_HARNESS = "kirocrew";
export const HARNESS_ROLES = Object.freeze(["worker", ...MODEL_ROLES]);
const HARNESS = /^[a-z][a-z0-9-]{0,60}$/;
export const isHarnessName = (value) =>
  typeof value === "string" && HARNESS.test(value);

// The harness a role's saved setting names, or null for its project's.
export function roleHarness(config, role) {
  const harness = resolveRoles(config)[role]?.harness;
  return isHarnessName(harness) && harness !== "auto" ? harness : null;
}

// The executor a named harness runs on: `kirocrew` is the Kiro Crew chat,
// any other name is a `process` child of that definition.
export function harnessExecutor(harness) {
  return harness === KIROCREW_HARNESS
    ? { executor: KIROCREW_HARNESS }
    : { executor: "process", harness };
}

// One `roles` table (R98.6): each role's harness, model and, for the
// worker and the falsifier, agent. Settings › Models edits it. The older
// keys still load into it with no warning (R98.8):
// `delivery.agent/model`, `delivery.investigate.agent/model` and
// `flow.retro.model`. A `roles` field wins over an older key.
// The roles after the chat roles pick only a harness: each runs on its
// agent's own model (without-kirocrew NK1.3). One entry per row of the role
// table (role-table.mjs); a test keeps them equal.
const HARNESS_ONLY_ROLES = Object.freeze([
  "verifier",
  "reviewer",
  "responder",
  "taskSummary",
  "issuePlanner",
  "planAnswer",
  "prReview",
  // The assistant the page's Open chat buttons start without Kiro Crew.
  "assist",
  // One issue or pull request's triage run (triage.mjs).
  "triage",
]);
export const ROLES = Object.freeze([
  "worker",
  "falsifier",
  ...MODEL_ROLES,
  ...HARNESS_ONLY_ROLES,
]);
const AGENT_ROLES = new Set(["worker", "falsifier"]);
const HARNESS_ONLY = new Set(HARNESS_ONLY_ROLES);
// The fields a row may set: every role's, and the agent roles'.
export const ROLE_FIELDS = Object.freeze(["harness", "model"]);
export const AGENT_ROLE_FIELDS = Object.freeze(["harness", "agent", "model"]);
export const HARNESS_ROLE_FIELDS = Object.freeze(["harness"]);
const AGENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

// The table with the older keys read in: older keys first, then `roles`
// over them, field by field. Values are as saved, `auto` included.
export function resolveRoles(config) {
  const table = {},
    put = (role, field, value) => {
      if (typeof value === "string" && value)
        (table[role] ??= {})[field] = value;
    },
    delivery = record(config?.delivery) ? config.delivery : {},
    investigate = record(delivery.investigate) ? delivery.investigate : {};
  put("retro", "model", config?.flow?.retro?.model);
  put("worker", "agent", delivery.agent);
  put("worker", "model", delivery.model);
  put("falsifier", "agent", investigate.agent);
  put("falsifier", "model", investigate.model);
  if (record(config?.roles))
    for (const role of ROLES)
      if (record(config.roles[role]))
        for (const field of ["harness", "agent", "model"])
          put(role, field, config.roles[role][field]);
  return table;
}

// Tables merged field by field, later over earlier.
export function mergeRoles(...tables) {
  const merged = {};
  for (const table of tables)
    for (const [role, row] of Object.entries(table || {}))
      merged[role] = { ...merged[role], ...row };
  return merged;
}

// Remove the older keys the table replaces (R98.9). `delivery` itself
// stays, even empty, because its presence turns delivery on.
export function dropOlderRoleKeys(value) {
  if (record(value.delivery)) {
    delete value.delivery.agent;
    delete value.delivery.model;
    const investigate = value.delivery.investigate;
    if (record(investigate)) {
      delete investigate.agent;
      delete investigate.model;
      if (!Object.keys(investigate).length) delete value.delivery.investigate;
    }
  }
  const retro = value.flow?.retro;
  if (record(retro) && "model" in retro) {
    delete retro.model;
    if (!Object.keys(retro).length) delete value.flow.retro;
    if (!Object.keys(value.flow).length) delete value.flow;
  }
  return value;
}

// Check a config's `roles` value and the table it makes with the older
// keys; throws naming the key. Returns the checked `roles`.
export function validateRoles(config, where = "roles") {
  const value = config?.roles;
  if (value === undefined) return {};
  if (!record(value)) fail(`${where} must be an object.`);
  for (const [role, row] of Object.entries(value)) {
    const at = `${where}.${role}`;
    if (!ROLES.includes(role))
      fail(`${at} is not a role; use ${ROLES.join(", ")}.`);
    if (!record(row)) fail(`${at} must be an object.`);
    const fields = AGENT_ROLES.has(role)
      ? AGENT_ROLE_FIELDS
      : HARNESS_ONLY.has(role)
        ? HARNESS_ROLE_FIELDS
        : ROLE_FIELDS;
    for (const [field, v] of Object.entries(row)) {
      if (!fields.includes(field))
        fail(`${at}.${field} is not a role setting; use ${fields.join(", ")}.`);
      if (field === "harness" && !isHarnessName(v))
        fail(
          `${at}.harness must be ${KIROCREW_HARNESS}, a harness name or "auto".`,
        );
      if (field === "model" && (typeof v !== "string" || !MODEL.test(v)))
        fail(`${at}.model must be a model name or "auto".`);
      if (field === "agent" && (typeof v !== "string" || !AGENT.test(v)))
        fail(`${at}.agent must be an agent name.`);
    }
  }
  const { planner, planReviewer } = resolveRoles(config);
  if (
    planner?.model &&
    planner.model !== "auto" &&
    planReviewer?.model === planner.model
  )
    fail(
      `${where}.planReviewer.model must differ from the named planner model.`,
    );
  return structuredClone(value);
}

// Each dispatch of a role with a saved model asks for it. The retro's saved
// model wins over the older `flow.retro.model`.
export function withChatModels(dispatch, config) {
  return dispatch.map((d) => {
    const role = DISPATCH_ROLE[d.role],
      model = role ? chatModel(config, role) : null;
    return model && (role === "retro" || !d.model) ? { ...d, model } : d;
  });
}
