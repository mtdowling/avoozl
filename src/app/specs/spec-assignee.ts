// The assignee rule (workflow v1 rule 8.3): this runner runs a spec only when
// its spec issue, and the spec issue of every parent spec that links it, is
// assigned to this runner's own login and to no one else. Each pass reads the
// spec issues once and caches each spec's result; the ready rule reads the
// cache. A spec with no spec issue is not shared, so it runs here.
import { personOf } from "../github/github.ts";
import { specChain } from "./integration-base.ts";
import { storedLinks } from "./order.ts";
import type { Store } from "../store/store.ts";

// A spec issue, as far as the rule reads it.
type Issue = { assignees?: (string | { login?: string } | null)[] } | null;
// One spec's result.
type Assigned = { pass: true } | { pass: false; reason: string };
// The GitHub reads the rule makes.
interface IssueReader {
  issue?(repository: string, number: number): Promise<Issue>;
  [key: string]: unknown;
}
type Plan = { id: string; spec?: string; state?: string; deletedAt?: string };
type Receipt = { repository: string; number: number };

const META = "assignee.specs";
const lower = (value: unknown) => String(value ?? "").toLowerCase();
const logins = (issue: Issue) =>
  (issue?.assignees ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.login))
    .filter((login): login is string => Boolean(login));

// Whether one spec issue names `login` alone: {pass} or {pass: false, reason}.
export function assignedTo(issue: Issue, login: string): Assigned {
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
export async function readSpecAssignees(
  store: Store,
  github: IssueReader | null | undefined,
) {
  const read = github?.issue?.bind(github);
  if (!github || !read) return [];
  const previous = store.getMeta<Record<string, Assigned>>(META) ?? {},
    results: Record<string, Assigned> = {},
    errors: { repository: string; error: string }[] = [],
    shared = store
      .list<Plan>("plans")
      .filter(
        (plan) =>
          plan.state === "approved" &&
          plan.spec &&
          !plan.deletedAt &&
          store.get<Receipt>("receipts", `github-parent:plan:${plan.id}`)
            ?.number,
      );
  // No spec issue to read: no GitHub call at all.
  if (!shared.length) {
    if (Object.keys(previous).length) store.setMeta(META, {});
    return [];
  }
  let login: string | null = null;
  try {
    login = await personOf(github);
  } catch (error) {
    return [{ repository: "GitHub", error: (error as Error).message }];
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
    const spec = String(plan.spec),
      receipt = store.get<Receipt>(
        "receipts",
        `github-parent:plan:${plan.id}`,
      ) as Receipt;
    try {
      results[spec] = assignedTo(
        await read(receipt.repository, receipt.number),
        login,
      );
    } catch (error) {
      if (previous[spec]) results[spec] = previous[spec];
      errors.push({
        repository: receipt.repository,
        error: (error as Error).message,
      });
    }
  }
  // Written only when a result changed, so a pass that reads writes nothing.
  if (JSON.stringify(results) !== JSON.stringify(previous))
    store.setMeta(META, results);
  return errors;
}

// Plan ID -> why the assignee rule holds it, for each spec whose own spec
// issue, or a parent spec's, is not assigned to this runner alone.
export function assigneeHolds(store: Store) {
  const results = store.getMeta<Record<string, Assigned>>(META) ?? {},
    holds = new Map<string, string>();
  if (!Object.keys(results).length) return holds;
  const links = storedLinks(store);
  for (const plan of store.list<Plan>("plans")) {
    if (!plan.spec || plan.deletedAt) continue;
    const failed = (specChain(plan.spec, links) as string[]).find(
      (name) => results[name] && !results[name].pass,
    );
    const result = failed ? results[failed] : undefined;
    if (failed && result && !result.pass)
      holds.set(
        plan.id,
        `assignee: ${failed === plan.spec ? "" : `parent spec ${failed}: `}${result.reason}`,
      );
  }
  return holds;
}
