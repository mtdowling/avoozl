// Where notifications go on a machine with no Kiro Crew (without-kirocrew
// NK7.2 to NK7.5, design D6): `notifications.sinks` in the machine file
// (~/.config/avoozl/config.json), never in .avoozl.json, because a webhook URL
// may hold a secret. A `command` sink runs an argument list, never a shell; a
// `webhook` sink posts JSON to an https URL or a loopback one. What leaves
// the machine is small: the channel, a title, a task or spec ID, a time and
// a link.
import { execFile } from "node:child_process";
import { check } from "../content/content-rules.mjs";
import { fail } from "../store/store.mjs";

const SINK_KINDS = Object.freeze(["command", "webhook"]);
export const COMMAND_SINK_KEYS = Object.freeze([
  "id",
  "kind",
  "argv",
  "timeoutMs",
]);
export const WEBHOOK_SINK_KEYS = Object.freeze([
  "id",
  "kind",
  "url",
  "timeoutMs",
]);
export const NOTIFICATIONS_KEYS = Object.freeze(["sinks"]);
const ID = /^[a-z][a-z0-9-]{0,40}$/;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const record = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// A webhook URL may hold a secret (an ntfy topic, a chat webhook), so no
// message here names it.
function checkUrl(value, where) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${where}.url is not a URL.`);
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && LOOPBACK.has(url.hostname))
  )
    fail(`${where}.url must be https, or http to this machine (loopback).`);
  return url.href;
}

// Check a `notifications` value from the machine file; throws naming the
// key. Returns the sinks, each with an id.
export function validateNotifications(value, where = "notifications") {
  if (value === undefined) return { sinks: [] };
  if (!record(value)) fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!NOTIFICATIONS_KEYS.includes(key))
      fail(`${where}.${key} is not a setting; use sinks.`);
  const list = value.sinks ?? [];
  if (!Array.isArray(list)) fail(`${where}.sinks must be a list.`);
  const ids = new Set();
  const sinks = list.map((sink, index) => {
    const at = `${where}.sinks[${index}]`;
    if (!record(sink) || !SINK_KINDS.includes(sink.kind))
      fail(`${at}.kind must be command or webhook.`);
    const keys =
      sink.kind === "command" ? COMMAND_SINK_KEYS : WEBHOOK_SINK_KEYS;
    for (const key of Object.keys(sink))
      if (!keys.includes(key))
        fail(`${at}.${key} is not a ${sink.kind} sink setting.`);
    const id = sink.id ?? `${sink.kind}-${index + 1}`;
    if (!ID.test(id) || ids.has(id))
      fail(`${at}.id must be a short unique name of a-z, 0-9 and -.`);
    ids.add(id);
    const timeoutMs = sink.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > MAX_TIMEOUT_MS
    )
      fail(`${at}.timeoutMs must be 1 to ${MAX_TIMEOUT_MS}.`);
    if (sink.kind === "command") {
      if (typeof sink.argv === "string")
        fail(`${at}.argv is a shell string; write it as a list of strings.`);
      if (
        !Array.isArray(sink.argv) ||
        !sink.argv.length ||
        !sink.argv.every((part) => typeof part === "string" && part)
      )
        fail(`${at}.argv must be a nonempty list of strings.`);
      return { id, kind: "command", argv: [...sink.argv], timeoutMs };
    }
    return { id, kind: "webhook", url: checkUrl(sink.url, at), timeoutMs };
  });
  return { sinks };
}

// The link a notice carries: the standalone page's address when that page
// is on, else the command that shows the item. Never a Kiro Crew path. A
// decision links to its exact row in Needs you (direct-links D3).
export const noticeLink = (id, pageUrl = null, decision = null) =>
  pageUrl
    ? new URL(
        decision ? decision : id ? `?task=${encodeURIComponent(id)}` : "",
        pageUrl,
      ).href
    : id
      ? `avoozl show ${id}`
      : "avoozl status";

// What a command or webhook sink gets (NK7.4): no file text, brief or path.
// A title a content rule matches is held back, and a neutral one is sent.
export function sinkPayload(payload, row, { store = null, pageUrl } = {}) {
  const id = row?.task ?? null;
  let title = payload.title;
  if (store)
    try {
      const result = check(store, {
        boundary: "activity",
        target: "notification",
        text: title,
      });
      if (result.findings.length || result.unavailable.length)
        title = `An Avoozl ${payload.channel} notice (its title is held by a content rule)`;
    } catch {
      title = `An Avoozl ${payload.channel} notice`;
    }
  return {
    channel: payload.channel,
    title,
    id,
    at: row?.queuedAt ?? new Date().toISOString(),
    link: noticeLink(
      id,
      pageUrl,
      row?.decision ? (row.payload?.url ?? null) : null,
    ),
  };
}

// Run the command with the title and the rest of the payload as its last
// two arguments, without a shell. Resolves on exit 0.
function runCommand(sink, small) {
  const [file, ...args] = sink.argv;
  return new Promise((resolve, reject) =>
    execFile(
      file,
      [...args, small.title, JSON.stringify(small)],
      { timeout: sink.timeoutMs, windowsHide: true },
      (error) =>
        error
          ? reject(
              Error(
                error.killed
                  ? `command sink ${sink.id} timed out`
                  : `command sink ${sink.id} failed (${error.code ?? "error"})`,
              ),
            )
          : resolve(),
    ),
  );
}

async function postWebhook(sink, small, request) {
  let response;
  try {
    response = await request(sink.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(small),
      signal: AbortSignal.timeout(sink.timeoutMs),
      redirect: "error",
    });
  } catch {
    // The URL may hold a secret: name the sink, never the URL or the cause.
    throw Error(`webhook sink ${sink.id} could not be reached`);
  }
  if (!response.ok)
    throw Error(`webhook sink ${sink.id} answered ${response.status}`);
}

// The pushers deliverToSinks runs, one per sink: push(payload, {row, store}).
export function sinkPushers(sinks, { pageUrl = null, request = fetch } = {}) {
  return sinks.map((sink) => ({
    id: sink.id,
    push: (payload, { row = null, store = null } = {}) => {
      const small = sinkPayload(payload, row, { store, pageUrl });
      return sink.kind === "command"
        ? runCommand(sink, small)
        : postWebhook(sink, small, request);
    },
  }));
}
