// One setup preview for where code lives and who may do what (Requirement
// 89.1, 89.2 and 89.4, design §4.32, task 42.2).
//
// It shows, together: the registered code and plan roots, the target and
// base branch, the trusted source repositories (forks), and for each one the
// login's push access beside the target's merge access. Push to a fork and
// merge into the target are separate rights, so they are separate lines.
// It plans no task labels, Project, issue types or issues; publishing a spec
// issue is its own action. A run with nothing to change says so and writes
// nothing.
//
// The ruleset, merge methods, CI variable and commit status steps are in
// setup-landing.mjs (task 42.3).
// shortcut: checks and protected paths are not compared here.
import { parseRepository } from "./github.mjs";
import { sourceRegistry } from "./working-heads.mjs";
import { fail } from "./store.mjs";

const WRITE = new Set(["admin", "maintain", "write"]);
const lower = (value) => String(value).toLowerCase();
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The settings that setup writes, checked and in one fixed shape.
function accessSettings(input = {}) {
  const { target, base, roots, sources } = input;
  if (typeof target !== "string") fail("Setup needs a target repository.", 400);
  parseRepository(target);
  if (typeof base !== "string" || !base.trim() || base.startsWith("-"))
    fail("Setup needs a base branch.", 400);
  const clean = Object.fromEntries(
    ["code", "plans"].flatMap((key) =>
      roots?.[key] === undefined ? [] : [[key, String(roots[key])]],
    ),
  );
  if (!clean.code) fail("Setup needs a code root.", 400);
  sourceRegistry(sources); // rejects a bad name, parent or fetch location
  return {
    target,
    base,
    roots: clean,
    sources: Object.fromEntries(
      Object.entries(sources ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, { url, parent }]) => [
          name,
          parent === undefined ? { url } : { url, parent },
        ]),
    ),
  };
}

// Preview the changes from `current` to `wanted` and each repository's
// access for `login`. Reads only. `changes` is empty when nothing differs.
export async function previewAccess(github, { wanted, current, login }) {
  const next = accessSettings(wanted),
    before = current ? accessSettings(current) : null,
    changes = [];
  for (const key of ["target", "base"])
    if (!before || before[key] !== next[key])
      changes.push({ key, before: before?.[key] ?? null, after: next[key] });
  for (const root of new Set([
    ...Object.keys(next.roots),
    ...Object.keys(before?.roots ?? {}),
  ]))
    if (before?.roots[root] !== next.roots[root])
      changes.push({
        key: `roots.${root}`,
        before: before?.roots[root] ?? null,
        after: next.roots[root] ?? null,
      });
  for (const name of new Set([
    ...Object.keys(next.sources),
    ...Object.keys(before?.sources ?? {}),
  ]))
    if (!same(before?.sources[name], next.sources[name]))
      changes.push({
        key: `sources.${name}`,
        before: before?.sources[name] ?? null,
        after: next.sources[name] ?? null,
      });

  const role = async (repository) =>
      String(
        (await github.permission(repository, login))?.permission ?? "none",
      ),
    sourceNames = Object.keys(next.sources).filter(
      (name) => lower(name) !== lower(next.target),
    ),
    [targetRole, ...sourceRoles] = await Promise.all([
      role(next.target),
      ...sourceNames.map(role),
    ]);
  const access = [
    {
      repository: next.target,
      kind: "target",
      role: targetRole,
      merge: WRITE.has(targetRole),
    },
    ...sourceNames.map((name, index) => ({
      repository: name,
      kind: "source",
      role: sourceRoles[index],
      push: WRITE.has(sourceRoles[index]),
    })),
  ];
  return {
    settings: next,
    changes,
    access,
    message: changes.length ? null : "Nothing to change",
  };
}

// Write only when the preview has changes; `write(settings)` is the caller's
// settings writer. A retry with nothing to change never calls it.
export async function applyAccess(preview, write) {
  if (!preview.changes.length)
    return { written: false, message: preview.message };
  await write(preview.settings);
  return { written: true, message: null };
}
