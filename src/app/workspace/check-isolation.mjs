// One isolation setting per repository, used for its checks and its worker
// commands. A repository's `isolation` is {run, worker, runtime, image,
// network, readable, writable, prepare, strangers, strangerRoles}:
//
//   run       "sandbox" (the default): the process sandbox (sandbox.mjs)
//             with write roots of the check's folder, its own temp folder,
//             the repository's cache folder and `writable`.
//             "container": the runtime's `run` of `image`, the folder
//             mounted at the same path and no home folder.
//             "unconfined": as before sandboxes, and only with this
//             machine's opt-in. A machine with no sandbox runs a "sandbox"
//             check unconfined, and its record says so.
//   worker    "sandbox" (the default): a `process` session runs as today.
//             "container": a contained session (vm-harness VM2): the CLI in
//             the host sandbox, every command it runs in the session's box.
//   runtime   "apple-container", "podman" or "docker"; absent, the picker
//             takes the first that works here (pickRuntime).
//   network   "off" (the default) or "on". A box never has a network.
//   readable  absolute paths a sandboxed check may also read.
//   writable  absolute paths it may also write.
//   prepare   argv run once per worktree and commit before its checks,
//             outside isolation, with the checks' environment allowlist.
//   strangers how stranger input runs on a public repository (VM6.10):
//             "container" (the default), "hold" or "host".
//   strangerRoles  the role-table roles, and "checks", that `strangers`
//             covers; absent, all of them (VM6.11).
//
// Every check record names the isolation it ran under, and the runtime.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fail } from "../store/store.mjs";
import { HARNESS_UNCONFINED } from "../executors/harness-definitions.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { ROLE_SETTINGS } from "../agents/role-table.mjs";
import {
  catalogWorkspaceRoots,
  confineChild,
  realPath,
  sandboxKind,
  sandboxNetwork,
  sandboxSecretPaths,
} from "../executors/sandbox.mjs";

export const ISOLATION_KEYS = Object.freeze([
  "run",
  "worker",
  "runtime",
  "image",
  "network",
  "readable",
  "writable",
  "prepare",
  "strangers",
  "strangerRoles",
]);
export const ISOLATION_RUNS = Object.freeze([
  "sandbox",
  "container",
  "unconfined",
]);
export const ISOLATION_WORKERS = Object.freeze(["sandbox", "container"]);
export const RUNTIMES = Object.freeze(["apple-container", "podman", "docker"]);
export const STRANGER_MODES = Object.freeze(["container", "hold", "host"]);
// What `strangerRoles` may name besides the role table's roles.
export const STRANGER_CHECKS = "checks";
// The key in harness-unconfined.json that lets checks run unconfined on
// this machine.
export const CHECKS_UNCONFINED = "checks";
const MAX_PATHS = 50;

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isArgv = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((part) => typeof part === "string" && part.length > 0);

function paths(value, label) {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > MAX_PATHS ||
    value.some((item) => typeof item !== "string" || !path.isAbsolute(item))
  )
    fail(`${label} must be at most ${MAX_PATHS} absolute paths.`);
  return value.map((item) => path.resolve(item));
}

