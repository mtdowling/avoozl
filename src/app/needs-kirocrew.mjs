// What needs Kiro Crew, and why (without-kirocrew NK8, design D7). One
// table, which the command line, `avoozl status` and the page's "Needs Kiro
// Crew" states read. A role is in it while its row in the role table cannot
// run as a child; the other rows stay.
//
// On a machine with no Kiro Crew, a request for the `kirocrew` executor is
// not left queued with no word: the headless tick opens one Needs you item
// per role, and only a person's **Run on** moves that role to a harness.
import { ROLE_TABLE, rowFor } from "./role-table.mjs";
import { pendingSessionRequests } from "./session-requests.mjs";
import { fail } from "./store.mjs";

// Operations name the readers they call (the Operations context keys); a
// reader of Kiro Crew that an operation outside this table calls fails
// src/app/test/needs-kirocrew.test.mjs. `refuse` names the operations that
// cannot run at all without the reader; the others answer with an
// unavailable view.
const PARTS = Object.freeze([
  {
    id: "issue-radar",
    what: "Issue Radar's crew views and Send to Issue Radar",
    reason: "They read Issue Radar's crews through Kiro Crew's own API.",
    operations: {
      "untriaged.crews": ["crewReader"],
      "untriaged.handoff": ["crewReader"],
      "publiccrews.stop": ["crewReader"],
    },
    refuse: { "untriaged.handoff": "crewReader" },
  },
  {
    id: "spec-builder",
    what: "Spec Builder as a way to start a spec",
    reason:
      "Spec Builder is a Kiro Crew app; avoozl new-plan starts a spec without it.",
    operations: {},
  },
  {
    id: "kirocrew-chat",
    what: "Attaching to a Kiro Crew chat",
    reason:
      "A chat lives in Kiro Crew; Stop all agents reaches chats only through it.",
    operations: { "flow.stop": ["sessionStopper"] },
    refuse: { "flow.stop": "sessionStopper" },
  },
  {
    id: "side-panel",
    what: "The Kiro Crew side panel",
    reason: "The panel is drawn by Kiro Crew.",
    operations: {},
  },
]);

// Every row: the parts above, then each role that still runs only as a
// Kiro Crew chat.
export const NEEDS_KIROCREW = Object.freeze([
  ...PARTS,
  ...Object.values(ROLE_TABLE)
    .filter((row) => !row.process)
    .map((row) => ({
      id: `role:${row.setting}`,
      what: `The ${row.setting} role`,
      role: row.setting,
      reason: "It cannot hand back its answer from a harness yet.",
      operations: {},
    })),
]);

// The operation a Kiro Crew reader serves, and the readers it may call.
export const KIROCREW_READERS = Object.freeze(
  Object.fromEntries(
    NEEDS_KIROCREW.flatMap((row) => Object.entries(row.operations)),
  ),
);

// The reader an operation cannot run without, and what to call it, or null.
export function requiredReader(operation) {
  for (const row of NEEDS_KIROCREW)
    if (row.refuse?.[operation])
      return { reader: row.refuse[operation], what: row.what };
  return null;
}

// Whether Kiro Crew's executor cron took a request lately: it is the one
// sign a workspace has of Kiro Crew running beside it (D7).
const SEEN = "kirocrew.seenAt";
const ITEMS = "needs-kirocrew.items";
const RECENT_MS = 10 * 60_000;
export const markKirocrewSeen = (store, now = Date.now()) =>
  store.setMeta(SEEN, new Date(now).toISOString());
export function kirocrewReachable(store, now = Date.now()) {
  const at = store.getMeta(SEEN);
  return {
    reachable: Boolean(at) && now - Date.parse(at) < RECENT_MS,
    seenAt: typeof at === "string" ? at : null,
  };
}

const items = (store) => {
  const value = store.getMeta(ITEMS);
  return value && typeof value === "object" ? value : {};
};

// The headless tick's step: with no Kiro Crew seen lately, one Needs you
// item per role that has a `kirocrew` start waiting. It starts nothing.
// With Kiro Crew back, the items go. Returns the items.
export function needsKirocrewStep(store, now = Date.now()) {
  const before = items(store);
  if (kirocrewReachable(store, now).reachable) {
    if (Object.keys(before).length) store.setMeta(ITEMS, {});
    return {};
  }
  const next = {};
  for (const request of pendingSessionRequests(store, "kirocrew")) {
    if (request.operation === "send") continue;
    const role = rowFor(request.role)?.setting ?? request.role;
    next[role] ??= {
      role,
      since: before[role]?.since ?? new Date(now).toISOString(),
      requests: [],
    };
    next[role].requests.push(request.id);
  }
  if (JSON.stringify(next) !== JSON.stringify(before))
    store.setMeta(ITEMS, next);
  return next;
}

// Needs you rows: one per waiting role, with the harnesses this machine has
// approved for **Run on**.
export function needsKirocrewItems(store, harnesses = []) {
  return Object.values(items(store)).map((item) => ({
    kind: "needs-kirocrew",
    id: `needs-kirocrew:${item.role}`,
    taskId: null,
    role: item.role,
    title: `${item.role} waits on Kiro Crew`,
    detail: `${item.requests.length} session${item.requests.length === 1 ? "" : "s"} for ${item.role} wait for a Kiro Crew chat, and no Kiro Crew answers on this machine. Run it on a harness instead.`,
    choices: harnesses,
    openedAt: item.since,
  }));
}

// Run on (person only): the role's harness becomes `harness` in the
// settings file, and its waiting `kirocrew` starts are canceled, so the next
// tick starts the role on that harness.
export function runOn(store, { role, harness }, { settings, approved }) {
  const item = items(store)[role];
  if (!item) fail(`No ${role} sessions wait on Kiro Crew.`, 404);
  if (!approved.includes(harness))
    fail(`${harness} is not an approved harness on this machine.`, 409);
  const current = settings.readModelSettings();
  settings.updateModelSettings({
    roles: {
      ...current.roles,
      [role]: { ...current.roles[role], harness },
    },
    expectedHash: current.hash,
  });
  store.transaction(() => {
    for (const id of item.requests) {
      const row = store.get("session_requests", id);
      if (row?.state === "pending")
        store.put("session_requests", {
          ...row,
          state: "canceled",
          reason: `A person moved ${role} to ${harness}.`,
        });
    }
    const rest = { ...items(store) };
    delete rest[role];
    store.setMeta(ITEMS, rest);
  });
  return { role, harness };
}
