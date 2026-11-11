import { randomUUID } from "node:crypto";
import os from "node:os";
import { digest, queryTasks } from "../model.mjs";
import { fail } from "./store.mjs";
import { parseRepository, requirePrivateRepository } from "./github.mjs";

const permissionRank = new Map([
  ["none", 0],
  ["read", 1],
  ["triage", 2],
  ["write", 3],
  ["maintain", 4],
  ["admin", 5],
]);

const taskFence = () => /^```task\s*\r?\n([\s\S]*?)^```\s*$/gm;

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

function textList(value, name, { required = false } = {}) {
  if (value === undefined && !required) return [];
  if (
    !Array.isArray(value) ||
    (required && !value.length) ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  )
    fail(`${name} must be a list of non-empty strings.`);
  return value.map((entry) => entry.trim());
}

function headingChecklist(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  let inSection = false,
    level = 0;
  const result = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match) {
      if (!inSection && match[2].trim().toLowerCase() === heading) {
        inSection = true;
        level = match[1].length;
        continue;
      }
      if (inSection && match[1].length <= level) break;
    }
    if (!inSection) continue;
    const checkbox = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/);
    if (checkbox) result.push(checkbox[1].trim());
  }
  return result;
}

export function parseIssueTask(issue) {
  const body = String(issue.body || ""),
    matches = [...body.matchAll(taskFence())];
  if (matches.length > 1)
    fail("An issue may contain only one fenced task block.");
  if (matches.length) {
    let item;
    try {
      item = JSON.parse(matches[0][1]);
    } catch {
      fail("The issue task block contains invalid JSON.");
    }
    const allowed = new Set([
      "title",
      "summary",
      "acceptance",
      "requires",
      "tags",
      "resources",
      "epic",
      "track",
      "projectId",
    ]);
    const unexpected = Object.keys(item).filter((key) => !allowed.has(key));
    if (unexpected.length)
      fail("Unsupported issue task fields: " + unexpected.join(", ") + ".");
    if (
      item.title !== undefined &&
      (typeof item.title !== "string" ||
        !item.title.trim() ||
        item.title.length > 240)
    )
      fail("Issue task title must contain 1–240 characters.");
    for (const field of ["summary", "epic", "track", "projectId"])
      if (item[field] !== undefined && typeof item[field] !== "string")
        fail(field + " must be text.");
    return {
      title: item.title?.trim() || issue.title,
      summary: item.summary?.trim() || body.slice(0, 4000),
      acceptance: textList(item.acceptance, "acceptance", { required: true }),
      requires: textList(item.requires, "requires"),
      tags: textList(item.tags, "tags"),
      resources: textList(item.resources, "resources"),
      epic: item.epic,
      track: item.track,
      projectId: item.projectId,
      parser: "fenced-task",
    };
  }
  const checklist = headingChecklist(body, "acceptance criteria");
  return {
    title: issue.title,
    summary: body.slice(0, 4000),
    acceptance: checklist.length
      ? checklist
      : [
          "Configured required checks pass.",
          "A human explicitly accepts the result.",
        ],
    requires: [],
    tags: [],
    resources: [],
    parser: checklist.length ? "acceptance-checklist" : "required-checks",
  };
}

export function projectedMarker(body) {
  const match = String(body || "").match(
    /<!--\s*avoozl-task\s*\n([\s\S]*?)\n-->/,
  );
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    return value?.version === 1 ? value : null;
  } catch {
    return null;
  }
}

