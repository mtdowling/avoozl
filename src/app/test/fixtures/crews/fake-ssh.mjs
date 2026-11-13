#!/usr/bin/env node
// A test-only stand-in for ssh (task 11.9, hand-back proof). It never opens
// a network connection: it checks the host key against the known_hosts file
// git was told to use, the way OpenSSH does for StrictHostKeyChecking
// accept-new and yes, logs the call, and runs the git command locally.
// FAKE_SSH_HOST_KEY is the key this "host" presents.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2),
  options = {};
let host = null,
  rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (host) {
    rest = args.slice(i);
    break;
  }
  if (a === "-o" || a === "-p") {
    const [key, value] = String(args[++i]).split("=");
    options[key] = value;
  } else if (a.startsWith("-o")) {
    const [key, value] = a.slice(2).split("=");
    options[key] = value;
  } else if (a.startsWith("-")) continue;
  else host = a.split("@").pop();
}
const key = process.env.FAKE_SSH_HOST_KEY || "ssh-ed25519 AAAAfakekey1",
  file = options.UserKnownHostsFile?.replace(/^'|'$/g, ""),
  mode = options.StrictHostKeyChecking;
const log = (entry) =>
  process.env.FAKE_SSH_LOG &&
  fs.appendFileSync(process.env.FAKE_SSH_LOG, JSON.stringify(entry) + "\n");
let known = "";
try {
  known = fs.readFileSync(file, "utf8");
} catch {}
const line = known.split("\n").find((l) => l.split(/\s+/)[0] === host);
if (line && line.slice(host.length + 1) !== key) {
  log({ host, mode, result: "changed" });
  process.stderr.write(`Host key verification failed for ${host}.\n`);
  process.exit(255);
}
if (!line) {
  if (mode !== "accept-new") {
    log({ host, mode, result: "unknown" });
    process.stderr.write(`Host key verification failed for ${host}.\n`);
    process.exit(255);
  }
  fs.appendFileSync(file, `${host} ${key}\n`);
}
log({ host, mode, result: line ? "matched" : "pinned" });
const run = spawnSync("sh", ["-c", rest.join(" ")], { stdio: "inherit" });
process.exit(run.status ?? 1);
