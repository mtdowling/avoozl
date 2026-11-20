// Start the machine server at login, by choice (MS4, design D4): a launchd
// agent on macOS, a systemd user unit on Linux and a Task Scheduler task on
// Windows. `avoozl start --at-login` writes and loads it; `avoozl stop
// --at-login` unloads and deletes it. Each command runs as an argv list, never
// a shell, and is printed. The unit holds no secret: it names `node` and the
// CLI by absolute path and the PATH captured at install.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail } from "../store/store.mjs";

export const LAUNCHD_LABEL = "dev.avoozl.machine";
export const SYSTEMD_UNIT = "avoozl-machine.service";
export const TASK_NAME = "Avoozl machine";
export const MARKER = "Written by avoozl start --at-login";
const FOREGROUND_LINE = "avoozl start --foreground";

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

// One word of a Windows command line.
const windowsWord = (value) => `"${value.replaceAll('"', '\\"')}"`;

export function unitKindFor(platform = process.platform) {
  if (platform === "darwin") return "launchd";
  if (platform === "linux") return "systemd";
  if (platform === "win32") return "schtasks";
  fail(
    `Avoozl starts at login with launchd (macOS), systemd (Linux) or Task Scheduler (Windows), not ${platform}.`,
  );
}

// The unit's text, the file it belongs in, and the commands that load and
// unload it. `node` and `cli` are absolute paths; `pathEnv` is the PATH the
// server and its children search, since a service manager's own is minimal.
export function loginUnit({
  kind = unitKindFor(),
  home = os.homedir(),
  env = process.env,
  node = process.execPath,
  cli,
  stateDirectory,
  configDirectory,
  pathEnv = env.PATH ?? "",
  uid = typeof process.getuid === "function" ? process.getuid() : null,
  user = `${env.USERDOMAIN ?? "."}\\${env.USERNAME ?? os.userInfo().username}`,
}) {
  const argv = [
    node,
    cli,
    "start",
    "--foreground",
    "--starter",
    "login-unit",
  ].map((value, index) =>
    plain(value, index < 2 ? "A program path" : "A server argument"),
  );
  for (const value of [node, cli, stateDirectory, configDirectory])
    if (
      !path.isAbsolute(plain(value, "A path")) &&
      !path.win32.isAbsolute(value)
    )
      fail(`${value} must be an absolute path in a login unit.`);
  const log = path.join(stateDirectory, "supervisor", "service.log");
  const searchPath = plain(pathEnv || "/usr/bin:/bin", "PATH");
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
    // restarts. Children are detached into their own process groups, so they
    // outlive a restart (R95.4).
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${MARKER} -->
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
    <string>${xml(searchPath)}</string>
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
    const domain = uid === null ? "gui/501" : `gui/${uid}`;
    return {
      kind,
      file,
      text,
      load: [["launchctl", "bootstrap", domain, file]],
      unload: [["launchctl", "bootout", `${domain}/${LAUNCHD_LABEL}`]],
    };
  }
  if (kind === "systemd") {
    const configHome = env.XDG_CONFIG_HOME
      ? path.resolve(env.XDG_CONFIG_HOME)
      : path.join(home, ".config");
    const file = path.join(configHome, "systemd", "user", SYSTEMD_UNIT);
    // KillMode=process stops only the server: the default control-group mode
    // would also kill the detached children, which must outlive a restart.
    const text = `# ${MARKER}
[Unit]
Description=Avoozl machine server: the loop and the agent children

[Service]
Type=simple
ExecStart=${argv.map(systemdWord).join(" ")}
Environment=${systemdWord(`PATH=${searchPath}`)}
Restart=on-failure
RestartSec=30
KillMode=process

[Install]
WantedBy=default.target
`;
    return {
      kind,
      file,
      text,
      // Without a login session the user manager stops; lingering keeps it.
      load: [
        ["systemctl", "--user", "daemon-reload"],
        ["systemctl", "--user", "enable", "--now", SYSTEMD_UNIT],
      ],
      unload: [["systemctl", "--user", "disable", "--now", SYSTEMD_UNIT]],
      probe: ["systemctl", "--user", "show-environment"],
    };
  }
  if (kind === "schtasks") {
    const file = path.join(stateDirectory, "machine", "login-task.xml");
    // conhost --headless runs the console program with no window. A logon
    // trigger for this user, no elevation, restart on failure.
    const args = [cli, "start", "--foreground", "--starter", "login-unit"]
      .map(windowsWord)
      .join(" ");
    const text = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${MARKER}</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${xml(user)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xml(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
    <Hidden>true</Hidden>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>conhost.exe</Command>
      <Arguments>--headless ${xml(windowsWord(node))} ${xml(args)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
    return {
      kind,
      file,
      // schtasks reads a UTF-16 file.
      encoding: "utf16le",
      text,
      load: [
        ["schtasks", "/Create", "/TN", TASK_NAME, "/XML", file, "/F"],
        ["schtasks", "/Run", "/TN", TASK_NAME],
      ],
      unload: [["schtasks", "/Delete", "/TN", TASK_NAME, "/F"]],
      query: ["schtasks", "/Query", "/TN", TASK_NAME, "/XML"],
    };
  }
  fail(`Choose launchd, systemd or schtasks, not ${JSON.stringify(kind)}.`);
}

const runCommand = (argv) =>
  execFileSync(argv[0], argv.slice(1), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
    windowsHide: true,
  });

const show = (argv) =>
  argv
    .map((word) => (/[\s"]/.test(word) ? JSON.stringify(word) : word))
    .join(" ");

const readFile = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// The text of an installed unit, or null when none. On Windows the task, not
// the file, is the unit: the file is only what /Create reads.
function installed(unit, run) {
  if (unit.query)
    try {
      return run(unit.query);
    } catch {
      return null;
    }
  return readFile(unit.file);
}

const isOurs = (text) => text.includes(MARKER);

// Write and load the unit. Replaces a unit this command wrote, refuses any
// other. Returns the commands it ran, as printed lines.
export function installLoginUnit(unit, { run = runCommand } = {}) {
  const ran = [];
  const go = (argv, { tolerate = false } = {}) => {
    ran.push(show(argv));
    try {
      return run(argv);
    } catch (error) {
      if (!tolerate)
        fail(
          `${show(argv)} failed: ${String(error.stderr || error.message).trim()}`,
          500,
        );
      return null;
    }
  };
  if (unit.probe)
    try {
      run(unit.probe);
    } catch {
      fail(
        `This Linux has no user systemd, so Avoozl cannot start at login. Run the server another way: ${FOREGROUND_LINE}`,
        409,
      );
    }
  const existing = installed(unit, run);
  if (existing !== null && !isOurs(existing))
    fail(
      `${unit.query ? `The task ${TASK_NAME}` : unit.file} exists and Avoozl did not write it. Remove it first, then run avoozl start --at-login again.`,
      409,
    );
  if (existing !== null && unit.unload)
    for (const argv of unit.unload) go(argv, { tolerate: true });
  fs.mkdirSync(path.dirname(unit.file), { recursive: true });
  fs.writeFileSync(
    unit.file,
    unit.encoding === "utf16le" ? `\ufeff${unit.text}` : unit.text,
    { encoding: unit.encoding ?? "utf8", mode: 0o644 },
  );
  for (const argv of unit.load) go(argv);
  return { file: unit.file, replaced: existing !== null, ran };
}

// Unload and delete the unit, which stops the server it runs. A unit Avoozl
// did not write is refused.
export function removeLoginUnit(unit, { run = runCommand } = {}) {
  const ran = [];
  const existing = installed(unit, run);
  if (existing === null && !fs.existsSync(unit.file))
    return { removed: false, ran };
  if (existing !== null && !isOurs(existing))
    fail(
      `${unit.query ? `The task ${TASK_NAME}` : unit.file} exists and Avoozl did not write it, so it is left alone.`,
      409,
    );
  for (const argv of unit.unload) {
    ran.push(show(argv));
    try {
      run(argv);
    } catch {
      // Already unloaded: the file is still removed below.
    }
  }
  fs.rmSync(unit.file, { force: true });
  return { removed: true, ran };
}
