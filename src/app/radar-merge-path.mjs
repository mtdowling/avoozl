// The merge path check (RC5.1, design D7): can a pull request from an Issue
// Radar crew merge by itself on this repository? Three items, each ok or not:
// the repository allows auto-merge; the default branch has a rule that
// requires the named CI check; `delivery.ship` is set. Read only.
import { ruleBranch, seenCheckNames } from "./github-branch-rules.mjs";
import { parseRepository } from "./github.mjs";
import { fail } from "./store.mjs";

// The ship mode in force for a repository (R80.1): the repository's own value,
// then the workspace's, then the built-in `auto-merge`.
export const effectiveShip = (delivery, repository) =>
  delivery?.repositories?.[repository]?.ship ?? delivery?.ship ?? "auto-merge";

const LABELS = {
  "auto-merge": "Auto-merge allowed",
  "required-check": "Default branch requires the CI check",
  ship: "Ship mode set",
};

// { repository, branch, ship, ready, missing: [id], items: [{id, label, ok,
// detail}], error }. A GitHub read that fails leaves its items not ok and
// puts the reason in `error`; nothing is guessed.
export async function mergePath(github, repository, settings, { delivery }) {
  const named = settings?.requiredChecks || [],
    value =
      delivery?.repositories?.[repository]?.ship ?? delivery?.ship ?? null;
  let allowed = false,
    required = null,
    branch = null,
    error = null;
  try {
    branch = await ruleBranch(github, repository, settings);
    const [remote, names] = await Promise.all([
      github.repository(parseRepository(repository)),
      seenCheckNames(github, repository, branch),
    ]);
    allowed = remote?.allow_auto_merge === true;
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
      ship: value
        ? `delivery.ship is ${value}.`
        : "Set delivery.ship to auto-merge or manual.",
    },
    ok = {
      "auto-merge": allowed,
      "required-check": !error && named.length > 0 && absent.length === 0,
      ship: Boolean(value),
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
    ship: effectiveShip(delivery, repository),
    ready: items.every((item) => item.ok),
    missing: items.filter((item) => !item.ok).map((item) => item.id),
    items,
    error,
  };
}

// The Create and release gate (RC5.1): refuses while a repository whose ship
// mode is auto-merge is not ready, naming each missing item. A manual
// repository only warns, so its entries come back for the caller to show.
export function requireMergePath(paths) {
  const stopped = paths.filter(
    (path) => !path.ready && path.ship === "auto-merge",
  );
  if (stopped.length)
    fail(
      `Auto-merge is not ready. ${stopped
        .map(
          (path) =>
            `${path.repository}: ${path.items
              .filter((item) => !item.ok)
              .map((item) => `${item.label} (${item.detail})`)
              .join("; ")}`,
        )
        .join(". ")}`,
      409,
    );
  return paths
    .filter((path) => !path.ready)
    .map((path) => ({ repository: path.repository, missing: path.missing }));
}
