// The driver session: the one long-running Kiro Crew chat that releases ready
// work and watches merges for one workspace. Kiro Crew shows an app only the
// chats the app opened, so a chat the person opens is invisible to Avoozl.
// Avoozl learns it from the chat itself instead: the avoozl-driver agent's
// hooks (`avoozl driver hook`, which gets the host-attested session key) and
// its attested plans_next call each record "seen now" for the workspace they
// resolve. Nothing here starts or stops a chat.
//
// Each workspace has its own driver. They are kept in one file for the
// machine, beside the workspace catalog, keyed by workspace root, so a view of
// one workspace can say that another one has a driver, and the driver chat's
// own side panel can find the workspace it drives.
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";
import { sessionUrl } from "./notifications.mjs";
import { machineAvoozlPaths } from "./host-config.mjs";

const SLOT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

// shortcut: the host gives no "this chat is still running" read to an app, so a
// session counts as running for this long after its last hook or plans_next
// call, then as idle. Replace with the chat's own status when the host offers it.
export const QUIET_MINUTES = 30;

const iso = (ms) => new Date(ms).toISOString();

// Where the machine's driver session records live.
export function driverSessionFile(options = {}) {
  return path.join(
    machineAvoozlPaths(options).stateDirectory,
    "driver-session.json",
  );
}

const valid = (value) =>
  value &&
  typeof value.slot === "string" &&
  SLOT.test(value.slot) &&
  typeof value.root === "string" &&
  !Number.isNaN(Date.parse(value.lastSeenAt));

// Every workspace's record, by root. A file from before records were kept per
// workspace names no workspace and reads as empty.
function readAll(file) {
  if (!file) return {};
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    const found = {};
    for (const [root, record] of Object.entries(value?.workspaces ?? {}))
      if (valid(record) && record.root === root) found[root] = record;
    return found;
  } catch {
    return {};
  }
}

const key = (root) => path.resolve(root);

// Record that the chat `slot` drives the workspace at `root` and was seen
// now. A different slot replaces the old one; the same slot keeps when it
// opened. Other workspaces' records are kept.
export function registerDriverSession({
  slot,
  source,
  root,
  name,
  now = Date.now(),
  file = driverSessionFile(),
}) {
  if (typeof slot !== "string" || !SLOT.test(slot))
    fail("A driver session needs a plain chat key.");
  if (typeof root !== "string" || !root)
    fail("A driver session needs its workspace.");
  const all = readAll(file);
  const seen = all[key(root)];
  all[key(root)] = {
    root: key(root),
    name: String(name || path.basename(root)).slice(0, 80),
    slot,
    source: String(source || "hook").slice(0, 40),
    openedAt: seen?.slot === slot ? seen.openedAt : iso(now),
    lastSeenAt: iso(now),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write then rename, so a reader never sees half a file.
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporary,
    JSON.stringify({ version: 2, workspaces: all }) + "\n",
    { mode: 0o600 },
  );
  fs.renameSync(temporary, file);
}

const stateOf = (record, now) =>
  !record
    ? "none"
    : now - Date.parse(record.lastSeenAt) > QUIET_MINUTES * 60_000
      ? "idle"
      : "running";

// This workspace's driver: none (never seen), running (seen within
// QUIET_MINUTES) or idle (older; the link stays). `workspace` is its name.
// `others` are the other workspaces' drivers that are running now, so a view
// can say "No driver for A. B has one". `root` and `slot` let the driver
// chat's side panel find the workspace it drives.
export function driverSessionView({
  root = null,
  name = null,
  now = Date.now(),
  file = driverSessionFile(),
} = {}) {
  const all = readAll(file);
  const seen = root ? all[key(root)] : null;
  const others = Object.values(all)
    .filter(
      (record) =>
        (!root || record.root !== key(root)) &&
        stateOf(record, now) === "running",
    )
    .map((record) => ({
      root: record.root,
      workspace: record.name,
      slot: record.slot,
      href: sessionUrl(record.slot),
      lastSeenAt: record.lastSeenAt,
    }));
  return {
    state: stateOf(seen, now),
    workspace: name || (root ? path.basename(root) : null),
    slot: seen?.slot ?? null,
    href: seen ? sessionUrl(seen.slot) : null,
    openedAt: seen?.openedAt ?? null,
    lastSeenAt: seen?.lastSeenAt ?? null,
    source: seen?.source ?? null,
    quietAfterMinutes: QUIET_MINUTES,
    others,
  };
}
