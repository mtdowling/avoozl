// The sandbox for unattended `process` children (R95.6, design §4.28). A
// child runs as the owner, so the person-only refusal in the CLI is only a
// speed bump (R95.5). "A child never does a person-only act" holds only
// because the child cannot reach what such an act needs: the workspace
// databases, the GitHub and other credentials, Avoozl's machine config and
// state, and the Kiro Crew home. Those paths are neither readable nor
// writable, writes go only to the session's write roots, the network is off
// (or, on macOS, limited to named loopback ports such as a proxy), and the
// credential variables are taken out of the environment.
//
// macOS: sandbox-exec with a generated profile. Linux: bubblewrap. A machine
// with neither (Windows, or a Linux without usable user namespaces) has no
// sandbox, and the harness runs there only with the person's per-machine
// opt-in at its approved hash (R94.5, `harness-unconfined.json`).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fail } from "./store.mjs";
import {
  HARNESS_UNCONFINED,
  INNER_SANDBOX_OFF,
} from "./harness-definitions.mjs";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
// Keychain services: gh, git's osxkeychain helper and most CLIs keep tokens
// there, and an item made with /usr/bin/security opens to any caller of it.
const KEYCHAIN_SERVICES = [
  "com.apple.SecurityServer",
  "com.apple.securityd",
  "com.apple.securityd.xpc",
  "com.apple.security.keychaind",
];
const LOOPBACK_PORT = /^localhost:([1-9][0-9]{0,4})$/;
const SECRET_NAME =
  /(TOKEN|SECRET|PASSW(OR)?D|API_?KEY|CREDENTIAL|PRIVATE_KEY|_AUTH$|^AUTH_)/i;
const SECRET_VARIABLES = new Set([
  "SSH_AUTH_SOCK",
  "GIT_ASKPASS",
  "SSH_ASKPASS",
  "SUDO_ASKPASS",
  "GH_CONFIG_DIR",
]);
// Markers the CLI's speed bump reads (R95.5); they hold no secret.
const KEPT_MARKERS = new Set([
  "AVOOZL_CHILD",
  "AVOOZL_CHILD_SESSION",
  "KIROCREW_SPAWNED",
]);

// The real path of a file that may not exist yet: the nearest existing
// parent resolved, the rest joined. macOS profiles match real paths only
// (/tmp is /private/tmp).
function realPath(file) {
  const resolved = path.resolve(file);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    const parent = path.dirname(resolved);
    if (parent === resolved) return resolved;
    return path.join(realPath(parent), path.basename(resolved));
  }
}

const inside = (child, parent) =>
  child === parent || child.startsWith(parent + path.sep);

