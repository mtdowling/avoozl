// Send to Issue Radar (design §8.5, R52): a person labels untriaged issues
// for an Issue Radar crew. A crew works the open issues that carry a label
// in its scope (every open issue when the scope is empty), skips any issue
// that already has a `crew:` label, and writes only its claim and
// needs-human labels, with the owner's `gh` login. Avoozl reads the crews
// through the gateway when the app token may, writes only the chosen label,
// and records a receipt per issue.
import { allowWrite } from "./content-rules.mjs";
import { gatewayClient } from "./gateway-client.mjs";
import { actorAllowed } from "./github-policy.mjs";
import { fail } from "./store.mjs";
import {
  HANDOFF_KIND,
  handoffId,
  handoffReceipts,
  readCache,
  untriagedView,
} from "./untriaged.mjs";

// Issue Radar's crew list route (crew_routes.py `GET /crews`).
export const CREWS_ROUTE = "/api/apps/issue-radar/crews";
// The pipeline route that lists one issue's sessions (pipeline_routes.py).
export const SESSIONS_ROUTE = "/api/apps/issue-radar/pipeline/item/sessions";
// GitHub refuses longer label names.
export const LABEL_MAX = 50;
export const HANDOFF_MAX = 100;
const TEXT_MAX = 200;

const lower = (value) => String(value).toLocaleLowerCase();
const text = (value, max = TEXT_MAX) =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : null;

// A function that reads one repository's crews through the gateway, or null
// when this process has no gateway client (the CLI, tests).
export function issueRadarReader(env = process.env, request = fetch) {
  const client = gatewayClient(env, request);
  if (!client) return null;
  return async (repository) => {
    const [owner, repo] = repository.split("/"),
      response = await client.call(
        `${CREWS_ROUTE}?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        { method: "GET" },
      );
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  };
}

// A function that reads one issue's sessions and their credits from Issue
// Radar's pipeline route, or null without a gateway client.
export function issueRadarSessionsReader(env = process.env, request = fetch) {
  const client = gatewayClient(env, request);
  if (!client) return null;
  return async (repository, number) => {
    const [owner, repo] = repository.split("/"),
      response = await client.call(
        `${SESSIONS_ROUTE}?number=${encodeURIComponent(number)}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        { method: "GET" },
      );
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  };
}

// Why the crews could not be read, in words for the dialog.
function unreadable(status, body) {
  const error = String(body?.error || "");
  if (status === 403 && /disabled/i.test(error))
    return "Issue Radar is turned off in Kiro Crew.";
  if (status === 403)
    return "Kiro Crew does not let Avoozl read Issue Radar's crews yet. Type the label the crew watches.";
  if (status === 404 && body?.code === "repo_not_connected")
    return "This repository is not connected in Issue Radar. Connect it there first.";
  return `Issue Radar answered ${status}. Type the label the crew watches.`;
}

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);

// The crews Issue Radar reports, checked field by field: this is another
// app's answer, so each crew keeps only well-formed names and labels.
function crewsOf(body) {
  const crews = [];
  for (const crew of Array.isArray(body?.crews) ? body.crews : []) {
    const id = text(crew?.id),
      name = text(crew?.name) ?? id;
    if (!id) continue;
    const labels = (Array.isArray(crew.labels) ? crew.labels : [])
      .map((label) => text(label, LABEL_MAX))
      .filter(Boolean);
    crews.push({
      id,
      name,
      labels,
      status: text(crew.status, 20) ?? null,
      emptyScope: labels.length === 0,
    });
  }
  return crews;
}

// `untriaged.crews`: one repository's crews, or why they can't be read.
export async function readCrews(reader, repository) {
  if (!reader)
    return {
      repository,
      available: false,
      reason:
        "Avoozl can read Issue Radar's crews only inside Kiro Crew. Type the label the crew watches.",
      crews: [],
      needsHumanLabel: null,
    };
  let answer;
  try {
    answer = await reader(repository);
  } catch (error) {
    return {
      repository,
      available: false,
      reason: `Issue Radar could not be read: ${error.message}`,
      crews: [],
      needsHumanLabel: null,
    };
  }
  if (answer.status !== 200)
    return {
      repository,
      available: false,
      reason: unreadable(answer.status, answer.body),
      crews: [],
      needsHumanLabel: null,
    };
  return {
    repository,
    available: true,
    reason: null,
    crews: crewsOf(answer.body),
    counts: {
      onDuty: count(answer.body?.counts?.on_duty),
      working: count(answer.body?.counts?.working),
      paused: count(answer.body?.counts?.paused),
    },
    needsHumanLabel:
      text(answer.body?.settings?.needs_human_label, LABEL_MAX) ?? null,
  };
}

// Why a label can't be the hand-off label for this repository, or null
// (R52.4).
export function labelProblem(settings, label) {
  if (typeof label !== "string" || !label.trim()) return "Name the label.";
  const name = label.trim();
  if (name.length > LABEL_MAX)
    return `GitHub labels are at most ${LABEL_MAX} characters.`;
  if (lower(name).startsWith("crew:"))
    return 'A crew skips every issue that has a "crew:" label, so it would never pick these up.';
  if (
    Object.values(settings.managedLabels || {}).some(
      (entry) => lower(entry) === lower(name),
    )
  )
    return `${name} is a label Avoozl manages.`;
  if (
    Object.values(settings.crewLabels || {}).some(
      (entry) => lower(entry) === lower(name),
    )
  )
    return `${name} is a label Issue Radar writes itself.`;
  const rule = (settings.rules || []).find((entry) =>
    [...entry.labelsAll, ...entry.labelsAny].some(
      (trigger) => lower(trigger) === lower(name),
    ),
  );
  if (rule)
    return `${name} starts Avoozl's rule ${rule.id}, so sending would also start Avoozl.`;
  return null;
}

