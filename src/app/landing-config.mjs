// `landing` settings from .avoozl.json (Requirement 87.6). Kept apart from
// landing-conflicts.mjs so the config loader pulls in no delivery code.
export const DEFAULT_CONFLICT_ROUNDS = 2;
const MAX_ROUNDS = 10;

// `landing.conflictRounds` from .avoozl.json, validated; the default when unset.
export function conflictRounds(landing, where = "landing") {
  if (landing === undefined) return DEFAULT_CONFLICT_ROUNDS;
  if (!landing || typeof landing !== "object" || Array.isArray(landing))
    throw Error(`${where} must be an object.`);
  const rounds = landing.conflictRounds ?? DEFAULT_CONFLICT_ROUNDS;
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > MAX_ROUNDS)
    throw Error(
      `${where}.conflictRounds must be a whole number 0–${MAX_ROUNDS}.`,
    );
  return rounds;
}
