// The merge path check (RC5.1, design D7): can a pull request from an Issue
// Radar crew merge by itself on this repository? Three items, each ok or not:
// the repository allows auto-merge; the default branch has a rule that
// requires the named CI check; who merges is set (`landing.autoMerge`).
// Read only.
import { ruleBranch, seenCheckNames } from "./github-branch-rules.mjs";
import { parseRepository } from "./github.mjs";
import { MERGE_METHOD_SETTING, mergeMethod } from "./github-policy.mjs";

// The ship mode in force for a repository (R80.1): its `landing.autoMerge`,
// else the built-in `auto-merge`.
export const effectiveShip = (settings) => shipOf(settings) ?? "auto-merge";
const shipOf = (settings) => {
  const on = settings?.landing?.autoMerge;
  return typeof on === "boolean" ? (on ? "auto-merge" : "manual") : null;
};

const LABELS = {
  "auto-merge": "Auto-merge allowed",
  "required-check": "Default branch requires the CI check",
  ship: "Ship mode set",
  "merge-method": "Merge method allowed",
};

// Does the repository allow `method`? A field GitHub did not return (a
// reader without admin rights) counts as allowed; only `false` refuses.
export function methodAllowed(remote, method) {
  return remote?.[MERGE_METHOD_SETTING[method].key] !== false;
}
// The words that name the GitHub setting to change.
export const methodFix = (repository, method) =>
  `Turn on "${MERGE_METHOD_SETTING[method].name}" in ${repository}'s settings, or set landing.method to ${method === "squash" ? "merge" : "squash"}.`;

// { repository, branch, ship, ready, missing: [id], items: [{id, label, ok,
// detail}], error }. A GitHub read that fails leaves its items not ok and
// puts the reason in `error`; nothing is guessed.
export async function mergePath(
  github,
  repository,
  settings,
  { branch: asked = null } = {},
) {
  const named = settings?.requiredChecks || [],
    value = shipOf(settings);
  const method = mergeMethod(settings);
  let allowed = false,
    methodOk = false,
    required = null,
    branch = null,
    error = null;
  try {
    branch = asked ?? (await ruleBranch(github, repository, settings));
    const [remote, names] = await Promise.all([
      github.repository(parseRepository(repository)),
      seenCheckNames(github, repository, branch),
    ]);
    allowed = remote?.allow_auto_merge === true;
    methodOk = methodAllowed(remote, method);
    required = names.required;
  } catch (reason) {
    error = `GitHub could not be read: ${reason.message}`;
  }
  const absent = named.filter((name) => !required?.includes(name)),
    detail = {
      "auto-merge": allowed
        ? "The repository allows auto-merge."
        : error
          ? error
          : `Turn on "Allow auto-merge" in ${repository}'s settings.`,
      "required-check": !named.length
        ? `Name the CI check in ${repository}'s requiredChecks setting.`
        : error
          ? error
          : absent.length
            ? `${branch} does not require ${absent.join(", ")}. Add it to a branch rule.`
            : `${branch} requires ${named.join(", ")}.`,
      "merge-method": methodOk
        ? `The repository allows ${method} merges.`
        : error
          ? error
          : methodFix(repository, method),
      ship: value
        ? `Auto-merge is ${value === "manual" ? "off" : "on"}.`
        : `Set Auto-merge on ${repository}'s Landing tab (landing.autoMerge).`,
    },
    ok = {
      "auto-merge": allowed,
      "required-check": !error && named.length > 0 && absent.length === 0,
      ship: Boolean(value),
      "merge-method": !error && methodOk,
    },
    items = Object.keys(LABELS).map((id) => ({
      id,
      label: LABELS[id],
      ok: ok[id],
      detail: detail[id],
    }));
  return {
    repository,
    branch,
    ship: effectiveShip(settings),
    method,
    ready: items.every((item) => item.ok),
    missing: items.filter((item) => !item.ok).map((item) => item.id),
    items,
    error,
  };
}
