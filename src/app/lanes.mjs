// Lanes (design §4.26, R88.5): how many worker chats this Mac runs at once.
// `lanes.local` in .avoozl.json defaults to 3; more lanes come from remote
// hosts. A ready task beyond the free lanes waits for the next tick.
export const DEFAULT_LANES = Object.freeze({ local: 3 });

// `lanes` from .avoozl.json, validated, with defaults. Throws on a bad value.
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

// Lanes still free on this Mac, given how many local workers run now.
export const freeLocalLanes = (lanes, running) =>
  Math.max(0, validateLanes(lanes).local - running);

// The ready tasks that start now, in order; the rest wait.
export const startWithinLanes = (ready, lanes, running = 0) =>
  ready.slice(0, freeLocalLanes(lanes, running));