// The stored setting after validation. `label` names it in errors.
export function isolationSetting(value, label = "isolation") {
  if (value === undefined) return undefined;
  if (!record(value)) fail(`${label} must be an object.`);
  for (const key of Object.keys(value))
    if (!ISOLATION_KEYS.includes(key))
      fail(`Unknown isolation setting ${label}.${key}.`);
  const run = value.run ?? "sandbox";
  if (!ISOLATION_RUNS.includes(run))
    fail(`${label}.run must be sandbox, container or unconfined.`);
  const worker = value.worker ?? "sandbox";
  if (!ISOLATION_WORKERS.includes(worker))
    fail(`${label}.worker must be sandbox or container.`);
  if (value.runtime !== undefined && !RUNTIMES.includes(value.runtime))
    fail(`${label}.runtime must be ${RUNTIMES.join(", ")}.`);
  if (
    value.strangers !== undefined &&
    !STRANGER_MODES.includes(value.strangers)
  )
    fail(`${label}.strangers must be ${STRANGER_MODES.join(", ")}.`);
  if (value.strangerRoles !== undefined) {
    if (!Array.isArray(value.strangerRoles))
      fail(`${label}.strangerRoles must be a list of roles.`);
    for (const role of value.strangerRoles)
      if (role !== STRANGER_CHECKS && !ROLE_SETTINGS.includes(role))
        fail(
          `${label}.strangerRoles names ${JSON.stringify(role)}, which is not a role (${[...ROLE_SETTINGS, STRANGER_CHECKS].join(", ")}).`,
        );
  }
  if (
    value.image !== undefined &&
    (typeof value.image !== "string" ||
      !value.image.trim() ||
      value.image.length > 300 ||
      /\s/.test(value.image) ||
      value.image.startsWith("-"))
  )
    fail(`${label}.image must name one container image.`);
  if (run === "container" && !value.image)
    fail(`${label}.image is needed when run is container.`);
  if (worker === "container" && !value.image)
    fail(`${label}.image is needed when worker is container.`);
  if (value.network !== undefined && !["off", "on"].includes(value.network))
    fail(`${label}.network must be off or on.`);
  if (value.prepare !== undefined && !isArgv(value.prepare))
    fail(`${label}.prepare must be command arguments.`);
  const readable = paths(value.readable, `${label}.readable`),
    writable = paths(value.writable, `${label}.writable`);
  return {
    run,
    ...(value.worker !== undefined ? { worker } : {}),
    ...(value.runtime !== undefined ? { runtime: value.runtime } : {}),
    ...(value.image !== undefined ? { image: value.image } : {}),
    network: value.network ?? "off",
    ...(readable ? { readable } : {}),
    ...(writable ? { writable } : {}),
    ...(value.prepare ? { prepare: [...value.prepare] } : {}),
    ...(value.strangers !== undefined ? { strangers: value.strangers } : {}),
    ...(value.strangerRoles !== undefined
      ? { strangerRoles: [...new Set(value.strangerRoles)] }
      : {}),
  };
}

// A repository's isolation with its defaults.
export const isolationOf = (repository) =>
  isolationSetting(repository?.isolation ?? {}, "isolation");

// Whether this machine lets checks run unconfined (the per-machine opt-in
// file harness opt-ins use).
export function checksUnconfinedAllowed(configDirectory) {
  if (!configDirectory) return false;
  const file = path.join(path.resolve(configDirectory), HARNESS_UNCONFINED);
  try {
    return (
      JSON.parse(fs.readFileSync(file, "utf8"))[CHECKS_UNCONFINED] === true
    );
  } catch {
    return false;
  }
}

const runtimes = new Map();
// Each runtime's program, and the probe that says it works here (D3): it
// exits 0 within 10 seconds.
const RUNTIME_PROGRAMS = Object.freeze({
  "apple-container": "container",
  podman: "podman",
  docker: "docker",
});
const RUNTIME_PROBES = Object.freeze({
  "apple-container": ["system", "status"],
  podman: ["version"],
  docker: ["version"],
});
export const runtimeProgram = (runtime) => RUNTIME_PROGRAMS[runtime];

// Whether `runtime` works here: {ok, output}, probed once per process.
export function probeRuntime(runtime) {
  if (!runtimes.has(runtime)) {
    const result = spawnSync(
      RUNTIME_PROGRAMS[runtime],
      RUNTIME_PROBES[runtime],
      { encoding: "utf8", timeout: 10_000 },
    );
    runtimes.set(runtime, {
      ok: result.status === 0,
      output: (result.error
        ? result.error.message
        : `${result.stdout ?? ""}${result.stderr ?? ""}`
      )
        .trim()
        .slice(0, 500),
    });
  }
  return runtimes.get(runtime);
}

// The runtimes each platform tries, in order (VM1.3), for checks and for a
// box. A box takes only Apple `container` on macOS (D11, question 2).
const RUNTIME_ORDER = Object.freeze({
  darwin: { check: RUNTIMES, box: ["apple-container"] },
  linux: { check: ["podman", "docker"], box: ["podman", "docker"] },
  win32: { check: ["podman", "docker"], box: [] },
});

