import path from "node:path";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { runUris } from "../ahp/uris.mjs";
import { agentProviderId } from "../ahp/projection.mjs";
import { workspaceIdentity } from "../identity.mjs";
export function snapshot() {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    project: {
      name: "Nupp",
      title: "Fixture",
      integration: {
        revision: "abc",
        mainRevision: "abc",
        acceptedRevision: "abc",
      },
      pollIntervalMs: 10000,
    },
    statuses: [
      { id: "planned", label: "Planned", complete: false },
      { id: "partial", label: "Partly implemented", complete: false },
      { id: "implemented", label: "Implemented", complete: false },
      { id: "accepted", label: "Accepted", complete: true },
      { id: "review", label: "Review", complete: false },
      { id: "blocked", label: "Blocked", complete: false },
      { id: "deferred", label: "Deferred", complete: false },
    ],
    epics: [{ id: "sample", title: "Sample", scope: "catalog" }],
    tracks: [{ id: "catalog", label: "Plans" }],
    tasks: [
      {
        id: "sample-task",
        title: "Implement fixture",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["Pass fixture test."],
      },
    ],
    edges: [],
    documents: {},
    changelog: [],
    unknownExtension: { preserve: true },
  };
}
export function fixture(t) {
  const root = temporaryDirectory(),
    store = new Store(path.join(root, "workspace.sqlite"));
  store.importSnapshot(snapshot());
  t.after(() => {
    try {
      store.close();
    } catch {}
  });
  return { root, store };
}
// Wait for a condition rather than for a duration. A fixed sleep turns a
// slower machine, or a busier test run, into a failure that says nothing
// about the behavior under test.
export async function waitFor(predicate, { timeoutMs = 20000, label } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline)
      throw Error("Timed out waiting for " + (label || "a condition"));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
export const markdown = `# A small plan\n\n## Design\n\nKeep the design in one document.\n\n\`\`\`task\n{"id":"foundation","title":"Build foundation","acceptance":["Foundation passes"],"epic":"sample"}\n\`\`\`\n\n\`\`\`task\n{"id":"delivery","title":"Deliver feature","acceptance":["Feature passes"],"requires":["foundation"],"epic":"sample"}\n\`\`\`\n`;

// The channel identifiers for a run, with the scheme the projection uses: the
// advertised agent provider. Resolved from the stored run so a test cannot
// drift from what the host actually serves.
export function urisFor(store, run) {
  const id = typeof run === "string" ? run : run.id;
  const record = store.get("runs", id) || (typeof run === "object" ? run : {});
  return runUris(
    workspaceIdentity(store),
    id,
    agentProviderId(record.provider),
  );
}
