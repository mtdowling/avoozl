// The assignee rule (workflow v1 rule 8.3): this runner runs a spec only when
// its spec issue, and the spec issue of every parent spec that links it, is
// assigned to this runner's own login and to no one else. Each pass reads the
// spec issues once and caches each spec's result; the ready rule reads the
// cache. A spec with no spec issue is not shared, so it runs here.
import { personOf } from "../github/github.mjs";
import { specChain } from "./integration-base.mjs";
import { storedLinks } from "./order.mjs";

const META = "assignee.specs";
const lower = (value) => String(value ?? "").toLowerCase();
const logins = (issue) =>
  (issue?.assignees ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.login))
    .filter(Boolean);

// Whether one spec issue names `login` alone: {pass} or {pass: false, reason}.
export function assignedTo(issue, login) {
  const names = logins(issue);
  if (names.length === 1 && lower(names[0]) === lower(login))
    return { pass: true };
  return {
    pass: false,
    reason: names.length
      ? `its spec issue is assigned to ${names.join(", ")}`
      : "its spec issue has no assignee",
  };
}

// Read the spec issue of every approved spec that has one, and cache each
// spec's result by spec name. Returns the read errors; a spec whose read
// fails keeps its last result.
export async function readSpecAssignees(store, github) {
  if (!github?.issue) return [];
  const previous = store.getMeta(META) ?? {},
    results = {},
    errors = [],
    shared = store
      .list("plans")
      .filter(
        (plan) =>
          plan.state === "approved" &&
          plan.spec &&
          !plan.deletedAt &&
          store.get("receipts", `github-parent:plan:${plan.id}`)?.number,
      );
  // No spec issue to read: no GitHub call at all.
  if (!shared.length) {
    if (Object.keys(previous).length) store.setMeta(META, {});
    return [];
  }
  let login = null;
  try {
    login = await personOf(github);
  } catch (error) {
    return [{ repository: "GitHub", error: error.message }];
  }
  if (!login)
    return [
      {
        repository: "GitHub",
        error:
          "The GitHub sign-in names no person, so no spec issue's assignee can match it.",
      },
    ];
  for (const plan of shared) {
    const receipt = store.get("receipts", `github-parent:plan:${plan.id}`);
    try {
      results[plan.spec] = assignedTo(
        await github.issue(receipt.repository, receipt.number),
        login,
      );
    } catch (error) {
      if (previous[plan.spec]) results[plan.spec] = previous[plan.spec];
      errors.push({ repository: receipt.repository, error: error.message });
    }
  }
  // Written only when a result changed, so a pass that reads writes nothing.
  if (JSON.stringify(results) !== JSON.stringify(previous))
    store.setMeta(META, results);
  return errors;
}

// Plan ID -> why the assignee rule holds it, for each spec whose own spec
// issue, or a parent spec's, is not assigned to this runner alone.
export function assigneeHolds(store) {
  const results = store.getMeta(META) ?? {},
    holds = new Map();
  if (!Object.keys(results).length) return holds;
  const links = storedLinks(store);
  for (const plan of store.list("plans")) {
    if (!plan.spec || plan.deletedAt) continue;
    const failed = specChain(plan.spec, links).find(
      (name) => results[name] && !results[name].pass,
    );
    if (failed)
      holds.set(
        plan.id,
        `assignee: ${failed === plan.spec ? "" : `parent spec ${failed}: `}${results[failed].reason}`,
      );
  }
  return holds;
}
