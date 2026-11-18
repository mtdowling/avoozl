// Lanes (design §4.26, R6.3, R88.5): how many worker chats this machine runs
// at once. `lanes.local` in the machine file (~/.config/avoozl/config.json)
// defaults to 3; `lanes` in .avoozl.json is still read as old input. More
// lanes come from remote hosts. A ready task beyond the free lanes waits for
// the next tick.
export const DEFAULT_LANES = Object.freeze({ local: 3 });

// `lanes`, validated, with defaults. Throws on a bad value.
export function validateLanes(value, where = "lanes") {
  if (value === undefined) return { ...DEFAULT_LANES };
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (key !== "local")
      throw Error(`${where}.${key} is not a setting; use local.`);
  const local = value.local === undefined ? DEFAULT_LANES.local : value.local;
  if (!Number.isInteger(local) || local < 0 || local > 32)
    throw Error(`${where}.local must be a whole number 0–32.`);
  return { local };
}
