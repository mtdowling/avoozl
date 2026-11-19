// The host sandbox of a contained session (vm-harness vm-2.2, D3): the CLI
// keeps its own sign-in store, starts only its listed programs, reaches only
// its own broker socket and proxy port, and its git calls are pinned to the
// task folder. Every other session's sandbox is unchanged.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SECURITY_TOOL,
  confineChild,
  sandboxKind,
  sandboxProfile,
} from "../sandbox.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const definition = { name: "cli", hash: "h" };

test("without contained, the macOS profile is as before, byte for byte", () => {
  assert.equal(
    sandboxProfile({
      writeRoots: ["/w"],
      secrets: ["/h/.ssh"],
      readable: ["/h/brief"],
      writable: ["/h/log"],
      network: { mode: "restricted", ports: [8080] },
      home: "/h",
      readRoots: ["/h/.claude"],
    }),
    [
      "(version 1)",
      "(allow default)",
      "(deny network*)",
      '(allow network-outbound (remote ip "localhost:8080"))',
      "(deny file-write*)",
      '(allow file-write* (subpath "/w") (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper") (regex #"^/dev/fd/"))',
      '(deny file-read-data file-read-xattr (subpath "/h"))',
      '(allow file-read-data file-read-xattr (subpath "/h/.claude") (subpath "/w"))',
      '(deny file-read* file-write* (subpath "/h/.ssh"))',
      '(allow file-read* (subpath "/h/brief"))',
      '(allow file-read* file-write* (subpath "/h/log"))',
      '(deny mach-lookup (global-name "com.apple.SecurityServer") (global-name "com.apple.securityd") (global-name "com.apple.securityd.xpc") (global-name "com.apple.security.keychaind"))',
    ].join("\n"),
  );
});

function containedProfile(home, extra = {}) {
  const confined = confineChild(["/opt/cli/bin/cli", "-p"], {
    definition,
    writeRoots: [path.join(home, "work")],
    secrets: [path.join(home, ".ssh"), path.join(home, "Library", "Keychains")],
    network: { mode: "restricted", ports: [41000] },
    kind: "sandbox-exec",
    home,
    readRoots: [],
    contained: {
      signIn: { darwin: "keychain" },
      programs: ["/opt/cli/bin/cli", "/usr/bin/git", SECURITY_TOOL],
      brokerSocket: path.join(home, "state", "exec.sock"),
      git: { gitDir: "/r/.git/worktrees/w", workTree: "/w", hooks: "/nh" },
    },
    ...extra,
  });
  return { confined, profile: confined.argv[2] };
}

