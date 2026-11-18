// Manifest session pins (design §4.10, R53): a pin names the agent, model or
// harness a task's session uses.
import { fail } from "./store.mjs";
import { isHarnessName } from "./chat-models.mjs";

const NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

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