// The workspaces the machine catalog lists, read without creating it.
export function catalogWorkspaceRoots(catalogPath) {
  if (!catalogPath || !fs.existsSync(catalogPath)) return [];
  let db;
  try {
    db = new DatabaseSync(catalogPath, { readOnly: true });
    return db
      .prepare("SELECT root FROM workspaces")
      .all()
      .map((row) => row.root);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

// Every path a child must neither read nor write. `home` and `env` are the
// child's, so a test can use a fake home.
// shortcut: a workspace's database is denied through its `.avoozl` folder,
// the default place; a workspace with a custom `dbPath` elsewhere is not
// covered. Read the saved config here if one appears.
export function sandboxSecretPaths({
  home = os.homedir(),
  env = process.env,
  configDirectory,
  stateDirectory,
  workspaceRoots = [],
}) {
  const xdg = env.XDG_CONFIG_HOME || path.join(home, ".config");
  const paths = [
    // GitHub CLI and git credentials.
    env.GH_CONFIG_DIR || path.join(xdg, "gh"),
    path.join(home, ".config", "gh"),
    path.join(home, ".git-credentials"),
    path.join(xdg, "git", "credentials"),
    path.join(home, ".netrc"),
    path.join(home, ".ssh"),
    path.join(home, ".aws"),
    // Codex's default home: its auth.json (an API key or ChatGPT tokens)
    // and the person's own transcripts. A Codex child runs with its own
    // CODEX_HOME in a project write root instead (found by P58).
    path.join(home, ".codex"),
    // Avoozl's own machine config (approvals, opt-ins) and state (the
    // supervisor's database, the catalog).
    configDirectory,
    stateDirectory,
    // The Kiro Crew home: its gateway secret, chats and memory.
    env.KIROCREW_HOME || path.join(home, ".kiro", "crew"),
    ...workspaceRoots.map((root) => path.join(root, ".avoozl")),
  ];
  if (process.platform === "darwin")
    paths.push(path.join(home, "Library", "Keychains"));
  return [...new Set(paths.filter(Boolean).map(realPath))];
}

// The child's environment: credential variables removed, except the names
// a harness needs to sign in to its own provider (`keep`). Git gets no
// credential helper and never prompts.
export function sandboxEnv(env = process.env, { keep = [] } = {}) {
  const out = {};
  for (const [name, value] of Object.entries(env)) {
    if (keep.includes(name) || KEPT_MARKERS.has(name)) {
      out[name] = value;
      continue;
    }
    if (SECRET_VARIABLES.has(name) || SECRET_NAME.test(name)) continue;
    if (/^(AWS_|KIROCREW_|KIRO_|GH_|GITHUB_)/.test(name)) continue;
    if (/^AVOOZL_/.test(name)) continue;
    if (/^GIT_CONFIG_(COUNT|KEY_|VALUE_)/.test(name)) continue;
    out[name] = value;
  }
  // An empty helper value clears every configured helper.
  out.GIT_CONFIG_COUNT = "1";
  out.GIT_CONFIG_KEY_0 = "credential.helper";
  out.GIT_CONFIG_VALUE_0 = "";
  out.GIT_TERMINAL_PROMPT = "0";
  out.GCM_INTERACTIVE = "never";
  return out;
}

// A project's network setting: absent is off; a list of `localhost:PORT`
// entries allows only those loopback ports (a proxy the project names).
export function sandboxNetwork(value) {
  if (value === undefined || value === "off") return { mode: "off", ports: [] };
  if (!Array.isArray(value) || !value.length)
    fail('sandbox.network must be "off" or a list of localhost:PORT entries.');
  const ports = value.map((item) => {
    const match = typeof item === "string" && LOOPBACK_PORT.exec(item);
    if (!match || Number(match[1]) > 65535)
      fail(
        `sandbox.network holds ${JSON.stringify(item)}; only localhost:PORT is allowed.`,
      );
    return Number(match[1]);
  });
  return { mode: "restricted", ports };
}

const probes = new Map();
function works(argv) {
  const key = argv.join("\0");
  if (!probes.has(key)) {
    const result = spawnSync(argv[0], argv.slice(1), {
      stdio: "ignore",
      timeout: 10_000,
    });
    probes.set(key, result.status === 0);
  }
  return probes.get(key);
}

// The sandbox this machine can apply, or null. Tested by running one, since
// an installed tool can still be refused (a nested macOS sandbox, a Linux
// that limits user namespaces).
export function sandboxKind({ platform = process.platform } = {}) {
  if (platform === "darwin")
    return works([
      SANDBOX_EXEC,
      "-p",
      "(version 1)(allow default)",
      "/usr/bin/true",
    ])
      ? "sandbox-exec"
      : null;
  if (platform === "linux")
    return works(["bwrap", "--ro-bind", "/", "/", "--unshare-net", "true"])
      ? "bwrap"
      : null;
  return null;
}

const quote = (file) => {
  if (/[\0\n\r]/.test(file)) fail(`The sandbox cannot name the path ${file}.`);
  return `"${file.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};
const rule = (file) =>
  fs.existsSync(file) && !fs.statSync(file).isDirectory()
    ? `(literal ${quote(file)})`
    : `(subpath ${quote(file)})`;

// The macOS profile. Later rules win, so the secret denial follows the
// write roots and only the named readable files come after it.
export function sandboxProfile({
  writeRoots,
  secrets,
  readable = [],
  writable = [],
  network,
}) {
  // `on` (a repository check's network setting) leaves the network open.
  const lines = [
    "(version 1)",
    "(allow default)",
    ...(network.mode === "on" ? [] : ["(deny network*)"]),
  ];
  for (const port of network.ports)
    lines.push(`(allow network-outbound (remote ip "localhost:${port}"))`);
  if (writeRoots) {
    lines.push("(deny file-write*)");
    lines.push(
      `(allow file-write* ${[
        ...writeRoots.map(rule),
        '(literal "/dev/null")',
        '(literal "/dev/zero")',
        '(literal "/dev/tty")',
        '(literal "/dev/dtracehelper")',
        '(regex #"^/dev/fd/")',
      ].join(" ")})`,
    );
  }
  if (secrets.length)
    lines.push(`(deny file-read* file-write* ${secrets.map(rule).join(" ")})`);
  if (readable.length)
    lines.push(`(allow file-read* ${readable.map(rule).join(" ")})`);
  if (writable.length)
    lines.push(
      `(allow file-read* file-write* ${writable.map(rule).join(" ")})`,
    );
  lines.push(
    `(deny mach-lookup ${KEYCHAIN_SERVICES.map((name) => `(global-name "${name}")`).join(" ")})`,
  );
  return lines.join("\n");
}

function bwrapArgs({ writeRoots, secrets, readable, writable, network }) {
  if (network.mode === "restricted")
    fail(
      "On Linux the sandbox turns the network off; a list of loopback ports is not supported yet.",
    );
  const args = [
    "bwrap",
    "--die-with-parent",
    "--ro-bind",
    "/",
    "/",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    ...(network.mode === "on" ? [] : ["--unshare-net"]),
  ];
  if (!writeRoots)
    fail(
      "On Linux the sandbox needs write roots; it cannot leave writes open.",
    );
  for (const root of writeRoots) {
    fs.mkdirSync(root, { recursive: true });
    args.push("--bind", root, root);
  }
  // Secrets: an empty folder over each folder, /dev/null over each file. A
  // missing path needs nothing: the root is read-only. The readable and
  // writable files are bound into the empty folders before they turn
  // read-only, since bwrap makes their mount points there.
  const remount = [];
  for (const file of secrets) {
    if (!fs.existsSync(file)) continue;
    if (fs.statSync(file).isDirectory()) {
      args.push("--tmpfs", file);
      remount.push("--remount-ro", file);
    } else args.push("--ro-bind", "/dev/null", file);
  }
  for (const file of readable) args.push("--ro-bind", file, file);
  for (const file of writable) args.push("--bind", file, file);
  return [...args, ...remount, "--"];
}

function optedIn(configDirectory, definition) {
  if (!configDirectory) return false;
  const file = path.join(path.resolve(configDirectory), HARNESS_UNCONFINED);
  if (!fs.existsSync(file)) return false;
  try {
    return (
      JSON.parse(fs.readFileSync(file, "utf8"))[definition.name] ===
      definition.hash
    );
  } catch {
    return false;
  }
}

// Wrap one child's argv in the sandbox (R95.6). `writeRoots` comes from
// harnessPermission: a list (read roles: empty), or null for a harness the
// person let write anywhere, which still keeps secrets and network out.
// `readable` names files under a secret folder the child must read (its
// brief), and `writable` the ones it must also write (its log). Returns { argv, env, sandbox }; sandbox is null only with the
// per-machine opt-in.
export function confineChild(
  argv,
  {
    definition,
    configDirectory,
    writeRoots,
    secrets,
    readable = [],
    writable = [],
    network = sandboxNetwork(undefined),
    env = process.env,
    keepEnv = [],
    kind = sandboxKind(),
  },
) {
  if (!Array.isArray(argv) || !argv.length) fail("No command to confine.");
  const childEnv = sandboxEnv(env, { keep: keepEnv });
  // R94.4d: a child with its own sandbox off runs only inside Avoozl's,
  // with write roots; never unconfined, whatever the opt-in says.
  const innerOff = argv.some(
    (item) => typeof item === "string" && item.includes(INNER_SANDBOX_OFF),
  );
  if (innerOff && !kind)
    fail(
      `Harness ${definition.name} turns its own sandbox off (${INNER_SANDBOX_OFF}), so it runs only inside Avoozl's sandbox, and this machine has none. A per-machine opt-in does not change that.`,
      409,
    );
  if (innerOff && !Array.isArray(writeRoots))
    fail(
      `Harness ${definition.name} turns its own sandbox off (${INNER_SANDBOX_OFF}), so it needs write roots.`,
      409,
    );
  if (!kind) {
    if (!optedIn(configDirectory, definition))
      fail(
        `This machine has no sandbox for harness ${definition.name}, so it cannot keep the workspace database, credentials and the Kiro Crew home out of an unattended child. A person can allow it on this machine.`,
        409,
      );
    return { argv: [...argv], env: childEnv, sandbox: null };
  }
  const roots = writeRoots && writeRoots.map(realPath);
  const denied = secrets.map(realPath);
  for (const root of roots || [])
    for (const secret of denied)
      if (inside(root, secret))
        fail(
          `Write root ${root} is inside ${secret}, which a child must not reach.`,
        );
  const shape = {
    writeRoots: roots,
    secrets: denied,
    readable: readable.map(realPath),
    writable: writable.map(realPath),
    network,
  };
  if (kind === "sandbox-exec")
    return {
      argv: [SANDBOX_EXEC, "-p", sandboxProfile(shape), ...argv],
      env: childEnv,
      sandbox: kind,
    };
  return { argv: [...bwrapArgs(shape), ...argv], env: childEnv, sandbox: kind };
}
