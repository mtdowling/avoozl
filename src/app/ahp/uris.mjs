import { createHash } from "node:crypto";

export const ROOT_CHANNEL = "ahp-root://";

// Client-facing channel identifiers are derived from the workspace identity
// and the run ID, never from a mutable title or the currently selected
// folder. Two workspaces therefore cannot produce the same URI, and a URI
// keeps pointing at the same run for the life of the workspace.
export function channelUuid(workspaceId, kind, id) {
  const digest = createHash("sha256")
    .update(workspaceId + "\0" + kind + "\0" + id)
    .digest("hex");
  // RFC 4122 layout with the version/variant bits set so clients that parse
  // these as UUIDs accept them.
  const version = (
    (parseInt(digest.slice(12, 16), 16) & 0x0fff) |
    0x5000
  ).toString(16);
  const variant = (
    (parseInt(digest.slice(16, 20), 16) & 0x3fff) |
    0x8000
  ).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    version.padStart(4, "0"),
    variant.padStart(4, "0"),
    digest.slice(20, 32),
  ].join("-");
}

// The scheme carries the agent provider, because that is how the editor
// derives one: it reads a session URI's scheme and registers the chat-session
// provider `agent-host-<scheme>` (`_toAgentHostSessionResource` on 1.138.0).
// A session whose scheme is not one of the providers this host advertised
// therefore belongs to a provider nothing registered, and the editor drops it
// from the session list and cannot open it. The protocol's own examples use
// `ahp-session:/<uuid>`, and the identifier is host-chosen, so encoding the
// provider here is conformant and is what makes the session reachable.
export function sessionUri(workspaceId, runId, provider) {
  return (
    providerScheme(provider) +
    ":/s-" +
    channelUuid(workspaceId, "session", runId)
  );
}
export function chatUri(workspaceId, runId, provider) {
  return (
    providerScheme(provider) + ":/c-" + channelUuid(workspaceId, "chat", runId)
  );
}
function providerScheme(provider) {
  // A URI scheme admits letters, digits, `+`, `-` and `.`, and the editor
  // appends it to its own prefix, so anything else would produce a resource
  // neither side could parse.
  const scheme = String(provider || "avoozl").toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme))
    throw Error("An agent provider identifier must be usable as a URI scheme.");
  return scheme;
}
// Only channels this host actually serves. A changeset channel is not among
// them: a run's diff is read through `run.changes` and shown with the editor's
// own diff view, so advertising a changeset URI here would promise a
// subscription that does not exist.
export function runUris(workspaceId, run, provider) {
  // Accepts a run record or a run identifier with its provider, because
  // callers hold one or the other.
  const runId = typeof run === "string" ? run : run.id;
  const agentProvider =
    provider ?? (typeof run === "string" ? undefined : run.agentProvider);
  return {
    session: sessionUri(workspaceId, runId, agentProvider),
    chat: chatUri(workspaceId, runId, agentProvider),
  };
}
// Session and chat channels now share a scheme, so the kind lives in the
// identifier rather than in the scheme. The projection's mapping table stays
// authoritative; this is for callers holding only a string.
export function channelKind(resource) {
  if (resource === ROOT_CHANNEL) return "root";
  const match = /^[a-z][a-z0-9+.-]*:\/(s|c)-/.exec(resource || "");
  if (match) return match[1] === "s" ? "session" : "chat";
  // Older identifiers, kept readable so a stored projection or a client that
  // remembers a URI from a previous version still resolves.
  const legacy = /^ahp-([a-z-]+):\//.exec(resource || "");
  return legacy ? legacy[1] : null;
}
