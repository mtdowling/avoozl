// Repository roles (design §4.34, Requirement 105). Each repository entry may
// name a `role`; the workspace's GitHub mode follows from the roles. This
// module has no imports so the config loader and the policy can both use it.
// `github.mode` and `github.planningRepository` stay readable: a file with no
// `role` is read through them, and a file with roles gets both keys derived.

export const ROLES = Object.freeze(["local", "code", "planning", "both"]);

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const same = (left, right) =>
  typeof left === "string" &&
  typeof right === "string" &&
  left.toLocaleLowerCase() === right.toLocaleLowerCase();
const list = (ids) => ids.join(", ");

// The roles of every repository entry and the mode and planning repository
// they give. `fromRoles` is false for a file with no `role` key: roles then
// come from the stored mode and nothing is derived. Throws Error with the
// plain line a person needs when the roles do not make one mode.
export function resolveRoles(github) {
  const entries = Object.entries(
      record(github?.repositories) ? github.repositories : {},
    ),
    named = github?.mode ?? null,
    storedMode = named === "local" ? null : named,
    stored = github?.planningRepository || null,
    fromRoles = entries.some(([, entry]) => record(entry) && entry.role !== undefined);
  const fallback = (id) =>
    storedMode === "plans-repo"
      ? same(id, stored)
        ? "planning"
        : "code"
      : storedMode === "single-repo"
        ? "both"
        : "local";
  const roles = {};
  for (const [id, entry] of entries) {
    const role = record(entry) && entry.role !== undefined ? entry.role : fallback(id);
    if (!ROLES.includes(role))
      throw Error(
        `github.repositories.${id}.role must be ${ROLES.slice(0, -1).join(", ")} or ${ROLES.at(-1)}.`,
      );
    roles[id] = role;
  }
  if (!fromRoles)
    return { roles, fromRoles, mode: storedMode, planningRepository: stored };
  const ids = (role) => entries.map(([id]) => id).filter((id) => roles[id] === role),
    planning = ids("planning"),
    code = ids("code"),
    both = ids("both"),
    local = ids("local");
  if (planning.length > 1)
    throw Error(
      `Only one repository can be the planning repository. Make all but one of ${list(planning)} code or both.`,
    );
  if (!planning.length && !code.length && !both.length)
    return { roles, fromRoles, mode: null, planningRepository: stored };
  if (local.length)
    throw Error(
      `${list(local)} is local while ${list([...planning, ...code, ...both])} is on GitHub. Give every repository a GitHub role, or make them all local.`,
    );
  if (planning.length && both.length)
    throw Error(
      `${planning[0]} is the planning repository, so ${list(both)} cannot also hold its own issues. Make ${list(both)} code, or make ${planning[0]} both.`,
    );
  if (both.length && code.length)
    throw Error(
      `${list(code)} keeps its issues in a planning repository, but ${list(both)} keeps its own. Make them all code with one planning repository, or all both.`,
    );
  if (both.length)
    return { roles, fromRoles, mode: "single-repo", planningRepository: stored };
  const planningRepository = planning[0] ?? stored;
  if (
    !planningRepository ||
    (!planning.length && entries.some(([id]) => same(id, planningRepository)))
  )
    throw Error(
      `${list(code)} keeps its issues in a planning repository. Give one repository the planning role.`,
    );
  return { roles, fromRoles, mode: "plans-repo", planningRepository };
}

// The `github` block with `mode` and `planningRepository` derived from its
// roles. A block with no roles, or with roles that make no one mode, comes
// back as it is: the policy check names the problem.
export function deriveGitHubKeys(github) {
  if (!record(github)) return github;
  let result;
  try {
    result = resolveRoles(github);
  } catch {
    return github;
  }
  if (!result.fromRoles) return github;
  const next = { ...github };
  if (result.mode) next.mode = result.mode;
  else if (github.mode !== undefined && github.mode !== null) next.mode = "local";
  if (result.planningRepository) next.planningRepository = result.planningRepository;
  return next;
}

// For the Settings read: the same block with every entry's role filled in,
// so the form shows roles for a file that has none yet. Nothing is written.
export function withRoles(github) {
  if (!record(github) || !record(github.repositories)) return github;
  let result;
  try {
    result = resolveRoles(github);
  } catch {
    return github;
  }
  const next = { ...deriveGitHubKeys(github) };
  next.repositories = Object.fromEntries(
    Object.entries(github.repositories).map(([id, entry]) => [
      id,
      record(entry) ? { ...entry, role: result.roles[id] } : entry,
    ]),
  );
  return next;
}

// One line when the file's own mode disagrees with the mode its roles make.
export function rolesNote(github) {
  if (!record(github)) return null;
  let result;
  try {
    result = resolveRoles(github);
  } catch {
    return null;
  }
  if (!result.fromRoles) return null;
  const was = github.mode === undefined || github.mode === null ? "local" : github.mode,
    now = result.mode ?? "local";
  if (was === now) return null;
  return `The file says ${was}; the roles say ${now}. Saving writes ${now}.`;
}
