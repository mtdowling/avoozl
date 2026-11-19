// `avoozl setup REPO` (task 42.7, Requirement 89.1-89.3, design §4.26): one
// preview of what setup changes in the project and on GitHub, applied only
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
// .avoozl.json; upgrade when the project file carries the target and sources.
import { git } from "./git.mjs";
import { applyAccess, previewAccess } from "./setup-access.mjs";
import { applyLanding, previewLanding } from "./setup-landing.mjs";
import { fail } from "./store.mjs";

const ACCESS = (id) => `setupAccess:${id}`;
const LANDINGS = ["direct", "pr", "off"];

export async function repositorySetup(
  store,
  github,
  input = {},
  { writeProject, writeLanding } = {},
) {
  const project = store.get("projects", input.project);
  if (!project) fail(`Project ${input.project ?? ""} not found.`, 404);
  // `train` is retired and sets up `direct`.
  const landing =
    input.landing === "train" ? "direct" : (input.landing ?? "pr");
  if (!LANDINGS.includes(landing))
    fail("landing must be direct, pr or off.", 400);
  const base = input.base ?? project.baseBranch ?? "main",
    url = await git(project.root, ["remote", "get-url", "origin"]),
    login = String((await github.currentUser())?.login ?? "");
  const access = await previewAccess(github, {
    wanted: {
      target: input.repository,
      base,
      roots: { code: project.root },
      sources: { [input.repository]: { url } },
    },
    current: store.getMeta(ACCESS(project.id)) ?? null,
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
    projectChanges = [
      ...(project.landing === landing
        ? []
        : [
            { key: "landing", before: project.landing ?? null, after: landing },
          ]),
      ...(project.baseBranch === base
        ? []
        : [{ key: "baseBranch", before: project.baseBranch, after: base }]),
    ],
    pending =
      access.changes.length +
      projectChanges.length +
      (landingSteps?.steps.filter((s) => s.status !== "ok").length ?? 0);
  const preview = {
    project: project.id,
    repository: input.repository,
    login,
    access: { changes: access.changes, access: access.access },
    settings: projectChanges,
    github: landingSteps?.steps ?? [],
    message: pending ? null : "Nothing to change",
  };
  if (!input.confirm || !pending) return { ...preview, applied: false };

  // Apply: blocked GitHub steps write nothing and are reported as they are.
  const blocked = (landingSteps?.steps ?? []).filter(
    (s) => s.status === "blocked",
  );
  await applyAccess(access, (settings) =>
    store.setMeta(ACCESS(project.id), settings),
  );
  const written = landingSteps
    ? (await applyLanding(github, landingSteps)).written
    : [];
  if (projectChanges.length) {
    const next = { ...project, landing, baseBranch: base };
    store.put("projects", next);
    if (project.landing !== landing) writeLanding?.(input.repository, landing);
    if (project.baseBranch !== base) writeProject?.(next);
  }
  return {
    ...preview,
    applied: true,
    written,
    blocked: blocked.map((s) => ({ id: s.id, permission: s.permission })),
  };
}
