// Types for delivery-lanes.mjs, for the Kiro Crew app page.
export type LaneId =
  | "ready"
  | "running"
  | "reviewing"
  | "needs-you"
  | "waiting"
  | "done";
export type AvoozlState = LaneId | "deferred";
export type LaneNodeState =
  | "done"
  | "needs-you"
  | "deferred"
  | "running"
  | "ready"
  | "waiting";

export interface LaneTask {
  state?: LaneNodeState | null;
  complete?: boolean;
  decision?: string | null;
  status?: string | null;
  ready?: boolean;
}

export interface LaneItem {
  deliveries?: { state?: unknown }[];
  sessions?: { status?: string | null; role?: string }[];
  needsYou?: unknown;
  complete?: boolean;
  status?: string | null;
  handSetReview?: boolean;
  githubReviews?: { state?: string } | null;
}

export const AVOOZL_STATES: readonly (readonly [AvoozlState, string])[];
export function nodeState(task: LaneTask): LaneNodeState;
export function laneOf(task: LaneTask | null, item: LaneItem | null): LaneId;
export function avoozlState(
  task: LaneTask | null,
  item: LaneItem | null,
): AvoozlState;
