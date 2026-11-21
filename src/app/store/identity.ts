import { randomUUID } from "node:crypto";
import type { Store } from "./store.ts";

// A stable per-workspace identity. Client-facing identifiers are namespaced by
// it, so two workspaces cannot collide and a renamed workspace keeps its
// mappings.
export function workspaceIdentity(store: Store): string {
  const existing = store.getMeta<string>("workspaceId");
  if (existing) return existing;
  return store.transaction(() => {
    const current = store.getMeta<string>("workspaceId");
    if (current) return current;
    const id = randomUUID();
    store.setMeta("workspaceId", id);
    return id;
  });
}
