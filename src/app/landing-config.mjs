// `landing` settings from .avoozl.json (Requirement 87.6). Kept apart from
// landing-conflicts.mjs so the config loader pulls in no delivery code.
export const DEFAULT_CONFLICT_ROUNDS = 2;
const MAX_ROUNDS = 10;
export const LANDING_MODES = Object.freeze(["direct", "pr", "train", "off"]);

// The one landing block of a GitHub repository (design §4.25, R87.1), with
// the older keys folded in: a key in the block wins, then the older key at
// the repository, then the workspace's, then the default. `project` is the
// checkout's project row, for its `landing` and its `delivery` id.
// {mode, autoMerge, method, maxAttempts}; `mode` is null when nothing sets it.
export function landingSettings(config, repository, project = null) {
  const entry = config?.github?.repositories?.[repository],
    block = isRecord(entry?.landing) ? entry.landing : {},
    delivery = isRecord(config?.delivery) ? config.delivery : {},
    ship = (value) => (value === undefined ? undefined : value !== "manual");
  return {
    mode: block.mode ?? project?.landing ?? null,
    autoMerge:
      block.autoMerge ??
      ship(project && delivery.repositories?.[project.id]?.ship) ??
      ship(repository && delivery.repositories?.[repository]?.ship) ??
      ship(delivery.ship) ??
      true,
    method: block.method ?? entry?.merge?.method ?? "squash",
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
    const mode =
      project.repository &&
      config?.github?.repositories?.[project.repository]?.landing?.mode;
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

// Integrator train settings (landing-trains spec, LT15, design D16).
// shortcut: the first cut reads only the keys below; each later phase adds
// its own keys to TRAIN_SHAPE and to the checks, so a block written for a
// later phase is refused as an unknown key until then.
const isRecord = (v) =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const leaf = (spec) => ({ leaf: true, ...spec });
const int = (min, max) => leaf({ int: [min, max] });
const argv = leaf({ argv: true });

export const TRAIN_DEFAULTS = Object.freeze({
  branchPrefix: "avoozl-batch/",
  trigger: Object.freeze({
    minBranches: 3,
    maxWaitMinutes: 15,
    maxBranches: 10,
    cooldownSeconds: 60,
  }),
  failure: Object.freeze({
    action: "return",
    retries: 2,
    trunk: "revert",
    maxBisects: 2,
    maxRebases: 3,
    flakyReruns: 1,
  }),
  ci: Object.freeze({ waitForLastTrain: false }),
  scheduling: Object.freeze({ overlap: "same-train" }),
});

export const TRAIN_KEYS = {
  branchPrefix: leaf({ prefix: true }),
  trigger: {
    minBranches: int(1, 32),
    maxWaitMinutes: int(0, 1440),
    maxBranches: int(1, 32),
    cooldownSeconds: int(0, 3600),
  },
  validation: {
    cheap: leaf({ argvList: true }),
    full: leaf({ platformCommands: true }),
  },
  platforms: { rules: leaf({ rules: true }), classifier: argv },
  failure: {
    action: leaf({ oneOf: ["return", "eject"] }),
    retries: int(0, 10),
    trunk: leaf({ oneOf: ["revert", "fix-forward"] }),
    maxBisects: int(0, 10),
    maxRebases: int(0, 10),
    flakyReruns: int(0, 3),
  },
  conflicts: { mechanical: leaf({ mechanical: true }) },
  ci: {
    workflow: leaf({ string: true }),
    waitForLastTrain: leaf({ bool: true }),
  },
  scheduling: { overlap: leaf({ oneOf: ["same-train", "serialize"] }) },
};
export const TARGET_KEYS = { policy: leaf({ oneOf: ["optimistic", "gated"] }) };
const MACHINE_KEYS = ["platforms", "slots"];
// `machine` in the global file: the two above, and `alias`, this machine's name.
export const MACHINE_FILE_KEYS = [...MACHINE_KEYS, "alias"];
// One platform's command under `validation.full`, one mechanical conflict
// rule, and one `machine.platforms` entry.
export const PLATFORM_COMMAND_KEYS = ["command", "results", "suiteArgs"];
export const MECHANICAL_KEYS = ["paths", "strategy", "command", "verify"];
export const MACHINE_PLATFORM_KEYS = ["kind", "wrapper", "cleanup", "slot"];
export const LEASE_KEYS = {
  heartbeatSeconds: int(10, 600),
  missedHeartbeats: int(2, 10),
};
export const LEASE_DEFAULTS = Object.freeze({
  heartbeatSeconds: 60,
  missedHeartbeats: 3,
});

const STRATEGIES = ["union", "regenerate", "format"];

function checkValue(spec, value, at, fail) {
  if (spec.int) {
    const [lo, hi] = spec.int;
    if (!Number.isInteger(value) || value < lo || value > hi)
      fail(`${at} must be a whole number ${lo}–${hi}.`);
  } else if (spec.oneOf) {
    if (!spec.oneOf.includes(value))
      fail(`${at} must be one of ${spec.oneOf.join(", ")}.`);
  } else if (spec.bool) {
    if (typeof value !== "boolean") fail(`${at} must be true or false.`);
  } else if (spec.string) {
    if (typeof value !== "string" || !value) fail(`${at} must be text.`);
  } else if (spec.prefix) {
    if (
      typeof value !== "string" ||
      !value.endsWith("/") ||
      !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/$/.test(value) ||
      value.includes("..") ||
      value.includes(".lock/")
    )
      fail(`${at} must be a valid ref prefix that ends with "/".`);
  } else if (spec.argv) {
    checkArgv(value, at, fail);
  } else if (spec.argvList) {
    if (!Array.isArray(value)) fail(`${at} must be a list of argument lists.`);
    value.forEach((a, i) => checkArgv(a, `${at}.${i}`, fail));
  } else if (spec.platformCommands) {
    if (!isRecord(value)) fail(`${at} must be an object of platforms.`);
    for (const [name, entry] of Object.entries(value)) {
      const here = `${at}.${name}`;
      if (!isRecord(entry)) fail(`${here} must be an object.`);
      for (const key of Object.keys(entry))
        if (!PLATFORM_COMMAND_KEYS.includes(key))
          fail(`${here}.${key} is not a known setting.`);
      checkArgv(entry.command, `${here}.command`, fail);
      if (entry.results !== undefined && typeof entry.results !== "string")
        fail(`${here}.results must be a relative path.`);
      if (entry.suiteArgs !== undefined) {
        checkArgv(entry.suiteArgs, `${here}.suiteArgs`, fail);
        if (!entry.suiteArgs.some((a) => a.includes("{suite}")))
          fail(
            `${here}.suiteArgs must hold {suite}, where the suite name goes.`,
          );
      }
    }
  } else if (spec.rules) {
    if (!isRecord(value)) fail(`${at} must map globs to platform names.`);
    for (const [glob, platforms] of Object.entries(value))
      if (
        !Array.isArray(platforms) ||
        !platforms.length ||
        platforms.some((p) => typeof p !== "string" || !p)
      )
        fail(`${at}.${glob} must be a list of platform names.`);
  } else if (spec.mechanical) {
    if (!Array.isArray(value)) fail(`${at} must be a list of rules.`);
    value.forEach((rule, i) => {
      const here = `${at}.${i}`;
      if (!isRecord(rule)) fail(`${here} must be an object.`);
      for (const key of Object.keys(rule))
        if (!MECHANICAL_KEYS.includes(key))
          fail(`${here}.${key} is not a known setting.`);
      if (
        !Array.isArray(rule.paths) ||
        !rule.paths.length ||
        rule.paths.some((p) => typeof p !== "string" || !p)
      )
        fail(`${here}.paths must be a list of path globs.`);
      if (!STRATEGIES.includes(rule.strategy))
        fail(`${here}.strategy must be one of ${STRATEGIES.join(", ")}.`);
      if (rule.strategy === "regenerate" && rule.command === undefined)
        fail(`${here} is a regenerate rule and needs a command.`);
      if (rule.command !== undefined)
        checkArgv(rule.command, `${here}.command`, fail);
      if (rule.verify !== undefined)
        checkArgv(rule.verify, `${here}.verify`, fail);
    });
  }
}

function checkArgv(value, at, fail) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((a) => typeof a !== "string" || !a)
  )
    fail(`${at} must be a non-empty list of text arguments.`);
}

