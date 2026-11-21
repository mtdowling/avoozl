// @ts-nocheck: typing debt
// The containment probes (machine-server MS8, design D7): what a child whose
// own sandbox is off (`danger-full-access`) tries, and Avoozl's sandbox must
// refuse. Each probe is an argv list with named places in braces; `probeArgv`
// fills them. A probe that exits 0 got through. The CI test runs them in a
// stand-in harness under confineChild, and the live proof has the harness
// itself run them by the shell commands its brief names. A probe that gets
// through is fixed in the sandbox (src/app/executors/sandbox.ts), never here.
//
// Each probe is a small node program, so the same argv runs on macOS and
// Linux. `{node}` is the node binary.
const write = (file) => [
  "{node}",
  "-e",
  "require('node:fs').writeFileSync(process.argv[1], 'probe')",
  file,
];
const read = (file) => [
  "{node}",
  "-e",
  // A folder counts as read when it shows what it holds: an empty folder
  // the sandbox put in its place reveals nothing.
  "const fs = require('node:fs'); const f = process.argv[1]; if (fs.statSync(f).isDirectory() ? !fs.readdirSync(f).length : !fs.readFileSync(f).length) process.exit(1)",
  file,
];
const connect = (host, port) => [
  "{node}",
  "-e",
  "const s = require('node:net').connect(Number(process.argv[2]), process.argv[1]); s.on('connect', () => process.exit(0)); s.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 5000)",
  host,
  port,
];

export const PROBES = Object.freeze([
  // Writes outside the write roots.
  { id: "write-home", class: "write", argv: write("{home}/avoozl-probe.txt") },
  {
    id: "write-git-common-dir",
    class: "write",
    argv: write("{git_common_dir}/avoozl-probe"),
  },
  {
    id: "write-other-worktree",
    class: "write",
    argv: write("{other_worktree}/avoozl-probe.txt"),
  },
  {
    id: "write-config",
    class: "write",
    argv: write("{config_directory}/avoozl-probe.json"),
  },
  {
    id: "write-state",
    class: "write",
    argv: write("{state_directory}/avoozl-probe"),
  },
  {
    id: "write-other-temp",
    class: "write",
    argv: write("{other_temp}/avoozl-probe.txt"),
  },
  // Network beyond what the repository names.
  {
    id: "net-public-https",
    class: "network",
    argv: connect("{public_host}", "443"),
  },
  {
    id: "net-loopback-port",
    class: "network",
    argv: connect("127.0.0.1", "{closed_port}"),
  },
  {
    id: "net-name-lookup",
    class: "network",
    argv: [
      "{node}",
      "-e",
      "require('node:dns').lookup(process.argv[1], (e) => process.exit(e ? 1 : 0)); setTimeout(() => process.exit(1), 5000)",
      "{public_host}",
    ],
  },
  // Reads of credentials.
  { id: "read-ssh", class: "read", argv: read("{home}/.ssh") },
  { id: "read-gh", class: "read", argv: read("{home}/.config/gh") },
  { id: "read-aws", class: "read", argv: read("{home}/.aws") },
  {
    id: "read-git-credentials",
    class: "read",
    argv: read("{home}/.git-credentials"),
  },
  {
    id: "read-workspace-database",
    class: "read",
    argv: read("{workspace_database}"),
  },
  { id: "read-state", class: "read", argv: read("{state_directory}") },
  { id: "read-kirocrew-home", class: "read", argv: read("{home}/.kiro/crew") },
  {
    id: "read-keychain",
    class: "read",
    platform: "darwin",
    argv: [
      "/usr/bin/security",
      "find-generic-password",
      "-s",
      "{keychain_service}",
      "-w",
    ],
  },
  {
    id: "read-secret-env",
    class: "read",
    // Exits 0 when any variable with a secret name, other than the ones the
    // harness keeps, reached the child.
    argv: [
      "{node}",
      "-e",
      "const keep = process.argv[1].split(',').filter(Boolean); const secret = /(TOKEN|SECRET|PASSW(OR)?D|API_?KEY|CREDENTIAL|PRIVATE_KEY)/i; process.exit(Object.keys(process.env).some((n) => secret.test(n) && !keep.includes(n)) ? 0 : 1)",
      "{keep_env}",
    ],
  },
]);

// The probes for this platform, each argv filled from `places`.
export function probeArgv(places, { platform = process.platform } = {}) {
  return PROBES.filter(
    (probe) => !probe.platform || probe.platform === platform,
  ).map((probe) => ({
    id: probe.id,
    class: probe.class,
    argv: probe.argv.map((word) =>
      word.replace(/\{([a-z_]+)\}/g, (_, name) => {
        if (!(name in places))
          throw Error(`Probe ${probe.id} needs {${name}}.`);
        return String(places[name]);
      }),
    ),
  }));
}

// The stand-in harness and the live child run this: every probe in turn,
// then one JSON line {id: exit code}. Exit 0 means the probe got through.
export const RUN_PROBES = `
const { spawnSync } = require("node:child_process");
const probes = JSON.parse(require("node:fs").readFileSync(process.argv[process.argv.length - 1], "utf8"));
const out = {};
for (const probe of probes) {
  const run = spawnSync(probe.argv[0], probe.argv.slice(1), { stdio: "ignore", timeout: 15000 });
  out[probe.id] = run.status === null ? (run.error ? run.error.code : "timeout") : run.status;
}
console.log(JSON.stringify(out));
`;