// The runtime a check or a box uses here: {runtime} or {refused}. A named
// runtime is used or refused with its probe's output, never replaced by
// another (VM1.4).
export function pickRuntime({
  named,
  purpose = "check",
  platform = process.platform,
  probe = probeRuntime,
} = {}) {
  const order = (RUNTIME_ORDER[platform] ?? RUNTIME_ORDER.win32)[purpose],
    what = purpose === "box" ? "a box" : "checks";
  if (named) {
    if (!order.includes(named))
      return {
        refused: `isolation.runtime is ${named}, which cannot run ${what} on ${platform}${order.length ? `; use ${order.join(" or ")}` : ""}.`,
      };
    const seen = probe(named);
    if (!seen.ok)
      return {
        refused: `isolation.runtime is ${named}, and \`${[RUNTIME_PROGRAMS[named], ...RUNTIME_PROBES[named]].join(" ")}\` failed${seen.output ? `: ${seen.output}` : "."}`,
      };
    return { runtime: named };
  }
  for (const runtime of order) if (probe(runtime).ok) return { runtime };
  return {
    refused: order.length
      ? `no container runtime works on this machine for ${what} (tried ${order.join(", ")})`
      : `this machine cannot run ${what} in a container`,
  };
}

// The one container builder (D3): the `run` argv of a check or a box, a
// box's exec, stop and list. Every mount sits at its own host path.
export const BOX_LABEL = "avoozl.session";
export const boxName = (session) => `avoozl-${session}`;
const MOUNT_MODES = new Set(["rw", "ro"]);
const BOX_SESSION = /^process-[0-9a-f-]{36}$/;

function mountArgs(runtime, { path: at, mode }) {
  if (runtime === "apple-container")
    return mode === "ro"
      ? ["--mount", `type=bind,source=${at},target=${at},readonly`]
      : ["--volume", `${at}:${at}`];
  return ["--volume", `${at}:${at}:${mode}`];
}

// Refuse a mount that is, holds or is inside a path the host sandbox
// denies (VM2.5), naming it.
export function refuseSecretMounts(mounts, secrets) {
  const denied = secrets.map(realPath);
  for (const mount of mounts) {
    const at = realPath(mount.path);
    for (const secret of denied)
      if (
        at === secret ||
        at.startsWith(secret + path.sep) ||
        secret.startsWith(at + path.sep)
      )
        fail(
          `The container mount ${mount.path} meets ${secret}, which a child must not reach.`,
          409,
        );
  }
}

const identity = (runtime, user) => {
  if (!user) return [];
  if (runtime === "apple-container")
    return ["--uid", String(user.uid), "--gid", String(user.gid)];
  return [
    ...(runtime === "podman" ? ["--userns", "keep-id"] : []),
    "--user",
    `${user.uid}:${user.gid}`,
  ];
};

// The person's user and group IDs, or null where the platform has none.
export const hostUser = () =>
  typeof process.getuid === "function"
    ? { uid: process.getuid(), gid: process.getgid() }
    : null;

// `box` ({session}) makes a long-lived box that sleeps; otherwise a check
// that runs `argv` and is removed. A box, and a `hardened` check, run as
// `user` with every capability dropped and, on podman and docker, no new
// privileges. A box never has a network.
export function containerRunArgv(
  runtime,
  {
    image,
    mounts = [],
    network = "off",
    workdir,
    envFile,
    box = null,
    user = null,
    hardened = false,
    argv = [],
    secrets = [],
  },
) {
  const program = RUNTIME_PROGRAMS[runtime];
  if (!program) fail(`Unknown container runtime ${runtime}.`);
  if (box && !BOX_SESSION.test(box.session ?? ""))
    fail(`A box needs a process session, not ${box.session}.`);
  for (const mount of mounts)
    if (
      typeof mount.path !== "string" ||
      !path.isAbsolute(mount.path) ||
      /[:,\0\n\r]/.test(mount.path) ||
      !MOUNT_MODES.has(mount.mode)
    )
      fail(`The container cannot mount ${mount.path}.`);
  refuseSecretMounts(mounts, secrets);
  const offline = box || network !== "on";
  return [
    program,
    "run",
    ...(box
      ? [
          "-d",
          "--name",
          boxName(box.session),
          "--label",
          `${BOX_LABEL}=${box.session}`,
        ]
      : ["--rm"]),
    ...(offline
      ? [
          "--network",
          "none",
          ...(runtime === "apple-container" ? ["--no-dns"] : []),
        ]
      : []),
    ...(box || hardened
      ? [
          ...identity(runtime, user),
          "--cap-drop",
          "ALL",
          ...(runtime === "apple-container"
            ? []
            : ["--security-opt", "no-new-privileges"]),
        ]
      : []),
    ...mounts.flatMap((mount) => mountArgs(runtime, mount)),
    ...(workdir ? ["--workdir", workdir] : []),
    ...(envFile ? ["--env-file", envFile] : []),
    image,
    ...(box ? ["sleep", "infinity"] : argv),
  ];
}

