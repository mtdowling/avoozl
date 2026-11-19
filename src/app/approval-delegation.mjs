// Approval delegation (Requirement 109, design §4.38). A person names an
// identity, such as an agent, that may approve spec revisions on their
// behalf. The grant lives in this workspace's database, never in Git, so a
// commit cannot grant it, and only a person grants or revokes it (the
// operations are person-only, mcp-policy.mjs). A delegated approval records
// the delegate, the person it acts for and the grant it used; with no active
// grant a delegate is refused.
import { fail } from "./store.mjs";

const KEY = "approvalDelegates";
// An agent name, a session key prefix or a GitHub login: one token.
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,99}$/;
const PERSON = /^[^\n\r]{1,200}$/;

const entries = (store) => store.getMeta(KEY) || [];

function readIdentity(value) {
  const identity = typeof value === "string" ? value.trim() : "";
  if (!IDENTITY.test(identity))
    fail(
      "Name the delegate as one word of letters, digits, '.', '_', ':', '@', '/' or '-' (at most 100).",
    );
  return identity;
}

// The active grants, and every grant with revoked ones, newest first.
export function listDelegates(store) {
  const all = entries(store);
  return {
    delegates: all.filter((entry) => !entry.revokedAt),
    history: [...all].reverse(),
  };
}

const activeDelegate = (store, identity) =>
  entries(store).find(
    (entry) => entry.identity === identity && !entry.revokedAt,
  ) || null;

export function grantDelegate(store, { identity, onBehalfOf, note }) {
  identity = readIdentity(identity);
  const person = typeof onBehalfOf === "string" ? onBehalfOf.trim() : "";
  if (!PERSON.test(person))
    fail("Name the person the delegate approves for.", 400);
  const existing = activeDelegate(store, identity);
  if (existing) {
    if (existing.onBehalfOf === person) return { ...existing, existing: true };
    fail(
      `${identity} already approves on behalf of ${existing.onBehalfOf}. Revoke it first.`,
      409,
    );
  }
  const entry = {
    identity,
    onBehalfOf: person,
    grantedAt: new Date().toISOString(),
    ...(typeof note === "string" && note.trim()
      ? { note: note.trim().slice(0, 500) }
      : {}),
  };
  store.setMeta(KEY, [...entries(store), entry]);
  return entry;
}

// Revoking stops every later delegated approval and approval pull request.
// One the delegate already opened stays open on GitHub, where merging it is
// the merger's own act; the result lists them so the person can close them.
export function revokeDelegate(store, { identity, revokedBy }) {
  identity = readIdentity(identity);
  if (!activeDelegate(store, identity))
    fail(`${identity} is not an approval delegate.`, 404);
  const at = new Date().toISOString();
  store.setMeta(
    KEY,
    entries(store).map((entry) =>
      entry.identity === identity && !entry.revokedAt
        ? { ...entry, revokedAt: at, revokedBy: revokedBy || null }
        : entry,
    ),
  );
  const open = new Map();
  for (const [, state] of store.metaEntries("spec-approval:"))
    if (state?.state === "open" && state.delegation?.delegate === identity)
      open.set(`${state.repository}#${state.number}`, {
        repository: state.repository,
        number: state.number,
      });
  return {
    identity,
    revokedAt: at,
    openApprovalPullRequests: [...open.values()],
  };
}

// The delegation an approval acts under, or null for a person's own. A
// delegate named in the input must hold an active grant now, and approves
// only as the person who granted it. An approval pull request a delegate
// opened carries its delegation on its stored state: once that merges, the
// receipt records it as provenance (the merge is the merger's act).
export function approvalDelegation(store, { delegate, approvedBy, state }) {
  if (delegate === undefined || delegate === null)
    return state?.delegation || null;
  const named = readIdentity(delegate),
    grant = activeDelegate(store, named);
  if (!grant)
    fail(
      `Only a person approves a plan: ${named} is not an approval delegate in this workspace. A person grants it with \`avoozl approval delegate ${named}\`.`,
      403,
    );
  const given = typeof approvedBy === "string" ? approvedBy.trim() : "";
  if (given && given !== grant.onBehalfOf)
    fail(
      `${named} approves on behalf of ${grant.onBehalfOf}, not ${given}.`,
      403,
    );
  return {
    delegate: grant.identity,
    onBehalfOf: grant.onBehalfOf,
    grantedAt: grant.grantedAt,
  };
}

export const delegationEvidence = (delegation) =>
  `Approved by delegate ${delegation.delegate} on behalf of ${delegation.onBehalfOf} (delegation granted ${delegation.grantedAt}).`;
