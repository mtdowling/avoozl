// Box exec and its broker (vm-harness vm-2.3, D3), with a fake runtime, and
// a contained session's box on a real runtime where one is installed.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BOX_EXEC,
  BOX_MARKER,
  boxCommands,
  boxEnvironment,
  boxFolders,
  boxMounts,
  openContainedSession,
  startBoxBroker,
} from "../box-session.mjs";
import { startEgressProxy } from "../egress-proxy.mjs";
import {
  boxListArgv,
  pickRuntime,
  runtimeProgram,
} from "../../workspace/check-isolation.mjs";

const SESSION = "process-00000000-0000-4000-8000-0000000000b1";

function folders(t) {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-box-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const worktree = path.join(root, "task"),
    tmp = path.join(root, "tmp"),
    state = path.join(root, "state");
  for (const folder of [worktree, tmp]) fs.mkdirSync(folder);
  return { root, worktree, tmp, state };
}

// Run box exec as a CLI's shell prefix would: one argument, in `cwd`.
function boxExec(socket, command, { cwd, input, signalAfter } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BOX_EXEC, command], {
      cwd,
      env: { PATH: process.env.PATH, AVOOZL_BOX_SOCKET: socket },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
    if (signalAfter) setTimeout(() => child.kill("SIGTERM"), signalAfter);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

// A fake runtime: the "box" is a bash on this machine, and each exec line
// records which session's box it named.
async function fakeBroker(t, where) {
  const named = [];
  const socketPath = boxFolders(where.state, SESSION).brokerSocket;
  const broker = await startBoxBroker({
    socketPath,
    roots: [where.worktree, where.tmp],
    execArgv: (cwd, command) => {
      named.push({ box: `avoozl-${SESSION}`, cwd, command });
      return ["bash", "-c", `cd "$1" && eval "$2"`, "box", cwd, command];
    },
    log: () => {},
  });
  t.after(() => broker.close());
  return { broker, named, socketPath };
}

test("box exec passes its command and folder, relays its streams and returns its code", async (t) => {
  const where = folders(t),
    { socketPath, named } = await fakeBroker(t, where);
  const ran = await boxExec(
    socketPath,
    'read line; echo "out:$line:$(pwd)"; echo err >&2; exit 7',
    { cwd: where.worktree, input: "hello\n" },
  );
  assert.equal(ran.code, 7);
  assert.equal(ran.stdout, `out:hello:${where.worktree}\n`);
  assert.equal(ran.stderr, "err\n");
  assert.deepEqual(named, [
    {
      box: `avoozl-${SESSION}`,
      cwd: where.worktree,
      command: 'read line; echo "out:$line:$(pwd)"; echo err >&2; exit 7',
    },
  ]);
  // Its socket is 0600 in a 0700 folder.
  assert.equal(fs.statSync(socketPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(socketPath)).mode & 0o777, 0o700);
});

test("box exec passes SIGTERM on to the command", async (t) => {
  const where = folders(t),
    { socketPath } = await fakeBroker(t, where);
  const ran = await boxExec(
    socketPath,
    'trap "echo stopped; exit 143" TERM; echo ready; while true; do sleep 0.1; done',
    { cwd: where.worktree, signalAfter: 1500 },
  );
  assert.equal(ran.code, 143);
  assert.match(ran.stdout, /ready\nstopped/);
});

test("the broker refuses a folder outside the task and temp folders", async (t) => {
  const where = folders(t),
    { socketPath, named } = await fakeBroker(t, where);
  const ran = await boxExec(socketPath, "true", { cwd: os.homedir() });
  assert.equal(ran.code, 126);
  assert.match(
    ran.stderr,
    /only in the task folder or the session's temp folder/,
  );
  assert.deepEqual(named, [], "nothing ran");
  // The temp folder is a mount too.
  assert.equal((await boxExec(socketPath, "true", { cwd: where.tmp })).code, 0);
  // Without the socket box exec runs nothing on the host.
  const bare = spawnSync(process.execPath, [BOX_EXEC, "touch ran"], {
    cwd: where.worktree,
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.equal(bare.status, 126);
  assert.equal(fs.existsSync(path.join(where.worktree, "ran")), false);
});

test("the box environment copies nothing from the host", () => {
  const env = boxEnvironment({ tmp: "/t", tmpEnv: ["CLAUDE_CODE_TMPDIR"] });
  assert.deepEqual(Object.keys(env).sort(), [
    "CLAUDE_CODE_TMPDIR",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
    "GIT_TERMINAL_PROMPT",
    "HOME",
    "LANG",
    "TERM",
    "TMPDIR",
  ]);
  assert.equal(env.HOME, "/t/home");
  assert.deepEqual(
    boxMounts({
      worktree: "/w",
      gitDir: "/r/.git",
      tmp: "/t",
      caches: ["/c"],
      readable: ["/opt/sdk"],
    }),
    [
      { path: "/w", mode: "rw" },
      { path: "/r/.git", mode: "ro" },
      { path: "/t", mode: "rw" },
      { path: "/c", mode: "rw" },
      { path: "/opt/sdk", mode: "ro" },
    ],
  );
});

// A real runtime and a small local image with bash, or a reason to skip.
const real = (() => {
  const picked = pickRuntime({ purpose: "box" });
  if (!picked.runtime)
    return { skip: `no box runtime here: ${picked.refused}` };
  const image = "docker.io/library/bash:5";
  const listed = spawnSync(
    runtimeProgram(picked.runtime),
    ["image", "inspect", image],
    {
      encoding: "utf8",
    },
  );
  if (listed.status !== 0)
    return { skip: `no local ${image} image to run without pulling` };
  return { runtime: picked.runtime, image, skip: false };
})();

test("a contained session's box has no network, its mounts at their host paths, no home, and box exec reaches it", {
  skip: real.skip,
}, async (t) => {
  const where = folders(t);
  fs.writeFileSync(path.join(where.worktree, "README.md"), "app\n");
  const opened = await openContainedSession(
    {
      runtime: real.runtime,
      session: SESSION,
      image: real.image,
      worktree: where.worktree,
      tmp: where.tmp,
      hosts: ["api.example.com:443"],
      stateDirectory: where.state,
    },
    { startProxy: startEgressProxy },
  );
  t.after(() => opened.close());
  assert.match(opened.image, /@sha256:[0-9a-f]{64}$/);
  const socket = opened.folders.brokerSocket;
  const ran = await boxExec(
    socket,
    [
      "uname -s",
      `cat ${BOX_MARKER}`,
      "cat README.md",
      "echo made > made.txt",
      "id -u",
      `test -e ${os.homedir()}/.ssh -o -e ${os.homedir()}/.config && echo home || echo nohome`,
      "(exec 3<>/dev/tcp/1.1.1.1/443) 2>/dev/null && echo net || echo nonet",
      "ls /sys/class/net",
    ].join("; "),
    { cwd: where.worktree },
  );
  assert.equal(ran.code, 0, ran.stderr);
  const lines = ran.stdout.trim().split("\n");
  assert.deepEqual(lines.slice(0, 3), ["Linux", SESSION, "app"]);
  assert.equal(lines[3], String(process.getuid()));
  assert.equal(lines[4], "nohome");
  assert.equal(lines[5], "nonet");
  assert.deepEqual(lines.slice(6), ["lo"]);
  // The file it wrote is the person's own, on the host.
  assert.equal(
    fs.readFileSync(path.join(where.worktree, "made.txt"), "utf8"),
    "made\n",
  );
  assert.equal(
    fs.statSync(path.join(where.worktree, "made.txt")).uid,
    process.getuid(),
  );
  // The broker kept the command for the session's evidence.
  assert.equal(boxCommands(opened.folders.brokerLog)[0].code, 0);
  await opened.close();
  const [program, ...args] = boxListArgv(real.runtime);
  const listed = spawnSync(program, args, { encoding: "utf8" });
  assert.doesNotMatch(listed.stdout, new RegExp(SESSION), "the box is removed");
});
