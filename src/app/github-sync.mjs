import { randomUUID } from "node:crypto";
import os from "node:os";
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";
import { parseMarker } from "./github-marker.mjs";
import {
  evaluateRules,
  legacyRepositoryPolicy,
  matchingRules,
  MANAGED_LABEL_DEFAULT,
  READY_LABEL_DEFAULT,
  requireDefaultBranch,
} from "./github-policy.mjs";
import { mirrorGitHubIssue } from "./intake.mjs";

function linkedPullRequests(events, repository) {
  return [
    ...new Map(
      events
        .filter(
          (event) =>
            event.event === "cross-referenced" &&
            event.source?.issue?.pull_request &&
            typeof event.source.issue.html_url === "string",
        )
        .map((event) => {
          const issue = event.source.issue;
          const value = {
            nodeId: issue.node_id || null,
            number: issue.number || null,
            url: issue.html_url,
            title: issue.title || "",
            state: issue.state || "",
            repository:
              issue.repository?.full_name ||
              event.source?.repository?.full_name ||
              repository,
          };
          return [value.nodeId || value.url, value];
        }),
    ).values(),
  ];
}

export function projectedMarker(body) {
  return parseMarker(body);
}

export function machineIdentity(store) {
  let identity = store.getMeta("machineIdentity");
  if (!identity) {
    identity = {
      id: "machine-" + randomUUID().slice(0, 12),
      name: os.hostname().slice(0, 120),
      createdAt: new Date().toISOString(),
    };
    store.setMeta("machineIdentity", identity);
  }
  return identity;
}

export function issueRecordId(repository, issue) {
  return "github:" + repository.id + ":" + (issue.node_id || issue.number);
}

export async function prepareGitHubRepository(store, github, input) {
  const repository = parseRepository(input.repository || input.id);
  if (
    !store.get("projects", input.projectId) &&
    input.project?.id !== input.projectId
  )
    fail("Configure the execution project before its GitHub repository.");
  const [remote, user] = await Promise.all([
    github.repository(repository),
    github.currentUser(),
  ]);
  const label = READY_LABEL_DEFAULT,
    managedLabel = MANAGED_LABEL_DEFAULT;
  await github.ensureLabel(repository, {
    name: label,
    description: "Authorized for Avoozl execution",
  });
  await github.ensureLabel(repository, {
    name: managedLabel,
    description: "Managed by Avoozl projection",
  });
  const record = {
    ...repository,
    id: repository.id,
    nodeId: remote.node_id,
    private: Boolean(remote.private),
    projectId: input.projectId,
    ...(input.workspaceRepositoryId
      ? { workspaceRepositoryId: input.workspaceRepositoryId }
      : {}),
    label,
    managedLabel,
    assignee: input.assignee || user.login,
    provider: input.provider || null,
    model: input.model || null,
    autoStart: Boolean(input.autoStart),
    activeMachine: input.active === false ? null : machineIdentity(store).id,
    configuredBy: user.login,
    configuredAt: new Date().toISOString(),
  };
  return record;
}

export async function configureGitHubRepository(store, github, input) {
  const record = await prepareGitHubRepository(store, github, input);
  store.put("github_repositories", record);
  store.event(null, "github.repository.configured", {
    repository: record.id,
    projectId: record.projectId,
    assignee: record.assignee,
  });
  return record;
}

