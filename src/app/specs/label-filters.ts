// Label filters (workflow v1 rule 9.1): a repository's
// `labels.require` and `labels.exclude`. A spec runs on this runner only when
// its spec issue carries every `require` label, each added by a writer, and
// no `exclude` label. The stop label (rule 10, `labels.stop`, default
// `avoozl:stopped`) stops a spec while a writer's stop label is on its spec
// issue or on a parent spec's. The spec issues are read once per pass and the
// result is cached per spec; the ready rule reads the cache. A task already
// claimed keeps running whatever its filter labels say later: the filters
// only hold new claims. A stop also holds a claimed task's push and landing
// (rule 10.2).
import { PERMISSIONS } from "../github/github-policy.ts";
import { linkedReader } from "./order.ts";
import { specTasks } from "./spec-tasks.ts";
import type { Store } from "../store/store.ts";

// A repository's label lists and stop label.
interface Filters {
  require: string[];
  exclude: string[];
  stop: string;
}
export type Label = string | { name?: string } | null;
// One issue event GitHub lists, as far as the rules read it.
export interface IssueEvent {
  event?: string;
  label?: { name?: string };
  actor?: { login?: string };
}
type Permission = (login: string | undefined) => Promise<unknown>;
// One spec's cached result.
type Result = { pass: boolean; reason?: string; stopped?: boolean };
// The spec links a stop follows.
interface Linked {
  parents(name: string): { name: string }[];
}
// The GitHub reads the filters make.
export interface LabelReader {
  issue(
    repository: string,
    number: number,
  ): Promise<{ labels?: Label[] } | null>;
  issueEvents?(repository: string, number: number): Promise<IssueEvent[]>;
  permission(
    repository: string,
    login: string | undefined,
  ): Promise<{ permission?: string } | null>;
}
type Repository = {
  id: string;
  github?: string | null;
  labels?: { require?: string[]; exclude?: string[]; stop?: string };
};
type Plan = {
  id: string;
  spec?: string;
  state?: string;
  deletedAt?: string;
  files?: Record<string, string>;
};
type Receipt = { repository: string; number: number };

const META = "labels.specs";
const WRITERS = new Set<unknown>(
  PERMISSIONS.slice(PERMISSIONS.indexOf("write")),
);
const lower = (value: unknown) => String(value ?? "").toLowerCase();

const STOP_LABEL = "avoozl:stopped";

// A repository's two lists, empty when it sets none, and its stop label.
export const labelFilters = (
  repository: Repository | null | undefined,
): Filters => ({
  require: repository?.labels?.require ?? [],
  exclude: repository?.labels?.exclude ?? [],
  stop: repository?.labels?.stop ?? STOP_LABEL,
});
const filtering = (filters: Filters) =>
  filters.require.length > 0 || filters.exclude.length > 0;

// Whether one issue passes `filters`: its labels, its issue `events`
// (oldest first), and `permission(login)` the actor's role. Returns {pass}
// or {pass: false, reason}.
export async function issuePasses(
  issue: { labels?: Label[] } | null | undefined,
  events: IssueEvent[] | null | undefined,
  filters: Filters,
  permission: Permission,
): Promise<Result> {
  const names = new Set(
    (issue?.labels ?? []).map((label) =>
      lower(typeof label === "string" ? label : label?.name),
    ),
  );
  const excluded = filters.exclude.find((name) => names.has(lower(name)));
  if (excluded) return { pass: false, reason: `it carries ${excluded}` };
  for (const name of filters.require) {
    if (!names.has(lower(name)))
      return { pass: false, reason: `it lacks ${name}` };
    // The newest time the label went on says who added it.
    const added = [...(events ?? [])]
      .reverse()
      .find(
        (event) =>
          event?.event === "labeled" &&
          lower(event.label?.name) === lower(name),
      );
    const login = added?.actor?.login;
    if (!login || !WRITERS.has(await permission(login)))
      return { pass: false, reason: `${name} was not added by a writer` };
  }
  return { pass: true };
}

// Whether a spec issue stops its spec (rule 10.1): a writer added the stop
// label, and no writer has removed it since. A removal by anyone else does
// not clear the stop.
// shortcut: a writer stands in for an approver; read the approvers when a
// repository names approvers apart from writers.
async function issueStopped(
  events: IssueEvent[] | null | undefined,
  stop: string,
  permission: Permission,
) {
  let stopped = false;
  for (const event of events ?? []) {
    if (lower(event?.label?.name) !== lower(stop)) continue;
    const writer = WRITERS.has(await permission(event?.actor?.login));
    if (event.event === "labeled" && writer) stopped = true;
    else if (event.event === "unlabeled" && writer) stopped = false;
  }
  return stopped;
}

// The specs a set of stopped specs stops (rule 10.1): each one, and every
// spec a stopped spec links, through any depth.
export function stoppedSpecs(
  names: Iterable<string>,
  stopped: Set<string>,
  linked: Linked,
) {
  const memo = new Map<string, boolean>(),
    walk = (name: string, seen = new Set<string>()): boolean => {
      const known = memo.get(name);
      if (known !== undefined) return known;
      if (stopped.has(name)) return true;
      if (seen.has(name)) return false;
      seen.add(name);
      const out = linked
        .parents(name)
        .some((parent) => walk(parent.name, seen));
      memo.set(name, out);
      return out;
    };
  return new Set([...names].filter((name) => walk(name)));
}