// One command in a session's box, as box exec's broker runs it.
export function boxExecArgv(runtime, { session, cwd, envFile, user, command }) {
  return [
    RUNTIME_PROGRAMS[runtime],
    "exec",
    "-i",
    ...(runtime === "apple-container" ? identity(runtime, user) : []),
    "--workdir",
    cwd,
    "--env-file",
    envFile,
    boxName(session),
    "bash",
    "-c",
    command,
  ];
}

export const boxStopArgv = (runtime, session) =>
  runtime === "apple-container"
    ? ["container", "delete", "--force", boxName(session)]
    : [RUNTIME_PROGRAMS[runtime], "rm", "-f", boxName(session)];

export const boxListArgv = (runtime) =>
  runtime === "apple-container"
    ? ["container", "list", "--all", "--format", "json"]
    : [
        RUNTIME_PROGRAMS[runtime],
        "ps",
        "-a",
        "--filter",
        `label=${BOX_LABEL}`,
        "--format",
        "{{.Names}}",
      ];

// The sessions of the boxes a list shows. Apple's JSON is searched for box
// names, since its shape is not pinned here (A: `container list --format
// json`); the others print one name per line.
export function listedBoxSessions(stdout) {
  const names = String(stdout ?? "").match(/avoozl-process-[0-9a-f-]{36}/g);
  return [
    ...new Set((names ?? []).map((name) => name.slice("avoozl-".length))),
  ];
}

// Remove every labelled box whose session is not in `running` (VM2.8).
// Returns the sessions removed. `run` is spawnSync or a test's fake.
export function sweepBoxes(runtime, running, { run = spawnSync } = {}) {
  const [program, ...args] = boxListArgv(runtime);
  const listed = run(program, args, { encoding: "utf8", timeout: 30_000 });
  if (listed.status !== 0) return [];
  const removed = [];
  for (const session of listedBoxSessions(listed.stdout)) {
    if (running.has(session)) continue;
    const [stop, ...rest] = boxStopArgv(runtime, session);
    run(stop, rest, { encoding: "utf8", timeout: 30_000 });
    removed.push(session);
  }
  return removed;
}

// The image pinned to its digest (VM4.1): `{image}` as `name@sha256:...`,
// pulled first when it is not here, or {refused}. A name that already holds
// a digest is kept. A: Apple's `image inspect` prints the digest in its
// JSON; the preflight checks it.
export async function pinnedImage(runtime, image, { run = spawnSync } = {}) {
  if (image.includes("@sha256:")) return { image };
  const program = RUNTIME_PROGRAMS[runtime],
    inspect = () =>
      run(program, ["image", "inspect", image], {
        encoding: "utf8",
        timeout: 60_000,
      });
  let seen = await inspect();
  if (seen.status !== 0) {
    const pulled = await run(program, ["image", "pull", image], {
      encoding: "utf8",
      timeout: 600_000,
    });
    if (pulled.status !== 0)
      return {
        refused: `${program} could not pull ${image}: ${String(
          pulled.stderr || pulled.stdout || "",
        )
          .trim()
          .slice(0, 300)}`,
      };
    seen = await inspect();
  }
  const digest = /sha256:[0-9a-f]{64}/.exec(String(seen.stdout ?? ""))?.[0];
  if (seen.status !== 0 || !digest)
    return { refused: `${program} shows no digest for ${image}.` };
  return { image: `${image}@${digest}`, digest };
}

