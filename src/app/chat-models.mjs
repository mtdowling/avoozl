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
// The removed driver chat's role. Files saved before its removal may still
// name it; it is accepted and dropped so they keep loading.
const RETIRED_ROLES = new Set(["driver"]);

// Check a `models` value; throws naming the key.
export function validateModels(value, where = "models") {
  if (value === undefined) return {};
  if (!record(value)) fail(`${where} must be an object.`);
  for (const [key, model] of Object.entries(value)) {
    if (RETIRED_ROLES.has(key)) continue;
    if (!MODEL_ROLES.includes(key))
      fail(`${where}.${key} is not a role; use ${MODEL_ROLES.join(", ")}.`);
    if (typeof model !== "string" || !MODEL.test(model))
      fail(`${where}.${key} must be a model name or "auto".`);
  }
  if (
    value.planner &&
    value.planner !== "auto" &&
    value.planReviewer === value.planner
  )
    fail(`${where}.planReviewer must differ from the named planner model.`);
  const checked = structuredClone(value);
  for (const key of RETIRED_ROLES) delete checked[key];
  return checked;
}

// Effective cross-model review settings. Auto without a named reviewer
// skips the review; it never falls back to the writer's model.
export function validatePlanReview(value, where = "planReview") {
  if (value === undefined) return { mode: "auto", rounds: 1 };
  if (!record(value)) fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!["mode", "rounds"].includes(key))
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
  const model = record(config?.models) ? config.models[role] : undefined;
  return typeof model === "string" && model !== "auto" && MODEL.test(model)
    ? model
    : null;
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
