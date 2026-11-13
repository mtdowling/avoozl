// The remote relay (design §4.10 "Remote relay", R41.16–R41.24): an opt-in
// stopgap until Kiro Crew's MC-10 lets the app open remote chats itself.
//
// Kiro Crew gives `crew=` only to the owner's own dashboard tab, during a
// turn the owner sent, and refuses a chat the tick cron opened, whose
// creator is the cron (F77, F129). A cron also reaches only chats it opened
// (F130). So the tick cannot open the relay or wake it: the person opens one
// "Remote relay" chat on the `avoozl-relay` agent, and on each turn the
// person sends there the relay pulls this queue through `plans_relay`, opens
// each worker on its crew, sends the brief unchanged, and hands each worker
// reply back as data. Avoozl parses the reply's report line itself and runs
// the normal report path, bound to the same attempt.
//
// State lives in one meta record: the relay's slot, the queued requests, the
// messages waiting for relayed workers, the last refusal, and turns per day.
import { fail } from "./store.mjs";
import { bindSession, listSessionBindings } from "./session-bindings.mjs";
import { sessionUrl } from "./notifications.mjs";

const META = "routing.relay";
const DAYS_KEPT = 7;
const MAX_REPLY = 64 * 1024;
const MAX_REQUESTS = 50;
// The refusals that mean "not a turn the owner sent": the person sending
// any message to the relay chat clears them (Kiro Crew remote_dispatch_routes
// arm 7, and the crew-read gate's not_owner_turn).
const OWNER_TURN = new Set(["crew_owner_unverifiable", "not_owner_turn"]);
// The relay chat was opened by automation or for someone else (arm 3): no
// message fixes that; the person opens a new relay chat.
const NOT_OWN_TAB = new Set(["owner_only"]);
export const REPORT_LINE = "AVOOZL-REPORT";
export const RELAY_AGENT = "avoozl-relay";