function managedIssueBody(task, plan) {
  const marker = {
    version: 1,
    taskId: task.id,
    planId: plan.id,
    planHash: plan.hash,
    sourceHash: task.approvedSource?.hash || task.source?.hash || null,
  };
  const requires = (task.requires || []).map((id) => `- ${id}`).join("\n");
  return `<!-- avoozl-task
${JSON.stringify(marker)}
-->
<!-- avoozl:managed:start -->
This issue is projected from approved design \`${plan.id}\` at \`${plan.hash.slice(0, 12)}\`.

${task.summary || task.nextAction || ""}

## Acceptance criteria

${(task.acceptance || []).map((item) => `- [ ] ${item}`).join("\n")}
${requires ? `\n## Dependencies\n\n${requires}\n` : ""}
<!-- avoozl:managed:end -->`;
}

function replaceManagedBody(current, managed) {
  const nextMarker = managed.match(/<!--\s*avoozl-task\s*\n[\s\S]*?\n-->/)?.[0],
    next = managed.match(
      /<!-- avoozl:managed:start -->[\s\S]*<!-- avoozl:managed:end -->/,
    )?.[0];
  if (!next || !nextMarker) return managed;
  if (!current?.includes("<!-- avoozl:managed:start -->")) return managed;
  return current
    .replace(/<!--\s*avoozl-task\s*\n[\s\S]*?\n-->/, nextMarker)
    .replace(
      /<!-- avoozl:managed:start -->[\s\S]*?<!-- avoozl:managed:end -->/,
      next,
    );
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

function authorization(labelEvent, permission, config) {
  const actor = labelEvent?.actor?.login || "";
  if (!actor)
    return { authorized: false, reason: "The ready label event has no actor." };
  const allowlist = config.allowedActors || [];
  if (allowlist.length && !allowlist.includes(actor))
    return {
      authorized: false,
      actor,
      reason: "The label actor is not on the allowlist.",
    };
  const required = permissionRank.get(config.minimumPermission || "write") ?? 3;
  const actual = permissionRank.get(permission?.permission || "none") ?? 0;
  if (actual < required)
    return {
      authorized: false,
      actor,
      permission: permission?.permission || "none",
      reason: `The label actor needs ${config.minimumPermission || "write"} permission.`,
    };
  return { authorized: true, actor, permission: permission.permission };
}

function issueRecordId(repository, issue) {
  return "github:" + repository.id + ":" + (issue.node_id || issue.number);
}

function taskIdFor(issue) {
  return "github-" + digest(issue.node_id || String(issue.id)).slice(0, 20);
}

function ensureInbox(data) {
  if (!data.epics.some((epic) => epic.id === "inbox"))
    data.epics.push({
      id: "inbox",
      title: "Inbox",
      scope: "catalog",
      color: "#96abc1",
    });
  if (!data.tracks.some((track) => track.id === "catalog"))
    data.tracks.push({ id: "catalog", label: "General" });
}

function applyIssueTask(data, record, parsed, config, marker) {
  ensureInbox(data);
  const existing = marker
    ? data.tasks.find((task) => task.id === marker.taskId)
    : data.tasks.find((task) => task.id === record.taskId);
  if (marker && !existing)
    fail("Projected issue refers to a task that is not present locally.");
  const task = existing || {
    id: record.taskId,
    scope: "runtime",
    kind: "task",
    status: "planned",
    epic: parsed.epic || "inbox",
    track: parsed.track || "catalog",
    createdAt: new Date().toISOString(),
  };
  if (!marker) {
    Object.assign(task, {
      title: parsed.title,
      summary: parsed.summary,
      acceptance: parsed.acceptance,
      tags: [...new Set(["github", ...(parsed.tags || [])])],
      resources: parsed.resources || [],
      epic: parsed.epic || task.epic || "inbox",
      track: parsed.track || task.track || "catalog",
      projectId: parsed.projectId || config.projectId,
      approvedSource: {
        hash: record.bodyHash,
        text: record.body,
      },
    });
  }
  task.owner = record.assignees.join(", ");
  task.github = {
    repository: config.id,
    nodeId: record.nodeId,
    number: record.number,
    url: record.url,
    origin: marker ? "design" : "issue",
    labelEventId: record.labelEventId,
    bodyHash: record.bodyHash,
    pullRequests: record.pullRequests || [],
  };
  task.dispatch = {
    ready: record.state === "authorized",
    state: record.state,
    reason: record.reason,
    assignee: record.assignees,
    machineId: config.activeMachine || null,
  };
  if (!marker) task.needsReview = record.state !== "authorized";
  task.updatedAt = new Date().toISOString();
  if (!existing) data.tasks.push(task);
  if (!marker) {
    data.edges = data.edges.filter(
      (edge) =>
        edge.to !== task.id || edge.kind !== "requires" || edge.githubIssue,
    );
    for (const from of parsed.requires || [])
      if (data.tasks.some((candidate) => candidate.id === from))
        data.edges.push({
          id: `${from}:requires:${task.id}`,
          from,
          to: task.id,
          kind: "requires",
          githubIssue: record.id,
          reason: "Declared in authorized GitHub issue snapshot.",
        });
  }
  return task;
}

export async function configureGitHubRepository(store, github, input) {
  const repository = parseRepository(input.repository || input.id);
  if (!store.get("projects", input.projectId))
    fail("Configure the execution project before its GitHub repository.");
  const [remote, user] = await Promise.all([
    github.repository(repository),
    github.currentUser(),
  ]);
  if (!remote.private)
    fail(
      "Avoozl refuses public repositories. Register a private GitHub repository.",
      403,
    );
  const label = input.label || "avoozl:ready";
  await github.ensureLabel(repository, {
    name: label,
    description: "Authorized for Avoozl execution",
  });
  const record = {
    ...repository,
    id: repository.id,
    nodeId: remote.node_id,
    private: Boolean(remote.private),
    projectId: input.projectId,
    label,
    assignee: input.assignee || user.login,
    allowedActors: [...new Set(input.allowedActors || [])],
    minimumPermission: input.minimumPermission || "write",
    provider: input.provider || null,
    model: input.model || null,
    autoStart: Boolean(input.autoStart),
    activeMachine: input.active === false ? null : machineIdentity(store).id,
    configuredBy: user.login,
    configuredAt: new Date().toISOString(),
  };
  if (!["write", "maintain", "admin"].includes(record.minimumPermission))
    fail("Minimum label permission must be write, maintain, or admin.");
  store.put("github_repositories", record);
  store.event(null, "github.repository.configured", {
    repository: record.id,
    projectId: record.projectId,
    assignee: record.assignee,
  });
  return record;
}

export async function syncGitHubIssues(
  store,
  github,
  { repository, authorize, issueNumber } = {},
) {
  const configs = repository
    ? [store.get("github_repositories", parseRepository(repository).id)].filter(
        Boolean,
      )
    : store.list("github_repositories");
  const result = {
    repositories: [],
    authorized: [],
    quarantined: [],
    pending: [],
    withdrawn: [],
  };
  for (const config of configs) {
    await requirePrivateRepository(github, config);
    const issues = issueNumber
      ? [await github.issue(config, issueNumber)].filter(
          (issue) =>
            issue &&
            !issue.pull_request &&
            issue.state === "open" &&
            (issue.labels || []).some(
              (label) =>
                (typeof label === "string" ? label : label?.name) ===
                config.label,
            ) &&
            (issue.assignees || []).some(
              (assignee) => assignee?.login === config.assignee,
            ),
        )
      : await github.listReadyIssues(config, {
          label: config.label,
          assignee: config.assignee,
        });
    const seen = new Set();
    for (const issue of issues) {
      const id = issueRecordId(config, issue);
      seen.add(id);
      const [events, timeline] = await Promise.all([
          github.issueEvents(config, issue.number),
          github.issueTimeline
            ? github.issueTimeline(config, issue.number)
            : Promise.resolve([]),
        ]),
        labelEvent = events
          .filter(
            (event) =>
              event.event === "labeled" && event.label?.name === config.label,
          )
          .at(-1),
        previous = store.get("github_issues", id),
        body = String(issue.body || ""),
        bodyHash = digest(body),
        marker = projectedMarker(body);
      let auth = {
        authorized: false,
        reason: "No ready label event was found.",
      };
      if (labelEvent) {
        const permission = await github.permission(
          config,
          labelEvent.actor?.login || "",
        );
        auth = authorization(labelEvent, permission, config);
      }
      let state = auth.authorized ? "authorized" : "pending",
        reason = auth.reason || "";
      if (
        previous &&
        previous.labelEventId ===
          String(labelEvent?.node_id || labelEvent?.id) &&
        previous.bodyHash !== bodyHash
      ) {
        state = "quarantined";
        reason =
          "The issue body changed after its authorization receipt. Remove and reapply the ready label, or confirm this exact body.";
      }
      if (
        authorize?.id === id &&
        authorize.bodyHash === bodyHash &&
        authorize.labelEventId === String(labelEvent?.node_id || labelEvent?.id)
      ) {
        state = "authorized";
        reason = "Confirmed locally for this exact issue snapshot.";
      }
      const parsed = parseIssueTask(issue),
        record = {
          id,
          repository: config.id,
          taskId: marker?.taskId || previous?.taskId || taskIdFor(issue),
          nodeId: issue.node_id,
          number: issue.number,
          url: issue.html_url,
          title: issue.title,
          body,
          bodyHash,
          assignees: (issue.assignees || []).map((entry) => entry.login),
          labelEventId: String(labelEvent?.node_id || labelEvent?.id || ""),
          labelActor: labelEvent?.actor?.login || "",
          labelAt: labelEvent?.created_at || "",
          permission: auth.permission || null,
          pullRequests: linkedPullRequests(timeline, config.id),
          parser: parsed.parser,
          state,
          reason,
          observedAt: new Date().toISOString(),
        };
      store.transaction(() => {
        store.put("github_issues", record);
        const data = structuredClone(store.read());
        applyIssueTask(data, record, parsed, config, marker);
        store.commit(data, "Synchronize " + config.id + "#" + issue.number);
      });
      result[state].push(record);
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
        "The ready label or matching assignee is no longer present.";
      store.transaction(() => {
        store.put("github_issues", previous);
        const data = structuredClone(store.read()),
          task = data.tasks.find((item) => item.id === previous.taskId);
        if (task) {
          task.dispatch = {
            ...task.dispatch,
            ready: false,
            state: "withdrawn",
            reason: previous.reason,
          };
          store.commit(data, "Withdraw " + previous.id);
        }
      });
      result.withdrawn.push(previous);
    }
    result.repositories.push({
      id: config.id,
      issues: issues.length,
      syncedAt: new Date().toISOString(),
    });
  }
  store.setMeta("githubSync", result);
  store.event(null, "github.sync.completed", result);
  return result;
}

export async function projectPlanIssues(store, github, { planId, repository }) {
  const plan = store.get("plans", planId);
  if (!plan || plan.state !== "approved")
    fail("Approve the design revision before projecting issues.", 409);
  const data = store.read(),
    tasks = data.tasks.filter((task) => task.planId === plan.id),
    ready = new Set(
      queryTasks(data, { scope: "all", q: "ready:true" }).map(
        (task) => task.id,
      ),
    ),
    results = [];
  for (const task of tasks) {
    const config = repository
      ? store.get("github_repositories", parseRepository(repository).id)
      : store
          .list("github_repositories")
          .find(
            (entry) =>
              entry.projectId === (task.projectId || plan.context?.projectId),
          );
    if (!config)
      fail(`No GitHub repository is registered for task ${task.id}.`);
    await requirePrivateRepository(github, config);
    const managed = managedIssueBody(
      {
        ...task,
        requires: data.edges
          .filter((edge) => edge.to === task.id && edge.kind === "requires")
          .map((edge) => edge.from),
      },
      plan,
    );
    let issue;
    if (
      task.github?.origin === "design" &&
      task.github.repository === config.id
    ) {
      const current = await github.issue(config, task.github.number);
      issue = await github.updateIssue(config, task.github.number, {
        title: task.title,
        body: replaceManagedBody(current.body, managed),
      });
    } else {
      issue = await github.createIssue(config, {
        title: task.title,
        body: managed,
        assignees: config.assignee ? [config.assignee] : undefined,
      });
    }
    if (ready.has(task.id))
      await github.addLabels(config, issue.number, [config.label]);
    else await github.removeLabel(config, issue.number, config.label);
    if (config.assignee)
      await github.addAssignees(config, issue.number, [config.assignee]);
    const bodyHash = digest(String(issue.body || managed)),
      record = {
        id: issueRecordId(config, issue),
        repository: config.id,
        taskId: task.id,
        nodeId: issue.node_id,
        number: issue.number,
        url: issue.html_url,
        body: issue.body || managed,
        bodyHash,
        assignees: (issue.assignees || []).map((entry) => entry.login),
        state: ready.has(task.id) ? "authorized" : "blocked",
        projectedPlanId: plan.id,
        projectedPlanHash: plan.hash,
        observedAt: new Date().toISOString(),
      };
    store.transaction(() => {
      store.put("github_issues", record);
      const next = structuredClone(store.read()),
        local = next.tasks.find((item) => item.id === task.id);
      local.github = {
        repository: config.id,
        nodeId: issue.node_id,
        number: issue.number,
        url: issue.html_url,
        origin: "design",
        bodyHash,
      };
      local.projectId ||= config.projectId;
      local.dispatch = {
        ready: ready.has(task.id),
        state: ready.has(task.id) ? "authorized" : "blocked",
        assignee: record.assignees,
        machineId: config.activeMachine || null,
      };
      store.commit(next, "Project " + task.id);
    });
    results.push(record);
  }
  store.event(null, "github.plan.projected", {
    planId: plan.id,
    planHash: plan.hash,
    issues: results.map((entry) => entry.id),
  });
  return { planId: plan.id, planHash: plan.hash, issues: results };
}

export async function startAuthorizedIssue(ops, input) {
  const task = ops
    .read()
    .tasks.find(
      (item) =>
        (input.taskId && item.id === input.taskId) ||
        (input.nodeId && item.github?.nodeId === input.nodeId),
    );
  if (!task) fail("GitHub task not found.", 404);
  if (task.dispatch?.state !== "authorized" || task.dispatch?.ready !== true)
    fail(task.dispatch?.reason || "This GitHub task is not authorized.", 409);
  const config = ops.store.get("github_repositories", task.github.repository);
  if (!config) fail("The GitHub repository is not registered.", 409);
  await requirePrivateRepository(ops.github, config);
  const machine = machineIdentity(ops.store);
  if (config.activeMachine && config.activeMachine !== machine.id)
    fail("This Avoozl machine is not active for the repository.", 409);
  const provider = input.provider || config.provider;
  if (!provider) fail("Choose an agent provider for GitHub dispatch.");
  return ops.manager.start({
    taskId: task.id,
    projectId: input.projectId || task.projectId || config.projectId,
    provider,
    model: input.model || config.model || undefined,
    approvalMode: input.approvalMode || "manual",
    prompt:
      input.prompt ||
      `Implement GitHub issue ${config.id}#${task.github.number}. Stay within the authorized issue snapshot and acceptance criteria.`,
    title: task.title,
    parentRunId: input.parentRunId,
    background: input.background ?? true,
  });
}
