import type { RequestRecord, RunSummary } from "./web/types";

export type WebNotificationSignal = {
  runId: string;
  state: string;
  key: string;
  title: string;
  body: string;
  tag: string;
};

export function webNotificationSignals(
  runs: RunSummary[],
  requests?: RequestRecord[],
): WebNotificationSignal[];

export function newWebNotificationSignals(
  previous: WebNotificationSignal[] | null,
  next: WebNotificationSignal[],
): WebNotificationSignal[];