// The relay sees only Kiro Crew's refusal text ("Error: could not create a
// session on that crew: <error>"), not its code, so a refusal without a
// known code is read from the text (F131). Anything else stays as given.
export function refusalCode(code, text) {
  if (OWNER_TURN.has(code) || NOT_OWN_TAB.has(code)) return code;
  const said = String(text || "");
  if (/a turn the owner sent|not sent by the owner/.test(said))
    return "crew_owner_unverifiable";
  if (/crew= is open only to the owner's own/.test(said)) return "owner_only";
  return code;
}

const empty = () => ({
  slot: null,
  requests: {},
  outbox: [],
  turns: {},
  refusal: null,
});

export function relayState(store) {
  return { ...empty(), ...(store.getMeta(META) || {}) };
}

function save(store, state) {
  store.setMeta(META, state);
  return state;
}

const day = (now) => new Date(now).toISOString().slice(0, 10);

// The relay places remote work only when the setting is on and MC-10 is
// missing; once MC-10 lands the direct path replaces it (R41.23).
export const relayActive = (config, mc10) =>
  config?.remoteRelay === "on" && mc10 !== true;

// The tasks a queued request holds, so the tick does not place them again.
export function relayHeldTasks(store) {
  return new Set(
    Object.values(relayState(store).requests).map((r) => r.taskId),
  );
}

// Queued requests per crew: they count against the crew's chat limit.
export function relayQueuedByCrew(store) {
  const counts = new Map();
  for (const r of Object.values(relayState(store).requests))
    counts.set(r.crew, (counts.get(r.crew) || 0) + 1);
  return counts;
}

// Worker bindings the relay opened that are still live.
const relayedBindings = (store) =>
  listSessionBindings(store).filter(
    (b) =>
      b.relay &&
      !["closed", "lost"].includes(b.status) &&
      !["done", "blocked"].includes(b.report?.kind),
  );

export const isRelayed = (binding) => Boolean(binding?.relay);

// The tick's half (script cron only). `dispatches` are remote worker
// dispatches placement chose; each becomes one queued request, once per
// task and attempt. `messages` for relayed workers go to the outbox, since
// the cron cannot message a remote chat. Returns what to keep sending.
export function relayStep(store, { dispatches = [], messages = [], now }) {
  const state = relayState(store),
    relayed = new Set(
      listSessionBindings(store)
        .filter((b) => b.relay)
        .map((b) => b.slot),
    );
  let changed = false;
  for (const d of dispatches) {
    const id = `${d.task}:${d.attempt}`;
    if (state.requests[id]) continue;
    if (Object.keys(state.requests).length >= MAX_REQUESTS) break;
    state.requests[id] = {
      id,
      taskId: d.task,
      attempt: d.attempt,
      crew: d.crew,
      title: d.title,
      ...(d.agent ? { agent: d.agent } : {}),
      ...(d.model ? { model: d.model } : {}),
      ...(d.placement ? { placement: d.placement } : {}),
      ...(d.sessionReason ? { sessionReason: d.sessionReason } : {}),
      // Passed the content rules' brief boundary already (delivery.mjs).
      brief: d.brief,
      state: "queued",
      queuedAt: new Date(now).toISOString(),
    };
    changed = true;
  }
  const keep = [];
  for (const m of messages)
    if (relayed.has(m.slot)) {
      state.outbox.push({ slot: m.slot, text: m.text });
      changed = true;
    } else keep.push(m);
  if (changed) save(store, state);
  return keep;
}

// The setting is off, or MC-10 landed: queued requests are dropped so their
// tasks are placed again. A worker the relay already opened keeps its relay.
export function dropQueued(store) {
  const state = relayState(store);
  if (!Object.keys(state.requests).length) return false;
  save(store, { ...state, requests: {} });
  return true;
}

function requireRelay(store, own) {
  const state = relayState(store);
  if (!own)
    fail(
      "plans_relay needs the calling session's identity from the Kiro Crew gateway.",
      403,
    );
  if (!state.slot)
    fail(
      "No relay chat is registered. Call plans_relay with action register first.",
      409,
    );
  if (state.slot !== own)
    fail("Only the registered relay chat may call plans_relay.", 403);
  return state;
}

function request(state, id) {
  const r = typeof id === "string" ? state.requests[id] : null;
  if (!r) fail(`Relay request ${id} not found.`, 404);
  return r;
}

const text = (value, max, label) => {
  if (typeof value !== "string" || value.length > max)
    fail(`${label} is text of at most ${max} characters.`);
  return value;
};

// A report line in a worker's reply: the last `AVOOZL-REPORT {json}` line.
// Only kind, commit, text, and phase are read; anything else in the reply is
// data and is ignored. Returns null when there is no well-formed line.
export function parseReportLine(reply) {
  const lines = String(reply || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(REPORT_LINE + " "));
  if (!lines.length) return null;
  let value;
  try {
    value = JSON.parse(lines.at(-1).slice(REPORT_LINE.length + 1));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const key of ["kind", "commit", "text", "phase"])
    if (typeof value[key] === "string") out[key] = value[key];
  return out.kind ? out : null;
}

// plans_relay: the relay chat's own calls. `report` runs the normal report
// path for a relayed worker (operations.mjs passes reportSession).
export async function relayCall(
  store,
  input = {},
  own,
  { report, now = Date.now() } = {},
) {
  const step = input.step;
  if (step === "register") {
    if (!own)
      fail(
        "plans_relay needs the calling session's identity from the Kiro Crew gateway.",
        403,
      );
    const state = relayState(store);
    if (state.slot === own) return { slot: own, changed: false };
    // One relay serves every remote task; it never starts a second one.
    if (state.slot)
      fail(
        `Relay chat ${state.slot} is registered. Forget it on the Routing page first.`,
        409,
      );
    if (listSessionBindings(store).some((b) => b.slot === own))
      fail("A session bound to a task cannot be the relay chat.", 403);
    save(store, {
      ...state,
      slot: own,
      registeredAt: new Date(now).toISOString(),
    });
    return { slot: own, changed: true };
  }
  const state = requireRelay(store, own);
  if (step === "pending") {
    // One call per relay turn: the count the Routing page shows (R41.21).
    const today = day(now),
      turns = Object.fromEntries(
        Object.entries({
          ...state.turns,
          [today]: (state.turns[today] || 0) + 1,
        })
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, DAYS_KEPT),
      ),
      outbox = state.outbox;
    save(store, { ...state, turns, outbox: [] });
    return {
      requests: Object.values(state.requests).map((r) => ({
        id: r.id,
        crew: r.crew,
        taskId: r.taskId,
        attempt: r.attempt,
        title: r.title,
        agent: r.agent ?? null,
        model: r.model ?? null,
        state: r.state,
      })),
      workers: relayedBindings(store).map((b) => ({
        slot: b.slot,
        crew: b.crew,
        taskId: b.taskId,
        attempt: b.attempt,
      })),
      messages: outbox,
      turnsToday: turns[today],
    };
  }
  if (step === "brief") {
    const r = request(state, input.request);
    return { request: r.id, crew: r.crew, brief: r.brief };
  }
  if (step === "opened") {
    const r = request(state, input.request),
      slot = text(input.slot, 256, "slot");
    const { binding } = bindSession(
      store,
      {
        taskId: r.taskId,
        slot,
        role: "worker",
        attempt: r.attempt,
        title: r.title,
        source: "tick",
        crew: r.crew,
        ...(r.agent ? { agent: r.agent } : {}),
        ...(r.model ? { model: r.model } : {}),
        ...(r.placement ? { placement: r.placement } : {}),
        ...(r.sessionReason ? { sessionReason: r.sessionReason } : {}),
      },
      { relay: own },
    );
    const next = relayState(store);
    delete next.requests[r.id];
    save(store, next);
    return { binding };
  }
  if (step === "refused") {
    const r = request(state, input.request),
      why = String(input.text ?? "").slice(0, 500),
      code = refusalCode(text(input.code ?? "", 100, "code"), why),
      at = new Date(now).toISOString(),
      next = relayState(store);
    // Not the owner's turn: the task waits for the person, never on local.
    if (OWNER_TURN.has(code) || NOT_OWN_TAB.has(code)) {
      next.requests[r.id] = {
        ...r,
        state: "waiting",
        why: NOT_OWN_TAB.has(code) ? "not-own-tab" : "owner-turn",
        refusedAt: at,
      };
      next.refusal = { taskId: r.taskId, crew: r.crew, code, at };
      save(store, next);
      return { request: r.id, state: "waiting" };
    }
    // Any other refusal (crew busy, unknown, version): the request goes and
    // the next tick places the task again under the same rules.
    delete next.requests[r.id];
    next.refusal = { taskId: r.taskId, crew: r.crew, code, text: why, at };
    save(store, next);
    return { request: r.id, state: "dropped" };
  }
  if (step === "reply") {
    const slot = text(input.slot, 256, "slot"),
      binding = listSessionBindings(store).find((b) => b.slot === slot);
    if (!binding || binding.relay !== own)
      fail("This relay did not open that worker.", 403);
    const reply = text(input.text ?? "", MAX_REPLY, "text"),
      parsed = parseReportLine(reply);
    if (!parsed) return { slot, recorded: false, why: "no report line" };
    const result = await report({
      taskId: binding.taskId,
      slot,
      ...parsed,
    });
    return { slot, recorded: Boolean(result?.changed), report: result?.report };
  }
  fail("Choose step register, pending, brief, opened, refused, or reply.", 400);
}

