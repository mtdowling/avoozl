// The plugin contract (design §4.8, Requirement 34): the calls Avoozl
// makes and the shape each reply must have. A plugin is outside code, so
// every reply is checked here before anything reads it, and its text stays
// untrusted data (quoted in briefs, escaped in views). A reply of the wrong
// shape is a broken plugin, never a partial result.

// Contract versions this Avoozl loads (R34.8). Changes inside a version only
// add optional fields or capabilities.
import { checkRuleSets } from "../content/content-rules.mjs";

export const SUPPORTED_CONTRACTS = [1];

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

const actor = (value, where) =>
  value === undefined || value === null
    ? null
    : text(value, where, { max: 200 });

// Intake kind (R50.7, R55.8): one call, poll.
export const intakeReplies = {
  // Changed items since the cursor. A bad item is
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
const rulesReplies = {
  ruleSets(reply) {
    try {
      return { sets: checkRuleSets(reply) };
    } catch (error) {
      throw new ContractError(error.message);
    }
  },
};

export function checkReply(kind, method, reply, asked) {
  const check = (
    kind === "intake"
      ? intakeReplies
      : kind === "rules"
        ? rulesReplies
        : kind === "credentials"
          ? credentialsReplies
          : null
  )?.[method];
  if (!check) throw new ContractError(`Unknown ${kind} call ${method}.`);
  return check(reply, asked);
}

// Credentials kind (plugin-credentials §D5): one call, token. `asked` is the
// permission set Avoozl asked for. A token is never put in an error.
const LEVELS = { read: 1, write: 2, admin: 3 };
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
export const credentialsReplies = {
  token(reply, asked = {}) {
    object(reply, "token reply");
    for (const key of Object.keys(reply))
      if (!["token", "expiresAt", "login", "person", "granted"].includes(key))
        throw new ContractError(`token reply ${key} is not a reply field.`);
    if (
      typeof reply.token !== "string" ||
      !/^[A-Za-z0-9_.~+/=-]{1,8192}$/.test(reply.token)
    )
      throw new ContractError(
        "token reply token must be 1 to 8,192 characters of letters, digits and _ . ~ + / = -.",
      );
    let expiresAt = null;
    if (reply.expiresAt !== null) {
      const at =
          typeof reply.expiresAt === "string"
            ? Date.parse(reply.expiresAt)
            : NaN,
        now = Date.now();
      if (!(at > now + 60_000 && at <= now + 24 * 3600_000))
        throw new ContractError(
          "token reply expiresAt must be null or a time 1 minute to 24 hours from now.",
        );
      expiresAt = new Date(at).toISOString();
    }
    const login = String(reply.login ?? "");
    if (!LOGIN.test(login.replace(/\[bot\]$/, "")))
      throw new ContractError("token reply login must be a GitHub login.");
    if (
      reply.person !== undefined &&
      (typeof reply.person !== "string" || !LOGIN.test(reply.person))
    )
      throw new ContractError(
        "token reply person must be a GitHub login of a person.",
      );
    const granted = reply.granted;
    if (
      granted !== "all" &&
      (!granted ||
        typeof granted !== "object" ||
        Array.isArray(granted) ||
        Object.entries(granted).some(
          ([name, level]) => !/^[a-z_]{1,64}$/.test(name) || !LEVELS[level],
        ))
    )
      throw new ContractError(
        'token reply granted must be "all" or a permission set.',
      );
    const missing = Object.entries(asked).filter(
      ([name, level]) =>
        granted !== "all" && !(LEVELS[granted[name]] >= LEVELS[level]),
    );
    if (missing.length)
      throw new ContractError(
        `granted ${missing.map(([name]) => `${name}: ${granted[name] || "none"}`).join(", ")}; the job needs ${missing.map(([name, level]) => `${name}: ${level}`).join(", ")}.`,
      );
    const broader =
      granted === "all" ||
      Object.entries(granted).some(
        ([name, level]) => !(LEVELS[asked[name]] >= LEVELS[level]),
      );
    return {
      token: reply.token,
      expiresAt,
      login,
      person: reply.person ?? null,
      granted,
      broader,
    };
  },
};
