// `avoozl setup REPO` (task 42.7, Requirement 89.1-89.3, design §4.26): one
// preview of what setup changes in the repository and on GitHub, applied only
// on a person's `--yes`. A second run with nothing to change says "Nothing
// to change" and writes nothing.
//
// It joins the access preview (setup-access.mjs: roots, target, base,
// sources and who may push or merge) and, under `pr`, the GitHub steps
// (setup-landing.mjs: ruleset, merge methods, CI variable, commit status),
// and writes the repository's `landing.mode` (design §4.25). The old Radar
// `github setup` is separate and unchanged.
//
// shortcut: the access settings are kept in workspace metadata, not in
// .avoozl.json; upgrade when the repository file carries the target and sources.
import { git } from "../git/git.mjs";
import { applyAccess, previewAccess } from "./setup-access.mjs";
import { applyLanding, previewLanding } from "../github/setup-landing.mjs";
import { fail } from "../store/store.mjs";
import { personOf } from "../github/github.mjs";

const ACCESS = (id) => `setupAccess:${id}`;
const LANDINGS = ["direct", "pr", "off"];

export async function repositorySetup(
  store,
  github,
  input = {},
  { writeRepository, writeLanding } = {},
) {
  const repository = store.get("repositories", input.repositoryId);
  if (!repository)
    fail(`Repository ${input.repositoryId ?? ""} not found.`, 404);
  const landing = input.landing ?? "pr";
  if (!LANDINGS.includes(landing))
    fail("landing must be direct, pr or off.", 400);
  const base = input.base ?? repository.baseBranch ?? "main",
    url = await git(repository.root, ["remote", "get-url", "origin"]),
    // The person setting up (§D12): a plugin's person, not its bot login.
    login = String((await personOf(github, input.repository)) ?? "");
  const access = await previewAccess(github, {
    wanted: {
      target: input.repository,
      base,
      roots: { code: repository.root },
      sources: { [input.repository]: { url } },
    },
    current: store.getMeta(ACCESS(repository.id)) ?? null,
    login,
  });
  const landingSteps =
      landing === "pr"
        ? await previewLanding(github, {
            repository: input.repository,
            base,
            checks: input.checks,
            methods: input.methods ?? ["merge"],
          })
        : null,
    repositoryChanges = [
      ...(repository.landing === landing
        ? []
        : [
            {
              key: "landing",
              before: repository.landing ?? null,
              after: landing,
            },
          ]),
      ...(repository.baseBranch === base
        ? []
        : [{ key: "baseBranch", before: repository.baseBranch, after: base }]),
    ],
    pending =
      access.changes.length +
      repositoryChanges.length +
      (landingSteps?.steps.filter((s) => s.status !== "ok").length ?? 0);
  const preview = {
    repositoryId: repository.id,
    repository: input.repository,
    login,
    access: { changes: access.changes, access: access.access },
    settings: repositoryChanges,
    github: landingSteps?.steps ?? [],
    message: pending ? null : "Nothing to change",
  };
  if (!input.confirm || !pending) return { ...preview, applied: false };

  // Apply: blocked GitHub steps write nothing and are reported as they are.
  const blocked = (landingSteps?.steps ?? []).filter(
    (s) => s.status === "blocked",
  );
  await applyAccess(access, (settings) =>
    store.setMeta(ACCESS(repository.id), settings),
  );
  const landed = landingSteps
      ? await applyLanding(github, landingSteps)
      : { written: [], skipped: [] },
    written = landed.written;
  if (repositoryChanges.length) {
    const next = { ...repository, landing, baseBranch: base };
    store.put("repositories", next);
    if (repository.landing !== landing)
      writeLanding?.(input.repository, landing);
    if (repository.baseBranch !== base) writeRepository?.(next);
  }
  return {
    ...preview,
    applied: true,
    written,
    // Refused or not allowed: skipped, with what to do by hand (PC13.8).
    skipped: landed.skipped,
    blocked: blocked.map((s) => ({ id: s.id, permission: s.permission })),
  };
}
