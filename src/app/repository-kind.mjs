// What kind of repository a folder looks like, for Add repository (R105):
// Local only, Code repository, Planning repository, Code and planning, or a
// private mirror of a public repository. It is a guess from the folder, its
// remotes, GitHub's visibility and the roles the workspace already has, for
// the person to confirm or change. Read only.
import { git, detectCheckout, githubRepositoryFromRemote } from "./git.mjs";
import { listSpecFolders } from "./spec-plans.mjs";
import { workspaceRepositories } from "./workspace-repositories.mjs";

export const KIND_LABELS = Object.freeze({
  local: "Local only",
  code: "Code repository",
  planning: "Planning repository",
  both: "Code and planning",
  mirror: "Private mirror",
});

// Files that mean a folder builds or runs something.
const BUILD_FILE =
  /(^|\/)(package\.json|Cargo\.toml|go\.mod|pyproject\.toml|setup\.py|requirements\.txt|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|Gemfile|composer\.json|CMakeLists\.txt|Makefile|Package\.swift|mix\.exs|deno\.jsonc?|[^/]+\.(csproj|sln))$/;
const SOURCE_FILE =
  /\.(m?[jt]sx?|cjs|py|go|rs|java|kts?|scala|rb|php|c|cc|cpp|cxx|h|hpp|cs|fs|swift|mm?|exs?|erl|hs|clj|dart|lua|zig|vue|svelte)$/i;
// Where plans and docs live: a source file there is not the repository's code.
const NOT_CODE = /^(\.kiro|\.github|docs?|plans?|specs?|examples?)\//i;
const PLANNING_NAME = /(^|[-_.])(plans?|planning|specs?|roadmap)([-_.]|$)/i;

const same = (left, right) =>
  typeof left === "string" &&
  typeof right === "string" &&
  left.toLowerCase() === right.toLowerCase();
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// The first file that shows the checkout has code, or null. A checkout too
// big to list counts as code.
export function codeEvidence(files) {
  if (files === null) return "more files than Avoozl lists";
  const tracked = files.filter((file) => !NOT_CODE.test(file));
  return (
    tracked.find((file) => BUILD_FILE.test(file) && !file.includes("/")) ||
    tracked.find((file) => BUILD_FILE.test(file)) ||
    tracked.find((file) => SOURCE_FILE.test(file)) ||
    null
  );
}

// What the folder itself says: its upstream (a GitHub remote besides origin
// that names another repository, `upstream` first), the file that shows it
// has code, and its spec folders.
export async function folderFacts(root, github) {
  const quiet = (args) => git(root, args).catch(() => null);
  const remotes = ((await quiet(["remote"])) || "")
    .split("\n")
    .filter((name) => name && name !== "origin")
    .sort((a, b) => (b === "upstream") - (a === "upstream"));
  let upstream = null;
  for (const remote of remotes) {
    const repository = githubRepositoryFromRemote(
      await quiet(["remote", "get-url", remote]),
    );
    if (repository && !same(repository, github)) {
      upstream = { remote, github: repository };
      break;
    }
  }
  const listed = await quiet(["ls-files", "-z"]);
  return {
    upstream,
    code: codeEvidence(
      listed === null ? null : listed.split("\0").filter(Boolean),
    ),
    specs: listSpecFolders(root).length,
  };
}

// "public", "private", or null when GitHub can't be read.
async function visibilityOf(client, repository) {
  if (!repository || !client?.available?.()) return null;
  try {
    const remote = await client.repository(repository);
    return remote.private === false ? "public" : "private";
  } catch {
    return null;
  }
}

// The roles the workspace already gives other GitHub repositories, from
// .avoozl.json (`settings`: its github section) and the registered checkouts.
function workspaceRoles(settings, checkouts, github) {
  const entries = record(settings?.repositories) ? settings.repositories : {},
    mode = settings?.mode,
    planningRepository = settings?.planningRepository || null;
  const fallback = (name) =>
    mode === "plans-repo"
      ? same(name, planningRepository)
        ? "planning"
        : "code"
      : mode === "single-repo"
        ? "both"
        : "local";
  const roles = new Map();
  for (const [name, entry] of Object.entries(entries))
    roles.set(name.toLowerCase(), {
      name,
      role: record(entry) && entry.role ? entry.role : fallback(name),
    });
  for (const checkout of checkouts)
    if (checkout.github && !roles.has(checkout.github.toLowerCase()))
      roles.set(checkout.github.toLowerCase(), {
        name: checkout.github,
        role: fallback(checkout.github),
      });
  if (mode === "plans-repo" && planningRepository)
    roles.set(planningRepository.toLowerCase(), {
      name: planningRepository,
      role: "planning",
    });
  const own = github ? roles.get(github.toLowerCase()) : undefined;
  if (github) roles.delete(github.toLowerCase());
  const mirror = Object.values(entries).find(
    (entry) =>
      record(entry?.mirror) &&
      entry.mirror.source &&
      same(entry.mirror.mirror, github),
  );
  return {
    own: own && Object.hasOwn(entries, own.name) ? own.role : null,
    mirrorOf: mirror ? mirror.mirror.source : null,
    others: [...roles.values()],
  };
}

