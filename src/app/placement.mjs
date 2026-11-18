// Manifest session pins (design §4.10, R53). Crew placement was retired
// 2026-11-18: every session runs on this machine, so a pin names only the
// agent, model or harness, and `session.crew` and `needs` are refused.
import { fail } from "./store.mjs";
import { refuseTrackedProviders } from "./provider-health.mjs";
import { isHarnessName } from "./chat-models.mjs";

const NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const RETIRED =
  "crew placement was retired; every session runs on this machine.";

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// A manifest task's `session` (R53.1): {agent?, model?, harness?};
// `harness` is `kirocrew` or a harness definition's name (R98.4). Throws one
// error naming every bad key.
export function validateSession(value, at = "session") {
  const errors = [];
  if (!record(value)) fail(`${at} must be an object.`);
  for (const key of Object.keys(value))
    if (key === "choices")
      errors.push(`${at}.choices was removed: pin one model.`);
    else if (key === "crew") errors.push(`${at}.crew: ${RETIRED}`);
    else if (!["agent", "model", "harness"].includes(key))
      errors.push(`${at}.${key} is not a session setting.`);
  for (const key of ["agent", "model"])
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || !NAME.test(value[key]))
    )
      errors.push(
        `${at}.${key} must be ${key === "agent" ? "an agent" : "a model"} name.`,
      );
  if (
    value.harness !== undefined &&
    (!isHarnessName(value.harness) || value.harness === "auto")
  )
    errors.push(`${at}.harness must be kirocrew or a harness name.`);
  if (errors.length) fail(errors.join(" "));
  return value;
}

// A manifest task's `needs` named crew tags; there are no crews to match.
export function validateNeeds(value, at = "needs") {
  fail(`${at}: ${RETIRED}`);
}

// The tracked file may not hold provider settings. Its old `routing` keys
// (the prompt, the relay) and `projects.<id>.routing` are ignored.
export function validateTrackedRouting(config) {
  refuseTrackedProviders(config);
}
