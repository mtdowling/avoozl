// The models of Avoozl's own chats (Settings › Models): the planner, the
// driver, the retro and review drafts. Saved as `models` in .avoozl.json; a
// role left out, or "auto", runs on its agent's own model. Issue Radar crews
// pick their own model, and Avoozl moves no running chat to another one.
import { fail } from "./store.mjs";

export const MODEL_ROLES = Object.freeze([
  "planner",
  "driver",
  "retro",
  "reviewDraft",
]);
// The dispatch role each saved role names (tick.mjs).
export const DISPATCH_ROLE = Object.freeze({
  planner: "planner",
  retro: "retro",
  "review-draft": "reviewDraft",
});
const MODEL = /^(?:auto|[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})$/;
const record = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// Check a `models` value; throws naming the key.
export function validateModels(value, where = "models") {
  if (value === undefined) return {};
  if (!record(value)) fail(`${where} must be an object.`);
  for (const [key, model] of Object.entries(value)) {
    if (!MODEL_ROLES.includes(key))
      fail(`${where}.${key} is not a role; use ${MODEL_ROLES.join(", ")}.`);
    if (typeof model !== "string" || !MODEL.test(model))
      fail(`${where}.${key} must be a model name or "auto".`);
  }
  return structuredClone(value);
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

// The driver chat opens from the page, and Kiro Crew's chat launcher takes
// no model, so the saved driver model is set on the chat once it has
// registered, through the gateway's model call. `applied` (slot -> model)
// keeps it to once per chat and model in this process; a restart asks once
// more, which changes nothing. Returns what it asked, or null.
export async function applyDriverModel({ slot, model, switcher, applied }) {
  if (!slot || !model || !switcher || applied.get(slot) === model) return null;
  let answer;
  try {
    answer = await switcher(slot, model);
  } catch (error) {
    answer = { ok: false, error: error.message };
  }
  // A refusal is not asked again until the model changes.
  applied.set(slot, model);
  return { slot, model, ok: Boolean(answer?.ok) };
}
