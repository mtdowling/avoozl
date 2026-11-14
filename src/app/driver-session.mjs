// The driver session: the one long-running Kiro Crew chat that releases ready
// work and watches merges. Kiro Crew shows an app only the chats the app
// opened, so a chat the person opens is invisible to Avoozl. Avoozl learns it
// from the chat itself instead: the avoozl-driver agent's hooks (`avoozl
// driver hook`, which gets the host-attested session key) and its attested
// plans_next call each record "seen now". Nothing here starts or stops a chat.
//
// The record is one file for the machine, beside the workspace catalog, not a
// row in a workspace database. The hook runs with no workspace of its own (it
// fell back to the catalog default, or to its working directory when there is
// none), while the page and side panel read the workspace they show. Kept per
// workspace, the hook wrote one database, or none, and every view read
// another: a running driver showed as not started.
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

// Where the machine's driver session record lives.
export function driverSessionFile(options = {}) {
  return path.join(
    machineAvoozlPaths(options).stateDirectory,
    "driver-session.json",
  );
}

function readRecord(file) {
  if (!file) return null;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value &&
      typeof value.slot === "string" &&
      SLOT.test(value.slot) &&
      !Number.isNaN(Date.parse(value.lastSeenAt))
      ? value
      : null;
  } catch {
    return null;
  }
}

// Record that the chat `slot` is the driver session and was seen now. A
// different slot replaces the old one; the same slot keeps when it opened.
export function registerDriverSession({
  slot,
  source,
  now = Date.now(),
  file = driverSessionFile(),
}) {
  if (typeof slot !== "string" || !SLOT.test(slot))
    fail("A driver session needs a plain chat key.");
  const seen = readRecord(file);
  const record = {
    slot,
    source: String(source || "hook").slice(0, 40),
    openedAt: seen?.slot === slot ? seen.openedAt : iso(now),
    lastSeenAt: iso(now),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write then rename, so a reader never sees half a file.
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(record) + "\n", { mode: 0o600 });
  fs.renameSync(temporary, file);
}

// none: never seen. running: seen within QUIET_MINUTES. idle: older, and the
// link stays so a person can still open the chat.
export function driverSessionView({
  now = Date.now(),
  file = driverSessionFile(),
} = {}) {
  const seen = readRecord(file);
  const base = {
    slot: seen?.slot ?? null,
    href: seen ? sessionUrl(seen.slot) : null,
    openedAt: seen?.openedAt ?? null,
    lastSeenAt: seen?.lastSeenAt ?? null,
    source: seen?.source ?? null,
    quietAfterMinutes: QUIET_MINUTES,
  };
  if (!seen) return { state: "none", ...base };
  const quiet = now - Date.parse(seen.lastSeenAt) > QUIET_MINUTES * 60_000;
  return { state: quiet ? "idle" : "running", ...base };
}
