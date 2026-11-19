// Direct links to work and decisions (spec direct-links, D1 to D3).
//
// A link carries a workspace and a reference to one decision occurrence or
// one worker attempt. The reference grants nothing: every read checks the
// workspace and resolves the reference against current records, and the
// host's own sign-in guards the page. Links are built only from validated
// IDs and the owner's machine settings, never from text a request supplied,
// so no link can point off this page or at another host's path.
import { randomBytes } from "node:crypto";
import { fail } from "../store/store.mjs";

export const APP_PATH = "/apps/avoozl";
// An occurrence ID: 16 random bytes, base64url.
const DECISION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const WORKSPACE_ID = /^[a-z][a-z0-9-]{0,60}$/;
// Kiro Crew's own slot key and Crew ID grammars (kirocrew open, MC-10).
const SLOT_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CREW_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GRANT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
// An alert is created just after the row it names; a row opened later than
// this after the alert is a newer occurrence.
const SLACK_MS = 2000;

export const newDecisionId = () => randomBytes(16).toString("base64url");

// The page path that opens one decision: dashboard-relative, so Kiro Crew
// and the standalone page resolve it against their own address.
export function decisionPath(workspaceId, id) {
  const query = new URLSearchParams();
  if (WORKSPACE_ID.test(workspaceId ?? "")) query.set("workspace", workspaceId);
  query.set("decision", id);
  return `${APP_PATH}?${query}`;
}

// The page address a request asked for, rebuilt from its checked parts, or
// null. Only the app page with a valid workspace and decision qualifies, so
// the sign-in redirect that uses it can never leave the page (no open
// redirect).
export function pageTarget(url) {
  if (url.pathname !== APP_PATH && url.pathname !== `${APP_PATH}/`) return null;
  const decision = url.searchParams.get("decision"),
    workspace = url.searchParams.get("workspace");
  if (!decision || !DECISION_ID.test(decision)) return null;
  if (workspace !== null && !WORKSPACE_ID.test(workspace)) return null;
  return decisionPath(workspace, decision);
}

// The decision reference a notice row holds: its occurrence ID, the task,
// session and stable record it names, recorded when the alert is created.
export const decisionReference = (notice) => ({
  id: newDecisionId(),
  task: notice.task ?? null,
  slot: notice.slot ?? null,
  record: notice.record ?? null,
});

const after = (item, at) =>
  Boolean(item.openedAt) && Date.parse(item.openedAt) > at + SLACK_MS;

// Which open Needs you item an alert's link names, from the notice rows and
// the current items. A row opened after the alert, or a row a newer alert
// for the same task also names, is never the old link's: an old link shows
// the decision as closed instead of opening a newer one.
// Returns {state: "open", item} | {state: "closed", taskId, newer} |
// {state: "unknown"}.
export function resolveDecision(rows, items, id) {
  const link = DECISION_ID.test(id ?? "")
    ? rows.find((row) => row.decision?.id === id)
    : null;
  if (!link) return { state: "unknown" };
  const { task, slot, record } = link.decision,
    at = Date.parse(link.queuedAt);
  const newer = rows.some(
    (row) =>
      row.decision &&
      row !== link &&
      (row.decision.record ?? null) === record &&
      (row.decision.task ?? null) === task &&
      Date.parse(row.queuedAt) > at,
  );
  const exact = record
    ? items.find((item) => item.id === record)
    : slot
      ? items.find((item) => item.taskId === task && item.slot === slot)
      : null;
  let match = exact && !after(exact, at) ? exact : null;
  if (!match && !record && task) {
    const shared = items.find(
      (item) => item.taskId === task && !item.slot && !after(item, at),
    );
    // A row with no time of its own belongs to the newest alert naming it.
    if (shared && (shared.openedAt || !newer)) match = shared;
  }
  return match
    ? { state: "open", item: match }
    : { state: "closed", taskId: task, newer };
}

// --- Machine settings -------------------------------------------------------

