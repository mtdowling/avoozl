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

export function sessionUri(workspaceId, runId) {
  return "ahp-session:/" + channelUuid(workspaceId, "session", runId);
}
export function chatUri(workspaceId, runId) {
  return "ahp-chat:/" + channelUuid(workspaceId, "chat", runId);
}
// Only channels this host actually serves. A changeset channel is not among
// them: a run's diff is read through `run.changes` and shown with the editor's
// own diff view, so advertising a changeset URI here would promise a
// subscription that does not exist.
export function runUris(workspaceId, runId) {
  return {
    session: sessionUri(workspaceId, runId),
    chat: chatUri(workspaceId, runId),
  };
}
export function channelKind(resource) {
  if (resource === ROOT_CHANNEL) return "root";
  const match = /^ahp-([a-z-]+):\//.exec(resource || "");
  return match ? match[1] : null;
}
