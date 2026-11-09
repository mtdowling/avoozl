import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../store.mjs";
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nupp-workspace-test-")),
    store = new Store(path.join(root, "workspace.sqlite"));
  store.importSnapshot(snapshot());
  t.after(() => {
    try {
      store.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, store };
}
export const markdown = `# A small plan\n\n## Design\n\nKeep the design in one document.\n\n\`\`\`task\n{"id":"foundation","title":"Build foundation","acceptance":["Foundation passes"],"epic":"sample"}\n\`\`\`\n\n\`\`\`task\n{"id":"delivery","title":"Deliver feature","acceptance":["Feature passes"],"requires":["foundation"],"epic":"sample"}\n\`\`\`\n`;
