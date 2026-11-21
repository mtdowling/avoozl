import type { Snapshot } from "./types.ts";

const PLAN_STATUSES: Record<string, string> = {
  done: "DONE",
  "not-started": "NOT STARTED",
  started: "STARTED",
  abandoned: "ABANDONED",
};
export function applyPlanMetadata(
  data: Snapshot,
  id: string,
  patch: Record<string, unknown>,
) {
  const doc = data.documents[id];
  if (!doc) throw Error("Document not indexed");
  const next: Record<string, unknown> = { ...doc.plan };
  for (const key of ["status", "category", "targetBranch", "progressPercent"])
    if (Object.hasOwn(patch, key)) {
      const value = patch[key];
      if (value === null || value === "") {
        delete next[key];
        continue;
      }
      if (key === "status" && !Object.hasOwn(PLAN_STATUSES, String(value)))
        throw Error("Unknown plan status");
      if (
        ["category", "targetBranch"].includes(key) &&
        (typeof value !== "string" || value.length > 160)
      )
        throw Error(key + " must be text up to 160 characters");
      if (
        key === "progressPercent" &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 100)
      )
        throw Error("Progress must be between 0 and 100");
      next[key] = value;
    }
  doc.plan = next;
  return doc;
}
