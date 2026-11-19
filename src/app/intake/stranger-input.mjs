// Stranger input (vm-harness D7, VM6, VM8). A task or session has stranger
// input when its text, snapshot or code came from someone without write,
// maintain or admin permission on the repository: a bot, or anyone whose
// permission could not be read, counts as a stranger. On a public
// repository such work runs only in a box, under `isolation.strangers`.
//
// `strangerInput` on a task or a triage run is {reason, source} or absent.
// It is set when the task is made and copied to every task made from it;
// a spec or epic a person approved never has it (R114).
import { itemRows } from "./intake.mjs";
import { rowFor } from "../agents/role-table.mjs";
import {
  STRANGER_CHECKS,
  STRANGER_ON_HOST,
  isolationOf,
  pickRuntime,
} from "../workspace/check-isolation.mjs";
import { originRepositorySync } from "../git/git.mjs";

export const COLLABORATOR = new Set(["write", "maintain", "admin"]);
export const isCollaborator = (permission) => COLLABORATOR.has(permission);

const lower = (value) => String(value ?? "").toLocaleLowerCase();

// Stranger input from a triage item's author and comment authors: the
// first stranger's reason, or null. `permissionOf(login)` resolves to the
// login's permission, or null when it could not be read.
export async function strangerFromItem(detail, permissionOf, source) {
  const people = [
    ["author", detail?.author],
    ...(detail?.timeline ?? [])
      .filter((entry) => entry?.by && /Comment|Review/.test(entry.kind ?? ""))
      .map((entry) => ["comment author", entry.by]),
  ];
  const seen = new Set();
  for (const [what, login] of people) {
    if (seen.has(lower(login))) continue;
    seen.add(lower(login));
    const permission = login ? await permissionOf(login) : null;
    if (!isCollaborator(permission))
      return {
        reason: `${what} ${login ?? "unknown"} is not a collaborator${permission ? ` (${permission})` : " (permission unread)"}`,
        source,
      };
  }
  return null;
}

// The GitHub `owner/name` of a registered repository, or null for one with
// no GitHub remote, which has no strangers.
export function githubNameOf(repository) {
  if (repository?.github) return repository.github;
  try {
    return repository?.root ? originRepositorySync(repository.root) : null;
  } catch {
    return null;
  }
}

// Whether `name` (owner/name) is public: the visibility the open-items
// read last saw. A repository never read, or read without the field,
// counts as public (VM6.1).
export function repositoryPublic(store, name) {
  for (const row of itemRows(store)) {
    const search = row.search;
    if (
      search &&
      typeof search.private === "boolean" &&
      lower(String(row.itemId ?? "").split("#")[0]) === lower(name)
    )
      return !search.private;
  }
  return true;
}

// The stranger rule for one role of one subject (a task or a triage run),
// or null when it does not apply: {mode, reason}. `role` is a role-table
// setting or "checks" (VM6.11).
export function strangerRule(store, repository, subject, role) {
  const input = subject?.strangerInput;
  if (!input) return null;
  const name = githubNameOf(repository);
  if (!name || !repositoryPublic(store, name)) return null;
  const setting = isolationOf(repository),
    covered = setting.strangerRoles ?? null;
  const key = role === STRANGER_CHECKS ? role : (rowFor(role)?.setting ?? role);
  if (covered && !covered.includes(key)) return null;
  return { mode: setting.strangers ?? "container", reason: input.reason };
}

// How a `process` session of `role` on `subject` runs (D7): {kind:
// "contained", stranger?}, {kind: "sandbox", note?}, or {wait} with the
// reason it cannot start. `boxReady(repository)` says why no box can run
// here, or null (the runtime, the image and a harness with box).
export function sessionIsolation(
  store,
  repository,
  subject,
  role,
  { boxProblem = defaultBoxProblem } = {},
) {
  const rule = strangerRule(store, repository, subject, role),
    setting = isolationOf(repository ?? {});
  if (rule?.mode === "hold")
    return {
      wait: `stranger input waits: isolation.strangers is hold (${rule.reason})`,
      stranger: rule,
    };
  if (rule?.mode === "host")
    return { kind: "sandbox", note: STRANGER_ON_HOST, stranger: rule };
  if (rule) {
    const problem = boxProblem(repository);
    if (problem)
      return { wait: `stranger input waits: ${problem}`, stranger: rule };
    return { kind: "contained", stranger: rule };
  }
  if (setting.worker === "container") return { kind: "contained" };
  return { kind: "sandbox" };
}

// Why this machine cannot run a box for the repository, or null.
export function defaultBoxProblem(repository) {
  const setting = isolationOf(repository ?? {});
  if (!setting.image) return "isolation.image is not set";
  const picked = pickRuntime({ named: setting.runtime, purpose: "box" });
  return picked.refused ?? null;
}

// The task's stranger input, copied to a task made from it (VM6.1).
export const inheritStranger = (parent) =>
  parent?.strangerInput ? { strangerInput: { ...parent.strangerInput } } : {};

// A repository record whose checks follow the stranger rule of `tasks`
// (VM6.4): every check path (checkOptions, prepareChecks, the container
// probe) reads `strangerChecks` from it. The strictest rule of the tasks
// wins: container, then hold, then host.
export function withStrangerChecks(store, repository, tasks) {
  if (!repository) return repository;
  const rules = [tasks]
    .flat()
    .filter(Boolean)
    .map((task) => strangerRule(store, repository, task, STRANGER_CHECKS))
    .filter(Boolean);
  if (!rules.length) return repository;
  const order = ["container", "hold", "host"];
  rules.sort((a, b) => order.indexOf(a.mode) - order.indexOf(b.mode));
  return { ...repository, strangerChecks: rules[0] };
}
