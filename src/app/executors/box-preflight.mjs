// The preflight of a contained session (vm-harness D5, VM4.2): before the
// first contained session for a repository, runtime version, image digest
// and harness hash, Avoozl proves the box works and that the CLI's commands
// really go there. Each step is recorded; a failed step holds the
// repository's contained work with one Needs you item.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BOX_MARKER,
  boxCommands,
  openContainedSession,
  runCommand,
} from "./box-session.mjs";
import {
  boxExecArgv,
  hostUser,
  runtimeProgram,
} from "../workspace/check-isolation.mjs";
import { SECURITY_TOOL } from "./sandbox.mjs";

// The commands the routing steps ask the CLI to run, one per call. The
// broker's own log, not the CLI's word, shows where they ran.
export const PREFLIGHT_COMMANDS = Object.freeze([
  "uname -s",
  `cat ${BOX_MARKER}`,
  `${SECURITY_TOOL} list-keychains`,
  "ls ~/.ssh",
]);
export const PREFLIGHT_ALLOW = Object.freeze([
  ["uname"],
  ["cat"],
  [SECURITY_TOOL],
  ["ls"],
]);
export const PREFLIGHT_PROMPT = [
  "This is a fixed check of your shell; do nothing else.",
  "Run each of these shell commands with your shell tool, one per call, exactly as written, even when one fails:",
  ...PREFLIGHT_COMMANDS.map((command) => `- ${command}`),
  "Then reply DONE and stop. Write no file.",
].join("\n");

// The key a preflight is stored and looked up by.
export const preflightKey = ({
  repository,
  runtime,
  version,
  digest,
  harnessHash,
}) => [repository, runtime, version, digest, harnessHash].join("|");

// The runtime's version, for the key: its first line of `--version`.
export async function runtimeVersion(runtime, { exec = runCommand } = {}) {
  const seen = await exec([runtimeProgram(runtime), "--version"], {
    timeout: 10_000,
  });
  return String(seen.stdout || seen.stderr)
    .trim()
    .split("\n")[0]
    .slice(0, 200);
}

const step = (name, passed, output) => ({
  name,
  passed: Boolean(passed),
  output: String(output ?? "")
    .trim()
    .slice(0, 1000),
});

// Run every step in a throwaway task folder. `launch({worktree, tmp,
// opened, prompt, allow})` runs the CLI once as a contained session and
// resolves when it exits (the supervisor's own launch). Resolves to
// {passed, steps, failed?}.
export async function runBoxPreflight(
  {
    runtime,
    image,
    hosts,
    stateDirectory,
    tmpEnv = [],
    platform = process.platform,
  },
  { launch, startProxy, exec = runCommand },
) {
  const steps = [];
  const root = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-preflight-")),
    ),
    worktree = path.join(root, "task"),
    tmp = path.join(root, "tmp"),
    session = `process-${crypto.randomUUID()}`;
  fs.mkdirSync(worktree);
  fs.mkdirSync(tmp);
  let opened = null;
  const finish = () => {
    const failed = steps.find((entry) => !entry.passed);
    return { passed: !failed, steps, ...(failed ? { failed } : {}) };
  };
  try {
    try {
      opened = await openContainedSession(
        {
          runtime,
          session,
          image,
          worktree,
          tmp,
          tmpEnv,
          hosts,
          stateDirectory,
        },
        { exec, startProxy, platform },
      );
    } catch (error) {
      steps.push(step("starts", false, error.message));
      return finish();
    }
    const inBox = (command) =>
      exec(
        boxExecArgv(runtime, {
          session,
          cwd: worktree,
          envFile: opened.folders.envFile,
          user: hostUser(),
          command,
        }),
        { timeout: 60_000 },
      );
    const started = await inBox("true");
    steps.push(step("starts", started.status === 0, started.stderr));
    if (started.status !== 0) return finish();
    // `run` took --network none, or the box would not have started.
    steps.push(step("no network", true, "--network none was accepted"));
    const content = crypto.randomBytes(16).toString("hex"),
      probe = path.join(worktree, ".avoozl-probe");
    fs.writeFileSync(probe, content);
    const read = await inBox(`cat ${probe}`);
    steps.push(
      step(
        "mounts",
        read.stdout.trim() === content,
        read.stdout || read.stderr,
      ),
    );
    if (read.stdout.trim() !== content) return finish();
    const route = await inBox(
      "(exec 3<>/dev/tcp/1.1.1.1/443) 2>/dev/null && echo tcp-open || echo tcp-closed; " +
        "(getent hosts example.com || nslookup example.com) >/dev/null 2>&1 && echo dns-open || echo dns-closed",
    );
    steps.push(
      step(
        "no route",
        /tcp-closed/.test(route.stdout) && /dns-closed/.test(route.stdout),
        route.stdout,
      ),
    );
    if (!steps.at(-1).passed) return finish();
    // The routing steps: one short model turn on the person's own sign-in.
    const exited = await launch({
      worktree,
      tmp,
      opened,
      prompt: PREFLIGHT_PROMPT,
      allow: PREFLIGHT_ALLOW,
    }).catch((error) => ({ error: error.message }));
    const ran = boxCommands(opened.folders.brokerLog),
      find = (part) => ran.find((entry) => entry.command.includes(part));
    const uname = find("uname -s"),
      marker = find(BOX_MARKER);
    steps.push(
      step(
        "routing",
        /Linux/.test(uname?.output ?? "") &&
          (marker?.output ?? "").includes(session),
        exited?.error ??
          `uname: ${uname?.output ?? "did not reach the box"}; marker: ${marker?.output ?? "did not reach the box"}`,
      ),
    );
    if (!steps.at(-1).passed) return finish();
    const security = find(SECURITY_TOOL),
      ssh = find("ls ~/.ssh");
    steps.push(
      step(
        "host stays shut",
        security && security.code !== 0 && ssh && ssh.code !== 0,
        `security: ${security ? `exit ${security.code} in the box` : "did not reach the box"}; ls ~/.ssh: ${ssh ? `exit ${ssh.code} in the box` : "did not reach the box"}`,
      ),
    );
    return finish();
  } finally {
    await opened?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