function itemsInput(input) {
  if (!Array.isArray(input.items) || !input.items.length)
    fail("Choose at least one issue.");
  if (input.items.length > HANDOFF_MAX)
    fail(`Send at most ${HANDOFF_MAX} issues at once.`);
  const seen = new Map();
  for (const item of input.items) {
    if (
      typeof item?.repository !== "string" ||
      !Number.isSafeInteger(item.number) ||
      item.number < 1
    )
      fail("Each item needs a repository and an issue number.");
    seen.set(`${lower(item.repository)}#${item.number}`, item);
  }
  const items = [...seen.values()],
    repository = items[0].repository;
  if (items.some((item) => lower(item.repository) !== lower(repository)))
    fail(
      "Send issues from one repository at a time: each crew works one repository.",
    );
  return { repository, items };
}

// `untriaged.handoff`: check, then (unless `preview`) label each issue and
// record a receipt. Person-only: the app backend lets only an owner
// session call it (R52.1).
export async function handOff(store, github, policy, tasks, input, { reader }) {
  if (!policy?.mode) fail("Send to Issue Radar needs a GitHub mode.");
  const { repository, items } = itemsInput(input),
    [id, settings] =
      Object.entries(policy.repositories || {}).find(
        ([name]) => lower(name) === lower(repository),
      ) || [];
  if (!settings) fail(`${repository} is not a registered repository.`, 404);
  // The crew, read again here so the label is Issue Radar's, not the page's.
  let crew = null,
    label = typeof input.label === "string" ? input.label.trim() : "";
  if (input.crew !== undefined && input.crew !== null) {
    const wanted = text(input.crew?.id);
    if (!wanted) fail("Choose a crew.");
    const read = await readCrews(reader, id);
    if (read.available) {
      const found = read.crews.find((entry) => entry.id === wanted);
      if (!found) fail(`Issue Radar has no crew ${wanted} on ${id}.`, 404);
      crew = { id: found.id, name: found.name, emptyScope: found.emptyScope };
      if (found.emptyScope) label = "";
      else if (!label) label = found.labels[0];
      else if (!found.labels.some((entry) => entry === label))
        fail(`${label} is not in ${found.name}'s scope.`);
    } else crew = { id: wanted, name: text(input.crew?.name) ?? wanted };
  }
  // An empty-scope crew takes every open issue: nothing to write (R52.3).
  if (!crew?.emptyScope) {
    const problem = labelProblem(settings, label);
    if (problem) fail(problem);
  }
  const view = untriagedView(
      policy,
      tasks,
      readCache(store),
      Date.now(),
      handoffReceipts(store),
    ),
    shown = new Map(
      view.items
        .filter((entry) => lower(entry.repository) === lower(id))
        .map((entry) => [entry.number, entry]),
    ),
    targets = items.map((item) => {
      const entry = shown.get(item.number);
      if (!entry)
        fail(
          `#${item.number} is not in ${id}'s Untriaged list. Check now, then try again.`,
          409,
        );
      if (entry.kind !== "issue")
        fail(`#${item.number} is a pull request; crews work issues.`);
      return entry;
    }),
    preview = {
      repository: id,
      label: crew?.emptyScope ? null : label,
      crew,
      items: targets.map((entry) => ({
        number: entry.number,
        title: entry.title,
        url: entry.url,
      })),
      warnings: crew?.emptyScope
        ? [
            `${crew.name} has an empty scope, so it takes every open issue in ${id}, labeled or not. Avoozl writes no label; these issues move to With Issue Radar.`,
          ]
        : [],
    };
  if (input.preview === true) return { ...preview, written: false };
  if (input.confirm !== true) fail("Confirm the label and issues first.");
  // Who counts (R10): the person's own GitHub login, like a trigger label.
  const login = (await github.currentUser())?.login;
  if (!login) fail("Avoozl could not read your GitHub login.", 502);
  const permission = settings.minimumPermission
      ? (await github.permission(id, login))?.permission || "none"
      : null,
    check = actorAllowed(settings, login, permission);
  if (!check.allowed)
    fail(
      `${id}'s policy does not let ${login} hand off work: ${check.reason}`,
      403,
    );
  if (
    preview.label &&
    !allowWrite(store, {
      boundary: "github",
      repository: id,
      target: `label:${id}:${preview.label}`,
      text: preview.label,
    })
  )
    fail(
      "Content rules blocked this label; nothing was written. The decision names the rule.",
      422,
    );
  const results = [];
  for (const entry of targets) {
    try {
      if (preview.label)
        await github.addLabels(id, entry.number, [preview.label]);
      store.put("receipts", {
        id: handoffId(id, entry.number),
        kind: HANDOFF_KIND,
        repository: id,
        number: entry.number,
        title: entry.title,
        label: preview.label,
        crew: crew ? { id: crew.id, name: crew.name } : null,
        actor: login,
        at: new Date().toISOString(),
      });
      results.push({ number: entry.number, ok: true });
    } catch (error) {
      results.push({ number: entry.number, ok: false, error: error.message });
    }
  }
  return {
    ...preview,
    written: true,
    actor: login,
    results,
    sent: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
  };
}