// One search per repository lists every open issue carrying a positive
// label of any rule (a rule's first all-label, or each of its any-labels).
// Only issues whose labels, assignee and author already match a rule have
// their events read; the matcher then checks the actor. Issues authorized
// before but missing from the search are read directly, because the search
// index can lag behind GitHub, and a lag must not withdraw them.
async function candidateIssues(github, config, policy, issueNumber, store) {
  if (issueNumber) {
    const issue = await github.issue(config, issueNumber);
    return issue && !issue.pull_request && issue.state === "open"
      ? [issue]
      : [];
  }
  const labels = policy.rules.flatMap((rule) =>
    rule.labelsAll.length ? rule.labelsAll.slice(0, 1) : rule.labelsAny,
  );
  const found = new Map();
  if (labels.length)
    for (const issue of await github.searchIssuesWithAnyLabel(config, labels))
      found.set(issue.number, issue);
  for (const previous of store.list("github_issues"))
    if (
      previous.repository === config.id &&
      previous.state === "authorized" &&
      !found.has(previous.number)
    ) {
      const issue = await github.issue(config, previous.number);
      if (issue && !issue.pull_request && issue.state === "open")
        found.set(issue.number, issue);
    }
  return [...found.values()].filter(
    (issue) => matchingRules(policy, issue, []).length,
  );
}

// Pacing for the tick (not a manual sync). Each tick asks GitHub whether
// the repository's issues changed, conditionally, so a quiet repository
// costs no rate limit (`issueActivity`, a 304). A change reads now and once
// more on the next tick, because the search index can lag. Unchanged reads
// still happen after 2, 4, then 8 minutes, so a missed change waits at most
// that long. A client without `issueActivity` uses the timer alone.
export const PACE_BASE_MS = 60 * 1000;
export const PACE_MAX_MS = 8 * 60 * 1000;
const PACE_META = "githubIntakePace";

// Low means under a tenth of the limit (at least 100 calls) for core, or
// under 2 searches left this minute. Past `resetAt` it is full again.
function lowBudget(github, now) {
  for (const [resource, floor] of [
    ["core", (limit) => Math.max(100, limit / 10)],
    ["search", () => 2],
  ]) {
    const limit = github.rateLimit?.(resource);
    if (
      limit &&
      Number.isFinite(limit.remaining) &&
      Date.parse(limit.resetAt) > now &&
      limit.remaining < floor(limit.limit)
    )
      return { resource, ...limit };
  }
  return null;
}

// What a repository's candidates look like now: any edit GitHub makes to
// an issue moves `updated_at`, and the body, labels and assignees are
// compared too, since the search already returned them.
const fingerprint = (issues) =>
  digest(
    JSON.stringify(
      issues
        .map((issue) => [
          issue.number,
          issue.updated_at || "",
          digest(String(issue.body || "")),
          (issue.labels || []).map((label) => label?.name ?? label).sort(),
          (issue.assignees || []).map((entry) => entry?.login).sort(),
        ])
        .sort((a, b) => a[0] - b[0]),
    ),
  );

// Only `respond` acts on a GitHub issue; pause and quarantine hold it.
const PRECEDENCE = ["quarantine", "pause", "respond"];