const guess = (role, reasons, source = "") => ({ role, source, reasons });

// The guess itself, from the facts above. Pure, so each rule is tested alone.
export function guessKind({
  github,
  remote,
  name = "",
  facts,
  visibility = null,
  upstreamVisibility = null,
  workspace = { own: null, mirrorOf: null, others: [] },
}) {
  if (!github)
    return guess("local", [
      remote
        ? `Its ${remote} remote is not on GitHub.`
        : "It has no GitHub remote.",
    ]);
  if (workspace.mirrorOf)
    return guess(
      "mirror",
      [
        `.avoozl.json already names it the private mirror of ${workspace.mirrorOf}.`,
      ],
      workspace.mirrorOf,
    );
  if (workspace.own)
    return guess(workspace.own, [
      `.avoozl.json already gives ${github} the role ${KIND_LABELS[workspace.own] ?? workspace.own}.`,
    ]);
  const { upstream, code, specs } = facts;
  if (upstream && visibility !== "public" && upstreamVisibility !== "private")
    return guess(
      "mirror",
      [
        `Its ${upstream.remote} remote is ${upstream.github}, another GitHub repository.`,
        visibility === "private"
          ? `${github} is private.`
          : `GitHub could not be read to check that ${github} is private.`,
      ],
      upstream.github,
    );
  const has = code
    ? `It has code (${code}).`
    : specs
      ? `It has spec folders in .kiro/specs and no code.`
      : "It has no code or spec folders yet.";
  const plansOnly = !code && (specs > 0 || PLANNING_NAME.test(name));
  const others = workspace.others;
  const planning = others.find((entry) => entry.role === "planning");
  const both = others.find((entry) => entry.role === "both");
  if (others.length && others.every((entry) => entry.role === "local"))
    return guess("local", [
      `${others[0].name} is Local only in this workspace, and Local only can't mix with GitHub roles.`,
    ]);
  if (planning)
    return guess("code", [
      `${planning.name} is this workspace's planning repository, so its issues live there.`,
      has,
    ]);
  if (both)
    return guess("both", [
      `${both.name} holds its own issues and specs, so this one does too.`,
      has,
    ]);
  if (others.some((entry) => entry.role === "code"))
    return plansOnly
      ? guess("planning", [
          has,
          "The other repositories here are code repositories with no planning repository yet.",
        ])
      : guess("code", [
          has,
          "The other repositories here are code repositories.",
        ]);
  if (plansOnly)
    return guess("planning", [
      specs ? has : `Its name, ${name}, sounds like plans, and it has no code.`,
    ]);
  return guess("both", [
    has,
    "No other repository in this workspace is on GitHub, so its own issues can hold its plans.",
  ]);
}

// repositories.detect: what Add repository would register for a folder, and
// the kind of repository it looks like.
export async function detectRepository({ store, github, settings, folder }) {
  const found = await detectCheckout(folder);
  const facts = await folderFacts(found.root, found.github);
  const [visibility, upstreamVisibility] = found.github
    ? await Promise.all([
        visibilityOf(github, found.github),
        visibilityOf(github, facts.upstream?.github),
      ])
    : [null, null];
  let section = null;
  try {
    section = settings?.() ?? null;
  } catch {
    // No settings file to read: the workspace has no roles yet.
  }
  const checkouts = workspaceRepositories(store).filter(
    (entry) => entry.localCheckout !== found.root,
  );
  const kind = guessKind({
    github: found.github,
    remote: found.remote,
    name: found.github?.split("/")[1] ?? found.id ?? "",
    facts,
    visibility,
    upstreamVisibility,
    workspace: workspaceRoles(section, checkouts, found.github),
  });
  return { ...found, kind: { ...kind, ...facts, visibility } };
}
