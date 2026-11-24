// Lanes (design §4.26, R6.3, R88.5): the long-lived sessions
// this machine runs at once. `lanes.local` worker lanes default to 3 and
// `lanes.reviewers` reviewer lanes to 1, in the machine file
// (~/.config/avoozl/config.json); `lanes` in .avoozl.json is still read as
// old input. A ready task beyond the free lanes waits for the next tick.
type Lanes = { local: number; reviewers: number };
export const DEFAULT_LANES: Readonly<Lanes> = Object.freeze({
  local: 3,
  reviewers: 1,
});
const LIMITS: Lanes = { local: 32, reviewers: 8 };

// `lanes`, validated, with defaults. Throws on a bad value.
export function validateLanes(value: unknown, where = "lanes"): Lanes {
  if (value === undefined) return { ...DEFAULT_LANES };
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!Object.hasOwn(LIMITS, key))
      throw Error(`${where}.${key} is not a setting; use local or reviewers.`);
  const given = value as Partial<Record<keyof Lanes, unknown>>,
    out = { ...DEFAULT_LANES };
  for (const key of Object.keys(LIMITS) as (keyof Lanes)[]) {
    const max = LIMITS[key],
      count = given[key] === undefined ? DEFAULT_LANES[key] : given[key];
    if (
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > max
    )
      throw Error(`${where}.${key} must be a whole number 0–${max}.`);
    out[key] = count;
  }
  return out;
}