function checkBlock(shape, block, at, fail) {
  if (!isRecord(block)) fail(`${at} must be an object.`);
  for (const [key, value] of Object.entries(block)) {
    const spec = shape[key];
    if (!spec) fail(`${at}.${key} is not a known setting.`);
    if (isRecord(spec) && !isLeaf(spec))
      checkBlock(spec, value, `${at}.${key}`, fail);
    else checkValue(spec, value, `${at}.${key}`, fail);
  }
}
const isLeaf = (spec) => spec.leaf === true;

// The settings of one target: the `trains` level, then the target's own
// keys over it (objects merge one level deep), then defaults (D16).
export function trainSettings(config, target) {
  const trains = config?.landing?.trains;
  if (!isRecord(trains)) return null;
  const { targets = {}, ...base } = trains,
    own = targets[target] ?? {},
    out = { ...base };
  for (const [key, value] of Object.entries(own))
    out[key] =
      isRecord(value) && isRecord(base[key])
        ? { ...base[key], ...value }
        : value;
  out.branchPrefix ??= TRAIN_DEFAULTS.branchPrefix;
  for (const key of ["trigger", "failure", "ci", "scheduling"])
    out[key] = { ...TRAIN_DEFAULTS[key], ...(out[key] ?? {}) };
  out.conflicts = { mechanical: [], ...(out.conflicts ?? {}) };
  out.validation = { cheap: [], full: {}, ...(out.validation ?? {}) };
  return out;
}

