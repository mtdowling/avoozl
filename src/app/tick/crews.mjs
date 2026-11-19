// The crew snapshot: `local` plus the Kiro Crew instances the app backend last
// read, so a binding on a crew that stopped answering is not waited on. The
// machine file helpers serve provider settings (provider-health.mjs).
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fail } from "../store/store.mjs";
import { globalAvoozlConfigPath } from "../settings/layered-config.mjs";

const SNAPSHOT = "crews.snapshot";

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// ---------------------------------------------------------------------------
// Machine-local settings: one JSON file this machine owns.

const digest = (text) => createHash("sha256").update(text).digest("hex");

export function machineFile(file = globalAvoozlConfigPath()) {
  let text = null;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let value = { version: 1 };
  if (text !== null) {
    try {
      value = JSON.parse(text);
    } catch (error) {
      fail(
        `${path.basename(file)} on this machine is invalid: ${error.message}`,
        409,
      );
    }
    if (!record(value))
      fail(`${path.basename(file)} must hold a JSON object.`, 409);
  }
  return { file, value, hash: text === null ? null : digest(text) };
}

// Replace keys of the machine-local file, refusing a stale edit.
export function writeMachineFile(file, mutate, expectedHash) {
  const before = machineFile(file);
  if (expectedHash !== undefined && expectedHash !== before.hash)
    fail("Settings on this machine changed; reload before saving.", 409);
  const value = structuredClone(before.value);
  value.version ??= 1;
  mutate(value);
  const text = JSON.stringify(value, null, 2) + "\n";
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const pending = `${file}.${process.pid}.${randomUUID()}.pending`;
  fs.writeFileSync(pending, text, { mode: 0o600 });
  fs.renameSync(pending, file);
  return { value, hash: digest(text) };
}

// What the app backend (or a test driver) last read from Kiro Crew:
// {instances: [{id, name}], headroom: {id: F80 fields}, agents: {id: [...]},
// ready: {id: true|false} (the crew approves tools on its own, so a chat
// would not stall on an approval), remoteDispatch, limits: {memoryGb,
// diskGb}, mc10, readAt}. Absent on a
// Kiro Crew that grants the app no instance read: then only `local` exists.
export const crewSnapshot = (store) => store.getMeta(SNAPSHOT);
