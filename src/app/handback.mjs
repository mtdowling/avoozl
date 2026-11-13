// Bringing a remote worker's commit back to this machine (§4.10, R41.13).
// `push`: the worker pushed its task branch to the repository remote, and
// this machine fetches it. `handback` (owner decision 2026-11-13): the
// worker only committed in its own folder on its crew; this machine fetches
// the branch from that folder over SSH. The host key is pinned on first use
// in Avoozl's own known_hosts file and checked on every later fetch. Avoozl
// never pushes either way.
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";
import { git } from "./git.mjs";

const quote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

// Is `host` already pinned in `file`? Lines start with the host or
// `[host]:port`; Avoozl writes them unhashed.
export function pinned(file, host) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  return text.split("\n").some((line) =>
    line
      .split(/\s+/)[0]
      ?.split(",")
      .some((h) => h === host || h.startsWith(`[${host}]:`)),
  );
}

// The ssh command git runs: the first fetch pins (accept-new), every later
// one refuses a changed key (yes). BatchMode: never prompt.
export function sshCommand({ ssh = "ssh", knownHosts, host }) {
  const mode = pinned(knownHosts, host) ? "yes" : "accept-new";
  return {
    mode,
    command: [
      ssh,
      "-o BatchMode=yes",
      "-o HashKnownHosts=no",
      `-o StrictHostKeyChecking=${mode}`,
      `-o UserKnownHostsFile=${quote(knownHosts)}`,
    ].join(" "),
  };
}

const userHost = (sshHost) => sshHost.split("@").pop();

// Fetch `branch` from the crew's folder into `ref` and return its commit.
export async function handbackFetch({
  root,
  crew,
  folder,
  branch,
  ref,
  knownHosts,
  ssh = "ssh",
}) {
  if (!crew.sshHost || !folder)
    fail(
      `Crew ${crew.id} has no sshHost or worktreeRoot; its work cannot come back.`,
      409,
    );
  fs.mkdirSync(path.dirname(knownHosts), { recursive: true, mode: 0o700 });
  const host = userHost(crew.sshHost),
    { mode, command } = sshCommand({ ssh, knownHosts, host });
  try {
    await git(
      root,
      [
        "fetch",
        "--no-tags",
        `ssh://${crew.sshHost}${folder}`,
        `+refs/heads/${branch}:${ref}`,
      ],
      {
        env: { ...process.env, GIT_SSH_COMMAND: command },
      },
    );
  } catch (error) {
    fail(
      mode === "yes" && /host key|verification failed/i.test(error.message)
        ? `Crew ${crew.id}'s host key changed since it was pinned; nothing was fetched.`
        : `Could not fetch ${branch} from crew ${crew.id}: ${error.message.split("\n")[0]}`,
      409,
    );
  }
  return {
    commit: await git(root, ["rev-parse", ref]),
    pinnedNow: mode === "accept-new",
  };
}

// The pushed branch from the repository remote.
export async function pushedFetch({ root, remote, branch, ref }) {
  try {
    await git(root, [
      "fetch",
      "--no-tags",
      remote,
      `+refs/heads/${branch}:${ref}`,
    ]);
  } catch (error) {
    fail(
      `Could not fetch ${branch} from ${remote}: ${error.message.split("\n")[0]}`,
      409,
    );
  }
  return { commit: await git(root, ["rev-parse", ref]) };
}
