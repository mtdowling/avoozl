// The crew registry (design §4.10, R41.1, R41.6): `local` plus the Kiro Crew
// instances this machine is connected to. Everything Avoozl knows about a
// crew beyond its id and name is the owner's and lives in machine-local
// settings (`~/.config/avoozl/config.json`: `crews.<id>` and
// `crewStaleSeconds`), never in a tracked file. Readings come from Node for
// `local` and from the crew snapshot the app backend (or a test driver)
// records for remote crews.
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail } from "./store.mjs";
import { globalAvoozlConfigPath } from "./layered-config.mjs";

export const LOCAL = "local";
export const TAG_KEYS = Object.freeze(["os", "arch", "tools", "trust"]);
export const DEFAULT_CHAT_LIMIT = Object.freeze({ local: 3, remote: 2 });
export const DEFAULT_STALE_SECONDS = 120;
// How a remote crew's work comes back (owner decision 2026-11-13):
// `handback` commits on the task branch with no GitHub write and this machine
// fetches it over SSH; `push` pushes the task branch to the repository remote.
export const CREW_DELIVERIES = Object.freeze(["handback", "push"]);
const CREW_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const TAG = /^([a-z]+):([A-Za-z0-9._+-]{1,60})$/;
const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const SSH_HOST =
  /^(?:[A-Za-z0-9._-]{1,64}@)?[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const SNAPSHOT = "crews.snapshot";

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// One tag `key:value` with a known key. `errors` collects instead of
// throwing, so a file's every bad key is named at once.
export function tagError(tag, at) {
  const match = typeof tag === "string" ? TAG.exec(tag) : null;
  if (!match) return `${at} must be a tag key:value, such as os:linux.`;
  if (!TAG_KEYS.includes(match[1]))
    return `${at} uses unknown tag key ${match[1]}; use ${TAG_KEYS.join(", ")}.`;
  if (match[1] === "trust" && !["local", "remote"].includes(match[2]))
    return `${at} must be trust:local or trust:remote.`;
  return null;
}

export const isCrewId = (value) =>
  typeof value === "string" && CREW_ID.test(value);

// `crews.<id>` in machine-local settings, validated. Throws one error naming
// every bad key.
export function crewSettingsInput(value, at = "crews") {
  const errors = [];
  if (value === undefined) return {};
  if (!record(value)) fail(`${at} must be an object.`);
  const out = {};
  for (const [id, entry] of Object.entries(value)) {
    const where = `${at}.${id}`;
    if (!isCrewId(id)) {
      errors.push(`${where} is not a crew id.`);
      continue;
    }
    if (!record(entry)) {
      errors.push(`${where} must be an object.`);
      continue;
    }
    for (const key of Object.keys(entry))
      if (
        ![
          "name",
          "tags",
          "gitHosts",
          "chatLimit",
          "delivery",
          "sshHost",
          "worktreeRoot",
        ].includes(key)
      )
        errors.push(`${where}.${key} is not a crew setting.`);
    if (
      entry.name !== undefined &&
      (typeof entry.name !== "string" ||
        !entry.name.trim() ||
        entry.name.length > 80)
    )
      errors.push(`${where}.name must be 1–80 characters.`);
    if (entry.tags !== undefined) {
      if (!Array.isArray(entry.tags) || entry.tags.length > 30)
        errors.push(`${where}.tags must be a list of at most 30 tags.`);
      else
        entry.tags.forEach((tag, i) => {
          const error = tagError(tag, `${where}.tags[${i}]`);
          if (error) errors.push(error);
        });
      if (
        id === LOCAL &&
        Array.isArray(entry.tags) &&
        entry.tags.includes("trust:remote")
      )
        errors.push(`${where}.tags: local is always trust:local.`);
    }
    if (entry.gitHosts !== undefined)
      if (
        !Array.isArray(entry.gitHosts) ||
        entry.gitHosts.length > 20 ||
        entry.gitHosts.some((h) => typeof h !== "string" || !HOST.test(h))
      )
        errors.push(`${where}.gitHosts must be a list of host names.`);
    if (
      entry.chatLimit !== undefined &&
      (!Number.isInteger(entry.chatLimit) ||
        entry.chatLimit < 0 ||
        entry.chatLimit > 32)
    )
      errors.push(`${where}.chatLimit must be a whole number 0–32.`);
    if (
      entry.delivery !== undefined &&
      !CREW_DELIVERIES.includes(entry.delivery)
    )
      errors.push(`${where}.delivery must be handback or push.`);
    if (
      entry.sshHost !== undefined &&
      (typeof entry.sshHost !== "string" || !SSH_HOST.test(entry.sshHost))
    )
      errors.push(
        `${where}.sshHost must be a host name, optionally user@host.`,
      );
    if (
      entry.worktreeRoot !== undefined &&
      (typeof entry.worktreeRoot !== "string" ||
        !path.posix.isAbsolute(entry.worktreeRoot) ||
        entry.worktreeRoot.length > 400 ||
        /[\u0000-\u001f'"\\`$]/.test(entry.worktreeRoot))
    )
      errors.push(
        `${where}.worktreeRoot must be an absolute folder on that crew, without quotes or control characters.`,
      );
    out[id] = structuredClone(entry);
  }
  if (errors.length) fail(errors.join(" "));
  return out;
}

export function staleSecondsInput(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 10 || value > 3600)
    fail("crewStaleSeconds must be a whole number 10–3600.");
  return value;
}

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

// ---------------------------------------------------------------------------
// Readings.

// This machine's reading from Node. `root` picks the disk.
export function localReading({ root = os.homedir(), now = Date.now() } = {}) {
  let diskFreeGb = null;
  try {
    const s = fs.statfsSync(root);
    diskFreeGb = (s.bavail * s.bsize) / 1024 ** 3;
  } catch {}
  const cpus = os.cpus().length || 1;
  return {
    source: "node",
    measuredAt: new Date(now).toISOString(),
    memFreeGb: os.freemem() / 1024 ** 3,
    diskFreeGb,
    loadPerCpu: os.loadavg()[0] / cpus,
    cpuCount: cpus,
  };
}

// What the app backend (or a test driver) last read from Kiro Crew:
// {instances: [{id, name}], headroom: {id: F80 fields}, agents: {id: [...]},
// remoteDispatch, limits: {memoryGb, diskGb}, mc10, readAt}. Absent on a
// Kiro Crew that grants the app no instance read: then only `local` exists.
export const crewSnapshot = (store) => store.getMeta(SNAPSHOT);

export function recordCrewSnapshot(store, input = {}) {
  if (!record(input)) fail("Give the crew snapshot as an object.");
  const instances = Array.isArray(input.instances) ? input.instances : [];
  if (instances.length > 50) fail("At most 50 crews.");
  for (const entry of instances)
    if (!record(entry) || !isCrewId(entry.id) || entry.id === LOCAL)
      fail("Each instance needs a crew id other than local.");
  const snapshot = {
    instances: instances.map((e) => ({
      id: e.id,
      name: typeof e.name === "string" ? e.name.slice(0, 80) : e.id,
      ...(e.reachable === false ? { reachable: false } : {}),
    })),
    headroom: record(input.headroom) ? structuredClone(input.headroom) : {},
    agents: record(input.agents) ? structuredClone(input.agents) : {},
    remoteDispatch: input.remoteDispatch === true,
    limits: record(input.limits) ? structuredClone(input.limits) : {},
    mc10: input.mc10 === true,
    // MC-10's attach link pattern, `/…{crew}…{slot}` (Inferred contract).
    ...(typeof input.attach === "string" &&
    input.attach.startsWith("/") &&
    input.attach.length < 200
      ? { attach: input.attach }
      : {}),
    readAt: new Date().toISOString(),
  };
  store.setMeta(SNAPSHOT, snapshot);
  return snapshot;
}

// F80's headroom fields as one reading.
function remoteReading(headroom) {
  if (!record(headroom)) return null;
  return {
    source: "headroom",
    measuredAt: headroom.measured_at ?? null,
    memFreeGb: headroom.mem_free_gb ?? null,
    diskFreeGb: headroom.disk_free_gb ?? null,
    loadPerCpu: headroom.load_per_cpu ?? null,
    cpuCount: headroom.cpu_count ?? null,
    posture: headroom.posture ?? null,
  };
}

const tagValue = (tags, key) =>
  tags.find((t) => t.startsWith(key + ":"))?.slice(key.length + 1) ?? null;

// Every crew with its settings, reading, running Avoozl sessions, and
// whether it can take a new session now: [{id, name, tags, trust, gitHosts,
// chatLimit, delivery, reading, running, available, why}].
// `running` maps crew id to its live Avoozl session count.
export function listCrews({
  settings = {},
  staleSeconds = null,
  snapshot = null,
  local = null,
  running = new Map(),
  now = Date.now(),
} = {}) {
  const stale = (staleSeconds ?? DEFAULT_STALE_SECONDS) * 1000,
    limits = snapshot?.limits || {};
  const entries = [
    { id: LOCAL, name: "local" },
    ...(snapshot?.instances || []),
  ];
  return entries.map((entry) => {
    const own = settings[entry.id] || {},
      isLocal = entry.id === LOCAL,
      tags = [...(own.tags || [])].filter((t) => !t.startsWith("trust:"));
    const trust = isLocal
      ? "local"
      : tagValue(own.tags || [], "trust") || "remote";
    tags.push("trust:" + trust);
    const reading = isLocal
        ? local
        : remoteReading(snapshot?.headroom?.[entry.id]),
      chatLimit =
        own.chatLimit ??
        (isLocal ? DEFAULT_CHAT_LIMIT.local : DEFAULT_CHAT_LIMIT.remote),
      count = running.get(entry.id) || 0;
    let why = null;
    const age = reading?.measuredAt
      ? now - Date.parse(reading.measuredAt)
      : null;
    if (!isLocal && entry.reachable === false) why = "crew unreachable";
    else if (!reading) why = "no reading";
    else if (age === null || Number.isNaN(age) || age > stale)
      why = `stale reading (${age === null || Number.isNaN(age) ? "no time" : Math.round(age / 1000) + " s old"})`;
    else if (
      limits.memoryGb != null &&
      reading.memFreeGb != null &&
      reading.memFreeGb < limits.memoryGb
    )
      why = `${round(reading.memFreeGb)} GB free memory < ${limits.memoryGb} GB`;
    else if (
      limits.diskGb != null &&
      reading.diskFreeGb != null &&
      reading.diskFreeGb < limits.diskGb
    )
      why = `${round(reading.diskFreeGb)} GB free disk < ${limits.diskGb} GB`;
    else if (reading.loadPerCpu != null && reading.loadPerCpu >= 1)
      why = `load ${round(reading.loadPerCpu)} per CPU`;
    else if (count >= chatLimit) why = `${count}/${chatLimit} chats`;
    return {
      id: entry.id,
      name: own.name || entry.name || entry.id,
      tags,
      trust,
      gitHosts: own.gitHosts || [],
      chatLimit,
      chatLimitSet: own.chatLimit !== undefined,
      delivery: own.delivery || "handback",
      sshHost: own.sshHost || null,
      worktreeRoot: own.worktreeRoot || null,
      configured: Boolean(settings[entry.id]),
      reading,
      ageSeconds:
        age === null || Number.isNaN(age) ? null : Math.round(age / 1000),
      running: count,
      agents: isLocal ? null : (snapshot?.agents?.[entry.id] ?? null),
      available: !why,
      why,
    };
  });
}

const round = (n) => Math.round(n * 10) / 10;

// The host a git remote URL names, or null for a local path.
export function remoteHost(url) {
  if (typeof url !== "string" || !url) return null;
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)/.exec(url);
  if (scp && !/^[a-z]+:\/\//i.test(url)) return scp[1].toLowerCase();
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:"
      ? null
      : parsed.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}
