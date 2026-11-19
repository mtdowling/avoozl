// A contained session's box, broker and preflight (vm-harness D3, D5). The
// supervisor, outside every sandbox, starts the box from the repository's
// image before the CLI, runs the broker that box exec talks to, and removes
// both after the CLI exits. The box holds no CLI, no credential and no
// socket; the runtime is reachable only from here, never from the CLI's
// process tree or the box (D9).
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile, spawn as spawnChild } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { fail } from "../store/store.mjs";
import {
  boxExecArgv,
  boxStopArgv,
  containerRunArgv,
  hostUser,
  pinnedImage,
  runtimeProgram,
  writeEnvFile,
} from "../workspace/check-isolation.mjs";
import { SIGNALS, frame, frameReader } from "./box-frames.mjs";
import { jsonLinesLog, readJsonLines } from "./egress-proxy.mjs";

const execFileAsync = promisify(execFile);
export const BOX_EXEC = fileURLToPath(
  new URL("./box-exec.mjs", import.meta.url),
);
export const BOX_FRAMES = fileURLToPath(
  new URL("./box-frames.mjs", import.meta.url),
);
export const BOX_FORWARD = fileURLToPath(
  new URL("./box-forward.mjs", import.meta.url),
);
// Where box exec's command marker lives in a box: never on the host.
export const BOX_MARKER = "/etc/avoozl-box";
// The longest Unix socket path every platform takes (macOS: 104 bytes).
const SOCKET_PATH_MAX = 100;
const OUTPUT_KEPT = 2000;

const run = async (argv, options = {}) => {
  try {
    const { stdout, stderr } = await execFileAsync(argv[0], argv.slice(1), {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 600_000,
      ...options,
    });
    return { status: 0, stdout, stderr };
  } catch (error) {
    return {
      status: Number.isInteger(error.code) ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message,
    };
  }
};
export const runCommand = run;

// A folder of the person's own, 0700, that no other user made: checked, not
// trusted, since the temp folder may be shared.
function ownFolder(folder) {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(folder);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    (typeof process.getuid === "function" && stat.uid !== process.getuid())
  )
    fail(`${folder} is not a folder of this user's own.`, 409);
  fs.chmodSync(folder, 0o700);
  return folder;
}

// The session's box folder (0700): its environment file, settings, logs
// and sockets, under the state folder, which no box mounts and no child
// reads. A state path too long for a socket uses a short folder in the
// temp folder for the sockets (machine-server D8).
export function boxFolders(stateDirectory, session) {
  const folder = ownFolder(
    path.join(path.resolve(stateDirectory), "box", session),
  );
  let sockets = folder;
  if (path.join(folder, "proxy.sock").length > SOCKET_PATH_MAX) {
    const uid = typeof process.getuid === "function" ? process.getuid() : "u";
    ownFolder(path.join(os.tmpdir(), `avoozl-${uid}`));
    sockets = ownFolder(
      path.join(
        os.tmpdir(),
        `avoozl-${uid}`,
        crypto.createHash("sha256").update(folder).digest("hex").slice(0, 12),
      ),
    );
  }
  return {
    folder,
    envFile: path.join(folder, "box.env"),
    settings: path.join(folder, "settings.json"),
    brokerLog: path.join(folder, "commands.jsonl"),
    egressLog: path.join(folder, "egress.jsonl"),
    brokerSocket: path.join(sockets, "exec.sock"),
    proxySocket: path.join(sockets, "proxy.sock"),
  };
}

// The box's environment (VM2.6): nothing copied from the host.
export function boxEnvironment({ tmp, tmpEnv = [] }) {
  return {
    HOME: path.join(tmp, "home"),
    TMPDIR: tmp,
    ...Object.fromEntries(tmpEnv.map((name) => [name, tmp])),
    LANG: "C.UTF-8",
    TERM: "dumb",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "",
    GIT_TERMINAL_PROMPT: "0",
  };
}

// The settings file a Claude Code box session reads ({box_settings}): no
// hook runs, whatever the person's settings say.
export const BOX_SETTINGS = Object.freeze({ disableAllHooks: true });

