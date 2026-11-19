// The supervisor as a launchd agent or a systemd user service (R95.3,
// design §4.28): on a headless machine the service manager starts
// `avoozl supervisor --tick` at login and again if it stops. This module only
// writes the unit file; loading it is a command the person runs, printed
// beside it, so nothing here changes what the machine runs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail } from "../store/store.mjs";

export const LAUNCHD_LABEL = "dev.avoozl.supervisor";
export const SYSTEMD_UNIT = "avoozl-supervisor.service";
const DEFAULT_TICK_SECONDS = 60;

// The unit kind this platform uses, or a refusal.
export function unitKindFor(platform = process.platform) {
  if (platform === "darwin") return "launchd";
  if (platform === "linux") return "systemd";
  fail(
    `Avoozl writes supervisor units for launchd (macOS) and systemd (Linux), not ${platform}.`,
  );
}

const plain = (value, name) => {
  if (typeof value !== "string" || !value || /[\0\r\n]/.test(value))
    fail(`${name} must be text on one line.`);
  return value;
};

const xml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// One systemd word, quoted: a backslash and a quote are escaped, `%`
// specifiers and `$` expansion are doubled so they stay literal.
const systemdWord = (value) =>
  `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "%%")
    .replaceAll("$", "$$$$")}"`;

// The unit's text, the file it belongs in, and the commands that load it.
// `node` and `cli` are absolute paths; `pathEnv` is the PATH the supervisor
// and its children search, since a service manager's own PATH is minimal.
export function supervisorUnit({
  kind = unitKindFor(),
  home = os.homedir(),
  env = process.env,
  node = process.execPath,
  cli,
  stateDirectory,
  configDirectory,
  tickSeconds = DEFAULT_TICK_SECONDS,
  pathEnv = env.PATH ?? "",
  uid = typeof process.getuid === "function" ? process.getuid() : null,
}) {
  if (!Number.isInteger(tickSeconds) || tickSeconds < 1 || tickSeconds > 86400)
    fail("The tick interval must be 1 to 86400 seconds.");
  const argv = [
    node,
    cli,
    "supervisor",
    "--state-directory",
    stateDirectory,
    "--config-directory",
    configDirectory,
    "--tick-seconds",
    String(tickSeconds),
  ].map((value, index) =>
    plain(value, index < 2 ? "A program path" : "A supervisor argument"),
  );
  for (const value of [node, cli, stateDirectory, configDirectory])
    if (!path.isAbsolute(value))
      fail(`${value} must be an absolute path in a supervisor unit.`);
  plain(pathEnv || "/usr/bin:/bin", "PATH");
  const log = path.join(stateDirectory, "supervisor", "service.log");
  if (kind === "launchd") {
    const file = path.join(
      home,
      "Library",
      "LaunchAgents",
      `${LAUNCHD_LABEL}.plist`,
    );
    const strings = (values) =>
      values.map((v) => `    <string>${xml(v)}</string>`).join("\n");
    // KeepAlive restarts it whenever it stops; ThrottleInterval spaces the
    // restarts. Children are detached into their own process groups, so
    // they outlive a restart (R95.4).
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${strings(argv)}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(pathEnv || "/usr/bin:/bin")}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`;
    const domain = uid === null ? "gui/$(id -u)" : `gui/${uid}`;
    return {
      kind,
      file,
      text,
      load: [
        `launchctl bootstrap ${domain} ${file}`,
        `launchctl print ${domain}/${LAUNCHD_LABEL}`,
      ],
      unload: [`launchctl bootout ${domain}/${LAUNCHD_LABEL}`],
    };
  }
  if (kind === "systemd") {
    const configHome = env.XDG_CONFIG_HOME
      ? path.resolve(env.XDG_CONFIG_HOME)
      : path.join(home, ".config");
    const file = path.join(configHome, "systemd", "user", SYSTEMD_UNIT);
    // KillMode=process stops only the supervisor: the default control-group
    // mode would also kill the detached children, which must outlive a
    // restart (R95.4).
    const text = `[Unit]
Description=Avoozl supervisor: agent children and the tick

[Service]
Type=simple
ExecStart=${argv.map(systemdWord).join(" ")}
Environment=${systemdWord(`PATH=${pathEnv || "/usr/bin:/bin"}`)}
Restart=always
RestartSec=30
KillMode=process

[Install]
WantedBy=default.target
`;
    return {
      kind,
      file,
      text,
      load: [
        "systemctl --user daemon-reload",
        `systemctl --user enable --now ${SYSTEMD_UNIT}`,
        // Without a login session the user manager stops; lingering keeps it.
        "loginctl enable-linger",
      ],
      unload: [`systemctl --user disable --now ${SYSTEMD_UNIT}`],
    };
  }
  fail(`Choose launchd or systemd, not ${JSON.stringify(kind)}.`);
}

// Write the unit file. An existing file with other text is kept unless
// `force` is set, so a person's edits are never lost silently.
export function writeSupervisorUnit(unit, { force = false } = {}) {
  let existing = null;
  try {
    existing = fs.readFileSync(unit.file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing === unit.text) return { written: false, unchanged: true };
  if (existing !== null && !force)
    fail(
      `${unit.file} already exists with other text. Compare it with \`avoozl supervisor unit\`, then add --force to replace it.`,
      409,
    );
  fs.mkdirSync(path.dirname(unit.file), { recursive: true });
  fs.writeFileSync(unit.file, unit.text, { mode: 0o644 });
  return { written: true, replaced: existing !== null };
}