test("a contained macOS profile opens the keychain, starts only its programs and never security", () => {
  const home = fs.realpathSync.native(temporaryDirectory("avoozl-contained-"));
  const { confined, profile } = containedProfile(home);
  const keychains = path.join(home, "Library", "Keychains");
  // The keychain's services and files are the CLI's sign-in store.
  assert.doesNotMatch(profile, /com\.apple\.SecurityServer/);
  assert.match(
    profile,
    new RegExp(
      `\\(allow file-read\\* file-write\\* \\(subpath "${keychains}"\\)\\)`,
    ),
  );
  assert.doesNotMatch(
    profile,
    new RegExp(`deny file-read\\* file-write\\*.*${keychains}`),
  );
  // Programs: denied, then only the list, and security never.
  const lines = profile.split("\n");
  const denyExec = lines.indexOf("(deny process-exec*)");
  assert.ok(denyExec > 0);
  assert.equal(
    lines[denyExec + 1],
    '(allow process-exec* (literal "/opt/cli/bin/cli") (literal "/usr/bin/git"))',
  );
  assert.equal(
    lines[denyExec + 2],
    `(deny process-exec* (literal "${SECURITY_TOOL}"))`,
  );
  // No runtime services; one Unix socket, the session's own broker.
  assert.match(
    profile,
    /deny mach-lookup \(global-name-regex #"\^com\\\.apple\\\.container\\\."\)/,
  );
  assert.equal(
    lines.filter((line) => line.includes("unix-socket")).join("\n"),
    `(allow network-outbound (remote unix-socket (path-literal "${path.join(home, "state", "exec.sock")}")))`,
  );
  // The proxy's one loopback port, as sandbox.network ports work.
  assert.match(
    profile,
    /\(allow network-outbound \(remote ip "localhost:41000"\)\)/,
  );
  // The CLI's git calls are pinned to the task folder, with no hooks.
  assert.equal(confined.env.GIT_DIR, "/r/.git/worktrees/w");
  assert.equal(confined.env.GIT_WORK_TREE, "/w");
  const config = Object.fromEntries(
    Array.from({ length: Number(confined.env.GIT_CONFIG_COUNT) }, (_, i) => [
      confined.env[`GIT_CONFIG_KEY_${i}`],
      confined.env[`GIT_CONFIG_VALUE_${i}`],
    ]),
  );
  assert.deepEqual(config, {
    "credential.helper": "",
    "core.hooksPath": "/nh",
    "core.fsmonitor": "false",
  });
});

test("a contained session with no keychain sign-in keeps the keychain shut", () => {
  const home = fs.realpathSync.native(temporaryDirectory("avoozl-contained-"));
  const { profile } = containedProfile(home, {
    contained: {
      signIn: {},
      programs: ["/opt/cli/bin/cli"],
      brokerSocket: path.join(home, "exec.sock"),
    },
  });
  assert.match(profile, /com\.apple\.SecurityServer/);
  assert.match(
    profile,
    new RegExp(`deny file-read\\* file-write\\* .*Library/Keychains`),
  );
});

test("a Linux session hides the runtime folder and container sockets; a contained one binds its sign-in file", () => {
  const home = fs.realpathSync.native(temporaryDirectory("avoozl-bwrap-home-")),
    runtime = temporaryDirectory("avoozl-bwrap-run-"),
    agent = path.join(runtime, "agent.sock"),
    credentials = path.join(home, ".cli", ".credentials.json"),
    work = path.join(home, "work");
  fs.writeFileSync(agent, "");
  fs.mkdirSync(path.dirname(credentials));
  fs.writeFileSync(credentials, "{}");
  const env = { XDG_RUNTIME_DIR: runtime, SSH_AUTH_SOCK: agent, PATH: "/bin" };
  const plain = confineChild(["cli"], {
    definition,
    writeRoots: [work],
    secrets: [],
    kind: "bwrap",
    env,
    home,
    readRoots: [],
  }).argv;
  const joined = plain.join(" ");
  assert.ok(
    joined.includes(`--tmpfs ${fs.realpathSync.native(runtime)}`) ||
      joined.includes(`--tmpfs ${runtime}`),
  );
  assert.ok(joined.includes(`--ro-bind /dev/null ${agent}`));
  assert.ok(
    !joined.includes(credentials),
    "a plain session has no sign-in file",
  );
  const contained = confineChild(["cli"], {
    definition,
    writeRoots: [work],
    secrets: [],
    kind: "bwrap",
    env,
    home,
    readRoots: [],
    network: { mode: "restricted", ports: [41000] },
    contained: {
      signIn: { linux: [credentials] },
      programs: [],
      brokerSocket: path.join(home, "exec.sock"),
      sockets: ["/state/box/s/exec.sock", "/state/box/s/proxy.sock"],
      forward: [
        "node",
        "/app/box-forward.mjs",
        "41000",
        "/state/box/s/proxy.sock",
        "--",
      ],
    },
  }).argv;
  const at = contained.indexOf("--");
  // The sign-in file is bound read-write into the empty home; nothing else
  // under home but the write roots is writable.
  assert.ok(
    contained.join(" ").includes(`--bind ${credentials} ${credentials}`),
  );
  assert.deepEqual(
    contained
      .flatMap((part, i) => (part === "--bind" ? [contained[i + 1]] : []))
      .filter((file) => file.startsWith(home)),
    [work, credentials],
  );
  assert.ok(contained.includes("--unshare-net"));
  assert.ok(
    contained
      .join(" ")
      .includes("--bind /state/box/s/proxy.sock /state/box/s/proxy.sock"),
  );
  assert.deepEqual(contained.slice(at + 1), [
    "node",
    "/app/box-forward.mjs",
    "41000",
    "/state/box/s/proxy.sock",
    "--",
    "cli",
  ]);
  // A restricted network without contained is still refused on Linux.
  assert.throws(
    () =>
      confineChild(["cli"], {
        definition,
        writeRoots: [work],
        secrets: [],
        kind: "bwrap",
        env,
        network: { mode: "restricted", ports: [1] },
      }),
    /loopback ports is not supported/,
  );
});

test("a contained session never runs without the host sandbox", () => {
  assert.throws(
    () =>
      confineChild(["cli"], {
        definition,
        writeRoots: ["/w"],
        secrets: [],
        kind: null,
        contained: { programs: [], brokerSocket: "/s" },
      }),
    /runs its CLI only inside Avoozl's sandbox/,
  );
});

const macos =
  process.platform === "darwin" && sandboxKind()
    ? false
    : "needs macOS with sandbox-exec usable here (not nested in another sandbox)";

test("on macOS a contained child cannot run security, and can read its keychain folder", {
  skip: macos,
}, () => {
  const work = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-contained-live-")),
    ),
    script = path.join(work, "probe.mjs");
  fs.writeFileSync(
    script,
    [
      'import { spawnSync } from "node:child_process";',
      'import fs from "node:fs";',
      `const security = spawnSync(${JSON.stringify(SECURITY_TOOL)}, ["list-keychains"], { encoding: "utf8" });`,
      'let keychains = "closed";',
      `try { fs.readdirSync(${JSON.stringify(path.join(os.homedir(), "Library", "Keychains"))}); keychains = "open"; } catch {}`,
      "console.log(JSON.stringify({ security: security.status, error: security.error?.code ?? null, keychains }));",
    ].join("\n"),
  );
  try {
    const confined = confineChild([process.execPath, script], {
      definition,
      writeRoots: [work],
      secrets: [path.join(os.homedir(), "Library", "Keychains")],
      kind: "sandbox-exec",
      contained: {
        signIn: { darwin: "keychain" },
        programs: [process.execPath],
        brokerSocket: path.join(work, "exec.sock"),
      },
    });
    const run = spawnSync(confined.argv[0], confined.argv.slice(1), {
      encoding: "utf8",
      env: confined.env,
    });
    assert.equal(run.status, 0, run.stderr);
    const seen = JSON.parse(run.stdout.trim().split("\n").at(-1));
    assert.notEqual(seen.security, 0, "security did not run");
    assert.equal(seen.keychains, "open");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
