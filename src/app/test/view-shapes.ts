// The read views tests look into, with only the fields they read. A field a
// test does not name stays open (`unknown`), so a new one is read with a
// check, never assumed.
import assert from "node:assert/strict";

// One task on graph.view.
export interface GraphNode {
  id: string;
  state: string;
  handSetReview?: boolean;
  nextAction?: string;
  noSession?: string | null;
  kind?: string;
  ready?: boolean;
  // Its place in the dispatch order.
  order?: number;
  [key: string]: unknown;
}
export interface GraphView {
  tasks: GraphNode[];
  [key: string]: unknown;
}

// One Needs you row on conflicts.view.
export interface NeedsYouItem {
  kind: string;
  reason: string;
  detail: string;
  taskId?: string;
  hash?: string;
  [key: string]: unknown;
}
export interface ConflictsView {
  items: NeedsYouItem[];
  [key: string]: unknown;
}

// One card on delivery.view.
export interface DeliveryCard {
  id: string;
  handSetReview?: boolean;
  sessions: { role: string; [key: string]: unknown }[];
  [key: string]: unknown;
}
export interface DeliveryView {
  items: DeliveryCard[];
  [key: string]: unknown;
}

// What workspace.tick starts.
export interface TickResult {
  dispatch: {
    role: string;
    task: string;
    model?: string;
    crew?: unknown;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

// A plan as plan.create returns it, and plan.preview's revision to approve at.
export interface PlanDraft {
  id: string;
  hash: string;
  [key: string]: unknown;
}
export interface PlanPreview {
  expectedRevision: number;
  [key: string]: unknown;
}

// The value, failing the test when it is missing.
export function found<T>(value: T | null | undefined, what = "value"): T {
  assert.ok(value != null, `${what} is missing`);
  return value;
}