// `policy` is the normalized `.avoozl.json` GitHub policy. A registered
// repository it does not name keeps its single ready label as one rule.
export async function syncGitHubIssues(
  store,
  github,
  { repository, authorize, issueNumber, policy, pace } = {},
) {
  const configs = repository
    ? [store.get("github_repositories", parseRepository(repository).id)].filter(
        Boolean,
      )
    : store.list("github_repositories");
  const result = {
    repositories: [],
    authorized: [],
    matched: [],
    quarantined: [],
    paused: [],
    ignored: [],
    withdrawn: [],
    // Issues a rule matched whose actor GitHub would not show the
    // permission of (no push access): nothing runs for them.
    unchecked: [],
    // Set when paced intake stopped early for a low GitHub call budget.
    throttled: null,
  };
  const paceState = pace ? { ...(store.getMeta(PACE_META) || {}) } : null;
  for (const config of configs) {
    const configured = policy?.repositories?.[config.id],
      rules = configured || legacyRepositoryPolicy(config),
      rulesHash = digest(JSON.stringify(rules.rules || [])),
      paced = paceState?.[config.id];
    let etag = null,
      woken = false;
    if (pace) {
      result.throttled = lowBudget(github, pace.now);
      if (result.throttled) break;
      const due =
        paced?.rulesHash !== rulesHash ||
        paced.settle ||
        pace.now >= paced.nextAt;
      if (github.issueActivity) {
        const probe = await github.issueActivity(
          config,
          due ? null : paced.etag,
        );
        etag = probe.etag;
        woken = !due && probe.changed;
      }
      if (!due && !woken) {
        result.repositories.push({
          id: config.id,
          skipped: true,
          nextAt: new Date(paced.nextAt).toISOString(),
        });
        continue;
      }
    }
    const remote = await github.repository(config);
    if (configured) requireDefaultBranch(configured, remote, config.id);
    const issues = await candidateIssues(
      github,
      config,
      rules,
      issueNumber,
      store,
    );
    if (pace) {
      const print = fingerprint(issues),
        quiet =
          paced?.rulesHash === rulesHash && paced.fingerprint === print
            ? (paced.quiet || 0) + 1
            : 0;
      paceState[config.id] = {
        rulesHash,
        fingerprint: print,
        etag,
        settle: woken,
        quiet,
        nextAt: quiet
          ? pace.now + Math.min(PACE_BASE_MS * 2 ** quiet, PACE_MAX_MS)
          : pace.now,
      };
    }
    const seen = new Set(),
      unchecked = new Map();
    for (const issue of issues) {
      const id = issueRecordId(config, issue);
      const [events, timeline] = await Promise.all([
          github.issueEvents(config, issue.number),
          github.issueTimeline
            ? github.issueTimeline(config, issue.number)
            : Promise.resolve([]),
        ]),
        matches = await evaluateRules(
          rules,
          issue,
          events,
          async (login) =>
            (await github.permission(config, login))?.permission || "none",
        ),
        allowed = matches.filter((match) => match.allowed),
        primary = PRECEDENCE.map((action) =>
          allowed.find((match) => match.action === action),
        ).find(Boolean);
      if (!primary) {
        const blind = matches.find((match) => match.unchecked);
        if (blind) {
          unchecked.set(id, blind.reason);
          result.unchecked.push({
            id,
            repository: config.id,
            number: issue.number,
            actor: blind.actor,
            reason: blind.reason,
          });
          continue;
        }
        // Ignored for execution: nothing is written to the issue or graph.
        if (matches.length)
          result.ignored.push({
            id,
            repository: config.id,
            number: issue.number,
            matches,
          });
        continue;
      }
      // An issue Avoozl itself wrote (a spec, epic or old task issue) is
      // never answered.
      if (projectedMarker(issue.body)) continue;
      seen.add(id);
      const previous = store.get("github_issues", id),
        body = String(issue.body || ""),
        bodyHash = digest(body),
        // The trigger events whose snapshot the previous sync froze.
        frozen = new Set(
          previous?.matches?.map((match) => match.eventId) ??
            [previous?.labelEventId].filter(Boolean),
        ),
        snapshot = previous?.snapshotHash ?? previous?.bodyHash,
        // The title is frozen with the body: an edit after the trigger
        // must not change what the worker is told to build.
        snapshotTitle = previous?.snapshotTitle ?? previous?.title,
        confirmed = allowed.some(
          (match) => match.action === "resume" && !frozen.has(match.eventId),
        );
      let state = "authorized",
        reason = "";
      if (primary.action === "quarantine" || primary.action === "pause") {
        state = primary.action === "pause" ? "paused" : "quarantined";
        reason = `Rule ${primary.rule} ${primary.action}s this issue.`;
      } else if (
        previous &&
        frozen.has(primary.eventId) &&
        (snapshot !== bodyHash ||
          (snapshotTitle !== undefined && snapshotTitle !== issue.title)) &&
        !confirmed
      ) {
        state = "quarantined";
        reason =
          snapshot !== bodyHash
            ? "The issue body changed after its trigger snapshot. Remove and reapply the trigger label, or confirm this exact body."
            : "The issue title changed after its trigger snapshot. Remove and reapply the trigger label, or confirm this exact issue.";
      }
      if (
        authorize?.id === id &&
        authorize.bodyHash === bodyHash &&
        authorize.labelEventId === primary.eventId
      ) {
        state = "authorized";
        reason = "Confirmed locally for this exact issue snapshot.";
      }
      const record = {
        id,
        repository: config.id,
        nodeId: issue.node_id,
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
        body,
        bodyHash,
        snapshotHash: state === "authorized" ? bodyHash : snapshot || bodyHash,
        snapshotTitle:
          state === "authorized" ? issue.title : (snapshotTitle ?? issue.title),
        assignees: (issue.assignees || []).map((entry) => entry.login),
        rule: primary.rule,
        action: primary.action,
        matches: allowed.map(
          ({ rule, action, eventId, actor, at, permission }) => ({
            rule,
            action,
            eventId,
            actor,
            at,
            permission,
          }),
        ),
        labelEventId: primary.eventId,
        labelActor: primary.actor,
        labelAt: primary.at,
        permission: primary.permission,
        pullRequests: linkedPullRequests(timeline, config.id),
        // The issue's type, for fix work in Flow (§4.11, R79.1).
        issueType: issue.type?.name ?? null,
        state,
        reason,
        observedAt: new Date().toISOString(),
      };
      store.transaction(() => {
        // The issue is also a `github` incoming item (R50.4).
        record.item = mirrorGitHubIssue(store, config.id, issue, record);
        store.put("github_issues", record);
      });
      result[state === "authorized" ? "matched" : state].push(record);
    }
    for (const previous of store
      .list("github_issues")
      .filter(
        (entry) =>
          entry.repository === config.id &&
          entry.state === "authorized" &&
          (!issueNumber || entry.number === issueNumber) &&
          !seen.has(entry.id),
      )) {
      previous.state = "withdrawn";
      previous.reason =
        unchecked.get(previous.id) ||
        "No rule matches this issue for an allowed actor any more.";
      store.transaction(() => store.put("github_issues", previous));
      result.withdrawn.push(previous);
    }
    result.repositories.push({
      id: config.id,
      issues: issues.length,
      syncedAt: new Date().toISOString(),
    });
  }
  if (paceState) store.setMeta(PACE_META, paceState);
  store.setMeta("githubSync", result);
  store.event(null, "github.sync.completed", result);
  return result;
}

