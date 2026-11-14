// The plugin contract (design §4.8, Requirements 22, 34): the calls Avoozl
// makes and the shape each reply must have. A plugin is outside code, so
// every reply is checked here before anything reads it, and its text stays
// untrusted data (quoted in briefs, escaped in views). A reply of the wrong
// shape is a broken plugin, never a partial result.

// Contract versions this Avoozl loads (R34.8). Changes inside a version only
// add optional fields or capabilities.
import { checkRuleSets } from "./content-rules.mjs";

export const SUPPORTED_CONTRACTS = [1];

export const ROUTE_STATES = [
  "queued",
  "running",
  "needs-person",
  "failed",
  "done",
];

export class ContractError extends Error {}

const MAX_TEXT = 20000;

function object(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ContractError(`${where} must be an object.`);
  return value;
}

function text(value, where, { max = MAX_TEXT, optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new ContractError(`${where} must be text of 1-${max} characters.`);
  return value;
}

// Only http and https links reach a view or brief; a `javascript:` or file
// link from a plugin is refused.
export function link(value, where, { optional = true } = {}) {
  if (optional && (value === undefined || value === null)) return null;
  let url;
  try {
    url = new URL(text(value, where, { max: 2000 }));
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError(`${where} must be an http or https URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new ContractError(`${where} must be an http or https URL.`);
  return url.href;
}

// Route kind (R22.2): submit, status, completion, cancel.
export const routeReplies = {
  submit(reply) {
    object(reply, "submit reply");
    return {
      id: text(reply.id, "submit reply id", { max: 200 }),
      link: link(reply.link, "submit reply link"),
    };
  },
  status(reply) {
    object(reply, "status reply");
    if (!ROUTE_STATES.includes(reply.state))
      throw new ContractError(
        `status reply state must be one of ${ROUTE_STATES.join(", ")}.`,
      );
    return {
      state: reply.state,
      link: link(reply.link, "status reply link"),
      reason: text(reply.reason, "status reply reason", {
        max: 2000,
        optional: true,
      }),
    };
  },
  // A pull request link, an answer, or both (R22.9).
  completion(reply) {
    object(reply, "completion reply");
    const result = {
      pr: link(reply.pr, "completion reply pr"),
      answer: text(reply.answer, "completion reply answer", {
        optional: true,
      }),
    };
    if (!result.pr && !result.answer)
      throw new ContractError(
        "completion reply needs a pull request link, an answer, or both.",
      );
    return result;
  },
  cancel(reply) {
    object(reply ?? {}, "cancel reply");
    return { cancelled: reply?.cancelled !== false };
  },
};

export const GATE_STATES = ["open", "done", "failed", "unknown"];
export const GATE_EVIDENCE_MAX = 500;

// Gate kind (RC23.6): one read-only call, status. The evidence and link are
// untrusted data: Avoozl screens them before it stores or shows them.
export const gateReplies = {
  status(reply) {
    object(reply, "status reply");
    if (!GATE_STATES.includes(reply.state))
      throw new ContractError(
        `status reply state must be one of ${GATE_STATES.join(", ")}.`,
      );
    return {
      state: reply.state,
      evidence:
        text(reply.evidence, "status reply evidence", {
          max: GATE_EVIDENCE_MAX,
          optional: true,
        }) ?? "",
      link: link(reply.link, "status reply link"),
    };
  },
};

const tags = (value, where) => {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((tag) => typeof tag !== "string" || tag.length > 200)
  )
    throw new ContractError(`${where} must be a list of tags.`);
  return value;
};

const actor = (value, where) =>
  value === undefined || value === null
    ? null
    : text(value, where, { max: 200 });

// One tracker record (§4.8 Tracker kind). `marker` is what Avoozl stored
// with it; the caller compares it with what it sent.
function trackerRecord(value, where) {
  object(value, where);
  if (!["open", "closed"].includes(value.state))
    throw new ContractError(`${where} state must be open or closed.`);
  const fields = object(value.fields, `${where} fields`);
  return {
    id: text(value.id, `${where} id`, { max: 200 }),
    link: link(value.link, `${where} link`),
    state: value.state,
    closeReason:
      value.state === "closed"
        ? ["completed", "not_planned"].includes(value.closeReason)
          ? value.closeReason
          : null
        : null,
    fields: {
      title: typeof fields.title === "string" ? fields.title : "",
      section: typeof fields.section === "string" ? fields.section : "",
      tags: tags(fields.tags ?? [], `${where} fields tags`),
      ...(fields.blockedBy !== undefined
        ? { blockedBy: tags(fields.blockedBy, `${where} fields blockedBy`) }
        : {}),
    },
    marker:
      value.marker === null ? null : object(value.marker, `${where} marker`),
    closedBy: actor(value.closedBy, `${where} closedBy`),
    closedAt: actor(value.closedAt, `${where} closedAt`),
    paused: value.paused === true,
    pausedBy: actor(value.pausedBy, `${where} pausedBy`),
  };
}

const records = (reply, where) => {
  object(reply, where);
  if (!Array.isArray(reply.records) || reply.records.length > 10000)
    throw new ContractError(`${where} records must be a list.`);
  return {
    records: reply.records.map((r, i) =>
      trackerRecord(r, `${where} record ${i}`),
    ),
  };
};

// Tracker kind (R35.2): project, read, list, close.
export const trackerReplies = {
  project(reply) {
    object(reply, "project reply");
    return {
      id: text(reply.id, "project reply id", { max: 200 }),
      link: link(reply.link, "project reply link"),
      marker:
        reply.marker === undefined || reply.marker === null
          ? null
          : object(reply.marker, "project reply marker"),
    };
  },
  read: (reply) => records(reply, "read reply"),
  list: (reply) => records(reply, "list reply"),
  close(reply) {
    object(reply ?? {}, "close reply");
    return { closed: reply?.closed !== false };
  },
  // Intake (R50.7, R55.8): changed items since the cursor. A bad item is
  // refused naming its field and the rest still count (R50.2).
  poll(reply) {
    object(reply, "poll reply");
    if (!Array.isArray(reply.items) || reply.items.length > 500)
      throw new ContractError(
        "poll reply items must be a list of at most 500.",
      );
    const items = [],
      refused = [];
    reply.items.forEach((item, i) => {
      try {
        items.push(incomingItem(item, `poll reply item ${i}`));
      } catch (error) {
        if (!(error instanceof ContractError)) throw error;
        refused.push({
          index: i,
          id: typeof item?.id === "string" ? item.id.slice(0, 200) : null,
          reason: error.message,
        });
      }
    });
    return {
      items,
      refused,
      cursor: text(reply.cursor, "poll reply cursor", {
        max: 2000,
        optional: true,
      }),
      more: reply.more === true,
    };
  },
};

const ITEM_KINDS = ["issue", "pr", "review", "ticket"];
const names = (value, where, max) => {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((v) => typeof v !== "string" || !v || v.length > 200)
  )
    throw new ContractError(
      `${where} must be a list of at most ${max} names of 1-200 characters.`,
    );
  return value;
};

// One incoming item from a plugin (R50.1, R50.2), as untrusted data. The
// source is the declared source's id, set by Avoozl, never by the plugin.
export function incomingItem(value, where = "item") {
  object(value, where);
  if (!ITEM_KINDS.includes(value.kind))
    throw new ContractError(
      `${where} kind must be one of ${ITEM_KINDS.join(", ")}.`,
    );
  if (!["open", "closed"].includes(value.state))
    throw new ContractError(`${where} state must be open or closed.`);
  const fields = value.fields ?? {};
  object(fields, `${where} fields`);
  if (Object.keys(fields).length > 50)
    throw new ContractError(`${where} fields may hold at most 50 keys.`);
  for (const [key, field] of Object.entries(fields))
    if (
      !["string", "number", "boolean"].includes(typeof field) ||
      (typeof field === "string" && field.length > 2000)
    )
      throw new ContractError(
        `${where} fields.${key} must be text of at most 2,000 characters, a number, or true or false.`,
      );
  const closed = value.state === "closed";
  return {
    id: text(value.id, `${where} id`, { max: 200 }),
    link: link(value.link, `${where} link`, { optional: false }),
    kind: value.kind,
    title: text(value.title, `${where} title`, { max: 240 }),
    body:
      value.body === undefined || value.body === null || value.body === ""
        ? ""
        : text(value.body, `${where} body`),
    labels: names(value.labels, `${where} labels`, 100),
    author: actor(value.author, `${where} author`),
    assignees: names(value.assignees, `${where} assignees`, 20),
    state: value.state,
    closeReason: closed
      ? ["completed", "not_planned"].includes(value.closeReason)
        ? value.closeReason
        : null
      : null,
    closedBy: closed ? actor(value.closedBy, `${where} closedBy`) : null,
    closedAt: closed ? actor(value.closedAt, `${where} closedAt`) : null,
    updatedAt: text(value.updatedAt, `${where} updatedAt`, { max: 64 }),
    fields,
    trigger: trigger(value.trigger, `${where} trigger`),
  };
}

// The event that last changed what a rule would match: who acted and that
// person's standing, which the plugin maps from its own system's roles.
const STANDINGS = ["none", "read", "triage", "write", "maintain", "admin"];
function trigger(value, where) {
  if (value === undefined || value === null) return null;
  object(value, where);
  if (value.permission !== undefined && !STANDINGS.includes(value.permission))
    throw new ContractError(
      `${where} permission must be one of ${STANDINGS.join(", ")}.`,
    );
  return {
    actor: actor(value.actor, `${where} actor`),
    permission: value.permission ?? null,
    eventId: actor(value.eventId, `${where} eventId`),
    at: actor(value.at, `${where} at`),
  };
}

// Rules kind (R40.9): one call, ruleSets, returning {sets: [{id, version,
// rules: [{id, pattern}]}]}. The rules stay in memory (content-rules.mjs).
export const rulesReplies = {
  ruleSets(reply) {
    try {
      return { sets: checkRuleSets(reply) };
    } catch (error) {
      throw new ContractError(error.message);
    }
  },
};

export function checkReply(kind, method, reply) {
  const check = (
    kind === "route"
      ? routeReplies
      : kind === "tracker"
        ? trackerReplies
        : kind === "rules"
          ? rulesReplies
          : kind === "gate"
            ? gateReplies
            : null
  )?.[method];
  if (!check) throw new ContractError(`Unknown ${kind} call ${method}.`);
  return check(reply);
}