// The mounts of a session's box (VM2.4): the task folder read-write, the
// git directory read-only, the temp folder and caches read-write, and the
// readable paths read-only. A stranger's session gets no `writable`.
export function boxMounts({
  worktree,
  gitDir,
  tmp,
  caches = [],
  readable = [],
  writable = [],
}) {
  const seen = new Set();
  return [
    { path: worktree, mode: "rw" },
    ...(gitDir ? [{ path: gitDir, mode: "ro" }] : []),
    { path: tmp, mode: "rw" },
    ...caches.map((at) => ({ path: at, mode: "rw" })),
    ...writable.map((at) => ({ path: at, mode: "rw" })),
    ...readable.map((at) => ({ path: at, mode: "ro" })),
  ].filter((mount) => !seen.has(mount.path) && seen.add(mount.path));
}

// Start the box (`run -d`), write its marker as root, and return its
// pinned image. Refuses with the runtime's own words.
export async function startBox(
  { runtime, session, image, mounts, envFile, user = hostUser(), secrets = [] },
  { exec = run } = {},
) {
  const pinned = await pinnedImage(runtime, image, {
    run: (p, a) => exec([p, ...a]),
  });
  if (pinned.refused) fail(pinned.refused, 409);
  const argv = containerRunArgv(runtime, {
    image: pinned.image,
    box: { session },
    user,
    mounts,
    envFile,
    secrets,
  });
  const started = await exec(argv);
  if (started.status !== 0)
    fail(
      `${runtimeProgram(runtime)} could not start the box: ${String(
        started.stderr || started.stdout,
      )
        .trim()
        .slice(0, 300)}`,
      409,
    );
  const marked = await exec(boxMarkerArgv(runtime, session));
  if (marked.status !== 0)
    fail(
      `The box started, but its marker could not be written: ${String(marked.stderr).trim().slice(0, 300)}`,
      409,
    );
  return { image: pinned.image, digest: pinned.digest ?? null, argv };
}

// Write the session's marker into the box, as root inside it.
export const boxMarkerArgv = (runtime, session) => [
  runtimeProgram(runtime),
  "exec",
  ...(runtime === "apple-container"
    ? ["--uid", "0", "--gid", "0"]
    : ["--user", "0"]),
  `avoozl-${session}`,
  "sh",
  "-c",
  `printf '%s\\n' '${session}' > ${BOX_MARKER}`,
];

export async function stopBox(runtime, session, { exec = run } = {}) {
  return exec(boxStopArgv(runtime, session), { timeout: 60_000 });
}

const inside = (child, parent) =>
  child === parent || child.startsWith(parent + path.sep);

