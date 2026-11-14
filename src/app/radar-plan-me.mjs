// The plan-me hand-off. When an Issue Radar crew skips an issue it adds the
// repository's needs-human label (`crewLabels.needsHuman`, for example
// "plan me"). Which list the issue goes to depends on who may ask for work
// and why the crew skipped:
//
//   not trusted                                   left alone: not in Intake,
//                                                 not in Needs you
//   trusted, scope new-feature/architecture/      Intake, to be planned
//   needs-design
//   trusted, any other scope or none              Needs you
//
// Trusted means the author passes the repository's actor check (allowedActors
// and minimumPermission), or the body carries this workspace's own
// `avoozl-task` marker, or an allowed actor added the repository's
// `acceptedLabel`. Reads only; the result is stored on the cached item.
import { parseMarker, planningIdentity } from "./github-marker.mjs";
import { actorAllowed, RADAR_DEFAULTS } from "./github-policy.mjs";
import { latestSkip } from "./radar-claims.mjs";
import { fail } from "./store.mjs";
import { issueSpecName } from "./github-planner.mjs";

export const INTAKE_SCOPES = new Set([
  "new-feature",
  "architecture",
  "needs-design",
]);
const lower = (value) => String(value).toLocaleLowerCase();

// This workspace's marker namespace, or null when it has none or its file is
// unreadable: the marker path then trusts nothing.
export function namespaceOf(workspaceRoot) {
  try {
    return planningIdentity(workspaceRoot).namespace;
  } catch {
    return null;
  }
}

// Where one issue goes. `scope` is null when the crew did not write one.
export const routeOf = ({ trusted, scope }) =>
  !trusted ? "left-alone" : INTAKE_SCOPES.has(scope) ? "intake" : "needs-you";

// Whether `login` passes the repository's actor check. A permission Avoozl
// cannot read (GitHub answers 403 without push access) is not trusted.
async function allowed(github, repository, settings, login, held) {
  if (!login) return false;
  const key = lower(login);
  if (!held.has(key)) {
    let permission = null;
    if (settings.minimumPermission) {
      try {
        permission = (await github.permission(repository, login))?.permission;
      } catch (error) {
        if (error?.status !== 403) throw error;
        permission = "none";
      }
    }
    held.set(key, actorAllowed(settings, login, permission || "none").allowed);
  }
  return held.get(key);
}

// Why this issue is trusted, or null. First match wins, cheapest first.
export async function trustOf(github, repository, settings, issue, options) {
  const held = options.held ?? new Map(),
    { body, user, labels } = issue;
  if (await allowed(github, repository, settings, user?.login, held))
    return "author";
  const marker = parseMarker(body);
  if (marker && options.namespace && marker.namespace === options.namespace)
    return "marker";
  const accepted = settings.acceptedLabel;
  if (
    accepted &&
    (labels || []).some(
      (label) => lower(label.name ?? label) === lower(accepted),
    )
  ) {
    const events = await github.issueEvents(repository, issue.number),
      added = (Array.isArray(events) ? events : [])
        .filter(
          (event) =>
            event.event === "labeled" &&
            lower(event.label?.name || "") === lower(accepted),
        )
        .at(-1);
    if (await allowed(github, repository, settings, added?.actor?.login, held))
      return "accepted";
  }
  return null;
}

// Who added `name` to an issue last, and whether they pass the actor check.
// An unreadable history is not allowed: the label does nothing.
async function labeler(github, repository, settings, item, name, held) {
  const events = await github.issueEvents(repository, item.number),
    added = (Array.isArray(events) ? events : [])
      .filter(
        (event) =>
          event.event === "labeled" &&
          lower(event.label?.name || "") === lower(name),
      )
      .at(-1),
    by = added?.actor?.login ?? null;
  return { by, allowed: await allowed(github, repository, settings, by, held) };
}

// Reads what the route needs for each cached issue that carries the
// needs-human label, and puts `planMe` on it; for each issue that carries
// the planning label it puts `planLabel` ({by, allowed}) on it. A read that
// fails leaves the item without `planMe`, which keeps today's route (Needs
// you), and without `planLabel`, which plans nothing.
export async function attachHandoffs(
  github,
  repository,
  settings,
  items,
  { namespace = null } = {},
) {
  if (settings.coder !== "issue-radar") return;
  const human = lower(settings.crewLabels.needsHuman),
    held = new Map();
  const plan = lower(settings.radar?.planLabel ?? RADAR_DEFAULTS.planLabel);
  for (const item of items) {
    delete item.planMe;
    delete item.planLabel;
    if (
      item.kind === "issue" &&
      item.labels.some((label) => lower(label) === plan)
    )
      try {
        item.planLabel = await labeler(
          github,
          repository,
          settings,
          item,
          plan,
          held,
        );
      } catch {
        // Left without `planLabel`: the next read tries again.
      }
    if (
      item.kind !== "issue" ||
      !item.labels.some((label) => lower(label) === human)
    )
      continue;
    try {
      const [issue, comments] = await Promise.all([
          github.issue(repository, item.number),
          github.listIssueComments(repository, item.number),
        ]),
        trust = await trustOf(github, repository, settings, issue, {
          namespace,
          held,
        }),
        skip = latestSkip(comments),
        scope = skip?.scope ?? null;
      item.planMe = {
        route: routeOf({ trusted: Boolean(trust), scope }),
        trust,
        scope,
        crewId: skip?.crewId ?? null,
      };
    } catch {
      // Left without `planMe`: the next read tries again.
    }
  }
}

// Plan this on an Intake row of a Radar-coded repository (rc-1.2): the
// New plan fields for one issue, and the source to record. Only an issue the
// Intake list shows now can be planned, so a plain issue or a stranger's
// planning label is refused. The issue text is data for the planner's brief.
export async function planThisRequest(github, policy, view, input = {}) {
  const { repository, number } = input;
  if (typeof repository !== "string" || !Number.isInteger(number))
    fail("Name one issue as repository and number.");
  const row = (view?.items || []).find(
    (item) =>
      item.kind === "issue" &&
      item.repository === repository &&
      item.number === number,
  );
  if (policy?.repositories?.[repository]?.coder !== "issue-radar")
    fail(`${repository} does not use Issue Radar as its coder.`, 409);
  if (!row) fail(`${repository}#${number} is not in Intake.`, 409);
  if (!github?.available?.()) fail("GitHub is not connected.", 409);
  const issue = await github.issue(repository, number);
  return {
    fields: {
      name: issueSpecName(repository, number),
      repositories: [repository],
      goal: `${row.title}\n\n${issue?.body || ""}`.trim().slice(0, 20000),
      context: row.url,
    },
    source: { repository, number },
  };
}