// Read the spec issue of every approved spec with one, and cache whether its
// filters pass and whether it carries a writer's stop label. One permission
// read per actor per pass; the events are read only when a filter, the stop
// label or a stop to clear needs them. Returns the read errors; a spec whose
// read fails keeps its last result.
export async function readLabelFilters(
  store: Store,
  github: LabelReader | null | undefined,
) {
  const issueEvents = github?.issueEvents?.bind(github);
  if (!github || !issueEvents) return [];
  const repositories = new Map(
      store
        .list<Repository>("repositories")
        .filter((r) => r.github)
        .map((r) => [lower(r.github), r]),
    ),
    roles = new Map<string, unknown>(),
    results: Record<string, Result> = {
      ...(store.getMeta<Record<string, Result>>(META) ?? {}),
    },
    errors: { repository: string; error: string }[] = [];
  for (const plan of store.list<Plan>("plans")) {
    if (plan.state !== "approved" || !plan.spec || plan.deletedAt) continue;
    const receipt = store.get<Receipt>(
        "receipts",
        `github-parent:plan:${plan.id}`,
      ),
      repository = receipt && repositories.get(lower(receipt.repository)),
      filters = labelFilters(repository);
    if (!receipt || !repository?.github) {
      delete results[plan.id];
      continue;
    }
    const github_ = repository.github;
    try {
      const issue = await github.issue(github_, receipt.number),
        stopOn = (issue?.labels ?? []).some(
          (label) =>
            lower(typeof label === "string" ? label : label?.name) ===
            lower(filters.stop),
        ),
        events =
          filtering(filters) || stopOn || results[plan.id]?.stopped
            ? await issueEvents(github_, receipt.number)
            : [],
        permission = async (login: string | undefined) => {
          const key = `${lower(github_)}|${lower(login)}`;
          if (!roles.has(key))
            roles.set(
              key,
              (await github.permission(github_, login))?.permission,
            );
          return roles.get(key);
        };
      results[plan.id] = {
        ...(filtering(filters)
          ? await issuePasses(issue, events, filters, permission)
          : { pass: true }),
        stopped: await issueStopped(events, filters.stop, permission),
      };
    } catch (error) {
      errors.push({ repository: github_, error: (error as Error).message });
    }
  }
  // Written only when a result changed, so a pass that reads writes nothing.
  if (JSON.stringify(results) !== JSON.stringify(store.getMeta(META) ?? {}))
    store.setMeta(META, results);
  return errors;
}

// The spec IDs a stop holds (rule 10): each spec whose spec issue carries a
// writer's stop label, by the cache, and every spec one of them links. A
// task of one is not ready, and nothing of it is pushed or landed (10.2).
export function stoppedSpecIds(store: Store) {
  const direct = new Set(
    Object.entries(store.getMeta<Record<string, Result>>(META) ?? {})
      .filter(([, result]) => result.stopped)
      .map(([id]) => id),
  );
  if (!direct.size) return direct;
  const plans = store
      .list<Plan>("plans")
      .filter((plan) => plan.spec && !plan.deletedAt && plan.files),
    linked = linkedReader(
      plans.map((plan) => ({
        name: String(plan.spec),
        text: specTasks(plan.files ?? {})?.text ?? "",
      })),
    ),
    ids = new Map(plans.map((plan) => [String(plan.spec), plan.id])),
    names = new Set(
      plans
        .filter((plan) => direct.has(plan.id))
        .map((plan) => String(plan.spec)),
    );
  for (const name of stoppedSpecs(ids.keys(), names, linked))
    direct.add(ids.get(name) as string);
  return direct;
}

// Spec ID -> why its spec issue holds it, for each spec the filters hold. A
// spec in a repository that filters, with no spec issue, is held too.
export function labelHolds(store: Store) {
  const results = store.getMeta<Record<string, Result>>(META) ?? {},
    holds = new Map(
      Object.entries(results)
        .filter(([, result]) => !result.pass)
        .map(([id, result]) => [id, `label filter: ${result.reason}`]),
    );
  // A stopped spec, and every spec it links (rule 10).
  for (const id of stoppedSpecIds(store))
    holds.set(
      id,
      "stopped: a writer's stop label is on its spec issue or a parent's",
    );
  const filtered = new Set(
    store
      .list<Repository>("repositories")
      .filter((r) => filtering(labelFilters(r)))
      .map((r) => r.id),
  );
  if (!filtered.size) return holds;
  for (const task of store.read().tasks) {
    if (!task.planId || holds.has(task.planId)) continue;
    const repository = task.repository ?? task.repositoryId;
    if (
      typeof repository === "string" &&
      filtered.has(repository) &&
      !store.get("receipts", `github-parent:plan:${task.planId}`)
    )
      holds.set(task.planId, "label filter: the spec has no spec issue");
  }
  return holds;
}