// An environment file a container reads (`--env-file`), mode 0600. A value
// with a line break cannot be written there, and is left out.
export function writeEnvFile(file, env) {
  const lines = Object.entries(env)
    .filter(([, value]) => typeof value === "string" && !/[\n\r\0]/.test(value))
    .map(([name, value]) => `${name}=${value}`);
  fs.writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

// The repository's cache folder for its checks: under Avoozl's state area,
// beside the state folder a check must not reach.
export function checkCacheDirectory(repositoryId, stateDirectory) {
  const state = stateDirectory ?? machineAvoozlPaths().stateDirectory;
  return path.join(
    path.dirname(path.resolve(state)),
    "avoozl-check-cache",
    String(repositoryId || "repository").replace(/[^A-Za-z0-9._-]/g, "_"),
  );
}

// How one check runs in `dir`: {argv, env, isolation, runtime?, note?,
// cleanup} for the process to start, or {refused} when the setting cannot
// run here. `env` is the checks' allowlisted environment. `stranger` is the
// stranger rule for the task's checks (strangerRule, stranger-input.mjs):
// "container" forces a container with the network off, "hold" refuses, and
// "host" runs under `run`; all three get empty cache folders of their own and
// no `writable` (VM6.4, VM6.6, VM6.10). A plugin check passes its own
// `network` (true or false, never the repository's) and `readable` folders
// (its plugin folder, read-only) (plugin-checks D4).
export function isolatedCheck(
  repository,
  dir,
  argv,
  env,
  {
    kind = sandboxKind(),
    pick = pickRuntime,
    paths: machine = machineAvoozlPaths(),
    stranger = null,
    network,
    readable: extra = [],
  } = {},
) {
  const base = isolationOf(repository),
    setting = {
      ...base,
      network: network === undefined ? base.network : network ? "on" : "off",
      readable: [...(base.readable ?? []), ...extra],
    },
    configDirectory = machine.configDirectory;
  if (stranger?.mode === "hold")
    return {
      refused: `stranger input waits in Needs you: isolation.strangers is hold (${stranger.reason})`,
    };
  const forced = stranger?.mode === "container",
    note = stranger?.mode === "host" ? STRANGER_ON_HOST : undefined,
    secrets = () =>
      sandboxSecretPaths({
        env: process.env,
        configDirectory,
        stateDirectory: machine.stateDirectory,
        workspaceRoots: catalogWorkspaceRoots(machine.catalogPath),
      });
  // A stranger's checks never share a cache folder with trusted work.
  const own = stranger
    ? fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-check-own-"))
    : null;
  const removeOwn = () =>
    own && fs.rmSync(own, { recursive: true, force: true });
  if (setting.run === "container" || forced) {
    if (!setting.image) {
      removeOwn();
      return {
        refused: `stranger input runs its checks only in a container, and isolation.image is not set`,
      };
    }
    const picked = pick({ named: setting.runtime, purpose: "check" });
    if (picked.refused) {
      removeOwn();
      return { refused: `isolation is container, and ${picked.refused}` };
    }
    const temp =
        own ?? fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-check-ctr-")),
      cache = own && path.join(own, "cache"),
      scratch = own && path.join(own, "tmp");
    if (own) {
      fs.mkdirSync(cache);
      fs.mkdirSync(scratch);
    }
    try {
      const envFile = writeEnvFile(path.join(temp, "check.env"), {
        ...env,
        ...(own ? { TMPDIR: scratch, XDG_CACHE_HOME: cache } : {}),
      });
      const argvOut = containerRunArgv(picked.runtime, {
        image: setting.image,
        network: forced ? "off" : setting.network,
        mounts: [
          { path: dir, mode: "rw" },
          ...(own
            ? [
                { path: cache, mode: "rw" },
                { path: scratch, mode: "rw" },
              ]
            : []),
          ...(setting.readable ?? []).map((file) => ({
            path: file,
            mode: "ro",
          })),
          ...(stranger
            ? []
            : (setting.writable ?? []).map((file) => ({
                path: file,
                mode: "rw",
              }))),
        ],
        workdir: dir,
        envFile,
        hardened: Boolean(stranger),
        user: stranger ? hostUser() : null,
        argv,
        secrets: stranger ? secrets() : [],
      });
      return {
        argv: argvOut,
        env,
        isolation: "container",
        runtime: picked.runtime,
        ...(note ? { note } : {}),
        cleanup: () => fs.rmSync(temp, { recursive: true, force: true }),
      };
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true });
      return { refused: error.message };
    }
  }
  if (setting.run === "unconfined" || !kind) {
    if (
      setting.run === "unconfined" &&
      !checksUnconfinedAllowed(configDirectory)
    ) {
      removeOwn();
      return {
        refused:
          "isolation is unconfined, and this machine has not allowed unconfined checks",
      };
    }
    return {
      argv: [...argv],
      env: own ? { ...env, XDG_CACHE_HOME: own } : env,
      isolation: "unconfined",
      ...(note ? { note } : {}),
      ...(own ? { cleanup: removeOwn } : {}),
    };
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-check-tmp-")),
    cache = own ?? checkCacheDirectory(repository?.id, machine.stateDirectory);
  fs.mkdirSync(cache, { recursive: true });
  const writable = stranger ? [] : (setting.writable ?? []);
  const confined = confineChild(argv, {
    definition: { name: "checks", hash: "" },
    configDirectory,
    writeRoots: [dir, temp, cache, ...writable],
    secrets: secrets(),
    readable: setting.readable ?? [],
    network:
      setting.network === "on" ? { mode: "on", ports: [] } : sandboxNetwork(),
    // The checks' allowlist already took out every credential.
    env: { ...env, TMPDIR: temp, XDG_CACHE_HOME: cache },
    kind,
  });
  return {
    argv: confined.argv,
    // confineChild drops credential names; keep the allowlist as built,
    // with the temp and cache folders.
    env: { ...env, TMPDIR: temp, XDG_CACHE_HOME: cache },
    isolation: "sandbox",
    ...(note ? { note } : {}),
    cleanup: () => {
      fs.rmSync(temp, { recursive: true, force: true });
      removeOwn();
    },
  };
}