// Forget the relay chat (a person, from the Routing page): a new chat may
// register. Queued requests stay queued for it.
export function forgetRelay(store) {
  const state = relayState(store);
  save(store, { ...state, slot: null, registeredAt: null });
  return { forgotten: state.slot };
}

// Needs you (R41.20): one item per queued request. A queued request waits
// on the person too, because nothing but the person's turn wakes the relay.
export function relayNeedsYou(store) {
  const state = relayState(store);
  return Object.values(state.requests).map((r) => ({
    kind: "needs-human",
    reason: "relay",
    id: `relay:${r.id}`,
    taskId: r.taskId,
    crew: r.crew,
    link: state.slot ? sessionUrl(state.slot) : null,
    title: `${r.taskId} is waiting for you to run on ${r.crew}`,
    detail: !state.slot
      ? `Open the Remote relay chat from the Routing page and send any message, so it can open ${r.taskId} on ${r.crew}.`
      : r.why === "not-own-tab"
        ? "Kiro Crew refused the relay chat because you did not open it. Press Forget relay chat on the Routing page, then Open relay chat."
        : "Send any message to the relay chat to continue.",
  }));
}

// What the Routing page shows.
export function relayView(store, { setting, mc10, now = Date.now() }) {
  const state = relayState(store);
  return {
    setting: setting === "on" ? "on" : "off",
    active: setting === "on" && !mc10,
    ignored: setting === "on" && mc10 === true,
    slot: state.slot,
    queued: Object.keys(state.requests).length,
    workers: relayedBindings(store).length,
    turnsToday: state.turns[day(now)] || 0,
    turns: state.turns,
    refusal: state.refusal,
  };
}