// The broker (D3): a Unix socket, 0600 in a 0700 folder, that runs each
// box exec request in this session's box only. `roots` are the folders a
// command may start in (the task folder and the session's temp folder);
// `execArgv(cwd, command)` is the runtime's exec line for this session's
// box, so no request can name another box. `log(entry)` gets {at, command,
// cwd, code, output} for the session's evidence. Resolves to {path, close}.
export async function startBoxBroker({
  socketPath,
  roots,
  execArgv,
  spawn = spawnChild,
  log = () => {},
}) {
  const realRoots = roots.map((root) => fs.realpathSync.native(root));
  ownFolder(path.dirname(socketPath));
  fs.rmSync(socketPath, { force: true });
  const children = new Set();
  const server = net.createServer((socket) => {
    let child = null,
      output = "";
    const send = (type, payload) => {
      if (!socket.destroyed) socket.write(frame(type, payload));
    };
    const refuse = (message) => {
      send("F", message);
      socket.end();
    };
    socket.on("error", () => child?.kill("SIGKILL"));
    socket.on("close", () => {
      if (child && child.exitCode === null) child.kill("SIGKILL");
    });
    socket.on(
      "data",
      frameReader(
        (type, payload) => {
          if (type === "H" && !child) {
            let hello;
            try {
              hello = JSON.parse(payload.toString("utf8"));
            } catch {
              return refuse("box exec sent a bad request.");
            }
            const { command, cwd } = hello ?? {};
            if (typeof command !== "string" || typeof cwd !== "string")
              return refuse("box exec sent a bad request.");
            let folder;
            try {
              folder = fs.realpathSync.native(cwd);
            } catch {
              return refuse(`The folder ${cwd} does not exist.`);
            }
            if (!realRoots.some((root) => inside(folder, root)))
              return refuse(
                `box exec runs commands only in the task folder or the session's temp folder, not ${cwd}.`,
              );
            const argv = execArgv(folder, command),
              at = new Date().toISOString();
            child = spawn(argv[0], argv.slice(1), {
              stdio: ["pipe", "pipe", "pipe"],
            });
            children.add(child);
            const keep = (chunk) => {
              if (output.length < OUTPUT_KEPT)
                output += chunk
                  .toString("utf8")
                  .slice(0, OUTPUT_KEPT - output.length);
            };
            child.stdout.on("data", (chunk) => {
              keep(chunk);
              send("O", chunk);
            });
            child.stderr.on("data", (chunk) => {
              keep(chunk);
              send("R", chunk);
            });
            child.stdin.on("error", () => {});
            child.on("error", (error) => {
              children.delete(child);
              log({
                at,
                command,
                cwd: folder,
                code: 127,
                output: error.message,
              });
              send("X", { code: 127 });
              socket.end();
            });
            child.on("close", (code, signal) => {
              children.delete(child);
              const exit = Number.isInteger(code)
                ? code
                : signal
                  ? 128 + (os.constants.signals[signal] ?? 0)
                  : 1;
              log({ at, command, cwd: folder, code: exit, output });
              send("X", { code: exit });
              socket.end();
            });
          } else if (type === "I" && child) child.stdin.write(payload);
          else if (type === "E" && child) child.stdin.end();
          else if (type === "S" && child) {
            const signal = payload.toString("utf8");
            if (SIGNALS.has(signal)) child.kill(signal);
          } else if (!child) refuse("box exec must say hello first.");
        },
        () => refuse("box exec sent a frame that is too large."),
      ),
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  fs.chmodSync(socketPath, 0o600);
  return {
    path: socketPath,
    close: () =>
      new Promise((resolve) => {
        for (const child of children) child.kill("SIGKILL");
        server.close(() => resolve());
        fs.rmSync(socketPath, { force: true });
      }),
  };
}

// Everything a contained session needs before its CLI starts, and what it
// removes after: the box, the broker and the egress proxy (D3). `plan` is
// {runtime, session, image, worktree, gitDir, tmp, caches, readable,
// writable, tmpEnv, hosts, secrets, stateDirectory}. Resolves to
// {folders, image, digest, proxy, broker, close()}.
export async function openContainedSession(
  plan,
  { exec = run, startProxy, platform = process.platform } = {},
) {
  const folders = boxFolders(plan.stateDirectory, plan.session);
  fs.mkdirSync(path.join(plan.tmp, "home"), { recursive: true, mode: 0o700 });
  writeEnvFile(folders.envFile, boxEnvironment(plan));
  fs.writeFileSync(folders.settings, JSON.stringify(BOX_SETTINGS) + "\n", {
    mode: 0o600,
  });
  const opened = [];
  const close = async () => {
    for (const step of opened.reverse()) await step().catch(() => {});
  };
  try {
    const box = await startBox(
      {
        runtime: plan.runtime,
        session: plan.session,
        image: plan.image,
        envFile: folders.envFile,
        mounts: boxMounts(plan),
        secrets: plan.secrets ?? [],
      },
      { exec },
    );
    opened.push(() => stopBox(plan.runtime, plan.session, { exec }));
    const user = hostUser();
    const broker = await startBoxBroker({
      socketPath: folders.brokerSocket,
      roots: [plan.worktree, plan.tmp],
      execArgv: (cwd, command) =>
        boxExecArgv(plan.runtime, {
          session: plan.session,
          cwd,
          envFile: folders.envFile,
          user,
          command,
        }),
      log: jsonLinesLog(folders.brokerLog),
    });
    opened.push(() => broker.close());
    const proxy = await startProxy({
      hosts: plan.hosts,
      listen: platform === "linux" ? { path: folders.proxySocket } : {},
      log: jsonLinesLog(folders.egressLog),
    });
    opened.push(() => proxy.close());
    return {
      folders,
      image: box.image,
      digest: box.digest,
      broker,
      proxy,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

// The commands box exec ran for a session, from its broker's log.
export const boxCommands = readJsonLines;