// One decision notice when the set of issues intake cannot check changes
// (not every tick): who counts there needs a person to grant access or
// name the actors.
export function uncheckedNotice(previous, result) {
  const key = (sync) =>
    (sync?.unchecked || [])
      .map((entry) => entry.id)
      .sort()
      .join(" ");
  if (!result?.unchecked?.length || key(previous) === key(result)) return [];
  const repositories = [
    ...new Set(result.unchecked.map((entry) => entry.repository)),
  ];
  return [
    {
      channel: "decision",
      title: `Avoozl can't check who counts on ${repositories.join(", ")}`,
      text: `${result.unchecked.length} matched issue${result.unchecked.length === 1 ? "" : "s"} wait, and nothing runs for them. ${result.unchecked[0].reason}`,
    },
  ];
}

// The tick's intake notices: who-counts holds, and one warning per GitHub
// rate-limit window when paced intake slowed down for a low budget.
export function intakeNotices(previous, result) {
  const notices = uncheckedNotice(previous, result),
    low = result?.throttled;
  if (low && previous?.throttled?.resetAt !== low.resetAt)
    notices.push({
      channel: "failure",
      title: "Avoozl is slowing GitHub reads",
      text: `Only ${low.remaining} of ${low.limit} GitHub ${low.resource} calls are left until ${low.resetAt}. Issue intake waits until then; watch fewer repositories or fewer rules to stay under the limit.`,
    });
  return notices;
}
