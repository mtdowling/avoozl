// Label filters (workflow v1 rule 9.1, simplify §D5): a repository's
// `labels.require` and `labels.exclude`. A spec runs on this runner only when
// its spec issue carries every `require` label, each added by a writer, and
// no `exclude` label. The spec issues are read once per pass and the result
// is cached per spec; the ready rule reads the cache. A task already claimed
// keeps running whatever its labels say later: the filter only holds new
// claims.
import { PERMISSIONS } from "../github/github-policy.mjs";

const META = "labels.specs";
const WRITERS = new Set(PERMISSIONS.slice(PERMISSIONS.indexOf("write")));
const lower = (value) => String(value ?? "").toLowerCase();

// A repository's two lists, empty when it sets none.
export const labelFilters = (repository) => ({
  require: repository?.labels?.require ?? [],
  exclude: repository?.labels?.exclude ?? [],
});
const filtering = (filters) =>
  filters.require.length > 0 || filters.exclude.length > 0;

// Whether one issue passes `filters`: its labels, its issue `events`
// (oldest first), and `permission(login)` the actor's role. Returns {pass}
// or {pass: false, reason}.
export async function issuePasses(issue, events, filters, permission) {
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

// Read the spec issue of every approved spec in a repository that filters,
// and cache whether each passes. One permission read per actor per pass.
// Returns the read errors; a spec whose read fails keeps its last result.
export async function readLabelFilters(store, github) {
  if (!github?.issueEvents) return [];
  const repositories = new Map(
      store
        .list("repositories")
        .filter((r) => r.github)
        .map((r) => [lower(r.github), r]),
    ),
    roles = new Map(),
    results = { ...(store.getMeta(META) ?? {}) },
    errors = [];
  for (const plan of store.list("plans")) {
    if (plan.state !== "approved" || !plan.spec || plan.deletedAt) continue;
    const receipt = store.get("receipts", `github-parent:plan:${plan.id}`),
      repository = receipt && repositories.get(lower(receipt.repository)),
      filters = labelFilters(repository);
    if (!repository || !filtering(filters)) {
      delete results[plan.id];
      continue;
    }
    try {
      const [issue, events] = await Promise.all([
          github.issue(repository.github, receipt.number),
          github.issueEvents(repository.github, receipt.number),
        ]),
        permission = async (login) => {
          const key = `${lower(repository.github)}|${lower(login)}`;
          if (!roles.has(key))
            roles.set(
              key,
              (await github.permission(repository.github, login))?.permission,
            );
          return roles.get(key);
        };
      results[plan.id] = await issuePasses(issue, events, filters, permission);
    } catch (error) {
      errors.push({ repository: repository.github, error: error.message });
    }
  }
  // Written only when a result changed, so a pass that reads writes nothing.
  if (JSON.stringify(results) !== JSON.stringify(store.getMeta(META) ?? {}))
    store.setMeta(META, results);
  return errors;
}

// Spec ID -> why its spec issue holds it, for each spec the filters hold. A
// spec in a repository that filters, with no spec issue, is held too.
export function labelHolds(store) {
  const holds = new Map(
    Object.entries(store.getMeta(META) ?? {})
      .filter(([, result]) => !result.pass)
      .map(([id, result]) => [id, `label filter: ${result.reason}`]),
  );
  const filtered = new Set(
    store
      .list("repositories")
      .filter((r) => filtering(labelFilters(r)))
      .map((r) => r.id),
  );
  if (!filtered.size) return holds;
  for (const task of store.read().tasks) {
    if (!task.planId || holds.has(task.planId)) continue;
    const repository = task.repository ?? task.repositoryId;
    if (
      filtered.has(repository) &&
      !store.get("receipts", `github-parent:plan:${task.planId}`)
    )
      holds.set(task.planId, "label filter: the spec has no spec issue");
  }
  return holds;
}