// Validates `landing.trains` and the machine keys of a merged configuration.
// `files` names where each part came from: {repository, global}. Throws the
// first problem, naming the key and its file. Returns {warnings}.
export function validateTrains(config, files = {}) {
  const repo = files.repository ?? "the repository configuration",
    glob = files.global ?? "the global configuration",
    warnings = [];
  const union = config?.landing?.unionPaths;
  if (
    union !== undefined &&
    (!Array.isArray(union) || union.some((p) => typeof p !== "string" || !p))
  )
    throw Error(`landing.unionPaths must be a list of file paths (${repo})`);
  const trains = config?.landing?.trains;
  if (trains !== undefined) {
    const fail = (message) => {
      throw Error(`${message} (${repo})`);
    };
    if (!isRecord(trains)) fail("landing.trains must be an object.");
    const { targets, ...base } = trains;
    checkBlock(TRAIN_KEYS, base, "landing.trains", fail);
    if (targets !== undefined) {
      if (!isRecord(targets)) fail("landing.trains.targets must be an object.");
      for (const [name, block] of Object.entries(targets)) {
        const at = `landing.trains.targets.${name}`;
        if (!isRecord(block)) fail(`${at} must be an object.`);
        checkBlock({ ...TRAIN_KEYS, ...TARGET_KEYS }, block, at, fail);
        if (block.policy === undefined)
          fail(`${at}.policy is required: optimistic or gated.`);
        const s = trainSettings(config, name);
        if (s.trigger.minBranches > s.trigger.maxBranches)
          fail(`${at}.trigger.minBranches is above maxBranches.`);
        const machine = config.machine?.platforms ?? {};
        for (const platform of Object.keys(s.validation.full)) {
          if (machine[platform] || s.ci.workflow) {
            if (!machine[platform] && block.policy === "gated")
              warnings.push(
                `${at}: gated platform ${platform} has no environment on this machine, so each train costs one extra CI run.`,
              );
            continue;
          }
          fail(
            `${at}.validation.full.${platform} needs a machine environment (${glob}) or ci.workflow.`,
          );
        }
      }
    }
    if (base.trigger?.minBranches > (base.trigger?.maxBranches ?? 10))
      fail("landing.trains.trigger.minBranches is above maxBranches.");
  }
  const machine = config?.machine;
  if (machine?.platforms !== undefined || machine?.slots !== undefined) {
    const fail = (m) => {
      throw Error(`${m} (${glob})`);
    };
    for (const key of Object.keys(machine))
      if (!MACHINE_FILE_KEYS.includes(key))
        fail(`machine.${key} is not a known setting.`);
    const platforms = machine.platforms ?? {};
    if (!isRecord(platforms)) fail("machine.platforms must be an object.");
    for (const [name, env] of Object.entries(platforms)) {
      const at = `machine.platforms.${name}`;
      if (!isRecord(env)) fail(`${at} must be an object.`);
      for (const key of Object.keys(env))
        if (!MACHINE_PLATFORM_KEYS.includes(key))
          fail(`${at}.${key} is not a known setting.`);
      if (!["native", "container", "vm"].includes(env.kind))
        fail(`${at}.kind must be native, container or vm.`);
      if (env.kind !== "native") checkArgv(env.wrapper, `${at}.wrapper`, fail);
      if (env.cleanup !== undefined)
        checkArgv(env.cleanup, `${at}.cleanup`, fail);
    }
    const slots = machine.slots ?? {};
    if (!isRecord(slots)) fail("machine.slots must be an object.");
    for (const [name, n] of Object.entries(slots))
      if (!Number.isInteger(n) || n < 1 || n > 32)
        fail(`machine.slots.${name} must be a whole number 1–32.`);
    for (const [name, env] of Object.entries(platforms))
      if (env.slot && slots[env.slot] === undefined)
        fail(
          `machine.platforms.${name}.slot names ${env.slot}, which machine.slots does not declare.`,
        );
  }
  if (config?.lease !== undefined) {
    const fail = (m) => {
      throw Error(`${m} (${glob})`);
    };
    checkBlock(LEASE_KEYS, config.lease, "lease", fail);
  }
  return { warnings };
}

// Machine keys belong in the global file only (LT7.3, LT15.3): a repository
// file that sets them is refused, naming the global file.
export function assertNoMachineKeys(value, file, globalFile) {
  for (const key of ["platforms", "slots"])
    if (value?.machine?.[key] !== undefined)
      throw Error(`machine.${key} is set in ${file}. Put it in ${globalFile}.`);
  for (const key of Object.keys(value?.serve ?? {}))
    throw Error(`serve.${key} is set in ${file}. Put it in ${globalFile}.`);
  if (value?.serve !== undefined && typeof value.serve !== "object")
    throw Error(`serve is set in ${file}. Put it in ${globalFile}.`);
  if (value?.lease !== undefined)
    throw Error(`lease is set in ${file}. Put it in ${globalFile}.`);
}

export const leaseSettings = (config) => ({
  ...LEASE_DEFAULTS,
  ...(config?.lease ?? {}),
});
