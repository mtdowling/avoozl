// Variant A of Observe (design §D10, RC8.1): Issue Radar's crew list and the
// credits its sessions used, read through the one gateway grant in
// `permissions.api`. Without the grant (or outside Kiro Crew) every read here
// answers nothing, and `radar.crews` stays exactly the GitHub-only view.
import { readCrews } from "./radar-handoff.mjs";

// Cost is read for this many claimed issues per call, newest first.
const COST_LIMIT = 20;
const num = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const stageOf = (value) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 40)
    : "unknown";

// The credits and turns of one issue's sessions, summed per stage (the
// session's last phase). Another app's answer: each field is checked.
export function costOf(body) {
  const stages = new Map();
  let credits = 0,
    turns = 0;
  for (const session of Array.isArray(body?.sessions) ? body.sessions : []) {
    const stage = stageOf(session?.lastPhase),
      entry = stages.get(stage) ?? { stage, credits: 0, turns: 0 };
    entry.credits += num(session?.credits);
    entry.turns += num(session?.turns);
    stages.set(stage, entry);
    credits += num(session?.credits);
    turns += num(session?.turns);
  }
  return { credits, turns, stages: [...stages.values()] };
}

// `{ crews, counts, cost }` when Issue Radar's crew list could be read for at
// least one repository, else null.
export async function readCrewStrip({
  crewReader,
  sessionsReader,
  repositories,
  rows,
}) {
  if (!crewReader || !repositories.length) return null;
  const crews = [],
    counts = { onDuty: 0, working: 0, paused: 0 };
  let granted = false;
  for (const repository of repositories) {
    const read = await readCrews(crewReader, repository);
    if (!read.available) continue;
    granted = true;
    for (const crew of read.crews)
      crews.push({
        repository,
        id: crew.id,
        name: crew.name,
        status: crew.status,
      });
    counts.onDuty += read.counts.onDuty;
    counts.working += read.counts.working;
    counts.paused += read.counts.paused;
  }
  if (!granted) return null;
  const cost = {};
  for (const row of sessionsReader ? rows.slice(0, COST_LIMIT) : []) {
    try {
      const answer = await sessionsReader(row.repository, row.number);
      if (answer.status === 200)
        cost[`${row.repository}#${row.number}`] = costOf(answer.body);
    } catch {
      // A failed read leaves that issue without a cost.
    }
  }
  return { crews, counts, cost };
}