const record = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function webAddress(value, where) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${where} is not a URL.`);
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    fail(`${where} must be https, or http to this machine (loopback).`);
  if (url.username || url.password || url.search || url.hash)
    fail(`${where} takes an address only: no sign-in, query or fragment.`);
  return url.origin;
}

// `links` in the machine file (never .avoozl.json): where this machine opens
// a worker chat. {dashboard?, desktop?, workers?: {login: {crew?}}}.
// Returns the checked value; throws naming the key.
export function validateLinks(value, source = "Avoozl configuration") {
  if (value === undefined) return {};
  if (!record(value)) fail(`${source}: links must be an object.`);
  for (const key of Object.keys(value))
    if (!["dashboard", "desktop", "workers"].includes(key))
      fail(`${source}: links.${key} is not a setting.`);
  const out = {};
  if (value.dashboard !== undefined)
    out.dashboard = webAddress(value.dashboard, `${source}: links.dashboard`);
  if (value.desktop !== undefined) {
    if (typeof value.desktop !== "boolean")
      fail(`${source}: links.desktop must be true or false.`);
    out.desktop = value.desktop;
  }
  if (value.workers !== undefined) {
    if (!record(value.workers))
      fail(`${source}: links.workers must be an object.`);
    out.workers = {};
    for (const [login, host] of Object.entries(value.workers)) {
      const at = `${source}: links.workers.${login}`;
      if (!LOGIN.test(login)) fail(`${at} is not a GitHub login.`);
      if (!record(host)) fail(`${at} must be an object.`);
      for (const key of Object.keys(host))
        if (key !== "crew") fail(`${at}.${key} is not a setting.`);
      if (host.crew !== undefined && !CREW_ID.test(String(host.crew)))
        fail(`${at}.crew is not a Kiro Crew ID.`);
      out.workers[login.toLowerCase()] = { ...host };
    }
  }
  return out;
}

// --- Worker attempts --------------------------------------------------------

// The driver's offered tasks (worker-offer-step.mjs), each with the grant a
// worker holds for it once one does.
export const OFFERED = "worker.offered";
export const grantedTasks = (store) =>
  Object.entries(store.getMeta(OFFERED) ?? {})
    .filter(([, row]) => row?.grant?.id)
    .map(([taskId, row]) => ({ taskId, spec: row.spec, grant: row.grant }));

// What the page shows of a granted task's worker: its login, the grant, the
// and the machine it runs on: its Remote Crew ID when this machine names
// one, else its login.
export const grantView = ({ taskId, spec, grant }, links = {}) => ({
  taskId,
  spec,
  worker: grant.worker,
  grant: grant.id,
  at: grant.at ?? null,
  machine: links.workers?.[grant.worker]?.crew ?? grant.worker,
});

const chatKey = (slot) =>
  slot.startsWith("dashboard:") ? slot.slice("dashboard:".length) : slot;

// The Kiro Crew route for a chat: the local chat, or the exact chat on a
// connected Remote Crew (Kiro Crew 0.13 `/chat?crew=&crewSid=`).
export function chatRoute(slot, crew = null) {
  const key = chatKey(String(slot ?? ""));
  if (!SLOT_KEY.test(key)) return null;
  if (crew && crew !== "local") {
    if (!CREW_ID.test(crew)) return null;
    return `/chat?${new URLSearchParams({ crew, crewSid: key })}`;
  }
  return `/chat?${new URLSearchParams({ sid: key })}`;
}

// Where one displayed attempt opens, for the page that shows it: the action
// (`chat`, `log`, `connect`, `waiting` or `none`), its label and link, and
// the machine it runs on. `standalone` is true for `avoozl serve`, where a
// Kiro Crew chat opens through the owner's dashboard address or the desktop
// app's registered link. A link names one exact session, so an old link
// never opens a newer attempt.
export function attemptDestination(
  session,
  { standalone = false, links = {} } = {},
) {
  const crew = session.crew && session.crew !== "local" ? session.crew : null,
    machine = crew ?? "this machine",
    ended = ["closed", "lost", "gone"].includes(session.status ?? "");
  if (session.executor === "process")
    return {
      action: "log",
      label: "View worker log",
      href: null,
      machine,
      note: session.process ? null : "No supervisor record for its log.",
    };
  if (crew && session.crewUnreachable)
    return {
      action: "connect",
      label: `Connect ${crew}`,
      href: standalone ? null : "/settings/instances",
      machine,
      note: `${crew} does not answer. Connect it in Kiro Crew Settings › Instances.`,
    };
  const route = chatRoute(session.slot, crew);
  if (!route)
    return { action: "none", label: null, href: null, machine, note: null };
  const what = (session.role ?? "worker") === "worker" ? "worker chat" : "chat",
    label = ended ? `Open ended ${what}` : `Open ${what}`;
  if (!standalone) return { action: "chat", label, href: route, machine };
  if (links.dashboard)
    return {
      action: "chat",
      label,
      href: new URL(route, links.dashboard).href,
      machine,
    };
  if (links.desktop && !crew)
    return {
      action: "chat",
      label: "Open in Kiro Crew",
      href: `kirocrew://chat?${new URLSearchParams({ sid: chatKey(session.slot) })}`,
      machine,
    };
  return {
    action: "none",
    label: null,
    href: null,
    machine,
    note: "Set links.dashboard or links.desktop in this machine's Avoozl file to open Kiro Crew chats here.",
  };
}

// Worker side: the attempt this machine runs for one exact grant, from the
// runner records (remote-runner.mjs). Reads only. Null when no record holds
// that grant, so a released or newer grant never answers for an old one.
export function grantAttempt(tasks, crewId, grant) {
  if (!GRANT_ID.test(grant ?? "")) fail("Give a grant ID.");
  const found = Object.entries(tasks ?? {}).find(
    ([, row]) => row.grant?.id === grant,
  );
  if (!found) return null;
  const [taskId, row] = found;
  return {
    grant,
    taskId,
    state: row.state,
    crew: crewId ?? null,
    slot: row.worker?.slot ? chatKey(row.worker.slot) : null,
    status: row.worker?.status ?? null,
  };
}
