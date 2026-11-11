import type { QueueItem } from "./web/types";

export function queueItemNeedsAttention(item: QueueItem): boolean;
export function queueItemProcessed(item: QueueItem): boolean;
export function adaptiveRecentGitHubItems(
  items: QueueItem[],
  options?: {
    now?: number;
    minPerRepository?: number;
    maxPerRepository?: number;
    maxTotal?: number;
    windowsInDays?: number[];
  },
): QueueItem[];
export function queueTriageItems(
  items: QueueItem[],
  options?: Parameters<typeof adaptiveRecentGitHubItems>[1],
): QueueItem[];
