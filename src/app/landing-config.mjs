// `landing` settings from .avoozl.json (Requirement 87.6). Kept apart from
// landing-conflicts.mjs so the config loader pulls in no delivery code.
export const DEFAULT_CONFLICT_ROUNDS = 2;
const MAX_ROUNDS = 10;
export const LANDING_MODES = Object.freeze(["direct", "pr", "off"]);
// `train` was retired by the merge batches spec: it loads as `direct`.
export const RETIRED_MODES = Object.freeze({ train: "direct" });
export const landingMode = (mode) => RETIRED_MODES[mode] ?? mode;

// The one landing block of a GitHub repository (design §4.25, R87.1), with
// the older keys folded in: a key in the block wins, then the older key at
// the repository, then the workspace's, then the default. `project` is the
// checkout's project row, for its `landing` and its `delivery` id.
// {mode, autoMerge, method, mergeBatch, maxAttempts}; `mode` is null when nothing sets it.
export function landingSettings(config, repository, project = null) {
  const entry = config?.github?.repositories?.[repository],
    block = isRecord(entry?.landing) ? entry.landing : {},
    delivery = isRecord(config?.delivery) ? config.delivery : {},
    ship = (value) => (value === undefined ? undefined : value !== "manual");
  return {
    mode: landingMode(block.mode ?? project?.landing ?? null),
    autoMerge:
      block.autoMerge ??
      ship(project && delivery.repositories?.[project.id]?.ship) ??
      ship(repository && delivery.repositories?.[repository]?.ship) ??
      ship(delivery.ship) ??
      true,
    method: block.method ?? entry?.merge?.method ?? "squash",
    mergeBatch: block.mergeBatch ?? "auto",
    maxAttempts:
      entry?.conflicts?.maxAttempts ??
      (isRecord(config?.landing) ? config.landing.conflictRounds : undefined) ??
      DEFAULT_CONFLICT_ROUNDS,
  };
}

// The tick and the settings loader copy each repository's `landing.mode`
// onto the project rows of its checkouts, because the landing code reads the
// mode from the project (design §4.25). Returns the projects it changed.
export function applyLandingModes(store, config) {
  const changed = [];
  for (const project of store.list("projects")) {
    const mode = landingMode(
      project.repository &&
        config?.github?.repositories?.[project.repository]?.landing?.mode,
    );
    if (!LANDING_MODES.includes(mode) || project.landing === mode) continue;
    const next = { ...project, landing: mode };
    store.put("projects", next);
    changed.push(next);
  }
  return changed;
}

// `landing.conflictRounds` from .avoozl.json, validated; the default when unset.
// It is the older key of each repository's `conflicts.maxAttempts`.
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

const isRecord = (v) =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

// Keys of `machine` in the global file. `platforms` and `slots` were retired
// by the merge batches spec: they load and are ignored.
export const MACHINE_FILE_KEYS = ["platforms", "slots", "alias"];

// Checks `landing.unionPaths` and the keys of `machine`. `landing.trains`,
// `machine.platforms`, `machine.slots` and `lease` are retired and ignored.
export function validateLandingConfig(config, files = {}) {
  const repo = files.repository ?? "the repository configuration",
    glob = files.global ?? "the global configuration";
  const union = config?.landing?.unionPaths;
  if (
    union !== undefined &&
    (!Array.isArray(union) || union.some((p) => typeof p !== "string" || !p))
  )
    throw Error(`landing.unionPaths must be a list of file paths (${repo})`);
  const machine = config?.machine;
  if (machine !== undefined) {
    if (!isRecord(machine)) throw Error(`machine must be an object (${glob})`);
    for (const key of Object.keys(machine))
      if (!MACHINE_FILE_KEYS.includes(key))
        throw Error(`machine.${key} is not a known setting. (${glob})`);
  }
}

// Machine keys belong in the global file only: a repository file that sets
// them is refused, naming the global file. The retired `machine.platforms`,
// `machine.slots` and `lease` are not checked: they are ignored anywhere.
export function assertNoMachineKeys(value, file, globalFile) {
  for (const key of Object.keys(value?.serve ?? {}))
    throw Error(`serve.${key} is set in ${file}. Put it in ${globalFile}.`);
  if (value?.serve !== undefined && typeof value.serve !== "object")
    throw Error(`serve is set in ${file}. Put it in ${globalFile}.`);
  // A sink's URL may hold a secret, so sinks live only on the machine.
  if (value?.notifications !== undefined)
    throw Error(`notifications is set in ${file}. Put it in ${globalFile}.`);
}
