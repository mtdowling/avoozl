// `landing` settings from .avoozl.json (Requirement 87.6). Kept apart from
// landing-conflicts.mjs so the config loader pulls in no delivery code.
export const DEFAULT_CONFLICT_ROUNDS = 2;
const MAX_ROUNDS = 10;
export const LANDING_MODES = Object.freeze(["direct", "pr", "off"]);

// The one landing block of a GitHub repository (design §4.25, R87.1): a key
// in the block wins, then the default. `github` is the owner/name, and
// `repository` the checkout's repository row, for its `landing`.
// {mode, autoMerge, method, mergeBatch, commitPrefix, maxAttempts}; `mode` is null when nothing sets it.
export function landingSettings(config, github, repository = null) {
  const entry = config?.github?.repositories?.[github],
    block = isRecord(entry?.landing) ? entry.landing : {};
  return {
    mode: block.mode ?? repository?.landing ?? null,
    autoMerge: block.autoMerge ?? true,
    method: block.method ?? "squash",
    mergeBatch: block.mergeBatch ?? "auto",
    commitPrefix: block.commitPrefix ?? "",
    maxAttempts: entry?.conflicts?.maxAttempts ?? DEFAULT_CONFLICT_ROUNDS,
  };
}

// A commit subject that follows the repository's `landing.commitPrefix`
// (such as "chore: "); with no prefix, the subject as written.
export const commitSubject = (prefix, text) => `${prefix || ""}${text}`;

// The tick and the settings loader copy each repository's `landing.mode` and
// `landing.commitPrefix` onto the repository rows of its checkouts, because
// the landing code reads them from the repository (design §4.25). Returns the
// repositories it changed.
export function applyLandingModes(store, config) {
  const changed = [];
  for (const repository of store.list("repositories")) {
    const block = repository.github
        ? config?.github?.repositories?.[repository.github]?.landing
        : null,
      mode = LANDING_MODES.includes(block?.mode)
        ? block.mode
        : repository.landing,
      commitPrefix = block ? block.commitPrefix || undefined : undefined;
    if (!block) continue;
    if (repository.landing === mode && repository.commitPrefix === commitPrefix)
      continue;
    const { commitPrefix: _old, ...rest } = repository,
      next = {
        ...rest,
        landing: mode,
        ...(commitPrefix ? { commitPrefix } : {}),
      };
    store.put("repositories", next);
    changed.push(next);
  }
  return changed;
}

const isRecord = (v) =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

// Checks `landing.unionPaths` and that `machine` is an object. The loader
// refuses an unknown key under either (layered-config.mjs).
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
  if (machine !== undefined && !isRecord(machine))
    throw Error(`machine must be an object (${glob})`);
}

// Machine keys belong in the global file only: a repository file that sets
// them is refused, naming the global file.
export function assertNoMachineKeys(value, file, globalFile) {
  for (const key of Object.keys(value?.serve ?? {}))
    throw Error(`serve.${key} is set in ${file}. Put it in ${globalFile}.`);
  if (value?.serve !== undefined && typeof value.serve !== "object")
    throw Error(`serve is set in ${file}. Put it in ${globalFile}.`);
  // A sink's URL may hold a secret, so sinks live only on the machine.
  if (value?.notifications !== undefined)
    throw Error(`notifications is set in ${file}. Put it in ${globalFile}.`);
}