// What every record of stranger input run on the host says (VM6.10).
export const STRANGER_ON_HOST = "stranger input on the host";

// The isolation fields a check's record keeps from its result: the
// isolation, the runtime of a container and a stranger note (VM1.6).
export const recordIsolation = (result) => ({
  ...(result.isolation !== undefined ? { isolation: result.isolation } : {}),
  ...(result.runtime ? { runtime: result.runtime } : {}),
  ...(result.isolationNote ? { isolationNote: result.isolationNote } : {}),
});

// The commandEvidence options for a repository check in `dir`: its
// environment allowlist and its isolation. `stranger` is the task's
// stranger rule for its checks, or null; a repository record a caller
// marked with withStrangerChecks (stranger-input.mjs) carries it.
export const checkOptions = (
  repository,
  dir,
  { stranger = repository?.strangerChecks ?? null } = {},
) => ({
  env: repository?.checksEnv,
  isolate: (argv, env) =>
    isolatedCheck(repository, dir, argv, env, { stranger }),
});

const prepared = new Set();
// Run the repository's `prepare` once per worktree and commit, outside
// isolation, with the checks' environment allowlist. Returns null when
// there is nothing to run (or it already ran here), else its result; a
// failed prepare runs again next time. Stranger input runs it isolated as
// its checks are (VM6.4).
export async function prepareChecks(
  repository,
  dir,
  { run, stranger = repository?.strangerChecks ?? null } = {},
) {
  const setting = isolationOf(repository);
  if (!setting.prepare) return null;
  const { commandEvidence, git } = await import("../git/git.mjs"),
    head = await git(dir, ["rev-parse", "HEAD"]).catch(() => ""),
    key = [
      repository?.id,
      path.resolve(dir),
      head,
      stranger?.mode ?? "",
      ...setting.prepare,
    ].join("\0");
  if (prepared.has(key)) return null;
  const result = await (run ?? commandEvidence)(dir, setting.prepare, {
    env: repository?.checksEnv,
    ...(stranger
      ? { isolate: checkOptions(repository, dir, { stranger }).isolate }
      : {}),
  });
  if (result.exitCode === 0) prepared.add(key);
  return result;
}

// How long the visibility probe may take: the first run pulls the image.
const PROBE_TIMEOUT_MS = 300_000;
// Exit codes the probe's own command gives: found, or not there.
const PROBE_EXITS = new Set([0, 1]);

// Why a container check in `dir` would run against an empty folder, or
// null. A folder the container VM does not share (on a Mac, Colima's
// mounts) mounts empty, so a file Avoozl writes there with random content
// must read back the same inside the container setup the checks use. A
// probe that cannot start, or a runtime error, is left to the checks to
// report. `run` is commandEvidence or a test's fake.
export async function containerBlindness(
  repository,
  dir,
  { run, env = repository?.checksEnv } = {},
) {
  if (
    isolationOf(repository).run !== "container" &&
    repository?.strangerChecks?.mode !== "container"
  )
    return null;
  const name = `.avoozl-probe-${crypto.randomBytes(8).toString("hex")}`,
    file = path.join(dir, name),
    content = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(file, content);
  try {
    const result = await (
      run ?? (await import("../git/git.mjs")).commandEvidence
    )(dir, ["sh", "-c", 'test -f "$1" && cat "$1"', "sh", file], {
      timeoutMs: PROBE_TIMEOUT_MS,
      env,
      isolate: checkOptions(repository, dir).isolate,
    });
    if (String(result.stdout ?? "").trim() === content) return null;
    if (!PROBE_EXITS.has(result.exitCode)) return null;
    return `The container cannot see ${dir}; share it with the container VM (for Colima, its mounts setting).`;
  } finally {
    fs.rmSync(file, { force: true });
  }
}
