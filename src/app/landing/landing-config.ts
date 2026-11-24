// `landing` settings from .avoozl.json (Requirement 87.6). Kept apart from
// landing-conflicts.mjs so the config loader pulls in no delivery code.
import type { Store } from "../store/store.ts";

export const DEFAULT_CONFLICT_ROUNDS = 2;
// What a conflict with the base does (R87.6): `fix` sends it to the task's
// worker to resolve in the same pull request; `ask` puts it in Needs you.
export const CONFLICT_MODES = Object.freeze(["fix", "ask"]);
const MAX_ROUNDS = 10;
export const LANDING_MODES = Object.freeze(["direct", "pr", "off"]);
// How a `pr` repository's pull requests open and merge (R119):
// draft (a person releases and merges), ready (a person merges), auto
// (Avoozl merges once checks pass on the exact head).
export const PR_MODES = Object.freeze(["draft", "ready", "auto"]);

type Json = Record<string, unknown>;
// A repository's `landing` block as .avoozl.json writes it.
interface LandingBlock {
  mode?: string;
  pr?: string;
  method?: string;
  mergeBatch?: unknown;
  commitPrefix?: string;
}
// The parts of the configuration these settings read.
export interface LandingConfig {
  github?: {
    repositories?: Record<
      string,
      {
        landing?: unknown;
        conflicts?: { maxAttempts?: number; mode?: string };
      }
    >;
  };
  // validateLandingConfig checks unionPaths is a list of paths.
  landing?: { pr?: string; unionPaths?: string[] };
  repositories?: Record<string, unknown>;
  machine?: unknown;
}
// A repository row, as far as these settings read it.
interface RepositoryRow {
  id: string;
  github?: string | null;
  landing?: string;
  commitPrefix?: string;
  [key: string]: unknown;
}

// The one landing block of a GitHub repository (design §4.25, R87.1): a key
// in the block wins, then the default. `github` is the owner/name, and
// `repository` the checkout's repository row, for its `landing`.
// {mode, pr, method, mergeBatch, commitPrefix, maxAttempts, conflictMode};
// `mode` is null when nothing sets it.
// `pr` is the repository's landing.pr, then the workspace's, then draft.
export function landingSettings(
  config: LandingConfig | null | undefined,
  github: string,
  repository: { landing?: string } | null = null,
) {
  const entry = config?.github?.repositories?.[github],
    block: LandingBlock = isRecord(entry?.landing) ? entry.landing : {};
  return {
    mode: block.mode ?? repository?.landing ?? null,
    pr: block.pr ?? config?.landing?.pr ?? "draft",
    method: block.method ?? "squash",
    mergeBatch: block.mergeBatch ?? "auto",
    commitPrefix: block.commitPrefix ?? "",
    maxAttempts: entry?.conflicts?.maxAttempts ?? DEFAULT_CONFLICT_ROUNDS,
    conflictMode: entry?.conflicts?.mode ?? "fix",
  };
}

// A commit subject that follows the repository's `landing.commitPrefix`
// (such as "chore: "); with no prefix, the subject as written.
export const commitSubject = (
  prefix: string | null | undefined,
  text: string,
) => `${prefix || ""}${text}`;

// The tick and the settings loader copy each repository's `landing.mode` and
// `landing.commitPrefix` onto the repository rows of its checkouts, because
// the landing code reads them from the repository (design §4.25). Returns the
// repositories it changed.
export function applyLandingModes(
  store: Store,
  config: LandingConfig | null | undefined,
) {
  const changed: RepositoryRow[] = [];
  for (const repository of store.list<RepositoryRow>("repositories")) {
    const block = (
        repository.github
          ? config?.github?.repositories?.[repository.github]?.landing
          : null
      ) as LandingBlock | null | undefined,
      mode =
        block?.mode && LANDING_MODES.includes(block.mode)
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

const isRecord = (v: unknown): v is Json =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

// The settings loader and the tick copy each repository's `claims` and
// `labels` from `.avoozl.json` onto its repository row,
// where the claim and label code reads them; a key the file drops goes.
// Returns the repositories it changed.
const RUNNER_KEYS = ["claims", "labels"];
export function applyRunnerSettings(
  store: Store,
  config: LandingConfig | null | undefined,
) {
  const changed: RepositoryRow[] = [];
  for (const repository of store.list<RepositoryRow>("repositories")) {
    const entry = config?.repositories?.[repository.id];
    if (!isRecord(entry)) continue;
    const next: RepositoryRow = { ...repository };
    for (const key of RUNNER_KEYS)
      if (isRecord(entry[key])) next[key] = structuredClone(entry[key]);
      else delete next[key];
    if (JSON.stringify(next) === JSON.stringify(repository)) continue;
    store.put("repositories", next);
    changed.push(next);
  }
  return changed;
}

// Checks `landing.unionPaths` and that `machine` is an object. The loader
// refuses an unknown key under either (layered-config.mjs).
export function validateLandingConfig(
  config: LandingConfig | null | undefined,
  files: { repository?: string; global?: string } = {},
) {
  const repo = files.repository ?? "the repository configuration",
    glob = files.global ?? "the global configuration";
  const union = config?.landing?.unionPaths;
  if (
    union !== undefined &&
    (!Array.isArray(union) || union.some((p) => typeof p !== "string" || !p))
  )
    throw Error(`landing.unionPaths must be a list of file paths (${repo})`);
  const pr = config?.landing?.pr;
  if (pr !== undefined && !PR_MODES.includes(pr))
    throw Error(`landing.pr must be draft, ready or auto (${repo})`);
  const machine = config?.machine;
  if (machine !== undefined && !isRecord(machine))
    throw Error(`machine must be an object (${glob})`);
}

// Machine keys belong in the global file only: a repository file that sets
// them is refused, naming the global file.
export function assertNoMachineKeys(
  value: Json | null | undefined,
  file: string,
  globalFile: string,
) {
  for (const key of Object.keys(value?.serve ?? {}))
    throw Error(`serve.${key} is set in ${file}. Put it in ${globalFile}.`);
  if (value?.serve !== undefined && typeof value.serve !== "object")
    throw Error(`serve is set in ${file}. Put it in ${globalFile}.`);
  // Epic context widens what a worker reads, so only this machine sets it.
  if (value?.epicContext !== undefined)
    throw Error(`epicContext is set in ${file}. Put it in ${globalFile}.`);
  // The OTLP exporter sends data off the machine, so only this machine's
  // owner turns it on.
  if (value?.telemetry !== undefined)
    throw Error(`telemetry is set in ${file}. Put it in ${globalFile}.`);
  // The loop starts work on this machine, so only its owner turns it on.
  if (value?.loop !== undefined)
    throw Error(`loop is set in ${file}. Put it in ${globalFile}.`);
  // A sink's URL may hold a secret, so sinks live only on the machine.
  if (value?.notifications !== undefined)
    throw Error(`notifications is set in ${file}. Put it in ${globalFile}.`);
}
