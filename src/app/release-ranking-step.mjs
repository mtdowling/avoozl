// The projection's ranking step (RC31, design D36): reorders the candidates
// that may take a new ready label, and leaves a note per task for the Release
// queue. It adds no GitHub call beyond the cached open-pull-request read.
import { releaseFor } from "./radar-coder-release.mjs";
import {
  pathsOverlap,
  rankCandidates,
  unblockCounts,
} from "./release-ranking.mjs";

const META = "releaseRanking";
const BLOCKING = new Set(["requires", "sequence"]);
const HOUR = 3_600_000;

// What the Release queue shows: {taskId: {kind, reason}}.
export const rankingNotes = (store) => store.getMeta(META)?.notes ?? {};

